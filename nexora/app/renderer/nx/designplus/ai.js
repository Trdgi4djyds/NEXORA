// NEXORA #053 : IA de NEX-DESIGN (clé API de l'utilisateur, offre Pro) : design entier et modifiable à partir
// d'une demande (aux couleurs du kit de marque), 3 variantes d'une sélection, retouche d'image (effacer,
// remplacer le fond, agrandir au-delà des bords, consigne libre) ; agrandissement ×2 sur ce PC.
import { esc, ico, uid, toast, busy, api, btn, sec, util, FabricObject, Rect, Textbox, isText, hex, commit, objs, walk, pl } from './ui.js';
import { getBrand } from '../services.js';
import { FabricImage, Ellipse } from '../design/fab.js';

const done = (t) => { if (!t) return; if (t.close) t.close(); else if (t.remove) t.remove(); };
const clean = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const jsonOf = (text) => { const s = String(text || ''); const a = s.indexOf('{'); const b = s.lastIndexOf('}'); if (a < 0 || b < a) throw new Error('Réponse de l’IA illisible : relancez la demande.'); return JSON.parse(s.slice(a, b + 1)); };
const sizeFor = (w, h) => (w / h > 1.25 ? '1536x1024' : h / w > 1.25 ? '1024x1536' : '1024x1024');

const SPEC = `Réponds uniquement avec un objet JSON : {"background":"#hex","elements":[...]}.
Chaque élément : {"type":"rect"|"ellipse"|"text"|"image","x":nombre,"y":nombre,"w":nombre,"h":nombre,"role":"titre|texte|bouton|fond|carte|image|logo|décor",
"fill":"#hex","radius":nombre,"text":"…","fontSize":nombre,"fontWeight":400|600|700|800,"color":"#hex","align":"left|center|right","font":"Nom de police","prompt":"description de l'image (type image)"}.
Coordonnées en pixels dans la page, du fond vers le premier plan. Textes en français, lisibles (contraste suffisant), hiérarchie claire, marges régulières, 6 à 18 éléments.`;

export async function createDesign(D, { prompt, images, newPage }) {
  const b = getBrand();
  const pg = D.page;
  const t = busy('L’IA compose le design…');
  try {
    const r = await api.invoke('ai:chat', { id: `dz${Date.now()}`, system: `Vous êtes directeur artistique. Vous créez des mises en page modernes et sobres.\n${SPEC}`, messages: [{ role: 'user', content: `Format : ${pg.w} × ${pg.h} px.\nCouleurs de la marque : ${(b.colors || []).join(', ') || 'libres'}.\nPolices de la marque : ${Object.values(b.fonts || {}).filter((x) => typeof x === 'string').join(', ') || 'Inter'}.\nDemande : ${prompt}` }], maxTokens: 6000, temperature: 0.6 });
    const spec = jsonOf(r.text);
    if (newPage) {
      D.capturePage();
      D.doc.pages.splice(D.pageIdx + 1, 0, { id: uid(), name: String(prompt).slice(0, 40), w: pg.w, h: pg.h, bg: hex(spec.background) || '#ffffff', json: { version: '6', objects: [] } });
      await D.openPage(D.pageIdx + 1, { save: false });
    } else if (hex(spec.background)) D.page.bg = hex(spec.background);
    let made = 0;
    for (const e of (spec.elements || []).slice(0, 40)) {
      const x = Number(e.x) || 0; const y = Number(e.y) || 0; const w = Math.max(4, Number(e.w) || 100); const h = Math.max(4, Number(e.h) || 40);
      let o;
      if (e.type === 'text') {
        o = new Textbox(String(e.text || 'Texte'), { left: x, top: y, width: w, fontSize: Number(e.fontSize) || 24, fontWeight: String(e.fontWeight || 400), fill: hex(e.color) || '#111111', fontFamily: e.font || Object.values(b.fonts || {}).find((x) => typeof x === 'string') || 'Inter', textAlign: e.align || 'left' });
      } else if (e.type === 'image') {
        if (images && e.prompt) {
          try { const im = await api.invoke('ai:image', { prompt: e.prompt, size: sizeFor(w, h) }); o = await FabricImage.fromURL(im.dataUrl); const k = Math.max(w / o.width, h / o.height); o.set({ left: x, top: y, scaleX: k, scaleY: k, cropX: Math.max(0, (o.width - w / k) / 2), cropY: Math.max(0, (o.height - h / k) / 2), width: Math.min(o.width, w / k), height: Math.min(o.height, h / k) }); } catch (er) { toast(clean(er), { kind: 'bad' }); }
        }
        if (!o) o = new Rect({ left: x, top: y, width: w, height: h, fill: '#e7e8ee', rx: Number(e.radius) || 0, ry: Number(e.radius) || 0 });
        o.nxAlt = e.prompt || '';
      } else if (e.type === 'ellipse') {
        o = new Ellipse({ left: x, top: y, rx: w / 2, ry: h / 2, fill: hex(e.fill) || '#cccccc' });
      } else {
        o = new Rect({ left: x, top: y, width: w, height: h, fill: hex(e.fill) || '#eeeeee', rx: Number(e.radius) || 0, ry: Number(e.radius) || 0 });
      }
      o.id = uid(); o.name = e.role ? e.role.charAt(0).toUpperCase() + e.role.slice(1) : o.type;
      D.canvas.add(o); made += 1;
    }
    const board = D.canvas.getObjects().find((x) => x.id === '__board');
    if (board && D.page.bg) board.set('fill', D.page.bg);
    commit(D, 'Design créé par l’IA'); D.save(); if (D.renderLeft) D.renderLeft();
    toast(`${pl(made, 'élément créé', 'éléments créés')} : tout reste modifiable.`);
  } catch (e) { toast(clean(e), { kind: 'bad' }); } finally { done(t); }
}

