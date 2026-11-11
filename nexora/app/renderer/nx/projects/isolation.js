// NEXORA #016 : chaque projet NEXORA a sa propre session web (cookies, stockage local, IndexedDB, cache,
// service workers). Les aperçus des espaces (Responsive Lab, Browser Lab, Dev Lab, App Builder) utilisent
// la session du projet ouvert ; quand le projet change, leurs <webview> sont rattachées à la nouvelle
// session avant de charger la page. La session historique « persist:vitrine » reste celle du projet qui
// était ouvert lors de la mise à jour : ses connexions et données ne sont pas perdues.
import { api, state, settings, saveSettings } from '../core.js';
import { o as bus } from '../../dist/chunks/chunk-VBMWAH3C.js';
import { d as attachSourceToProject } from '../../dist/chunks/chunk-KSM5546V.js';

const LEGACY = 'persist:vitrine';
const NONE = 'persist:nx-hors-projet';

const projects = () => (Array.isArray(settings.projects) ? settings.projects : []);
const currentProject = () => projects().find((p) => p.id === settings.projectCur) || null;

// Projet qui garde la session historique : fixé une seule fois, à la première ouverture après la mise à jour.
function legacyOwner() {
  if (typeof settings.nxIsoLegacy !== 'string') {
    const p = currentProject() || [...projects()].sort((a, b) => (b.opened || 0) - (a.opened || 0))[0];
    settings.nxIsoLegacy = p ? String(p.id) : '';
    saveSettings();
  }
  return settings.nxIsoLegacy;
}

export function partitionFor(project) {
  if (!project || !project.id) return NONE;
  if (String(project.id) === legacyOwner()) return LEGACY;
  const id = String(project.id).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
  return id ? `persist:nx-${id}` : NONE;
}

let active = null;
export const currentPartition = () => active || partitionFor(currentProject());

// Rattache une <webview> à une autre session : retirée du document, nouvelle session, puis remise à sa place
// (Electron crée alors une nouvelle page dans la session demandée ; ses écouteurs restent en place).
function swap(el, part, url) {
  if (!el || el.getAttribute('partition') === part) return false;
  const parent = el.parentNode;
  const next = el.nextSibling;
  if (parent) el.remove();
  el.setAttribute('partition', part);
  if (url) el.setAttribute('src', url);
  if (parent) parent.insertBefore(el, next);
  return true;
}

function reattachAll(part) {
  const board = state.board;
  if (board && board.views) {
    for (const view of board.views.values()) {
      if (!view.wv || view.wv.getAttribute('partition') === part) continue;
      // L'appareil se réinitialise à la reconnexion (émulation, puis rechargement de son adresse).
      // NEXORA #107 : la nouvelle page n'a encore aucune émulation : la clé de la dernière émulation est oubliée, sinon
      // l'appareil sautait l'émulation (paramètres inchangés) et affichait le site en largeur de bureau.
      view.ready = false;
      view.emuKey = null;
      if (view.url) view.pendingUrl = view.url;
      swap(view.wv, part);
    }
  }
  const bl = state.browserLab;
  if (bl && bl.wv) swap(bl.wv, part, (bl.st && bl.st.url) || bl.url || '');
  const pv = state.devLab && state.devLab.preview;
  if (pv && pv.wv) swap(pv.wv, part, pv.url || '');
  const ab = state.android;
  if (ab && ab.wv && ab.wv.getAttribute('partition') !== part && typeof ab.dropWebview === 'function') {
    ab.dropWebview();
    try { ab.ensureWebview(); } catch { /* l'aperçu se recrée au prochain affichage */ }
  }
}

export async function syncPartition() {
  const part = partitionFor(currentProject());
  if (part !== active) {
    active = part;
    try { await api.invoke('project:isolate', { part }); } catch { /* aperçu navigateur : sans processus principal */ }
  }
  reattachAll(part);
  return part;
}

// Le Responsive Lab charge la page d'une nouvelle source avant de la rattacher à un projet : on rattache
// d'abord la source au projet (même calcul que NEXORA), puis la session, pour qu'aucune requête du
// nouveau site ne parte avec la session de l'ancien projet.
function guardBoard() {
  const board = state.board;
  if (!board || board.nxIsoGuard) return;
  board.nxIsoGuard = true;
  const loadAll = board.loadAll.bind(board);
  board.loadAll = (url) => {
    try {
      if (state.source && (state.source.url || state.source.dir)) attachSourceToProject(state.source);
      const part = partitionFor(currentProject());
      if (part !== active) { active = part; api.invoke('project:isolate', { part }).catch(() => {}); }
      reattachAll(part);
    } catch (e) { console.error('[NEXORA #016] isolation', e); }
    return loadAll(url);
  };
}

// Projet supprimé depuis « Tes projets » : sa session (cookies, stockage, cache) est effacée.
async function dropProject(id) {
  const part = partitionFor({ id });
  if (part === LEGACY || part === NONE) return;
  try { await api.invoke('project:isolation-drop', { part }); } catch { /* aperçu navigateur */ }
}

export function installIsolation() {
  window.nxPartition = () => currentPartition();
  window.nxDropProject = (id) => { dropProject(id); };
  bus.on('projects', () => { syncPartition(); });
  bus.on('source', () => { syncPartition(); });
  syncPartition();
  // Les espaces sont créés à leur première ouverture : protection et rattachement dès qu'ils existent.
  const timer = setInterval(() => {
    guardBoard();
    reattachAll(currentPartition());
    if (state.board && state.board.nxIsoGuard && state.browserLab && state.devLab && state.android) clearInterval(timer);
  }, 1000);
  guardBoard();
}
