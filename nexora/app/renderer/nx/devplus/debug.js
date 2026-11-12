// NEXORA #052 : débogueur des programmes Node.js (points d'arrêt, pas à pas, pile, variables, console) et
// outils de développement de la page affichée dans l'aperçu.
import { api, esc, ico, root, call, noProject, head, btn, iconBtn, pill, toast, has, proGate, dev, relPath, openFile, prompt } from './ui.js';
import { allBreakpoints } from './index.js';

export function mount(el, ctx) {
  const st = { state: 'idle', file: '', args: '', frames: [], scopes: [], frame: 0, reason: '', exception: '', console: [], code: null, open: new Map() };
  const varRow = (v, depth = 0) => `<div class="nxd-var" style="--d:${depth}">${v.objectId ? `<button class="nxd-tw" data-obj="${esc(v.objectId)}">${ico(st.open.has(v.objectId) ? 'chevronDown' : 'chevronRight', 11)}</button>` : '<span class="nxd-tw"></span>'}<b>${esc(v.name)}</b><code class="t-${esc(v.type)}">${esc(v.value)}</code></div>${v.objectId && st.open.has(v.objectId) ? (st.open.get(v.objectId) || []).map((c) => varRow(c, depth + 1)).join('') : ''}`;
  const render = () => {
    if (!root()) { el.innerHTML = noProject(); return; }
    if (!has('devlab_pro')) { el.innerHTML = `${head('Débogueur', '')}${proGate('Le débogueur', 'Points d’arrêt, pas à pas, pile d’appels et variables pour votre serveur et vos scripts Node.js.')}`; return; }
    const d = dev();
    const active = d.active ? relPath(d.active) : '';
    const live = st.state === 'running' || st.state === 'paused';
    const bps = allBreakpoints();
    const f = st.frames[st.frame];
    el.innerHTML = `${head('Débogueur', live ? (st.state === 'paused' ? `En pause${st.reason === 'exception' ? ' sur une erreur' : ''}${f ? ` : ${esc(relPath(f.file))}, ligne ${f.line}` : ''}` : 'Le programme tourne. Il s’arrêtera au prochain point d’arrêt.') : 'Lancez un fichier Node.js en mode débogage. Cliquez dans la marge de l’éditeur (ou F9) pour poser un point d’arrêt.', btn('Outils de la page', 'data-act="page"', 'inspector'))}
      <div class="nxd-row nxd-wrap nxd-dbg-bar">${live ? `${iconBtn('play', 'Reprendre', `data-cmd="resume" ${st.state !== 'paused' ? 'disabled' : ''}`)}${iconBtn('chevronRight', 'Ligne suivante', `data-cmd="over" ${st.state !== 'paused' ? 'disabled' : ''}`)}${iconBtn('chevronDown', 'Entrer dans la fonction', `data-cmd="into" ${st.state !== 'paused' ? 'disabled' : ''}`)}${iconBtn('chevronUp', 'Sortir de la fonction', `data-cmd="out" ${st.state !== 'paused' ? 'disabled' : ''}`)}${iconBtn('pause', 'Mettre en pause', `data-cmd="pause" ${st.state === 'paused' ? 'disabled' : ''}`)}${iconBtn('stop', 'Arrêter', 'data-cmd="stop"')}${pill(st.state === 'paused' ? 'en pause' : 'en cours', st.state === 'paused' ? 'warn' : 'ok')}` : `<input class="input nxd-grow" data-file value="${esc(st.file || active)}" placeholder="Fichier à lancer (vide : main de package.json, server.js…)" spellcheck="false"><input class="input nxd-args" data-args value="${esc(st.args)}" placeholder="Arguments" spellcheck="false">${btn('Déboguer', 'data-act="start"', 'play', 'primary')}${btn('S’attacher…', 'data-act="attach"', 'link')}`}</div>
      ${st.exception ? `<p class="nxd-note bad">${ico('error', 14)} ${esc(st.exception)}</p>` : ''}
      <div class="nxd-dbg">
        <div class="nxd-dbg-col"><h4 class="nxd-h4">Pile d’appels</h4>${st.frames.length ? st.frames.map((fr, i) => `<button class="nxd-item ${i === st.frame ? 'on' : ''}" data-frame="${i}"><b>${esc(fr.fn)}</b><small>${esc(relPath(fr.file).split('/').slice(-2).join('/'))}:${fr.line}</small></button>`).join('') : '<p class="nxd-muted">Vide tant que le programme n’est pas en pause.</p>'}
          <h4 class="nxd-h4">Points d’arrêt (${bps.reduce((s, b) => s + b.lines.length, 0)})</h4>${bps.length ? bps.map((b) => b.lines.map((l) => `<button class="nxd-item" data-bp="${esc(b.file)}" data-line="${l}">${ico('target', 12, 'nxd-error')}<span class="nxd-item-t">${esc(b.rel)}</span><small>ligne ${l}</small></button>`).join('')).join('') : '<p class="nxd-muted">Aucun : cliquez dans la marge à gauche des numéros de ligne.</p>'}</div>
        <div class="nxd-dbg-col">${st.code ? `<h4 class="nxd-h4">${esc(relPath(f.file))} ${iconBtn('external', 'Ouvrir dans l’éditeur', `data-open="${esc(f.file)}" data-line="${f.line}"`)}</h4><pre class="nxd-code nxd-src">${st.code.map(([n, t]) => `<span class="${n === f.line ? 'cur' : ''}"><i>${n}</i>${esc(t) || ' '}</span>`).join('\n')}</pre>` : ''}
          <h4 class="nxd-h4">Variables</h4>${st.scopes.length ? st.scopes.map((s) => `<details class="nxd-details" open><summary>${esc(s.type)}</summary>${s.vars.length ? s.vars.map((v) => varRow(v)).join('') : '<p class="nxd-muted">Aucune.</p>'}</details>`).join('') : '<p class="nxd-muted">Les variables s’affichent quand le programme est en pause.</p>'}</div>
        <div class="nxd-dbg-col nxd-dbg-con"><h4 class="nxd-h4">Console ${st.console.length ? iconBtn('trash', 'Effacer', 'data-act="clear"') : ''}</h4><pre class="nxd-console" data-con>${st.console.map((c) => `<span class="lv-${esc(c.level)}">${esc(c.text)}</span>`).join('\n')}</pre><input class="input" data-eval placeholder="${live ? 'Expression à évaluer (Entrée)' : 'Disponible pendant le débogage'}" ${live ? '' : 'disabled'} spellcheck="false"></div>
      </div>`;
    const con = el.querySelector('[data-con]');
    if (con) con.scrollTop = con.scrollHeight;
  };
  const showCode = async () => {
    const f = st.frames[st.frame];
    st.code = null;
    if (f && f.file && /^([A-Za-z]:|\/)/.test(f.file)) {
      try { const r = await api.invoke('dev:read', { file: f.file }); const lines = r.text.split('\n'); const a = Math.max(1, f.line - 6); st.code = lines.slice(a - 1, f.line + 6).map((t, i) => [a + i, t]); } catch { st.code = null; }
    }
    render();
  };
  const log = (level, text) => { st.console.push({ level, text: String(text).replace(/\n$/, '') }); if (st.console.length > 500) st.console.shift(); };
  api.on('devx:debug', async (m) => {
    if (!el.isConnected) return;
    if (m.type === 'paused') { st.state = 'paused'; st.frames = m.frames; st.scopes = m.scopes; st.frame = 0; st.reason = m.reason; st.exception = m.exception || ''; st.open.clear(); await showCode(); return; }
    if (m.type === 'running') { st.state = 'running'; st.frames = []; st.scopes = []; st.code = null; st.exception = ''; }
    if (m.type === 'ended') { if (st.state !== 'idle') log('info', `Programme terminé${m.code != null ? ` (code ${m.code})` : ''}.`); st.state = 'idle'; st.frames = []; st.scopes = []; st.code = null; }
    if (m.type === 'console') log(m.level, m.text);
    render();
  });
  const start = async (file) => {
    st.file = file !== undefined ? file : (el.querySelector('[data-file]') || {}).value || '';
    st.args = (el.querySelector('[data-args]') || {}).value || '';
    st.console = []; st.exception = '';
    for (const b of allBreakpoints()) await api.invoke('devx:debug-breakpoints', { root: root(), file: b.file, lines: b.lines }).catch(() => {});
    try { const r = await call('devx:debug-start', { file: st.file ? relPath(st.file) : '', args: st.args }); st.state = 'running'; log('info', `Débogage de ${relPath(r.entry)}.`); } catch { /* message affiché */ }
    render();
  };
  el.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-act="start"]')) return start();
    if (t.closest('[data-act="attach"]')) { const p = await prompt('S’attacher à un programme', { label: 'Port d’inspection du programme lancé avec --inspect', value: '9229', icon: 'link', go: 'S’attacher' }); if (p) { try { await call('devx:debug-attach', { port: +p }); st.state = 'running'; } catch { /* message affiché */ } render(); } return; }
    if (t.closest('[data-act="page"]')) { const wv = dev().preview && dev().preview.wv; if (wv && wv.openDevTools) wv.openDevTools(); else toast('Lancez d’abord le projet dans l’aperçu du Dev Lab.'); return; }
    if (t.closest('[data-act="clear"]')) { st.console = []; render(); return; }
    const c = t.closest('[data-cmd]');
    if (c) { call('devx:debug-cmd', { action: c.dataset.cmd }).catch(() => {}); return; }
    const fr = t.closest('[data-frame]');
    if (fr) { st.frame = +fr.dataset.frame; st.scopes = await call('devx:debug-scopes', { frame: st.frame }).catch(() => []); await showCode(); return; }
    const ob = t.closest('[data-obj]');
    if (ob) { const id = ob.dataset.obj; if (st.open.has(id)) st.open.delete(id); else st.open.set(id, await call('devx:debug-props', { objectId: id }).catch(() => [])); render(); return; }
    const bp = t.closest('[data-bp]');
    if (bp) { openFile(bp.dataset.bp, +bp.dataset.line); return; }
    const o = t.closest('[data-open]');
    if (o) openFile(o.dataset.open, +o.dataset.line);
  });
  el.addEventListener('keydown', async (e) => {
    if (!e.target.matches('[data-eval]') || e.key !== 'Enter') return;
    const expr = e.target.value.trim();
    if (!expr) return;
    log('in', `› ${expr}`);
    try { const r = await call('devx:debug-eval', { frame: st.frame, expression: expr }, { quiet: true }); log(r.error ? 'error' : 'out', r.error || r.value); } catch (err) { log('error', err.message); }
    render();
    const i = el.querySelector('[data-eval]'); if (i) i.focus();
  });
  ctx.bus.addEventListener('breakpoints', () => { if (el.isConnected && !el.hidden) render(); });
  render();
  return { show: (opts = {}) => { render(); if (opts.start && opts.file) start(opts.file); } };
}
