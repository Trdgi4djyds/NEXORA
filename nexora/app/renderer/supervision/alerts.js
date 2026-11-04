// NEXORA #015 : alertes de la supervision (canaux Telegram, e-mail et WhatsApp, règles de déclenchement,
// sourdine générale, journal des alertes envoyées) et export vers Prometheus + Grafana.
import { call, esc, icon, num, time, dateTime, toast, ALERT_KIND, CHANNEL } from './util.js';
import { card, btn } from './ui.js';

// Fournisseurs d'e-mail (mêmes réglages que l'interface d'origine de la supervision).
const SMTP = {
  custom: { label: 'Fournisseur : autre (saisie manuelle)' }, gmail: { label: 'Gmail', host: 'smtp.gmail.com', port: 587 },
  outlook: { label: 'Outlook / Hotmail / Microsoft 365', host: 'smtp.office365.com', port: 587 }, yahoo: { label: 'Yahoo Mail', host: 'smtp.mail.yahoo.com', port: 465 },
  zoho: { label: 'Zoho Mail', host: 'smtp.zoho.com', port: 465 }, ovh: { label: 'OVH', host: 'ssl0.ovh.net', port: 465 },
  hostinger: { label: 'Hostinger', host: 'smtp.hostinger.com', port: 465 }, brevo: { label: 'Brevo (Sendinblue)', host: 'smtp-relay.brevo.com', port: 587 },
};

const field = (ch, key, value, placeholder, type = 'text') => `<input class="input" type="${type}" data-ch="${ch}|${key}" value="${esc(value || '')}" placeholder="${esc(placeholder)}" spellcheck="false">`;

