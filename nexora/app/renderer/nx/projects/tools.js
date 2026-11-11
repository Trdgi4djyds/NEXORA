// NEXORA #016 : détection automatique du framework d'un projet importé et des outils indispensables à son
// fonctionnement (Node.js, Flutter, Python, PHP…). S'il en manque, une fenêtre propose de les télécharger
// depuis leurs sites officiels et de les configurer, sans droits d'administrateur (src/tools.js).
// NEXORA #076 : les outils ne sont plus nommés dans l'interface ; ils forment la « Bibliothèque NEXORA »,
// chargée avec un message unique (le détail reste dans le journal technique local).
// NEXORA #084 : deux actions seulement, « Mettre à jour les bibliothèques » et « Changer les bibliothèques » ; plus de
// journal d'installation, d'instructions manuelles, de réglage du PATH, de dossier ni de message d'erreur technique.
import { api, state, settings, saveSettings, esc, ico, toast, sheet, closeSheet, $ } from '../core.js';
import { g as currentSheet, i as toggleRow } from '../../dist/chunks/chunk-6ZWS5EFO.js';
import { h as startResponsiveProject } from '../../dist/chunks/chunk-EWSFHS6Y.js';

const SHEET = 'nx-tools';
const later = new Set(); // dossiers dont l'installation a été remise à plus tard (jusqu'au redémarrage)
const greeted = new Set(); // dossiers déjà annoncés comme « reconnus »
let ui = null; // fenêtre ouverte : { mode, detection, origin, status }
let installing = false;
let logLines = [];
const LIB_MSG = 'Mise à jour des bibliothèques, patiente quelques minutes…';
const FAIL_MSG = 'La mise à jour des bibliothèques a échoué. Réessaie dans un instant.';

const autoCheck = () => settings.nxToolsAuto !== false;
const userPathOn = () => settings.nxToolsUserPath !== false;
const key = (dir) => String(dir || '').replace(/[\\/]+$/, '').toLowerCase();

// Résumé des bibliothèques : un seul bloc, sans nom d'outil, version ni nombre d'éléments.
function libRow(tools, { pick = false, manage = false } = {}) {
  const missing = tools.filter((t) => !t.ok);
  const auto = missing.filter((t) => t.auto);
  const managed = tools.filter((t) => t.ok && t.managed);
  const ok = !missing.length;
  const txt = ok ? 'À jour.' : auto.length ? 'Une mise à jour est nécessaire.' : 'Une mise à jour est nécessaire sur ce PC.';
  const picks = pick ? auto.map((t) => `<input type="checkbox" data-nx-tpick="${esc(t.id)}" checked hidden>`).join('') : '';
  const side = manage ? [
    auto.length ? `<button class="btn small primary" data-nx-tgo>${ico('download', 13)}<span>Mettre à jour les bibliothèques</span></button>` : '',
    managed.length ? `<button class="btn small" data-nx-tchange>${ico('refreshCw', 13)}<span>Changer les bibliothèques</span></button>` : '',
  ].join('') : '';
  return `<div class="nx-tl-row ${ok ? 'ok' : 'bad'}">${picks}
    <span class="nx-tl-ico">${ico(ok ? 'check' : 'download', 15)}</span>
    <div class="nx-tl-main"><b>Bibliothèques NEXORA</b><small class="nx-tl-state">${txt}</small></div>
    <div class="nx-tl-side">${side}</div>
  </div>`;
}

function progressHtml() {
  return `<div class="nx-tl-prog" data-nx-tprog hidden>
    <div class="nx-tl-progtop"><span class="spinner small"></span><b data-nx-tstep>${LIB_MSG}</b><span class="grow"></span><small data-nx-tpct></small></div>
    <div class="nx-tl-bar"><i data-nx-tbar></i></div>
  </div>`;
}

// ---------------------------------------------------------------- fenêtre « outils à installer »
function detectionHtml(d) {
  const missing = d.tools.filter((t) => !t.ok);
  const auto = missing.filter((t) => t.auto);
  const title = missing.length ? 'Mettre à jour les bibliothèques' : `${d.name || 'Ce projet'} est prêt à être lancé`;
  const sub = missing.length ? `${esc(d.name || 'Ce projet')} a besoin d’une mise à jour des bibliothèques de NEXORA.` : 'Les bibliothèques sont à jour.';
  return `<div class="sheet-head"><span class="sheet-icon${missing.length ? ' warn' : ''}">${ico(missing.length ? 'download' : 'pass', 22)}</span><div><h2>${esc(title)}</h2><p>${sub}</p></div></div>
    <div class="sheet-body nx-tl-body">
      <div class="nx-tl-list">${libRow(d.tools, { pick: true })}</div>
      ${progressHtml()}
    </div>
    <div class="sheet-foot">
      <span class="grow"></span>
      <button class="btn" data-nx-tclose>${missing.length ? 'Plus tard' : 'Fermer'}</button>
      ${auto.length ? `<button class="btn primary" data-nx-tgo data-autofocus>${ico('download', 14)}<span>Mettre à jour les bibliothèques</span></button>` : ''}
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
  return `<div class="sheet-head"><span class="sheet-icon">${ico('download', 22)}</span><div><h2>Bibliothèques</h2><p>Mets à jour les bibliothèques dont tes projets ont besoin.</p></div></div>
    <div class="sheet-body nx-tl-body">
      <div class="nx-tl-opts">${toggleRow('nxToolsAuto', 'Vérifier les bibliothèques à l’ouverture d’un projet', 'S’il faut les mettre à jour, NEXORA te le propose.', autoCheck())}</div>
      ${progressHtml()}
      <div class="nx-tl-list">${st ? libRow(tools, { manage: true, pick: true }) : '<div class="nx-tl-wait"><span class="spinner small"></span><span>Vérification des bibliothèques…</span></div>'}</div>
    </div>
    <div class="sheet-foot">
      <span class="grow"></span>
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
    $('.nx-tl-list', $('#sheet')).innerHTML = '<p class="nx-tl-err">Vérification des bibliothèques impossible pour le moment.</p>';
    return;
  }
  if (!ui || ui.mode !== 'manage' || currentSheet() !== SHEET) return;
  ui.status = st;
  const box = $('#sheet');
  $('.nx-tl-list', box).innerHTML = libRow(st.tools, { manage: true, pick: true });
}

