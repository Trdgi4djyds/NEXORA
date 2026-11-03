'use strict';
/* Supervision des sites de l'utilisateur : vérifications périodiques (disponibilité, temps de réponse,
 * expiration du certificat, présence d'un mot-clé), historique, et alertes par Telegram, e-mail ou WhatsApp
 * lorsqu'un site tombe, ralentit ou que son certificat approche de l'expiration. Tourne tant que NEXORA est
 * ouverte. Aucune donnée n'est envoyée ailleurs que vers les canaux d'alerte que l'utilisateur configure. */
const fs = require('fs');
const path = require('path');
const tls = require('tls');
const { sendMail } = require('./smtp');

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

class Monitor {
  constructor({ app, fetchImpl, send, pageErrors }) {
    this.file = path.join(app.getPath('userData'), 'monitor.json');
    this.fetch = fetchImpl;
    this.send = send;
    this.pageErrors = pageErrors || null;
    this.timers = new Map();
    this.state = this.load();
    this.history = this.state.history || {};
    this.errReports = this.state.errReports || {}; // dernier relevé d'erreurs de page, par site
    this.lastAlert = {};
  }

  // Erreurs de la page (JavaScript, ressources en échec) : au plus une fois toutes les 5 minutes par site.
  async checkErrors(e, rec) {
    if (!this.pageErrors || !e.watchErrors || !rec.up) return;
    const prev = this.errReports[e.id];
    const every = Math.max(300, Number(e.intervalSec) || 300) * 1000;
    if (prev && Date.now() - prev.at < every - 5000) { rec.jsErrors = prev.errors.length; rec.failedRes = prev.failed.length; return; }
    try {
      const r = await this.pageErrors(e.url);
      this.errReports[e.id] = r;
      rec.jsErrors = r.errors.length;
      rec.failedRes = r.failed.length;
      this.send('mon:errors', { id: e.id, report: r });
    } catch { /* vérification impossible : on réessaiera */ }
  }

