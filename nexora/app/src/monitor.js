'use strict';
/* Supervision des sites de l'utilisateur : vérifications périodiques (disponibilité, temps de réponse,
 * expiration du certificat, présence d'un mot-clé), historique, et alertes par e-mail lorsqu'un site tombe,
 * ralentit ou que son certificat approche de l'expiration. Tourne tant que NEXORA est ouverte.
 *
 * NEXORA #030 : un seul canal d'alerte, l'e-mail par Brevo, envoyé par les serveurs NEXORA (fonction
 * nx_alert_email de Supabase, migration 20261104000005) à l'adresse du compte NEXORA connecté. Telegram,
 * WhatsApp et le SMTP à configurer soi-même sont retirés (leurs anciens réglages sont effacés du disque).
 *
 * NEXORA #015 : chaque vérification mesure le détail du temps de réponse (DNS, connexion, TLS, premier
 * octet, transfert) ; une panne n'est déclarée qu'après plusieurs échecs de suite (fausses alertes
 * évitées) et ouvre un incident suivi jusqu'au retour à la normale (prise en charge, note, rappels,
 * mise en sourdine). L'historique est gardé 31 jours en détail et plus d'un an en agrégats horaires
 * (src/supervision/), avec des requêtes prêtes pour les tableaux de bord de l'interface. */
const fs = require('fs');
const path = require('path');
const tls = require('tls');
const { probe: realProbe, reasonOf } = require('./supervision/probe');
const { SiteStore } = require('./supervision/store');
const S = require('./supervision/stats');
// NEXORA #048 : autres types de vérification (API, port TCP, DNS, domaine, parcours) et empreinte du contenu.
const checks = require('./supervision/checks');
// NEXORA #038 : détail technique d'un refus d'envoi gardé dans le journal local, pas affiché.
const { techLog } = require('./plain');

const timeout = (ms) => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);

// NEXORA #030 : l'e-mail (Brevo). Une ancienne configuration e-mail (SMTP) reste active ; les jetons et mots de
// passe de Telegram, WhatsApp et SMTP ne sont plus gardés.
// NEXORA #048 : webhooks (Slack, Discord, Teams, Google Chat, ntfy ou adresse quelconque) en plus de l'e-mail.
function cleanHook(h) {
  if (!h || typeof h.url !== 'string') return null;
  let u;
  try { u = new URL(h.url.trim()); } catch { return null; }
  const local = /^(localhost|127\.|\[::1\])/.test(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
  return {
    id: String(h.id || Math.random().toString(36).slice(2, 9)).slice(0, 20), name: String(h.name || u.hostname).slice(0, 60), url: u.href,
    events: ['all', 'critical', 'escalation'].includes(h.events) ? h.events : 'all', enabled: h.enabled !== false,
  };
}

function cleanChannels(ch) {
  const em = (ch && ch.email) || {};
  const enabled = typeof em.enabled === 'boolean' ? em.enabled : Boolean(em.host && em.to);
  const webhooks = (Array.isArray(ch && ch.webhooks) ? ch.webhooks : []).map(cleanHook).filter(Boolean).slice(0, 10);
  return { email: { enabled }, webhooks };
}

// Forme du message selon le service qui reçoit le webhook.
function hookKind(url) {
  if (/hooks\.slack\.com/.test(url)) return 'slack';
  if (/discord(app)?\.com\/api\/webhooks/.test(url)) return 'discord';
  if (/webhook\.office\.com|logic\.azure\.com|powerplatform\.com|powerautomate/.test(url)) return 'teams';
  if (/chat\.googleapis\.com/.test(url)) return 'gchat';
  if (/ntfy\.sh|\/ntfy\//.test(url)) return 'ntfy';
  return 'json';
}

function hookPayload(url, { subject, text, level, site, at }) {
  const kind = hookKind(url);
  const color = level === 'critique' ? '#e5302a' : level === 'ok' ? '#1f9d55' : '#d97706';
  const plain = String(text || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
  if (kind === 'slack') return { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `*${subject}*\n${plain}` }) };
  if (kind === 'discord') return { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'NEXORA', embeds: [{ title: subject.slice(0, 250), description: plain.slice(0, 4000), color: parseInt(color.slice(1), 16), timestamp: new Date(at).toISOString() }] }) };
  if (kind === 'teams') return { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ '@type': 'MessageCard', '@context': 'https://schema.org/extensions', summary: subject, themeColor: color.slice(1), title: subject, text: plain.replace(/\n/g, '<br>') }) };
  if (kind === 'gchat') return { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `*${subject}*\n${plain}` }) };
  if (kind === 'ntfy') return { headers: { 'content-type': 'text/plain; charset=utf-8', Title: /^[\x20-\x7e]*$/.test(subject) ? subject : 'Alerte NEXORA', Priority: level === 'critique' ? '5' : '3', Tags: level === 'ok' ? 'white_check_mark' : 'warning' }, body: plain };
  return { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: 'nexora', level, title: subject, text: plain, site: site ? { name: site.siteName, id: site.siteId } : null, at: new Date(at).toISOString() }) };
}

// Objet de l'e-mail : le texte de l'alerte sans son pictogramme de tête, sur une ligne.
function subjectOf(text) {
  const line = String(text || '').split('\n')[0].replace(/^[^\p{L}\p{N}]+/u, '').trim();
  return (line || 'Alerte NEXORA').slice(0, 140);
}

function tlsDays(host, port = 443, timeout = 7000) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (d) => { if (!done) { done = true; try { s.end(); } catch { /* */ } resolve(d); } };
    const s = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout }, () => {
      const c = s.getPeerCertificate();
      fin(c && c.valid_to ? Math.round((new Date(c.valid_to) - Date.now()) / 86400000) : null);
    });
    s.on('error', () => fin(null)); s.on('timeout', () => fin(null));
  });
}