// ---------------------------------------------------------------- installation
function setBusy(on) {
  installing = on;
  const box = $('#sheet');
  if (!box) return;
  const prog = $('[data-nx-tprog]', box);
  if (prog) prog.hidden = !on && !logLines.length;
  for (const b of box.querySelectorAll('[data-nx-tgo],[data-nx-tchange],[data-nx-tpick]')) b.disabled = on;
  const go = $('.sheet-foot [data-nx-tgo]', box);
  const close = $('[data-nx-tclose]', box);
  if (close) close.textContent = on ? 'Annuler la mise à jour' : (ui && ui.mode === 'detect' ? 'Plus tard' : 'Fermer');
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
  if (p.phase === 'log') return; // journal gardé en mémoire, jamais affiché
  const count = p.count || 1;
  const overall = p.progress != null ? ((p.index || 0) + p.progress) / count : null;
  let text = null;
  if (p.phase === 'step' || p.phase === 'download' || p.phase === 'extract' || p.phase === 'done') text = LIB_MSG;
  else if (p.phase === 'error') text = FAIL_MSG;
  else if (p.phase === 'all-done') text = 'Bibliothèques à jour';
  if (text) $('[data-nx-tstep]', box).textContent = text;
  if (overall != null) {
    $('[data-nx-tbar]', box).style.width = `${Math.round(Math.min(1, overall) * 100)}%`;
    $('[data-nx-tpct]', box).textContent = `${Math.round(Math.min(1, overall) * 100)} %`;
  }
  if (p.phase === 'error' && prog) prog.classList.add('bad');
}

async function install(ids) {
  if (!ids.length) { toast('Les bibliothèques sont déjà à jour.'); return; }
  logLines = [];
  const box = $('#sheet');
  if (box) { const prog = $('[data-nx-tprog]', box); prog.classList.remove('bad'); $('[data-nx-tbar]', box).style.width = '0%'; $('[data-nx-tpct]', box).textContent = ''; $('[data-nx-tstep]', box).textContent = LIB_MSG; }
  setBusy(true);
  let res;
  try {
    res = await api.invoke('tools:install', { ids, userPath: userPathOn() });
  } catch (e) {
    res = { ok: false, message: e.message || String(e) };
  }
  setBusy(false);
  if (!res.ok) {
    const msg = res.cancelled ? 'Mise à jour des bibliothèques annulée.' : FAIL_MSG;
    toast(msg, res.cancelled ? {} : { kind: 'bad' });
    if (box && currentSheet() === SHEET) { const step = $('[data-nx-tstep]', box); if (step) step.textContent = msg; $('[data-nx-tprog]', box).classList.add('bad'); }
    return;
  }
  toast('Bibliothèques mises à jour.');
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
  toast('Bibliothèques à jour. Lance le projet depuis le Dev Lab ou le Responsive Lab.');
}

// ---------------------------------------------------------------- détection à l'ouverture d'un projet
function onDetected(d) {
  if (!d || !d.tools || d.unsupported) return;
  const k = key(d.dir);
  if (!d.missing.length) {
    if (greeted.has(k)) return;
    greeted.add(k);
    toast('Projet reconnu : bibliothèques à jour.');
    return;
  }
  if (installing || (ui && currentSheet() === SHEET)) return;
  if (!autoCheck() || later.has(k) || (currentSheet() && currentSheet() !== SHEET)) {
    toast('Ce projet a besoin d’une mise à jour des bibliothèques.', { kind: 'bad', action: 'Mettre à jour', onAction: () => openDetection(d, d.origin) });
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
    } else if (t.matches('[data-nx-tchange]')) {
      // Changer les bibliothèques : celles de NEXORA sont retirées puis rechargées (fichiers neufs).
      const ids = ((ui && ui.status && ui.status.tools) || []).filter((x) => x.ok && x.managed).map((x) => x.id);
      t.disabled = true;
      Promise.all(ids.map((id) => api.invoke('tools:remove', id))).then(() => install(ids), () => { t.disabled = false; toast(FAIL_MSG, { kind: 'bad' }); });
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
    saveSettings();
  });
}