  load() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { return { endpoints: [], channels: {}, history: {} }; }
  }

  save() { try { fs.writeFileSync(this.file, JSON.stringify({ ...this.state, history: this.history, errReports: this.errReports }, null, 1)); } catch { /* best effort */ } }

  config() { return { endpoints: this.state.endpoints || [], channels: this.state.channels || {} }; }

  setChannels(ch) { this.state.channels = ch; this.save(); }

  setEndpoints(list) {
    this.state.endpoints = list;
    this.save();
    this.restartAll();
    return this.config();
  }

  restartAll() {
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
    for (const e of this.state.endpoints || []) if (e.enabled !== false) this.schedule(e);
  }

  schedule(e) {
    const ms = Math.max(30, Number(e.intervalSec) || 300) * 1000;
    this.timers.set(e.id, setInterval(() => this.check(e).catch(() => {}), ms));
    this.check(e).catch(() => {});
  }

  push(id, rec) {
    const h = this.history[id] || (this.history[id] = []);
    h.push(rec);
    if (h.length > 500) h.splice(0, h.length - 500);
  }

  async check(e) {
    const t0 = Date.now();
    let rec;
    try {
      const ctrl = AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined;
      const r = await this.fetch(e.url, { method: 'GET', redirect: 'follow', signal: ctrl });
      const ms = Date.now() - t0;
      let body = '';
      if (e.keyword) body = (await r.text().catch(() => '')).slice(0, 200000);
      const okStatus = e.expectStatus ? r.status === Number(e.expectStatus) : r.status < 400;
      const okKeyword = !e.keyword || body.includes(e.keyword);
      const up = okStatus && okKeyword;
      rec = { at: Date.now(), up, status: r.status, ms, reason: !okStatus ? `statut ${r.status}` : !okKeyword ? 'mot-clé absent' : '' };
    } catch (err) {
      rec = { at: Date.now(), up: false, status: 0, ms: Date.now() - t0, reason: /abort|timeout/i.test(String(err)) ? 'délai dépassé' : 'injoignable' };
    }
    // Certificat (une fois par heure pour les sites https).
    try {
      const u = new URL(e.url);
      if (u.protocol === 'https:') {
        const last = (this.history[e.id] || []).slice().reverse().find((x) => x.certDays != null);
        if (!last || Date.now() - (last.at || 0) > 3600000) rec.certDays = await tlsDays(u.hostname, u.port ? Number(u.port) : 443);
        else rec.certDays = last.certDays;
      }
    } catch { /* adresse invalide */ }
    await this.checkErrors(e, rec);
    const prev = (this.history[e.id] || []).slice(-1)[0];
    this.push(e.id, rec);
    this.save();
    this.send('mon:update', { id: e.id, rec });
    this.evaluate(e, rec, prev);
    return rec;
  }

  evaluate(e, rec, prev) {
    const alerts = [];
    if (prev && prev.up && !rec.up) alerts.push({ key: 'down', level: 'critique', text: `🔴 ${e.name || e.url} est hors ligne (${rec.reason}).` });
    if (prev && !prev.up && rec.up) alerts.push({ key: 'up', level: 'ok', text: `🟢 ${e.name || e.url} est de nouveau en ligne (${rec.ms} ms).` });
    const thr = Number(e.thresholdMs) || 0;
    if (thr && rec.up && rec.ms > thr && (!prev || prev.ms <= thr)) alerts.push({ key: 'slow', level: 'alerte', text: `🟠 ${e.name || e.url} est lent : ${rec.ms} ms (seuil ${thr} ms).` });
    if (rec.certDays != null && rec.certDays <= 14 && rec.certDays >= 0) alerts.push({ key: 'cert', level: 'alerte', text: `🟠 Le certificat de ${e.name || e.url} expire dans ${rec.certDays} jour(s).` });
    // Erreurs de page : nouvelle apparition, puis retour à la normale.
    const prevErr = prev ? (prev.jsErrors || 0) + (prev.failedRes || 0) : 0;
    const curErr = (rec.jsErrors || 0) + (rec.failedRes || 0);
    if (rec.jsErrors != null && curErr > 0 && prevErr === 0) {
      const rep = this.errReports[e.id];
      const first = rep && rep.errors[0] ? ` Première erreur : ${rep.errors[0].message.slice(0, 140)}` : rep && rep.failed[0] ? ` Ressource en échec : ${rep.failed[0].url.slice(0, 120)} (${rep.failed[0].status || rep.failed[0].error})` : '';
      alerts.push({ key: 'errors', level: 'alerte', text: `🟠 ${e.name || e.url} : ${rec.jsErrors || 0} erreur(s) JavaScript et ${rec.failedRes || 0} ressource(s) en échec.${first}` });
    }
    if (rec.jsErrors != null && curErr === 0 && prevErr > 0) alerts.push({ key: 'errors-ok', level: 'ok', text: `🟢 ${e.name || e.url} : plus aucune erreur détectée sur la page.` });
    for (const a of alerts) {
      // Anti-répétition : une même alerte n'est pas renvoyée avant 30 min (sauf « de nouveau en ligne »).
      const k = `${e.id}:${a.key}`;
      if (a.key !== 'up' && a.key !== 'errors-ok' && this.lastAlert[k] && Date.now() - this.lastAlert[k] < 1800000) continue;
      this.lastAlert[k] = Date.now();
      this.dispatch(a.text, e.alerts || null).catch(() => {});
    }
  }

  async dispatch(text, only) {
    const ch = this.state.channels || {};
    const want = (name) => !only || only[name] !== false;
    const results = [];
    if (ch.telegram && ch.telegram.token && ch.telegram.chatId && want('telegram')) results.push(this.sendTelegram(ch.telegram, text).catch((e) => e));
    if (ch.whatsapp && ch.whatsapp.phone && ch.whatsapp.apikey && want('whatsapp')) results.push(this.sendWhatsApp(ch.whatsapp, text).catch((e) => e));
    if (ch.email && ch.email.host && ch.email.to && want('email')) results.push(sendMail({ ...ch.email, subject: 'Alerte NEXORA', text }).catch((e) => e));
    return Promise.all(results);
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

  summary() {
    return (this.state.endpoints || []).map((e) => {
      const h = this.history[e.id] || [];
      const last = h.slice(-1)[0] || null;
      const window = h.slice(-100);
      const upCount = window.filter((x) => x.up).length;
      const uptime = window.length ? Math.round((upCount / window.length) * 1000) / 10 : null;
      const avg = window.length ? Math.round(window.reduce((a, x) => a + x.ms, 0) / window.length) : null;
      const er = this.errReports[e.id];
      return {
        ...e, last, uptime, avg, certDays: last ? last.certDays : null, spark: window.slice(-40).map((x) => (x.up ? x.ms : -1)),
        errors: er ? { at: er.at, js: er.errors.length, warnings: er.warnings.length, failed: er.failed.length } : null,
      };
    });
  }

  stopAll() { for (const t of this.timers.values()) clearInterval(t); this.timers.clear(); }
}

function register({
  ipcMain, app, net, send, pageErrors,
}) {
  const fetchImpl = (u, o) => (net && net.fetch ? net.fetch(u, o) : fetch(u, o));
  const mon = new Monitor({
    app, fetchImpl, send, pageErrors,
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
  ipcMain.handle('mon:history', (_e, id) => mon.history[id] || []);
  ipcMain.handle('mon:check-now', async (_e, id) => { const e = (mon.state.endpoints || []).find((x) => x.id === id); return e ? mon.check(e) : null; });
  ipcMain.handle('mon:test-alert', (_e, channel) => mon.testAlert(channel).then((r) => ({ ok: true, note: r && r.note })).catch((err) => ({ ok: false, error: err.message })));
  app.on('before-quit', () => mon.stopAll());
  return mon;
}

module.exports = { register };
