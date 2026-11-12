'use strict';
/* NEXORA #052 : contrôles avant mise en ligne : la page est chargée dans une fenêtre cachée (session du projet,
 * #016) sur un téléphone, une tablette et un ordinateur ; mesures de vitesse (LCP, CLS, premier octet),
 * débordements, erreurs de console, images sans texte de remplacement, aperçu de chaque appareil. */
const DEVICES = [
  { id: 'phone', name: 'Téléphone', width: 390, height: 844, mobile: true },
  { id: 'tablet', name: 'Tablette', width: 820, height: 1180, mobile: true },
  { id: 'desktop', name: 'Ordinateur', width: 1440, height: 900, mobile: false },
];
const DEFAULTS = { lcp: 2500, cls: 0.1, overflow: true, consoleErrors: 0, security: 70 };
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

const PROBE = `new Promise((resolve) => {
  const out = { lcp: 0, cls: 0 };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) out.lcp = Math.max(out.lcp, e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) out.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
  setTimeout(() => {
    const n = performance.getEntriesByType('navigation')[0] || {};
    const res = performance.getEntriesByType('resource');
    const w = document.documentElement.clientWidth;
    const wide = [];
    for (const el of document.body ? document.body.querySelectorAll('*') : []) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > w + 1 && getComputedStyle(el).position !== 'fixed') { wide.push((el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')).slice(0, 80)); if (wide.length >= 5) break; }
    }
    resolve({ ...out, ttfb: Math.round(n.responseStart || 0), dcl: Math.round(n.domContentLoadedEventEnd || 0), load: Math.round(n.loadEventEnd || 0),
      requests: res.length + 1, bytes: Math.round(res.reduce((s, r) => s + (r.transferSize || 0), n.transferSize || 0)),
      overflow: document.documentElement.scrollWidth > w + 1, wide, imagesNoAlt: [...document.images].filter((i) => !i.hasAttribute('alt')).length,
      title: document.title, viewport: !!document.querySelector('meta[name=viewport]') });
  }, 1800);
})`;

async function runChecks({ BrowserWindow, partition }, { url, thresholds = {} }) {
  if (!/^https?:\/\//i.test(url || '')) throw new Error('Lancez le projet ou indiquez l’adresse à contrôler.');
  const th = { ...DEFAULTS, ...thresholds };
  const devices = [];
  for (const d of DEVICES) {
    const w = new BrowserWindow({ show: false, width: d.width, height: d.height, useContentSize: true, webPreferences: { offscreen: true, sandbox: true, partition, backgroundThrottling: false } });
    const errors = [];
    w.webContents.on('console-message', (...a) => { const e = a[0] && typeof a[0] === 'object' && 'level' in a[0] ? a[0] : { level: a[1], message: a[2] }; if (e.level === 'error' || e.level === 3) errors.push(String(e.message).slice(0, 300)); });
    try {
      if (d.mobile) w.webContents.setUserAgent(MOBILE_UA);
      w.webContents.enableDeviceEmulation({ screenPosition: d.mobile ? 'mobile' : 'desktop', screenSize: { width: d.width, height: d.height }, viewSize: { width: d.width, height: d.height }, deviceScaleFactor: 1, scale: 1 });
      await Promise.race([w.loadURL(url), new Promise((_, rej) => setTimeout(() => rej(new Error('Page trop longue à charger (30 s).')), 30000))]);
      const m = await w.webContents.executeJavaScript(PROBE, true);
      const img = await w.webContents.capturePage();
      const shot = img.resize({ width: d.mobile ? 180 : 360 }).toDataURL();
      const fails = [];
      if (m.lcp > th.lcp) fails.push(`Affichage principal en ${(m.lcp / 1000).toFixed(1)} s (seuil ${(th.lcp / 1000).toFixed(1)} s)`);
      if (m.cls > th.cls) fails.push(`Décalages de mise en page ${m.cls.toFixed(2)} (seuil ${th.cls})`);
      if (th.overflow && m.overflow) fails.push(`La page déborde en largeur${m.wide.length ? ` (${m.wide.slice(0, 2).join(', ')})` : ''}`);
      if (errors.length > th.consoleErrors) fails.push(`${errors.length} erreur(s) dans la console`);
      if (d.mobile && !m.viewport) fails.push('Balise viewport absente : la page n’est pas adaptée aux mobiles');
      devices.push({ ...d, metrics: m, errors: errors.slice(0, 10), shot, fails, ok: !fails.length });
    } catch (e) {
      devices.push({ ...d, error: e.message, fails: [e.message], ok: false });
    } finally { w.destroy(); }
  }
  return { url, devices, ok: devices.every((d) => d.ok), thresholds: th, at: Date.now() };
}

module.exports = { runChecks, DEVICES, DEFAULTS };
