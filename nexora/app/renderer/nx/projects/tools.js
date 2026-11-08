// NEXORA #016 : détection automatique du framework d'un projet importé et des outils indispensables à son
// fonctionnement (Node.js, Flutter, Python, PHP…). S'il en manque, une fenêtre propose de les télécharger
// depuis leurs sites officiels et de les configurer, sans droits d'administrateur (src/tools.js).
// NEXORA #076 : les outils ne sont plus nommés dans l'interface ; ils forment la « Bibliothèque NEXORA »,
// chargée avec un message unique (le détail reste dans le journal technique local).
import { api, state, settings, saveSettings, esc, ico, toast, sheet, closeSheet, $ } from '../core.js';
import { g as currentSheet, i as toggleRow, k as stepsHtml } from '../../dist/chunks/chunk-6ZWS5EFO.js';
import { h as startResponsiveProject } from '../../dist/chunks/chunk-EWSFHS6Y.js';

const SHEET = 'nx-tools';
const later = new Set(); // dossiers dont l'installation a été remise à plus tard (jusqu'au redémarrage)
const greeted = new Set(); // dossiers déjà annoncés comme « reconnus »
let ui = null; // fenêtre ouverte : { mode, detection, origin, status }
let installing = false;
let logLines = [];
const LIB_MSG = 'Bibliothèque en cours de chargement, veuillez patienter quelques minutes';

const autoCheck = () => settings.nxToolsAuto !== false;
const userPathOn = () => settings.nxToolsUserPath !== false;
const key = (dir) => String(dir || '').replace(/[\\/]+$/, '').toLowerCase();
const plural = (n, one, many) => (n > 1 ? many : one);

// Résumé de la bibliothèque : un seul bloc, sans nom d'outil ni version.
function libRow(tools, { pick = false, manage = false } = {}) {
  const missing = tools.filter((t) => !t.ok);
  const auto = missing.filter((t) => t.auto);
  const manual = missing.filter((t) => !t.auto);
  const managed = tools.filter((t) => t.ok && t.managed);
  const ok = !missing.length;
  const state0 = ok ? 'ok' : 'bad';
  let txt = 'Prête : tout ce dont tes projets ont besoin est disponible.';
  if (auto.length) txt = `${plural(auto.length, 'Un élément', `${auto.length} éléments`)} à charger, une seule fois.`;
  else if (manual.length) txt = 'Un complément doit être ajouté à la main (instructions ci-dessous).';
  const picks = pick ? auto.map((t) => `<input type="checkbox" data-nx-tpick="${esc(t.id)}" checked hidden>`).join('') : '';
  let side = '';
  if (manage) {
    side = [
      auto.length ? `<button class="btn small" data-nx-tgo>${ico('download', 13)}<span>Charger</span></button>` : '',
      managed.length ? `<button class="btn small" data-nx-tfree title="Retire les éléments chargés par NEXORA ; ils seront rechargés au besoin">${ico('trash', 13)}<span>Libérer l’espace</span></button>` : '',
    ].join('');
  }
  return `<div class="nx-tl-row ${state0}">${picks}
    <span class="nx-tl-ico">${ico(ok ? 'check' : 'download', 15)}</span>
    <div class="nx-tl-main"><b>Bibliothèque NEXORA</b>${managed.length ? `<span class="nx-tl-tag">${managed.length} ${plural(managed.length, 'élément chargé', 'éléments chargés')}</span>` : ''}<small class="nx-tl-state">${txt}</small></div>
    <div class="nx-tl-side">${side}</div>
  </div>`;
}

function manualHtml(tools) {
  const manual = tools.filter((t) => !t.ok && !t.auto && t.steps && t.steps.length);
  if (!manual.length) return '';
  return `<details class="nx-tl-manual"><summary>Instructions pour l’ajouter à la main</summary>${manual.map((t) => `<section class="sdk-block">${stepsHtml(t.steps)}</section>`).join('')}</details>`;
}

function progressHtml() {
  return `<div class="nx-tl-prog" data-nx-tprog hidden>
    <div class="nx-tl-progtop"><span class="spinner small"></span><b data-nx-tstep>Préparation…</b><span class="grow"></span><small data-nx-tpct></small></div>
    <div class="nx-tl-bar"><i data-nx-tbar></i></div>
    <details class="nx-tl-log"><summary>Journal de l’installation</summary><pre data-nx-tlog></pre></details>
  </div>`;
}

