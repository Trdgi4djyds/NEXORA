'use strict';
/* NEXORA #017 : fiche Play Store de l'application (textes, coordonnées, icône, bannière, captures d'écran),
 * lue et envoyée par l'API officielle de la Play Console, avec le compte de service de la publication.
 * Les images préparées dans NEXORA sont gardées sur ce PC, par application, jusqu'à l'envoi. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { accessToken, parseServiceAccount } = require('./push');
const { call } = require('./play');

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

// Limites de Google Play (Aide Play Console › Ajouter des éléments graphiques de présentation).
const LIMITS = { title: 30, shortDescription: 80, fullDescription: 4000 };
const KINDS = {
  icon: { label: 'Icône', max: 1, bytes: 1024 * 1024 },
  featureGraphic: { label: 'Bannière', max: 1, bytes: 15e6 },
  phoneScreenshots: { label: 'Captures téléphone', min: 2, max: 8, bytes: 8e6 },
  sevenInchScreenshots: { label: 'Captures tablette 7 pouces', max: 8, bytes: 8e6 },
  tenInchScreenshots: { label: 'Captures tablette 10 pouces', max: 8, bytes: 8e6 },
};

/* Dimensions et format d'une image PNG ou JPEG (sans la décoder). */
function imageInfo(buf) {
  if (buf.length > 26 && buf.readUInt32BE(0) === 0x89504e47) {
    const colorType = buf[25];
    // Types 4 et 6 : couche alpha ; palette (3) avec tRNS : transparence aussi.
    const alpha = colorType === 4 || colorType === 6 || (colorType === 3 && buf.indexOf('tRNS', 33, 'latin1') > 0);
    return { type: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), alpha };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const m = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      // Marqueurs SOF (début d'image) : hauteur puis largeur.
      if ((m >= 0xc0 && m <= 0xcf) && ![0xc4, 0xc8, 0xcc].includes(m)) return { type: 'jpeg', w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5), alpha: false };
      i += 2 + len;
    }
  }
  return null;
}

/* Vérifie qu'une image respecte les règles de Google Play pour son emplacement ; renvoie le problème, ou null. */
function checkImage(kind, buf) {
  const k = KINDS[kind];
  if (!k) return 'Emplacement d’image inconnu.';
  const im = imageInfo(buf);
  if (!im) return 'Format non reconnu : PNG ou JPEG attendu.';
  if (buf.length > k.bytes) return `${k.label} : fichier trop lourd (${Math.round(buf.length / 1024)} Ko, maximum ${Math.round(k.bytes / 1024)} Ko).`;
  if (kind === 'icon') {
    if (im.type !== 'png') return 'Icône : PNG attendu.';
    if (im.w !== 512 || im.h !== 512) return `Icône : 512 × 512 pixels attendus (${im.w} × ${im.h}).`;
    return null;
  }
  if (im.alpha) return `${k.label} : l’image ne doit pas être transparente (JPEG ou PNG 24 bits).`;
  if (kind === 'featureGraphic') return im.w === 1024 && im.h === 500 ? null : `Bannière : 1024 × 500 pixels attendus (${im.w} × ${im.h}).`;
  const lo = Math.min(im.w, im.h); const hi = Math.max(im.w, im.h);
  const min = kind === 'tenInchScreenshots' ? 1080 : 320;
  if (lo < min || hi > 3840) return `${k.label} : chaque côté doit mesurer entre ${min} et 3840 pixels (${im.w} × ${im.h}).`;
  if (hi > lo * 2) return `${k.label} : le grand côté ne doit pas dépasser le double du petit (${im.w} × ${im.h}).`;
  return null;
}

function checkTexts(l = {}) {
  const out = [];
  if (!String(l.title || '').trim()) out.push('Indique le nom de l’application sur Google Play.');
  for (const [k, n] of Object.entries(LIMITS)) {
    const len = [...String(l[k] || '')].length;
    if (len > n) out.push(`${{ title: 'Nom', shortDescription: 'Description courte', fullDescription: 'Description complète' }[k]} : ${len} caractères pour ${n} au maximum.`);
  }
  if (!String(l.shortDescription || '').trim()) out.push('Écris la description courte (80 caractères au plus).');
  if (!String(l.fullDescription || '').trim()) out.push('Écris la description complète.');
  return out;
}

/* Images préparées dans NEXORA, rangées par application. */
class ListingAssets {
  constructor(dir) { this.root = dir; }

  dir(appId) { return path.join(this.root, String(appId || '').replace(/[^\w.-]/g, '_')); }

