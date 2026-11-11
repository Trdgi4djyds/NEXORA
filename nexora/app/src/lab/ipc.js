'use strict';
/* Canaux IPC du Browser Lab (lab:*). */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { webContents } = require('electron');
const cdp = require('./cdp');
const { NetRecorder } = require('./network');
const { Scraper } = require('./scraper');
const { NavTester } = require('./tester');
const { elementCode, elementShot } = require('./elements');
const { snapUrl } = require('./snap');
// NEXORA #016 : chaque projet a sa propre session (cookies, stockage, cache) ; les outils utilisent celle du projet ouvert.
const isolation = require('../isolation');

const THROTTLE = {
  none: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
  fibre: { offline: false, latency: 5, downloadThroughput: 12.5e6, uploadThroughput: 6.25e6 },
  '4g': { offline: false, latency: 165, downloadThroughput: 1012500, uploadThroughput: 168750 },
  '3g': { offline: false, latency: 562.5, downloadThroughput: 180000, uploadThroughput: 84375 },
  '3g-slow': { offline: false, latency: 2000, downloadThroughput: 50000, uploadThroughput: 50000 },
  edge: { offline: false, latency: 840, downloadThroughput: 30000, uploadThroughput: 16000 },
  offline: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
};

function register({
  ipcMain, app, dialog, shell, send, getWin, forgetEmulation,
}) {
  const { session: elSession } = require('electron');
  // NEXORA #005 : avec une adresse, seules les données de ce site sont effacées (cookies, stockage, cache) ;
  // les sessions des autres sites et projets restent intactes. Sans adresse : tout, comme avant.
  ipcMain.handle('lab:clear-session', async (_e, { url } = {}) => {
    const ses = elSession.fromPartition(isolation.partition());
    let origin = '';
    try { origin = url ? new URL(url).origin : ''; } catch { origin = ''; }
    if (origin && origin !== 'null') {
      if (typeof ses.clearData === 'function') await ses.clearData({ origins: [origin] });
      else await ses.clearStorageData({ origin });
      return true;
    }
    await ses.clearStorageData();
    await ses.clearCache();
    return true;
  });
  const recorders = new Map();
  const jobs = new Map();
  let seq = 0;
  const wcOf = (id) => {
    const wc = webContents.fromId(Number(id));
    if (!wc || wc.isDestroyed()) throw new Error('Page fermée.');
    return wc;
  };

  // ------------------------------------------------------------- réseau
  ipcMain.handle('lab:net-start', async (_e, { wcId, preserve }) => {
    const wc = wcOf(wcId);
    let r = recorders.get(wc.id);
    if (!r) {
      r = new NetRecorder(wc, (payload) => send('lab:net', { wcId: wc.id, ...payload }));
      recorders.set(wc.id, r);
      wc.once('destroyed', () => { r.stop(); recorders.delete(wc.id); });
      await r.start();
    }
    r.preserve = Boolean(preserve);
    return true;
  });
  ipcMain.handle('lab:net-stop', (_e, { wcId }) => {
    const r = recorders.get(Number(wcId));
    if (r) { r.stop(); recorders.delete(Number(wcId)); }
    return true;
  });
  ipcMain.handle('lab:net-clear', (_e, { wcId }) => { const r = recorders.get(Number(wcId)); if (r) r.reset(); return true; });
  ipcMain.handle('lab:net-preserve', (_e, { wcId, on }) => { const r = recorders.get(Number(wcId)); if (r) r.preserve = Boolean(on); return true; });
  ipcMain.handle('lab:net-detail', (_e, { wcId, id }) => { const r = recorders.get(Number(wcId)); return r ? r.details(id) : null; });
  ipcMain.handle('lab:net-body', async (_e, { wcId, id }) => {
    const r = recorders.get(Number(wcId));
    if (!r) return null;
    try { return await r.body(id); } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('lab:net-har', async (_e, { wcId, name }) => {
    const r = recorders.get(Number(wcId));
    if (!r) throw new Error("L'enregistrement réseau n'est pas actif.");
    const res = await dialog.showSaveDialog(getWin(), {
      title: 'Exporter au format HAR', defaultPath: path.join(app.getPath('downloads'), `${String(name || 'reseau').replace(/[<>:"/\\|?*]+/g, '-')}.har`), filters: [{ name: 'HAR', extensions: ['har'] }],
    });
    if (res.canceled || !res.filePath) return null;
    fs.writeFileSync(res.filePath, JSON.stringify(r.har(app.getVersion()), null, 1));
    return res.filePath;
  });
  ipcMain.handle('lab:net-block', async (_e, { wcId, patterns }) => {
    const wc = wcOf(wcId);
    await cdp.send(wc, 'Network.enable');
    await cdp.send(wc, 'Network.setBlockedURLs', { urls: (patterns || []).filter(Boolean) });
    return true;
  });
  ipcMain.handle('lab:net-throttle', async (_e, { wcId, preset }) => {
    const wc = wcOf(wcId);
    await cdp.send(wc, 'Network.enable');
    await cdp.send(wc, 'Network.emulateNetworkConditions', THROTTLE[preset] || THROTTLE.none);
    return true;
  });
  ipcMain.handle('lab:net-cache', async (_e, { wcId, disabled }) => {
    const wc = wcOf(wcId);
    await cdp.send(wc, 'Network.enable');
    await cdp.send(wc, 'Network.setCacheDisabled', { cacheDisabled: Boolean(disabled) });
    return true;
  });
  ipcMain.handle('lab:emu-clear', async (_e, { wcId }) => {
    const wc = wcOf(wcId);
    // NEXORA #107 : émulation retirée (aperçu pleine largeur du Dev Lab) : elle n'est plus rejouée au changement de zoom.
    if (forgetEmulation) forgetEmulation(wc.id);
    for (const [m, p] of [['Emulation.clearDeviceMetricsOverride', {}], ['Emulation.setTouchEmulationEnabled', { enabled: false }], ['Emulation.setUserAgentOverride', { userAgent: wc.session.getUserAgent() }], ['Emulation.setScrollbarsHidden', { hidden: false }]]) {
      try { await cdp.send(wc, m, p); } catch { /* ignore */ }
    }
    return true;
  });
  ipcMain.handle('lab:cpu', async (_e, { wcId, rate }) => {
    await cdp.send(wcOf(wcId), 'Emulation.setCPUThrottlingRate', { rate: Number(rate) || 1 });
    return true;
  });
  // Faits réseau pour l'audit (compression, cache, tailles) à partir des requêtes enregistrées.
  ipcMain.handle('lab:net-facts', (_e, { wcId }) => {
    const r = recorders.get(Number(wcId));
    if (!r) return null;
    return r.order.map((id) => r.details(id)).filter(Boolean).map((e) => {
      const h = Object.fromEntries(Object.entries(e.resHeaders || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
      return {
        url: e.url, type: e.type, status: e.status, mime: e.mime, encoded: e.encoded, decoded: e.decoded, protocol: e.protocol, fromCache: e.fromCache || e.fromMemory, failed: e.failed, encoding: h['content-encoding'] || '', cache: h['cache-control'] || '', expires: h.expires || '', etag: Boolean(h.etag || h['last-modified']), start: e.start, end: e.end, timing: e.timing, priority: e.priority, security: e.security,
      };
    });
  });

  // Lecture d'une adresse avec la session du navigateur (robots.txt, sitemap, en-têtes).
  ipcMain.handle('lab:fetch', async (_e, { url, method = 'GET', max = 65536 }) => {
    const { net, session } = require('electron');
    try {
      const r = await net.fetch(url, { method, redirect: 'follow', session: session.fromPartition(isolation.partition()) });
      let text = '';
      if (method !== 'HEAD') { text = await r.text(); text = text.slice(0, max); }
      return { status: r.status, url: r.url, headers: Object.fromEntries(r.headers), text };
    } catch (e) { return { status: 0, error: e.message }; }
  });

  // Code JavaScript et CSS réellement utilisé au chargement (couverture), page rechargée.
  ipcMain.handle('lab:coverage', async (_e, { wcId, wait = 2500 }) => {
    const wc = wcOf(wcId);
    const sheets = new Map();
    const off = cdp.on(wc, (m, p) => { if (m === 'CSS.styleSheetAdded') sheets.set(p.header.styleSheetId, p.header); });
    try {
      await cdp.send(wc, 'Profiler.enable');
      await cdp.send(wc, 'Profiler.startPreciseCoverage', { callCount: false, detailed: true });
      await cdp.send(wc, 'DOM.enable');
      await cdp.send(wc, 'CSS.enable');
      await cdp.send(wc, 'CSS.startRuleUsageTracking');
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 30000);
        wc.once('did-finish-load', () => { clearTimeout(t); resolve(); });
        wc.reloadIgnoringCache();
      });
      await new Promise((r) => setTimeout(r, wait));
      const js = await cdp.send(wc, 'Profiler.takePreciseCoverage');
      const css = await cdp.send(wc, 'CSS.stopRuleUsageTracking');
      await cdp.send(wc, 'Profiler.stopPreciseCoverage');
      const out = [];
      for (const s of js.result) {
        if (!s.url || !/^https?:/.test(s.url)) continue;
        const top = s.functions.reduce((a, f) => Math.max(a, ...f.ranges.map((r) => r.endOffset)), 0);
        if (!top) continue;
        const used = new Uint8Array(top);
        for (const f of s.functions) for (const r of f.ranges) used.fill(r.count > 0 ? 1 : 0, r.startOffset, r.endOffset);
        let n = 0;
        for (let i = 0; i < top; i += 1) n += used[i];
        const prev = out.find((x) => x.url === s.url && x.type === 'js');
        if (prev) { prev.total += top; prev.used += n; } else out.push({ url: s.url, type: 'js', total: top, used: n });
      }
      const bySheet = new Map();
      for (const r of css.ruleUsage) {
        const v = bySheet.get(r.styleSheetId) || { used: 0, rules: 0, usedRules: 0 };
        v.rules += 1;
        if (r.used) { v.used += r.endOffset - r.startOffset; v.usedRules += 1; }
        bySheet.set(r.styleSheetId, v);
      }
      for (const [id, v] of bySheet) {
        const h = sheets.get(id);
        let total = h && h.length ? h.length : 0;
        if (!total) { try { total = (await cdp.send(wc, 'CSS.getStyleSheetText', { styleSheetId: id })).text.length; } catch { total = 0; } }
        if (!total) continue;
        out.push({ url: (h && (h.sourceURL || (h.isInline ? `${wc.getURL()} (style intégré)` : ''))) || '(feuille de style)', type: 'css', total, used: Math.min(total, v.used), rules: v.rules, usedRules: v.usedRules });
      }
      return out.sort((a, b) => (b.total - b.used) - (a.total - a.used));
    } finally { off(); }
  });

  // ------------------------------------------------------------- éléments (sélection façon Figma)
  ipcMain.handle('lab:el-code', (_e, { wcId, maxNodes }) => elementCode(wcOf(wcId), { maxNodes }));
  ipcMain.handle('lab:el-shot', (_e, { wcId, scale }) => elementShot(wcOf(wcId), { scale }));

  // ------------------------------------------------------------- DevTools intégrés
  ipcMain.handle('lab:devtools-open', (_e, { targetId, hostId }) => {
    const target = wcOf(targetId);
    const host = wcOf(hostId);
    if (target.isDevToolsOpened()) target.closeDevTools();
    target.setDevToolsWebContents(host);
    target.openDevTools({ mode: 'detach', activate: false });
    return true;
  });
  ipcMain.handle('lab:devtools-close', (_e, { targetId }) => {
    try { const t = wcOf(targetId); if (t.isDevToolsOpened()) t.closeDevTools(); } catch { /* fermé */ }
    return true;
  });
  ipcMain.handle('lab:devtools-inspect', (_e, { targetId, x, y }) => { wcOf(targetId).inspectElement(Math.round(x), Math.round(y)); return true; });

  // ------------------------------------------------------------- aspiration de site
  const sitesDir = () => path.join(app.getPath('documents'), 'NEXORA', 'Sites');
  ipcMain.handle('lab:scrape-start', (_e, { url, options }) => {
    const id = `s${++seq}`;
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nexora-site-'));
    const job = new Scraper({
      url, options, workDir: work, partition: isolation.partition(), emit: (p) => send('lab:scrape', { id, ...p }),
    });
    jobs.set(id, { kind: 'scrape', job, work });
    job.run().catch((e) => send('lab:scrape', { id, phase: 'error', error: e.message }));
    return { id, host: job.host };
  });
  ipcMain.handle('lab:scrape-cancel', (_e, { id }) => { const j = jobs.get(id); if (j) j.job.cancel(); return true; });
  ipcMain.handle('lab:scrape-save', async (_e, { id, mode }) => {
    const j = jobs.get(id);
    if (!j) throw new Error('Aspiration introuvable.');
    const host = j.job.host.replace(/[:]/g, '_');
    if (mode === 'zip') {
      const res = await dialog.showSaveDialog(getWin(), { title: 'Enregistrer le site (ZIP)', defaultPath: path.join(app.getPath('downloads'), `${host}.zip`), filters: [{ name: 'Archive ZIP', extensions: ['zip'] }] });
      if (res.canceled || !res.filePath) return null;
      await zipDir(j.work, res.filePath, host);
      return { file: res.filePath };
    }
    let dest;
    if (mode === 'choose') {
      const res = await dialog.showOpenDialog(getWin(), { title: 'Dossier où enregistrer le code source du site', defaultPath: sitesDir(), properties: ['openDirectory', 'createDirectory'] });
      if (res.canceled || !res.filePaths[0]) return null;
      dest = path.join(res.filePaths[0], host);
    } else dest = path.join(sitesDir(), host);
    if (fs.existsSync(dest)) dest = `${dest} ${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}`;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(j.work, dest, { recursive: true });
    j.saved = dest;
    return { dir: dest, index: path.join(dest, ...(j.job.report().index || 'index.html').split('/')) };
  });
  ipcMain.handle('lab:scrape-discard', (_e, { id }) => {
    const j = jobs.get(id);
    if (j) { try { fs.rmSync(j.work, { recursive: true, force: true }); } catch { /* déjà supprimé */ } jobs.delete(id); }
    return true;
  });
  // Capture d'une page à la définition d'un appareil (Studio 3D, publicités, présentations).
  ipcMain.handle('lab:snap-url', (_e, opts) => snapUrl({ ...opts, partition: isolation.partition(), chrome: process.versions.chrome }));
  ipcMain.handle('lab:reveal', (_e, p) => shell.showItemInFolder(p));
  ipcMain.handle('lab:open-path', (_e, p) => shell.openPath(p));

  // ------------------------------------------------------------- tests automatiques
  ipcMain.handle('lab:test-start', (_e, {
    url, kind, options, steps, viewport,
  }) => {
    const id = `t${++seq}`;
    const job = new NavTester({
      url, options, partition: isolation.partition(), chrome: process.versions.chrome, emit: (p) => send('lab:test', { id, ...p }),
    });
    jobs.set(id, { kind: 'test', job });
    const p = kind === 'scenario' ? job.scenario(steps || [], viewport) : job.explore();
    p.catch((e) => send('lab:test', { id, phase: 'error', error: e.message })).finally(() => setTimeout(() => jobs.delete(id), 60000));
    return { id };
  });
  ipcMain.handle('lab:test-cancel', (_e, { id }) => { const j = jobs.get(id); if (j) j.job.cancel(); return true; });
  ipcMain.handle('lab:save-text', async (_e, { name, text, filters }) => {
    const res = await dialog.showSaveDialog(getWin(), { defaultPath: path.join(app.getPath('downloads'), name), filters });
    if (res.canceled || !res.filePath) return null;
    fs.writeFileSync(res.filePath, text);
    return res.filePath;
  });

  app.on('before-quit', () => {
    for (const j of jobs.values()) {
      try { j.job.cancel(); } catch { /* ignore */ }
      if (j.work && !j.saved) { try { fs.rmSync(j.work, { recursive: true, force: true }); } catch { /* ignore */ } }
    }
  });
}

function zipDir(dir, file, root) {
  const yazl = require('yazl');
  return new Promise((resolve, reject) => {
    const z = new yazl.ZipFile();
    const walk = (d, rel) => {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, ent.name);
        const r = rel ? `${rel}/${ent.name}` : ent.name;
        if (ent.isDirectory()) walk(p, r);
        else if (ent.isFile()) z.addFile(p, `${root}/${r}`);
      }
    };
    walk(dir, '');
    z.end();
    z.outputStream.pipe(fs.createWriteStream(file)).on('close', resolve).on('error', reject);
  });
}

module.exports = { register, THROTTLE };
