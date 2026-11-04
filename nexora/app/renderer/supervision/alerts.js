// NEXORA #015 : alertes de la supervision (règles de déclenchement, sourdine générale, journal des alertes
// envoyées) et export vers Prometheus + Grafana.
// NEXORA #030 : un seul canal, l'e-mail par Brevo, envoyé par les serveurs NEXORA à l'adresse du compte
// connecté (rien à régler ici) ; Telegram, WhatsApp et le SMTP à saisir soi-même sont retirés.
import { call, esc, icon, num, time, dateTime, toast, ALERT_KIND, CHANNEL } from './util.js';
import { card, btn } from './ui.js';
import { account, onAccount } from './cloud.js';

export async function renderAlerts(ctx) {
  const [cfg, log] = await Promise.all([call('mon:config'), call('mon:alerts-log', { limit: 200 }).catch(() => [])]);
  ctx.state.alertCfg = cfg;
  const em = (cfg.channels && cfg.channels.email) || {};
  const st = cfg.settings || { confirm: 2, slowConfirm: 3, repeatMin: 60, certDays: 14, notifyRecovery: true, silenceUntil: 0 };
  const acc = account();
  const ready = Boolean(em.enabled && acc.signedIn);
  const chip = ready ? `<span class="sup-chip good">${icon('check', 11)}Prêt</span>`
    : em.enabled ? '<span class="sup-chip warn">Connexion requise</span>' : '<span class="sup-chip">Désactivé</span>';
  const channels = `<div class="sup-chs sup-chs-one">
    <div class="sup-ch ${ready ? 'on' : ''}">
      <div class="sup-ch-h">${icon('mail', 15)}<b>E-mail (Brevo)</b>${chip}</div>
      <p class="pop-note">${acc.signedIn ? `Les alertes partent par les serveurs NEXORA vers <b>${esc(acc.email)}</b>, l’adresse de ton compte.` : 'Connecte-toi à ton compte NEXORA : les alertes partent par les serveurs NEXORA vers l’adresse de ton compte.'}</p>
      <label class="tog-row"><span class="tog-text"><span>Recevoir les alertes par e-mail</span><small>Panne, lenteur, erreurs de page, certificat et retour à la normale, selon les règles ci-dessous.</small></span><input type="checkbox" data-email-enabled ${em.enabled ? 'checked' : ''}><span class="tog" aria-hidden="true"></span></label>
      <div class="sup-ch-f">${acc.signedIn ? btn('Envoyer un e-mail de test', 'data-al-test="email"', { ic: 'bell' }) : btn('Se connecter', 'data-al-login', { ic: 'user', cls: 'primary' })}<span class="sup-ch-res" data-res="email"></span></div>
      <details><summary>Comment ça marche ?</summary><ul class="mon-steps"><li>Rien à configurer chez toi : l’envoi passe par Brevo depuis les serveurs NEXORA.</li><li>Jusqu’à 20 alertes par heure et 60 par jour ; au-delà, elles restent dans NEXORA.</li><li>Les alertes partent tant que NEXORA est ouverte. Pour être prévenu même NEXORA fermée, active « Surveiller aussi 24 h/24 par les serveurs NEXORA » dans les réglages du site.</li></ul></details>
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
      <td>${a.muted ? '<span class="sup-chip">Sourdine</span>' : a.results == null ? '<span class="muted">Envoi…</span>' : a.results.some((r) => CHANNEL[r.channel]) ? a.results.filter((r) => CHANNEL[r.channel]).map((r) => `<span class="sup-chip ${r.ok ? 'good' : 'bad'}" ${r.ok ? '' : `data-tip="${esc(r.error || '')}"`}>${esc(CHANNEL[r.channel] || r.channel)}</span>`).join('') : '<span class="muted" data-tip="Active les alertes par e-mail ci-dessus pour les recevoir.">Aucun envoi</span>'}</td>
    </tr>`).join('');
  ctx.afterRender = () => bind(ctx);
  return `${card('Alertes par e-mail', channels, { sub: ready ? 'Prêt · les alertes partent tant que NEXORA est ouverte' : 'Active les alertes par e-mail pour être prévenu' })}
    <div class="sup-grid g-2-1 g-top">
      ${card('Journal des alertes', rows ? `<div class="sup-table-wrap sup-scroll"><table class="sup-table"><thead><tr><th>Date</th><th>Site</th><th>Type</th><th>Message</th><th>Envoi</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="sup-none">${icon('bell', 14)} Aucune alerte pour l’instant.</p>`, { sub: `${num(log.length)} alerte${log.length > 1 ? 's' : ''} (500 gardées au plus)` })}
      ${card('Règles', rules, { sub: 'Valables pour tous les sites (la confirmation se règle aussi site par site)' })}
    </div>
    ${card('Exporter vers Prometheus et Grafana', `<p class="pop-note">Pour suivre tes sites depuis ton propre serveur : NEXORA génère une configuration Prometheus, un tableau de bord Grafana et un fichier docker-compose, avec les instructions.</p>`, { actions: btn('Générer la configuration', 'data-al-export', { ic: 'download' }), cls: 'sup-card-quiet' })}`;
}

function bind(ctx) {
  const v = ctx.view;
  // Après une connexion ou une déconnexion, la carte se met à jour (adresse, bouton de test).
  if (ctx.state.alertAccOff) ctx.state.alertAccOff();
  ctx.state.alertAccOff = onAccount(() => { if (v.isConnected && v.querySelector('[data-email-enabled]')) ctx.show(true); });
  const tog = v.querySelector('[data-email-enabled]');
  if (tog) tog.onchange = async () => {
    try {
      await call('mon:set-channels', { email: { enabled: tog.checked } });
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
    if (out) { out.className = 'sup-ch-res busy'; out.innerHTML = '<span class="spinner small"></span> Envoi du test par Brevo…'; }
    let r;
    try { r = await call('mon:test-alert', k); } catch (err) { r = { ok: false, error: err.message }; } finally { b.disabled = false; }
    if (out) { out.className = `sup-ch-res ${r.ok ? 'good' : 'bad'}`; out.innerHTML = r.ok ? `${icon('check', 12)} ${esc(r.note || 'E-mail de test envoyé : vérifie sa réception.')}` : `${icon('warn', 12)} ${esc(r.error)}`; }
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
