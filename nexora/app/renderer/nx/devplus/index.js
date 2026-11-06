// NEXORA #052 : outils du Dev Lab, ajoutés autour du Dev Lab d'origine (state.devLab) sans le réécrire :
//  - barre d'activité : Assistant IA, Problèmes (pastille), Scripts, Tous les outils ; barre d'outils : « Mettre en
//    ligne » et « Vers une app » ;
//  - tiroir à onglets (13 outils, un module par fichier) ;
//  - éditeur : points d'arrêt (F9, marge), auteur des lignes, « Expliquer avec l'IA », Ctrl+P, curseur retrouvé ;
//  - onglets et position du curseur retrouvés à la réouverture d'un projet ;
//  - recherche de secrets avant chaque enregistrement Git, contrôles après un envoi (réglables).
import { api, esc, ico, toast, dev, root, call, has, openFile, relPath, confirmSheet, prefs, projectPrefs, savePrefs, settings } from './ui.js';

const PANELS = [
  { id: 'assistant', label: 'Assistant IA', icon: 'sparkle', perm: 'devlab_pro', load: () => import('./assistant.js') },
  { id: 'problems', label: 'Problèmes', icon: 'warn', perm: 'devlab', load: () => import('./problems.js') },
  { id: 'scripts', label: 'Scripts', icon: 'play', perm: 'devlab', load: () => import('./scripts.js') },
  { id: 'tests', label: 'Tests', icon: 'pass', perm: 'devlab', load: () => import('./tests.js') },
  { id: 'debug', label: 'Débogueur', icon: 'target', perm: 'devlab_pro', load: () => import('./debug.js') },
  { id: 'git', label: 'Git avancé', icon: 'sync', perm: 'devlab', load: () => import('./gitplus.js') },
  { id: 'api', label: 'Client d’API', icon: 'globe', perm: 'devlab', load: () => import('./api.js') },
  { id: 'db', label: 'Bases de données', icon: 'nxiDatabase', perm: 'devlab_pro', load: () => import('./db.js') },
  { id: 'env', label: 'Variables', icon: 'key', perm: 'devlab', load: () => import('./env.js') },
  { id: 'deps', label: 'Dépendances', icon: 'layers', perm: 'devlab', load: () => import('./deps.js') },
  { id: 'deploy', label: 'Mise en ligne', icon: 'rocket', perm: 'devlab_pro', load: () => import('./deploy.js') },
  { id: 'checks', label: 'Contrôles', icon: 'shield', perm: 'devlab_pro', load: () => import('./checks.js') },
  { id: 'apps', label: 'Vers une app', icon: 'android', perm: '', load: () => import('./apps.js') },
];

const bus = new EventTarget();
const mounted = new Map(); // id → { el, api }
const badges = {};
let drawer = null;
let currentTab = null;
let lastUrl = null;

export const ctx = {
  bus,
  open: (id, opts) => openDrawer(id, opts),
  close: () => closeDrawer(),
  setBadge(id, n) { badges[id] = n; paintBadges(); },
  url: () => lastUrl || (dev() && dev().preview && dev().preview.url) || null,
  setUrl(u) { lastUrl = u; bus.dispatchEvent(new CustomEvent('url', { detail: u })); },
  panel: (id) => mounted.get(id) && mounted.get(id).api,
};

