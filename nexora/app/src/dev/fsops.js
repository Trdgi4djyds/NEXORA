'use strict';
/* Fichiers du projet ouvert dans le Dev Lab : arborescence, lecture, écriture, création, renommage,
 * corbeille, recherche dans les fichiers et surveillance des changements. */
const fs = require('fs');
const path = require('path');

const IGNORE_DIRS = new Set(['node_modules', '.git', '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache', '.parcel-cache', '.dart_tool', 'build', 'dist', '.angular', 'coverage', '.idea', '.vscode-test', '__pycache__', '.venv', 'venv', '.gradle', 'Pods', '.expo']);
const HIDDEN_DIRS = new Set(['node_modules', '.git']);
const TEXT_MAX = 8e6;
const BINARY_EXT = /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|psd|mp4|webm|mov|m4v|mp3|wav|ogg|m4a|flac|pdf|zip|rar|7z|gz|tgz|tar|woff2?|ttf|otf|eot|exe|dll|so|dylib|bin|apk|aab|jar|class|keystore|jks|p12|sqlite|db|glb|gltf|fbx|blend|wasm)$/i;

function inside(root, p) {
  const r = path.resolve(root);
  const x = path.resolve(p);
  return x === r || x.startsWith(r + path.sep);
}

function guard(root, p) {
  if (!root || !inside(root, p)) throw new Error('Chemin en dehors du projet.');
  return path.resolve(p);
}

/** Contenu d'un dossier (un niveau), dossiers d'abord. */
function list(root, dir) {
  const d = guard(root, dir || root);
  let ents;
  try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { throw new Error(`Lecture impossible : ${e.message}`); }
  return ents
    .filter((e) => e.name !== '.DS_Store' && e.name !== 'Thumbs.db')
    .map((e) => {
      const p = path.join(d, e.name);
      let size = 0;
      let isDir = e.isDirectory();
      if (e.isSymbolicLink()) { try { isDir = fs.statSync(p).isDirectory(); } catch { isDir = false; } }
      if (!isDir) { try { size = fs.statSync(p).size; } catch { size = 0; } }
      return {
        name: e.name, path: p, dir: isDir, size, heavy: isDir && HIDDEN_DIRS.has(e.name), ignored: isDir && IGNORE_DIRS.has(e.name),
      };
    })
    .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, 'fr', { sensitivity: 'base', numeric: true }) : a.dir ? -1 : 1));
}

function read(root, file) {
  const f = guard(root, file);
  const st = fs.statSync(f);
  if (BINARY_EXT.test(f)) return { binary: true, size: st.size, mtime: st.mtimeMs };
  if (st.size > TEXT_MAX) return { tooBig: true, size: st.size, mtime: st.mtimeMs };
  const buf = fs.readFileSync(f);
  if (buf.subarray(0, 8000).includes(0)) return { binary: true, size: st.size, mtime: st.mtimeMs };
  let text = buf.toString('utf8');
  const bom = text.charCodeAt(0) === 0xfeff;
  if (bom) text = text.slice(1);
  const eol = /\r\n/.test(text.slice(0, 20000)) ? 'crlf' : 'lf';
  return {
    text, size: st.size, mtime: st.mtimeMs, eol, bom,
  };
}

function write(root, file, text, { eol, bom } = {}) {
  const f = guard(root, file);
  let out = String(text);
  if (eol === 'crlf') out = out.replace(/\r?\n/g, '\r\n');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, bom ? `﻿${out}` : out, 'utf8');
  return { mtime: fs.statSync(f).mtimeMs };
}

function create(root, p, isDir) {
  const f = guard(root, p);
  if (fs.existsSync(f)) throw new Error('Un fichier ou dossier porte déjà ce nom.');
  if (isDir) fs.mkdirSync(f, { recursive: true });
  else { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, ''); }
  return f;
}

function rename(root, from, to) {
  const a = guard(root, from);
  const b = guard(root, to);
  if (fs.existsSync(b)) throw new Error('Un fichier ou dossier porte déjà ce nom.');
  fs.mkdirSync(path.dirname(b), { recursive: true });
  fs.renameSync(a, b);
  return b;
}

function copyIn(root, sources, destDir) {
  const d = guard(root, destDir);
  const out = [];
  for (const s of sources) {
    let target = path.join(d, path.basename(s));
    let n = 2;
    while (fs.existsSync(target)) {
      const ext = path.extname(s);
      target = path.join(d, `${path.basename(s, ext)} ${n}${ext}`);
      n += 1;
    }
    fs.cpSync(s, target, { recursive: true });
    out.push(target);
  }
  return out;
}

/** Recherche de texte (ou d'expression régulière) dans les fichiers du projet. */
function search(root, query, { regex = false, caseSensitive = false, include = '', max = 2000 } = {}) {
  if (!query) return [];
  let re;
  try { re = new RegExp(regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi'); } catch (e) { throw new Error(`Expression invalide : ${e.message}`); }
  const inc = include ? new RegExp(`(${include.split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')).join('|')})$`, 'i') : null;
  const results = [];
  let count = 0;
  const walk = (d) => {
    if (count >= max) return;
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (count >= max) return;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!IGNORE_DIRS.has(e.name) && !e.name.startsWith('.')) walk(p); continue; }
      if (!e.isFile() || BINARY_EXT.test(e.name) || (inc && !inc.test(e.name))) continue;
      let text;
      try {
        if (fs.statSync(p).size > 2e6) continue;
        text = fs.readFileSync(p, 'utf8');
      } catch { continue; }
      if (!re.test(text)) { re.lastIndex = 0; continue; }
      re.lastIndex = 0;
      const lines = text.split(/\r?\n/);
      const hits = [];
      lines.forEach((line, i) => {
        re.lastIndex = 0;
        const m = re.exec(line);
        if (m && hits.length < 50) { hits.push({ line: i + 1, col: m.index + 1, text: line.slice(Math.max(0, m.index - 60), m.index + 140), len: m[0].length }); count += 1; }
      });
      if (hits.length) results.push({ file: p, rel: path.relative(root, p), hits });
    }
  };
  walk(path.resolve(root));
  return results;
}

/** Tous les fichiers du projet (ouverture rapide par nom), dossiers lourds exclus. */
function allFiles(root, max = 30000) {
  const out = [];
  const walk = (d) => {
    if (out.length >= max) return;
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (out.length >= max) return;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!IGNORE_DIRS.has(e.name) && e.name !== '.git') walk(p); } else if (e.isFile()) out.push(path.relative(root, p));
    }
  };
  walk(path.resolve(root));
  return out;
}

/** Surveillance du dossier : signale les fichiers modifiés hors de l'éditeur. */
function watch(root, onChange) {
  let w = null;
  const pending = new Set();
  let timer = null;
  try {
    w = fs.watch(root, { recursive: true }, (_ev, name) => {
      if (!name) return;
      const n = String(name);
      if (/(^|[\\/])(node_modules|\.git|\.next|dist|build|\.cache)([\\/]|$)/.test(n)) return;
      pending.add(path.join(root, n));
      clearTimeout(timer);
      timer = setTimeout(() => { const list = [...pending]; pending.clear(); onChange(list); }, 250);
    });
  } catch { w = null; }
  return () => { clearTimeout(timer); if (w) w.close(); };
}

module.exports = {
  list, read, write, create, rename, copyIn, search, watch, inside, allFiles, IGNORE_DIRS,
};
