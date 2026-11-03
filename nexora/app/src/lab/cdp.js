'use strict';
/* Protocole Chrome DevTools sur une webContents : une seule connexion, plusieurs auditeurs. */
const listeners = new Map(); // wcId → Set(fn(method, params))
const hooked = new Set();

function attach(wc) {
  if (!wc || wc.isDestroyed()) throw new Error('Page fermée');
  if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
  if (!hooked.has(wc.id)) {
    hooked.add(wc.id);
    wc.debugger.on('message', (_e, method, params) => {
      const set = listeners.get(wc.id);
      if (set) for (const fn of [...set]) { try { fn(method, params); } catch { /* auditeur défaillant */ } }
    });
    wc.debugger.on('detach', () => { hooked.delete(wc.id); });
    wc.once('destroyed', () => { hooked.delete(wc.id); listeners.delete(wc.id); });
  }
}

function on(wc, fn) {
  attach(wc);
  if (!listeners.has(wc.id)) listeners.set(wc.id, new Set());
  listeners.get(wc.id).add(fn);
  return () => { const s = listeners.get(wc.id); if (s) s.delete(fn); };
}

function send(wc, method, params = {}) {
  attach(wc);
  return wc.debugger.sendCommand(method, params);
}

module.exports = { attach, on, send };
