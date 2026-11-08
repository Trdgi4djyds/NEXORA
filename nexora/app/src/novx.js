'use strict';
/* NEXORA #076 : fichiers de projet .novx (archive ZIP).
 *   novx.json              format, version de NEXORA, projet, contenu, empreinte SHA-256 de chaque entrée
 *   project.json           fiche du projet (nom, adresse, applications liées…)
 *   config/settings.json   réglages propres au projet
 *   documents/<id>.json    documents NEX-DESIGN choisis
 *   code/…                 code du projet, facultatif (décision #076 : proposé et coché par défaut quand le projet a
 *                          un dossier ; sans dépendances ni sorties de construction, qui se régénèrent, et sans
 *                          fichiers .env de secrets sauf demande explicite ; 1 Go au plus)
 * À l'ouverture, chaque entrée est vérifiée contre novx.json ; le code est extrait dans un dossier neuf, sans
 * jamais écrire hors de ce dossier. Le fichier n'est pas chiffré : il se partage comme un ZIP. */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yazl = require('yazl');
const yauzl = require('yauzl');

const FORMAT = 'novx';
const FORMAT_VERSION = 1;
const MAX_CODE = 1024 ** 3;
const MAX_JSON = 64 * 1024 * 1024;
const MTIME = new Date('2026-01-01T00:00:00Z');
const SKIP_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', '.next', '.nuxt', '.svelte-kit', '.cache', '.turbo', '.parcel-cache', '.vercel', '.netlify', 'coverage', '__pycache__', '.venv', 'venv', '.gradle', '.idea', '.dart_tool', 'Pods', '.angular', '.expo']);
// Sorties de construction et dépendances téléchargées : ignorées seulement si un fichier de projet permet de les régénérer.
const BUILD_DIRS = new Set(['dist', 'build', 'out', 'target', 'vendor', '.output']);
const PROJECT_FILES = ['package.json', 'composer.json', 'pubspec.yaml', 'Cargo.toml', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'go.mod', 'pyproject.toml', 'requirements.txt', 'Gemfile'];
const isEnv = (n) => /^\.env(\..+)?$/i.test(n) && !/\.(example|sample|template|dist)$/i.test(n);
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const json = (v) => Buffer.from(JSON.stringify(v ?? null, null, 2), 'utf8');
const safeId = (s) => String(s || '').replace(/[^\w.-]+/g, '-').slice(0, 80) || 'document';

function shaFile(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.allocUnsafe(1 << 20);
  try {
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  } finally { fs.closeSync(fd); }
  return h.digest('hex');
}

// Chemin relatif sûr (ni racine, ni lecteur, ni « .. »).
function safeRel(p) {
  if (!p || /[\\:\0]/.test(p) || p.startsWith('/')) return false;
  return p.split('/').every((s) => s && s !== '.' && s !== '..');
}

function listCode(dir, { includeEnv = false } = {}) {
  const root = path.resolve(dir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('Le dossier du projet est introuvable.');
  const regenerable = PROJECT_FILES.some((f) => fs.existsSync(path.join(root, f)));
  const files = [];
  const skipped = [];
  let bytes = 0;
  const walk = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) { skipped.push(r); continue; }
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || (!rel && regenerable && BUILD_DIRS.has(e.name))) { skipped.push(`${r}/`); continue; }
        walk(path.join(abs, e.name), r);
      } else if (e.isFile()) {
        if (!includeEnv && isEnv(e.name)) { skipped.push(r); continue; }
        const size = fs.statSync(path.join(abs, e.name)).size;
        bytes += size;
        if (bytes > MAX_CODE) throw new Error('Le code du projet dépasse 1 Go (hors dépendances) : exporte sans le code, ou allège le dossier.');
        files.push({ rel: r, abs: path.join(abs, e.name), size });
      }
    }
  };
  walk(root, '');
  return { files, skipped: skipped.sort(), bytes };
}

