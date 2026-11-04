// NEXORA #016 : détection automatique du framework d'un projet importé et des outils indispensables à son
// fonctionnement (Node.js, Flutter, Python, PHP…). S'il en manque, une fenêtre propose de les télécharger
// depuis leurs sites officiels et de les configurer, sans droits d'administrateur (src/tools.js).
import { api, state, settings, saveSettings, esc, ico, toast, sheet, closeSheet, $ } from '../core.js';
import { g as currentSheet, i as toggleRow, k as stepsHtml } from '../../dist/chunks/chunk-6ZWS5EFO.js';
import { h as startResponsiveProject } from '../../dist/chunks/chunk-EWSFHS6Y.js';

const SHEET = 'nx-tools';
const later = new Set(); // dossiers dont l'installation a été remise à plus tard (jusqu'au redémarrage)
const greeted = new Set(); // dossiers déjà annoncés comme « reconnus »
let ui = null; // fenêtre ouverte : { mode, detection, origin, status }
let installing = false;
let logLines = [];

const autoCheck = () => settings.nxToolsAuto !== false;
const userPathOn = () => settings.nxToolsUserPath !== false;
const key = (dir) => String(dir || '').replace(/[\\/]+$/, '').toLowerCase();
const plural = (n, one, many) => (n > 1 ? many : one);

function reason(t) {
  if (t.ok) return t.version ? esc(t.version) : 'Installé';
  if (t.outdated) return `Version ${esc(t.outdated.have)} trouvée : ce projet demande la ${esc(t.outdated.need)} ou plus`;
  return 'Introuvable sur cet ordinateur';
}

