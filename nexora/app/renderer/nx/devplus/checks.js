// NEXORA #052 : contrôles avant mise en ligne : rendu sur téléphone, tablette et ordinateur, vitesse,
// débordements, erreurs de console, audit de sécurité ; seuils réglables. Réservé à l'offre Pro.
import { api, esc, ico, call, head, btn, pill, spinner, toast, has, proGate, fmtMs, fmtBytes, prefs, savePrefs, ago } from './ui.js';

const DEFAULTS = { lcp: 2500, cls: 0.1, overflow: true, consoleErrors: 0, security: 70 };
const isLocal = (u) => /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\]|[\w-]+\.nexora)(:|\/|$)/i.test(u || '');
export const thresholds = () => ({ ...DEFAULTS, ...(prefs().thresholds || {}) });

// Contrôles complets : appareils (processus principal) et sécurité (audit existant, sites en ligne seulement).
export async function runAll(url) {
  const th = thresholds();
  const res = await call('devx:checks-run', { url, thresholds: th });
  if (!isLocal(url)) {
    try { const s = await api.invoke('sec:scan', { url }); res.security = { score: s.score, ok: s.score == null || s.score >= th.security }; if (!res.security.ok) res.ok = false; } catch (e) { res.security = { error: String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }; }
  }
  prefs().lastChecks = { url, ok: res.ok, at: Date.now() };
  savePrefs();
  return res;
}
// Après un envoi Git (réglage « Contrôler après chaque envoi »).
export async function background(ctx) {
  const url = ctx.url();
  if (!url) return;
  try {
    const r = await runAll(url);
    toast(r.ok ? 'Contrôles après envoi : tout est bon.' : 'Contrôles après envoi : des seuils ne sont pas atteints.', { kind: r.ok ? undefined : 'bad', action: 'Voir', onAction: () => ctx.open('checks', { result: r }) });
  } catch { /* message affiché */ }
}

export function mount(el, ctx) {
  const st = { url: ctx.url() || '', res: null, busy: false, editTh: false };
  const render = () => {
    if (!has('devlab_pro')) { el.innerHTML = `${head('Contrôles avant mise en ligne', '')}${proGate('Les contrôles avant mise en ligne', 'Rendu sur téléphone, tablette et ordinateur, vitesse d’affichage, débordements, erreurs et sécurité, avec des seuils à ne pas dépasser.')}`; return; }
    const th = thresholds();
    const r = st.res;
    const thForm = `<div class="nxd-th"><label>Affichage principal (LCP) max <input class="input" type="number" step="100" data-th="lcp" value="${th.lcp}"> ms</label><label>Décalages de mise en page (CLS) max <input class="input" type="number" step="0.01" data-th="cls" value="${th.cls}"></label><label>Erreurs de console max <input class="input" type="number" data-th="consoleErrors" value="${th.consoleErrors}"></label><label>Score de sécurité min <input class="input" type="number" data-th="security" value="${th.security}"> / 100</label><label class="nxd-check"><input type="checkbox" data-th="overflow" ${th.overflow ? 'checked' : ''}> Refuser une page qui déborde en largeur</label></div>`;
    const device = (d) => `<div class="nxd-device ${d.ok ? 'ok' : 'bad'}"><div class="nxd-device-h">${ico(d.id === 'phone' ? 'phone' : d.id === 'tablet' ? 'tablet' : 'laptop', 15)}<b>${esc(d.name)}</b><small>${d.width} × ${d.height}</small>${pill(d.ok ? 'conforme' : 'à corriger', d.ok ? 'ok' : 'bad')}</div>${d.shot ? `<img class="nxd-shot" src="${d.shot}" alt="Aperçu sur ${esc(d.name)}">` : ''}${d.metrics ? `<div class="nxd-metrics"><span>Affichage <b>${fmtMs(d.metrics.lcp)}</b></span><span>Décalages <b>${d.metrics.cls.toFixed(2)}</b></span><span>Premier octet <b>${fmtMs(d.metrics.ttfb)}</b></span><span>Requêtes <b>${d.metrics.requests}</b></span><span>Poids <b>${fmtBytes(d.metrics.bytes)}</b></span><span>Images sans texte <b>${d.metrics.imagesNoAlt}</b></span></div>` : ''}${d.fails.length ? `<ul class="nxd-fails">${d.fails.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}${d.errors && d.errors.length ? `<details class="nxd-details"><summary>Erreurs de console (${d.errors.length})</summary><pre class="nxd-console">${esc(d.errors.join('\n'))}</pre></details>` : ''}</div>`;
    el.innerHTML = `${head('Contrôles avant mise en ligne', r ? `${r.ok ? `${ico('pass', 12)} Tout est bon` : `${ico('warn', 12)} Des seuils ne sont pas atteints`} · ${ago(r.at)}` : 'Charge la page comme un visiteur sur trois appareils et vérifie qu’elle tient tes seuils.', btn(st.editTh ? 'Fermer les seuils' : 'Seuils', 'data-act="th"', 'ruler'))}
      <div class="nxd-row"><input class="input nxd-grow" data-url value="${esc(st.url)}" placeholder="http://localhost:5173 ou adresse du site en ligne" spellcheck="false">${btn(st.busy ? 'Contrôles en cours…' : 'Lancer les contrôles', `data-act="run" ${st.busy ? 'disabled' : ''}`, 'shield', 'primary')}</div>
      <label class="nxd-check"><input type="checkbox" data-act="after-push" ${prefs().checksAfterPush ? 'checked' : ''}> Contrôler après chaque envoi Git (adresse du serveur lancé)</label>
      ${st.editTh ? thForm : ''}
      ${st.busy && !r ? spinner('Chargement de la page sur trois appareils…') : ''}
      ${!r && !st.busy ? `<div class="nxd-empty">${ico('shield', 26)}<b>Aucun contrôle pour l’instant</b><p>${st.url ? 'Lance les contrôles sur l’adresse ci-dessus.' : 'Lance le projet (onglet Scripts), ou colle l’adresse du site.'}</p></div>` : ''}
      ${r ? `<div class="nxd-devices">${r.devices.map(device).join('')}</div><div class="nxd-note ${r.security && r.security.ok === false ? 'bad' : ''}">${ico('shield', 16)}<div><b>Sécurité</b><p>${r.security ? (r.security.error ? esc(r.security.error) : `Score ${r.security.score ?? '—'} / 100 (seuil ${th.security}).`) : 'Audit de sécurité fait sur le site en ligne seulement (adresse locale).'}</p></div></div>` : ''}`;
  };
  const run = async () => {
    const i = el.querySelector('[data-url]');
    st.url = (i ? i.value : st.url).trim();
    if (!st.url) { toast('Indique l’adresse à contrôler.'); return; }
    st.busy = true; render();
    try { st.res = await runAll(st.url); } catch { /* message affiché */ }
    st.busy = false; render();
  };
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="run"]')) run();
    if (e.target.closest('[data-act="th"]')) { st.editTh = !st.editTh; render(); }
  });
  el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-act="after-push"]')) { prefs().checksAfterPush = t.checked; savePrefs(); }
    if (t.dataset.th) { const p = prefs(); p.thresholds = { ...thresholds(), [t.dataset.th]: t.type === 'checkbox' ? t.checked : Number(t.value) }; savePrefs(); }
  });
  ctx.bus.addEventListener('url', (e) => { if (!st.url) { st.url = e.detail; if (el.isConnected) render(); } });
  render();
  return { show: (opts = {}) => { if (opts.url) st.url = opts.url; if (opts.result) st.res = opts.result; render(); }, run };
}
