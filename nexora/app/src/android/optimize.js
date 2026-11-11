'use strict';
/* Optimisations d'une application web intégrée à l'APK (mode « fichiers locaux ») :
 *  - balise viewport correcte : la page garde ses proportions et ses règles responsives, sans agrandissement
 *    (la taille du texte système est neutralisée côté natif par textZoom 100) ;
 *  - polices Google téléchargées et servies depuis l'application : premier affichage sans réseau ni attente ;
 *  - images trop grandes réduites (côté le plus long), sans changer leur format ni leur nom ;
 *  - préchargement des feuilles de style et des polices de la page d'accueil. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VIEWPORT = 'width=device-width, initial-scale=1, viewport-fit=cover';

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile()) out.push(p);
  }
  return out;
}

/** Ajoute ou corrige la balise viewport sans toucher aux autres réglages de la page. */
function fixViewport(html) {
  const re = /<meta\s+[^>]*name\s*=\s*["']?viewport["']?[^>]*>/i;
  const m = html.match(re);
  if (!m) {
    if (/<head[^>]*>/i.test(html)) return { html: html.replace(/<head[^>]*>/i, (h) => `${h}\n<meta name="viewport" content="${VIEWPORT}">`), changed: 'ajoutée' };
    return { html: `<meta name="viewport" content="${VIEWPORT}">\n${html}`, changed: 'ajoutée' };
  }
  const content = (m[0].match(/content\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
  const parts = new Map(content.split(/[,;]/).map((p) => p.trim()).filter(Boolean).map((p) => {
    const [k, ...v] = p.split('=');
    return [k.trim().toLowerCase(), v.join('=').trim()];
  }));
  let changed = false;
  if (!parts.has('width')) { parts.set('width', 'device-width'); changed = true; }
  if (!parts.has('initial-scale')) { parts.set('initial-scale', '1'); changed = true; }
  if (!parts.has('viewport-fit')) { parts.set('viewport-fit', 'cover'); changed = true; }
  if (!changed) return { html, changed: false };
  const tag = `<meta name="viewport" content="${[...parts].map(([k, v]) => (v ? `${k}=${v}` : k)).join(', ')}">`;
  return { html: html.replace(re, tag), changed: 'complétée' };
}

const FONT_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

/** Remplace les liens fonts.googleapis.com par une copie locale (CSS + fichiers woff2). */
async function localizeGoogleFonts(dir, files, fetchImpl, log) {
  const fetchFn = fetchImpl || globalThis.fetch;
  if (!fetchFn) return 0;
  const cssCache = new Map();
  const fontDir = path.join(dir, '_nexora_fonts');
  let count = 0;
  const localCss = async (url) => {
    if (cssCache.has(url)) return cssCache.get(url);
    const p = (async () => {
      const r = await fetchFn(url.replace(/&amp;/g, '&'), { headers: { 'User-Agent': FONT_UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      let css = await r.text();
      fs.mkdirSync(fontDir, { recursive: true });
      const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((x) => x[1]))];
      for (const u of urls) {
        const name = `${crypto.createHash('sha1').update(u).digest('hex').slice(0, 16)}${path.extname(new URL(u).pathname) || '.woff2'}`;
        const target = path.join(fontDir, name);
        if (!fs.existsSync(target)) {
          const fr = await fetchFn(u);
          if (!fr.ok) throw new Error(`HTTP ${fr.status}`);
          fs.writeFileSync(target, Buffer.from(await fr.arrayBuffer()));
        }
        css = css.split(u).join(name);
      }
      css = css.replace(/font-display:\s*\w+/g, 'font-display: swap');
      const file = `${crypto.createHash('sha1').update(url).digest('hex').slice(0, 12)}.css`;
      fs.writeFileSync(path.join(fontDir, file), css);
      return file;
    })();
    cssCache.set(url, p);
    return p;
  };
  for (const f of files) {
    if (!/\.(html?|css)$/i.test(f)) continue;
    let text = fs.readFileSync(f, 'utf8');
    if (!/fonts\.googleapis\.com/.test(text)) continue;
    const rel = path.relative(path.dirname(f), fontDir).split(path.sep).join('/');
    const found = [...new Set([...text.matchAll(/https:\/\/fonts\.googleapis\.com\/css2?\?[^"'()\s>]+/g)].map((m) => m[0]))];
    let changed = false;
    for (const url of found) {
      try {
        const file = await localCss(url);
        text = text.split(url).join(`${rel}/${file}`);
        changed = true;
        count += 1;
      } catch (e) {
        log(`Police Google non intégrée (${e.message}) : ${url.slice(0, 90)}`);
      }
    }
    if (changed) {
      // Les préconnexions vers Google ne servent plus.
      text = text.replace(/<link[^>]+(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*rel=["']?(?:preconnect|dns-prefetch)["']?[^>]*>\s*/gi, '')
        .replace(/<link[^>]+rel=["']?(?:preconnect|dns-prefetch)["']?[^>]+(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>\s*/gi, '');
      fs.writeFileSync(f, text);
    }
  }
  return count;
}

/** Réduit les images PNG/JPEG/WebP dont le grand côté dépasse maxSide (même format, même nom). */
function downscaleImages(files, maxSide, log) {
  let nativeImage;
  try {
    ({ nativeImage } = require('electron'));
  } catch {
    return { count: 0, saved: 0 };
  }
  if (!nativeImage || !nativeImage.createFromBuffer) return { count: 0, saved: 0 };
  let count = 0;
  let saved = 0;
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (!['.png', '.jpg', '.jpeg'].includes(ext)) continue;
    const st = fs.statSync(f);
    if (st.size < 200 * 1024) continue;
    try {
      const buf = fs.readFileSync(f);
      const img = nativeImage.createFromBuffer(buf);
      const { width, height } = img.getSize();
      if (!width || Math.max(width, height) <= maxSide) continue;
      const k = maxSide / Math.max(width, height);
      const small = img.resize({ width: Math.round(width * k), height: Math.round(height * k), quality: 'best' });
      const out = ext === '.png' ? small.toPNG() : small.toJPEG(86);
      if (out.length >= buf.length) continue;
      fs.writeFileSync(f, out);
      count += 1;
      saved += buf.length - out.length;
    } catch (e) {
      log(`Image non réduite (${path.basename(f)}) : ${e.message}`);
    }
  }
  return { count, saved };
}

/** Précharge les feuilles de style locales de la page d'accueil (premier affichage plus rapide). */
function preloadHints(html) {
  if (/data-(vitrine|nexora)-preload/.test(html)) return html;
  const css = [...html.matchAll(/<link[^>]+rel=["']?stylesheet["']?[^>]*href=["']([^"':]+\.css)["'][^>]*>/gi)].map((m) => m[1]).slice(0, 6);
  if (!css.length) return html;
  const hints = css.map((h) => `<link rel="preload" as="style" href="${h}" data-nexora-preload>`).join('\n');
  return html.replace(/<head[^>]*>/i, (h) => `${h}\n${hints}`);
}

async function optimizeWww(dir, opts = {}) {
  const log = opts.log || (() => {});
  const report = { viewport: [], fonts: 0, images: 0, imageBytes: 0 };
  const files = walk(dir);
  for (const f of files) {
    if (!/\.html?$/i.test(f)) continue;
    let html = fs.readFileSync(f, 'utf8');
    if (opts.viewport !== false) {
      const r = fixViewport(html);
      if (r.changed) {
        html = r.html;
        report.viewport.push(`${path.relative(dir, f)} (${r.changed})`);
      }
    }
    if (opts.preload !== false && path.basename(f).toLowerCase() === 'index.html') html = preloadHints(html);
    fs.writeFileSync(f, html);
  }
  if (opts.fonts !== false) report.fonts = await localizeGoogleFonts(dir, files, opts.fetch, log);
  if (opts.images !== false) {
    const r = downscaleImages(walk(dir), Number(opts.maxImageSide) || 2560, log);
    report.images = r.count;
    report.imageBytes = r.saved;
  }
  return report;
}

module.exports = { optimizeWww, fixViewport, preloadHints, localizeGoogleFonts, VIEWPORT };
