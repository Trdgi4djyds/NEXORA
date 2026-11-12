// NEXORA #015 : alertes de la supervision (règles de déclenchement, sourdine générale, journal des alertes
// envoyées) et export vers Prometheus + Grafana.
// NEXORA #030 : un seul canal, l'e-mail par Brevo, envoyé par les serveurs NEXORA à l'adresse du compte
// connecté (rien à régler ici) ; Telegram, WhatsApp et le SMTP à saisir soi-même sont retirés.
import { call, esc, icon, num, time, dateTime, toast, ALERT_KIND, CHANNEL, channelLabel } from './util.js';
import { card, btn } from './ui.js';
import { account, onAccount, saveAlertPrefs } from './cloud.js';

export async function renderAlerts(ctx) {
  const [cfg, log] = await Promise.all([call('mon:config'), call('mon:alerts-log', { limit: 200 }).catch(() => [])]);
  ctx.state.alertCfg = cfg;
  const hooks = (cfg.channels && cfg.channels.webhooks) || [];
  const em = (cfg.channels && cfg.channels.email) || {};
  const st = cfg.settings || { confirm: 2, slowConfirm: 3, repeatMin: 60, certDays: 14, notifyRecovery: true, silenceUntil: 0 };
  const acc = account();
  const ready = Boolean(em.enabled && acc.signedIn);
  const chip = ready ? `<span class="sup-chip good">${icon('check', 11)}Prêt</span>`
    : em.enabled ? '<span class="sup-chip warn">Connexion requise</span>' : '<span class="sup-chip">Désactivé</span>';
  const channels = `<div class="sup-chs sup-chs-one">
    <div class="sup-ch ${ready ? 'on' : ''}">
      <div class="sup-ch-h">${icon('mail', 15)}<b>E-mail</b>${chip}</div>
      <p class="pop-note">${acc.signedIn ? `Les alertes sont envoyées à <b>${esc(acc.email)}</b>, l’adresse de votre compte.` : 'Connectez-vous à votre compte NEXORA : les alertes sont envoyées à l’adresse de votre compte.'}</p>
      <label class="tog-row"><span class="tog-text"><span>Recevoir les alertes par e-mail</span><small>Panne, lenteur, erreurs de page, certificat et retour à la normale, selon les règles ci-dessous.</small></span><input type="checkbox" data-email-enabled ${em.enabled ? 'checked' : ''}><span class="tog" aria-hidden="true"></span></label>
      <div class="sup-ch-f">${acc.signedIn ? btn('Envoyer un e-mail de test', 'data-al-test="email"', { ic: 'bell' }) : btn('Se connecter', 'data-al-login', { ic: 'user', cls: 'primary' })}<span class="sup-ch-res" data-res="email"></span></div>
      <details><summary>Comment ça marche ?</summary><ul class="mon-steps"><li>Rien à configurer : les alertes arrivent à l’adresse de votre compte.</li><li>Jusqu’à 20 alertes par heure et 60 par jour ; au-delà, elles restent dans NEXORA.</li><li>Les alertes partent tant que NEXORA est ouverte. Pour être prévenu même NEXORA fermée, active « Surveiller aussi 24 h/24, même ordinateur éteint » dans les réglages du site.</li></ul></details>
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
    <div class="sup-rule"><div><b>Escalade</b><small>Si personne ne prend une panne en charge, une alerte « Escalade » part aussi vers les webhooks réservés aux escalades.</small></div>${sel('escalateMin', [[0, 'Jamais'], [10, 'Après 10 min'], [15, 'Après 15 min'], [30, 'Après 30 min'], [60, 'Après 1 h']], st.escalateMin || 0)}</div>
    <div class="sup-rule"><div><b>Regrouper les alertes rapprochées</b><small>Plusieurs alertes en peu de temps partent en un seul message.</small></div>${sel('groupSec', [[0, 'Jamais'], [60, 'Sur 1 min'], [120, 'Sur 2 min'], [300, 'Sur 5 min']], st.groupSec == null ? 60 : st.groupSec)}</div>
    <div class="sup-rule"><div><b>Heures calmes</b><small>Les alertes non critiques attendent la fin de la plage et partent en un résumé. Les pannes partent toujours.</small></div><div class="sup-quiet">${sel('quietFrom', [[-1, 'Désactivées'], ...Array.from({ length: 24 }, (_, h) => [h, `De ${h} h`])], st.quietFrom == null ? -1 : st.quietFrom)}${sel('quietTo', Array.from({ length: 24 }, (_, h) => [h, `à ${h} h`]), st.quietTo == null || st.quietTo < 0 ? 7 : st.quietTo)}</div></div>
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
      <td>${a.muted ? '<span class="sup-chip">Sourdine</span>' : a.quiet && !(a.results && a.results.length) ? '<span class="sup-chip">Heures calmes</span>' : a.results == null ? '<span class="muted">Envoi…</span>' : a.results.length ? a.results.map((r) => `<span class="sup-chip ${r.ok ? 'good' : 'bad'}" ${r.ok ? '' : `data-tip="${esc(r.error || '')}"`}>${esc(channelLabel(r.channel, hooks))}</span>`).join('') : '<span class="muted" data-tip="Activez les alertes par e-mail ou ajoutez un webhook pour les recevoir.">Aucun envoi</span>'}</td>
    </tr>`).join('');
  // NEXORA #048 : webhooks (messagerie d'équipe, outil d'astreinte, automatisation…).
  const hooksHtml = `<div class="sup-hooks">${hooks.length ? hooks.map((h) => `<div class="sup-hook ${h.enabled ? '' : 'off'}" data-hook="${esc(h.id)}">
      <span class="sup-hook-i">${icon('link', 14)}</span><span class="sup-hook-t"><b>${esc(h.name)}</b><small>${esc(hookKindLabel(h.url))} · ${esc({ all: 'toutes les alertes', critical: 'alertes critiques seulement', escalation: 'escalades seulement' }[h.events] || '')}</small></span>
      <label class="tog-row tiny" title="Activer"><input type="checkbox" data-hook-on ${h.enabled ? 'checked' : ''}><span class="tog" aria-hidden="true"></span></label>
      <button type="button" class="icon-btn small" title="Envoyer un test" aria-label="Envoyer un test" data-hook-test>${icon('bell', 13)}</button>
      <button type="button" class="icon-btn small" title="Retirer" aria-label="Retirer" data-hook-del>${icon('trash', 13)}</button></div>`).join('') : '<p class="pop-note">Aucun webhook. Collez l’adresse fournie par Slack, Discord, Microsoft Teams, Google Chat, ntfy, ou celle de votre outil (format JSON).</p>'}
    <form class="sup-hook-add" data-hook-add autocomplete="off"><input class="input" name="url" placeholder="https://hooks.slack.com/services/…" spellcheck="false"><select class="input" name="events"><option value="all">Toutes les alertes</option><option value="critical">Critiques seulement</option><option value="escalation">Escalades seulement</option></select><button class="btn small primary">${icon('plus', 13)}<span>Ajouter</span></button></form>
  </div>`;
  ctx.afterRender = () => bind(ctx);
  return `<div class="sup-grid g-1-1 g-top">${card('Alertes par e-mail', channels, { sub: ready ? 'Prêt · les alertes partent tant que NEXORA est ouverte' : 'Activez les alertes par e-mail pour être prévenu' })}${card('Webhooks', hooksHtml, { sub: `${hooks.filter((h) => h.enabled).length} actif${hooks.filter((h) => h.enabled).length > 1 ? 's' : ''} · Slack, Discord, Teams, Google Chat, ntfy ou JSON` })}</div>
    <div class="sup-grid g-2-1 g-top">
      ${card('Journal des alertes', rows ? `<div class="sup-table-wrap sup-scroll"><table class="sup-table"><thead><tr><th>Date</th><th>Site</th><th>Type</th><th>Message</th><th>Envoi</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="sup-none">${icon('bell', 14)} Aucune alerte pour l’instant.</p>`, { sub: `${num(log.length)} alerte${log.length > 1 ? 's' : ''} (500 gardées au plus)` })}
      ${card('Règles', rules, { sub: 'Valables pour tous les sites (la confirmation se règle aussi site par site)' })}
    </div>
    ${card('Exporter vers Prometheus et Grafana', `<p class="pop-note">Pour suivre vos sites depuis votre propre serveur : NEXORA génère une configuration Prometheus, un tableau de bord Grafana et un fichier docker-compose, avec les instructions.</p>`, { actions: btn('Générer la configuration', 'data-al-export', { ic: 'download' }), cls: 'sup-card-quiet' })}`;
}

