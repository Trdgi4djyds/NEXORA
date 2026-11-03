'use strict';
/* Opérations de fichiers robustes sous Windows : l'antivirus (Defender) ouvre chaque fichier juste après son
 * écriture pour l'analyser, et pendant ce court instant un renommage, une suppression ou une réécriture échoue
 * avec EPERM / EBUSY / EACCES / ENOTEMPTY. On réessaie donc quelques fois avec une courte pause, et le
 * renommage se replie sur une copie + suppression. Ces fonctions remplacent fs.* dans la préparation des
 * applications Android (kit de notifications, construction), là où ces erreurs se produisaient. */
const fs = require('fs');
const path = require('path');

const RETRY = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY', 'EMFILE', 'ENFILE']);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Reprise asynchrone (ne bloque pas l'application pendant les pauses).
async function retry(fn, tries = 8, base = 50) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (!RETRY.has(e.code)) throw e;
      // eslint-disable-next-line no-await-in-loop
      await wait(base * (i + 1));
    }
  }
  throw last;
}

function mkdirp(dir) { return fs.mkdirSync(dir, { recursive: true }); }

/* Attribut « lecture seule » retiré (fichier ou dossier entier). Sous Windows, un fichier en lecture seule
 * (fréquent dans les archives .aar/.jar extraites) ne peut être ni supprimé ni remplacé : EPERM. */
function clearReadOnly(target) {
  let st;
  try { st = fs.lstatSync(target); } catch { return; }
  if (st.isDirectory()) {
    let names = [];
    try { names = fs.readdirSync(target); } catch { /* illisible */ }
    for (const n of names) clearReadOnly(path.join(target, n));
    try { fs.chmodSync(target, 0o777); } catch { /* ignore */ }
  } else if (!st.isSymbolicLink()) {
    try { fs.chmodSync(target, 0o666); } catch { /* ignore */ }
  }
}

async function writeFile(file, data) {
  mkdirp(path.dirname(file));
  if (fs.existsSync(file)) clearReadOnly(file);
  return retry(() => fs.writeFileSync(file, data));
}

/* Suppression récursive tolérante : reprises intégrées de Node, puis lecture seule retirée, puis nouvel essai. */
async function rmrf(target) {
  const rm = () => fs.rmSync(target, { recursive: true, force: true, maxRetries: 6, retryDelay: 60 });
  try { await retry(rm, 3, 90); } catch (e) {
    if (e.code === 'ENOENT') return;
    if (!RETRY.has(e.code)) throw e;
    clearReadOnly(target);
    await retry(rm, 6, 150);
  }
}

/* Renommage sûr : réessaie, puis copie + supprime la source si le renommage reste bloqué (fichier verrouillé
 * ou volume différent). La cible existante est d'abord retirée. */
async function rename(from, to) {
  mkdirp(path.dirname(to));
  await rmrf(to).catch(() => {});
  try { await retry(() => fs.renameSync(from, to)); return; } catch (e) { if (e.code !== 'EXDEV' && !RETRY.has(e.code)) throw e; }
  await retry(() => fs.copyFileSync(from, to));
  await rmrf(from).catch(() => {});
}

async function copyFile(from, to) { mkdirp(path.dirname(to)); return retry(() => fs.copyFileSync(from, to)); }

// Versions synchrones de secours (busy-wait court) pour le code non asynchrone.
function rmrfSync(target) {
  const rm = () => fs.rmSync(target, { recursive: true, force: true, maxRetries: 6, retryDelay: 60 });
  try { rm(); } catch (e) {
    if (e.code === 'ENOENT') return;
    if (!RETRY.has(e.code)) throw e;
    clearReadOnly(target);
    rm();
  }
}

module.exports = {
  mkdirp, writeFile, rmrf, rename, copyFile, retry, rmrfSync, clearReadOnly, RETRY,
};
