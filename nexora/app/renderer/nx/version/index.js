// NEXORA #059 : version de NEXORA.
//  - « Nouveautés » : fenêtre montrée une fois après une mise à jour (réglage nxSeenVersion), jamais au premier
//    lancement (la visite guidée s'en charge) ; rouverte par openNotes().
//  - Mises à jour : quand l'utilisateur n'a choisi aucun dépôt, celui de l'adresse de téléchargement publiée
//    (app_config.desktop_download_url, lisible sans compte) est pris s'il est sur GitHub ; un dépôt choisi à la main
//    n'est jamais remplacé (nxAutoRepo garde celui posé ici).
// Chargé par nx/boot.js une fois les réglages lus.
import { b as sb } from '../../dist/chunks/chunk-EZKHFSAB.js';
import { api, settings, saveSettings, esc, ico, sheet, closeSheet } from '../core.js';
import { NOTES, repoFromUrl } from './notes.js';

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

async function autoRepo() {
  if (window.__NEXORA_WEB__) return;
  let url = '';
  try {
    const { data } = await sb.from('app_config').select('value').eq('key', 'desktop_download_url').maybeSingle();
    url = data && typeof data.value === 'string' ? data.value : '';
  } catch { return; }
  const repo = repoFromUrl(url);
  if (!repo || settings.updateRepo === repo) return;
  if (settings.updateRepo && settings.updateRepo !== settings.nxAutoRepo) return;
  settings.updateRepo = repo;
  settings.nxAutoRepo = repo;
  saveSettings();
  // La vérification du démarrage est déjà passée (aucun dépôt à ce moment-là) : on la lance ici.
  if (settings.updateAuto === false) return;
  const m = await import('../../dist/chunks/maintenance-MDTLNMUF.js');
  setTimeout(() => m.checkUpdates().catch(() => {}), 15000);
}

export async function install() {
  css();
  try { version = String((await api.invoke('app:info')).version || ''); } catch { version = ''; }
  window.__nxVersion = { openNotes, currentVersion, hasNotes };
  if (version) maybeShowNotes();
  autoRepo().catch(() => {});
}
