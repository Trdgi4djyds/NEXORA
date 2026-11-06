// NEXORA #052 : socle commun des outils du Dev Lab (appels devx:*, offres, petites briques d'affichage).
import { api, esc, ico, toast, sheet, closeSheet, sheetHtml, menu, prompt, state, settings, saveSettings } from '../core.js';
import { current } from '../offres/status.js';
import { FALLBACK, normPlan } from '../offres/catalog.js';

export { api, esc, ico, toast, sheet, closeSheet, sheetHtml, menu, prompt, state, settings, saveSettings };
export const dev = () => state.devLab;
export const root = () => (state.devLab && state.devLab.st && state.devLab.st.root) || null;
export const projectName = () => { const r = root(); return r ? r.split(/[\\/]/).filter(Boolean).pop() : ''; };

// Message lisible d'une erreur renvoyée par le processus principal.
export const clean = (e) => String((e && e.message) || e || 'Erreur inconnue.').replace(/^Error invoking remote method '[^']+': (Error: )?/, '').replace(/^Error: /, '');
const PLAN_MSG = /fait partie de l’offre|demande un compte NEXORA/;
export async function call(channel, args = {}, { quiet = false } = {}) {
  try {
    return await api.invoke(channel, { root: root(), ...args });
  } catch (e) {
    const msg = clean(e);
    if (!quiet && !PLAN_MSG.test(msg)) toast(msg, { kind: 'bad' });
    const err = new Error(msg);
    err.plan = PLAN_MSG.test(msg);
    throw err;
  }
}

// Permission de l'offre (valeur par défaut de l'offre si les serveurs ne la connaissent pas encore).
export function has(perm) {
  if (!perm) return true;
  const s = current();
  if (s.admin) return true;
  if (s.perms && perm in s.perms) return !!s.perms[perm];
  const p = FALLBACK[normPlan(s.plan)] || FALLBACK.free;
  return !!p.perms[perm];
}
export function proGate(title, text) {
  return `<div class="nxd-gate">${ico('nxCrown', 22)}<div><b>${esc(title)} fait partie de l’offre Pro</b><p>${esc(text)}</p></div>
    <div class="nxd-row"><button class="btn small primary" data-nxo-ask="pro">Passer à Pro · 18 $ / mois</button><button class="btn small" data-nxo-offers>Voir les offres</button></div></div>`;
}

export const empty = (icon, title, text, action = '') => `<div class="nxd-empty">${ico(icon, 26)}<b>${esc(title)}</b><p>${esc(text)}</p>${action}</div>`;
export const noProject = () => empty('folderOpen', 'Aucun projet ouvert', 'Ouvre un dossier de projet dans le Dev Lab pour utiliser cet outil.', '<button class="btn small primary" data-nxd-open-project>Ouvrir un projet</button>');
export const head = (title, sub, actions = '') => `<div class="nxd-head"><div><h3>${esc(title)}</h3>${sub ? `<p>${sub}</p>` : ''}</div><div class="nxd-row">${actions}</div></div>`;
export const pill = (text, tone = '') => `<span class="nxd-pill ${tone}">${esc(text)}</span>`;
export const btn = (label, attrs = '', icon = '', cls = '') => `<button class="btn small ${cls}" ${attrs}>${icon ? ico(icon, 13) : ''}<span>${esc(label)}</span></button>`;
export const iconBtn = (icon, title, attrs = '') => `<button class="icon-btn nxd-ib" title="${esc(title)}" aria-label="${esc(title)}" ${attrs}>${ico(icon, 14)}</button>`;
export const spinner = (text = 'Chargement…') => `<div class="nxd-loading"><span class="spin"></span>${esc(text)}</div>`;
export const fmtMs = (ms) => (ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s` : `${Math.round(ms)} ms`);
export const fmtBytes = (n) => (n == null ? '—' : n >= 1048576 ? `${(n / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo` : n >= 1024 ? `${Math.round(n / 1024)} Ko` : `${n} o`);
export function ago(ts) {
  if (!ts) return '';
  const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
export const plain = (t) => String(t || '').replace(ANSI, '');

// Ouvre un fichier du projet dans l'éditeur du Dev Lab, à la ligne voulue.
export async function openFile(file, line, col) {
  const d = dev();
  const r = root();
  if (!d || !file) return;
  const abs = /^([A-Za-z]:[\\/]|\/)/.test(file) ? file : `${r}${r.includes('\\') ? '\\' : '/'}${file.replace(/\//g, r.includes('\\') ? '\\' : '/')}`;
  window.dispatchEvent(new CustomEvent('nxd:close'));
  if (d.st.mode === 'vscode' && d.setMode) d.setMode('vitrine');
  await d.openFile(abs, { line, col });
  if (line && d.editor) { d.editor.revealLineInCenter(line); d.editor.setPosition({ lineNumber: line, column: col || 1 }); d.editor.focus(); }
}
export const relPath = (abs) => { const r = root(); if (!r || !abs) return abs || ''; return abs.startsWith(r) ? abs.slice(r.length + 1).replace(/\\/g, '/') : abs; };

// Fenêtre de confirmation au format de NEXORA.
export function confirmSheet({ id = 'nxd-confirm', icon = 'warn', title, sub = '', body = '', go = 'Confirmer', wide = false }) {
  return new Promise((resolve) => {
    let ok = false;
    const s = sheet(id, sheetHtml({ icon, title, sub, body, go, goIcon: 'check' }), { wide, onClose: () => { if (!ok) resolve(false); } });
    s.addEventListener('click', (e) => { if (e.target.closest('[data-nx-go]')) { ok = true; closeSheet(id); resolve(true); } });
  });
}

// Préférences des outils, gardées dans les réglages de NEXORA.
export function prefs() { settings.nxDevPlus = settings.nxDevPlus || {}; return settings.nxDevPlus; }
export function projectPrefs() { const p = prefs(); const r = root() || '_'; p.projects = p.projects || {}; p.projects[r] = p.projects[r] || {}; return p.projects[r]; }
export const savePrefs = () => saveSettings();
