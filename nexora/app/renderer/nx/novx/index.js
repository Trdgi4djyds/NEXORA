// NEXORA #076 : projets en fichiers .novx (src/novx.js) : export depuis le menu d'un projet de l'Accueil, import par
// le bouton « Importer un .novx » de l'Accueil, par double-clic sur un fichier (via le lanceur) ou par lien reçu.
// Le fichier réunit la fiche du projet, ses réglages, les documents NEX-DESIGN choisis et, au choix, son code
// (sans dépendances ni fichiers .env de secrets). Google Drive est proposé comme destination quand il est installé
// sur le PC ; sinon, un lien ouvre Google Drive dans le navigateur pour y déposer le fichier.
import { api, settings, esc, ico, toast, sheet, closeSheet } from '../core.js';
import { a as projects, k as nxNew, f as patchProject } from '../../dist/chunks/chunk-KSM5546V.js';

const SHEET = 'nx-novx';
const DRIVE_WEB = 'https://drive.google.com/drive/my-drive';
let drive = null;

// Documents NEX-DESIGN (IndexedDB « nexora-design », magasin « docs »).
function designDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('nexora-design', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('docs')) r.result.createObjectStore('docs', { keyPath: 'id' }); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function designDocs() {
  try {
    const db = await designDb();
    return await new Promise((resolve) => {
      const q = db.transaction('docs', 'readonly').objectStore('docs').getAll();
      q.onsuccess = () => resolve(q.result || []);
      q.onerror = () => resolve([]);
    });
  } catch { return []; }
}
async function putDesignDocs(list) {
  const valid = (list || []).filter((d) => d && typeof d === 'object' && Array.isArray(d.pages));
  if (!valid.length) return 0;
  const existing = new Set((await designDocs()).map((d) => d.id));
  const db = await designDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('docs', 'readwrite');
    const store = tx.objectStore('docs');
    for (const d of valid) {
      // Un document du PC n'est jamais écrasé : le document importé reçoit un nouvel identifiant.
      const doc = existing.has(d.id) ? { ...d, id: `${d.id}-${Date.now().toString(36)}`, name: `${d.name || 'Document'} (importé)` } : d;
      store.put({ ...doc, updated: Date.now() });
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  return valid.length;
}

const sizeText = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

// ---------------------------------------------------------------- export
async function openExport(projectId) {
  const p = projects().find((x) => x.id === projectId);
  if (!p) return;
  const [docs, d] = await Promise.all([designDocs(), drive || api.invoke('novx:drive').catch(() => ({ folders: [], web: DRIVE_WEB }))]);
  drive = d;
  const docsHtml = docs.length
    ? docs.slice(0, 60).map((doc) => `<label class="nxv-doc"><input type="checkbox" data-nxv-doc="${esc(doc.id)}"><span>${esc(doc.name || 'Sans titre')}</span><small>${plural((doc.pages || []).length, 'page', 'pages')}</small></label>`).join('')
    : '<p class="nxv-muted">Aucun document NEX-DESIGN sur ce PC.</p>';
  const driveHtml = d.folders.length
    ? `<label class="nxv-opt"><input type="radio" name="nxv-dest" value="drive" checked><span><b>Google Drive</b><small>${esc(d.folders[0])} : le fichier se synchronise avec ton Drive.</small></span></label>
       <label class="nxv-opt"><input type="radio" name="nxv-dest" value="docs"><span><b>Dossier Documents</b><small>Documents\\NEXORA\\Projets</small></span></label>`
    : `<label class="nxv-opt"><input type="radio" name="nxv-dest" value="docs" checked><span><b>Dossier Documents</b><small>Documents\\NEXORA\\Projets</small></span></label>
       <p class="nxv-hint">${ico('info', 13)}<span>Google Drive pour ordinateur n’est pas installé sur ce PC. Après l’export, tu pourras déposer le fichier sur Google Drive depuis ton navigateur.</span></p>`;
  const el = sheet(SHEET, `<div class="sheet-head"><span class="sheet-icon">${ico('download', 22)}</span><div><h2>Exporter « ${esc(p.name)} » en .novx</h2><p>Un seul fichier pour sauvegarder ton projet, le transférer sur un autre PC ou le partager.</p></div></div>
    <div class="sheet-body nxv-body">
      <section class="nxv-sec"><h3>Contenu</h3>
        <label class="nxv-opt"><input type="checkbox" checked disabled><span><b>Fiche et réglages du projet</b><small>Nom, adresse en ligne, logo, applications liées.</small></span></label>
        <label class="nxv-opt${p.dir ? '' : ' off'}"><input type="checkbox" data-nxv-code ${p.dir ? 'checked' : 'disabled'}><span><b>Code du projet</b><small>${p.dir ? `${esc(p.dir)} · sans dépendances (node_modules…) ni sorties de construction, qui se régénèrent.` : 'Ce projet n’a pas de dossier de code.'}</small></span></label>
        <label class="nxv-opt${p.dir ? '' : ' off'}"><input type="checkbox" data-nxv-env ${p.dir ? '' : 'disabled'}><span><b>Fichiers de secrets .env</b><small>Déconseillé : quiconque reçoit le fichier pourrait lire tes clés.</small></span></label>
      </section>
      <section class="nxv-sec"><h3>Documents NEX-DESIGN</h3><div class="nxv-docs">${docsHtml}</div></section>
      <section class="nxv-sec"><h3>Enregistrer dans</h3>${driveHtml}</section>
    </div>
    <div class="sheet-foot"><span class="grow"></span><button class="btn" data-nxv-close>Annuler</button><button class="btn primary" data-nxv-go="${esc(p.id)}" data-autofocus>${ico('download', 14)}<span>Exporter</span></button></div>`, { wide: true });
  if (el) el.classList.add('nxv-sheet');
}

async function runExport(projectId, box) {
  const p = projects().find((x) => x.id === projectId);
  if (!p) return;
  const ids = new Set([...box.querySelectorAll('[data-nxv-doc]:checked')].map((i) => i.dataset.nxvDoc));
  const documents = ids.size ? (await designDocs()).filter((d) => ids.has(d.id)) : [];
  const dest = (box.querySelector('input[name="nxv-dest"]:checked') || {}).value;
  const go = box.querySelector('[data-nxv-go]');
  go.disabled = true;
  try {
    const r = await api.invoke('novx:export', {
      project: { ...p },
      documents,
      config: { isolation: settings.nxIsolation && settings.nxIsolation[p.id] },
      includeCode: Boolean(box.querySelector('[data-nxv-code]:checked')),
      includeEnv: Boolean(box.querySelector('[data-nxv-env]:checked')),
      folder: dest === 'drive' && drive && drive.folders[0] ? drive.folders[0] : '',
    });
    if (!r) { go.disabled = false; return; }
    closeSheet(SHEET);
    const parts = [sizeText(r.size), r.codeFiles ? plural(r.codeFiles, 'fichier de code', 'fichiers de code') : '', r.documents ? plural(r.documents, 'document', 'documents') : ''].filter(Boolean).join(', ');
    const noDrive = dest !== 'drive' && drive && !drive.folders.length;
    toast(`Projet exporté (${parts}).`, noDrive
      ? { action: 'Ouvrir Google Drive', onAction: () => api.invoke('shell:external', drive.web || DRIVE_WEB).catch(() => {}) }
      : { action: 'Afficher', onAction: () => api.invoke('shell:reveal', r.file).catch(() => {}) });
  } catch (e) {
    go.disabled = false;
    toast(e.message || String(e), { kind: 'bad' });
  }
}

// ---------------------------------------------------------------- import
async function runImport(file) {
  let r;
  try {
    r = await api.invoke('novx:import', file ? { file } : {});
  } catch (e) {
    toast(e.message || String(e), { kind: 'bad' });
    return;
  }
  if (!r) return;
  const src = r.project || {};
  const p = nxNew({ name: src.name || 'Projet importé', url: src.url || '', dir: r.dir || '' });
  const extra = {};
  if (src.logo) extra.logo = src.logo;
  if (Array.isArray(src.apps)) extra.apps = src.apps.slice();
  if (Object.keys(extra).length) patchProject(p.id, extra);
  let docs = 0;
  try { docs = await putDesignDocs(r.documents); } catch { /* documents ignorés */ }
  const bits = [r.dir ? 'code extrait' : (r.codeSkipped ? 'code non extrait' : ''), docs ? plural(docs, 'document NEX-DESIGN', 'documents NEX-DESIGN') : ''].filter(Boolean).join(', ');
  toast(`Projet « ${p.name} » importé${bits ? ` (${bits})` : ''}.`);
}

// ---------------------------------------------------------------- points d'entrée
function decorateHome() {
  const bar = document.querySelector('#home .hm-bar');
  if (!bar || bar.querySelector('[data-nxv-import]')) return;
  const after = bar.querySelector('[data-h="folder"]');
  const b = document.createElement('button');
  b.className = 'btn';
  b.dataset.nxvImport = '';
  b.innerHTML = `${ico('upload', 14)}<span>Importer un .novx</span>`;
  if (after) after.after(b); else bar.append(b);
}

// Menu « … » d'un projet (Accueil compilé) : entrée ajoutée avant « Retirer de la liste ».
function decorateMenu(projectId) {
  const remove = [...document.querySelectorAll('[data-pm="remove"]')].pop();
  if (!remove || remove.parentElement.querySelector('[data-nxv-export]')) return;
  const b = document.createElement('button');
  b.className = 'menu-item';
  b.dataset.nxvExport = projectId;
  b.innerHTML = `${ico('download', 14)}<span>Exporter en .novx…</span>`;
  remove.before(b);
}

async function pending() {
  try { const f = await api.invoke('novx:pending'); if (f) runImport(f); return true; } catch { return false; }
}

export async function install() {
  if (!document.querySelector('link[data-nxv-css]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.dataset.nxvCss = '';
    l.href = new URL('./novx.css', import.meta.url).href;
    document.head.append(l);
  }
  decorateHome();
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; decorateHome(); });
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', (e) => {
    const more = e.target.closest('[data-h-more]');
    if (more) {
      const card = more.closest('[data-h-proj]');
      if (card) setTimeout(() => decorateMenu(card.dataset.hProj), 0);
      return;
    }
    const ex = e.target.closest('[data-nxv-export]');
    if (ex) {
      e.stopPropagation();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const pop = ex.closest('.pop');
      if (pop && pop.isConnected) pop.remove();
      openExport(ex.dataset.nxvExport);
      return;
    }
    if (e.target.closest('[data-nxv-import]')) { runImport(''); return; }
    const box = e.target.closest('#sheet');
    if (!box || !box.querySelector('.nxv-body')) return;
    if (e.target.closest('[data-nxv-close]')) closeSheet(SHEET);
    const go = e.target.closest('[data-nxv-go]');
    if (go) runExport(go.dataset.nxvGo, box);
  }, true);
  try { api.on('novx:open', (d) => { if (d && d.file) runImport(d.file); }); } catch { /* aperçu */ }
  // Fichier reçu au lancement : lu dès que la licence est validée (canaux novx: verrouillés avant).
  if (!(await pending())) {
    try { api.on('license:changed', async (s) => { if (s && s.status === 'ok') await pending(); }); } catch { /* aperçu */ }
  }
}
