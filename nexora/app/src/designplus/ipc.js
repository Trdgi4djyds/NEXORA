'use strict';
/* NEXORA #053 : canaux dzx:* de NEX-DESIGN : polices libres (téléchargées une fois puis gardées sur le PC, la page
 * de l'interface n'autorisant que les polices locales) et import de fichiers Figma par l'API officielle (jeton
 * de l'utilisateur chiffré par safeStorage). */
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const FAMILY = /^[A-Za-z0-9 ]{2,40}$/;

function register({ ipcMain, app, safeStorage }) {
  const dir = path.join(app.getPath('userData'), 'designplus');
  const fontDir = path.join(dir, 'fonts');
  const tokenFile = path.join(dir, 'figma.json');
  const canEnc = () => { try { return Boolean(safeStorage && safeStorage.isEncryptionAvailable()); } catch { return false; } };

  // Police libre : fichiers woff2 (latin) des graisses 400, 500, 600, 700, 800, gardés dans le dossier de NEXORA.
  ipcMain.handle('dzx:font', async (_e, { family } = {}) => {
    if (!FAMILY.test(family || '')) throw new Error('Nom de police invalide.');
    const slug = family.toLowerCase().replace(/\s+/g, '-');
    const cache = path.join(fontDir, `${slug}.json`);
    if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'));
    const q = encodeURIComponent(family).replace(/%20/g, '+');
    let css = '';
    for (const axis of ['wght@400;500;600;700;800', 'wght@400;700', '']) {
      const r = await fetch(`https://fonts.googleapis.com/css2?family=${q}${axis ? `:${axis}` : ''}&display=swap`, { headers: { 'user-agent': UA } });
      if (r.ok) { css = await r.text(); break; }
    }
    if (!css) throw new Error('Cette police n’a pas pu être téléchargée. Vérifie la connexion à Internet.');
    const faces = [];
    for (const block of css.split('@font-face').slice(1)) {
      if (block.includes('unicode-range') && !/U\+0000-00FF/i.test(block)) continue;
      const url = (/url\((https:[^)]+\.woff2)\)/.exec(block) || [])[1];
      const weight = (/font-weight:\s*(\d+)/.exec(block) || [])[1] || '400';
      const style = (/font-style:\s*(\w+)/.exec(block) || [])[1] || 'normal';
      if (!url || faces.some((f) => f.weight === weight && f.style === style)) continue;
      const b = await fetch(url, { headers: { 'user-agent': UA } });
      if (!b.ok) continue;
      faces.push({ weight, style, data: Buffer.from(await b.arrayBuffer()).toString('base64') });
    }
    if (!faces.length) throw new Error('Cette police n’a pas pu être téléchargée.');
    const out = { family, faces };
    fs.mkdirSync(fontDir, { recursive: true });
    fs.writeFileSync(cache, JSON.stringify(out));
    return out;
  });

  // NEXORA #054 : police libre en TrueType, pour l'intégrer aux PDF vectoriels (une graisse et un style, gardés
  // dans le dossier de NEXORA). Sans navigateur reconnu, le service de polices renvoie des fichiers TrueType.
  ipcMain.handle('dzx:font-ttf', async (_e, { family, weight = 400, style = 'normal' } = {}) => {
    if (!FAMILY.test(family || '')) throw new Error('Nom de police invalide.');
    const w = Math.min(900, Math.max(100, Math.round(Number(weight) / 100) * 100 || 400));
    const it = style === 'italic' ? 1 : 0;
    const slug = family.toLowerCase().replace(/\s+/g, '-');
    const file = path.join(fontDir, `${slug}-${w}${it ? '-italic' : ''}.ttf`);
    if (fs.existsSync(file)) return { data: fs.readFileSync(file).toString('base64') };
    const q = encodeURIComponent(family).replace(/%20/g, '+');
    for (const axis of [`ital,wght@${it},${w}`, `wght@${w}`]) {
      if (axis.startsWith('wght') && it) break;
      const r = await fetch(`https://fonts.googleapis.com/css2?family=${q}:${axis}`).catch(() => null);
      if (!r || !r.ok) continue;
      const url = (/url\((https:[^)]+\.ttf)\)/.exec(await r.text()) || [])[1];
      if (!url) continue;
      const b = await fetch(url).catch(() => null);
      if (!b || !b.ok) continue;
      const buf = Buffer.from(await b.arrayBuffer());
      fs.mkdirSync(fontDir, { recursive: true });
      fs.writeFileSync(file, buf);
      return { data: buf.toString('base64') };
    }
    return null;
  });

  // Jeton Figma : sans argument, indique s'il est enregistré ; avec un jeton, l'enregistre chiffré.
  const readToken = () => {
    try { const j = JSON.parse(fs.readFileSync(tokenFile, 'utf8')); return j.enc && canEnc() ? safeStorage.decryptString(Buffer.from(j.enc, 'base64')) : j.plain ? Buffer.from(j.plain, 'base64').toString() : ''; } catch { return ''; }
  };
  ipcMain.handle('dzx:figma-token', (_e, { token } = {}) => {
    if (token === undefined) return { saved: Boolean(readToken()) };
    fs.mkdirSync(dir, { recursive: true });
    if (!token) { fs.rmSync(tokenFile, { force: true }); return { saved: false }; }
    fs.writeFileSync(tokenFile, JSON.stringify(canEnc() ? { enc: safeStorage.encryptString(String(token)).toString('base64') } : { plain: Buffer.from(String(token)).toString('base64') }));
    return { saved: true };
  });
  const figma = async (p) => {
    const token = readToken();
    if (!token) throw new Error('Ajoute d’abord ton jeton d’accès Figma.');
    const r = await fetch(`https://api.figma.com/v1${p}`, { headers: { 'X-Figma-Token': token } });
    if (r.status === 403) throw new Error('Figma refuse l’accès : vérifie le jeton et tes droits sur ce fichier.');
    if (r.status === 404) throw new Error('Fichier Figma introuvable : vérifie l’adresse.');
    if (!r.ok) throw new Error(`Figma ne répond pas (code ${r.status}). Réessaie dans un instant.`);
    return r.json();
  };
  ipcMain.handle('dzx:figma-file', async (_e, { url } = {}) => {
    const m = /figma\.com\/(?:file|design|proto)\/([A-Za-z0-9]{10,})/.exec(String(url || '')) || /^([A-Za-z0-9]{10,})$/.exec(String(url || '').trim());
    if (!m) throw new Error('Adresse de fichier Figma invalide (exemple : https://www.figma.com/design/…).');
    const key = m[1];
    const f = await figma(`/files/${key}?depth=2`);
    const frames = [];
    for (const pg of (f.document && f.document.children) || []) for (const n of pg.children || []) if (['FRAME', 'COMPONENT', 'COMPONENT_SET', 'SECTION'].includes(n.type) && n.absoluteBoundingBox) frames.push({ id: n.id, name: n.name, page: pg.name, w: n.absoluteBoundingBox.width, h: n.absoluteBoundingBox.height });
    return { key, name: f.name, frames };
  });
  ipcMain.handle('dzx:figma-svg', async (_e, { key, ids = [] } = {}) => {
    if (!/^[A-Za-z0-9]{10,}$/.test(key || '') || !ids.length) throw new Error('Choisis au moins un cadre.');
    const r = await figma(`/images/${key}?ids=${encodeURIComponent(ids.slice(0, 20).join(','))}&format=svg&svg_outline_text=false&svg_include_id=false`);
    const out = {};
    for (const [id, link] of Object.entries(r.images || {})) {
      // Adresses de rendu fournies par Figma seulement (https).
      if (!link || !/^https:\/\//.test(link)) continue;
      const s = await fetch(link);
      if (s.ok) out[id] = await s.text();
    }
    return out;
  });
}

module.exports = { register };
