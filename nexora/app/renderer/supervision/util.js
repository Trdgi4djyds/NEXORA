// NEXORA #015 : utilitaires de la supervision (formats en français, icônes, pont IPC, notifications).
import { b as iconRaw } from '../dist/chunks/chunk-S4I2LXHS.js';
import { a as toastRaw, e as sheetRaw, f as closeSheetRaw, b as popoverRaw, c as closePopoverRaw } from '../dist/chunks/chunk-6ZWS5EFO.js';
import { a as api } from '../dist/chunks/chunk-V3CX37JL.js';

export { api };

import { esc, num } from './fmt.js';

export { esc, num };
export const icon = (name, size = 14, cls) => iconRaw(name, size, cls);
export const toast = (msg, opts) => toastRaw(msg, opts);
export const sheet = (owner, html, opts) => sheetRaw(owner, html, opts);
export const closeSheet = (owner) => closeSheetRaw(owner);
export const popover = (anchor, html, opts) => popoverRaw(anchor, html, opts);
export const closePopover = () => closePopoverRaw();
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const uid = () => Math.random().toString(36).slice(2, 9);

const nf = (d) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: 0 });

// Disponibilité : assez de décimales pour distinguer 99,9 % de 99,99 %.
export function pct(v) {
  if (v == null) return '—';
  if (v >= 100) return '100 %';
  // Tronqué, jamais arrondi vers le haut : 98,99 % ne doit pas s'afficher « 99 % ».
  if (v >= 99) return `${nf(2).format(Math.min(99.99, Math.floor(v * 100) / 100))} %`;
  return `${nf(1).format(Math.floor(v * 10) / 10)} %`;
}

export function ms(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  if (n >= 10000) return `${nf(0).format(n / 1000)} s`;
  if (n >= 1000) return `${nf(2).format(n / 1000)} s`;
  return `${nf(0).format(n)} ms`;
}

export function bytes(v) {
  if (v == null) return '—';
  const n = Number(v);
  if (n >= 1073741824) return `${nf(1).format(n / 1073741824)} Go`;
  if (n >= 1048576) return `${nf(1).format(n / 1048576)} Mo`;
  if (n >= 1024) return `${nf(0).format(n / 1024)} Ko`;
  return `${nf(0).format(n)} o`;
}

export function dur(msv, { short = false } = {}) {
  if (msv == null || !Number.isFinite(msv)) return '—';
  const s = Math.max(0, Math.round(msv / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return short ? `${m} min` : `${m} min${s % 60 && m < 10 ? ` ${String(s % 60).padStart(2, '0')} s` : ''}`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`;
  const d = Math.floor(h / 24);
  return `${d} j${h % 24 && !short ? ` ${h % 24} h` : ''}`;
}

export function ago(t, now = Date.now()) {
  if (!t) return 'jamais';
  const s = Math.round((now - t) / 1000);
  if (s < 5) return 'à l’instant';
  if (s < 60) return `il y a ${s} s`;
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400 * 2) return `il y a ${dur(now - t, { short: true })}`;
  return dateTime(t);
}

export const time = (t, sec = false) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', ...(sec ? { second: '2-digit' } : {}) });
export const date = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
export const dateTime = (t) => `${date(t)} ${time(t)}`;

export function host(url) {
  try { return new URL(url).host; } catch { return String(url || ''); }
}

export const RANGES = [['1h', '1 h'], ['24h', '24 h'], ['7j', '7 j'], ['30j', '30 j'], ['90j', '90 j']];
export const RANGE_MS = { '1h': 3600e3, '24h': 86400e3, '7j': 7 * 86400e3, '30j': 30 * 86400e3, '90j': 90 * 86400e3 };

// États d'un site et types d'incident (libellés, couleurs, icônes du jeu de NEXORA).
export const STATE = {
  up: { label: 'En ligne', tone: 'ok' },
  slow: { label: 'Lent', tone: 'warn' },
  down: { label: 'En panne', tone: 'bad' },
  paused: { label: 'En pause', tone: 'mute' },
  unknown: { label: 'En attente', tone: 'mute' },
};
export const KIND = {
  down: { label: 'Panne', icon: 'error', tone: 'bad' },
  slow: { label: 'Lenteur', icon: 'clock', tone: 'warn' },
  cert: { label: 'Certificat', icon: 'lock', tone: 'warn' },
  errors: { label: 'Erreurs de page', icon: 'code', tone: 'warn' },
};
export const ALERT_KIND = {
  down: 'Panne', 'down-rappel': 'Rappel de panne', up: 'Rétablissement', slow: 'Lenteur', 'slow-ok': 'Fin de lenteur',
  cert: 'Certificat', 'cert-ok': 'Certificat renouvelé', errors: 'Erreurs de page', 'errors-ok': 'Fin des erreurs',
};
export const CHANNEL = { telegram: 'Telegram', email: 'E-mail', whatsapp: 'WhatsApp' };

// Palette des séries (mêmes teintes que le système de NEXORA, lisibles en clair comme en sombre).
export const PALETTE = ['#007aff', '#af52de', '#30b0c7', '#ff9500', '#ff2d55', '#34c759', '#5856d6', '#a2845e', '#ffcc00', '#64d2ff'];
export const PHASE = [
  ['dns', 'DNS', '#af52de'], ['tcp', 'Connexion', '#5856d6'], ['tls', 'TLS', '#30b0c7'], ['ttfb', 'Premier octet', '#007aff'], ['dl', 'Transfert', '#34c759'],
];

export function chip(text, tone = '', ic = '') {
  return `<span class="sup-chip ${tone}">${ic ? icon(ic, 11) : ''}${esc(text)}</span>`;
}

export function stateChip(state, pending) {
  const s = STATE[state] || STATE.unknown;
  return `<span class="sup-state ${s.tone}"><i></i>${esc(pending && state !== 'down' ? `${s.label} · vérification…` : s.label)}</span>`;
}

export async function call(channel, ...args) {
  return api.invoke(channel, ...args);
}

export function debounce(fn, msv) {
  let t = 0;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), msv); };
}

export function download(name, text) {
  return call('lab:save-text', { name, text, filters: [{ name: 'CSV', extensions: ['csv'] }] });
}

export function csv(rows) {
  return rows.map((r) => r.map((v) => {
    const s = v == null ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';')).join('\r\n');
}
