'use strict';
/* Inspection d'une application web progressive, à la manière de PWABuilder :
 *  - manifest (présence, champs requis, recommandés et facultatifs, icônes, captures d'écran),
 *  - service worker (enregistré, contrôle de la page, hors ligne, notifications push, synchronisation),
 *  - sécurité (https, certificat, contenu mixte).
 * Génère aussi les fichiers manquants : manifest.json, service worker, page hors ligne, icônes. */
const fs = require('fs');
const path = require('path');
const { BrowserWindow } = require('electron');
const cdp = require('../lab/cdp');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const DISPLAYS = ['fullscreen', 'standalone', 'minimal-ui', 'browser'];
const ORIENTATIONS = ['any', 'natural', 'landscape', 'landscape-primary', 'landscape-secondary', 'portrait', 'portrait-primary', 'portrait-secondary'];
const str = (v) => typeof v === 'string' && v.trim().length > 0;

/* Tests du manifest (même liste et mêmes catégories que PWABuilder). */
function manifestTests(m) {
  const icons = Array.isArray(m.icons) ? m.icons : [];
  const sizes = (i) => String(i.sizes || '').split(/\s+/).map((s) => Number(s.split('x')[0]) || (s === 'any' ? 9999 : 0));
  const purposes = (i) => String(i.purpose || 'any').split(/\s+/);
  const hasSize = (n) => icons.some((i) => sizes(i).some((s) => s >= n));
  const T = [
    ['name', 'required', 'Nom de l’application (name)', str(m.name)],
    ['short_name', 'required', 'Nom court (short_name)', str(m.short_name), m.short_name && m.short_name.length > 12 ? 'Plus de 12 caractères : il sera coupé sous l’icône.' : ''],
    ['start_url', 'required', 'Adresse de démarrage (start_url)', str(m.start_url)],
    ['icons', 'required', 'Icônes (icons)', icons.length > 0],
    ['icons', 'recommended', 'Une icône 512 × 512 ou plus', hasSize(512)],
    ['icons', 'recommended', 'Une icône 192 × 192 ou plus', hasSize(192)],
    ['icons', 'recommended', 'Une icône « any »', icons.some((i) => purposes(i).includes('any'))],
    ['icons', 'recommended', 'Une icône adaptable (purpose maskable)', icons.some((i) => purposes(i).includes('maskable'))],
    ['icons', 'optional', 'Une icône monochrome (icônes à thème)', icons.some((i) => purposes(i).includes('monochrome'))],
    ['display', 'recommended', 'Mode d’affichage (display)', DISPLAYS.includes(m.display), m.display && !DISPLAYS.includes(m.display) ? `Valeur inconnue : ${m.display}` : ''],
    ['background_color', 'recommended', 'Couleur de fond en hexadécimal (background_color)', HEX.test(m.background_color || '')],
    ['theme_color', 'recommended', 'Couleur du thème en hexadécimal (theme_color)', HEX.test(m.theme_color || '')],
    ['description', 'recommended', 'Description', str(m.description)],
    ['orientation', 'recommended', 'Orientation', ORIENTATIONS.includes(m.orientation)],
    ['screenshots', 'recommended', 'Captures d’écran (screenshots)', Array.isArray(m.screenshots) && m.screenshots.length > 0],
    ['screenshots', 'optional', 'Captures pour ordinateur (form_factor wide)', Array.isArray(m.screenshots) && m.screenshots.some((s) => s.form_factor === 'wide')],
    ['id', 'recommended', 'Identifiant de l’application (id)', str(m.id)],
    ['display_override', 'recommended', 'display_override', Array.isArray(m.display_override) && m.display_override.length > 0],
    ['launch_handler', 'recommended', 'launch_handler', Boolean(m.launch_handler)],
    ['edge_side_panel', 'recommended', 'edge_side_panel', Boolean(m.edge_side_panel)],
    ['handle_links', 'recommended', 'handle_links', ['auto', 'preferred', 'not-preferred'].includes(m.handle_links)],
    ['scope', 'optional', 'Portée (scope)', str(m.scope)],
    ['shortcuts', 'optional', 'Raccourcis (shortcuts)', Array.isArray(m.shortcuts) && m.shortcuts.length > 0],
    ['categories', 'optional', 'Catégories', Array.isArray(m.categories) && m.categories.length > 0],
    ['lang', 'optional', 'Langue (lang)', str(m.lang)],
    ['dir', 'optional', 'Sens du texte (dir)', ['ltr', 'rtl', 'auto'].includes(m.dir)],
    ['share_target', 'optional', 'Cible de partage (share_target)', Boolean(m.share_target && typeof m.share_target === 'object')],
    ['protocol_handlers', 'optional', 'Gestion de protocoles (protocol_handlers)', Array.isArray(m.protocol_handlers) && m.protocol_handlers.length > 0],
    ['file_handlers', 'optional', 'Ouverture de fichiers (file_handlers)', Array.isArray(m.file_handlers) && m.file_handlers.every((f) => f.action && f.accept)],
    ['related_applications', 'optional', 'Applications liées (related_applications)', Array.isArray(m.related_applications) && m.related_applications.length > 0],
    ['prefer_related_applications', 'optional', 'prefer_related_applications booléen', typeof m.prefer_related_applications === 'boolean'],
    ['iarc_rating_id', 'optional', 'Classification IARC (iarc_rating_id)', str(m.iarc_rating_id)],
    ['scope_extensions', 'optional', 'scope_extensions', Array.isArray(m.scope_extensions) && m.scope_extensions.every((x) => x && x.origin)],
    ['widgets', 'optional', 'Widgets', Array.isArray(m.widgets) && m.widgets.length > 0],
  ];
  return T.map(([member, category, label, ok, note]) => ({
    member, category, label, ok: Boolean(ok), note: note || '',
  }));
}

