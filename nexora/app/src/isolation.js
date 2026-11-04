'use strict';
/* NEXORA #016 : isolation des projets.
 *
 * 1. Session web : chaque projet NEXORA a sa propre session Chromium (« persist:nx-<projet> ») pour
 *    ses aperçus (Responsive Lab, Browser Lab, Dev Lab, App Builder) et pour les outils du processus
 *    principal (aspiration, tests, captures, audits). Cookies, stockage local, IndexedDB, cache et
 *    service workers d'un projet ne sont jamais vus par un autre, même si les deux sont servis sur la
 *    même adresse locale (http://localhost:5173 par exemple). « persist:vitrine », la session
 *    historique, reste celle du projet qui était ouvert avant la mise à jour (rien n'est perdu).
 * 2. Environnement : les commandes lancées pour un projet (serveur, installation, terminaux) utilisent
 *    d'abord ses propres outils et dépendances : environnement virtuel Python du projet, binaires de
 *    node_modules/.bin, gems Ruby rangées dans vendor/bundle du projet. */
const fs = require('fs');
const path = require('path');

const IS_WIN = process.platform === 'win32';
const LEGACY = 'persist:vitrine';
const PART_RE = /^persist:nx-[a-z0-9][a-z0-9-]{0,63}$/;

let current = LEGACY;
const known = new Set([LEGACY]);
const listeners = new Set();

const valid = (part) => part === LEGACY || PART_RE.test(String(part || ''));

/** Session du projet ouvert (utilisée par défaut par les outils du processus principal). */
function partition() { return current; }

/** Le projet ouvert change : sa session devient la session par défaut. */
function activate(part) {
  if (!valid(part)) throw new Error('Session de projet invalide.');
  current = part;
  register(part);
  return part;
}

/** Session de projet utilisée par un aperçu (sans changer la session par défaut). */
function register(part) {
  if (!valid(part) || known.has(part)) return;
  known.add(part);
  for (const fn of listeners) { try { fn(part); } catch { /* écouteur en échec : sans effet sur les autres */ } }
}

/** Appelé pour chaque session de projet connue, puis pour chaque nouvelle (proxy du partage, par exemple). */
function onPartition(fn) {
  listeners.add(fn);
  for (const p of known) { try { fn(p); } catch { /* ignore */ } }
  return () => listeners.delete(fn);
}

/** Projet supprimé : ses cookies, son stockage et son cache sont effacés. La session historique et la
 *  session du projet ouvert ne sont jamais effacées par ce biais. */
async function drop(part, session) {
  if (!PART_RE.test(String(part || '')) || part === current) return false;
  const ses = session.fromPartition(part);
  await ses.clearStorageData();
  await ses.clearCache();
  known.delete(part);
  return true;
}

function exists(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
const pathKey = (env) => Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';

/** Variables à ajouter à l'environnement des commandes lancées dans le dossier d'un projet
 *  (seulement celles qui changent ; la clé du PATH garde la casse de l'environnement de NEXORA). */
function projectVars(dir, base = process.env) {
  const vars = {};
  if (!dir || !isDir(dir)) return vars;
  const pre = [];
  // Python : l'environnement virtuel du projet passe avant tout autre Python.
  for (const v of ['.venv', 'venv', 'env']) {
    const bin = path.join(dir, v, IS_WIN ? 'Scripts' : 'bin');
    if (exists(path.join(bin, IS_WIN ? 'python.exe' : 'python'))) {
      vars.VIRTUAL_ENV = path.join(dir, v);
      pre.push(bin);
      break;
    }
  }
  // Node.js : les outils installés dans le projet (vite, next…) passent avant les versions globales.
  const nodeBin = path.join(dir, 'node_modules', '.bin');
  if (isDir(nodeBin)) pre.push(nodeBin);
  // Ruby : les gems du projet restent dans son dossier vendor/bundle, sans toucher aux autres projets.
  if (exists(path.join(dir, 'Gemfile')) && !base.BUNDLE_PATH && !exists(path.join(dir, '.bundle', 'config'))) vars.BUNDLE_PATH = 'vendor/bundle';
  vars.NEXORA_PROJECT_DIR = dir;
  if (pre.length) {
    const key = pathKey(base);
    vars[key] = [...pre, base[key] || ''].filter(Boolean).join(path.delimiter);
  }
  return vars;
}

/** Environnement complet d'une commande lancée pour un projet. */
function projectEnv(dir, extra = {}, base = process.env) {
  return { ...base, ...extra, ...projectVars(dir, { ...base, ...extra }) };
}

module.exports = {
  LEGACY, valid, partition, activate, register, onPartition, drop, projectVars, projectEnv, pathKey,
};
