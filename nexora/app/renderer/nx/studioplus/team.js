// NEXORA #055 : versions de la scène (12 au plus, vignette, comparaison côte à côte, retour réversible) et
// bibliothèque d'équipe 3D (mises en scène partagées avec les membres de l'espace).
import * as W from '../studio/web.js';
import { settings, saveSettings, uid, toast, prompt, esc, allowed, sceneKey, sceneTitle } from './ui.js';

const store = () => (settings.nxStudioVersions = settings.nxStudioVersions && typeof settings.nxStudioVersions === 'object' ? settings.nxStudioVersions : {});
const key = (S) => sceneKey(S);
export const versions = (S) => (store()[key(S)] = Array.isArray(store()[key(S)]) ? store()[key(S)] : []);
export async function save(S, name) {
  const label = name || await prompt('Enregistrer une version', { label: 'Nom de la version', value: `Version ${versions(S).length + 1}`, icon: 'nxHistory', go: 'Enregistrer' });
  if (!label) return;
  const list = versions(S);
  list.unshift({ id: uid(), name: label.slice(0, 60), at: Date.now(), thumb: S.nxSceneThumb ? S.nxSceneThumb() : '', data: S.serialize() });
  while (list.length > 12) list.pop();
  saveSettings(); toast(`Version « ${label} » enregistrée.`);
}
export async function restore(S, id) {
  const v = versions(S).find((x) => x.id === id); if (!v) return;
  await save(S, `Avant le retour à « ${v.name} »`);
  await S.load(JSON.parse(JSON.stringify(v.data))); S.commit(); S.renderProps();
  toast(`Scène revenue à « ${v.name} ». L’état précédent est gardé dans les versions.`);
}
export function remove(S, id) { store()[key(S)] = versions(S).filter((x) => x.id !== id); saveSettings(); }
export function compareHtml(S, id) {
  const v = versions(S).find((x) => x.id === id); if (!v) return '';
  const now = S.nxSceneThumb ? S.nxSceneThumb() : '';
  return `<div class="sx-compare"><figure>${v.thumb ? `<img src="${esc(v.thumb)}" alt="">` : ''}<figcaption>${esc(v.name)}</figcaption></figure><figure>${now ? `<img src="${esc(now)}" alt="">` : ''}<figcaption>Maintenant</figcaption></figure></div>`;
}

// ---------- Bibliothèque d'équipe 3D ----------
export async function libs() { const SH = await import('../designplus/share.js'); const all = await SH.libraries(); return all === null ? null : (all || []).filter((l) => l.kind === 'studio'); }
export async function publish(S) {
  if (!allowed('La bibliothèque d’équipe 3D')) return false;
  const name = await prompt('Partager avec l’équipe', { label: 'Nom de la mise en scène partagée', value: sceneTitle(S), icon: 'group', go: 'Publier' });
  if (!name) return false;
  const SH = await import('../designplus/share.js');
  await SH.publish('studio', name.trim(), { scene: S.serialize(), thumb: S.nxSceneThumb ? S.nxSceneThumb() : '' });
  toast(`« ${name.trim()} » publiée dans la bibliothèque de l’équipe : chaque membre peut l’ajouter à « Mes mises en scène ».`);
  return true;
}
export function take(l) {
  const mine = W.myPresets(); const i = mine.findIndex((p) => p.team === l.id);
  const p = { id: i >= 0 ? mine[i].id : uid(), name: l.name, data: l.data.scene, at: Date.now(), thumb: l.data.thumb || '', team: l.id, teamAt: l.updated_at };
  if (i >= 0) mine[i] = p; else mine.push(p);
  saveSettings();
  toast(i >= 0 ? `« ${l.name} » mise à jour dans « Mes mises en scène ».` : `« ${l.name} » ajoutée à « Mes mises en scène ».`);
}
export const fresh = (l) => { const p = W.myPresets().find((x) => x.team === l.id); return p ? String(l.updated_at) > String(p.teamAt) : null; };