/* Analyse d'une adresse. Renvoie { url, manifest, manifestUrl, tests, sw, security, icons, score }. */
/* Reconnaissance de l'identité d'un site (exécuté dans la page) : nom, nom court, description, langue,
 * logos candidats (manifest, apple-touch-icon, favicons, logo de l'en-tête, image de partage), couleurs
 * (theme-color, variables CSS de marque, en-tête, boutons, liens), polices, contacts et réseaux sociaux. */
const identityScript = `async (manifest) => {
  const meta = (sel) => { const e = document.querySelector(sel); return e ? (e.content || '').trim() : ''; };
  const abs = (u) => { try { return new URL(u, location.href).href; } catch (e) { return ''; } };
  const clean = (t) => String(t || '').replace(/\\s+/g, ' ').trim();
  const title = clean(document.title);
  const parts = title.split(/\\s+[|\\-–—·:•»]\\s+/).map(clean).filter(Boolean);
  const host = location.hostname.replace(/^www\\./, '');
  const hostWord = host.split('.')[0].toLowerCase();
  const names = [];
  const addName = (v, src, w) => { v = clean(v); if (v && v.length <= 60) names.push({ v, src, w }); };
  if (manifest) { addName(manifest.name, 'manifest', 10); addName(manifest.short_name, 'manifest-court', 8); }
  addName(meta('meta[name="application-name"]'), 'application-name', 9);
  addName(meta('meta[name="apple-mobile-web-app-title"]'), 'apple-title', 9);
  addName(meta('meta[property="og:site_name"]'), 'og:site_name', 9);
  // Segment du titre qui ressemble au domaine, sinon le dernier segment (souvent la marque).
  const byHost = parts.find((p) => p.toLowerCase().replace(/[^a-z0-9]/g, '').includes(hostWord.replace(/[^a-z0-9]/g, '')));
  if (byHost) addName(byHost, 'titre', 7);
  else if (parts.length > 1) addName(parts[parts.length - 1], 'titre', 5);
  addName(parts[0], 'titre', 3);
  const logoEl = document.querySelector('header [class*="logo" i] img, header img[alt*="logo" i], [class*="logo" i] img, img[class*="logo" i], img[id*="logo" i], img[alt*="logo" i], a[class*="brand" i] img, .navbar-brand img');
  if (logoEl && logoEl.alt) addName(logoEl.alt.replace(/\\blogo\\b/i, ''), 'logo-alt', 4);
  addName(host.split('.')[0].replace(/[-_]/g, ' ').replace(/\\b\\w/g, (c) => c.toUpperCase()), 'domaine', 1);
  names.sort((a, b) => b.w - a.w);
  const name = names[0] ? names[0].v : host;
  const shortName = (manifest && clean(manifest.short_name)) || (name.length <= 12 ? name : name.split(/\\s+/).slice(0, 2).join(' ').slice(0, 12));
  const description = clean((manifest && manifest.description) || meta('meta[name="description"]') || meta('meta[property="og:description"]')).slice(0, 300);
  const lang = (document.documentElement.lang || (manifest && manifest.lang) || '').slice(0, 10);

  // Logos candidats (taille estimée ; les plus grands et carrés passent devant).
  const logos = [];
  const addLogo = (src, kind, size, extra = {}) => { const u = abs(src); if (u && !logos.some((l) => l.src === u)) logos.push({ src: u, kind, size: size || 0, ...extra }); };
  const sz = (v) => Math.max(0, ...String(v || '').split(/\\s+/).map((x) => (x === 'any' ? 1024 : Number(x.split('x')[0]) || 0)));
  if (manifest && Array.isArray(manifest.icons)) for (const i of manifest.icons) addLogo(new URL(i.src, document.querySelector('link[rel~="manifest"]').href).href, /maskable/.test(i.purpose || '') ? 'manifest-maskable' : 'manifest', sz(i.sizes), { purpose: i.purpose || '' });
  for (const l of document.querySelectorAll('link[rel~="apple-touch-icon"], link[rel~="apple-touch-icon-precomposed"]')) addLogo(l.href, 'apple-touch-icon', sz(l.sizes && l.sizes.value) || 180);
  for (const l of document.querySelectorAll('link[rel~="icon"]')) addLogo(l.href, /\\.svg(\\?|$)/i.test(l.href) || /svg/.test(l.type) ? 'favicon-svg' : 'favicon', /\\.svg(\\?|$)/i.test(l.href) ? 1024 : sz(l.sizes && l.sizes.value) || 32);
  const tile = meta('meta[name="msapplication-TileImage"]'); if (tile) addLogo(tile, 'tile', 144);
  if (logoEl) addLogo(logoEl.currentSrc || logoEl.src, 'logo-entete', Math.max(logoEl.naturalWidth, logoEl.naturalHeight), { w: logoEl.naturalWidth, h: logoEl.naturalHeight });
  const svgLogo = document.querySelector('header [class*="logo" i] svg, a[class*="logo" i] svg, [class*="brand" i] svg, header a[href="/"] svg');
  if (svgLogo) {
    try {
      const c = svgLogo.cloneNode(true);
      if (!c.getAttribute('xmlns')) c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const r = svgLogo.getBoundingClientRect();
      if (!c.getAttribute('width')) c.setAttribute('width', Math.round(r.width));
      if (!c.getAttribute('height')) c.setAttribute('height', Math.round(r.height));
      const col = getComputedStyle(svgLogo).color;
      const txt = new XMLSerializer().serializeToString(c).replace(/currentColor/g, col);
      if (txt.length < 200000) logos.push({ src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(txt), kind: 'logo-svg', size: 1024, w: r.width, h: r.height });
    } catch (e) { /* svg illisible */ }
  }
  const og = meta('meta[property="og:image"]'); if (og) addLogo(og, 'image-partage', 600);
  addLogo('/favicon.ico', 'favicon-ico', 32);

  // Couleurs.
  const toHex = (c) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(c || ''); if (!m) return /^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '';
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    if (a < 0.5) return '';
    return '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
  };
  const themeColors = [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => ({ color: m.content, media: m.media || '' }));
  const vars = {};
  try {
    const cs = getComputedStyle(document.documentElement);
    for (const sh of [...document.styleSheets]) {
      let rules; try { rules = sh.cssRules; } catch (e) { continue; }
      for (const r of rules || []) {
        if (r.selectorText && /(^|,)\\s*(:root|html|body)\\s*(,|$)/.test(r.selectorText)) {
          for (const p of r.style) if (p.startsWith('--') && /(primary|brand|accent|main|theme|secondary)/i.test(p)) { const v = toHex(cs.getPropertyValue(p).trim()) || (/^#[0-9a-f]{3,8}$/i.test(cs.getPropertyValue(p).trim()) ? cs.getPropertyValue(p).trim() : ''); if (v) vars[p] = v; }
        }
      }
    }
  } catch (e) { /* feuilles inaccessibles */ }
  const bodyBg = toHex(getComputedStyle(document.body).backgroundColor) || toHex(getComputedStyle(document.documentElement).backgroundColor) || '#ffffff';
  const text = toHex(getComputedStyle(document.body).color);
  const head = document.querySelector('header, nav, [role="banner"]');
  const headerBg = head ? toHex(getComputedStyle(head).backgroundColor) : '';
  const btnCols = {};
  for (const b of [...document.querySelectorAll('a[class*="btn" i], button, [class*="button" i], input[type="submit"]')].slice(0, 80)) {
    const c = toHex(getComputedStyle(b).backgroundColor);
    if (!c || /^#(f{6}|0{6})$/i.test(c)) continue;
    const r = b.getBoundingClientRect(); if (!r.width) continue;
    btnCols[c] = (btnCols[c] || 0) + r.width * r.height;
  }
  const button = Object.entries(btnCols).sort((a, b) => b[1] - a[1]).map((x) => x[0])[0] || '';
  const linkCol = (() => { const a = document.querySelector('main a, article a, p a, a'); return a ? toHex(getComputedStyle(a).color) : ''; })();
  const fonts = [...new Set([document.body, document.querySelector('h1, h2')].filter(Boolean).map((e) => getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '').trim()))];
  const scheme = meta('meta[name="color-scheme"]');
  // Contacts et réseaux (pour le bouton flottant, le menu et les raccourcis).
  const links = [...document.querySelectorAll('a[href]')].map((a) => a.href);
  const first = (re) => links.find((h) => re.test(h)) || '';
  const contacts = {
    phone: first(/^tel:/i).replace(/^tel:/i, ''), email: first(/^mailto:/i).replace(/^mailto:/i, '').split('?')[0],
    whatsapp: first(/wa\\.me|api\\.whatsapp\\.com|whatsapp:\\/\\//i), facebook: first(/facebook\\.com\\//i), instagram: first(/instagram\\.com\\//i),
    x: first(/(twitter|x)\\.com\\//i), tiktok: first(/tiktok\\.com\\//i), youtube: first(/youtube\\.com\\/|youtu\\.be\\//i), linkedin: first(/linkedin\\.com\\//i),
  };
  // Liens de navigation principaux (onglets suggérés).
  const nav = [...document.querySelectorAll('header nav a[href], nav a[href]')].map((a) => ({ label: clean(a.textContent).slice(0, 20), url: a.href })).filter((x) => x.label && x.url.startsWith(location.origin)).filter((x, i, arr) => arr.findIndex((y) => y.url === x.url) === i).slice(0, 5);
  return {
    name, shortName, names: names.slice(0, 6), description, lang, host, logos,
    colors: { themeColors, vars, bodyBg, text, headerBg, button, link: linkCol }, fonts, scheme, contacts, nav,
  };
}`;