function hookKindLabel(url) {
  if (/hooks\.slack\.com/.test(url)) return 'Slack';
  if (/discord(app)?\.com\/api\/webhooks/.test(url)) return 'Discord';
  if (/webhook\.office\.com|logic\.azure\.com|powerplatform|powerautomate/.test(url)) return 'Microsoft Teams';
  if (/chat\.googleapis\.com/.test(url)) return 'Google Chat';
  if (/ntfy/.test(url)) return 'ntfy';
  try { return new URL(url).host; } catch { return 'Webhook'; }
}

async function saveHooks(ctx, mutate) {
  const cfg = await call('mon:config');
  const ch = { ...(cfg.channels || {}) };
  ch.webhooks = mutate((ch.webhooks || []).slice());
  await call('mon:set-channels', ch);
  ctx.show(true);
}

function bind(ctx) {
  const v = ctx.view;
  const add = v.querySelector('[data-hook-add]');
  if (add) add.onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(add);
    const url = String(fd.get('url') || '').trim();
    if (!/^https:\/\//i.test(url)) { toast('L’adresse du webhook doit commencer par https://.', { kind: 'bad' }); return; }
    try { await saveHooks(ctx, (l) => [...l, { id: Math.random().toString(36).slice(2, 9), name: hookKindLabel(url), url, events: fd.get('events'), enabled: true }]); toast('Webhook ajouté. Envoyez un test pour vérifier.'); } catch (err) { toast(err.message, { kind: 'bad' }); }
  };
  for (const row of v.querySelectorAll('[data-hook]')) {
    const id = row.dataset.hook;
    row.querySelector('[data-hook-on]').onchange = (ev) => saveHooks(ctx, (l) => l.map((h) => (h.id === id ? { ...h, enabled: ev.target.checked } : h))).catch((err) => toast(err.message, { kind: 'bad' }));
    row.querySelector('[data-hook-del]').onclick = () => saveHooks(ctx, (l) => l.filter((h) => h.id !== id)).then(() => toast('Webhook retiré.')).catch((err) => toast(err.message, { kind: 'bad' }));
    row.querySelector('[data-hook-test]').onclick = async (ev) => {
      const b = ev.currentTarget;
      b.disabled = true;
      try {
        const cfg = await call('mon:config');
        const h = ((cfg.channels || {}).webhooks || []).find((x) => x.id === id);
        await call('mon:test-webhook', { url: h.url });
        toast('Message de test envoyé : vérifiez sa réception.');
      } catch (err) { toast(err.message, { kind: 'bad' }); } finally { b.disabled = false; }
    };
  }
  // Après une connexion ou une déconnexion, la carte se met à jour (adresse, bouton de test).
  if (ctx.state.alertAccOff) ctx.state.alertAccOff();
  ctx.state.alertAccOff = onAccount(() => { if (v.isConnected && v.querySelector('[data-email-enabled]')) ctx.show(true); });
  const tog = v.querySelector('[data-email-enabled]');
  if (tog) tog.onchange = async () => {
    try {
      const cur = await call('mon:config'); await call('mon:set-channels', { ...(cur.channels || {}), email: { enabled: tog.checked } });
      toast(tog.checked ? 'Alertes par e-mail activées.' : 'Alertes par e-mail désactivées.');
      ctx.show(true);
    } catch (err) { toast(err.message, { kind: 'bad' }); }
  };
  const login = v.querySelector('[data-al-login]');
  if (login) login.onclick = () => { const b = document.getElementById('btnAccount'); if (b) b.click(); };
  for (const b of v.querySelectorAll('[data-al-test]')) b.onclick = async () => {
    const k = b.dataset.alTest;
    const out = v.querySelector(`[data-res="${k}"]`);
    b.disabled = true;
    if (out) { out.className = 'sup-ch-res busy'; out.innerHTML = '<span class="spinner small"></span> Envoi de l’e-mail de test…'; }
    let r;
    try { r = await call('mon:test-alert', k); } catch (err) { r = { ok: false, error: err.message }; } finally { b.disabled = false; }
    if (out) { out.className = `sup-ch-res ${r.ok ? 'good' : 'bad'}`; out.innerHTML = r.ok ? `${icon('check', 12)} ${esc(r.note || 'E-mail de test envoyé : vérifiez sa réception.')}` : `${icon('warn', 12)} ${esc(r.error)}`; }
  };
  for (const s of v.querySelectorAll('[data-rule]')) s.onchange = async () => {
    const val = s.type === 'checkbox' ? s.checked : Number(s.value);
    try {
      const st = await call('mon:set-settings', { [s.dataset.rule]: val });
      if (s.dataset.rule === 'quietFrom' || s.dataset.rule === 'quietTo') await saveAlertPrefs(st).catch(() => false);
      toast('Règle enregistrée.');
    } catch (err) { toast(err.message, { kind: 'bad' }); }
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
      if (dir) toast('Configuration générée. Ouvrez le fichier d’instructions (LISEZ-MOI) du dossier.');
    } catch (err) { toast(err.message, { kind: 'bad' }); }
  };
}