function toolRow(t, { pick = false, manage = false } = {}) {
  const state0 = t.ok ? 'ok' : 'bad';
  // Hors d'un projet (gestionnaire), les explications propres à un projet (« Ce projet contient… ») sont omises.
  const why = manage && /^Ce projet/.test(t.why || '') ? '' : t.why;
  const managed = t.managed ? `<span class="nx-tl-tag">Installé par NEXORA</span>` : '';
  let side = '';
  if (pick && !t.ok) {
    side = t.auto
      ? `<label class="nx-tl-pick"><input type="checkbox" data-nx-tpick="${esc(t.id)}" checked><span>${t.size ? esc(t.size) : 'Installer'}</span></label>`
      : '<span class="nx-tl-tag">À installer à la main</span>';
  }
  if (manage) {
    side = [
      !t.ok && t.auto ? `<button class="btn small" data-nx-tinstall="${esc(t.id)}">${ico('download', 13)}<span>Installer</span></button>` : '',
      t.ok && t.managed ? `<button class="btn small" data-nx-tremove="${esc(t.id)}" title="Retirer ${esc(t.label)} (installé par NEXORA)">${ico('trash', 13)}</button>` : '',
      !t.ok && !t.auto ? `<button class="btn small" data-nx-tsteps="${esc(t.id)}">Instructions</button>` : '',
      t.size && !t.ok ? `<small class="nx-tl-size">${esc(t.size)}</small>` : '',
    ].join('');
  }
  return `<div class="nx-tl-row ${state0}">
    <span class="nx-tl-ico">${ico(t.ok ? 'check' : 'warn', 15)}</span>
    <div class="nx-tl-main"><b>${esc(t.label)}</b>${managed}<small class="nx-tl-state">${reason(t)}</small>${why ? `<small class="nx-tl-why">${esc(why)}</small>` : ''}</div>
    <div class="nx-tl-side">${side}</div>
  </div>`;
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
  const manual = missing.filter((t) => t.steps && t.steps.length);
  const title = missing.length
    ? `${plural(missing.length, 'Un outil manque', `${missing.length} outils manquent`)} pour ${d.name || 'ce projet'}`
    : `${d.name || 'Ce projet'} est prêt à être lancé`;
  const sub = `<b>${esc(d.label)}</b> détecté. ${missing.length ? 'NEXORA peut les télécharger depuis leurs sites officiels et les configurer pour toi.' : 'Tous les outils indispensables sont installés.'}`;
  return `<div class="sheet-head"><span class="sheet-icon${missing.length ? ' warn' : ''}">${ico(missing.length ? 'wrench' : 'pass', 22)}</span><div><h2>${esc(title)}</h2><p>${sub}</p></div></div>
    <div class="sheet-body nx-tl-body">
      <div class="nx-tl-list">${d.tools.map((t) => toolRow(t, { pick: true })).join('')}</div>
      ${progressHtml()}
      ${auto.length ? optionsHtml() : ''}
      <p class="sheet-note">Installés dans le dossier des outils de NEXORA, sans droits d’administrateur, avec vérification des fichiers téléchargés. Le projet reste isolé : ses dépendances restent dans son dossier et sa session web lui est propre.</p>
      ${manual.length ? `<details class="nx-tl-manual"><summary>Installer à la main</summary>${manual.map((t) => `<section class="sdk-block"><h3>${esc(t.label)}</h3>${stepsHtml(t.steps)}</section>`).join('')}</details>` : ''}
    </div>
    <div class="sheet-foot">
      <button class="btn" data-nx-tmanage>${ico('wrench', 14)}<span>Tous les outils</span></button><span class="grow"></span>
      <button class="btn" data-nx-tclose>${missing.length ? 'Plus tard' : 'Fermer'}</button>
      ${auto.length ? `<button class="btn primary" data-nx-tgo data-autofocus>${ico('download', 14)}<span>Télécharger et configurer</span></button>` : ''}
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
  return `<div class="sheet-head"><span class="sheet-icon">${ico('wrench', 22)}</span><div><h2>Outils de développement</h2><p>NEXORA reconnaît le framework de chaque projet que tu ouvres ou importes et vérifie les outils dont il a besoin.</p></div></div>
    <div class="sheet-body nx-tl-body">
      <div class="nx-tl-opts">${toggleRow('nxToolsAuto', 'Vérifier les outils à l’ouverture d’un projet', 'Si un outil manque, la fenêtre d’installation s’ouvre automatiquement.', autoCheck())}${toggleRow('nxToolsUserPath', 'Ajouter aussi au PATH de ton compte Windows', 'Pour les terminaux et éditeurs ouverts hors de NEXORA.', userPathOn())}</div>
      ${progressHtml()}
      <div class="nx-tl-list">${st ? tools.map((t) => toolRow(t, { manage: true })).join('') : '<div class="nx-tl-wait"><span class="spinner small"></span><span>Vérification des outils installés…</span></div>'}</div>
      <div data-nx-tstepsbox></div>
    </div>
    <div class="sheet-foot">
      <button class="btn" data-nx-tdir>${ico('folderOpen', 14)}<span>Dossier des outils</span></button><span class="grow"></span>
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
  $('.nx-tl-list', box).innerHTML = st.tools.map((t) => toolRow(t, { manage: true })).join('');
}