function optionsHtml() {
  return `<div class="nx-tl-opts">${toggleRow('nxToolsUserPath', 'Ajouter aussi au PATH de ton compte Windows', 'Les terminaux et éditeurs ouverts hors de NEXORA trouveront ces outils.', userPathOn())}</div>`;
}

// ---------------------------------------------------------------- fenêtre « outils à installer »
function detectionHtml(d) {
  const missing = d.tools.filter((t) => !t.ok);
  const auto = missing.filter((t) => t.auto);
  const title = missing.length
    ? `La bibliothèque NEXORA doit être chargée pour ${d.name || 'ce projet'}`
    : `${d.name || 'Ce projet'} est prêt à être lancé`;
  const sub = `<b>${esc(d.label)}</b> détecté. ${missing.length ? 'NEXORA charge ce qu’il faut depuis des sources officielles vérifiées et le configure pour toi.' : 'La bibliothèque NEXORA est prête.'}`;
  return `<div class="sheet-head"><span class="sheet-icon${missing.length ? ' warn' : ''}">${ico(missing.length ? 'wrench' : 'pass', 22)}</span><div><h2>${esc(title)}</h2><p>${sub}</p></div></div>
    <div class="sheet-body nx-tl-body">
      <div class="nx-tl-list">${libRow(d.tools, { pick: true })}</div>
      ${progressHtml()}
      ${auto.length ? optionsHtml() : ''}
      <p class="sheet-note">Chargée dans le dossier de NEXORA, sans droits d’administrateur, avec vérification des fichiers téléchargés. Le projet reste isolé : ses dépendances restent dans son dossier et sa session web lui est propre.</p>
      ${manualHtml(d.tools)}
    </div>
    <div class="sheet-foot">
      <button class="btn" data-nx-tmanage>${ico('wrench', 14)}<span>Bibliothèque</span></button><span class="grow"></span>
      <button class="btn" data-nx-tclose>${missing.length ? 'Plus tard' : 'Fermer'}</button>
      ${auto.length ? `<button class="btn primary" data-nx-tgo data-autofocus>${ico('download', 14)}<span>Charger la bibliothèque</span></button>` : ''}
      ${!missing.length ? `<button class="btn primary" data-nx-trun data-autofocus>${ico('play', 14)}<span>Lancer le projet</span></button>` : ''}
    </div>`;
}

export function openDetection(d, origin) {
  if (!d || !d.tools) return;
  ui = { mode: 'detect', detection: d, origin };
  logLines = [];
  const el = sheet(SHEET, detectionHtml(d), { wide: true, onClose: () => { if (ui && ui.mode === 'detect' && !installing && ui.detection.missing.length) later.add(key(d.dir)); ui = null; } });
  if (el) el.classList.add('nx-tl-sheet');
}

// ---------------------------------------------------------------- gestionnaire d'outils
function managerHtml(st) {
  const tools = st ? st.tools : [];
  return `<div class="sheet-head"><span class="sheet-icon">${ico('wrench', 22)}</span><div><h2>Bibliothèque NEXORA</h2><p>NEXORA reconnaît le framework de chaque projet que tu ouvres ou importes et vérifie que sa bibliothèque contient ce dont il a besoin.</p></div></div>
    <div class="sheet-body nx-tl-body">
      <div class="nx-tl-opts">${toggleRow('nxToolsAuto', 'Vérifier la bibliothèque à l’ouverture d’un projet', 'S’il manque quelque chose, la fenêtre de chargement s’ouvre automatiquement.', autoCheck())}${toggleRow('nxToolsUserPath', 'Ajouter aussi au PATH de ton compte Windows', 'Pour les terminaux et éditeurs ouverts hors de NEXORA.', userPathOn())}</div>
      ${progressHtml()}
      <div class="nx-tl-list">${st ? libRow(tools, { manage: true, pick: true }) + manualHtml(tools) : '<div class="nx-tl-wait"><span class="spinner small"></span><span>Vérification de la bibliothèque…</span></div>'}</div>
      <div data-nx-tstepsbox></div>
    </div>
    <div class="sheet-foot">
      <button class="btn" data-nx-tdir>${ico('folderOpen', 14)}<span>Dossier de la bibliothèque</span></button><span class="grow"></span>
      <button class="btn primary" data-nx-tclose data-autofocus>Fermer</button>
    </div>`;
}

