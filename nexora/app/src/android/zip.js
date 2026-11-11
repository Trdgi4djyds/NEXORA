'use strict';
/* Lecture, extraction et réécriture d'archives zip (APK, AAB, paquets du SDK). */
const fs = require('fs');
const path = require('path');
const yauzl = require('yauzl');
const yazl = require('yazl');

function open(file) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: false }, (err, zip) => (err ? reject(err) : resolve(zip)));
  });
}

function readStream(zip, entry) {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err) { reject(err); return; }
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  });
}

// Parcourt les entrées ; fn(entry, read) peut être asynchrone.
async function walk(file, fn) {
  const zip = await open(file);
  try {
    await new Promise((resolve, reject) => {
      zip.on('entry', async (entry) => {
        try {
          await fn(entry, () => readStream(zip, entry));
          zip.readEntry();
        } catch (e) { reject(e); }
      });
      zip.on('end', resolve);
      zip.on('error', reject);
      zip.readEntry();
    });
  } finally { zip.close(); }
}

/* Extrait une archive dans dest. strip : nombre de dossiers de tête à retirer (paquets du SDK, JDK). */
async function extract(file, dest, { strip = 0, onProgress } = {}) {
  const zip = await open(file);
  const total = zip.entryCount;
  let done = 0;
  try {
    await new Promise((resolve, reject) => {
      zip.on('entry', (entry) => {
        done += 1;
        if (onProgress && done % 50 === 0) onProgress(done / total);
        const parts = entry.fileName.split('/').filter(Boolean);
        if (parts.length <= strip) { zip.readEntry(); return; }
        const rel = parts.slice(strip).join(path.sep);
        const out = path.join(dest, rel);
        if (!out.startsWith(path.resolve(dest))) { zip.readEntry(); return; }
        if (/\/$/.test(entry.fileName)) {
          fs.mkdirSync(out, { recursive: true });
          zip.readEntry();
          return;
        }
        fs.mkdirSync(path.dirname(out), { recursive: true });
        zip.openReadStream(entry, (err, stream) => {
          if (err) { reject(err); return; }
          // Toujours inscriptible par son propriétaire : un fichier extrait en « lecture seule » devient
          // impossible à supprimer ou remplacer sous Windows (EPERM au nettoyage ou à la tentative suivante).
          const mode = ((entry.externalFileAttributes >>> 16) & 0o777) | 0o600;
          // Ouverture du fichier de sortie tolérante au verrouillage antivirus (EPERM/EBUSY) sous Windows.
          const openOut = (tries) => {
            let ws;
            try { if (fs.existsSync(out)) fs.chmodSync(out, 0o666); } catch { /* ignore */ }
            try { ws = fs.createWriteStream(out, { mode: mode || 0o644 }); } catch (e) {
              if (tries > 0 && /^(EPERM|EBUSY|EACCES)$/.test(e.code)) { setTimeout(() => openOut(tries - 1), 60); return; }
              reject(e); return;
            }
            ws.on('open', () => { stream.pipe(ws); });
            ws.on('finish', () => {
              if (mode & 0o111 && process.platform !== 'win32') { try { fs.chmodSync(out, mode); } catch { /* ignore */ } }
              zip.readEntry();
            });
            ws.on('error', (e) => {
              if (tries > 0 && /^(EPERM|EBUSY|EACCES)$/.test(e.code)) { setTimeout(() => openOut(tries - 1), 80); return; }
              reject(e);
            });
          };
          openOut(6);
        });
      });
      zip.on('end', resolve);
      zip.on('error', reject);
      zip.readEntry();
    });
  } finally { zip.close(); }
}

/* Réécrit une archive : map(name) → nouveau nom (ou null pour l'ignorer) ; store(name) : sans compression ;
 * add : [{ name, data | file, store }]. */
async function rewrite(src, dest, { map = (n) => n, store = () => false, add = [] } = {}) {
  const out = new yazl.ZipFile();
  const written = new Set();
  const date = new Date(2026, 0, 1, 0, 0, 0);
  await walk(src, async (entry, read) => {
    if (/\/$/.test(entry.fileName)) return;
    const name = map(entry.fileName);
    if (!name || written.has(name)) return;
    written.add(name);
    const data = await read();
    out.addBuffer(data, name, { compress: !store(name), mtime: date });
  });
  for (const a of add) {
    if (written.has(a.name)) continue;
    written.add(a.name);
    const data = a.data || fs.readFileSync(a.file);
    out.addBuffer(Buffer.from(data), a.name, { compress: !a.store, mtime: date });
  }
  out.end();
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(dest);
    out.outputStream.pipe(ws).on('close', resolve).on('error', reject);
  });
}

async function list(file) {
  const names = [];
  await walk(file, (entry) => { names.push(entry.fileName); });
  return names;
}

module.exports = {
  extract, rewrite, list, walk,
};
