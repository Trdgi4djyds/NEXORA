'use strict';
/* Capture d'une page dans une fenêtre cachée, à la définition d'un appareil (Studio, présentations) :
 * la page de l'ordinateur est la version ordinateur, celle du téléphone la version mobile.
 * Renvoie aussi les informations utiles du site (titre, description, titres, couleur, logo). */
const { BrowserWindow } = require('electron');
const cdp = require('./cdp');

const wc0FrameRate = (win) => { try { win.webContents.setFrameRate(30); } catch { /* ancien Electron */ } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MOBILE_UA = (v) => `Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Mobile Safari/537.36`;

const INFO = `(() => {
  const q = (s) => document.querySelector(s);
  const meta = (n) => (q('meta[name="' + n + '"]') || q('meta[property="' + n + '"]') || {}).content || '';
  const txt = (el) => (el ? (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim() : '');
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const h2 = [...document.querySelectorAll('h2, h3')].filter(vis).map((el) => {
    let p = el.nextElementSibling;
    while (p && !/^(P|DIV|SPAN)$/.test(p.tagName)) p = p.nextElementSibling;
    return { title: txt(el).slice(0, 90), text: txt(p).slice(0, 220) };
  }).filter((x) => x.title).slice(0, 10);
  const icons = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]')]
    .map((l) => ({ href: l.href, size: parseInt((l.getAttribute('sizes') || '0').split('x')[0], 10) || (l.rel.includes('apple') ? 180 : 16) }))
    .sort((a, b) => b.size - a.size);
  const logoImg = [...document.querySelectorAll('header img, nav img, [class*="logo" i] img, img[alt*="logo" i], img[class*="logo" i]')].find(vis);
  const btn = [...document.querySelectorAll('a[class*="btn" i], a[class*="button" i], button, [role=button]')].filter(vis).map(txt).find((s) => s && s.length < 32);
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const accent = (() => {
    const el = [...document.querySelectorAll('a[class*="btn" i], button, header, nav')].find((e) => vis(e) && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(getComputedStyle(e).backgroundColor));
    return el ? getComputedStyle(el).backgroundColor : '';
  })();
  return {
    url: location.href, title: document.title, description: meta('description') || meta('og:description'), siteName: meta('og:site_name') || meta('application-name'),
    h1: txt(q('h1')).slice(0, 120), sections: h2, themeColor: meta('theme-color'), ogImage: meta('og:image'),
    icon: (icons[0] || {}).href || '', logo: logoImg ? (logoImg.currentSrc || logoImg.src) : '', cta: btn || '', bodyBg, accent, lang: document.documentElement.lang || '',
  };
})()`;

async function snapUrl({
  url, width = 1440, height = 900, dpr = 1, mobile = false, full = false, maxHeight = 12000, wait = 1200, info = false, partition = 'persist:vitrine', chrome = '140.0.0.0', timeout = 25000,
}) {
  const win = new BrowserWindow({ show: false, width, height, webPreferences: { partition, backgroundThrottling: false, sandbox: true, offscreen: true } });
  // Rendu hors écran : une fenêtre cachée ordinaire ne produit pas d'images, la capture ne répondrait pas.
  wc0FrameRate(win);
  const wc = win.webContents;
  wc.setAudioMuted(true);
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  try {
    await wc.loadURL('about:blank').catch(() => {});
    win.setContentSize(width, height);
    await cdp.send(wc, 'Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: dpr, mobile, screenWidth: width, screenHeight: height,
    });
    await cdp.send(wc, 'Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
    await cdp.send(wc, 'Emulation.setScrollbarsHidden', { hidden: true }).catch(() => {});
    if (mobile) await cdp.send(wc, 'Emulation.setUserAgentOverride', { userAgent: MOBILE_UA(chrome) });
    await new Promise((resolve) => {
      const done = () => { clearTimeout(t); wc.removeListener('did-finish-load', done); wc.removeListener('did-fail-load', fail); resolve(); };
      const fail = (_e, _c, _d, _u, main) => { if (main) done(); };
      const t = setTimeout(done, timeout);
      wc.on('did-finish-load', done);
      wc.on('did-fail-load', fail);
      wc.loadURL(url).catch(() => {});
    });
    // Images différées : on fait défiler la page pour déclencher leur chargement.
    if (full) {
      await wc.executeJavaScript(`(async () => { const H = Math.min(document.documentElement.scrollHeight, ${maxHeight}); for (let y = 0; y < H; y += innerHeight * 0.8) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } scrollTo(0, 0); })()`).catch(() => {});
    }
    await sleep(wait);
    const meta = info ? await wc.executeJavaScript(INFO).catch(() => null) : null;
    if (meta) {
      // Logo du site (même origine) en data URL, pour les publicités et les présentations.
      const src = [meta.logo, meta.icon].filter(Boolean);
      meta.logoData = await wc.executeJavaScript(`(async (list) => {
        for (const u of list) {
          try {
            const r = await fetch(u, { credentials: 'include' });
            if (!r.ok) continue;
            const b = await r.blob();
            if (b.size > 600000 || !/^image\\//.test(b.type)) continue;
            return await new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = () => res(''); f.readAsDataURL(b); });
          } catch (e) { /* suivant */ }
        }
        return '';
      })(${JSON.stringify(src)})`).catch(() => '');
    }
    let cssH = height;
    if (full) {
      const sh = await wc.executeJavaScript('Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)').catch(() => height);
      cssH = Math.max(height, Math.min(maxHeight, Number(sh) || height));
    }
    const shot = await cdp.send(wc, 'Page.captureScreenshot', {
      format: 'jpeg', quality: 90, captureBeyondViewport: full, clip: {
        x: 0, y: 0, width, height: cssH, scale: 1,
      },
    });
    const sb = await wc.executeJavaScript(`(() => { const c = (document.querySelector('meta[name="theme-color"]') || {}).content; return c || getComputedStyle(document.body).backgroundColor; })()`).catch(() => '#ffffff');
    return {
      data: `data:image/jpeg;base64,${shot.data}`, cssW: width, cssH, dpr, info: meta, statusBg: sb,
    };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

module.exports = { snapUrl };