async function writeNovx(file, { project, documents = [], config = {}, codeDir = '', includeCode = false, includeEnv = false, appVersion = '' } = {}) {
  if (!project || !project.name) throw new Error('Projet manquant.');
  const zip = new yazl.ZipFile();
  const hashes = {};
  const addBuf = (name, buf) => { hashes[name] = sha(buf); zip.addBuffer(buf, name, { mtime: MTIME }); };
  addBuf('project.json', json(project));
  addBuf('config/settings.json', json(config));
  const seen = new Set();
  for (const d of documents) {
    let id = safeId(d && d.id);
    while (seen.has(id)) id += '-2';
    seen.add(id);
    addBuf(`documents/${id}.json`, json(d));
  }
  let code = null;
  if (includeCode && codeDir) {
    code = listCode(codeDir, { includeEnv });
    for (const f of code.files) {
      hashes[`code/${f.rel}`] = shaFile(f.abs);
      zip.addFile(f.abs, `code/${f.rel}`, { mtime: MTIME });
    }
  }
  const manifest = {
    format: FORMAT, version: FORMAT_VERSION, app: 'NEXORA', app_version: appVersion, created_at: new Date().toISOString(),
    project: { id: project.id || '', name: project.name, url: project.url || '' },
    contents: { documents: seen.size, code: Boolean(code), code_files: code ? code.files.length : 0, code_bytes: code ? code.bytes : 0, env_included: Boolean(code && includeEnv) },
    skipped: code ? code.skipped.slice(0, 500) : [],
    sha256: hashes,
  };
  zip.addBuffer(json(manifest), 'novx.json', { mtime: MTIME });
  zip.end();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.part`;
  await new Promise((resolve, reject) => {
    zip.outputStream.pipe(fs.createWriteStream(tmp)).on('close', resolve).on('error', reject);
  });
  fs.renameSync(tmp, file);
  return { file, size: fs.statSync(file).size, documents: seen.size, codeFiles: manifest.contents.code_files, skipped: manifest.skipped.length };
}

function openZip(file) {
  return new Promise((resolve, reject) => yauzl.open(file, { lazyEntries: true, autoClose: true, strictFileNames: false }, (err, z) => (err ? reject(new Error('Ce fichier n’est pas un projet .novx lisible.')) : resolve(z))));
}

function readEntry(z, entry, max) {
  return new Promise((resolve, reject) => {
    if (entry.uncompressedSize > max) { reject(new Error('Entrée trop volumineuse dans le fichier .novx.')); return; }
    z.openReadStream(entry, (err, s) => {
      if (err) { reject(err); return; }
      const parts = [];
      s.on('data', (c) => parts.push(c)).on('end', () => resolve(Buffer.concat(parts))).on('error', reject);
    });
  });
}

function writeEntry(z, entry, target) {
  return new Promise((resolve, reject) => {
    z.openReadStream(entry, (err, s) => {
      if (err) { reject(err); return; }
      const h = crypto.createHash('sha256');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const out = fs.createWriteStream(target);
      s.on('data', (c) => h.update(c));
      s.pipe(out).on('close', () => resolve(h.digest('hex'))).on('error', reject);
      s.on('error', reject);
    });
  });
}

/* Lit un .novx ; codeTo : dossier (neuf) où extraire le code. Toute entrée modifiée, inattendue ou manquante est refusée. */
async function readNovx(file, { codeTo = '' } = {}) {
  const z = await openZip(file);
  const bufs = {};
  const got = {};
  const staging = codeTo ? `${codeTo}.novx-${process.pid}-${Date.now()}` : '';
  try {
    await new Promise((resolve, reject) => {
      z.on('error', reject);
      z.on('end', resolve);
      z.on('entry', async (entry) => {
        try {
          const name = entry.fileName;
          if (name.endsWith('/')) { z.readEntry(); return; }
          if (!safeRel(name)) throw new Error(`Chemin refusé dans le fichier .novx : ${name}`);
          if (name.startsWith('code/')) {
            if (staging) {
              const target = path.join(staging, ...name.slice(5).split('/'));
              if (path.relative(staging, target).startsWith('..')) throw new Error(`Chemin refusé : ${name}`);
              got[name] = await writeEntry(z, entry, target);
            } else got[name] = null; // non extrait : vérifié seulement s'il est demandé
          } else {
            bufs[name] = await readEntry(z, entry, MAX_JSON);
            got[name] = sha(bufs[name]);
          }
          z.readEntry();
        } catch (e) { reject(e); }
      });
      z.readEntry();
    });
    if (!bufs['novx.json']) throw new Error('Ce fichier n’est pas un projet .novx (novx.json manquant).');
    const m = JSON.parse(bufs['novx.json'].toString('utf8'));
    if (m.format !== FORMAT || !m.sha256 || typeof m.sha256 !== 'object') throw new Error('Format .novx inconnu.');
    if (m.version > FORMAT_VERSION) throw new Error('Ce fichier .novx vient d’une version plus récente de NEXORA : mets NEXORA à jour pour l’ouvrir.');
    for (const [name, h] of Object.entries(got)) {
      if (name === 'novx.json') continue;
      if (!(name in m.sha256)) throw new Error(`Entrée inattendue dans le fichier .novx : ${name}`);
      if (h !== null && h !== m.sha256[name]) throw new Error(`Le fichier .novx est altéré (${name}).`);
    }
    for (const name of Object.keys(m.sha256)) if (!(name in got)) throw new Error(`Le fichier .novx est incomplet (${name}).`);
    const parse = (n) => (bufs[n] ? JSON.parse(bufs[n].toString('utf8')) : null);
    const documents = Object.keys(bufs).filter((n) => /^documents\/[^/]+\.json$/.test(n)).sort().map(parse);
    let dir = '';
    if (staging && m.contents && m.contents.code) {
      if (fs.existsSync(codeTo)) throw new Error('Le dossier de destination existe déjà.');
      fs.renameSync(staging, codeTo);
      dir = codeTo;
    }
    return { manifest: m, project: parse('project.json'), config: parse('config/settings.json') || {}, documents, dir };
  } catch (e) {
    if (staging) fs.rmSync(staging, { recursive: true, force: true });
    // Refus de la bibliothèque ZIP (chemin absolu, « .. », caractères interdits) : message en français.
    if (/invalid relative path|absolute path|invalid characters in fileName/i.test(String(e && e.message))) throw new Error('Chemin refusé dans le fichier .novx : il pourrait écrire hors de son dossier.');
    throw e;
  } finally {
    if (staging && fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
  }
}

// Google Drive pour ordinateur : lecteur « Mon Drive » ou dossier classique ; rien n'est supposé installé.
function driveFolders(env = process.env, exists = fs.existsSync) {
  const out = [];
  const add = (p) => { if (p && exists(p) && !out.includes(p)) out.push(p); };
  if (process.platform === 'win32') {
    for (const l of 'DEFGHIJKLMNOPQRSTUVWXYZ') { add(`${l}:\\Mon Drive`); add(`${l}:\\My Drive`); }
  }
  const home = env.USERPROFILE || env.HOME || os.homedir();
  add(path.join(home, 'Google Drive', 'Mon Drive'));
  add(path.join(home, 'Google Drive', 'My Drive'));
  add(path.join(home, 'Google Drive'));
  try {
    const cs = path.join(home, 'Library', 'CloudStorage');
    for (const d of exists(cs) ? fs.readdirSync(cs) : []) if (/^GoogleDrive/i.test(d)) { add(path.join(cs, d, 'Mon Drive')); add(path.join(cs, d, 'My Drive')); }
  } catch { /* macOS seulement */ }
  return out;
}

const novxFromArgs = (argv) => (argv || []).map(String).find((a) => /\.novx$/i.test(a) && !a.startsWith('-')) || '';

function uniqueDir(base) {
  let d = base;
  for (let i = 2; fs.existsSync(d); i++) d = `${base} (${i})`;
  return d;
}

function register({ ipcMain, app, dialog, getWin, send }) {
  let pending = novxFromArgs(process.argv);
  const projectsDir = () => path.join(app.getPath('documents'), 'NEXORA', 'Projets');
  app.on('second-instance', (_e, argv) => { const f = novxFromArgs(argv); if (f) send('novx:open', { file: f }); });
  ipcMain.handle('novx:pending', () => { const f = pending; pending = ''; return f || null; });
  ipcMain.handle('novx:drive', () => ({ folders: driveFolders(), web: 'https://drive.google.com/drive/my-drive' }));
  ipcMain.handle('novx:export', async (_e, o = {}) => {
    const p = o.project || {};
    const name = String(p.name || 'Projet').replace(/[<>:"/\\|?*]+/g, '-').trim() || 'Projet';
    const base = o.folder && fs.existsSync(o.folder) ? o.folder : projectsDir();
    const r = await dialog.showSaveDialog(getWin(), { title: 'Exporter le projet en .novx', defaultPath: path.join(base, `${name}.novx`), filters: [{ name: 'Projet NEXORA', extensions: ['novx'] }] });
    if (r.canceled || !r.filePath) return null;
    return writeNovx(r.filePath, { project: p, documents: Array.isArray(o.documents) ? o.documents : [], config: o.config || {}, codeDir: p.dir || '', includeCode: Boolean(o.includeCode && p.dir), includeEnv: Boolean(o.includeEnv), appVersion: app.getVersion() });
  });
  ipcMain.handle('novx:import', async (_e, o = {}) => {
    let file = o.file || '';
    if (!file) {
      const r = await dialog.showOpenDialog(getWin(), { title: 'Ouvrir un projet .novx', filters: [{ name: 'Projet NEXORA', extensions: ['novx'] }], properties: ['openFile'] });
      if (r.canceled || !r.filePaths[0]) return null;
      file = r.filePaths[0];
    }
    const head = await readNovx(file); // vérifie tout sauf le code, avant de demander où l'extraire
    if (!head.manifest.contents || !head.manifest.contents.code) return { ...head, file };
    const name = String((head.project && head.project.name) || 'Projet').replace(/[<>:"/\\|?*]+/g, '-').trim() || 'Projet';
    fs.mkdirSync(projectsDir(), { recursive: true });
    const r = await dialog.showOpenDialog(getWin(), { title: `Où placer le code de « ${name} » ?`, defaultPath: projectsDir(), properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return { ...head, file, codeSkipped: true };
    return { ...(await readNovx(file, { codeTo: uniqueDir(path.join(r.filePaths[0], name)) })), file };
  });
}

module.exports = { register, writeNovx, readNovx, listCode, driveFolders, novxFromArgs, safeRel, FORMAT_VERSION };
