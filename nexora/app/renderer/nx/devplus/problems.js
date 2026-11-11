// NEXORA #052 : panneau « Problèmes » : vérification de tout le projet (TypeScript, ESLint, Ruff), erreurs de
// l'éditeur et erreurs repérées dans la sortie des scripts ; un clic ouvre le fichier à la bonne ligne.
import { esc, ico, root, call, openFile, relPath, noProject, head, btn, pill, spinner, fmtMs, dev, prefs, savePrefs, ago } from './ui.js';

export function mount(el, ctx) {
  const st = { res: null, busy: false, filter: 'all', fromTasks: [] };
  const editorMarkers = () => {
    const monaco = dev() && (dev().monaco || window.monaco);
    if (!monaco) return [];
    return monaco.editor.getModelMarkers({}).filter((m) => m.owner !== 'nexora' && m.resource.scheme === 'file' && m.severity >= 4).map((m) => ({ file: m.resource.fsPath, rel: relPath(m.resource.fsPath), line: m.startLineNumber, col: m.startColumn, severity: m.severity === 8 ? 'error' : 'warning', message: m.message, code: m.code && (m.code.value || m.code) ? String(m.code.value || m.code) : '', source: 'Éditeur' }));
  };
  const render = () => {
    if (!root()) { el.innerHTML = noProject(); return; }
    const all = [...(st.res ? st.res.items : []), ...st.fromTasks, ...editorMarkers().filter((m) => !(st.res && st.res.items.some((i) => i.rel === m.rel && i.line === m.line && i.message === m.message)))];
    const items = all.filter((i) => st.filter === 'all' || i.severity === st.filter);
    const errors = all.filter((i) => i.severity === 'error').length;
    ctx.setBadge('problems', errors);
    const groups = new Map();
    for (const i of items) { if (!groups.has(i.rel)) groups.set(i.rel, []); groups.get(i.rel).push(i); }
    const tools = st.res ? st.res.tools.map((t) => (t.ran ? pill(`${t.name} · ${t.count} · ${fmtMs(t.ms)}`, t.count ? 'warn' : 'ok') : `<span class="nxd-pill" title="${esc(t.reason || '')}">${esc(t.name)} : non lancé</span>`)).join('') : '';
    el.innerHTML = `${head('Problèmes', st.res ? `Dernière vérification ${ago(st.res.at)} · ${errors} erreur(s), ${all.length - errors} avertissement(s)` : 'Vérifie les types et le style de tout le projet, pas seulement les fichiers ouverts.', `${btn(st.busy ? 'Vérification…' : 'Vérifier le projet', `data-act="check" ${st.busy ? 'disabled' : ''}`, 'refreshCw', 'primary')}`)}
      <div class="nxd-bar"><div class="seg nxd-seg" role="radiogroup">${[['all', 'Tout'], ['error', 'Erreurs'], ['warning', 'Avertissements']].map(([k, l]) => `<button class="${st.filter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}</div><div class="nxd-row nxd-wrap">${tools}</div>
      <label class="nxd-check"><input type="checkbox" data-act="auto" ${prefs().autoCheck !== false ? 'checked' : ''}> Vérifier à l’ouverture du projet</label></div>
      ${st.busy && !st.res ? spinner('Vérification du projet…') : ''}
      ${!items.length && !st.busy ? `<div class="nxd-empty">${ico('pass', 26)}<b>${st.res ? 'Aucun problème' : 'Pas encore vérifié'}</b><p>${st.res ? 'TypeScript et les autres outils n’ont rien relevé.' : 'Lance la vérification : NEXORA utilise les outils installés dans le projet.'}</p></div>` : ''}
      <div class="nxd-list">${[...groups].map(([file, list]) => `<div class="nxd-group"><div class="nxd-group-h">${ico('file', 13)}<b>${esc(file)}</b><small>${list.length}</small></div>${list.map((i) => `<button class="nxd-item" data-open="${esc(i.file)}" data-line="${i.line}" data-col="${i.col}">${ico(i.severity === 'error' ? 'error' : 'warn', 14, `nxd-${i.severity}`)}<span class="nxd-item-t">${esc(i.message)}</span><small>${esc(i.source)}${i.code ? ` ${esc(i.code)}` : ''} · ${i.line}:${i.col}</small></button>`).join('')}</div>`).join('')}</div>`;
  };
  const check = async () => {
    if (st.busy || !root()) return;
    st.busy = true; render();
    try { st.res = await call('devx:problems'); ctx.bus.dispatchEvent(new CustomEvent('problems', { detail: st.res })); } catch { /* message affiché */ }
    st.busy = false; render();
  };
  el.addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]');
    if (o) { openFile(o.dataset.open, +o.dataset.line, +o.dataset.col); return; }
    const f = e.target.closest('[data-filter]');
    if (f) { st.filter = f.dataset.filter; render(); return; }
    if (e.target.closest('[data-act="check"]')) check();
  });
  el.addEventListener('change', (e) => { if (e.target.matches('[data-act="auto"]')) { prefs().autoCheck = e.target.checked; savePrefs(); } });
  ctx.bus.addEventListener('problems', (e) => { if (e.detail && e.detail !== st.res && e.detail.items) { st.res = e.detail; render(); } });
  ctx.bus.addEventListener('task-problems', (e) => { const items = e.detail || []; st.fromTasks = [...items.map((i) => ({ ...i, severity: 'error', message: i.message || 'Erreur signalée par un script', source: 'Script' })), ...st.fromTasks].slice(0, 50); render(); });
  render();
  return { show: () => render() };
}
