// NEXORA #048 : « Visiteurs réels » : un petit script à ajouter à ton site mesure, chez tes vrais visiteurs,
// les Web Vitals (LCP, INP, CLS), le premier octet et les erreurs JavaScript. Résultats au 75e centile, comme
// Google. Données gardées par les serveurs NEXORA (31 jours en détail). Offre Pro (API et SDK).
import { esc, icon, toast, call, num, ms } from './util.js';
import { card, btn, kpi } from './ui.js';
import { Chart } from './charts.js';
import { account, rumSites, createRumSite, deleteRumSite, rumSummary, rumSnippet, outdated } from './cloud.js';

// Seuils de Google (bon / à améliorer / mauvais).
const VITALS = {
  lcp: ['Affichage principal (LCP)', 2500, 4000, ms, 'Temps avant que le plus grand élément de la page soit affiché.'],
  inp: ['Réactivité (INP)', 200, 500, ms, 'Délai entre un clic ou une touche et la réaction visible de la page.'],
  cls: ['Stabilité (CLS)', 0.1, 0.25, (v) => (v == null ? '—' : num(v, 3)), 'Décalages inattendus de la page pendant le chargement.'],
  ttfb: ['Premier octet (TTFB)', 800, 1800, ms, 'Temps de réponse du serveur, vu par tes visiteurs.'],
};
const toneOf = (k, v) => (v == null ? '' : v <= VITALS[k][1] ? 'good' : v <= VITALS[k][2] ? 'warn' : 'bad');