export async function openManager() {
  ui = { mode: 'manage', status: null };
  logLines = [];
  const el = sheet(SHEET, managerHtml(null), { wide: true, onClose: () => { ui = null; } });
  if (el) el.classList.add('nx-tl-sheet');
  await refreshManager();
}

async function refreshManager() {
  let st = null;
  try { st = await api.invoke('tools:status'); } catch (e) {
    if (!ui || ui.mode !== 'manage') return;
    $('.nx-tl-list', $('#sheet')).innerHTML = `<p class="nx-tl-err">${esc(e.message || e)}</p>`;
    return;
  }
  if (!ui || ui.mode !== 'manage' || currentSheet() !== SHEET) return;
  ui.status = st;
  const box = $('#sheet');
  $('.nx-tl-list', box).innerHTML = libRow(st.tools, { manage: true, pick: true }) + manualHtml(st.tools);
}

// ---------------------------------------------------------------- installation
function setBusy(on) {
  installing = on;
  const box = $('#sheet');
  if (!box) return;
  const prog = $('[data-nx-tprog]', box);
  if (prog) prog.hidden = !on && !logLines.length;
  for (const b of box.querySelectorAll('[data-nx-tgo],[data-nx-tfree],[data-nx-tpick],[data-toggle="nxToolsUserPath"]')) b.disabled = on;
  const go = $('.sheet-foot [data-nx-tgo]', box);
  const close = $('[data-nx-tclose]', box);
  if (close) close.textContent = on ? 'Annuler le chargement' : (ui && ui.mode === 'detect' ? 'Plus tard' : 'Fermer');
  if (go) go.hidden = on;
  const spin = $('.nx-tl-progtop .spinner', box);
  if (spin) spin.hidden = !on;
}

function onProgress(p) {
  const box = currentSheet() === SHEET ? $('#sheet') : null;
  if (p.phase === 'log' && p.line) { logLines.push(p.line); if (logLines.length > 400) logLines.shift(); }
  if (!box) return;
  const prog = $('[data-nx-tprog]', box);
  if (prog) prog.hidden = false;
  if (p.phase === 'log') { const pre = $('[data-nx-tlog]', box); if (pre) { pre.textContent = logLines.join('\n'); pre.scrollTop = pre.scrollHeight; } return; }
  const count = p.count || 1;
  const overall = p.progress != null ? ((p.index || 0) + p.progress) / count : null;
  let text = null;
  if (p.phase === 'step' || p.phase === 'download' || p.phase === 'extract' || p.phase === 'done') text = LIB_MSG;
  else if (p.phase === 'error') text = p.message;
  else if (p.phase === 'all-done') text = 'Bibliothèque prête';
  if (text) $('[data-nx-tstep]', box).textContent = text;
  if (overall != null) {
    $('[data-nx-tbar]', box).style.width = `${Math.round(Math.min(1, overall) * 100)}%`;
    $('[data-nx-tpct]', box).textContent = `${Math.round(Math.min(1, overall) * 100)} %`;
  }
  if (p.phase === 'error' && prog) prog.classList.add('bad');
}

async function install(ids) {
  if (!ids.length) { toast('La bibliothèque est déjà prête.'); return; }
  logLines = [];
  const box = $('#sheet');
  if (box) { const prog = $('[data-nx-tprog]', box); prog.classList.remove('bad'); $('[data-nx-tlog]', box).textContent = ''; $('[data-nx-tbar]', box).style.width = '0%'; $('[data-nx-tpct]', box).textContent = ''; $('[data-nx-tstep]', box).textContent = LIB_MSG; }
  setBusy(true);
  let res;
  try {
    res = await api.invoke('tools:install', { ids, userPath: userPathOn() });
  } catch (e) {
    res = { ok: false, message: e.message || String(e) };
  }
  setBusy(false);
  if (!res.ok) {
    if (!res.cancelled) toast(res.message || 'L’installation a échoué.', { kind: 'bad' });
    else toast(res.message);
    if (box && currentSheet() === SHEET) { const step = $('[data-nx-tstep]', box); if (step) step.textContent = res.message || 'L’installation a échoué.'; $('[data-nx-tprog]', box).classList.add('bad'); }
    return;
  }
  toast('Bibliothèque NEXORA chargée et configurée.');
  if (ui && ui.mode === 'manage') { refreshManager(); return; }
  if (ui && ui.mode === 'detect') {
    const d = await api.invoke('tools:detect', { dir: ui.detection.dir }).catch(() => null);
    if (d && currentSheet() === SHEET) openDetection(d, ui.origin);
  }
}

