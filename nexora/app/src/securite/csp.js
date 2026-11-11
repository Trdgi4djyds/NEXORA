'use strict';
/* NEXORA #048 — Assistant CSP : propose une politique de sécurité du contenu (Content-Security-Policy)
 * construite à partir des ressources que la page charge vraiment (scripts, styles, polices, images, appels
 * réseau, cadres). Deux versions : « Report-Only » pour observer sans rien casser, puis stricte. Les scripts
 * en ligne reçoivent leur empreinte SHA-256 au lieu de 'unsafe-inline'. */
const { sha256b64 } = require('./util');

// Script exécuté dans la page (fenêtre cachée) : inventaire des ressources et du code en ligne.
const COLLECT = `(() => {
  const res = performance.getEntriesByType('resource').map((e) => ({ u: e.name, t: e.initiatorType }));
  const scripts = [...document.scripts].map((s) => ({ src: s.src || '', inline: s.src ? '' : (s.type && !/javascript|module/i.test(s.type) ? null : s.textContent), type: s.type || '' })).filter((s) => s.inline !== null);
  const styles = [...document.querySelectorAll('style')].map((s) => s.textContent);
  const links = [...document.querySelectorAll('link[rel~="stylesheet"][href]')].map((l) => l.href);
  let styleAttr = 0; let handlers = 0; const handlerNames = new Set();
  for (const el of document.querySelectorAll('*')) {
    if (el.hasAttribute('style')) styleAttr += 1;
    for (const a of el.attributes) if (/^on[a-z]+$/.test(a.name)) { handlers += 1; handlerNames.add(a.name); }
  }
  const frames = [...document.querySelectorAll('iframe[src]')].map((f) => f.src);
  const forms = [...document.querySelectorAll('form')].map((f) => f.action || location.href);
  const jsUrls = [...document.querySelectorAll('a[href^="javascript:"]')].length;
  const meta = document.querySelector('meta[http-equiv="Content-Security-Policy" i]');
  return { origin: location.origin, res, scripts, styles, links, styleAttr, handlers, handlerNames: [...handlerNames].slice(0, 12), frames, forms, jsUrls, meta: meta ? meta.content : '' };
})()`;

const FONT = /\.(woff2?|ttf|otf|eot)(\?|$)/i;
const IMG = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)(\?|$)/i;
const MEDIA = /\.(mp4|webm|ogg|mp3|wav|m4a|m3u8)(\?|$)/i;

function originOf(u, self) {
  try {
    const x = new URL(u);
    if (x.protocol === 'data:') return 'data:';
    if (x.protocol === 'blob:') return 'blob:';
    if (x.origin === self) return "'self'";
    return x.origin;
  } catch { return null; }
}

