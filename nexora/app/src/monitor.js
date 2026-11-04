'use strict';
/* Supervision des sites de l'utilisateur : vérifications périodiques (disponibilité, temps de réponse,
 * expiration du certificat, présence d'un mot-clé), historique, et alertes par Telegram, e-mail ou WhatsApp
 * lorsqu'un site tombe, ralentit ou que son certificat approche de l'expiration. Tourne tant que NEXORA est
 * ouverte. Aucune donnée n'est envoyée ailleurs que vers les canaux d'alerte que l'utilisateur configure.
 *
 * NEXORA #015 : chaque vérification mesure le détail du temps de réponse (DNS, connexion, TLS, premier
 * octet, transfert) ; une panne n'est déclarée qu'après plusieurs échecs de suite (fausses alertes
 * évitées) et ouvre un incident suivi jusqu'au retour à la normale (prise en charge, note, rappels,
 * mise en sourdine). L'historique est gardé 31 jours en détail et plus d'un an en agrégats horaires
 * (src/supervision/), avec des requêtes prêtes pour les tableaux de bord de l'interface. */
const fs = require('fs');
const path = require('path');
const tls = require('tls');
const { sendMail } = require('./smtp');
const { probe: realProbe, reasonOf } = require('./supervision/probe');
const { SiteStore } = require('./supervision/store');
const S = require('./supervision/stats');