async function inspect(url, { partition = 'persist:vitrine', timeout = 25000 } = {}) {
  const win = new BrowserWindow({
    show: false, width: 1280, height: 860, webPreferences: { partition, offscreen: true, sandbox: true, backgroundThrottling: false },
  });
  const wc = win.webContents;
  wc.setAudioMuted(true);
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  const mixed = new Set();
  let certError = null;
  const load = (u) => new Promise((resolve) => {
    let failed = null;
    const done = () => { clearTimeout(t); wc.removeListener('did-finish-load', done); wc.removeListener('did-fail-load', fail); resolve(failed); };
    const fail = (_e, code, desc, _u, main) => { if (main) { failed = { code, desc }; done(); } };
    const t = setTimeout(done, timeout);
    wc.on('did-finish-load', done);
    wc.on('did-fail-load', fail);
    wc.loadURL(u).catch(() => {});
  });
  try {
    wc.on('certificate-error', (_e, _u, error) => { certError = error; });
    await wc.loadURL('about:blank').catch(() => {});
    await cdp.send(wc, 'Network.enable');
    const off = cdp.on(wc, (m, p) => {
      if (m === 'Network.requestWillBeSent' && /^http:/i.test(p.request.url) && /^https:/i.test(url)) mixed.add(p.request.url);
    });
    const firstFail = await load(url);
    if (firstFail) throw new Error(`Le site n'a pas pu être ouvert : ${firstFail.desc || `erreur ${firstFail.code}`}`);
    await sleep(1500);
    const page = await wc.executeJavaScript(`(async () => {
      const link = document.querySelector('link[rel~="manifest"]');
      let manifest = null; let manifestError = '';
      if (link) {
        try { const r = await fetch(link.href, { credentials: 'include' }); manifest = await r.json(); } catch (e) { manifestError = String(e && e.message || e); }
      }
      let reg = null;
      try { reg = navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : null; } catch (e) { /* ignore */ }
      let swText = '';
      const swUrl = reg ? (reg.active || reg.waiting || reg.installing || {}).scriptURL || '' : '';
      if (swUrl) { try { swText = await (await fetch(swUrl)).text(); } catch (e) { /* ignore */ } }
      return {
        href: location.href, title: document.title, manifestUrl: link ? link.href : '', manifest, manifestError,
        sw: { registered: Boolean(reg), scope: reg ? reg.scope : '', scriptURL: swUrl, controlling: Boolean(navigator.serviceWorker && navigator.serviceWorker.controller), text: swText.slice(0, 400000) },
        https: location.protocol === 'https:', themeMeta: (document.querySelector('meta[name="theme-color"]') || {}).content || '',
        appleIcon: (document.querySelector('link[rel="apple-touch-icon"]') || {}).href || '', viewport: Boolean(document.querySelector('meta[name="viewport"]')),
        identity: await (${identityScript})(manifest),
      };
    })()`).catch(() => null);
    if (!page) throw new Error(firstFail ? `Le site n'a pas pu être ouvert : ${firstFail.desc}` : "Le site n'a pas pu être analysé.");
    // Le service worker ne contrôle la page qu'au second chargement : on recharge, puis on coupe le réseau.
    let offline = null;
    if (page.sw.registered) {
      await load(page.href);
      await sleep(1200);
      page.sw.controlling = await wc.executeJavaScript('Boolean(navigator.serviceWorker && navigator.serviceWorker.controller)').catch(() => page.sw.controlling);
      await cdp.send(wc, 'Network.emulateNetworkConditions', {
        offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
      });
      const f = await load(page.href);
      await sleep(600);
      const body = await wc.executeJavaScript('(document.body && document.body.innerText || "").trim().length').catch(() => 0);
      offline = !f && body > 0;
      await cdp.send(wc, 'Network.emulateNetworkConditions', {
        offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
      }).catch(() => {});
    }
    off();
    const m = page.manifest && typeof page.manifest === 'object' ? page.manifest : null;
    const base = page.manifestUrl || page.href;
    const abs = (u) => { try { return new URL(u, base).href; } catch { return u; } };
    const icons = m && Array.isArray(m.icons) ? m.icons.map((i) => ({ ...i, src: abs(i.src) })) : [];
    const text = page.sw.text || '';
    const sw = {
      registered: page.sw.registered,
      controlling: page.sw.controlling,
      scope: page.sw.scope,
      scriptURL: page.sw.scriptURL,
      offline,
      fetch: /addEventListener\(\s*['"]fetch['"]|onfetch\s*=|registerRoute|workbox/.test(text),
      push: /addEventListener\(\s*['"]push['"]|onpush\s*=/.test(text),
      sync: /addEventListener\(\s*['"]sync['"]|BackgroundSync/.test(text),
      periodicSync: /periodicsync/.test(text),
      workbox: /workbox/i.test(text),
    };
    const security = {
      https: page.https,
      certificate: !certError,
      certificateError: certError || '',
      mixed: [...mixed].slice(0, 20),
    };
    const tests = m ? manifestTests(m) : [];
    const swTests = [
      { category: 'required', label: 'Service worker enregistré', ok: sw.registered },
      { category: 'recommended', label: 'Contrôlez la page au second chargement', ok: sw.controlling },
      { category: 'recommended', label: 'Gérez les requêtes (événement fetch)', ok: sw.fetch },
      { category: 'recommended', label: 'Fonctionne hors connexion', ok: sw.offline === true },
      { category: 'optional', label: 'Notifications push', ok: sw.push },
      { category: 'optional', label: 'Synchronisation en arrière-plan', ok: sw.sync },
      { category: 'optional', label: 'Synchronisation périodique', ok: sw.periodicSync },
    ];
    const secTests = [
      { category: 'required', label: 'Site en HTTPS', ok: security.https },
      { category: 'required', label: 'Certificat valide', ok: security.certificate },
      { category: 'required', label: 'Pas de contenu mixte (ressources http)', ok: security.mixed.length === 0 },
    ];
    const score = (list) => ({
      required: [list.filter((t) => t.category === 'required' && t.ok).length, list.filter((t) => t.category === 'required').length],
      recommended: [list.filter((t) => t.category === 'recommended' && t.ok).length, list.filter((t) => t.category === 'recommended').length],
      optional: [list.filter((t) => t.category === 'optional' && t.ok).length, list.filter((t) => t.category === 'optional').length],
    });
    const identity = page.identity || null;
    if (identity) {
      // Couleur de marque : theme-color, puis variable CSS « primary/brand », puis bouton principal, puis en-tête.
      const tc = (identity.colors.themeColors.find((t) => !/dark/.test(t.media)) || {}).color || '';
      const tcDark = (identity.colors.themeColors.find((t) => /dark/.test(t.media)) || {}).color || '';
      const v = identity.colors.vars;
      const varPick = v[Object.keys(v).find((k) => /primary|brand/i.test(k))] || v[Object.keys(v).find((k) => /accent|main|theme/i.test(k))] || '';
      const bright = (h) => { const n = parseInt(String(h).replace('#', '').slice(0, 6), 16); return Number.isFinite(n) ? (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 : 1; };
      const isNeutral = (h) => !h || bright(h) > 0.94 || bright(h) < 0.06;
      const brand = [m && m.theme_color, tc, varPick, identity.colors.button, identity.colors.link, identity.colors.headerBg].find((c) => HEX.test(c || '') && !isNeutral(c)) || '';
      identity.brand = brand;
      identity.theme = (m && HEX.test(m.theme_color || '') && m.theme_color) || (HEX.test(tc) ? tc : '') || identity.colors.headerBg || brand || '';
      identity.themeDark = HEX.test(tcDark) ? tcDark : '';
      identity.background = (m && HEX.test(m.background_color || '') && m.background_color) || identity.colors.bodyBg || '#ffffff';
      identity.appId = (() => {
        const ip = /^(\d+\.){3}\d+$|^localhost$|^\[/.test(identity.host);
        if (ip) {
          const w = String(identity.name || 'monapp').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/^[0-9]+/, '').slice(0, 30) || 'monapp';
          return `com.${w}.app`;
        }
        const parts = identity.host.split('.').filter(Boolean).reverse().map((x) => x.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean).map((x) => (/^[0-9]/.test(x) ? `a${x}` : x));
        if (parts.length >= 2) return `${parts.join('.')}.app`;
        return `com.${(parts[0] || 'monapp')}.app`;
      })();
      // Logos triés : icônes adaptables du manifest, grands carrés, SVG, apple-touch-icon, logo d'en-tête, favicon.
      const rank = { 'manifest-maskable': 9, manifest: 8, 'favicon-svg': 7, 'apple-touch-icon': 6, 'logo-svg': 5, 'logo-entete': 4, tile: 3, favicon: 2, 'image-partage': 1, 'favicon-ico': 0 };
      identity.logos.sort((a, b) => (Math.min(b.size, 512) >= 180) - (Math.min(a.size, 512) >= 180) || rank[b.kind] - rank[a.kind] || b.size - a.size);
    }
    return {
      identity,
      url: page.href,
      title: page.title,
      manifestUrl: page.manifestUrl,
      manifestError: page.manifestError,
      manifest: m,
      icons,
      appleIcon: page.appleIcon,
      themeMeta: page.themeMeta,
      viewport: page.viewport,
      tests,
      swTests,
      secTests,
      sw,
      security,
      scores: { manifest: m ? score(tests) : null, sw: score(swTests), security: score(secTests) },
      installable: Boolean(m && str(m.name || m.short_name) && str(m.start_url) && icons.length && security.https),
    };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

/* ------------------------------------------------------------------ fichiers générés */
const SW_STRATEGIES = {
  offline: 'Page hors ligne : le réseau d’abord, une page de secours sans connexion',
  'network-first': 'Réseau d’abord, cache en secours (contenu toujours frais)',
  'cache-first': 'Cache d’abord pour les fichiers statiques (le plus rapide)',
  swr: 'Cache puis mise à jour en arrière-plan (stale-while-revalidate)',
};

function serviceWorker(strategy = 'offline', { version = '1', precache = [] } = {}) {
  const list = JSON.stringify(['/', '/offline.html', ...precache].filter((v, i, a) => a.indexOf(v) === i));
  const head = `// Service worker généré par NEXORA (stratégie : ${strategy}).
const CACHE = 'nexora-v${version}';
const PRECACHE = ${list};
const OFFLINE = '/offline.html';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
`;
  const pages = `
const fromNetwork = async (req) => {
  const res = await fetch(req);
  if (res && res.ok && req.method === 'GET' && new URL(req.url).origin === location.origin) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
};
`;
  const bodies = {
    offline: `
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
`,
    'network-first': `${pages}
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fromNetwork(e.request).catch(async () => (await caches.match(e.request)) || (e.request.mode === 'navigate' ? caches.match(OFFLINE) : Response.error())));
});
`,
    'cache-first': `${pages}
const STATIC = /\\.(?:css|js|mjs|woff2?|ttf|otf|png|jpe?g|gif|webp|avif|svg|ico)$/i;
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (STATIC.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fromNetwork(e.request)));
  } else if (e.request.mode === 'navigate') {
    e.respondWith(fromNetwork(e.request).catch(async () => (await caches.match(e.request)) || caches.match(OFFLINE)));
  }
});
`,
    swr: `${pages}
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((hit) => {
    const net = fromNetwork(e.request).catch(() => hit || (e.request.mode === 'navigate' ? caches.match(OFFLINE) : Response.error()));
    return hit || net;
  }));
});
`,
  };
  const push = `
// Notifications push (envoyées par votre serveur avec le protocole Web Push).
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || 'Notification', { body: data.body || '', icon: data.icon || '/icons/icon-192.png', data: data.url || '/' }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow(e.notification.data || '/'));
});
`;
  return head + (bodies[strategy] || bodies.offline) + push;
}

function offlinePage({ name = 'Application', bg = '#ffffff', color = '#1d1d1f', accent = '#007aff', title = 'Pas de connexion', text = 'Vérifiez votre connexion Internet, puis réessayez.', button = 'Réessayer' } = {}) {
  const e = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${e(name)} – hors ligne</title>
<style>html,body{height:100%;margin:0}body{display:grid;place-items:center;background:${e(bg)};color:${e(color)};font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
h1{font-size:22px;margin:16px 0 8px}p{opacity:.7;margin:0 0 24px;line-height:1.5}button{border:0;border-radius:999px;padding:12px 26px;background:${e(accent)};color:#fff;font:600 15px system-ui}</style></head>
<body><main><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".5"><path d="M2 8.8a15 15 0 0 1 20 0M5 12.6a10.5 10.5 0 0 1 14 0M8.5 16.3a5.5 5.5 0 0 1 7 0"/><circle cx="12" cy="19.6" r="1" fill="currentColor"/><path d="M3 3l18 18"/></svg>
<h1>${e(title)}</h1><p>${e(text)}</p><button onclick="location.reload()">${e(button)}</button></main>
<script>addEventListener('online', () => location.reload());</script></body></html>
`;
}

const REGISTER = `<!-- À ajouter dans <head> de chaque page -->
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="THEME">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
<script>
  if ('serviceWorker' in navigator) {
    addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
  }
</script>
`;

/* Écrit le pack PWA dans un dossier : manifest.json, sw.js, offline.html, icons/, à ajouter.html, assetlinks. */
const INJECT_MARK = '<!-- nexora-pwa -->';
const OLD_MARK = '<!-- vitrine-pwa -->';

function headSnippet(theme) {
  return `${INJECT_MARK}
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="${theme || '#ffffff'}">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <link rel="apple-touch-icon" href="/icons/icon-192.png">
    <script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}</script>
`;
}

// Insère les balises PWA dans un fichier HTML (avant </head>, sinon au début de <body>, sinon en tête).
function injectHtml(file, theme) {
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes(INJECT_MARK) || html.includes(OLD_MARK)) return false;
  const snip = headSnippet(theme);
  if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${snip}</head>`);
  else if (/<body[^>]*>/i.test(html)) html = html.replace(/(<body[^>]*>)/i, `$1\n${snip}`);
  else html = snip + html;
  fs.writeFileSync(file, html);
  return true;
}

function listHtml(root, max = 400) {
  const out = [];
  const skip = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.output', '.svelte-kit', 'out']);
  const walk = (d, depth) => {
    if (out.length >= max || depth > 6) return;
    let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.well-known') continue;
      const fp = path.join(d, e.name);
      if (e.isDirectory()) { if (!skip.has(e.name)) walk(fp, depth + 1); } else if (/\.html?$/i.test(e.name)) out.push(fp);
    }
  };
  walk(root, 0);
  return out;
}

/* Copie un projet (sans node_modules ni .git) vers une nouvelle destination, puis y ajoute les fichiers PWA
 * et les balises dans les pages HTML. L'original n'est pas modifié. Renvoie { dest, root, pages, framework }. */
function injectProject(srcDir, destDir, pack) {
  const skip = new Set(['node_modules', '.git', '.DS_Store']);
  fs.cpSync(srcDir, destDir, { recursive: true, filter: (s) => !skip.has(path.basename(s)) });
  // Racine web : dossier public/static/www s'il existe, sinon le dossier qui contient le index.html le moins profond.
  const candidates = ['public', 'static', 'www', 'web', 'src', 'app', 'dist', '.'];
  let root = destDir;
  for (const c of candidates) { if (fs.existsSync(path.join(destDir, c, 'index.html'))) { root = path.join(destDir, c); break; } }
  if (root === destDir && !fs.existsSync(path.join(destDir, 'index.html'))) {
    // premier index.html trouvé
    const found = listHtml(destDir, 1)[0];
    if (found) root = path.dirname(found);
  }
  writePack(root, pack);
  const pages = listHtml(destDir).filter((f) => injectHtml(f, pack.theme));
  const framework = fs.existsSync(path.join(destDir, 'package.json')) ? 'node' : (fs.existsSync(path.join(destDir, 'pubspec.yaml')) ? 'flutter' : 'static');
  return { dest: destDir, root, pages: pages.length, framework };
}

function writePack(dir, { manifest, sw, offline, icons = {}, assetlinks, theme }) {
  fs.mkdirSync(path.join(dir, 'icons'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'sw.js'), sw);
  fs.writeFileSync(path.join(dir, 'offline.html'), offline);
  for (const [name, data] of Object.entries(icons)) {
    if (/^[a-z0-9_-]+\.png$/i.test(name)) fs.writeFileSync(path.join(dir, 'icons', name), Buffer.from(data));
  }
  fs.writeFileSync(path.join(dir, 'À ajouter dans les pages.html'), REGISTER.replace('THEME', theme || '#ffffff'));
  if (assetlinks) {
    fs.mkdirSync(path.join(dir, '.well-known'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.well-known', 'assetlinks.json'), assetlinks);
  }
  return dir;
}

module.exports = {
  inspect, manifestTests, serviceWorker, offlinePage, writePack, injectProject, SW_STRATEGIES,
};
