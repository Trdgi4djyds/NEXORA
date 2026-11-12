// NEXORA #059 : version de NEXORA.
//  - « Nouveautés » : fenêtre montrée une fois après une mise à jour (réglage nxSeenVersion), jamais au premier
//    lancement (la visite guidée s'en charge) ; rouverte par openNotes().
//  - Mises à jour : NEXORA #115 : la source des mises à jour est interne au processus principal (src/maint.js) ;
//    les anciens réglages updateRepo et nxAutoRepo (nom du dépôt GitHub, visible dans les sauvegardes et la
//    synchronisation des réglages) sont effacés au démarrage.
// Chargé par nx/boot.js une fois les réglages lus.
import { api, settings, saveSettings, esc, ico, sheet, closeSheet } from '../core.js';
import { NOTES } from './notes.js';

const SHEET = 'nx-version-notes';
let version = '';

function css() {
  if (document.querySelector('link[data-nx-version]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.dataset.nxVersion = '';
  l.href = new URL('./version.css', import.meta.url).href;
  document.head.appendChild(l);
}

export const currentVersion = () => version;
export const hasNotes = () => !!NOTES[version];

async function go(space) {
  closeSheet(SHEET);
  if (!space) return;
  const { setMode } = await import('../../dist/chunks/toolbar-LJFELS7F.js');
  setMode(space);
}

export function openNotes() {
  const n = NOTES[version];
  if (!n) return;
  const items = n.items.map((i) => `<li class="nxv-item" ${i.space ? `data-nxv-go="${esc(i.space)}" tabindex="0" role="button"` : ''}>
      <span class="nxv-ic" data-space="${esc(i.space || 'home')}">${ico(i.icon, 18)}</span>
      <span class="nxv-txt"><b>${esc(i.title)}</b><small>${esc(i.text)}</small></span>
      ${i.space ? `<span class="nxv-open">${ico('chevronRight', 14)}</span>` : ''}
    </li>`).join('');
  const html = `<div class="sheet-head"><span class="sheet-icon">${ico('sparkle', 22)}</span><div><h2>Nouveautés de ${esc(n.title)}</h2><p>${esc(n.intro)}</p></div></div>
    <div class="sheet-body nxv"><ul class="nxv-list">${items}</ul></div>
    <div class="sheet-foot"><span class="nxv-badge">Version ${esc(version)}</span><span class="grow"></span><button class="btn primary" data-sheet="close">${ico('check', 14)}<span>C’est parti</span></button></div>`;
  const el = sheet(SHEET, html, { wide: true, onClose: () => { if (settings.nxSeenVersion !== version) { settings.nxSeenVersion = version; saveSettings(); } } });
  el.onclick = (e) => { const t = e.target.closest('[data-nxv-go]'); if (t) go(t.dataset.nxvGo); };
  el.onkeydown = (e) => { const t = e.target.closest('[data-nxv-go]'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(t.dataset.nxvGo); } };
}

function maybeShowNotes() {
  if (settings.nxSeenVersion === version) return;
  // Premier lancement : rien à annoncer, la visite guidée présente NEXORA.
  if (!settings.tourDone || !NOTES[version]) { settings.nxSeenVersion = version; saveSettings(); return; }
  // Après la préparation des outils et hors d'une autre fenêtre ouverte.
  const tryOpen = (n = 0) => {
    const busy = document.querySelector('#sheetBackdrop.open') || document.querySelector('.tour, .tour-backdrop');
    if (busy && n < 20) { setTimeout(() => tryOpen(n + 1), 1500); return; }
    if (!busy) openNotes();
  };
  setTimeout(tryOpen, 1200);
}

// NEXORA #115 : plus aucun nom de dépôt dans les réglages de l'utilisateur (la vérification des mises à jour n'en a
// plus besoin depuis le #114) ; ceux posés par les versions précédentes sont effacés.
async function autoRepo() {
  if (!('updateRepo' in settings) && !('nxAutoRepo' in settings)) return;
  delete settings.updateRepo;
  delete settings.nxAutoRepo;
  saveSettings();
}

export async function install() {
  css();
  try { version = String((await api.invoke('app:info')).version || ''); } catch { version = ''; }
  window.__nxVersion = { openNotes, currentVersion, hasNotes };
  if (version) maybeShowNotes();
  autoRepo().catch(() => {});
}
