// NEXORA #015 : tests de charge k6 (scénarios, plusieurs pages, seuils), suivi en direct seconde par
// seconde, résultats détaillés par page, historique et comparaison de deux tests.
import { call, esc, icon, num, ms, bytes, dur, dateTime, host, toast, PALETTE, sheet, closeSheet } from './util.js';
import { Chart } from './charts.js';
import { kpi, card, btn, iconBtn, confirmSheet } from './ui.js';

const SCEN = [
  ['smoke', 'Vérification rapide', 'Un seul visiteur : vérifie que tout répond avant un vrai test.'],
  ['load', 'Charge', 'Montée progressive jusqu’au nombre de visiteurs choisi, puis palier.'],
  ['stress', 'Stress', 'Paliers jusqu’au double de la charge pour trouver la limite du site.'],
  ['spike', 'Pic soudain', 'Afflux brutal de visiteurs (lancement, publicité), puis retour au calme.'],
  ['soak', 'Endurance', 'Charge constante longtemps : fuites de mémoire, lenteurs qui s’installent.'],
];
const DURATIONS = [['20s', '20 s'], ['30s', '30 s'], ['1m', '1 min'], ['3m', '3 min'], ['5m', '5 min'], ['10m', '10 min'], ['30m', '30 min'], ['1h', '1 h']];

const secs = (d) => { const m = /^(\d+)(s|m|h)?$/.exec(String(d || '')); return m ? Number(m[1]) * (m[2] === 'h' ? 3600 : m[2] === 'm' ? 60 : 1) : 30; };

// Mêmes paliers que src/loadtest.js (plan) : aperçu de la forme du scénario.
function plan(scenario, vus, duration) {
  const v = Math.max(1, Math.min(2000, Math.round(Number(vus) || 10)));
  const d = Math.max(10, secs(duration));
  const st = (s, t) => [Math.max(1, Math.round(s)), Math.max(0, Math.round(t))];
  const low = Math.max(1, v * 0.1);
  switch (scenario) {
    case 'smoke': return [st(2, 1), st(d, 1)];
    case 'stress': return [st(d / 8, v * 0.5), st(d / 8, v * 0.5), st(d / 8, v), st(d / 8, v), st(d / 8, v * 1.5), st(d / 8, v * 1.5), st(d / 8, v * 2), st(d / 8, v * 2), st(10, 0)];
    case 'spike': return [st(10, low), st(d * 0.2, low), st(5, v), st(d * 0.4, v), st(5, low), st(d * 0.3, low), st(5, 0)];
    case 'soak': return [st(Math.max(30, d * 0.1), v), st(d, v), st(30, 0)];
    default: return [st(Math.max(5, d * 0.2), v), st(d, v), st(Math.max(5, d * 0.1), 0)];
  }
}