export async function renderAlerts(ctx) {
  const [cfg, log] = await Promise.all([call('mon:config'), call('mon:alerts-log', { limit: 200 }).catch(() => [])]);
  ctx.state.alertCfg = cfg;
  const ch = cfg.channels || {};
  const st = cfg.settings || { confirm: 2, slowConfirm: 3, repeatMin: 60, certDays: 14, notifyRecovery: true, silenceUntil: 0 };
  const ready = { telegram: ch.telegram && ch.telegram.token && ch.telegram.chatId, email: ch.email && ch.email.host && ch.email.to, whatsapp: ch.whatsapp && ch.whatsapp.phone && ch.whatsapp.apikey };
  const nReady = Object.values(ready).filter(Boolean).length;
  const tg = ch.telegram || {}; const em = ch.email || {}; const wa = ch.whatsapp || {};
  const head = (k, ic, label) => `<div class="sup-ch-h">${icon(ic, 15)}<b>${label}</b>${ready[k] ? `<span class="sup-chip good">${icon('check', 11)}Prêt</span>` : '<span class="sup-chip">Non configuré</span>'}</div>`;
  const channels = `<div class="sup-chs">
    <div class="sup-ch ${ready.telegram ? 'on' : ''}">${head('telegram', 'chat', 'Telegram')}
      ${field('telegram', 'token', tg.token, 'Jeton du bot : 123456789:AAH…')}${field('telegram', 'chatId', tg.chatId, 'Ton identifiant : 123456789')}
      <div class="sup-ch-f">${btn('Tester', 'data-al-test="telegram"', { ic: 'bell' })}<span class="sup-ch-res" data-res="telegram"></span></div>
      <details><summary>Comment faire ?</summary><ol class="mon-steps"><li>Dans Telegram, écris à <b>@BotFather</b> : <code>/newbot</code> → copie le jeton.</li><li>Ouvre ton nouveau bot et appuie sur <b>Démarrer</b>.</li><li>Écris à <b>@userinfobot</b> → copie ton identifiant (nombre).</li></ol></details>
    </div>
    <div class="sup-ch ${ready.email ? 'on' : ''}">${head('email', 'mail', 'E-mail')}
      <select class="input" data-al-preset>${Object.entries(SMTP).map(([k, v]) => `<option value="${k}" ${em.host && em.host === v.host ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
      <div class="sup-form-grid">${field('email', 'host', em.host, 'Serveur SMTP')}${field('email', 'port', em.port || '587', 'Port (587 ou 465)')}</div>
      <div class="sup-form-grid">${field('email', 'user', em.user, 'Ton adresse e-mail')}${field('email', 'pass', em.pass, 'Mot de passe d’application', 'password')}</div>
      ${field('email', 'to', em.to, 'Destinataire(s), séparés par des virgules')}
      <div class="sup-ch-f">${btn('Tester', 'data-al-test="email"', { ic: 'bell' })}<span class="sup-ch-res" data-res="email"></span></div>
      <details><summary>Comment faire ?</summary><p class="pop-note">Gmail, Outlook et Yahoo refusent ton mot de passe habituel : crée un <b>mot de passe d’application</b>. <button type="button" class="link-btn small" data-external="https://myaccount.google.com/apppasswords">Gmail</button></p></details>
    </div>
    <div class="sup-ch ${ready.whatsapp ? 'on' : ''}">${head('whatsapp', 'chat', 'WhatsApp')}
      ${field('whatsapp', 'phone', wa.phone, 'Ton numéro : +229 97 00 00 00')}${field('whatsapp', 'apikey', wa.apikey, 'Clé API WhatsApp')}
      <div class="sup-ch-f">${btn('Tester', 'data-al-test="whatsapp"', { ic: 'bell' })}<span class="sup-ch-res" data-res="whatsapp"></span></div>
      <details><summary>Comment faire ?</summary><ol class="mon-steps"><li>Ajoute le contact du service d’alerte gratuit et envoie-lui « I allow callmebot to send me messages ».</li><li>Tu reçois ta clé par WhatsApp en une à deux minutes. <button type="button" class="link-btn small" data-external="https://callmebot.com/blog/free-api-whatsapp-messages">Numéro du service</button></li></ol></details>
    </div>
  </div>`;
  const now = Date.now();
  const silenced = st.silenceUntil && st.silenceUntil > now;
  const sel = (key, opts, val) => `<select class="input small" data-rule="${key}">${opts.map(([v, l]) => `<option value="${v}" ${Number(val) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const rules = `<div class="sup-rules">
    <div class="sup-rule"><div><b>Confirmer une panne</b><small>Une seule vérification ratée peut venir d’un accroc réseau : NEXORA revérifie avant d’alerter.</small></div>${sel('confirm', [1, 2, 3, 4, 5].map((n) => [n, n === 1 ? 'Dès le 1er échec' : `Après ${n} échecs`]), st.confirm)}</div>
    <div class="sup-rule"><div><b>Signaler une lenteur</b><small>Quand le temps de réponse dépasse le seuil du site plusieurs fois de suite.</small></div>${sel('slowConfirm', [1, 2, 3, 5, 10].map((n) => [n, n === 1 ? 'Dès la 1re fois' : `Après ${n} fois`]), st.slowConfirm)}</div>
    <div class="sup-rule"><div><b>Rappel pendant une panne</b><small>Tant qu’elle dure et que personne ne l’a prise en charge.</small></div>${sel('repeatMin', [[0, 'Jamais'], [15, 'Toutes les 15 min'], [30, 'Toutes les 30 min'], [60, 'Toutes les heures'], [120, 'Toutes les 2 h'], [240, 'Toutes les 4 h']], st.repeatMin)}</div>
    <div class="sup-rule"><div><b>Certificat bientôt expiré</b><small>Une alerte, puis un rappel par jour jusqu’au renouvellement.</small></div>${sel('certDays', [[7, '7 jours avant'], [14, '14 jours avant'], [21, '21 jours avant'], [30, '30 jours avant']], st.certDays)}</div>
    <label class="tog-row"><span class="tog-text"><span>Prévenir du retour à la normale</span><small>Message quand un site revient en ligne, redevient rapide ou n’a plus d’erreur.</small></span><input type="checkbox" data-rule="notifyRecovery" ${st.notifyRecovery ? 'checked' : ''}><span class="tog" aria-hidden="true"></span></label>
    <div class="sup-silence ${silenced ? 'on' : ''}">
      <div>${icon('bell', 15)}<b>${silenced ? `Sourdine générale jusqu’à ${esc(time(st.silenceUntil))}` : 'Sourdine générale'}</b><small>${silenced ? 'Les incidents sont enregistrés, mais aucune alerte n’est envoyée.' : 'Pour une maintenance : aucune alerte pendant la durée choisie.'}</small></div>
      <div class="sup-silence-b">${silenced ? btn('Lever la sourdine', 'data-al-silence="0"', { ic: 'close' }) : [[60, '1 h'], [240, '4 h'], [720, '12 h'], [1440, '24 h']].map(([m, l]) => btn(l, `data-al-silence="${m}"`)).join('')}</div>
    </div>
  </div>`;
  const rows = log.slice(0, 120).map((a) => `<tr>
      <td class="nowrap">${esc(dateTime(a.at))}</td>
      <td><b>${esc(a.siteName)}</b></td>
      <td><span class="sup-chip ${a.level === 'ok' ? 'good' : a.level === 'critique' ? 'bad' : 'warn'}">${esc(ALERT_KIND[a.kind] || a.kind)}</span></td>
      <td class="sup-reason">${esc(a.text.replace(/^\S+\s/u, (m) => (/^[\p{Extended_Pictographic}\u2705]/u.test(m) ? '' : m)))}</td>
      <td>${a.muted ? '<span class="sup-chip">Sourdine</span>' : a.results == null ? '<span class="muted">Envoi…</span>' : a.results.length ? a.results.map((r) => `<span class="sup-chip ${r.ok ? 'good' : 'bad'}" ${r.ok ? '' : `data-tip="${esc(r.error || '')}"`}>${esc(CHANNEL[r.channel] || r.channel)}</span>`).join('') : '<span class="muted" data-tip="Configure un canal ci-dessus pour recevoir les alertes.">Aucun canal</span>'}</td>
    </tr>`).join('');
  ctx.afterRender = () => bind(ctx);
  return `${card('Canaux d’alerte', channels, { sub: nReady ? `${nReady} canal${nReady > 1 ? 'aux' : ''} prêt${nReady > 1 ? 's' : ''} · les alertes partent tant que NEXORA est ouverte` : 'Configure au moins un canal pour être prévenu' })}
    <div class="sup-grid g-2-1 g-top">
      ${card('Journal des alertes', rows ? `<div class="sup-table-wrap sup-scroll"><table class="sup-table"><thead><tr><th>Date</th><th>Site</th><th>Type</th><th>Message</th><th>Envoi</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="sup-none">${icon('bell', 14)} Aucune alerte pour l’instant.</p>`, { sub: `${num(log.length)} alerte${log.length > 1 ? 's' : ''} (500 gardées au plus)` })}
      ${card('Règles', rules, { sub: 'Valables pour tous les sites (la confirmation se règle aussi site par site)' })}
    </div>
    ${card('Exporter vers Prometheus et Grafana', `<p class="pop-note">Pour suivre tes sites depuis ton propre serveur : NEXORA génère une configuration Prometheus, un tableau de bord Grafana et un fichier docker-compose, avec les instructions.</p>`, { actions: btn('Générer la configuration', 'data-al-export', { ic: 'download' }), cls: 'sup-card-quiet' })}`;
}

function readChannels(ctx) {
  const cfg = ctx.state.alertCfg;
  const out = JSON.parse(JSON.stringify(cfg.channels || {}));
  for (const i of ctx.view.querySelectorAll('[data-ch]')) {
    const [c, k] = i.dataset.ch.split('|');
    out[c] = { ...(out[c] || {}), [k]: i.value.trim() };
  }
  cfg.channels = out;
  return out;
}

function bind(ctx) {
  const v = ctx.view;
  for (const i of v.querySelectorAll('[data-ch]')) i.onchange = () => call('mon:set-channels', readChannels(ctx)).catch((err) => toast(err.message, { kind: 'bad' }));
  const preset = v.querySelector('[data-al-preset]');
  if (preset) preset.onchange = () => {
    const p = SMTP[preset.value];
    if (!p || !p.host) return;
    v.querySelector('[data-ch="email|host"]').value = p.host;
    v.querySelector('[data-ch="email|port"]').value = String(p.port);
    call('mon:set-channels', readChannels(ctx)).catch(() => {});
  };
  for (const b of v.querySelectorAll('[data-al-test]')) b.onclick = async () => {
    const k = b.dataset.alTest;
    const out = v.querySelector(`[data-res="${k}"]`);
    b.disabled = true;
    if (out) { out.className = 'sup-ch-res busy'; out.innerHTML = '<span class="spinner small"></span> Envoi du test…'; }
    let r;
    try { await call('mon:set-channels', readChannels(ctx)); r = await call('mon:test-alert', k); } catch (err) { r = { ok: false, error: err.message }; } finally { b.disabled = false; }
    if (out) { out.className = `sup-ch-res ${r.ok ? 'good' : 'bad'}`; out.innerHTML = r.ok ? `${icon('check', 12)} ${esc(r.note || 'Message de test envoyé : vérifie sa réception.')}` : `${icon('warn', 12)} ${esc(r.error)}`; }
  };
  for (const s of v.querySelectorAll('[data-rule]')) s.onchange = async () => {
    const val = s.type === 'checkbox' ? s.checked : Number(s.value);
    try { await call('mon:set-settings', { [s.dataset.rule]: val }); toast('Règle enregistrée.'); } catch (err) { toast(err.message, { kind: 'bad' }); }
  };
  for (const b of v.querySelectorAll('[data-al-silence]')) b.onclick = async () => {
    const m = Number(b.dataset.alSilence);
    try { await call('mon:silence', { minutes: m }); toast(m ? 'Sourdine générale activée.' : 'Sourdine levée : les alertes repartent.'); ctx.show(true); } catch (err) { toast(err.message, { kind: 'bad' }); }
  };
  const ex = v.querySelector('[data-al-export]');
  if (ex) ex.onclick = async () => {
    try {
      const cfg = await call('mon:config');
      const dir = await call('mon:export-stack', { targets: (cfg.endpoints || []).map((e) => e.url).filter(Boolean) });
      if (dir) toast('Configuration générée. Ouvre le fichier d’instructions (LISEZ-MOI) du dossier.');
    } catch (err) { toast(err.message, { kind: 'bad' }); }
  };
}