  index(appId) {
    try { return JSON.parse(fs.readFileSync(path.join(this.dir(appId), 'index.json'), 'utf8')); } catch { return {}; }
  }

  saveIndex(appId, idx) {
    fs.mkdirSync(this.dir(appId), { recursive: true });
    fs.writeFileSync(path.join(this.dir(appId), 'index.json'), JSON.stringify(idx, null, 1));
  }

  files(appId, kind) {
    const v = this.index(appId)[kind];
    return (Array.isArray(v) ? v : v ? [v] : []).filter((f) => fs.existsSync(path.join(this.dir(appId), f)));
  }

  /* Liste pour l'interface : aperçus en data URL, dimensions, poids. */
  list(appId) {
    const out = {};
    for (const kind of Object.keys(KINDS)) {
      out[kind] = this.files(appId, kind).map((f) => {
        const buf = fs.readFileSync(path.join(this.dir(appId), f));
        const im = imageInfo(buf) || {};
        return { id: f, w: im.w, h: im.h, size: buf.length, dataUrl: `data:image/${im.type === 'png' ? 'png' : 'jpeg'};base64,${buf.toString('base64')}` };
      });
    }
    return out;
  }

  put(appId, kind, buf, { replace = false } = {}) {
    const bad = checkImage(kind, buf);
    if (bad) throw new Error(bad);
    const k = KINDS[kind];
    const idx = this.index(appId);
    let cur = this.files(appId, kind);
    if (replace || k.max === 1) {
      for (const f of cur) fs.rmSync(path.join(this.dir(appId), f), { force: true });
      cur = [];
    }
    if (cur.length >= k.max) throw new Error(`${k.label} : ${k.max} images au maximum.`);
    const im = imageInfo(buf);
    const name = `${kind}-${crypto.randomBytes(4).toString('hex')}.${im.type === 'png' ? 'png' : 'jpg'}`;
    fs.mkdirSync(this.dir(appId), { recursive: true });
    fs.writeFileSync(path.join(this.dir(appId), name), buf);
    idx[kind] = [...cur, name];
    this.saveIndex(appId, idx);
    return this.list(appId);
  }

  remove(appId, kind, id) {
    const idx = this.index(appId);
    idx[kind] = this.files(appId, kind).filter((f) => f !== id);
    fs.rmSync(path.join(this.dir(appId), path.basename(String(id))), { force: true });
    this.saveIndex(appId, idx);
    return this.list(appId);
  }

  move(appId, kind, id, delta) {
    const idx = this.index(appId);
    const cur = this.files(appId, kind);
    const i = cur.indexOf(id);
    const j = i + Number(delta || 0);
    if (i >= 0 && j >= 0 && j < cur.length) { [cur[i], cur[j]] = [cur[j], cur[i]]; idx[kind] = cur; this.saveIndex(appId, idx); }
    return this.list(appId);
  }

  buffers(appId, kind) { return this.files(appId, kind).map((f) => ({ name: f, buf: fs.readFileSync(path.join(this.dir(appId), f)) })); }
}

/* Validation d'une modification : si Google refuse l'envoi automatique en examen (application dont une
 * version a été refusée, par exemple), la modification est enregistrée et l'examen se lance depuis la Console. */
async function commit(fetchImpl, tok, id, editId) {
  try {
    await call(fetchImpl, tok, 'POST', `${API}/${id}/edits/${editId}:commit`);
    return { sentForReview: true };
  } catch (e) {
    if (!/changesNotSentForReview/i.test(e.message)) throw e;
    await call(fetchImpl, tok, 'POST', `${API}/${id}/edits/${editId}:commit?changesNotSentForReview=true`);
    return { sentForReview: false };
  }
}