// Réglages des alertes (modifiables dans l'onglet « Alertes »).
const DEFAULTS = {
  confirm: 2, // échecs de suite avant de déclarer une panne
  slowConfirm: 3, // vérifications lentes de suite avant de signaler une lenteur
  repeatMin: 60, // rappel tant qu'une panne dure et n'est pas prise en charge (0 : jamais)
  certDays: 14, // alerte quand le certificat expire dans ce nombre de jours
  notifyRecovery: true, // message quand tout revient à la normale
  silenceUntil: 0, // sourdine générale (horodatage)
  // NEXORA #048
  escalateMin: 0, // escalade si une panne n'est pas prise en charge après ce délai (0 : jamais)
  quietFrom: -1, // heures calmes : alertes non critiques regroupées et envoyées à la fin (-1 : désactivé)
  quietTo: -1,
  groupSec: 60, // alertes rapprochées regroupées en un seul envoi
};
const RANGES = { '1h': 3600e3, '24h': 86400e3, '7j': 7 * 86400e3, '30j': 30 * 86400e3, '90j': 90 * 86400e3 };
const RAW_MAX_SPAN = 7 * 86400e3 + 60000; // au-delà : agrégats horaires
const RECOVERY = new Set(['up', 'slow-ok', 'errors-ok', 'cert-ok', 'domain-ok']);
// NEXORA #048 : fréquence minimale par type (le domaine se vérifie une fois toutes les 6 h, un parcours toutes les 5 min).
const MIN_IV = { domain: 21600, journey: 300, dns: 60 };
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function fmtDur(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'moins d’une minute';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h} h ${String(m % 60).padStart(2, '0')}` : `${h} h`;
  return `${Math.round(h / 24)} jours`;
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

class Monitor {
  constructor({ app, fetchImpl, send, pageErrors, probe, now, journey, planCheck }) {
    this.now = now || Date.now;
    this.file = path.join(app.getPath('userData'), 'monitor.json');
    this.dir = path.join(app.getPath('userData'), 'supervision');
    this.fetch = fetchImpl;
    this.send = send;
    this.pageErrors = pageErrors || null;
    this.probeImpl = probe || realProbe;
    this.journey = journey || null; // NEXORA #048 : parcours rejoués (fourni par main.js)
    this.planCheck = planCheck || null;
    this.quietQueue = [];
    this.batch = [];
    this.batchT = null;
    this.lastSend = 0;
    this.timers = new Map();
    this.rechecks = new Map();
    this.saveT = {};
    this.state = this.load();
    this.store = new SiteStore(this.dir, this.now);
    this.errReports = this.state.errReports || {}; // dernier relevé d'erreurs de page, par site
    this.status = this.state.status || {}; // état courant par site (en ligne, en panne, lent…)
    this.lastAlert = this.state.lastAlert || {}; // anti-répétition, gardé après un redémarrage
    this.settings = { ...DEFAULTS, ...(this.state.settings || {}) };
    this.incidents = readJson(path.join(this.dir, 'incidents.json'), []);
    this.alertLog = readJson(path.join(this.dir, 'alerts.json'), []);
    if (!Array.isArray(this.state.maintenance)) this.state.maintenance = [];
    if (!Array.isArray(this.state.marks)) this.state.marks = [];
    // Ancien historique (500 mesures par site dans monitor.json) : repris dans le nouveau stockage.
    if (this.state.history) {
      for (const [id, list] of Object.entries(this.state.history)) this.store.importLegacy(id, list);
      delete this.state.history;
      this.saveNow();
    }
  }

  // Erreurs de la page (JavaScript, ressources en échec) : au plus une fois toutes les 5 minutes par site.
  async checkErrors(e, rec) {
    if (!this.pageErrors || !e.watchErrors || !rec.up) return;
    const prev = this.errReports[e.id];
    const every = Math.max(300, Number(e.intervalSec) || 300) * 1000;
    if (prev && this.now() - prev.at < every - 5000) { rec.jsErrors = prev.errors.length; rec.failedRes = prev.failed.length; return; }
    try {
      const r = await this.pageErrors(e.url);
      this.errReports[e.id] = r;
      rec.jsErrors = r.errors.length;
      rec.failedRes = r.failed.length;
      this.send('mon:errors', { id: e.id, report: r });
    } catch { /* vérification impossible : on réessaiera */ }
  }

  load() {
    const st = readJson(this.file, null) || { endpoints: [], channels: {} };
    st.channels = cleanChannels(st.channels);
    return st;
  }

  // Enregistrements regroupés (une vérification toutes les 30 s ne réécrit pas le fichier à chaque fois).
  save() { this.later('state', () => this.saveNow(), 800); }

  saveNow() {
    const { history, ...rest } = this.state;
    try {
      fs.writeFileSync(this.file, JSON.stringify({ ...rest, settings: this.settings, status: this.status, lastAlert: this.lastAlert, errReports: this.errReports }, null, 1));
    } catch { /* best effort */ }
  }

  later(key, fn, ms) {
    clearTimeout(this.saveT[key]);
    this.saveT[key] = setTimeout(() => { delete this.saveT[key]; fn(); }, ms);
  }

  writeJson(name, data) {
    try { fs.mkdirSync(this.dir, { recursive: true }); fs.writeFileSync(path.join(this.dir, name), JSON.stringify(data)); } catch { /* */ }
  }

  saveIncidents() { this.later('inc', () => this.writeJson('incidents.json', this.incidents), 800); }

  saveAlerts() { this.later('alerts', () => this.writeJson('alerts.json', this.alertLog), 800); }

  flush() {
    for (const k of Object.keys(this.saveT)) clearTimeout(this.saveT[k]);
    this.saveT = {};
    this.saveNow();
    this.writeJson('incidents.json', this.incidents);
    this.writeJson('alerts.json', this.alertLog);
    this.store.flushAll();
  }

  config() { return { endpoints: this.state.endpoints || [], channels: this.state.channels || {}, settings: this.settings }; }

  // NEXORA #048 : un appel sans « webhooks » (interface d'origine) garde les webhooks déjà enregistrés.
  setChannels(ch) { this.state.channels = cleanChannels({ ...(this.state.channels || {}), ...(ch || {}) }); this.save(); }

  // NEXORA #030 : session du compte NEXORA transmise par l'interface (renderer/nx/alerts/), gardée en mémoire
  // seulement ; elle sert à appeler les fonctions d'alerte e-mail des serveurs NEXORA.
  setCloud(c) {
    this.cloud = c && c.url && c.key && c.token
      ? { url: String(c.url).replace(/\/+$/, ''), key: String(c.key), token: String(c.token), email: String(c.email || '') }
      : null;
  }

  async rpc(name, args) {
    const c = this.cloud;
    if (!c) throw new Error('Connecte-toi à ton compte NEXORA (bouton Compte du rail) : les alertes par e-mail sont envoyées à l’adresse de ton compte.');
    let r;
    try {
      r = await this.fetch(`${c.url}/rest/v1/rpc/${name}`, {
        method: 'POST', headers: { apikey: c.key, authorization: `Bearer ${c.token}`, 'content-type': 'application/json' }, body: JSON.stringify(args), signal: timeout(15000),
      });
    } catch {
      throw new Error('Connexion à NEXORA impossible : vérifie ta connexion à Internet.');
    }
    const j = await r.json().catch(() => null);
    if (r.ok) return j;
    const msg = String((j && (j.message || j.msg || j.error_description)) || `HTTP ${r.status}`);
    if (r.status === 401 || /jwt/i.test(msg)) throw new Error('Session NEXORA expirée : reconnecte-toi à ton compte, puis réessaie.');
    if ((j && j.code === 'PGRST202') || r.status === 404) throw new Error('Les alertes par e-mail ne sont pas encore disponibles. Réessaie plus tard.');
    throw new Error(msg);
  }

  async sendEmail(subject, text, kind = 'alerte') {
    const r = await this.rpc('nx_alert_email', { p_subject: subject, p_text: text, p_kind: kind });
    return { ok: true, id: r && r.id, to: r && r.to };
  }

  setSettings(patch) {
    const p = patch || {};
    const num = (v, min, max, def) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Math.round(Number(v)))) : def);
    const s = this.settings;
    if ('confirm' in p) s.confirm = num(p.confirm, 1, 10, DEFAULTS.confirm);
    if ('slowConfirm' in p) s.slowConfirm = num(p.slowConfirm, 1, 20, DEFAULTS.slowConfirm);
    if ('repeatMin' in p) s.repeatMin = num(p.repeatMin, 0, 1440, DEFAULTS.repeatMin);
    if ('certDays' in p) s.certDays = num(p.certDays, 1, 90, DEFAULTS.certDays);
    if ('notifyRecovery' in p) s.notifyRecovery = Boolean(p.notifyRecovery);
    if ('silenceUntil' in p) s.silenceUntil = Number(p.silenceUntil) || 0;
    if ('escalateMin' in p) s.escalateMin = num(p.escalateMin, 0, 1440, 0);
    if ('quietFrom' in p) s.quietFrom = num(p.quietFrom, -1, 23, -1);
    if ('quietTo' in p) s.quietTo = num(p.quietTo, -1, 23, -1);
    if ('groupSec' in p) s.groupSec = num(p.groupSec, 0, 900, 60);
    this.save();
    return s;
  }

  setEndpoints(list) {
    const before = new Map((this.state.endpoints || []).map((e) => [e.id, e]));
    const next = Array.isArray(list) ? list : [];
    const ids = new Set(next.map((e) => e.id));
    const at = this.now();
    for (const [id, e] of before) {
      if (ids.has(id)) continue;
      // Site retiré : ses mesures sont effacées, ses incidents restent dans l'historique.
      for (const inc of this.incidents) if (inc.siteId === id && inc.end == null) Object.assign(inc, { end: at, closedBy: 'retrait', resolution: 'Site retiré de la supervision' });
      this.store.remove(id);
      delete this.status[id];
      delete this.errReports[id];
      if (e) for (const k of Object.keys(this.lastAlert)) if (k.startsWith(`${id}:`)) delete this.lastAlert[k];
    }
    for (const e of next) {
      // Adresse changée : c'est un autre site, l'historique de l'ancienne adresse ne s'y mélange pas.
      const old = before.get(e.id);
      if (old && old.url && e.url && old.url !== e.url) {
        for (const inc of this.incidents) if (inc.siteId === e.id && inc.end == null) Object.assign(inc, { end: at, closedBy: 'retrait', resolution: 'Adresse du site modifiée' });
        this.store.remove(e.id);
        delete this.status[e.id];
        delete this.errReports[e.id];
      }
      if (e.enabled !== false) continue;
      // Surveillance en pause : les incidents en cours sont clos (on ne sait plus ce qui se passe).
      for (const inc of this.incidents) if (inc.siteId === e.id && inc.end == null) Object.assign(inc, { end: at, closedBy: 'pause', resolution: 'Surveillance mise en pause' });
      if (this.status[e.id]) Object.assign(this.status[e.id], { state: 'unknown', fails: 0, slows: 0, pending: false });
    }
    this.state.endpoints = next;
    this.saveIncidents();
    this.save();
    this.restartAll();
    return this.config();
  }

  restartAll() {
    for (const t of this.timers.values()) clearInterval(t);
    for (const t of this.rechecks.values()) clearTimeout(t);
    this.timers.clear();
    this.rechecks.clear();
    for (const e of this.state.endpoints || []) if (e.enabled !== false) this.schedule(e);
    if (!this.pruneTimer) {
      this.pruneTimer = setInterval(() => { for (const e of this.state.endpoints || []) this.store.prune(e.id); }, 6 * 3600e3);
      for (const e of this.state.endpoints || []) this.store.prune(e.id);
    }
  }

  schedule(e) {
    if (e.type === 'heartbeat') return; // NEXORA #048 : vérifié par les serveurs NEXORA seulement
    const ms = Math.max(30, MIN_IV[e.type] || 0, Number(e.intervalSec) || 300) * 1000;
    this.timers.set(e.id, setInterval(() => this.check(e).catch(() => {}), ms));
    this.check(e).catch(() => {});
  }

  st(id) {
    if (!this.status[id]) this.status[id] = { state: 'unknown', since: null, fails: 0, slows: 0 };
    return this.status[id];
  }

  // Vérification de secours par le réseau d'Electron (proxy et certificats du système), quand la sonde
  // directe échoue : évite de signaler une panne qui ne vient que du poste.
  async fetchCheck(e, at, iv) {
    if (!this.fetch) return null;
    const t0 = this.now();
    try {
      const r = await this.fetch(e.url, { method: 'GET', redirect: 'follow', signal: timeout(20000) });
      const ms = this.now() - t0;
      let body = '';
      if (e.keyword) body = (await r.text().catch(() => '')).slice(0, 200000);
      const okStatus = e.expectStatus ? r.status === Number(e.expectStatus) : r.status < 400;
      const okKeyword = !e.keyword || body.includes(e.keyword);
      const rec = { at, up: okStatus && okKeyword, status: r.status, ms, iv, via: 'net', reason: !okStatus ? `statut ${r.status}` : !okKeyword ? 'mot-clé absent' : '' };
      try {
        const u = new URL(e.url);
        if (u.protocol === 'https:') rec.certDays = await tlsDays(u.hostname, u.port ? Number(u.port) : 443);
      } catch { /* adresse invalide */ }
      return rec;
    } catch {
      return null;
    }
  }

  async check(e) {
    const at = this.now();
    const iv = Math.max(30, MIN_IV[e.type] || 0, Number(e.intervalSec) || 300);
    const st = this.st(e.id);
    // NEXORA #048 : pendant une fenêtre de maintenance, aucune mesure (exclue de la disponibilité), aucune alerte.
    if (this.inMaint(e, at)) {
      if (!st.maint) { st.maint = true; this.save(); this.send('mon:update', { id: e.id, state: 'maint' }); }
      return null;
    }
    if (st.maint) st.maint = false;
    if (e.type === 'heartbeat') return null;
    if (e.type && e.type !== 'http') return this.checkOther(e, at, iv);
    let rec;
    try {
      const r = await this.probeImpl(e.url, { timeout: 20000, keyword: e.keyword || '', body: Boolean(e.watchChange) });
      const okStatus = e.expectStatus ? r.status === Number(e.expectStatus) : r.status < 400;
      const okKeyword = !e.keyword || String(r.body || '').includes(e.keyword);
      rec = {
        at, up: okStatus && okKeyword, status: r.status, ms: r.ms, iv,
        dns: r.dns, tcp: r.tcp, tls: r.tls, ttfb: r.ttfb, dl: r.dl, size: r.size,
        reason: !okStatus ? `statut ${r.status}` : !okKeyword ? 'mot-clé absent' : '',
      };
      if (r.cert) { rec.certDays = r.cert.days; st.cert = r.cert; }
      if (r.ip) st.ip = r.ip;
      if (r.http) st.http = r.http;
      // NEXORA #048 : empreinte du contenu visible ; une modification ouvre un incident « contenu modifié ».
      if (e.watchChange && rec.up && r.body) {
        const h = checks.contentHash(r.body);
        if (st.contentHash && st.contentHash !== h.hash) rec.changed = { from: st.contentSize || 0, to: h.size };
        st.contentHash = h.hash;
        st.contentSize = h.size;
      }
    } catch (err) {
      const viaNet = await this.fetchCheck(e, at, iv);
      rec = viaNet && viaNet.up ? viaNet : {
        at, up: false, status: viaNet ? viaNet.status : 0, ms: this.now() - at, iv,
        reason: viaNet && viaNet.status ? viaNet.reason : (err && err.reason) || reasonOf(err),
      };
    }
    const thr = Number(e.thresholdMs) || 0;
    if (rec.up && thr && rec.ms > thr) rec.slow = 1;
    await this.checkErrors(e, rec);
    // L'adresse a pu être modifiée ou retirée pendant la vérification.
    const cur = (this.state.endpoints || []).find((x) => x.id === e.id);
    if (!cur || cur.url !== e.url) return rec;
    this.ingest(cur, rec);
    // Premier échec : on revérifie vite pour confirmer ou écarter la panne sans attendre l'intervalle.
    if (!rec.up && st.state !== 'down' && !this.rechecks.has(e.id)) {
      this.rechecks.set(e.id, setTimeout(() => { this.rechecks.delete(e.id); this.check(cur).catch(() => {}); }, Math.min(20000, iv * 500)));
    }
    return rec;
  }

  // NEXORA #048 : vérifications autres que la page web (API, port, DNS, domaine, parcours).
  async checkOther(e, at, iv) {
    const st = this.st(e.id);
    const fx = this.fetch || ((u, o) => fetch(u, o));
    let r;
    if (e.type === 'api') r = await checks.api(e, fx);
    else if (e.type === 'tcp') r = await checks.tcp(e);
    else if (e.type === 'dns') r = await checks.dnsCheck(e);
    else if (e.type === 'domain') r = await checks.domainCheck(e, fx);
    else if (e.type === 'journey') {
      if (!this.journey) return null;
      if (this.planCheck) {
        try { await this.planCheck('synthetic', 0); } catch {
          st.reason = 'offre Pro requise pour les parcours';
          this.send('mon:update', { id: e.id, state: st.state || 'unknown' });
          return null;
        }
      }
      const j = await this.journey(e).catch((err) => ({ ok: false, ms: 0, steps: [], error: String((err && err.message) || err) }));
      r = { up: Boolean(j.ok), status: j.ok ? 1 : 0, ms: j.ms || 0, reason: j.ok ? '' : j.error || 'étape en échec', steps: (j.steps || []).map((s) => [String(s.label || '').slice(0, 80), Math.round(s.ms || 0), s.ok ? 1 : 0]), shot: j.shot || '' };
    } else return null;
    const rec = { at, iv, up: r.up, status: r.status, ms: Math.round(r.ms || 0), reason: r.reason || '' };
    if (r.size != null) rec.size = r.size;
    if (r.value != null) { rec.value = r.value; st.apiValue = r.value; }
    if (r.steps) { rec.steps = r.steps; st.journey = { at, steps: r.steps, ok: r.up, shot: r.shot || '' }; }
    if (e.type === 'domain') { rec.domainDays = r.domainDays; st.domainDays = r.domainDays; rec.up = true; }
    if (e.type === 'dns') {
      const v = (r.values || []).join(' | ');
      if (e.dnsWatch && r.up && st.dnsValues != null && st.dnsValues !== '' && st.dnsValues !== v) rec.changed = { dns: true, from: st.dnsValues, to: v };
      if (r.up) st.dnsValues = v;
    }
    const thr = Number(e.thresholdMs) || 0;
    if (rec.up && thr && rec.ms > thr && (e.type === 'api' || e.type === 'tcp' || e.type === 'journey')) rec.slow = 1;
    const cur = (this.state.endpoints || []).find((x) => x.id === e.id);
    if (!cur || cur.url !== e.url) return rec;
    this.ingest(cur, rec);
    if (!rec.up && st.state !== 'down' && !this.rechecks.has(e.id) && e.type !== 'journey') {
      this.rechecks.set(e.id, setTimeout(() => { this.rechecks.delete(e.id); this.check(cur).catch(() => {}); }, Math.min(20000, iv * 500)));
    }
    return rec;
  }

  // Enregistre une vérification et fait évoluer l'état du site, les incidents et les alertes.
  ingest(e, rec) {
    const st = this.st(e.id);
    const name = e.name || e.url;
    const prevErr = st.lastErr || 0;
    this.store.append(e.id, rec);
    st.lastAt = rec.at;
    st.lastMs = rec.ms;
    st.lastStatus = rec.status;
    st.reason = rec.reason || '';
    if (rec.up) st.lastOkAt = rec.at;
    const confirm = Math.max(1, Number(e.confirm) || this.settings.confirm);
    if (!rec.up) {
      st.fails = (st.fails || 0) + 1;
      if (st.fails === 1) st.firstFailAt = rec.at;
      st.slows = 0;
      const open = this.openOf(e.id, 'down');
      if (!open && st.fails >= confirm) {
        this.closeIncident(e.id, 'slow', rec.at, 'auto', 'Le site est tombé en panne');
        const inc = this.openIncident(e, 'down', st.firstFailAt, rec.reason, rec);
        this.alert(e, 'down', 'critique', `🔴 ${name} est hors ligne (${rec.reason}).`, inc);
      } else if (open) {
        open.checks += 1;
        open.lastCause = rec.reason;
        this.remind(e, open, rec);
      }
    } else {
      st.fails = 0;
      st.firstFailAt = null;
      const down = this.closeIncident(e.id, 'down', rec.at, 'auto', 'Le site répond de nouveau');
      if (down && this.settings.notifyRecovery) this.alert(e, 'up', 'ok', `🟢 ${name} est de nouveau en ligne (${rec.ms} ms) après ${fmtDur(rec.at - down.start)} de panne.`, down);
      const thr = e.type === 'dns' || e.type === 'domain' ? 0 : Number(e.thresholdMs) || 0;
      const slow = this.openOf(e.id, 'slow');
      if (thr && rec.ms > thr) {
        st.slows = (st.slows || 0) + 1;
        if (st.slows === 1) st.firstSlowAt = rec.at;
        if (!slow && st.slows >= Math.max(1, this.settings.slowConfirm)) {
          const inc = this.openIncident(e, 'slow', st.firstSlowAt, `${rec.ms} ms (seuil ${thr} ms)`, rec);
          this.alert(e, 'slow', 'alerte', `🟠 ${name} est lent : ${rec.ms} ms (seuil ${thr} ms).`, inc);
        } else if (slow) { slow.checks += 1; slow.lastCause = `${rec.ms} ms (seuil ${thr} ms)`; }
      } else {
        st.slows = 0;
        const done = this.closeIncident(e.id, 'slow', rec.at, 'auto', 'Temps de réponse revenu sous le seuil');
        if (done && this.settings.notifyRecovery) this.alert(e, 'slow-ok', 'ok', `🟢 ${name} répond de nouveau normalement (${rec.ms} ms).`, done);
      }
    }
    // Certificat : incident ouvert sous le seuil, rappel une fois par jour, clos au renouvellement.
    if (rec.certDays != null) {
      const open = this.openOf(e.id, 'cert');
      const cause = rec.certDays < 0 ? 'certificat expiré' : `expire dans ${rec.certDays} jour(s)`;
      const text = rec.certDays < 0 ? `🔴 Le certificat de ${name} a expiré.` : `🟠 Le certificat de ${name} expire dans ${rec.certDays} jour(s).`;
      if (rec.certDays <= this.settings.certDays) {
        if (!open) this.alert(e, 'cert', rec.certDays < 0 ? 'critique' : 'alerte', text, this.openIncident(e, 'cert', rec.at, cause, rec));
        else {
          open.lastCause = cause;
          if (!open.ackAt && rec.at - (open.lastNotified || open.start) >= 86400e3) this.alert(e, 'cert', 'alerte', text, open, true);
        }
      } else if (open) {
        this.closeIncident(e.id, 'cert', rec.at, 'auto', 'Certificat renouvelé');
        if (this.settings.notifyRecovery) this.alert(e, 'cert-ok', 'ok', `🟢 Le certificat de ${name} a été renouvelé (${rec.certDays} jours restants).`, open);
      }
    }
    // Erreurs de page : nouvelle apparition, puis retour à la normale.
    if (rec.jsErrors != null) {
      const curErr = (rec.jsErrors || 0) + (rec.failedRes || 0);
      st.lastErr = curErr;
      if (curErr > 0 && prevErr === 0 && !this.openOf(e.id, 'errors')) {
        const rep = this.errReports[e.id];
        const first = rep && rep.errors[0] ? ` Première erreur : ${rep.errors[0].message.slice(0, 140)}` : rep && rep.failed[0] ? ` Ressource en échec : ${rep.failed[0].url.slice(0, 120)} (${rep.failed[0].status || rep.failed[0].error})` : '';
        const inc = this.openIncident(e, 'errors', rec.at, `${rec.jsErrors || 0} erreur(s) JavaScript, ${rec.failedRes || 0} ressource(s) en échec`, rec);
        this.alert(e, 'errors', 'alerte', `🟠 ${name} : ${rec.jsErrors || 0} erreur(s) JavaScript et ${rec.failedRes || 0} ressource(s) en échec.${first}`, inc);
      }
      if (curErr === 0 && this.openOf(e.id, 'errors')) {
        const done = this.closeIncident(e.id, 'errors', rec.at, 'auto', 'Plus aucune erreur sur la page');
        if (this.settings.notifyRecovery) this.alert(e, 'errors-ok', 'ok', `🟢 ${name} : plus aucune erreur détectée sur la page.`, done);
      }
    }
    // NEXORA #048 : contenu ou enregistrement DNS modifié (incident clos à la main : « nouvelle version acceptée »).
    if (rec.changed) {
      const open = this.openOf(e.id, 'change');
      const cause = rec.changed.dns ? `DNS : ${String(rec.changed.from).slice(0, 60)} → ${String(rec.changed.to).slice(0, 60)}` : `contenu modifié (${rec.changed.from} → ${rec.changed.to} caractères)`;
      if (!open) this.alert(e, 'change', 'alerte', rec.changed.dns ? `🟠 L’enregistrement DNS surveillé par « ${name} » a changé : ${cause}.` : `🟠 Le contenu de ${name} a changé. Vérifie qu’il s’agit bien d’une mise à jour de ta part.`, this.openIncident(e, 'change', rec.at, cause, rec));
      else { open.checks += 1; open.lastCause = cause; }
    }
    // NEXORA #048 : expiration du nom de domaine (seuil réglable, 30 jours par défaut).
    if (rec.domainDays != null) {
      const warn = Math.max(1, Number(e.domainWarn) || 30);
      const open = this.openOf(e.id, 'domain');
      const cause = rec.domainDays < 0 ? 'domaine expiré' : `expire dans ${rec.domainDays} jour(s)`;
      if (rec.domainDays <= warn) {
        if (!open) this.alert(e, 'domain', rec.domainDays <= 7 ? 'critique' : 'alerte', `${rec.domainDays <= 7 ? '🔴' : '🟠'} Le nom de domaine de ${name} ${rec.domainDays < 0 ? 'a expiré' : `expire dans ${rec.domainDays} jour(s)`} : renouvelle-le chez ton registraire.`, this.openIncident(e, 'domain', rec.at, cause, rec));
        else open.lastCause = cause;
      } else if (open) {
        this.closeIncident(e.id, 'domain', rec.at, 'auto', 'Domaine renouvelé');
        if (this.settings.notifyRecovery) this.alert(e, 'domain-ok', 'ok', `🟢 Le nom de domaine de ${name} a été renouvelé (${rec.domainDays} jours restants).`, open);
      }
    }
    // État affiché : panne > lenteur > en ligne ; un échec pas encore confirmé laisse l'état précédent.
    const prev = st.state;
    let next = prev;
    if (this.openOf(e.id, 'down')) next = 'down';
    else if (this.openOf(e.id, 'slow')) next = 'slow';
    else if (rec.up) next = 'up';
    else if (prev === 'down' || prev === 'slow') next = 'unknown';
    st.pending = !rec.up && next !== 'down';
    if (next !== prev) { st.state = next; st.since = next === 'down' ? (this.openOf(e.id, 'down') || {}).start || rec.at : rec.at; }
    if (!st.since) st.since = rec.at;
    this.save();
    this.send('mon:update', { id: e.id, rec, state: st.state });
  }

  openOf(siteId, kind) { return this.incidents.find((i) => i.siteId === siteId && i.kind === kind && i.end == null) || null; }

  openIncident(e, kind, start, cause, rec) {
    const inc = {
      id: uid(), siteId: e.id, siteName: e.name || e.url, url: e.url, kind, start, end: null, cause, lastCause: cause,
      status: rec ? rec.status : null, checks: 1, notified: 0, lastNotified: null, ackAt: null, note: '', closedBy: null, resolution: '',
    };
    this.incidents.unshift(inc);
    // On garde les 2 000 derniers incidents (les incidents en cours ne sont jamais retirés).
    if (this.incidents.length > 2000) {
      for (let i = this.incidents.length - 1; i >= 0 && this.incidents.length > 2000; i -= 1) if (this.incidents[i].end != null) this.incidents.splice(i, 1);
    }
    this.saveIncidents();
    this.send('mon:incident', inc);
    return inc;
  }

  closeIncident(siteId, kind, at, by, resolution) {
    const inc = this.openOf(siteId, kind);
    if (!inc) return null;
    Object.assign(inc, { end: at, closedBy: by, resolution: resolution || '' });
    this.saveIncidents();
    this.send('mon:incident', inc);
    return inc;
  }

  // Rappel tant qu'une panne dure et que personne ne l'a prise en charge.
  remind(e, inc, rec) {
    // NEXORA #048 : escalade (une seule fois) quand personne n'a pris la panne en charge après le délai réglé.
    const esc = Number(this.settings.escalateMin) || 0;
    const t = this.now();
    if (esc && !inc.ackAt && !inc.escalatedAt && t - inc.start >= esc * 60000) {
      inc.escalatedAt = t;
      this.alert(e, 'escalade', 'critique', `🔴 Escalade : ${e.name || e.url} est hors ligne depuis ${fmtDur(t - inc.start)} et personne n’a pris l’incident en charge (${rec.reason}).`, inc, true, { escalation: true });
    }
    const every = Number(this.settings.repeatMin) || 0;
    if (!every || inc.ackAt) return;
    const at = this.now();
    if (at - (inc.lastNotified || inc.start) < every * 60000) return;
    this.alert(e, 'down-rappel', 'critique', `🔴 ${e.name || e.url} est toujours hors ligne depuis ${fmtDur(at - inc.start)} (${rec.reason}).`, inc, true);
  }

  incidentAction({ id, action, note } = {}) {
    const inc = this.incidents.find((i) => i.id === id);
    if (!inc) throw new Error('Incident introuvable.');
    const at = this.now();
    if (action === 'ack') inc.ackAt = inc.ackAt ? null : at;
    else if (action === 'note') inc.note = String(note || '').slice(0, 2000);
    else if (action === 'close') {
      if (inc.end != null) return inc;
      Object.assign(inc, { end: at, closedBy: 'manuel', resolution: note ? String(note).slice(0, 500) : 'Clos à la main' });
      // Le site sera de nouveau déclaré en panne s'il échoue encore après confirmation.
      const st = this.status[inc.siteId];
      if (st && (inc.kind === 'down' || inc.kind === 'slow')) Object.assign(st, { state: 'unknown', fails: 0, slows: 0 });
      if (st && inc.kind === 'errors') st.lastErr = 0;
    } else throw new Error('Action inconnue.');
    this.saveIncidents();
    this.save();
    this.send('mon:incident', inc);
    return inc;
  }

  // Envoie une alerte (sauf sourdine) et la consigne dans le journal des alertes.
  alert(e, key, level, text, inc, force = false, opts = {}) {
    const at = this.now();
    const k = `${e.id}:${key}`;
    // Anti-répétition : une même alerte n'est pas renvoyée avant 30 min (sauf retours à la normale et rappels).
    if (!force && !RECOVERY.has(key) && this.lastAlert[k] && at - this.lastAlert[k] < 1800000) return null;
    this.lastAlert[k] = at;
    if (inc) { inc.notified = (inc.notified || 0) + 1; inc.lastNotified = at; }
    const muted = Boolean((e.mutedUntil && e.mutedUntil > at) || (this.settings.silenceUntil && this.settings.silenceUntil > at) || this.inMaint(e, at));
    const entry = { id: uid(), at, siteId: e.id, siteName: e.name || e.url, kind: key, level, text, muted, incidentId: inc ? inc.id : null, results: null };
    this.alertLog.unshift(entry);
    if (this.alertLog.length > 500) this.alertLog.length = 500;
    this.saveAlerts();
    if (muted) { entry.results = []; return entry; }
    // NEXORA #048 : heures calmes (les alertes non critiques partent en un résumé à la fin) et regroupement.
    if (level !== 'critique' && this.inQuiet(at)) {
      entry.quiet = true;
      entry.results = [];
      this.quietQueue.push(entry);
      this.ensureQuietTimer();
      return entry;
    }
    this.queueSend({ entry, only: e.alerts || null, opts });
    return entry;
  }

  queueSend(item) {
    const g = Number(this.settings.groupSec) || 0;
    const at = this.now();
    if (g > 0 && this.lastSend && at - this.lastSend < g * 1000) {
      this.batch.push(item);
      if (!this.batchT) this.batchT = setTimeout(() => this.flushBatch(), Math.max(1000, this.lastSend + g * 1000 - at));
      return;
    }
    this.lastSend = at;
    this.sendEntries([item]);
  }

  flushBatch() {
    this.batchT = null;
    const list = this.batch.splice(0);
    if (!list.length) return;
    this.lastSend = this.now();
    this.sendEntries(list);
  }

  sendEntries(list, title) {
    const one = list.length === 1 && !title;
    const head = title || `${list.length} alertes NEXORA`;
    const text = one ? list[0].entry.text : `${head} :\n\n${list.map((x) => `• ${x.entry.text.replace(/^[^\p{L}\p{N}]+/u, '')}`).join('\n')}`;
    const level = list.some((x) => x.entry.level === 'critique') ? 'critique' : list.some((x) => x.entry.level === 'alerte') ? 'alerte' : 'ok';
    const meta = { subject: one ? subjectOf(text) : head, level, escalation: list.some((x) => x.opts && x.opts.escalation), site: one ? list[0].entry : null, at: this.now() };
    this.dispatch(text, one ? list[0].only : null, meta).then((res) => {
      for (const x of list) x.entry.results = res;
      this.saveAlerts();
      this.send('mon:alert', list[0].entry);
    }).catch(() => {});
  }

  inQuiet(at) {
    const f = Number(this.settings.quietFrom);
    const t = Number(this.settings.quietTo);
    if (!(f >= 0 && t >= 0) || f === t) return false;
    const h = new Date(at).getHours();
    return f < t ? h >= f && h < t : h >= f || h < t;
  }

  ensureQuietTimer() {
    if (this.quietT) return;
    this.quietT = setInterval(() => {
      if (this.inQuiet(this.now())) return;
      clearInterval(this.quietT);
      this.quietT = null;
      const list = this.quietQueue.splice(0).map((entry) => ({ entry, only: null, opts: {} }));
      if (list.length) this.sendEntries(list, `Pendant les heures calmes : ${list.length} alerte${list.length > 1 ? 's' : ''}`);
    }, 60000);
  }

  async dispatch(text, only, meta = {}) {
    const ch = this.state.channels || {};
    const want = (name) => !only || only[name] !== false;
    const jobs = [];
    if (ch.email && ch.email.enabled && want('email')) jobs.push(['email', () => this.sendEmail(meta.subject || subjectOf(text), text)]);
    for (const h of ch.webhooks || []) {
      if (!h.enabled || !want('webhook')) continue;
      if (h.events === 'critical' && meta.level !== 'critique') continue;
      if (h.events === 'escalation' && !meta.escalation) continue;
      jobs.push([`webhook:${h.id}`, () => this.postWebhook(h.url, { subject: meta.subject || subjectOf(text), text, level: meta.level || 'alerte', site: meta.site || null, at: meta.at || this.now() })]);
    }
    return Promise.all(jobs.map(([channel, run]) => Promise.resolve().then(run).then(() => ({ channel, ok: true }), (err) => ({ channel, ok: false, error: String((err && err.message) || err) }))));
  }

  async postWebhook(url, msg) {
    if (!this.fetch) throw new Error('Envoi impossible.');
    const p = hookPayload(url, msg);
    let r;
    try { r = await this.fetch(url, { method: 'POST', headers: p.headers, body: p.body, signal: timeout(15000) }); } catch { throw new Error('Le service du webhook n’a pas répondu.'); }
    if (!r.ok) {
      techLog('erreurs', `webhook refusé (${r.status}) : ${new URL(url).host}`);
      throw new Error(`Le service du webhook a refusé le message (${r.status}).`);
    }
    return true;
  }

  async testWebhook({ url } = {}) {
    const h = cleanHook({ url });
    if (!h) throw new Error('Adresse du webhook invalide : elle doit commencer par https://.');
    await this.postWebhook(h.url, { subject: 'Test des alertes NEXORA', text: 'Test d’alerte NEXORA : le webhook fonctionne. Tu recevras ici les pannes, lenteurs et retours à la normale de tes sites.', level: 'ok', site: null, at: this.now() });
    return { ok: true, kind: hookKind(h.url) };
  }

  // Alerte venue d'un autre module (audits de sécurité programmés, NEXORA #048).
  notify({ id, name, url, key = 'secu', level = 'alerte', text }) {
    return this.alert({ id: String(id || 'nexora'), name: name || url || 'NEXORA', url: url || '', alerts: null }, key, level, text, null, true);
  }

  // ---------- Fenêtres de maintenance (NEXORA #048) ----------
  inMaint(e, at = this.now()) {
    for (const w of this.state.maintenance || []) {
      if (w.siteId && w.siteId !== e.id) continue;
      const start = Number(w.start); const end = Number(w.end);
      if (!(end > start) || at < start) continue;
      const span = w.recur === 'daily' ? 86400e3 : w.recur === 'weekly' ? 7 * 86400e3 : 0;
      if (!span) { if (at < end) return w; continue; }
      if ((at - start) % span < end - start) return w;
    }
    return null;
  }

  setMaintenance(list) {
    const at = this.now();
    this.state.maintenance = (Array.isArray(list) ? list : []).map((w) => ({
      id: String(w.id || uid()), siteId: w.siteId ? String(w.siteId) : '', label: String(w.label || 'Maintenance').slice(0, 120),
      start: Number(w.start) || 0, end: Number(w.end) || 0, recur: ['daily', 'weekly'].includes(w.recur) ? w.recur : 'none',
    })).filter((w) => w.end > w.start && (w.recur !== 'none' || w.end > at - 30 * 86400e3)).slice(0, 100);
    this.save();
    return this.state.maintenance;
  }

  // ---------- Repères de déploiement (NEXORA #048) ----------
  addMark({ label, siteId = '', at, source = 'manuel', url = '' } = {}) {
    let sid = siteId ? String(siteId) : '';
    if (!sid && url) {
      try {
        const h = new URL(url).host;
        const e = (this.state.endpoints || []).find((x) => { try { return new URL(x.url).host === h; } catch { return false; } });
        if (e) sid = e.id;
      } catch { /* adresse invalide */ }
    }
    const m = { id: uid(), at: Number(at) || this.now(), siteId: sid, label: String(label || 'Déploiement').slice(0, 140), source: String(source).slice(0, 20) };
    this.state.marks.unshift(m);
    if (this.state.marks.length > 300) this.state.marks.length = 300;
    this.save();
    this.send('mon:mark', m);
    return m;
  }

  marks({ siteId, from = 0, to = Infinity } = {}) {
    return (this.state.marks || []).filter((m) => m.at >= from && m.at < to && (!siteId || !m.siteId || m.siteId === siteId));
  }

  // ---------- Objectif de disponibilité (NEXORA #048) : budget d'erreur sur 30 jours glissants ----------
  sloOf(e) {
    const target = Math.min(99.999, Math.max(90, Number(e.slo) || 99.9));
    const at = this.now();
    const from = at - 30 * 86400e3;
    let down = 0;
    for (const i of this.incidents) {
      if (i.siteId !== e.id || i.kind !== 'down') continue;
      const s = Math.max(from, i.start); const en = Math.min(at, i.end == null ? at : i.end);
      if (en > s) down += en - s;
    }
    const budget = (1 - target / 100) * 30 * 86400e3;
    return { target, downMs: down, budgetMs: budget, leftMs: budget - down, used: budget ? down / budget : 0 };
  }

  // ---------- Rapport mensuel (NEXORA #048) ----------
  report({ month, from, to } = {}) {
    let a = Number(from); let b = Number(to);
    if (!a || !b) {
      const ref = new Date(this.now());
      const d = month && /^\d{4}-\d{2}$/.test(month) ? new Date(`${month}-01T00:00:00`) : new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
      a = d.getTime();
      b = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    }
    const sites = (this.state.endpoints || []).map((e) => {
      const src = this.source(e.id, a, b);
      const tot = S.totals(src.items, a, b, src.hourly);
      const incs = this.incidents.filter((i) => i.siteId === e.id && i.start < b && (i.end == null || i.end > a));
      const stats = S.incidentStats(incs, a, b, tot.cov, this.now());
      const target = Math.min(99.999, Math.max(90, Number(e.slo) || 99.9));
      return { id: e.id, name: e.name || e.url, url: e.url, type: e.type || 'http', avail: tot.avail, p95: tot.p95, avg: tot.avg, n: tot.n, fails: tot.fails, incidents: incs.length, down: stats.down || 0, downtime: stats.downtime || 0, mttr: stats.mttr || null, slo: target, met: tot.avail == null ? null : tot.avail >= target };
    });
    const incidents = this.incidents.filter((i) => i.start < b && (i.end == null || i.end > a)).slice(0, 200);
    return { from: a, to: b, at: this.now(), sites, incidents, marks: this.marks({ from: a, to: b }), maintenance: this.state.maintenance };
  }

  // Test depuis l'interface : l'e-mail part, puis la réponse de Brevo est lue (quelques secondes).
  async testAlert(channel) {
    if (channel !== 'email') throw new Error('Seules les alertes par e-mail sont proposées.');
    const sent = await this.sendEmail('Test des alertes NEXORA', 'Test d’alerte NEXORA : la configuration fonctionne. Tu recevras un e-mail comme celui-ci quand un site surveillé tombe en panne, ralentit ou revient en ligne.', 'test');
    for (let i = 0; i < 8; i++) {
      await new Promise((ok) => setTimeout(ok, 1500));
      const res = await this.rpc('nx_alert_email_result', { p_id: sent.id }).catch(() => null);
      if (!res) continue;
      if (res.status && res.status < 300) return { ok: true, note: `E-mail de test envoyé à ${sent.to} : vérifie ta boîte de réception (et les indésirables).` };
      let detail = res.error || res.content || '';
      try { detail = JSON.parse(res.content).message || detail; } catch { /* texte brut */ }
      techLog('erreurs', `alerte e-mail de test refusée (${res.status || '?'}) : ${detail}`);
      throw new Error('L’e-mail de test n’a pas pu être envoyé. Réessaie plus tard.');
    }
    return { ok: true, note: `E-mail de test envoyé à ${sent.to} : il peut mettre une minute à arriver.` };
  }

  silence({ id, minutes } = {}) {
    const until = Number(minutes) > 0 ? this.now() + Number(minutes) * 60000 : 0;
    if (id) {
      const e = (this.state.endpoints || []).find((x) => x.id === id);
      if (!e) throw new Error('Site introuvable.');
      e.mutedUntil = until;
    } else this.settings.silenceUntil = until;
    this.save();
    return this.config();
  }

  // ---------- Requêtes des tableaux de bord ----------

  window(range, from, to) {
    const now = this.now();
    const span = RANGES[range] || RANGES['24h'];
    const end = Number(to) || now + 1;
    return { from: Number(from) || end - span, to: end };
  }

  // Mesures d'un site sur une période : brutes jusqu'à 7 jours, agrégats horaires au-delà.
  source(id, from, to) {
    if (to - from <= RAW_MAX_SPAN) return { items: this.store.raw(id, from, to), hourly: false };
    return { items: this.store.hourly(id, from, to), hourly: true };
  }

  siteView(e, from, to, bars) {
    const st = this.status[e.id] || {};
    const src = this.source(e.id, from, to);
    const tot = S.totals(src.items, from, to, src.hourly);
    const b = S.buckets(src.items, from, to, bars, src.hourly);
    const recent = this.store.recent(e.id);
    const last = recent[recent.length - 1] || null;
    const at = this.now();
    return {
      id: e.id, name: e.name || '', url: e.url || '', enabled: e.enabled !== false, intervalSec: Number(e.intervalSec) || 300,
      thresholdMs: Number(e.thresholdMs) || 0, keyword: e.keyword || '', watchErrors: Boolean(e.watchErrors),
      state: e.enabled === false ? 'paused' : this.inMaint(e, at) ? 'maint' : st.state || 'unknown', pending: Boolean(st.pending), since: st.since || null,
      muted: Boolean(e.mutedUntil && e.mutedUntil > at), mutedUntil: e.mutedUntil || 0,
      last, reason: st.reason || '', ip: st.ip || '', http: st.http || '',
      cert: st.cert || (last && last.certDays != null ? { days: last.certDays } : null),
      // NEXORA #048
      type: e.type || 'http', watchChange: Boolean(e.watchChange), slo: this.sloOf(e), maint: this.inMaint(e, at),
      domainDays: st.domainDays != null ? st.domainDays : null, dnsValues: st.dnsValues || '', apiValue: st.apiValue || '', journey: st.journey || null,
      avail: tot.avail, p50: tot.p50, p95: tot.p95, p99: tot.p99, avg: tot.avg, n: tot.n, fails: tot.fails, slow: tot.slow, cov: tot.cov,
      step: b.step,
      bars: b.points.map((p) => ({ t: p.t, n: p.n, avail: p.avail, fails: p.fails, slow: p.slow, p95: p.p95, avg: p.avg })),
      open: this.incidents.filter((i) => i.siteId === e.id && i.end == null).map((i) => ({ id: i.id, kind: i.kind, start: i.start, cause: i.lastCause || i.cause, ackAt: i.ackAt })),
      errors: this.errReports[e.id] ? { at: this.errReports[e.id].at, js: this.errReports[e.id].errors.length, failed: this.errReports[e.id].failed.length } : null,
    };
  }

  overview({ range = '24h', bars = 60 } = {}) {
    const { from, to } = this.window(range);
    const sites = (this.state.endpoints || []).map((e) => this.siteView(e, from, to, Math.max(10, Math.min(180, Number(bars) || 60))));
    let w = 0; let wUp = 0; let n = 0; let fails = 0; let cov = 0;
    const p95s = [];
    for (const s of sites) {
      if (s.cov) { w += s.cov; wUp += (s.avail / 100) * s.cov; cov = Math.max(cov, s.cov); }
      n += s.n; fails += s.fails;
      if (s.p95 != null) p95s.push(s.p95);
    }
    p95s.sort((a, b) => a - b);
    const incStats = S.incidentStats(this.incidents, from, to, null, this.now());
    return {
      now: this.now(), range, from, to, step: sites[0] ? sites[0].step : Math.ceil((to - from) / 60),
      settings: this.settings,
      sites,
      totals: {
        sites: sites.length,
        active: sites.filter((s) => s.enabled).length,
        up: sites.filter((s) => s.state === 'up').length,
        down: sites.filter((s) => s.state === 'down').length,
        slow: sites.filter((s) => s.state === 'slow').length,
        paused: sites.filter((s) => s.state === 'paused').length,
        maint: sites.filter((s) => s.state === 'maint').length,
        avail: w ? S.round((wUp / w) * 100, 3) : null,
        checks: n, fails,
        p95: p95s.length ? S.round(S.quantile(p95s, 0.5)) : null,
        certSoon: sites.filter((s) => s.cert && s.cert.days != null && s.cert.days <= this.settings.certDays).length,
        coverage: to - from ? Math.min(100, S.round(((cov * 1000) / (to - from)) * 100, 1)) : null,
        incidents: incStats,
      },
      incidents: this.incidents.filter((i) => i.start < to && (i.end == null || i.end > from)).slice(0, 12),
      marks: this.marks({ from, to }).slice(0, 50),
    };
  }

  series({ id, range = '24h', from, to, points = 120 } = {}) {
    const e = (this.state.endpoints || []).find((x) => x.id === id);
    if (!e) throw new Error('Site introuvable.');
    const win = this.window(range, from, to);
    const count = Math.max(10, Math.min(400, Number(points) || 120));
    const src = this.source(id, win.from, win.to);
    const b = S.buckets(src.items, win.from, win.to, count, src.hourly);
    const tot = S.totals(src.items, win.from, win.to, src.hourly);
    const incs = this.incidents.filter((i) => i.siteId === id && i.start < win.to && (i.end == null || i.end > win.from));
    return {
      id, range, from: win.from, to: win.to, step: b.step, hourly: src.hourly,
      site: this.siteView(e, win.from, win.to, 90),
      points: b.points, totals: tot,
      incidents: incs, stats: S.incidentStats(incs, win.from, win.to, tot.cov, this.now()),
      recent: this.store.recent(id).slice(-60).reverse(),
      marks: this.marks({ siteId: id, from: win.from, to: win.to }),
    };
  }

  raw({ id, range = '24h', from, to, limit = 50000 } = {}) {
    const win = this.window(range, from, to);
    const list = this.store.raw(id, win.from, win.to);
    return list.slice(-Math.max(1, Math.min(200000, Number(limit) || 50000)));
  }

  incidentsQuery({ siteId, state = 'all', kind, range = '30j', limit = 300 } = {}) {
    const { from, to } = this.window(range);
    let list = this.incidents.filter((i) => i.start < to && (i.end == null || i.end > from));
    if (siteId) list = list.filter((i) => i.siteId === siteId);
    if (kind) list = list.filter((i) => i.kind === kind);
    const stats = S.incidentStats(list, from, to, null, this.now());
    if (state === 'open') list = list.filter((i) => i.end == null);
    else if (state === 'closed') list = list.filter((i) => i.end != null);
    return { from, to, list: list.slice(0, Math.max(1, Number(limit) || 300)), stats };
  }

  // Compatibilité : résumé par site utilisé par l'interface d'origine et l'autotest.
  summary() {
    const at = this.now();
    return (this.state.endpoints || []).map((e) => {
      const recent = this.store.recent(e.id);
      const last = recent[recent.length - 1] || null;
      const tot = S.totals(recent, at - 86400e3, at + 1);
      const st = this.status[e.id] || {};
      const er = this.errReports[e.id];
      return {
        ...e, last, uptime: tot.avail == null ? null : Math.round(tot.avail * 10) / 10, avg: tot.avg, p95: tot.p95,
        state: e.enabled === false ? 'paused' : st.state || 'unknown',
        certDays: st.cert ? st.cert.days : last ? last.certDays : null, spark: recent.slice(-40).map((x) => (x.up ? x.ms : -1)),
        errors: er ? { at: er.at, js: er.errors.length, warnings: er.warnings.length, failed: er.failed.length } : null,
      };
    });
  }

  stopAll() {
    for (const t of this.timers.values()) clearInterval(t);
    for (const t of this.rechecks.values()) clearTimeout(t);
    this.timers.clear();
    this.rechecks.clear();
    if (this.pruneTimer) { clearInterval(this.pruneTimer); this.pruneTimer = null; }
    if (this.quietT) { clearInterval(this.quietT); this.quietT = null; }
    if (this.batchT) { clearTimeout(this.batchT); this.batchT = null; }
  }
}

function register({
  ipcMain, app, net, send, pageErrors, probe, now, journey, planCheck,
}) {
  const fetchImpl = (u, o) => (net && net.fetch ? net.fetch(u, o) : fetch(u, o));
  const mon = new Monitor({
    app, fetchImpl, send, pageErrors, probe, now, journey, planCheck,
  });
  ipcMain.handle('mon:errors', (_e, id) => mon.errReports[id] || null);
  ipcMain.handle('mon:check-errors', async (_e, id) => {
    const e = (mon.state.endpoints || []).find((x) => x.id === id);
    if (!e || !pageErrors) return null;
    const r = await pageErrors(e.url);
    mon.errReports[e.id] = r;
    mon.save();
    return r;
  });
  mon.restartAll();
  ipcMain.handle('mon:config', () => mon.config());
  ipcMain.handle('mon:set-endpoints', (_e, list) => mon.setEndpoints(list));
  ipcMain.handle('mon:set-channels', (_e, ch) => { mon.setChannels(ch); return { ok: true }; });
  // NEXORA #030 : session du compte NEXORA pour les alertes e-mail (mémoire seulement).
  ipcMain.handle('mon:cloud-session', (_e, c) => { mon.setCloud(c); return Boolean(mon.cloud); });
  ipcMain.handle('mon:summary', () => mon.summary());
  ipcMain.handle('mon:history', (_e, id) => mon.store.recent(id));
  ipcMain.handle('mon:check-now', async (_e, id) => { const e = (mon.state.endpoints || []).find((x) => x.id === id); return e ? mon.check(e) : null; });
  ipcMain.handle('mon:test-alert', (_e, channel) => mon.testAlert(channel).then((r) => ({ ok: true, note: r && r.note })).catch((err) => ({ ok: false, error: err.message })));
  // NEXORA #015 : tableaux de bord, incidents, réglages des alertes, sourdine et journal des alertes.
  ipcMain.handle('mon:overview', (_e, opts) => mon.overview(opts || {}));
  ipcMain.handle('mon:series', (_e, opts) => mon.series(opts || {}));
  ipcMain.handle('mon:raw', (_e, opts) => mon.raw(opts || {}));
  ipcMain.handle('mon:incidents', (_e, opts) => mon.incidentsQuery(opts || {}));
  ipcMain.handle('mon:incident', (_e, opts) => mon.incidentAction(opts || {}));
  ipcMain.handle('mon:settings', () => mon.settings);
  ipcMain.handle('mon:set-settings', (_e, patch) => mon.setSettings(patch));
  ipcMain.handle('mon:silence', (_e, opts) => mon.silence(opts || {}));
  ipcMain.handle('mon:alerts-log', (_e, { limit = 200 } = {}) => mon.alertLog.slice(0, Math.max(1, Math.min(500, Number(limit) || 200))));
  // NEXORA #048 : webhooks, maintenance, repères de déploiement, rapport mensuel.
  ipcMain.handle('mon:test-webhook', (_e, opts) => mon.testWebhook(opts || {}));
  ipcMain.handle('mon:maintenance', () => mon.state.maintenance);
  ipcMain.handle('mon:set-maintenance', (_e, list) => mon.setMaintenance(list));
  ipcMain.handle('mon:marks', (_e, opts) => mon.marks(opts || {}));
  ipcMain.handle('mon:mark-add', (_e, opts) => mon.addMark({ ...(opts || {}), source: 'manuel' }));
  ipcMain.handle('mon:mark-del', (_e, id) => { mon.state.marks = mon.state.marks.filter((m) => m.id !== id); mon.save(); return true; });
  ipcMain.handle('mon:report', (_e, opts) => mon.report(opts || {}));
  app.on('before-quit', () => { mon.stopAll(); mon.flush(); });
  return mon;
}

module.exports = { register, Monitor, DEFAULTS, RANGES, hookPayload, hookKind, cleanChannels };
