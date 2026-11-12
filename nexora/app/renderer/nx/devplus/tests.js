// NEXORA #052 : tests du projet : résultats par fichier, relance d'un seul test, couverture.
import { api, esc, ico, root, call, openFile, noProject, head, btn, iconBtn, pill, spinner, fmtMs, plain, projectPrefs, savePrefs } from './ui.js';

export function mount(el, ctx) {
  const st = { runners: null, runner: projectPrefs().testRunner || '', res: null, busy: false, log: '', showLog: false, coverage: false, open: new Set() };
  const render = () => {
    if (!root()) { el.innerHTML = noProject(); return; }
    const r = st.res;
    ctx.setBadge('tests', r ? r.totals.failed : 0);
    const sel = st.runners && st.runners.length ? `<select class="input nxd-sel" data-act="runner">${st.runners.map((x) => `<option value="${x.id}" ${x.id === st.runner ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : '';
    const cov = r && r.coverage ? `<div class="nxd-cards">${[['lines', 'Lignes'], ['functions', 'Fonctions'], ['branches', 'Branches'], ['statements', 'Instructions']].filter(([k]) => r.coverage[k] != null).map(([k, l]) => `<div class="nxd-card"><small>${l} couvertes</small><b>${String(r.coverage[k]).replace('.', ',')} %</b><i class="nxd-meter"><i style="width:${Math.min(100, r.coverage[k])}%" class="${r.coverage[k] >= 80 ? 'ok' : r.coverage[k] >= 50 ? 'warn' : 'bad'}"></i></i></div>`).join('')}</div>` : '';
    el.innerHTML = `${head('Tests', r ? `${r.totals.passed} réussi(s) · ${r.totals.failed} en échec · ${r.totals.skipped} ignoré(s) · ${fmtMs(r.ms)}` : 'Lancez les tests du projet et relancez un seul test en un clic.', `${sel}<label class="nxd-check"><input type="checkbox" data-act="cov" ${st.coverage ? 'checked' : ''}> Couverture</label>${btn(st.busy ? 'Tests en cours…' : 'Lancer les tests', `data-act="run" ${st.busy || !st.runner ? 'disabled' : ''}`, 'play', 'primary')}`)}
      ${st.runners && !st.runners.length ? `<div class="nxd-empty">${ico('pass', 24)}<b>Aucun outil de test trouvé</b><p>NEXORA reconnaît Vitest, Jest, Playwright, l’exécuteur de tests de Node et pytest. Ajoutez-en un au projet, puis relisez.</p>${btn('Relire le projet', 'data-act="detect"', 'refreshCw')}</div>` : ''}
      ${cov}
      ${st.busy && !r ? spinner('Tests en cours…') : ''}
      ${r && !r.files.length && r.tail ? `<pre class="nxd-console">${esc(plain(r.tail))}</pre>` : ''}
      <div class="nxd-list">${r ? [...r.files].sort((a, b) => b.tests.filter((t) => t.status === 'failed').length - a.tests.filter((t) => t.status === 'failed').length).map((f) => { const failed = f.tests.filter((t) => t.status === 'failed').length + (f.error ? 1 : 0); return `<div class="nxd-group"><div class="nxd-group-h">${ico(failed ? 'error' : 'pass', 14, failed ? 'nxd-error' : 'nxd-ok')}<b>${esc(f.file)}</b><small>${f.tests.length} test(s)</small>${iconBtn('play', 'Relancer ce fichier', `data-file="${esc(f.file)}"`)}${iconBtn('external', 'Ouvrir le fichier', `data-open="${esc(f.file)}"`)}</div>${f.error ? `<pre class="nxd-fail">${esc(plain(f.error))}</pre>` : ''}${f.tests.map((t, i) => { const k = `${f.file}#${i}`; return `<div class="nxd-test ${t.status}"><button class="nxd-item" data-toggle="${esc(k)}">${ico(t.status === 'passed' ? 'pass' : t.status === 'failed' ? 'error' : 'minus', 14, `nxd-${t.status === 'passed' ? 'ok' : t.status === 'failed' ? 'error' : 'muted'}`)}<span class="nxd-item-t">${esc(t.name)}</span><small>${fmtMs(t.ms)}</small></button>${iconBtn('play', 'Relancer ce test', `data-one="${esc(t.name)}" data-of="${esc(f.file)}"`)}${t.message && (st.open.has(k) || t.status === 'failed') ? `<pre class="nxd-fail">${esc(plain(t.message))}</pre>` : ''}</div>`; }).join('')}</div>`; }).join('') : ''}</div>
      ${st.log ? `<details class="nxd-details" ${st.showLog ? 'open' : ''}><summary>Sortie complète</summary><pre class="nxd-console">${esc(plain(st.log).slice(-30000))}</pre></details>` : ''}`;
  };
  const detect = async () => {
    if (!root()) { render(); return; }
    try { st.runners = (await call('devx:tests-detect', {}, { quiet: true })).runners; } catch { st.runners = []; }
    if (!st.runners.some((x) => x.id === st.runner)) st.runner = st.runners[0] ? st.runners[0].id : '';
    render();
  };
  const run = async (opts = {}) => {
    if (st.busy || !st.runner) return;
    st.busy = true; st.log = ''; render();
    try { st.res = await call('devx:tests-run', { runner: st.runner, coverage: st.coverage, ...opts }); } catch { /* message affiché */ }
    st.busy = false; render();
  };
  api.on('devx:tests', (m) => { if (!el.isConnected) return; if (m.type === 'log') st.log = (st.log + m.text).slice(-200000); });
  el.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-act="run"]')) return run();
    if (t.closest('[data-act="detect"]')) return detect();
    const one = t.closest('[data-one]');
    if (one) return run({ name: one.dataset.one, file: /^(tests?|__tests__|[\w./-]+\.(test|spec)\.)/.test(one.dataset.of) ? one.dataset.of : undefined });
    const f = t.closest('[data-file]');
    if (f) return run({ file: f.dataset.file });
    const o = t.closest('[data-open]');
    if (o) return openFile(o.dataset.open);
    const tg = t.closest('[data-toggle]');
    if (tg) { if (st.open.has(tg.dataset.toggle)) st.open.delete(tg.dataset.toggle); else st.open.add(tg.dataset.toggle); render(); }
  });
  el.addEventListener('change', (e) => {
    if (e.target.matches('[data-act="runner"]')) { st.runner = e.target.value; projectPrefs().testRunner = st.runner; savePrefs(); }
    if (e.target.matches('[data-act="cov"]')) st.coverage = e.target.checked;
  });
  el.addEventListener('toggle', (e) => { if (e.target.matches('.nxd-details')) st.showLog = e.target.open; }, true);
  detect();
  return { show: () => render(), run };
}