/* Fiche actuelle sur Google Play (rien n'est modifié : la modification ouverte est abandonnée). */
async function read({ serviceAccount, appId, lang = 'fr-FR' }, fetchImpl) {
  const sa = parseServiceAccount(serviceAccount);
  if (!sa.ok) throw new Error(sa.error.replace('Firebase', 'Google Cloud'));
  const tok = await accessToken(sa.json, fetchImpl, SCOPE);
  const id = encodeURIComponent(appId);
  const edit = await call(fetchImpl, tok, 'POST', `${API}/${id}/edits`, {});
  const base = `${API}/${id}/edits/${edit.id}`;
  try {
    const details = await call(fetchImpl, tok, 'GET', `${base}/details`).catch(() => ({}));
    const listings = await call(fetchImpl, tok, 'GET', `${base}/listings`).catch(() => ({ listings: [] }));
    const all = listings.listings || [];
    const cur = all.find((l) => l.language === lang) || null;
    const images = {};
    if (cur) {
      for (const kind of Object.keys(KINDS)) {
        // eslint-disable-next-line no-await-in-loop
        const r = await call(fetchImpl, tok, 'GET', `${base}/listings/${encodeURIComponent(lang)}/${kind}`).catch(() => ({ images: [] }));
        images[kind] = (r.images || []).length;
      }
    }
    return {
      ok: true, details, languages: all.map((l) => l.language), listing: cur && { title: cur.title || '', shortDescription: cur.shortDescription || '', fullDescription: cur.fullDescription || '', video: cur.video || '' }, images,
    };
  } finally {
    await call(fetchImpl, tok, 'DELETE', `${base}`).catch(() => {});
  }
}

/* Envoi de la fiche : coordonnées, textes de la langue choisie, et pour chaque emplacement préparé dans NEXORA,
 * remplacement des images en ligne. Les emplacements laissés vides dans NEXORA ne sont pas touchés. */
async function push({
  serviceAccount, appId, lang = 'fr-FR', listing = {}, details = {}, assets,
}, fetchImpl, onStep = () => {}) {
  const errs = checkTexts(listing);
  if (errs.length) throw new Error(errs[0]);
  if (details.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.contactEmail)) throw new Error('Adresse e-mail de contact invalide.');
  const files = {};
  for (const kind of Object.keys(KINDS)) {
    const list = assets.buffers(appId, kind);
    for (const f of list) { const bad = checkImage(kind, f.buf); if (bad) throw new Error(bad); }
    if (list.length) files[kind] = list;
  }
  if (files.phoneScreenshots && files.phoneScreenshots.length < 2) throw new Error('Google Play demande au moins 2 captures d’écran de téléphone.');
  const sa = parseServiceAccount(serviceAccount);
  if (!sa.ok) throw new Error(sa.error.replace('Firebase', 'Google Cloud'));
  onStep('Connexion à Google Play', 0.05);
  const tok = await accessToken(sa.json, fetchImpl, SCOPE);
  const id = encodeURIComponent(appId);
  const edit = await call(fetchImpl, tok, 'POST', `${API}/${id}/edits`, {});
  const base = `${API}/${id}/edits/${edit.id}`;
  const L = encodeURIComponent(lang);
  try {
    const d = Object.fromEntries(Object.entries({
      contactEmail: details.contactEmail, contactWebsite: details.contactWebsite, contactPhone: details.contactPhone, defaultLanguage: details.defaultLanguage,
    }).filter(([, v]) => v));
    if (Object.keys(d).length) {
      onStep('Coordonnées', 0.1);
      await call(fetchImpl, tok, 'PATCH', `${base}/details`, d);
    }
    onStep('Textes de la fiche', 0.18);
    await call(fetchImpl, tok, 'PUT', `${base}/listings/${L}`, {
      language: lang, title: listing.title.trim(), shortDescription: listing.shortDescription.trim(), fullDescription: listing.fullDescription.trim(), ...(listing.video ? { video: listing.video.trim() } : {}),
    });
    const kinds = Object.keys(files);
    const total = kinds.reduce((n, k) => n + files[k].length, 0);
    let done = 0;
    for (const kind of kinds) {
      // eslint-disable-next-line no-await-in-loop
      await call(fetchImpl, tok, 'DELETE', `${base}/listings/${L}/${kind}`).catch(() => {});
      for (const f of files[kind]) {
        done += 1;
        onStep(`${KINDS[kind].label} (${done}/${total})`, 0.25 + 0.6 * (done / total));
        // eslint-disable-next-line no-await-in-loop
        await call(fetchImpl, tok, 'POST', `${UPLOAD}/${id}/edits/${edit.id}/listings/${L}/${kind}?uploadType=media`, f.buf, { 'content-type': imageInfo(f.buf).type === 'png' ? 'image/png' : 'image/jpeg' });
      }
    }
    onStep('Validation', 0.92);
    const c = await commit(fetchImpl, tok, id, edit.id);
    onStep('Fiche envoyée', 1);
    return { ok: true, ...c, images: Object.fromEntries(kinds.map((k) => [k, files[k].length])) };
  } catch (err) {
    await call(fetchImpl, tok, 'DELETE', base).catch(() => {});
    throw err;
  }
}

module.exports = {
  LIMITS, KINDS, imageInfo, checkImage, checkTexts, ListingAssets, read, push,
};
