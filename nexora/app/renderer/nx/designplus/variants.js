// NEXORA #053 : composants à variantes (un jeu par composant : propriétés comme « État » ou « Taille ») et
// propriétés modifiables de chaque copie (textes, éléments visibles ou non). S'appuie sur les composants du #011.
import { esc, ico, uid, toast, prompt, sec, btn, util, FabricObject, isText, replaceObj, commit, walk } from './ui.js';
import { comps } from '../design/content.js';

export const sets = (D) => (D.doc.nxSets = D.doc.nxSets || {});
const keyOf = (values) => values.join('|');
const setOfComp = (D, compId) => Object.entries(sets(D)).find(([, s]) => Object.values(s.variants).includes(compId));
const texts = (o) => { const out = []; walk([o], (x) => { if (isText(x)) out.push(x); }); return out; };
const parts = (o) => (o.getObjects ? o.getObjects() : []);

export async function createSet(D, master) {
  const prop = await prompt('Jeu de variantes', { label: 'Nom de la propriété (par exemple : État, Taille, Type)', value: 'État', icon: 'nxComponent', go: 'Continuer' });
  if (!prop) return;
  const val = await prompt('Valeur de ce composant', { label: `« ${prop} » de ce composant`, value: 'Normal', icon: 'nxComponent', go: 'Créer le jeu' });
  if (!val) return;
  const id = uid();
  sets(D)[id] = { name: master.name || 'Composant', props: [{ name: prop.trim(), values: [val.trim()] }], variants: { [val.trim()]: master.nxComp.id } };
  commit(D, 'Jeu de variantes');
  toast('Jeu créé : ajoute maintenant les autres variantes (survol, désactivé…).');
}
export async function addVariant(D, master) {
  const found = setOfComp(D, master.nxComp.id);
  if (!found) return;
  const [setId, s] = found;
  const values = [];
  for (const p of s.props) {
    const v = await prompt(`Nouvelle variante : ${p.name}`, { label: `Valeur de « ${p.name} » (existantes : ${p.values.join(', ')})`, icon: 'nxComponent', go: 'Continuer' });
    if (!v) return;
    values.push(v.trim());
  }
  const key = keyOf(values);
  if (s.variants[key]) { toast('Cette variante existe déjà.', { kind: 'bad' }); return; }
  const [copy] = await util.enlivenObjects([master.toObject(FabricObject.customProperties)]);
  const compId = uid();
  copy.id = uid(); copy.name = `${s.name} · ${values.join(', ')}`;
  copy.nxComp = { id: compId, master: true };
  copy.set({ left: master.left + master.getScaledWidth() + 40, top: master.top });
  comps(D)[compId] = { name: copy.name, json: copy.toObject(FabricObject.customProperties), updated: Date.now() };
  s.props.forEach((p, i) => { if (!p.values.includes(values[i])) p.values.push(values[i]); });
  s.variants[key] = compId;
  D.canvas.add(copy); D.canvas.setActiveObject(copy);
  commit(D, 'Variante ajoutée');
  toast(`Variante « ${values.join(', ')} » créée à côté : modifie-la, puis « Mettre à jour les copies ».`);
  void setId;
}
export async function addProp(D, master) {
  const found = setOfComp(D, master.nxComp.id);
  if (!found) return;
  const s = found[1];
  const name = await prompt('Nouvelle propriété', { label: 'Par exemple : Taille, Icône, Thème', icon: 'nxComponent', go: 'Continuer' });
  if (!name) return;
  const def = await prompt(`Valeur par défaut de « ${name} »`, { label: 'Donnée à toutes les variantes existantes', value: 'Moyen', icon: 'nxComponent', go: 'Ajouter' });
  if (!def) return;
  s.props.push({ name: name.trim(), values: [def.trim()] });
  s.variants = Object.fromEntries(Object.entries(s.variants).map(([k, v]) => [`${k}|${def.trim()}`, v]));
  commit(D, 'Propriété ajoutée');
}
// Copie : change de variante en gardant sa place, sa taille et ses textes modifiés.
export async function swap(D, inst, propIdx, value) {
  const found = setOfComp(D, inst.nxComp.id);
  if (!found) return;
  const s = found[1];
  const cur = (inst.nxVariant && inst.nxVariant.values) || Object.entries(s.variants).find(([, v]) => v === inst.nxComp.id)[0].split('|');
  const next = [...cur]; next[propIdx] = value;
  let compId = s.variants[keyOf(next)];
  if (!compId) { const alt = Object.keys(s.variants).find((k) => k.split('|')[propIdx] === value); if (!alt) { toast('Cette combinaison n’existe pas encore.', { kind: 'bad' }); return; } compId = s.variants[alt]; next.splice(0, next.length, ...alt.split('|')); }
  const c = comps(D)[compId];
  const [n] = await util.enlivenObjects([c.json]);
  const oldTexts = texts(inst).map((t) => t.text);
  const masterTexts = (inst.nxVariant && inst.nxVariant.masterTexts) || [];
  texts(n).forEach((t, i) => { if (oldTexts[i] !== undefined && oldTexts[i] !== masterTexts[i]) t.set('text', oldTexts[i]); });
  n.id = inst.id; n.name = c.name;
  n.nxComp = { id: compId };
  n.nxVariant = { values: next, masterTexts: texts(n).map((t, i) => (oldTexts[i] !== masterTexts[i] ? undefined : t.text)) };
  const k = inst.getScaledWidth() / Math.max(1, n.getScaledWidth());
  n.set({ scaleX: n.scaleX * k, scaleY: n.scaleY * k, angle: inst.angle });
  n.setPositionByOrigin(inst.getCenterPoint(), 'center', 'center');
  replaceObj(D, inst, n);
  D.canvas.setActiveObject(n);
  commit(D, 'Variante changée');
}