// ---------------------------------------------------------------- installation
function setBusy(on) {
  installing = on;
  const box = $('#sheet');
  if (!box) return;
  const prog = $('[data-nx-tprog]', box);
  if (prog) prog.hidden = !on && !logLines.length;
  for (const b of box.querySelectorAll('[data-nx-tgo],[data-nx-tinstall],[data-nx-tremove],[data-nx-tpick],[data-toggle="nxToolsUserPath"]')) b.disabled = on;
  const go = $('[data-nx-tgo]', box);
  const close = $('[data-nx-tclose]', box);
  if (close) close.textContent = on ? 'Annuler l’installation' : (ui && ui.mode === 'detect' ? 'Plus tard' : 'Fermer');
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
  const label = p.label ? `${count > 1 ? `${(p.index || 0) + 1}/${count} · ` : ''}${p.label}` : '';
  let text = null;
  if (p.phase === 'step') text = `${label} : ${p.message}`;
  else if (p.phase === 'download') text = `${label} : téléchargement${p.total ? ` (${Math.round(p.got / 1048576)} / ${Math.round(p.total / 1048576)} Mo)` : ''}`;
  else if (p.phase === 'extract') text = `${label} : décompression`;
  else if (p.phase === 'done') text = `${p.label} ${p.version || ''} prêt`;
  else if (p.phase === 'error') text = p.message;
  else if (p.phase === 'all-done') text = 'Installation terminée';
  if (text) $('[data-nx-tstep]', box).textContent = text;
  if (overall != null) {
    $('[data-nx-tbar]', box).style.width = `${Math.round(Math.min(1, overall) * 100)}%`;
    $('[data-nx-tpct]', box).textContent = `${Math.round(Math.min(1, overall) * 100)} %`;
  }
  if (p.phase === 'done') {
    const row = box.querySelector(`[data-nx-tpick="${p.id}"], [data-nx-tinstall="${p.id}"]`);
    const r = row && row.closest('.nx-tl-row');
    if (r) { r.classList.replace('bad', 'ok'); $('.nx-tl-ico', r).innerHTML = ico('check', 15); $('.nx-tl-state', r).textContent = p.version || 'Installé'; }
  }
  if (p.phase === 'error' && prog) prog.classList.add('bad');
}

async function install(ids) {
  if (!ids.length) { toast('Coche au moins un outil à installer.', { kind: 'bad' }); return; }
  logLines = [];
  const box = $('#sheet');
  if (box) { const prog = $('[data-nx-tprog]', box); prog.classList.remove('bad'); $('[data-nx-tlog]', box).textContent = ''; $('[data-nx-tbar]', box).style.width = '0%'; $('[data-nx-tpct]', box).textContent = ''; $('[data-nx-tstep]', box).textContent = 'Recherche des dernières versions…'; }
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
  const names = res.done.map((t) => t.label).join(', ');
  toast(`${names} ${res.done.length > 1 ? 'sont installés et configurés' : 'est installé et configuré'}.`);
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
  toast('Outils prêts. Lance le projet depuis le Dev Lab ou le Responsive Lab.');
}

function showManualSteps(id) {
  const t = ui && ui.status && ui.status.tools.find((x) => x.id === id);
  const box = $('[data-nx-tstepsbox]', $('#sheet'));
  if (!t || !box) return;
  box.innerHTML = `<section class="sdk-block nx-tl-steps"><h3>Installer ${esc(t.label)}</h3><p class="muted">${esc(t.why || '')}</p>${stepsHtml(t.steps)}</section>`;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ---------------------------------------------------------------- détection à l'ouverture d'un projet
function onDetected(d) {
  if (!d || !d.tools || d.unsupported) return;
  const k = key(d.dir);
  if (!d.missing.length) {
    if (greeted.has(k)) return;
    greeted.add(k);
    const ready = d.tools.map((t) => `${t.label}${t.version ? ` ${t.version.replace(/^v/i, '')}` : ''}`).join(', ');
    toast(`Projet reconnu : ${d.label}${ready ? `. Prêt : ${ready}.` : '.'}`);
    return;
  }
  if (installing || (ui && currentSheet() === SHEET)) return;
  const labels = d.tools.filter((t) => !t.ok).map((t) => t.label).join(', ');
  if (!autoCheck() || later.has(k) || (currentSheet() && currentSheet() !== SHEET)) {
    toast(`${d.label} détecté : il manque ${labels}.`, { kind: 'bad', action: 'Installer', onAction: () => openDetection(d, d.origin) });
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
    } else if (t.matches('[data-nx-tinstall]')) {
      install([t.dataset.nxTinstall]);
    } else if (t.matches('[data-nx-tremove]')) {
      const id = t.dataset.nxTremove;
      t.disabled = true;
      api.invoke('tools:remove', id).then(() => { toast('Outil retiré.'); refreshManager(); }, (err) => { t.disabled = false; toast(err.message || String(err), { kind: 'bad' }); });
    } else if (t.matches('[data-nx-tsteps]')) {
      showManualSteps(t.dataset.nxTsteps);
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
