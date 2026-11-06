'use strict';
/* NEXORA #052 : assistant IA sur tout le projet : contexte (arborescence, consignes du projet, fichiers utiles),
 * application des changements acceptés fichier par fichier, avec annulation. La requête à l'IA passe par ai:chat
 * (clé de l'utilisateur, quota de l'offre). */
const fs = require('fs');
const path = require('path');
const { inside, rel, listFiles, isTextFile, readJson, writeJson } = require('./util');

const RULE_FILES = ['.nexora/consignes.md', 'NEXORA.md', 'AGENTS.md', 'CLAUDE.md', '.cursorrules', '.github/copilot-instructions.md'];
const BUDGET = 140000;

function consignes(root) {
  for (const f of RULE_FILES) { const p = path.join(root, f); if (fs.existsSync(p)) return { file: f, text: fs.readFileSync(p, 'utf8').slice(0, 20000) }; }
  return { file: '.nexora/consignes.md', text: '' };
}
function saveConsignes(root, text) {
  const cur = consignes(root);
  const p = inside(root, cur.text || !fs.existsSync(path.join(root, cur.file)) ? cur.file : '.nexora/consignes.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, String(text));
  return consignes(root);
}

// Fichiers les plus utiles pour la demande : fichiers ouverts, fichiers cités, puis noms proches des mots de la demande.
function context(root, { query = '', open = [], active = '' } = {}) {
  const files = listFiles(root, { max: 3000 });
  const words = String(query).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const named = files.filter((f) => query.includes(f) || query.includes(path.basename(f)));
  const scored = files.map((f) => ({ f, s: words.reduce((s, w) => s + (f.toLowerCase().includes(w) ? 2 : 0), 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 8).map((x) => x.f);
  const base = ['package.json', 'README.md'].filter((f) => files.includes(f));
  const wanted = [...new Set([...open.map((f) => rel(root, path.resolve(root, f))), active && rel(root, path.resolve(root, active)), ...named, ...scored, ...base].filter(Boolean))];
  let used = 0;
  const included = [];
  for (const f of wanted) {
    const abs = path.join(root, f);
    try { if (!fs.statSync(abs).isFile() || !isTextFile(abs)) continue; } catch { continue; }
    const text = fs.readFileSync(abs, 'utf8');
    if (used + text.length > BUDGET) continue;
    used += text.length;
    included.push({ path: f, text });
  }
  return { tree: files.slice(0, 600), consignes: consignes(root), files: included, chars: used };
}

// Changements acceptés : chaque fichier remplacé est d'abord copié pour pouvoir annuler.
function apply(root, { edits = [], dataDir }) {
  const id = `undo${Date.now().toString(36)}`;
  const dir = path.join(dataDir, 'devplus', 'undo', id);
  const done = [];
  for (const e of edits) {
    const abs = inside(root, e.path);
    const before = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
    if (before) { const b = path.join(dir, 'files', e.path); fs.mkdirSync(path.dirname(b), { recursive: true }); fs.writeFileSync(b, before); }
    if (e.action === 'delete') { if (before) fs.rmSync(abs); } else { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, String(e.content ?? '')); }
    done.push({ path: rel(root, abs), existed: Boolean(before), action: e.action || 'write' });
  }
  writeJson(path.join(dir, 'manifest.json'), { root, done, at: Date.now() });
  return { undoId: id, done };
}
function undo(root, { undoId, dataDir }) {
  if (!/^undo[a-z0-9]+$/.test(undoId || '')) throw new Error('Annulation introuvable.');
  const dir = path.join(dataDir, 'devplus', 'undo', undoId);
  const m = readJson(path.join(dir, 'manifest.json'));
  if (!m || path.resolve(m.root) !== path.resolve(root)) throw new Error('Annulation introuvable pour ce projet.');
  for (const d of m.done) {
    const abs = inside(root, d.path);
    if (d.existed) { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.copyFileSync(path.join(dir, 'files', d.path), abs); } else fs.rmSync(abs, { force: true });
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return { restored: m.done.length };
}

module.exports = { context, apply, undo, consignes, saveConsignes };