export function props(D, o) {
  if (!o || !o.nxComp) return '';
  const found = setOfComp(D, o.nxComp.id);
  if (o.nxComp.master) {
    return sec('Variantes', found ? `<p class="dzx-hint">Jeu « ${esc(found[1].name)} » : ${Object.keys(found[1].variants).length} variante(s), propriétés ${found[1].props.map((p) => esc(p.name)).join(', ')}.</p><div class="nx-btns">${btn('var-new', 'plus', 'Ajouter une variante')}${btn('var-prop', 'nxTag', 'Ajouter une propriété')}</div>`
      : `<p class="dzx-hint">Regroupe les états de ce composant (normal, survol, désactivé…) et ses tailles dans un seul composant.</p><div class="nx-btns">${btn('var-set', 'nxComponent', 'Créer un jeu de variantes')}</div>`);
  }
  const cur = found ? ((o.nxVariant && o.nxVariant.values) || (Object.entries(found[1].variants).find(([, v]) => v === o.nxComp.id) || [''])[0].split('|')) : [];
  const t = texts(o);
  const kids = parts(o).filter((x) => !isText(x));
  return sec('Propriétés du composant', `${found ? found[1].props.map((p, i) => `<label class="dzx-row"><span>${esc(p.name)}</span><select class="input" data-dzxk="variant.${i}">${p.values.map((v) => `<option ${v === cur[i] ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`).join('') : ''}
    ${t.map((x, i) => `<label class="dzx-row"><span>Texte ${i + 1}</span><input class="input" data-dzxk="vtext.${i}" value="${esc(x.text)}"></label>`).join('')}
    ${kids.length > 1 ? `<div class="dzx-vis">${kids.slice(0, 8).map((x, i) => `<label class="nxd-check dzx-check"><input type="checkbox" data-dzxk="vvis.${i}" ${x.visible !== false ? 'checked' : ''}> ${esc(x.name || x.type)}</label>`).join('')}</div>` : ''}`);
}
export async function onField(D, o, k, v) {
  if (k.startsWith('variant.')) { await swap(D, o, Number(k.slice(8)), v); return true; }
  if (k.startsWith('vtext.')) { const t = texts(o)[Number(k.slice(6))]; if (t) { t.set('text', v); if (t.initDimensions) t.initDimensions(); o.dirty = true; commit(D, 'Texte du composant'); } return true; }
  if (k.startsWith('vvis.')) { const x = parts(o).filter((y) => !isText(y))[Number(k.slice(5))]; if (x) { x.set('visible', Boolean(v)); o.dirty = true; commit(D, 'Élément du composant'); } return true; }
  return false;
}
export async function onAction(D, o, a) {
  if (a === 'var-set') { await createSet(D, o); return true; }
  if (a === 'var-new') { await addVariant(D, o); return true; }
  if (a === 'var-prop') { await addProp(D, o); return true; }
  return false;
}
export { ico };