function link() {
  if (document.querySelector('link[data-nxd-css]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('./devplus.css', import.meta.url).href;
  l.dataset.nxdCss = '1';
  document.head.append(l);
}

// ---------- Boutons ajoutés au Dev Lab ----------
function inject(d) {
  const acts = d.el.querySelector('.dk-acts');
  if (acts && !acts.querySelector('[data-nxd-side]')) {
    const ext = acts.querySelector('[data-side="ext"]');
    const html = `<button data-nxd-side="assistant" title="Assistant IA du projet">${ico('sparkle', 18)}</button>
      <button data-nxd-side="problems" title="Problèmes du projet">${ico('warn', 18)}<i class="dk-badge" data-nxd-badge="problems" hidden></i></button>
      <button data-nxd-side="scripts" title="Scripts du projet">${ico('play', 18)}<i class="dk-badge nxd-live" data-nxd-badge="scripts" hidden></i></button>
      <button data-nxd-side="" title="Tous les outils du Dev Lab">${ico('grid', 18)}</button>`;
    if (ext) ext.insertAdjacentHTML('afterend', html); else acts.insertAdjacentHTML('afterbegin', html);
  }
  const pub = d.el.querySelector('.dk-top [data-act="publish"]');
  if (pub && !d.el.querySelector('[data-nxd-deploy]')) {
    pub.insertAdjacentHTML('afterend', `<button class="btn small nxd-tb" data-nxd-deploy title="Construire et mettre le site en ligne, avec une adresse par branche">${ico('rocket', 14)}<span>Mettre en ligne</span></button>
      <button class="btn small nxd-tb" data-nxd-apps title="Créer une app Android ou un logiciel Windows, afficher sur les appareils">${ico('android', 14)}<span>Vers une app</span></button>`);
  }
  syncDisabled();
  paintBadges();
}
function syncDisabled() {
  const d = dev();
  if (!d) return;
  for (const b of d.el.querySelectorAll('[data-nxd-deploy], [data-nxd-apps]')) b.disabled = !root();
}
function paintBadges() {
  const d = dev();
  if (!d) return;
  for (const el of d.el.querySelectorAll('[data-nxd-badge]')) {
    const n = badges[el.dataset.nxdBadge] || 0;
    el.hidden = !n;
    el.textContent = n > 99 ? '99+' : String(n);
  }
  if (drawer) for (const el of drawer.querySelectorAll('[data-nxd-tabbadge]')) { const n = badges[el.dataset.nxdTabbadge] || 0; el.hidden = !n; el.textContent = n > 99 ? '99+' : String(n); }
}

// ---------- Tiroir des outils ----------
function buildDrawer(d) {
  const body = d.el.querySelector('.dk-body');
  if (!body) return null;
  const el = document.createElement('section');
  el.className = 'nxd';
  el.hidden = true;
  el.setAttribute('aria-label', 'Outils du Dev Lab');
  el.innerHTML = `<header class="nxd-top">
      <div class="nxd-title">${ico('wrench', 16)}<b>Outils du Dev Lab</b><small data-nxd-project></small></div>
      <nav class="nxd-tabs" role="tablist">${PANELS.map((p) => `<button role="tab" data-nxd-tab="${p.id}" title="${esc(p.label)}">${ico(p.icon, 14)}<span>${esc(p.label)}</span>${p.perm === 'devlab_pro' ? '<em class="nxd-pro" data-nxd-pro>Pro</em>' : ''}<i class="nxd-tb-badge" data-nxd-tabbadge="${p.id}" hidden></i></button>`).join('')}</nav>
      <button class="icon-btn" data-nxd-close title="Fermer (Échap)" aria-label="Fermer">${ico('close', 15)}</button>
    </header>
    <div class="nxd-body"></div>`;
  body.append(el);
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-nxd-tab]');
    if (t) { openDrawer(t.dataset.nxdTab); return; }
    if (e.target.closest('[data-nxd-close]')) { closeDrawer(); return; }
    if (e.target.closest('[data-nxd-open-project]')) { closeDrawer(); const b = dev().el.querySelector('[data-act="open"]'); if (b) b.click(); }
  });
  return el;
}
async function openDrawer(id, opts = {}) {
  const d = dev();
  if (!d) return;
  if (!drawer || !drawer.isConnected) { mounted.clear(); drawer = buildDrawer(d); }
  if (!drawer) return;
  const acts = d.el.querySelector('.dk-acts');
  drawer.style.setProperty('--nxd-left', `${acts ? acts.offsetWidth : 48}px`);
  drawer.hidden = false;
  d.el.classList.add('nxd-on');
  id = id || currentTab || 'problems';
  currentTab = id;
  drawer.querySelector('[data-nxd-project]').textContent = root() ? `· ${root().split(/[\\/]/).filter(Boolean).pop()}` : '';
  for (const b of drawer.querySelectorAll('[data-nxd-tab]')) { const on = b.dataset.nxdTab === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  for (const b of drawer.querySelectorAll('[data-nxd-pro]')) b.hidden = has('devlab_pro');
  for (const b of d.el.querySelectorAll('[data-nxd-side]')) b.classList.toggle('on', b.dataset.nxdSide === id);
  const host = drawer.querySelector('.nxd-body');
  for (const [k, m] of mounted) m.el.hidden = k !== id;
  let m = mounted.get(id);
  if (!m) {
    const p = PANELS.find((x) => x.id === id);
    const el = document.createElement('div');
    el.className = `nxd-panel nxd-p-${id}`;
    host.append(el);
    m = { el, api: null };
    mounted.set(id, m);
    try {
      const mod = await p.load();
      m.api = (await mod.mount(el, ctx)) || {};
    } catch (e) {
      el.innerHTML = `<div class="nxd-empty">${ico('error', 24)}<b>Cet outil n’a pas pu s’ouvrir</b><p>Relance NEXORA. Si le problème continue, contacte le support.</p></div>`;
      console.error('[NEXORA #052]', id, e);
    }
  }
  if (m.api && m.api.show) m.api.show(opts);
}
function closeDrawer() {
  const d = dev();
  if (drawer) drawer.hidden = true;
  if (d) { d.el.classList.remove('nxd-on'); for (const b of d.el.querySelectorAll('[data-nxd-side]')) b.classList.remove('on'); }
}
const drawerOpen = () => drawer && !drawer.hidden && drawer.isConnected;

// Nouveau projet : les outils repartent de zéro.
function projectChanged() {
  for (const [, m] of mounted) m.el.remove();
  mounted.clear();
  lastUrl = null;
  for (const k of Object.keys(badges)) badges[k] = 0;
  paintBadges();
  syncDisabled();
  bus.dispatchEvent(new Event('project'));
  if (drawerOpen()) openDrawer(currentTab);
  autoCheck();
}
// Vérification discrète du projet à l'ouverture (pastille « Problèmes »).
let checkTimer = 0;
function autoCheck() {
  clearTimeout(checkTimer);
  if (!root() || prefs().autoCheck === false || !has('devlab')) return;
  const r = root();
  checkTimer = setTimeout(async () => {
    if (r !== root()) return;
    try { const res = await call('devx:problems', {}, { quiet: true }); if (r === root()) { ctx.setBadge('problems', res.items.filter((i) => i.severity === 'error').length); bus.dispatchEvent(new CustomEvent('problems', { detail: res })); } } catch { /* outil absent */ }
  }, 2500);
}

// ---------- Ouverture rapide d'un fichier (Ctrl+P) ----------
async function quickOpen() {
  if (!root()) { toast('Ouvre d’abord un projet.'); return; }
  const { sheet, closeSheet } = await import('../core.js');
  let files = [];
  const s = sheet('nxd-quick', `<div class="nxd-quick"><div class="nxd-quick-in">${ico('search', 16)}<input class="input" data-autofocus placeholder="Nom du fichier (ex. panier, src/app)…" spellcheck="false" aria-label="Rechercher un fichier"></div><div class="nxd-quick-list" role="listbox"></div><small class="nxd-quick-foot">↑ ↓ pour choisir · Entrée pour ouvrir · Échap pour fermer</small></div>`, {});
  const input = s.querySelector('input');
  const list = s.querySelector('.nxd-quick-list');
  let sel = 0;
  let shown = [];
  const score = (f, q) => {
    if (!q) return 1;
    const lf = f.toLowerCase();
    let i = 0; let sc = 0; let last = -1;
    for (const c of q) { const j = lf.indexOf(c, i); if (j < 0) return 0; sc += j === last + 1 ? 3 : 1; last = j; i = j + 1; }
    const base = lf.split('/').pop();
    if (base.startsWith(q)) sc += 20; else if (base.includes(q)) sc += 10;
    return sc - lf.length / 100;
  };
  const paint = () => {
    const q = input.value.trim().toLowerCase().replace(/\\/g, '/');
    shown = files.map((f) => [f, score(f, q)]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 60).map((x) => x[0]);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.innerHTML = shown.length ? shown.map((f, i) => { const parts = f.split('/'); const b = parts.pop(); return `<button role="option" class="${i === sel ? 'on' : ''}" data-f="${esc(f)}">${ico('file', 14)}<b>${esc(b)}</b><small>${esc(parts.join('/'))}</small></button>`; }).join('') : '<p class="nxd-muted">Aucun fichier ne correspond.</p>';
    const on = list.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  };
  const go = (f) => { closeSheet('nxd-quick'); if (f) openFile(f); };
  input.addEventListener('input', () => { sel = 0; paint(); });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); paint(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); paint(); e.preventDefault(); }
    if (e.key === 'Enter') { go(shown[sel]); e.preventDefault(); }
    if (e.key === 'Escape') closeSheet('nxd-quick');
  });
  list.addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) go(b.dataset.f); });
  input.focus();
  list.innerHTML = '<p class="nxd-muted">Lecture des fichiers…</p>';
  try { files = await call('devx:files', {}, { quiet: true }); } catch { files = (dev().st.open || []).map(relPath); }
  paint();
}