const timeout = (ms) => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);

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
};
const RANGES = { '1h': 3600e3, '24h': 86400e3, '7j': 7 * 86400e3, '30j': 30 * 86400e3, '90j': 90 * 86400e3 };
const RAW_MAX_SPAN = 7 * 86400e3 + 60000; // au-delà : agrégats horaires
const RECOVERY = new Set(['up', 'slow-ok', 'errors-ok', 'cert-ok']);
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
  constructor({ app, fetchImpl, send, pageErrors, probe, now }) {
    this.now = now || Date.now;
    this.file = path.join(app.getPath('userData'), 'monitor.json');
    this.dir = path.join(app.getPath('userData'), 'supervision');
    this.fetch = fetchImpl;
    this.send = send;
    this.pageErrors = pageErrors || null;
    this.probeImpl = probe || realProbe;
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
    return readJson(this.file, null) || { endpoints: [], channels: {} };
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

  setChannels(ch) { this.state.channels = ch; this.save(); }

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
    const ms = Math.max(30, Number(e.intervalSec) || 300) * 1000;
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
    const iv = Math.max(30, Number(e.intervalSec) || 300);
    const st = this.st(e.id);
    let rec;
    try {
      const r = await this.probeImpl(e.url, { timeout: 20000, keyword: e.keyword || '' });
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
      const thr = Number(e.thresholdMs) || 0;
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
  alert(e, key, level, text, inc, force = false) {
    const at = this.now();
    const k = `${e.id}:${key}`;
    // Anti-répétition : une même alerte n'est pas renvoyée avant 30 min (sauf retours à la normale et rappels).
    if (!force && !RECOVERY.has(key) && this.lastAlert[k] && at - this.lastAlert[k] < 1800000) return null;
    this.lastAlert[k] = at;
    if (inc) { inc.notified = (inc.notified || 0) + 1; inc.lastNotified = at; }
    const muted = Boolean((e.mutedUntil && e.mutedUntil > at) || (this.settings.silenceUntil && this.settings.silenceUntil > at));
    const entry = { id: uid(), at, siteId: e.id, siteName: e.name || e.url, kind: key, level, text, muted, incidentId: inc ? inc.id : null, results: null };
    this.alertLog.unshift(entry);
    if (this.alertLog.length > 500) this.alertLog.length = 500;
    this.saveAlerts();
    if (muted) { entry.results = []; return entry; }
    this.dispatch(text, e.alerts || null).then((res) => { entry.results = res; this.saveAlerts(); this.send('mon:alert', entry); }).catch(() => {});
    return entry;
  }

  async dispatch(text, only) {
    const ch = this.state.channels || {};
    const want = (name) => !only || only[name] !== false;
    const jobs = [];
    if (ch.telegram && ch.telegram.token && ch.telegram.chatId && want('telegram')) jobs.push(['telegram', () => this.sendTelegram(ch.telegram, text)]);
    if (ch.whatsapp && ch.whatsapp.phone && ch.whatsapp.apikey && want('whatsapp')) jobs.push(['whatsapp', () => this.sendWhatsApp(ch.whatsapp, text)]);
    if (ch.email && ch.email.host && ch.email.to && want('email')) jobs.push(['email', () => sendMail({ ...ch.email, subject: 'Alerte NEXORA', text })]);
    return Promise.all(jobs.map(([channel, run]) => Promise.resolve().then(run).then(() => ({ channel, ok: true }), (err) => ({ channel, ok: false, error: String((err && err.message) || err) }))));
  }

  async sendTelegram(cfg, text) {
    const token = String(cfg.token || '').trim();
    const chatId = String(cfg.chatId || '').trim();
    // Le jeton contient « : » : il doit rester tel quel dans l'adresse (encodé en %3A, Telegram répond 404).
    if (!/^\d{5,}:[\w-]{20,}$/.test(token)) throw new Error('Jeton du bot invalide : il ressemble à 123456789:AAH… (donné par @BotFather).');
    if (!/^(-?\d+|@[\w]{4,})$/.test(chatId)) throw new Error('Identifiant de discussion invalide : un nombre (ex. 123456789) donné par @userinfobot, ou @nomdecanal.');
    const r = await this.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }), signal: timeout(15000),
    });
    const j = await r.json().catch(() => ({}));
    if (j.ok) return { ok: true };
    const d = String(j.description || `HTTP ${r.status}`);
    if (r.status === 401 || r.status === 404) throw new Error('Jeton du bot refusé par Telegram : recopie-le depuis @BotFather.');
    if (/chat not found/i.test(d)) throw new Error('Discussion introuvable : ouvre ton bot dans Telegram, appuie sur « Démarrer » (/start), puis vérifie l’identifiant donné par @userinfobot.');
    if (/can't initiate|blocked|forbidden/i.test(d)) throw new Error('Le bot ne peut pas t’écrire : ouvre la discussion avec ton bot et appuie sur « Démarrer » (/start).');
    throw new Error(`Telegram : ${d}`);
  }

  // WhatsApp via CallMeBot (gratuit, pour s'alerter soi-même) : l'utilisateur a activé le bot et obtenu sa clé.
  // CallMeBot répond toujours HTTP 200 : on lit le texte de la réponse pour savoir si c'est accepté.
  async sendWhatsApp(cfg, text) {
    let phone = String(cfg.phone || '').replace(/[\s().-]/g, '');
    if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
    if (!phone.startsWith('+')) phone = `+${phone}`;
    if (!/^\+\d{8,15}$/.test(phone)) throw new Error('Numéro WhatsApp invalide : indique-le au format international, ex. +22997000000.');
    const apikey = String(cfg.apikey || '').trim();
    if (!apikey) throw new Error('Clé API WhatsApp manquante : envoie « I allow callmebot to send me messages » au bot CallMeBot pour l’obtenir.');
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
    const r = await this.fetch(url, { signal: timeout(20000) });
    const raw = await r.text().catch(() => '');
    // Texte visible seulement (sans balises, scripts ni styles) pour éviter les faux échecs.
    const vis = raw.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (/apikey is invalid|invalid apikey|wrong apikey/i.test(vis)) throw new Error('Clé API WhatsApp refusée : vérifie la clé reçue de CallMeBot (elle est liée à ce numéro).');
    if (/not (been )?activated|you need to (get|activate)|phone.*not.*(found|registered)|not in our database/i.test(vis)) throw new Error('Ce numéro n’est pas activé chez CallMeBot : envoie d’abord le message d’autorisation au bot, puis réessaie.');
    if (!r.ok) throw new Error(`WhatsApp : le service a répondu HTTP ${r.status}.`);
    if (/queued|message sent|sent to|will receive/i.test(vis)) return { ok: true };
    if (/error|failed|limit/i.test(vis)) throw new Error(`WhatsApp : ${vis.slice(0, 160)}`);
    return { ok: true, note: 'Envoyé (le service n’a pas confirmé, le message peut mettre une minute).' };
  }

  async testAlert(channel) {
    const ch = this.state.channels || {};
    const text = '✅ Test d’alerte NEXORA : la configuration fonctionne.';
    if (channel === 'telegram') return this.sendTelegram(ch.telegram || {}, text);
    if (channel === 'whatsapp') return this.sendWhatsApp(ch.whatsapp || {}, text);
    if (channel === 'email') return sendMail({ ...(ch.email || {}), subject: 'Test NEXORA', text });
    throw new Error('Canal inconnu.');
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
      state: e.enabled === false ? 'paused' : st.state || 'unknown', pending: Boolean(st.pending), since: st.since || null,
      muted: Boolean(e.mutedUntil && e.mutedUntil > at), mutedUntil: e.mutedUntil || 0,
      last, reason: st.reason || '', ip: st.ip || '', http: st.http || '',
      cert: st.cert || (last && last.certDays != null ? { days: last.certDays } : null),
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
        avail: w ? S.round((wUp / w) * 100, 3) : null,
        checks: n, fails,
        p95: p95s.length ? S.round(S.quantile(p95s, 0.5)) : null,
        certSoon: sites.filter((s) => s.cert && s.cert.days != null && s.cert.days <= this.settings.certDays).length,
        coverage: to - from ? Math.min(100, S.round(((cov * 1000) / (to - from)) * 100, 1)) : null,
        incidents: incStats,
      },
      incidents: this.incidents.filter((i) => i.start < to && (i.end == null || i.end > from)).slice(0, 12),
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
  }
}

function register({
  ipcMain, app, net, send, pageErrors, probe, now,
}) {
  const fetchImpl = (u, o) => (net && net.fetch ? net.fetch(u, o) : fetch(u, o));
  const mon = new Monitor({
    app, fetchImpl, send, pageErrors, probe, now,
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
  app.on('before-quit', () => { mon.stopAll(); mon.flush(); });
  return mon;
}

module.exports = { register, Monitor, DEFAULTS, RANGES };