export async function renderRum(ctx) {
  const acc = account();
  if (!acc.signedIn || !acc.orgId) {
    ctx.afterRender = () => { const b = ctx.view.querySelector('[data-rum-login]'); if (b) b.onclick = () => { const x = document.getElementById('btnAccount'); if (x) x.click(); }; };
    return card('Visiteurs réels', `<p class="sup-note">${icon('user', 13)} Les tests de NEXORA mesurent ton site depuis un seul endroit. Avec un petit script (moins de 3 Ko) ajouté à tes pages, tu vois la vitesse et les erreurs telles que <b>tes vrais visiteurs</b> les vivent, sur leurs téléphones et leurs connexions. Connecte-toi à ton compte NEXORA pour commencer.</p><div class="nxs-actions">${btn('Se connecter', 'data-rum-login', { ic: 'user', cls: 'small primary' })}</div>`, { sub: 'Offre Pro' });
  }
  let data;
  try { data = await rumSites(); } catch (err) { return card('Visiteurs réels', `<p class="sup-note">${esc(outdated(err) || /pas encore disponible/.test(err.message) ? 'La mesure des visiteurs réels n’est pas encore disponible. Réessaie plus tard.' : err.message)}</p>`); }
  const list = data.list;
  if (!list.some((s) => s.id === ctx.state.rumId)) ctx.state.rumId = list[0] ? list[0].id : null;
  const site = list.find((s) => s.id === ctx.state.rumId);
  let sum = null;
  let err = '';
  if (site) { try { sum = await rumSummary(site.id, 168); } catch (x) { err = x.message; } }
  ctx.afterRender = () => bind(ctx, sum);
  const add = `<form class="sup-hook-add" data-rum-add autocomplete="off"><input class="input" name="origin" placeholder="https://ton-site.com" spellcheck="false" required><button class="btn small primary">${icon('plus', 13)}<span>Ajouter un site</span></button></form>`;
  if (!site) return card('Visiteurs réels', `<p class="pop-note">Ajoute ton site : NEXORA te donne une ligne à coller dans tes pages, juste avant &lt;/head&gt;. Les premières mesures arrivent dès les premières visites.</p>${add}`, { sub: 'Offre Pro · Web Vitals et erreurs JavaScript de tes visiteurs' });
  const v = (sum && sum.p75) || {};
  const total = (sum && sum.views) || 0;
  const kpis = Object.keys(VITALS).map((k) => kpi({ label: VITALS[k][0], ic: k === 'cls' ? 'layers' : 'clock', value: VITALS[k][3](v[k]), tone: toneOf(k, v[k]), hint: v[k] == null ? 'pas encore de mesure' : `bon sous ${VITALS[k][3](VITALS[k][1])}`, tip: VITALS[k][4] })).join('');
  const pages = (sum && sum.pages) || [];
  const errors = (sum && sum.errors) || [];
  const devices = (sum && sum.devices) || [];
  return `<div class="sup-rum-top"><div class="seg">${list.map((s) => `<button type="button" class="${s.id === site.id ? 'on' : ''}" data-rum-site="${esc(s.id)}">${esc(s.name)}</button>`).join('')}</div><span class="grow"></span>${add}</div>
    ${err ? `<p class="sup-note">${esc(err)}</p>` : ''}
    <div class="sup-kpis k5">${kpis}${kpi({ label: 'Pages vues (7 j)', ic: 'eye', value: num(total), hint: `${num((sum && sum.errors_total) || 0)} erreur(s) JavaScript` })}</div>
    ${card('Installation', `<p class="pop-note">Colle cette ligne dans le &lt;head&gt; de toutes tes pages. Elle ne ralentit pas ton site (chargement différé, envoi groupé en fin de visite) et ne collecte aucune donnée personnelle.</p><div class="sup-hb-u"><code>${esc(rumSnippet(site.key))}</code>${btn('Copier', 'data-rum-copy', { ic: 'copy' })}</div><div class="nxs-actions">${btn('Retirer ce site', 'data-rum-del', { ic: 'trash' })}</div>`, { sub: `${esc((site.origins || []).join(', ') || 'toutes les adresses')}`, cls: 'sup-card-quiet' })}
    ${card('Affichage principal au fil des jours', '<div data-chart="rum"></div>', { sub: '75e centile par heure, sur 7 jours' })}
    <div class="sup-grid g-2-1 g-top">
      ${card('Pages les plus lentes', pages.length ? `<div class="sup-table-wrap"><table class="sup-table dense"><thead><tr><th>Page</th><th class="num">Vues</th><th class="num">LCP</th><th class="num">INP</th><th class="num">CLS</th></tr></thead><tbody>${pages.map((p) => `<tr><td>${esc(p.path)}</td><td class="num">${num(p.views)}</td><td class="num ${toneOf('lcp', p.lcp)}">${ms(p.lcp)}</td><td class="num ${toneOf('inp', p.inp)}">${ms(p.inp)}</td><td class="num ${toneOf('cls', p.cls)}">${p.cls == null ? '—' : num(p.cls, 3)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sup-none">Pas encore de visites mesurées.</p>')}
      ${card('Appareils', devices.length ? `<div class="sup-hbars">${devices.map((d) => `<div class="sup-hbar"><span>${esc({ mobile: 'Téléphone', tablet: 'Tablette', desktop: 'Ordinateur' }[d.device] || d.device)}</span><div><i class="good" style="width:${Math.max(2, (d.views / Math.max(1, total)) * 100)}%"></i></div><b>${num(d.views)}</b><small>${ms(d.lcp)}</small></div>`).join('')}</div>` : '<p class="sup-none">—</p>')}
    </div>
    ${card('Erreurs JavaScript de tes visiteurs', errors.length ? `<div class="sup-list">${errors.map((e) => `<div class="sup-erow bad">${icon('warn', 13)}<div><b>${esc(e.message)}</b><small>${esc(e.source || '')} · ${num(e.count)} fois · ${esc(e.path || '')}</small></div></div>`).join('')}</div>` : `<p class="sup-none">${icon('pass', 14)} Aucune erreur remontée sur 7 jours.</p>`)}`;
}

function bind(ctx, sum) {
  const v = ctx.view;
  const add = v.querySelector('[data-rum-add]');
  if (add) add.onsubmit = async (ev) => {
    ev.preventDefault();
    let o = String(new FormData(add).get('origin') || '').trim();
    if (!/^https?:\/\//i.test(o)) o = `https://${o}`;
    try { const u = new URL(o); const s = await createRumSite({ name: u.host, origin: u.origin }); ctx.state.rumId = s.id; toast('Site ajouté : copie la ligne d’installation dans tes pages.'); ctx.show(true); } catch (err) { toast(err.message || 'Adresse invalide.', { kind: 'bad' }); }
  };
  for (const b of v.querySelectorAll('[data-rum-site]')) b.onclick = () => { ctx.state.rumId = b.dataset.rumSite; ctx.show(); };
  const cp = v.querySelector('[data-rum-copy]');
  if (cp) cp.onclick = () => call('clipboard:write', v.querySelector('.sup-hb-u code').textContent).then(() => toast('Ligne copiée.')).catch(() => {});
  const del = v.querySelector('[data-rum-del]');
  if (del) del.onclick = async () => { try { await deleteRumSite(ctx.state.rumId); ctx.state.rumId = null; toast('Site retiré.'); ctx.show(true); } catch (err) { toast(err.message, { kind: 'bad' }); } };
  const el = v.querySelector('[data-chart="rum"]');
  if (el && sum) {
    const pts = (sum.series || []).map((p) => ({ t: Date.parse(p.t), v: p.lcp }));
    const to = Date.now(); const from = to - 7 * 86400e3;
    ctx.charts.push(new Chart(el, { height: 200, from, to, step: 3600e3, yFmt: ms, label: 'LCP au 75e centile', empty: 'Les mesures arrivent dès les premières visites.', thresholds: [{ value: 2500, label: 'Bon sous 2,5 s', color: 'var(--ok-dot)' }], thresholdInScale: false, series: [{ id: 'lcp', name: 'LCP (p75)', color: 'var(--accent)', type: 'area', points: pts }] }));
  }
}