function shape(stages, w = 132, h = 34) {
  const total = stages.reduce((a, s) => a + s[0], 0) || 1;
  const max = Math.max(1, ...stages.map((s) => s[1]));
  let t = 0;
  let d = `M1,${h - 1}`;
  for (const [s, v] of stages) { t += s; d += `L${(1 + (t / total) * (w - 2)).toFixed(1)},${(h - 1 - (v / max) * (h - 4)).toFixed(1)}`; }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="sup-shape"><path d="${d}L${w - 1},${h - 1}Z" fill="currentColor" opacity=".14"/><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

function form(ctx) {
  if (!ctx.state.lt) ctx.state.lt = { urls: ctx.siteUrl() || '', scenario: 'load', vus: 20, duration: '1m', thinkSec: 1, p95Ms: 1000, errPct: 1, name: '' };
  return ctx.state.lt;
}

export async function renderLoad(ctx) {
  const f = form(ctx);
  const [hist, running] = await Promise.all([call('mon:loadtests').catch(() => []), call('mon:loadtest-running').catch(() => false)]);
  ctx.state.ltHistory = hist;
  if (running && !ctx.state.ltLive) ctx.state.ltLive = { points: [], running: true, label: 'Test en cours (lancé avant l’ouverture de cette vue)…', total: 0, elapsed: 0 };
  const live = ctx.state.ltLive;
  // Dernier test affiché d'office (tant que l'utilisateur ne l'a pas fermé).
  if (!ctx.state.ltResult && !ctx.state.ltClosed && hist.length) ctx.state.ltResult = hist[0];
  const res = ctx.state.ltResult;
  const stages = plan(f.scenario, f.vus, f.duration);
  const total = stages.reduce((a, s) => a + s[0], 0);
  const cfg = card('Configurer un test', `<form class="sup-lt" data-lt-form autocomplete="off">
      <label class="field"><span>Pages à visiter (une adresse par ligne, dans l’ordre du parcours)</span><textarea class="input" rows="2" name="urls" placeholder="https://ton-site.com&#10;https://ton-site.com/contact" spellcheck="false">${esc(f.urls)}</textarea></label>
      <div class="field"><span>Scénario</span><div class="sup-scen">${SCEN.map(([id, label, txt]) => `<button type="button" class="sup-scen-tile ${f.scenario === id ? 'on' : ''}" data-scen="${id}">${shape(plan(id, f.vus, f.duration))}<b>${esc(label)}</b><small>${esc(txt)}</small></button>`).join('')}</div></div>
      <div class="sup-form-grid four">
        <label class="field"><span>Visiteurs simultanés${f.scenario === 'stress' ? ' (palier de base)' : ''}</span><input class="input" type="number" name="vus" min="1" max="2000" value="${esc(f.vus)}" ${f.scenario === 'smoke' ? 'disabled' : ''}></label>
        <label class="field"><span>Durée du palier</span><select class="input" name="duration">${DURATIONS.map(([v, l]) => `<option value="${v}" ${f.duration === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Pause entre deux pages (s)</span><input class="input" type="number" name="thinkSec" min="0" max="30" step="0.5" value="${esc(f.thinkSec)}"></label>
        <label class="field"><span>Nom du test</span><input class="input" name="name" value="${esc(f.name)}" placeholder="Facultatif"></label>
        <label class="field"><span>Seuil p95 (ms)</span><input class="input" type="number" name="p95Ms" min="50" step="50" value="${esc(f.p95Ms)}"></label>
        <label class="field"><span>Erreurs tolérées (%)</span><input class="input" type="number" name="errPct" min="0" max="100" step="0.5" value="${esc(f.errPct)}"></label>
      </div>
      <div class="sup-lt-foot"><small class="muted">${icon('clock', 12)} Durée totale prévue : <b>${dur(total * 1000)}</b> · jusqu’à <b>${num(Math.max(...stages.map((s) => s[1])))}</b> visiteurs simultanés. Teste uniquement <b>tes propres sites</b>.</small>
      ${live ? `<button type="button" class="btn danger-soft" data-lt="stop">${icon('stop', 13)}<span>Arrêter le test</span></button>` : `<button type="submit" class="btn primary">${icon('bolt', 14)}<span>Lancer le test</span></button>`}</div>
    </form>`, { sub: 'Moteur k6 (Grafana), téléchargé une seule fois' });
  const livePanel = live ? liveHtml(live, f) : '';
  const resPanel = !live && res ? resultHtml(res) : '';
  const histPanel = card('Historique des tests', historyHtml(ctx, hist, res), { sub: `${hist.length} test${hist.length > 1 ? 's' : ''} gardé${hist.length > 1 ? 's' : ''} (30 au plus)`, actions: ctx.state.ltCompare && ctx.state.ltCompare.length === 2 ? btn('Effacer la comparaison', 'data-lt="uncompare"', { ic: 'close' }) : '' });
  const cmp = compareHtml(ctx, hist);
  ctx.afterRender = () => { bind(ctx); mountCharts(ctx); };
  return `${livePanel}${resPanel}${cmp}<div class="sup-grid g-1-1 g-top">${cfg}${histPanel}</div>`;
}

function liveHtml(live, f) {
  const last = live.points[live.points.length - 1] || {};
  const pctDone = live.total ? Math.min(100, Math.round((live.elapsed / live.total) * 100)) : 0;
  return card('Test en cours', `<div class="sup-lt-live">
      <div class="sup-progress"><i style="width:${pctDone}%"></i></div>
      <div class="sup-lt-status"><span class="spinner small"></span><span data-lt-label>${esc(live.label || 'Test de charge en cours')}</span><span class="grow"></span><small class="muted" data-lt-time>${live.total ? `${dur(live.elapsed * 1000)} / ${dur(live.total * 1000)}` : ''}</small></div>
      <div class="sup-kpis k5" data-lt-kpis>${liveKpis(last, f)}</div>
      <div class="sup-grid g-1-1"><div><h4 class="sup-h4">Visiteurs et requêtes par seconde</h4><div data-chart="lt-load"></div></div><div><h4 class="sup-h4">Temps de réponse</h4><div data-chart="lt-lat"></div></div></div>
    </div>`, { cls: 'sup-live-card' });
}

function liveKpis(p, f) {
  return [
    kpi({ label: 'Visiteurs', ic: 'user', value: num(p.vus || 0) }),
    kpi({ label: 'Requêtes / s', ic: 'bolt', value: num(p.rps || 0) }),
    kpi({ label: 'p95', ic: 'clock', value: ms(p.p95), tone: p.p95 != null && p.p95 > f.p95Ms ? 'bad' : '' }),
    kpi({ label: 'Médiane', ic: 'clock', value: ms(p.p50) }),
    kpi({ label: 'Erreurs', ic: 'warn', value: `${num(p.err || 0, 1)} %`, tone: (p.err || 0) > f.errPct ? 'bad' : '' }),
  ].join('');
}

function verdictText(r) {
  if (r.failRate < 1 && r.p95 < 1000) return 'Ton site tient bien la charge testée.';
  if (r.failRate >= 5) return 'Beaucoup d’erreurs : le site sature à cette charge. Regarde à partir de combien de visiteurs les erreurs apparaissent sur le graphique.';
  return 'Temps de réponse élevé sous charge : pense à un cache (pages, images), à des données mieux organisées ou à plus de ressources serveur.';
}

function resultHtml(r) {
  const ok = r.pass && r.pass.p95 && r.pass.err;
  const fails = [];
  if (r.pass && !r.pass.p95) fails.push(`p95 ${ms(r.p95)} au-dessus du seuil de ${ms(r.thresholds.p95Ms)}`);
  if (r.pass && !r.pass.err) fails.push(`${num(r.failRate, 1)} % d’erreurs pour ${num(r.thresholds.errPct, 1)} % tolérés`);
  const kpis = [
    kpi({ label: 'Requêtes / s', ic: 'bolt', value: num(r.rps, 1), hint: `Pic : ${num(r.peakRps)} / s` }),
    kpi({ label: 'p95', ic: 'clock', value: ms(r.p95), tone: r.pass && !r.pass.p95 ? 'bad' : 'good', hint: `p99 ${ms(r.p99)} · max ${ms(r.max)}` }),
    kpi({ label: 'Médiane', ic: 'clock', value: ms(r.med), hint: `Moyenne ${ms(r.avg)} · min ${ms(r.min)}` }),
    kpi({ label: 'Erreurs', ic: 'warn', value: `${num(r.failRate, 1)} %`, tone: r.pass && !r.pass.err ? 'bad' : 'good', hint: r.checks != null ? `${num(r.checks, 1)} % de réponses valides` : '' }),
    kpi({ label: 'Requêtes', ic: 'globe', value: num(r.requests), hint: `${bytes(r.dataRecv)} reçus` }),
    kpi({ label: 'Visiteurs max.', ic: 'user', value: num(r.vus), hint: `${esc(r.scenarioLabel || '')} · ${dur(r.total * 1000)}` }),
  ].join('');
  const per = r.perUrl && r.perUrl.length > 1 ? `<h4 class="sup-h4">Par page</h4><div class="sup-table-wrap"><table class="sup-table dense"><thead><tr><th>Page</th><th class="num">Requêtes</th><th class="num">Moyenne</th><th class="num">p95</th><th class="num">Erreurs</th></tr></thead><tbody>${r.perUrl.map((u) => `<tr><td class="sup-reason">${esc(u.url)}</td><td class="num">${num(u.n)}</td><td class="num">${ms(u.avg)}</td><td class="num">${ms(u.p95)}</td><td class="num ${u.failRate > (r.thresholds ? r.thresholds.errPct : 1) ? 'bad' : ''}">${num(u.failRate, 1)} %</td></tr>`).join('')}</tbody></table></div>` : '';
  return card(`Résultat${r.name ? ` · ${r.name}` : ''}`, `<div class="sup-verdict ${ok ? 'good' : 'bad'}">${icon(ok ? 'pass' : 'warn', 16)}<div><b>${ok ? 'Seuils respectés' : 'Seuils dépassés'}</b><small>${esc(fails.join(' ; ') || verdictText(r))}</small></div>${r.stopped ? '<span class="sup-chip warn">Arrêté avant la fin</span>' : ''}</div>
    <div class="sup-kpis k6">${kpis}</div>
    <div class="sup-grid g-1-1"><div><h4 class="sup-h4">Visiteurs et requêtes par seconde</h4><div data-chart="lt-load"></div></div><div><h4 class="sup-h4">Temps de réponse</h4><div data-chart="lt-lat"></div></div></div>
    <div class="sup-grid g-1-1"><div><h4 class="sup-h4">Erreurs par seconde</h4><div data-chart="lt-err"></div></div><div>${per || `<h4 class="sup-h4">À retenir</h4><p class="sup-advice">${esc(verdictText(r))}</p>`}</div></div>`, { sub: `${esc(r.urls.map(host).filter((v, i, a) => a.indexOf(v) === i).join(', '))} · ${esc(dateTime(r.at))}`, actions: btn('Fermer', 'data-lt="close-result"', { ic: 'close' }) });
}

function historyHtml(ctx, hist, shown) {
  if (!hist.length) return '<p class="sup-none">Aucun test pour l’instant : lance-en un pour mesurer la tenue de ton site.</p>';
  const sel = new Set(ctx.state.ltCompare || []);
  return `<div class="sup-table-wrap"><table class="sup-table dense"><thead><tr><th></th><th>Test</th><th class="num">Visiteurs</th><th class="num">Req./s</th><th class="num">p95</th><th class="num">Erreurs</th><th>Seuils</th><th></th></tr></thead><tbody>${hist.map((r) => {
    const ok = r.pass ? r.pass.p95 && r.pass.err : r.failRate < 1;
    return `<tr class="${shown && shown.id === r.id ? 'sel' : ''}"><td><label class="sup-cmp" data-tip="Comparer (deux tests)"><input type="checkbox" data-lt-cmp="${esc(r.id)}" ${sel.has(r.id) ? 'checked' : ''}></label></td>
      <td class="click" data-lt-open="${esc(r.id)}"><b>${esc(r.name || r.scenarioLabel || 'Test')}</b><small>${esc(r.scenarioLabel || '')} · ${esc(host(r.url))} · ${esc(dateTime(r.at))}</small></td>
      <td class="num">${num(r.vus)}</td><td class="num">${num(r.rps, 1)}</td><td class="num">${ms(r.p95)}</td><td class="num">${num(r.failRate, 1)} %</td>
      <td>${ok ? '<span class="sup-chip good">Respectés</span>' : '<span class="sup-chip bad">Dépassés</span>'}</td>
      <td class="nowrap">${iconBtn('trash', 'Supprimer ce test', `data-lt-del="${esc(r.id)}"`)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function compareHtml(ctx, hist) {
  const ids = ctx.state.ltCompare || [];
  if (ids.length !== 2) return '';
  const runs = ids.map((id) => hist.find((r) => r.id === id)).filter(Boolean);
  if (runs.length !== 2) return '';
  const [a, b] = runs;
  const row = (label, va, vb, fmt, better = 'low') => {
    const diff = va && vb ? ((vb - va) / va) * 100 : null;
    const good = diff == null ? '' : (better === 'low' ? diff <= 0 : diff >= 0) ? 'good' : 'bad';
    return `<tr><td>${esc(label)}</td><td class="num">${fmt(va)}</td><td class="num">${fmt(vb)}</td><td class="num ${good}">${diff == null ? '—' : `${diff > 0 ? '+' : ''}${num(diff, 1)} %`}</td></tr>`;
  };
  ctx.state.ltCmpRuns = runs;
  return card('Comparaison de deux tests', `<div class="sup-grid g-1-1"><div><h4 class="sup-h4">p95 au fil du test</h4><div data-chart="cmp-lat"></div></div><div><h4 class="sup-h4">Requêtes par seconde</h4><div data-chart="cmp-rps"></div></div></div>
    <div class="sup-table-wrap"><table class="sup-table dense"><thead><tr><th></th><th class="num"><i class="sup-sw" style="background:${PALETTE[0]}"></i>${esc(a.name || a.scenarioLabel)} · ${esc(dateTime(a.at))}</th><th class="num"><i class="sup-sw" style="background:${PALETTE[3]}"></i>${esc(b.name || b.scenarioLabel)} · ${esc(dateTime(b.at))}</th><th class="num">Écart</th></tr></thead><tbody>
      ${row('Requêtes / s', a.rps, b.rps, (v) => num(v, 1), 'high')}${row('Médiane', a.med, b.med, ms)}${row('p95', a.p95, b.p95, ms)}${row('p99', a.p99, b.p99, ms)}${row('Erreurs (%)', a.failRate, b.failRate, (v) => `${num(v, 1)} %`)}${row('Visiteurs max.', a.vus, b.vus, (v) => num(v), 'high')}
    </tbody></table></div>`, { sub: 'Courbes alignées sur le début de chaque test' });
}

function mountCharts(ctx) {
  const live = ctx.state.ltLive;
  const r = !live ? ctx.state.ltResult : null;
  const f = form(ctx);
  const pts = live ? live.points : r ? r.series : null;
  if (pts) {
    const thr = live ? f.p95Ms : r.thresholds ? r.thresholds.p95Ms : null;
    const el = ctx.view.querySelector('[data-chart="lt-load"]');
    const at = (k) => pts.map((p) => ({ t: p.t, v: p[k] }));
    const from = pts.length ? pts[0].t : Date.now();
    const to = live && live.total ? from + live.total * 1000 : undefined;
    if (el) ctx.state.ltChartLoad = pushChart(ctx, el, { height: 200, elapsed: true, from, to, yFmt: (v) => num(v), yFmtRight: (v) => num(v), label: 'Visiteurs et requêtes', empty: 'Les premières mesures arrivent dans quelques secondes…', series: [{ id: 'rps', name: 'Requêtes / s', color: 'var(--accent)', type: 'area', points: at('rps') }, { id: 'vus', name: 'Visiteurs', color: '#ff9500', axis: 'right', points: at('vus'), width: 2 }] });
    const el2 = ctx.view.querySelector('[data-chart="lt-lat"]');
    if (el2) ctx.state.ltChartLat = pushChart(ctx, el2, { height: 200, elapsed: true, from, to, yFmt: ms, label: 'Temps de réponse', empty: 'Les premières mesures arrivent dans quelques secondes…', thresholds: thr ? [{ value: thr, label: `Seuil ${ms(thr)}` }] : [], series: [{ id: 'p50', name: 'Médiane', color: '#30b0c7', type: 'area', points: at('p50') }, { id: 'p95', name: 'p95', color: 'var(--accent)', points: at('p95'), width: 2 }, { id: 'p99', name: 'p99', color: '#af52de', points: at('p99'), dash: '4 3' }] });
    const el3 = ctx.view.querySelector('[data-chart="lt-err"]');
    if (el3) pushChart(ctx, el3, { height: 170, elapsed: true, from, yFmt: (v) => `${num(v, 1)} %`, label: 'Erreurs', empty: 'Aucune erreur pendant le test.', series: pts.some((p) => p.err) ? [{ id: 'err', name: 'Erreurs', type: 'bar', color: 'var(--bad-dot)', points: at('err'), fmt: (v) => `${num(v, 1)} %` }] : [] });
  }
  const runs = ctx.state.ltCompare && ctx.state.ltCompare.length === 2 ? ctx.state.ltCmpRuns : null;
  if (runs) {
    const rel = (run, k) => { const t0 = run.series.length ? run.series[0].t : 0; return run.series.map((p) => ({ t: p.t - t0, v: p[k] })); };
    const max = Math.max(...runs.map((x) => (x.series.length ? x.series[x.series.length - 1].t - x.series[0].t : 0)), 1000);
    const mk = (k, fmt) => ({ height: 190, elapsed: true, from: 0, to: max, yFmt: fmt, series: runs.map((x, i) => ({ id: x.id, name: `${x.name || x.scenarioLabel} · ${dateTime(x.at)}`, color: PALETTE[i ? 3 : 0], points: rel(x, k) })) });
    const a = ctx.view.querySelector('[data-chart="cmp-lat"]');
    if (a) pushChart(ctx, a, mk('p95', ms));
    const b = ctx.view.querySelector('[data-chart="cmp-rps"]');
    if (b) pushChart(ctx, b, mk('rps', (v) => num(v)));
  }
}

function pushChart(ctx, el, opts) { const c = new Chart(el, opts); ctx.charts.push(c); return c; }

function readForm(ctx) {
  const fe = ctx.view.querySelector('[data-lt-form]');
  const f = form(ctx);
  if (!fe) return f;
  const fd = new FormData(fe);
  f.urls = String(fd.get('urls') || '').trim();
  if (fd.get('vus') != null) f.vus = Math.max(1, Math.min(2000, Number(fd.get('vus')) || 10));
  f.duration = String(fd.get('duration') || f.duration);
  f.thinkSec = Math.max(0, Math.min(30, Number(fd.get('thinkSec')) || 0));
  f.p95Ms = Math.max(50, Number(fd.get('p95Ms')) || 1000);
  f.errPct = Math.max(0, Math.min(100, Number(fd.get('errPct'))));
  f.name = String(fd.get('name') || '').trim();
  return f;
}

function bind(ctx) {
  const v = ctx.view;
  const fe = v.querySelector('[data-lt-form]');
  if (fe) {
    fe.onsubmit = (ev) => { ev.preventDefault(); start(ctx); };
    fe.onchange = (ev) => { if (ev.target.name === 'vus' || ev.target.name === 'duration') { readForm(ctx); ctx.show(true); } else readForm(ctx); };
  }
  for (const b of v.querySelectorAll('[data-scen]')) b.onclick = () => { readForm(ctx); form(ctx).scenario = b.dataset.scen; ctx.show(true); };
  for (const b of v.querySelectorAll('[data-lt]')) b.onclick = async () => {
    const a = b.dataset.lt;
    if (a === 'stop') { b.disabled = true; await call('mon:loadtest-stop').catch(() => {}); toast('Arrêt du test demandé : les mesures reçues sont gardées.'); }
    if (a === 'close-result') { ctx.state.ltResult = null; ctx.state.ltClosed = true; ctx.show(true); }
    if (a === 'uncompare') { ctx.state.ltCompare = []; ctx.show(true); }
  };
  for (const c of v.querySelectorAll('[data-lt-cmp]')) c.onchange = () => {
    let sel = (ctx.state.ltCompare || []).filter((id) => id !== c.dataset.ltCmp);
    if (c.checked) sel = [...sel, c.dataset.ltCmp].slice(-2);
    ctx.state.ltCompare = sel;
    if (sel.length === 1) toast('Coche un second test pour les comparer.');
    ctx.show(true);
  };
  for (const t of v.querySelectorAll('[data-lt-open]')) t.onclick = () => { const r = (ctx.state.ltHistory || []).find((x) => x.id === t.dataset.ltOpen); if (r) { ctx.state.ltResult = r; ctx.show(true); const pane = ctx.host.closest('.sec-pane'); if (pane) pane.scrollTop = 0; } };
  for (const b of v.querySelectorAll('[data-lt-del]')) b.onclick = async () => {
    if (!(await confirmSheet({ title: 'Supprimer ce test ?', text: 'Ses résultats seront effacés de l’historique.', ok: 'Supprimer', ic: 'trash' }))) return;
    await call('mon:loadtest-delete', b.dataset.ltDel);
    if (ctx.state.ltResult && ctx.state.ltResult.id === b.dataset.ltDel) ctx.state.ltResult = null;
    ctx.state.ltCompare = (ctx.state.ltCompare || []).filter((id) => id !== b.dataset.ltDel);
    ctx.show(true);
  };
}

async function start(ctx) {
  const f = readForm(ctx);
  const urls = f.urls.split(/\s*\n\s*/).map((u) => u.trim()).filter(Boolean);
  if (!urls.length) { toast('Indique au moins une adresse à tester.', { kind: 'bad' }); return; }
  // NEXORA #048 : un test de charge ne vise que des sites dont la propriété est prouvée.
  for (const u of urls) {
    let st = null;
    try { st = await call('mon:verify-status', { url: u }); } catch { st = null; }
    if (st && !st.verified) { const ok = await verifySheet(st); if (!ok) return; }
  }
  const stages = plan(f.scenario, f.vus, f.duration);
  ctx.state.ltLive = { points: [], running: true, label: 'Préparation du test de charge…', total: stages.reduce((a, s) => a + s[0], 0), elapsed: 0 };
  ctx.state.ltResult = null;
  ctx.show(true);
  try {
    const r = await call('mon:loadtest', { urls, scenario: f.scenario, vus: f.vus, duration: f.duration, thinkSec: f.thinkSec, p95Ms: f.p95Ms, errPct: f.errPct, name: f.name });
    ctx.state.ltResult = r;
    toast(r.pass && r.pass.p95 && r.pass.err ? `Test terminé : seuils respectés (${num(r.rps, 1)} requêtes/s, p95 ${ms(r.p95)}).` : 'Test terminé : seuils dépassés, regarde le détail.', r.pass && r.pass.p95 && r.pass.err ? undefined : { kind: 'bad' });
  } catch (err) {
    toast(err.message || String(err), { kind: 'bad' });
  } finally {
    ctx.state.ltLive = null;
    if (ctx.tab === 'load' && ctx.visible()) ctx.show(true);
  }
}

// NEXORA #048 : preuve de propriété (fichier /.well-known/nexora-verify.txt ou enregistrement DNS TXT).
function verifySheet(st) {
  const owner = 'sup-verify';
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const el = sheet(owner, `<div class="sheet-head"><span class="sheet-icon">${icon('shield', 22)}</span><div><h2>Ce site t’appartient-il ?</h2><p>Un test de charge envoie des centaines de requêtes : sur le site de quelqu’un d’autre, c’est une attaque. Prouve une fois que ${esc(st.host)} est à toi, avec l’une des deux méthodes.</p></div></div>
      <div class="sheet-body sup-form-body">
        <div class="sup-verif"><b>1. Fichier sur le site</b><small>Crée le fichier <code>${esc(st.file)}</code> avec ce contenu, puis publie le site :</small><div class="sup-hb-u"><code>${esc(st.token)}</code><button type="button" class="btn small" data-vc="${esc(st.token)}">${icon('copy', 12)}<span>Copier</span></button></div></div>
        <div class="sup-verif"><b>2. Enregistrement DNS</b><small>Chez ton hébergeur DNS, ajoute un enregistrement TXT sur ${esc(st.host)} (ou _nexora.${esc(st.host)}) :</small><div class="sup-hb-u"><code>${esc(st.txt)}</code><button type="button" class="btn small" data-vc="${esc(st.txt)}">${icon('copy', 12)}<span>Copier</span></button></div></div>
        <p class="sup-form-err" hidden></p>
      </div>
      <div class="sheet-foot"><span class="grow"></span><button type="button" class="btn" data-v="no">Annuler</button><button type="button" class="btn primary" data-v="check">${icon('search', 13)}<span>Vérifier</span></button></div>`, { onClose: () => finish(false) });
    const err = el.querySelector('.sup-form-err');
    el.onclick = async (ev) => {
      const c = ev.target.closest('[data-vc]');
      if (c) { call('clipboard:write', c.dataset.vc).then(() => toast('Copié.')).catch(() => {}); return; }
      const b = ev.target.closest('[data-v]');
      if (!b) return;
      if (b.dataset.v === 'no') { closeSheet(owner); finish(false); return; }
      b.disabled = true;
      try {
        const r = await call('mon:verify-check', { url: `https://${st.host}` });
        if (r.verified) { toast(`${st.host} est vérifié : tu peux lancer tes tests de charge.`); finish(true); closeSheet(owner); }
        else { err.hidden = false; err.textContent = `Preuve introuvable pour l’instant (${r.detail || 'fichier et DNS absents'}). Un enregistrement DNS peut mettre quelques minutes à apparaître.`; }
      } catch (x) { err.hidden = false; err.textContent = x.message; } finally { b.disabled = false; }
    };
  });
}

// Mesures reçues en direct pendant le test (évènement mon:loadtest-progress).
export function onLoadProgress(ctx, p) {
  const live = ctx.state.ltLive;
  if (!live || !p) return;
  if (p.label) live.label = p.phase === 'run' ? 'Test de charge en cours' : p.label;
  if (p.total) live.total = p.total;
  if (p.elapsed != null) live.elapsed = p.elapsed;
  if (p.point) live.points.push(p.point);
  if (ctx.tab !== 'load' || !ctx.visible() || !ctx.view) return;
  const lab = ctx.view.querySelector('[data-lt-label]');
  if (lab) lab.textContent = live.label;
  const tm = ctx.view.querySelector('[data-lt-time]');
  if (tm && live.total) tm.textContent = `${dur(live.elapsed * 1000)} / ${dur(live.total * 1000)}`;
  const bar = ctx.view.querySelector('.sup-progress i');
  if (bar && live.total) bar.style.width = `${Math.min(100, Math.round((live.elapsed / live.total) * 100))}%`;
  if (!p.point) return;
  const k = ctx.view.querySelector('[data-lt-kpis]');
  if (k) k.innerHTML = liveKpis(p.point, form(ctx));
  const at = (key) => live.points.map((q) => ({ t: q.t, v: q[key] }));
  const from = live.points[0].t;
  const to = live.total ? from + live.total * 1000 : undefined;
  const cl = ctx.state.ltChartLoad;
  if (cl && cl.el.isConnected) cl.update({ from, to, series: cl.opts.series.map((s) => ({ ...s, points: at(s.id) })) });
  const ct = ctx.state.ltChartLat;
  if (ct && ct.el.isConnected) ct.update({ from, to, series: ct.opts.series.map((s) => ({ ...s, points: at(s.id) })) });
}
