'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const INVOKE = new Set([
  'project:pick', 'project:analyze', 'project:start', 'project:stop', 'project:flutter-web',
  'sdk:check', 'sdk:describe', 'url:check',
  'fs:tree', 'fs:read', 'fs:exists', 'editor:open',
  'device:emulate', 'device:env', 'device:set-scale', 'device:devtools',
  'capture:shot', 'capture:save', 'screencast:start', 'screencast:stop', 'dialog:open-file',
  'shell:open', 'shell:reveal', 'shell:external', 'clipboard:read', 'clipboard:write',
  'settings:load', 'settings:save', 'app:info',
  'window:titlebar', 'window:fullscreen', 'window:zoom', 'system:dark',
  'autotest:snap', 'autotest:resize', 'autotest:quit', 'autotest:log',
]);
// Espaces ajoutés en v3 : chaque module principal déclare ses canaux sous un préfixe.
// NEXORA #016 : 'tools:' (détection et installation des outils de développement).
// NEXORA #023 : 'desktop:' (Desktop Builder : construction des logiciels de bureau, progression et journal).
// NEXORA #037 : 'plan:' (offre du compte : plan:status, plan:refresh ; événement plan:blocked).
// NEXORA #076 : 'license:' (licence obligatoire, journaux de session) et 'novx:' (projets en fichiers .novx).
const PREFIXES = ['android:', 'lab:', 'dev:', 'git:', 'gh:', 'tunnel:', 'skins:', 'ai:', 'media:', 'backup:', 'update:', 'support:', 'mon:', 'project:', 'tts:', 'sec:', 'tools:', 'tel:', 'desktop:', 'plan:', 'devx:', 'dzx:', 'license:', 'novx:'];
const allowed = (set, channel) => set.has(channel) || PREFIXES.some((p) => channel.startsWith(p));
const EVENTS = new Set([
  'runner:log', 'runner:status', 'runner:hot-reload', 'static:change', 'shortcut',
  'screencast:frame', 'device:net', 'system:theme', 'window:fullscreen', 'tools:detected', 'tools:progress',
]);

contextBridge.exposeInMainWorld('vitrine', {
  platform: process.platform,
  chromeVersion: process.versions.chrome,
  invoke(channel, ...args) {
    if (!allowed(INVOKE, channel)) throw new Error(`Canal non autorisé : ${channel}`);
    // Message d'erreur sans l'en-tête technique d'Electron (« Error invoking remote method… »).
    return ipcRenderer.invoke(channel, ...args).catch((err) => {
      const m = String((err && err.message) || err).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
      throw new Error(m);
    });
  },
  on(channel, cb) {
    if (!allowed(EVENTS, channel)) throw new Error(`Canal non autorisé : ${channel}`);
    const fn = (_e, data) => cb(data);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  },
  pathForFile(file) {
    try { return webUtils.getPathForFile(file); } catch { return ''; }
  },
});