function build(info, { header = '' } = {}) {
  const self = info.origin;
  const d = {
    'default-src': new Set(["'self'"]), 'script-src': new Set(["'self'"]), 'style-src': new Set(["'self'"]), 'img-src': new Set(["'self'", 'data:']),
    'font-src': new Set(["'self'"]), 'connect-src': new Set(["'self'"]), 'media-src': new Set(["'self'"]), 'frame-src': new Set(), 'worker-src': new Set(["'self'", 'blob:']),
    'object-src': new Set(["'none'"]), 'base-uri': new Set(["'self'"]), 'form-action': new Set(["'self'"]), 'frame-ancestors': new Set(["'self'"]),
  };
  const put = (k, u) => { const o = originOf(u, self); if (o) d[k].add(o); };
  for (const r of info.res || []) {
    const u = r.u;
    if (FONT.test(u)) put('font-src', u);
    else if (IMG.test(u) || r.t === 'img' || r.t === 'image') put('img-src', u);
    else if (MEDIA.test(u) || r.t === 'video' || r.t === 'audio') put('media-src', u);
    else if (r.t === 'script') put('script-src', u);
    else if (r.t === 'link' || r.t === 'css') { if (/\.css(\?|$)/i.test(u) || r.t === 'link') put('style-src', u); else put('img-src', u); }
    else if (r.t === 'fetch' || r.t === 'xmlhttprequest' || r.t === 'beacon' || r.t === 'other') put('connect-src', u);
    else if (r.t === 'iframe') put('frame-src', u);
  }
  for (const s of info.scripts || []) if (s.src) put('script-src', s.src);
  for (const l of info.links || []) put('style-src', l);
  for (const f of info.frames || []) put('frame-src', f);
  for (const f of info.forms || []) put('form-action', f);
  const notes = [];
  const hashes = [];
  const inline = (info.scripts || []).filter((s) => !s.src && s.inline && s.inline.trim());
  for (const s of inline.slice(0, 25)) hashes.push(`'sha256-${sha256b64(s.inline)}'`);
  if (inline.length > 25) notes.push(`${inline.length} scripts en ligne : au-delà de 25, utilise plutôt un « nonce » généré par ton serveur à chaque page.`);
  else if (inline.length) notes.push(`${inline.length} script(s) en ligne autorisé(s) par leur empreinte SHA-256 : si tu modifies l’un d’eux, relance l’assistant (ou passe à un « nonce »).`);
  const styleHashes = (info.styles || []).filter((s) => s.trim()).slice(0, 15).map((s) => `'sha256-${sha256b64(s)}'`);
  const needUnsafeStyle = (info.styleAttr || 0) > 0 || (info.styles || []).length > 15;
  if (needUnsafeStyle) notes.push(`${info.styleAttr || 0} élément(s) avec un attribut style : 'unsafe-inline' reste nécessaire pour les styles (risque faible, le plus courant).`);
  if (info.handlers) notes.push(`${info.handlers} gestionnaire(s) d’évènement en ligne (${(info.handlerNames || []).join(', ')}) : ils seront bloqués par la version stricte. Remplace-les par addEventListener dans un fichier .js.`);
  if (info.jsUrls) notes.push(`${info.jsUrls} lien(s) « javascript: » : bloqués par la version stricte.`);
  if (header) notes.push('Ton site envoie déjà une politique : compare-la avec la proposition avant de la remplacer.');
  const strictScript = new Set([...d['script-src'], ...hashes]);
  const strictStyle = new Set([...d['style-src'], ...(needUnsafeStyle ? ["'unsafe-inline'"] : styleHashes)]);
  const relaxedScript = new Set([...d['script-src'], ...(inline.length ? ["'unsafe-inline'"] : [])]);
  const relaxedStyle = new Set([...d['style-src'], "'unsafe-inline'"]);
  const line = (map) => Object.entries(map).filter(([, v]) => v.size).map(([k, v]) => `${k} ${[...v].join(' ')}`).join('; ');
  const base = { ...d };
  if (!base['frame-src'].size) delete base['frame-src'];
  const strict = `${line({ ...base, 'script-src': strictScript, 'style-src': strictStyle })}; upgrade-insecure-requests`;
  const relaxed = `${line({ ...base, 'script-src': relaxedScript, 'style-src': relaxedStyle })}`;
  const sources = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, [...v]]));
  return {
    origin: self, current: header || info.meta || '', reportOnly: strict, relaxed, strict, notes, sources,
    inline: { scripts: inline.length, styles: (info.styles || []).length, styleAttr: info.styleAttr || 0, handlers: info.handlers || 0 },
    resources: (info.res || []).length,
  };
}

async function analyze(url, { withPage, fetchImpl }) {
  if (!withPage) throw new Error('Disponible uniquement dans l’application NEXORA pour Windows.');
  let header = '';
  try {
    const r = await fetchImpl(url, { method: 'GET', redirect: 'follow' });
    header = r.headers.get('content-security-policy') || '';
  } catch { /* la page sera tout de même analysée */ }
  const info = await withPage(url, async (wc) => {
    await new Promise((ok) => setTimeout(ok, 2500));
    return wc.executeJavaScript(COLLECT, true);
  });
  if (!info || !info.origin || info.origin === 'null') throw new Error('La page n’a pas pu être chargée.');
  return { url, at: Date.now(), ...build(info, { header }) };
}

module.exports = { analyze, build, COLLECT };
