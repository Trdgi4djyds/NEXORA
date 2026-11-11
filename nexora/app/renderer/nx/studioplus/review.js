// NEXORA #055 : validation des vidéos par un client : la vidéo (MP4 720p) est rendue, déposée dans l'espace de
// stockage de l'équipe, puis un lien sans compte permet de la regarder et de commenter à une seconde précise ;
// chaque avis est notifié (déclencheur du serveur, migrations 20261106000004 et 20261106000005).
import { sb, cloud } from '../designplus/cloud.js';
import { webUrl } from '../designplus/share.js';
import { api, toast, busy, done, uid, allowed, sceneKey, sceneTitle } from './ui.js';

export const docId = (S) => `studio:${sceneKey(S)}`;
export async function links(S) {
  if (!cloud.user || !cloud.orgId) return null;
  const { data, error } = await sb.from('design_review_links').select('token, name, created_at, active, kind, design_reviews(author, decision, comment, t, created_at)').eq('org_id', cloud.orgId).eq('doc_local_id', docId(S)).order('created_at', { ascending: false });
  return error ? [] : (data || []);
}
export async function create(S) {
  if (!allowed('La validation des vidéos')) return null;
  if (!cloud.user || !cloud.orgId) { toast('Connecte-toi à ton compte NEXORA pour envoyer une vidéo à valider.', { kind: 'bad' }); return null; }
  const keep = S.exportSettings(); const prev = { ...keep };
  Object.assign(keep, { vformat: 'mp4', vsize: '720' });
  let path;
  try { path = await S.exportVideo({ ...keep }); } finally { Object.assign(keep, prev); }
  if (!path) return null;
  const t = busy('Envoi de la vidéo à valider…');
  try {
    const url = await api.invoke('media:url', path);
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    if (bytes.length > 100 * 1048576) throw new Error('La vidéo dépasse 100 Mo : raccourcis-la ou réduis sa définition.');
    const key = `${cloud.orgId}/${uid()}.mp4`;
    const up = await sb.storage.from('studio-reviews').upload(key, new Blob([bytes], { type: 'video/mp4' }), { contentType: 'video/mp4', upsert: false });
    if (up.error) throw new Error('La vidéo n’a pas pu être envoyée. Réessaie dans un instant.');
    const media = sb.storage.from('studio-reviews').getPublicUrl(key).data.publicUrl;
    const { data, error } = await sb.from('design_review_links').insert({ org_id: cloud.orgId, doc_local_id: docId(S), name: sceneTitle(S), kind: 'video', media_url: media, pages: [], created_by: cloud.user.id }).select('token').single();
    if (error) throw new Error('Le lien n’a pas pu être créé. Réessaie dans un instant.');
    const link = `${webUrl()}#/revue/${data.token}`;
    await api.invoke('clipboard:write', link).catch(() => navigator.clipboard.writeText(link));
    toast('Lien de validation copié : envoie-le à ton client. Chaque avis te sera notifié.');
    return link;
  } catch (e) { toast(e.message || String(e), { kind: 'bad' }); return null; } finally { done(t); }
}
export async function close(token) { await sb.from('design_review_links').update({ active: false }).eq('token', token); }
export const at = (t) => (t == null ? '' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