function runProject() {
  const d = ui && ui.detection;
  closeSheet(SHEET);
  if (!d) return;
  const pv = state.devLab && state.devLab.preview;
  if (ui && ui.origin === 'dev' && pv && state.devLab.st && key(state.devLab.st.root) === key(d.dir)) {
    if (!pv.running) pv.toggleRun();
    return;
  }
  if (state.source && state.source.mode === 'project' && key(state.source.dir) === key(d.dir)) { startResponsiveProject(); return; }
  if (pv && state.devLab.st && key(state.devLab.st.root) === key(d.dir) && !pv.running) { pv.toggleRun(); return; }
  toast('Bibliothèque prête. Lance le projet depuis le Dev Lab ou le Responsive Lab.');
}

// ---------------------------------------------------------------- détection à l'ouverture d'un projet
function onDetected(d) {
  if (!d || !d.tools || d.unsupported) return;
  const k = key(d.dir);
  if (!d.missing.length) {
    if (greeted.has(k)) return;
    greeted.add(k);
    toast(`Projet reconnu : ${d.label}. Bibliothèque prête.`);
    return;
  }
  if (installing || (ui && currentSheet() === SHEET)) return;
  if (!autoCheck() || later.has(k) || (currentSheet() && currentSheet() !== SHEET)) {
    toast(`${d.label} détecté : la bibliothèque NEXORA doit être chargée.`, { kind: 'bad', action: 'Charger', onAction: () => openDetection(d, d.origin) });
    return;
  }
  openDetection(d, d.origin);
}

/** Avant de lancer un projet : vrai si tous les outils sont là, sinon ouvre la fenêtre d'installation. */
export async function ensureTools(dir, origin) {
  let d = null;
  try { d = await api.invoke('tools:detect', { dir }); } catch { return true; }
  if (!d || d.unsupported || !d.missing.length) return true;
  openDetection(d, origin);
  return false;
}

export function installTools() {
  api.on('tools:detected', onDetected);
  api.on('tools:progress', onProgress);
  window.__nxTools = {
    open: (d, origin) => openDetection(d, origin),
    ensure: (dir, origin) => ensureTools(dir, origin),
    manage: () => openManager(),
  };
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-nx-tools]')) { openManager(); return; }
    const box = e.target.closest('#sheet');
    if (!box || currentSheet() !== SHEET) return;
    const t = e.target.closest('button');
    if (!t) return;
    if (t.matches('[data-nx-tclose]')) {
      if (installing) { api.invoke('tools:cancel').catch(() => {}); return; }
      closeSheet(SHEET);
    } else if (t.matches('[data-nx-tgo]')) {
      install([...box.querySelectorAll('[data-nx-tpick]:checked')].map((i) => i.dataset.nxTpick));
    } else if (t.matches('[data-nx-tfree]')) {
      const ids = ((ui && ui.status && ui.status.tools) || []).filter((x) => x.ok && x.managed).map((x) => x.id);
      t.disabled = true;
      Promise.all(ids.map((id) => api.invoke('tools:remove', id))).then(() => { toast('Espace libéré. La bibliothèque sera rechargée au besoin.'); refreshManager(); }, (err) => { t.disabled = false; toast(err.message || String(err), { kind: 'bad' }); });
    } else if (t.matches('[data-nx-tdir]')) {
      api.invoke('tools:open-dir').catch((err) => toast(err.message || String(err), { kind: 'bad' }));
    } else if (t.matches('[data-nx-tmanage]')) {
      openManager();
    } else if (t.matches('[data-nx-trun]')) {
      runProject();
    }
  });
  document.addEventListener('change', (e) => {
    const inp = e.target.closest('#sheet [data-toggle]');
    if (!inp || currentSheet() !== SHEET) return;
    if (inp.dataset.toggle === 'nxToolsAuto') settings.nxToolsAuto = inp.checked;
    if (inp.dataset.toggle === 'nxToolsUserPath') settings.nxToolsUserPath = inp.checked;
    saveSettings();
  });
}