// ---------- Éditeur : points d'arrêt, auteur des lignes, actions ----------
function breakpoints() { const p = projectPrefs(); p.breakpoints = p.breakpoints || {}; return p.breakpoints; }
export function breakpointsOf(file) { return breakpoints()[relPath(file)] || []; }
export function allBreakpoints() { const r = root(); return Object.entries(breakpoints()).map(([f, lines]) => ({ file: `${r}/${f}`.replace(/\//g, r && r.includes('\\') ? '\\' : '/'), rel: f, lines })).filter((x) => x.lines.length); }
function hookEditor(d) {
  const ed = d.editor;
  const monaco = d.monaco || window.monaco;
  if (!ed || !monaco || ed.__nxd) return;
  ed.__nxd = true;
  ed.updateOptions({ glyphMargin: true });
  const bpDeco = ed.createDecorationsCollection([]);
  const blameDeco = ed.createDecorationsCollection([]);
  let blame = null;
  const fileOf = () => { const m = ed.getModel(); return m && m.uri && m.uri.scheme === 'file' ? m.uri.fsPath : null; };
  const paintBp = () => {
    const f = fileOf();
    const lines = f ? breakpointsOf(f) : [];
    bpDeco.set(lines.map((l) => ({ range: new monaco.Range(l, 1, l, 1), options: { isWholeLine: true, glyphMarginClassName: 'nxd-bp', glyphMarginHoverMessage: { value: 'Point d’arrêt (clic pour retirer)' }, className: 'nxd-bp-line' } })));
  };
  const toggleBp = (line) => {
    const f = fileOf();
    if (!f || !root()) return;
    const map = breakpoints();
    const k = relPath(f);
    const set = new Set(map[k] || []);
    if (set.has(line)) set.delete(line); else set.add(line);
    map[k] = [...set].sort((a, b) => a - b);
    if (!map[k].length) delete map[k];
    savePrefs();
    paintBp();
    api.invoke('devx:debug-breakpoints', { root: root(), file: f, lines: map[k] || [] }).catch(() => {});
    bus.dispatchEvent(new Event('breakpoints'));
  };
  const paintBlame = () => {
    if (!blame) { blameDeco.clear(); return; }
    const pos = ed.getPosition();
    const b = pos && blame.get(pos.lineNumber);
    blameDeco.set(b ? [{ range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber, 1), options: { isWholeLine: true, after: { content: `    ${b.author}, ${b.time ? new Date(b.time).toLocaleDateString('fr-FR') : ''} · ${b.summary || ''}`, inlineClassName: 'nxd-blame' } } }] : []);
  };
  const loadBlame = async () => {
    const f = fileOf();
    if (!f) return;
    try {
      const r = await call('devx:git-blame', { file: f });
      if (r.error) { toast(r.error); blame = null; } else blame = new Map(r.lines.map((l) => [l.line, l]));
    } catch { blame = null; }
    paintBlame();
  };
  ed.onMouseDown((e) => { if (e.target && e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && e.target.position) toggleBp(e.target.position.lineNumber); });
  ed.onDidChangeModel(() => { paintBp(); if (blame) { blame = null; prefs().blame && loadBlame(); } else paintBlame(); });
  let saveT = 0;
  ed.onDidChangeCursorPosition(() => {
    paintBlame();
    clearTimeout(saveT);
    saveT = setTimeout(() => { const f = fileOf(); const p = ed.getPosition(); if (!f || !p || !root()) return; const pp = projectPrefs(); pp.cursors = pp.cursors || {}; pp.cursors[relPath(f)] = [p.lineNumber, p.column]; pp.open = (d.st.open || []).map(relPath); pp.active = relPath(d.st.active || f); savePrefs(); }, 600);
  });
  ed.addAction({ id: 'nxd.breakpoint', label: 'Point d’arrêt sur cette ligne', keybindings: [monaco.KeyCode.F9], contextMenuGroupId: 'nxd', contextMenuOrder: 1, run: () => { const p = ed.getPosition(); if (p) toggleBp(p.lineNumber); } });
  ed.addAction({ id: 'nxd.debug', label: 'Déboguer ce fichier', contextMenuGroupId: 'nxd', contextMenuOrder: 2, run: () => openDrawer('debug', { file: fileOf(), start: true }) });
  ed.addAction({ id: 'nxd.explain', label: 'Expliquer ce code avec l’IA', contextMenuGroupId: 'nxd', contextMenuOrder: 3, run: () => { const sel = ed.getModel().getValueInRange(ed.getSelection()); openDrawer('assistant', { prompt: sel ? `Explique ce code de ${relPath(fileOf())} et propose une amélioration si c’est utile :\n\n${sel.slice(0, 8000)}` : `Explique le rôle du fichier ${relPath(fileOf())}.` }); } });
  ed.addAction({ id: 'nxd.blame', label: 'Auteur des lignes (Git) : afficher ou masquer', contextMenuGroupId: 'nxd', contextMenuOrder: 4, run: () => { prefs().blame = !prefs().blame; savePrefs(); if (prefs().blame) loadBlame(); else { blame = null; paintBlame(); } } });
  ed.addAction({ id: 'nxd.quick', label: 'Ouvrir un fichier du projet…', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP], run: () => quickOpen() });
  paintBp();
  if (prefs().blame) loadBlame();
}

// Marques des problèmes du projet dans les fichiers ouverts (en plus de celles de l'éditeur).
bus.addEventListener('problems', (e) => {
  const d = dev();
  const monaco = d && (d.monaco || window.monaco);
  if (!monaco) return;
  const items = (e.detail && e.detail.items) || [];
  for (const model of monaco.editor.getModels()) {
    if (model.uri.scheme !== 'file') continue;
    const f = model.uri.fsPath.replace(/\\/g, '/').toLowerCase();
    const mine = items.filter((i) => String(i.file).replace(/\\/g, '/').toLowerCase() === f);
    monaco.editor.setModelMarkers(model, 'nexora', mine.map((i) => ({ startLineNumber: i.line, startColumn: i.col, endLineNumber: i.line, endColumn: i.col + 1, message: `${i.message}${i.code ? ` (${i.code})` : ''}`, severity: i.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning, source: i.source })));
  }
});

// ---------- Secrets avant enregistrement, contrôles après envoi ----------
function guardGit() {
  if (api.__nxdGuard) return;
  api.__nxdGuard = true;
  const invoke = api.invoke.bind(api);
  api.invoke = async (channel, ...args) => {
    if (channel === 'git:commit' && prefs().scanSecrets !== false && root()) {
      let res = null;
      try { res = await invoke('devx:secrets-scan', { root: root() }); } catch { res = null; }
      if (res && res.findings.length) {
        const rows = res.findings.slice(0, 12).map((f) => `<li><b>${esc(f.rule)}</b><small>${esc(f.file)} · ligne ${f.line}</small><code>${esc(f.preview)}</code></li>`).join('');
        const go = await confirmSheet({ id: 'nxd-secrets', icon: 'shield', title: `${res.findings.length} secret${res.findings.length > 1 ? 's' : ''} repéré${res.findings.length > 1 ? 's' : ''} avant l’enregistrement`, sub: 'Une clé envoyée sur un dépôt peut être réutilisée par n’importe qui. Range-la plutôt dans les variables protégées du projet.', body: `<ul class="nxd-findings">${rows}</ul>${res.findings.length > 12 ? `<p class="nxd-muted">Et ${res.findings.length - 12} autre(s).</p>` : ''}<p class="nxd-muted">Pour ignorer une ligne précise, ajoute le commentaire « nexora-allow-secret ».</p>`, go: 'Enregistrer quand même', wide: true });
        if (!go) { setTimeout(() => openDrawer('env', { findings: res.findings }), 50); throw new Error('Enregistrement annulé : retire les secrets repérés ou range-les dans les variables protégées.'); }
      }
    }
    const out = await invoke(channel, ...args);
    if (channel === 'git:push' && prefs().checksAfterPush && has('devlab_pro') && ctx.url()) {
      import('./checks.js').then((m) => m.background(ctx)).catch(() => {});
    }
    return out;
  };
}

// ---------- Mémoire des onglets et du curseur par projet ----------
function hookProject(d) {
  if (d.__nxd) return;
  d.__nxd = true;
  const openFolder = d.openFolder.bind(d);
  d.openFolder = async (t, o = {}) => {
    const before = d.st.root;
    const r = await openFolder(t, o);
    if (d.st.root && d.st.root !== before) {
      if (!o.restore) {
        const pp = projectPrefs();
        const sep = d.st.root.includes('\\') ? '\\' : '/';
        for (const f of pp.open || []) await d.openFile(`${d.st.root}${sep}${f.replace(/\//g, sep)}`, { silent: true }).catch(() => {});
        if (pp.active) { const a = `${d.st.root}${sep}${pp.active.replace(/\//g, sep)}`; if (d.files && d.files.has(a)) d.activate(a); }
      }
      projectChanged();
    }
    return r;
  };
  const openFileOrig = d.openFile.bind(d);
  d.openFile = async (t, o = {}) => {
    const r = await openFileOrig(t, o);
    if (!o.line && d.editor && root()) {
      const c = (projectPrefs().cursors || {})[relPath(t)];
      const m = d.editor.getModel();
      if (c && m && m.uri.fsPath === t && c[0] <= m.getLineCount()) { d.editor.setPosition({ lineNumber: c[0], column: c[1] }); d.editor.revealLineInCenter(c[0]); }
    }
    return r;
  };
  const ensure = d.ensureEditor.bind(d);
  d.ensureEditor = async (...a) => { const r = await ensure(...a); hookEditor(d); return r; };
  if (d.editor) hookEditor(d);
}

export async function install(d) {
  link();
  hookProject(d);
  guardGit();
  inject(d);
  new MutationObserver(() => { if (!d.el.querySelector('[data-nxd-side]') || !d.el.querySelector('[data-nxd-deploy]')) inject(d); }).observe(d.el, { childList: true, subtree: true });
  d.el.addEventListener('click', async (e) => {
    const side = e.target.closest('[data-nxd-side]');
    if (side) {
      e.stopPropagation();
      const id = side.dataset.nxdSide;
      if (drawerOpen() && (currentTab === id || !id)) closeDrawer(); else openDrawer(id || currentTab || 'problems');
      return;
    }
    if (e.target.closest('[data-side]') && drawerOpen()) closeDrawer();
    if (e.target.closest('[data-nxd-deploy]')) { openDrawer('deploy'); return; }
    if (e.target.closest('[data-nxd-apps]')) {
      const { appsMenu } = await import('./apps.js');
      appsMenu(e.target.closest('[data-nxd-apps]'), ctx);
    }
  }, true);
  window.addEventListener('keydown', (e) => {
    if (!d.el.offsetParent) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') { e.preventDefault(); e.stopPropagation(); quickOpen(); }
    else if (e.key === 'Escape' && drawerOpen() && !document.querySelector('.sheet-wrap, .sheet.open, .pop')) closeDrawer();
  }, true);
  window.addEventListener('nxd:close', () => closeDrawer());
  if (d.st.root) { projectChanged(); for (const b of allBreakpoints()) api.invoke('devx:debug-breakpoints', { root: root(), file: b.file, lines: b.lines }).catch(() => {}); }
  window.__nxDevPlus = { open: openDrawer, close: closeDrawer, quickOpen, ctx };
  return true;
}

export { settings };