export async function variants(D) {
  const sel = D.sel();
  if (!sel.length) { toast('Sélectionnez d’abord les éléments à décliner.'); return; }
  const colors = new Set(); const fonts = new Set();
  walk(sel, (o) => { for (const k of ['fill', 'stroke']) { const h = hex(o[k]); if (h && typeof o[k] === 'string') colors.add(h); } if (isText(o)) fonts.add(o.fontFamily); });
  const t = busy('L’IA prépare 3 variantes…');
  try {
    const r = await api.invoke('ai:chat', { id: `dzv${Date.now()}`, system: 'Tu proposes des déclinaisons graphiques. Réponds uniquement en JSON : {"variants":[{"name":"…","colors":{"#ancienne":"#nouvelle"},"font":"Police"}]} avec exactement 3 variantes distinctes, contrastes lisibles.', messages: [{ role: 'user', content: `Couleurs actuelles : ${[...colors].join(', ')}. Polices : ${[...fonts].join(', ') || 'aucune'}. Proposez 3 variantes (par exemple : sombre, pastel, contrastée).` }], maxTokens: 1500, temperature: 0.8 });
    const list = (jsonOf(r.text).variants || []).slice(0, 3);
    const box = sel.reduce((a, o) => { const b = o.getBoundingRect(); return { l: Math.min(a.l, b.left), t: Math.min(a.t, b.top), r: Math.max(a.r, b.left + b.width) }; }, { l: Infinity, t: Infinity, r: -Infinity });
    const W = box.r - box.l;
    for (const [i, v] of list.entries()) {
      const clones = await util.enlivenObjects(sel.map((o) => o.toObject(FabricObject.customProperties)));
      const map = Object.fromEntries(Object.entries(v.colors || {}).map(([a, b]) => [hex(a), hex(b)]));
      walk(clones, (o) => { for (const k of ['fill', 'stroke']) { const h = hex(o[k]); if (h && map[h] && typeof o[k] === 'string') o.set(k, map[h]); } if (isText(o) && v.font) o.set('fontFamily', v.font); });
      for (const o of clones) { o.set({ left: o.left + (W + 60) * (i + 1) }); o.id = uid(); D.canvas.add(o); }
    }
    commit(D, 'Variantes de l’IA');
    toast(`${pl(list.length, 'variante placée', 'variantes placées')} à droite de la sélection.`);
  } catch (e) { toast(clean(e), { kind: 'bad' }); } finally { done(t); }
}

