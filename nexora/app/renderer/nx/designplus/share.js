// NEXORA #053 : validation par un client et bibliothèques d'équipe.
//  - Lien de validation : les pages sont publiées en images ; la personne qui reçoit le lien les voit sans
//    compte, épingle des commentaires et choisit « Approuver » ou « Demander des changements ».
//  - Lien de partage (#/share/…) : aperçu du design partagé (anomalie A-012).
//  - Bibliothèques d'équipe : composants, variables et kit de marque partagés par les membres de l'espace.
import { sb, cloud } from './cloud.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DECISIONS = { approve: 'Approuvé', changes: 'Changements demandés', comment: 'Commentaire' };
export const webUrl = () => (window.__NEXORA_WEB__ ? `${location.origin}${location.pathname}` : (cloud.config && cloud.config.web_url) || 'https://nexora.abrahamtogbonon0.workers.dev/');

// ---------- Page de revue (personne qui reçoit le lien) ----------
function overlay(html) {
  const ov = document.createElement('div');
  ov.className = 'dzx-review';
  ov.innerHTML = html;
  document.body.append(ov);
  return ov;
}
async function openReview(token) {
  const ov = overlay('<div class="dzx-review-box"><p>Chargement du design…</p></div>');
  const { data, error } = await sb.rpc('nx_review_get', { p_token: token }).then((r) => r, (e) => ({ error: e }));
  if (error || !data) { ov.querySelector('.dzx-review-box').innerHTML = '<h2>Lien introuvable</h2><p>Ce lien de validation n’existe pas ou n’est plus actif. Demande un nouveau lien à la personne qui te l’a envoyé.</p><button class="btn" data-rclose>Fermer</button>'; ov.addEventListener('click', (e) => { if (e.target.closest('[data-rclose]')) { ov.remove(); history.replaceState(null, '', location.pathname); } }); return; }
  let page = 0;
  const pins = [];
  const render = () => {
    const p = data.pages[page];
    const reviews = (data.reviews || []).filter((r) => r.page === page);
    ov.innerHTML = `<div class="dzx-review-box wide"><header><div><small>Validation demandée</small><h2>${esc(data.name)}</h2></div><span class="grow"></span>${data.pages.length > 1 ? `<div class="seg">${data.pages.map((x, i) => `<button class="${i === page ? 'on' : ''}" data-rpage="${i}">${i + 1}</button>`).join('')}</div>` : ''}<button class="btn" data-rclose>Fermer</button></header>
      <div class="dzx-review-main"><div class="dzx-review-img" data-rimg><img src="${esc(p.img)}" alt="${esc(p.name)}">${[...reviews, ...pins].filter((r) => r.x != null).map((r, i) => `<span class="dzx-pin" style="left:${r.x * 100}%;top:${r.y * 100}%">${i + 1}</span>`).join('')}</div>
      <aside><p class="dzx-hint">Clique sur l’image pour épingler un commentaire à un endroit précis.</p>
        <label>Ton nom<input class="input" data-rname value="${esc(localStorage.getItem('nx-review-name') || '')}" placeholder="Prénom Nom"></label>
        <label>Commentaire<textarea class="input" rows="4" data-rtext placeholder="Ce qui te plaît, ce qu’il faut changer…"></textarea></label>
        <div class="dzx-review-acts"><button class="btn primary" data-rsend="approve">Approuver</button><button class="btn" data-rsend="changes">Demander des changements</button><button class="btn" data-rsend="comment">Commenter</button></div>
        <h3>Avis (${(data.reviews || []).length})</h3>${(data.reviews || []).map((r) => `<div class="dzx-rv ${r.decision}"><b>${esc(r.author)}</b> <em>${esc(DECISIONS[r.decision] || '')}</em><p>${esc(r.comment)}</p><small>Page ${r.page + 1} · ${new Date(r.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</small></div>`).join('') || '<p class="dzx-hint">Aucun avis pour l’instant.</p>'}</aside></div></div>`;
  };
  render();
  ov.addEventListener('click', async (e) => {
    if (e.target.closest('[data-rclose]')) { ov.remove(); history.replaceState(null, '', location.pathname); return; }
    const pg = e.target.closest('[data-rpage]');
    if (pg) { page = +pg.dataset.rpage; pins.length = 0; render(); return; }
    const im = e.target.closest('[data-rimg]');
    if (im && e.target.tagName === 'IMG') { const r = e.target.getBoundingClientRect(); pins.length = 0; pins.push({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }); render(); return; }
    const s = e.target.closest('[data-rsend]');
    if (s) {
      const author = ov.querySelector('[data-rname]').value.trim();
      const comment = ov.querySelector('[data-rtext]').value.trim();
      if (!author) { ov.querySelector('[data-rname]').focus(); return; }
      if (!comment && s.dataset.rsend !== 'approve') { ov.querySelector('[data-rtext]').focus(); return; }
      localStorage.setItem('nx-review-name', author);
      const pin = pins[0] || {};
      const { data: rows, error } = await sb.rpc('nx_review_post', { p_token: token, p_author: author, p_decision: s.dataset.rsend, p_comment: comment, p_page: page, p_x: pin.x ?? null, p_y: pin.y ?? null }).then((r) => r, (er) => ({ error: er }));
      if (error) { const h = ov.querySelector('aside .dzx-hint'); if (h) h.textContent = 'Ton avis n’a pas pu être envoyé. Réessaie dans un instant.'; return; }
      data.reviews = rows || data.reviews; pins.length = 0; render();
    }
  });
}
async function openShare(token) {
  const ov = overlay('<div class="dzx-review-box"><p>Chargement…</p></div>');
  const { data } = await sb.rpc('get_shared', { share_token: token }).then((r) => r, () => ({ data: null }));
  const box = ov.querySelector('.dzx-review-box');
  const thumb = data && (data.thumb || (data.target && data.target.thumb) || (data.document && data.document.thumb));
  const name = data && (data.name || (data.target && data.target.name) || (data.document && data.document.name));
  box.innerHTML = data ? `<header><div><small>Design partagé</small><h2>${esc(name || 'Design')}</h2></div><span class="grow"></span><button class="btn" data-rclose>Fermer</button></header>${thumb ? `<div class="dzx-review-img"><img src="${esc(thumb)}" alt="${esc(name || 'Aperçu')}"></div>` : '<p>L’aperçu de ce design n’est pas disponible.</p>'}<p class="dzx-hint">Pour le modifier, ouvre-le dans NEXORA avec ton compte.</p>` : '<h2>Lien introuvable</h2><p>Ce lien de partage n’existe pas ou a expiré.</p><button class="btn" data-rclose>Fermer</button>';
  ov.addEventListener('click', (e) => { if (e.target.closest('[data-rclose]')) { ov.remove(); history.replaceState(null, '', location.pathname); } });
}
function route() {
  const m = /^#\/(revue|share)\/([\w-]{6,80})/.exec(location.hash || '');
  if (!m || document.querySelector('.dzx-review')) return;
  if (m[1] === 'revue') openReview(m[2]); else openShare(m[2]);
}
export async function install() {
  if (!document.querySelector('link[data-dzx-css]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./designplus.css', import.meta.url).href; l.dataset.dzxCss = '1'; document.head.append(l); }
  route();
  window.addEventListener('hashchange', route);
}

// ---------- Côté propriétaire : liens de validation ----------
export async function createLink(D, renderPages) {
  if (!cloud.user || !cloud.orgId) throw new Error('Connecte-toi à ton compte NEXORA pour créer un lien de validation.');
  const pages = await renderPages();
  const { data, error } = await sb.from('design_review_links').insert({ org_id: cloud.orgId, doc_local_id: D.doc.id, name: D.doc.name || 'Design', pages, created_by: cloud.user.id }).select('token').single();
  if (error) throw new Error('Le lien n’a pas pu être créé. Réessaie dans un instant.');
  return `${webUrl()}#/revue/${data.token}`;
}
export async function links(D) {
  if (!cloud.user || !cloud.orgId) return null;
  const { data, error } = await sb.from('design_review_links').select('token, name, created_at, active, design_reviews(author, decision, comment, page, created_at)').eq('org_id', cloud.orgId).eq('doc_local_id', D.doc.id).order('created_at', { ascending: false });
  if (error) return [];
  return data || [];
}
export async function closeLink(token) { await sb.from('design_review_links').update({ active: false }).eq('token', token); }

// ---------- Bibliothèques d'équipe ----------
export async function libraries() {
  if (!cloud.user || !cloud.orgId) return null;
  const { data, error } = await sb.from('design_libraries').select('id, kind, name, data, updated_at').eq('org_id', cloud.orgId).order('updated_at', { ascending: false });
  if (error) return [];
  return data || [];
}
export async function publish(kind, name, data) {
  if (!cloud.user || !cloud.orgId) throw new Error('Connecte-toi à ton compte NEXORA pour partager avec ton équipe.');
  const { error } = await sb.from('design_libraries').upsert({ org_id: cloud.orgId, kind, name, data, updated_by: cloud.user.id, updated_at: new Date().toISOString() }, { onConflict: 'org_id,kind,name' });
  if (error) throw new Error('La bibliothèque n’a pas pu être publiée. Réessaie dans un instant.');
}
export { DECISIONS, esc };
