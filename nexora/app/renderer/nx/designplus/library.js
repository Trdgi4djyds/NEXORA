// NEXORA #054 : bibliothèques d'équipe tenues à jour : chaque import retient sa source et sa version
// (D.doc.nxLibs) ; à l'ouverture d'un document, une publication plus récente est signalée et « Mettre à jour »
// applique la nouvelle version, copies des composants comprises (sur toutes les pages).
import { toast, settings, saveSettings, util, FabricObject, replaceObj } from './ui.js';
import * as VAR from './variables.js';

export const KINDS = { components: 'Composants', variables: 'Variables', brand: 'Kit de marque' };
const imported = (D) => (D.doc.nxLibs = D.doc.nxLibs || {});
export const remember = (D, l) => { imported(D)[l.id] = { kind: l.kind, name: l.name, at: l.updated_at }; };
// Bibliothèques importées dont l'équipe a publié une version plus récente.
export function pending(D, libs) {
  const mine = D.doc.nxLibs || {};
  return (libs || []).filter((l) => mine[l.id] && String(l.updated_at) > String(mine[l.id].at));
}

// Copies d'un composant remplacées par sa version à jour (même taille, angle et centre), sur toutes les pages.
// NEXORA #075 (A-040) : textes et images changés dans une copie gardés (ancienne version du composant : before).
async function refreshCopies(D, ids, before = {}) {
  const comps = D.doc.nxComponents || {};
  const { overridesOf, keepOverrides } = await import('../design/content.js');
  let count = 0;
  const fresh = async (old, id) => {
    const c = comps[id];
    const [n] = await util.enlivenObjects([c.json]);
    n.nxComp = { id }; n.name = c.name;
    const k = old.getScaledWidth() / Math.max(1, n.getScaledWidth());
    n.set({ scaleX: n.scaleX * k, scaleY: n.scaleY * k, angle: old.angle });
    if (before[id]) await keepOverrides(n, overridesOf(old, before[id].json));
    n.setPositionByOrigin(old.getCenterPoint(), 'center', 'center');
    return n;
  };
  for (const o of D.canvas.getObjects().filter((x) => x.nxComp && ids.includes(x.nxComp.id) && !x.nxComp.master)) { replaceObj(D, o, await fresh(o, o.nxComp.id)); count += 1; }
  D.capturePage();
  for (const [i, pg] of D.doc.pages.entries()) {
    if (i === D.pageIdx || !pg.json || !pg.json.objects) continue;
    for (let k = 0; k < pg.json.objects.length; k++) {
      const j = pg.json.objects[k];
      if (j.nxComp && ids.includes(j.nxComp.id) && !j.nxComp.master) {
        const [old] = await util.enlivenObjects([j]);
        pg.json.objects[k] = (await fresh(old, j.nxComp.id)).toObject(FabricObject.customProperties); count += 1;
      }
    }
  }
  return count;
}

// Import (ou mise à jour) d'une bibliothèque dans le document ouvert.
export async function apply(D, l) {
  let msg = '';
  if (l.kind === 'components') {
    const list = l.data.components || {};
    const before = { ...(D.doc.nxComponents || {}) };
    D.doc.nxComponents = { ...(D.doc.nxComponents || {}), ...list };
    D.doc.nxSets = { ...(D.doc.nxSets || {}), ...(l.data.sets || {}) };
    const n = await refreshCopies(D, Object.keys(list), before);
    const k = Object.keys(list).length;
    msg = `${k} composant${k > 1 ? 's' : ''} de « ${l.name} »${n ? `, ${n} copie${n > 1 ? 's' : ''} mise${n > 1 ? 's' : ''} à jour` : ' : onglet « Ressources »'}.`;
  }
  if (l.kind === 'variables') {
    const v = VAR.store(D);
    for (const m of l.data.modes || []) if (!v.modes.includes(m)) v.modes.push(m);
    for (const x of l.data.list || []) { const i = v.list.findIndex((y) => y.name === x.name); if (i >= 0) v.list[i] = { ...x, id: v.list[i].id }; else v.list.push(x); }
    VAR.applyAll(D);
    msg = `Variables « ${l.name} » appliquées au document.`;
  }
  if (l.kind === 'brand') {
    const S = await import('../services.js');
    if (S.setBrand) S.setBrand(l.data); else { settings.nxBrand = l.data; saveSettings(); }
    msg = `Kit de marque « ${l.name} » appliqué.`;
  }
  remember(D, l);
  D.changed(); D.save(); D.renderProps();
  return msg;
}

// À l'ouverture d'un document : mises à jour signalées une fois par document et par version.
const told = new Set();
export async function check(D, { libraries, onOpen }) {
  const mine = D.doc && D.doc.nxLibs;
  if (!mine || !Object.keys(mine).length) return [];
  const libs = await libraries();
  const list = pending(D, libs || []);
  const key = `${D.doc.id}:${list.map((l) => `${l.id}@${l.updated_at}`).join(',')}`;
  if (list.length && !told.has(key)) {
    told.add(key);
    toast(list.length === 1 ? `La bibliothèque « ${list[0].name} » de ton équipe a changé.` : `${list.length} bibliothèques de ton équipe ont changé.`, { action: 'Mettre à jour', onAction: onOpen });
  }
  return list;
}