// ---------- Retouche d'image ----------
function imageCanvas(o, max = 1536) {
  const el = o.getElement();
  const w = el.naturalWidth || el.width; const h = el.naturalHeight || el.height;
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
  return c;
}
async function replaceSrc(D, o, url, growX = 1, growY = 1) {
  const w = o.getScaledWidth(); const h = o.getScaledHeight(); const ctr = o.getCenterPoint();
  await o.setSrc(url);
  o.set({ cropX: 0, cropY: 0, scaleX: (w * growX) / o.width, scaleY: (h * growY) / o.height });
  o.setPositionByOrigin(ctr, 'center', 'center');
  o.setCoords();
  commit(D, 'Retouche d’image');
}
export async function retouch(D, o, kind, text) {
  if (kind === 'upscale') {
    const src = imageCanvas(o, 4096);
    const c = document.createElement('canvas'); c.width = src.width * 2; c.height = src.height * 2;
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height);
    // Netteté légère (masque flou) après l'agrandissement.
    const d = x.getImageData(0, 0, c.width, c.height); const s = new Uint8ClampedArray(d.data); const W = c.width;
    for (let i = W * 4 + 4; i < s.length - W * 4 - 4; i += 1) { if ((i & 3) === 3) continue; const v = 5 * s[i] - s[i - 4] - s[i + 4] - s[i - W * 4] - s[i + W * 4]; d.data[i] = s[i] + (v - s[i]) * 0.35; }
    x.putImageData(d, 0, 0);
    await replaceSrc(D, o, c.toDataURL('image/png'));
    toast('Image agrandie ×2 sur ce PC.');
    return;
  }
  const t = busy('Retouche par l’IA…');
  try {
    const src = imageCanvas(o);
    let image = src.toDataURL('image/png'); let mask; let gx = 1; let gy = 1; let prompt;
    if (kind === 'expand') {
      const m = 0.25; const c = document.createElement('canvas'); c.width = Math.round(src.width * (1 + 2 * m)); c.height = Math.round(src.height * (1 + 2 * m));
      c.getContext('2d').drawImage(src, Math.round(src.width * m), Math.round(src.height * m));
      const mk = document.createElement('canvas'); mk.width = c.width; mk.height = c.height; const mx = mk.getContext('2d'); mx.fillStyle = '#000'; mx.fillRect(Math.round(src.width * m), Math.round(src.height * m), src.width, src.height);
      image = c.toDataURL('image/png'); mask = mk.toDataURL('image/png'); gx = c.width / src.width; gy = c.height / src.height;
      prompt = 'Prolongez l’image dans les zones transparentes autour, de façon naturelle et cohérente avec le centre, sans modifier le centre.';
    } else if (kind === 'erase') prompt = `Effacez de l’image : ${text}. Reconstituez le fond à sa place de façon naturelle. Ne changez rien d’autre.`;
    else if (kind === 'background') prompt = `Gardez le sujet principal intact et remplacez le fond par : ${text}. Lumière cohérente.`;
    else prompt = `${text}. Ne changez que ce qui est demandé.`;
    const r = await api.invoke('ai:image', { prompt, image, mask, size: sizeFor(src.width * gx, src.height * gy) });
    await replaceSrc(D, o, r.dataUrl, gx, gy);
    toast('Retouche appliquée : Ctrl+Z pour revenir en arrière.');
  } catch (e) { toast(clean(e), { kind: 'bad' }); } finally { done(t); }
}
export function imageProps(D, o, pro) {
  if (!o || o.type !== 'image') return '';
  return sec('Retouche intelligente', `${pro ? '' : '<p class="dzx-hint">Effacer, remplacer le fond et agrandir par l’IA font partie de l’offre Pro.</p>'}<div class="nx-btns">${btn('ai-erase', 'nxEraser', 'Effacer un objet…', pro ? '' : 'disabled')}${btn('ai-bg', 'image', 'Remplacer le fond…', pro ? '' : 'disabled')}${btn('ai-expand', 'nxResize', 'Agrandir au-delà des bords', pro ? '' : 'disabled')}${btn('ai-edit', 'sparkle', 'Autre retouche…', pro ? '' : 'disabled')}${btn('ai-upscale', 'scale', 'Agrandir ×2 (sur ce PC)')}</div>`);
}
export function panel(D, st) {
  return `<p class="dzx-hint">Décrivez ce que vous voulez : l’IA crée une maquette complète aux couleurs de votre kit de marque. Chaque texte, forme et image reste modifiable.</p>
    <textarea class="input nx-ta" rows="4" data-aik="prompt" placeholder="Exemple : une page d’accueil pour une boutique de pagnes, avec un titre accrocheur, trois produits et un bouton « Commander »">${esc(st.prompt || '')}</textarea>
    <label class="nxd-check dzx-check"><input type="checkbox" data-aik="images" ${st.images ? 'checked' : ''}> Générer aussi les images (plus long ; facturé par votre fournisseur d’IA, avec votre clé)</label>
    <label class="nxd-check dzx-check"><input type="checkbox" data-aik="newPage" ${st.newPage !== false ? 'checked' : ''}> Sur une nouvelle page (${D.page.w} × ${D.page.h})</label>
    <div class="nx-btns">${btn('ai-create', 'sparkle', 'Créer le design', '', 'primary')}</div>
    <div class="dzp-sub">Déclinaisons</div>
    <p class="dzx-hint">Sélectionnez des éléments : l’IA propose 3 variantes de couleurs et de police, posées à côté.</p>
    <div class="nx-btns">${btn('ai-variants', 'layers', 'Proposer 3 variantes')}</div>
    <div class="dzp-sub">Retouche d’image</div>
    <p class="dzx-hint">Sélectionnez une image : la section « Retouche intelligente » du panneau de droite efface un objet, remplace le fond ou agrandit l’image au-delà de ses bords.</p>`;
}
export async function onPanel(D, e, rerender, st) {
  const b = e.target.closest('[data-dzx]');
  if (!b) return false;
  if (b.dataset.dzx === 'ai-create') { if (!st.prompt || !st.prompt.trim()) { toast('Décrivez d’abord le design voulu.'); return true; } await createDesign(D, { prompt: st.prompt, images: st.images, newPage: st.newPage !== false }); return true; }
  if (b.dataset.dzx === 'ai-variants') { await variants(D); return true; }
  return false;
}
export function onPanelInput(D, e, st) {
  const k = e.target.dataset.aik;
  if (!k) return false;
  st[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  return true;
}
export { ico, objs };
