// NEXORA #053 : validation par un client et bibliothèques d'équipe.
//  - Lien de validation : les pages sont publiées en images ; la personne qui reçoit le lien les voit sans
//    compte, épingle des commentaires et choisit « Approuver » ou « Demander des changements ».
//  - Lien de partage (#/share/…) : aperçu du design partagé (anomalie A-012).
//  - Bibliothèques d'équipe : composants, variables et kit de marque partagés par les membres de l'espace.
import { sb, cloud } from './cloud.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DECISIONS = { approve: 'Approuvé', changes: 'Changements demandés', comment: 'Commentaire' };
export const webUrl = () => (window.__NEXORA_WEB__ ? `${location.origin}${location.pathname}` : (cloud.config && cloud.config.web_url) || 'https://nexoradevs.online/studio/');

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
  if (error || !data) { ov.querySelector('.dzx-review-box').innerHTML = '<h2>Lien introuvable</h2><p>Ce lien de validation n’existe pas ou n’est plus actif. Demande un nouveau lien à la personne qui vous l’a envoyé.</p><button class="btn" data-rclose>Fermer</button>'; ov.addEventListener('click', (e) => { if (e.target.closest('[data-rclose]')) { ov.remove(); history.replaceState(null, '', location.pathname); } }); return; }
  if (data.kind === 'video') { videoReview(ov, token, data); return; }
  let page = 0;
  const pins = [];
  const render = () => {
    const p = data.pages[page];
    const reviews = (data.reviews || []).filter((r) => r.page === page);
    ov.innerHTML = `<div class="dzx-review-box wide"><header><div><small>Validation demandée</small><h2>${esc(data.name)}</h2></div><span class="grow"></span>${data.pages.length > 1 ? `<div class="seg">${data.pages.map((x, i) => `<button class="${i === page ? 'on' : ''}" data-rpage="${i}">${i + 1}</button>`).join('')}</div>` : ''}<button class="btn" data-rclose>Fermer</button></header>
      <div class="dzx-review-main"><div class="dzx-review-img" data-rimg><img src="${esc(p.img)}" alt="${esc(p.name)}">${[...reviews, ...pins].filter((r) => r.x != null).map((r, i) => `<span class="dzx-pin" style="left:${r.x * 100}%;top:${r.y * 100}%">${i + 1}</span>`).join('')}</div>
      <aside><p class="dzx-hint">Cliquez sur l’image pour épingler un commentaire à un endroit précis.</p>
        <label>Votre nom<input class="input" data-rname value="${esc(localStorage.getItem('nx-review-name') || '')}" placeholder="Prénom Nom"></label>
        <label>Commentaire<textarea class="input" rows="4" data-rtext placeholder="Ce qui vous plaît, ce qu’il faut changer…"></textarea></label>
        <div class="dzx-review-acts"><button class="btn primary" data-rsend="approve">Approuver</button><button class="btn" data-rsend="changes">Demander des changements</button><button class="btn" data-rsend="comment">Commenter</button></div>
        <h3>Avis (${(data.reviews || []).length})</h3>${(data.reviews || []).map((r) => `<div class="dzx-rv ${r.decision}"><b>${esc(r.author)}</b> <em>${esc(DECISIONS[r.decision] || '')}</em><p>${esc(r.comment)}</p><small>Page ${r.page + 1} · ${new Date(r.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</small></div>`).join('') || '<p class="dzx-hint">Aucun avis pour l’instant.</p>'}</aside></div></div>`;
    // NEXORA #075 : lien en lecture seule : toutes les pages, sans formulaire d'avis ni épingles.
    if (data.mode === 'view') { const sm = ov.querySelector('header small'); if (sm) sm.textContent = 'Design partagé · lecture seule'; const a = ov.querySelector('aside'); if (a) a.remove(); const bx = ov.querySelector('.dzx-review-box'); if (bx) bx.classList.add('dzx-view'); }
  };
  render();
  ov.addEventListener('click', async (e) => {
    if (e.target.closest('[data-rclose]')) { ov.remove(); history.replaceState(null, '', location.pathname); return; }
    const pg = e.target.closest('[data-rpage]');
    if (pg) { page = +pg.dataset.rpage; pins.length = 0; render(); return; }
    const im = e.target.closest('[data-rimg]');
    if (im && e.target.tagName === 'IMG' && data.mode !== 'view') { const r = e.target.getBoundingClientRect(); pins.length = 0; pins.push({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }); render(); return; }
    const s = e.target.closest('[data-rsend]');
    if (s) {
      const author = ov.querySelector('[data-rname]').value.trim();
      const comment = ov.querySelector('[data-rtext]').value.trim();
      if (!author) { ov.querySelector('[data-rname]').focus(); return; }
      if (!comment && s.dataset.rsend !== 'approve') { ov.querySelector('[data-rtext]').focus(); return; }
      localStorage.setItem('nx-review-name', author);
      const pin = pins[0] || {};
      const { data: rows, error } = await sb.rpc('nx_review_post', { p_token: token, p_author: author, p_decision: s.dataset.rsend, p_comment: comment, p_page: page, p_x: pin.x ?? null, p_y: pin.y ?? null }).then((r) => r, (er) => ({ error: er }));
      if (error) { const h = ov.querySelector('aside .dzx-hint'); if (h) h.textContent = 'Votre avis n’a pas pu être envoyé. Réessayez dans un instant.'; return; }
      data.reviews = rows || data.reviews; pins.length = 0; render();
    }
  });
}
// NEXORA #055 : vidéo du Studio à valider : lecture (chargée puis lue en local, la politique de sécurité de la page
// n'autorise pas les vidéos d'un autre site), commentaires à l'instant de lecture, avis horodatés cliquables.
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
async function videoReview(ov, token, data) {
  const box = ov.querySelector('.dzx-review-box');
  box.innerHTML = '<p>Chargement de la vidéo…</p>';
  let src = '';
  try { src = URL.createObjectURL(await (await fetch(data.media_url)).blob()); } catch { box.innerHTML = '<h2>Vidéo indisponible</h2><p>La vidéo n’a pas pu être chargée. Réessayez dans un instant.</p><button class="btn" data-rclose>Fermer</button>'; }
  const close = () => { if (src) URL.revokeObjectURL(src); ov.remove(); history.replaceState(null, '', location.pathname); };
  const list = () => `<h3>Avis (${(data.reviews || []).length})</h3>${(data.reviews || []).map((r) => `<div class="dzx-rv ${r.decision}"><b>${esc(r.author)}</b> <em>${esc(DECISIONS[r.decision] || '')}</em><p>${esc(r.comment)}</p><small>${r.t != null ? `<button class="dzx-rv-t" data-rseek="${r.t}">à ${mmss(r.t)}</button> · ` : ''}${new Date(r.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</small></div>`).join('') || '<p class="dzx-hint">Aucun avis pour l’instant.</p>'}`;
  if (src) {
    box.classList.add('wide');
    box.innerHTML = `<header><div><small>Vidéo à valider</small><h2>${esc(data.name)}</h2></div><span class="grow"></span><button class="btn" data-rclose>Fermer</button></header>
      <div class="dzx-review-main"><div class="dzx-review-video"><video controls playsinline src="${src}"></video><div class="dzx-rv-marks">${(data.reviews || []).filter((r) => r.t != null).map((r) => `<button class="dzx-rv-mark ${r.decision}" data-rseek="${r.t}" title="${esc(r.author)} à ${mmss(r.t)}" style="left:0"></button>`).join('')}</div></div>
      <aside><p class="dzx-hint">Mettez la vidéo en pause au bon moment : votre commentaire est rattaché à cet instant (<b data-rnow>0:00</b>).</p>
        <label>Votre nom<input class="input" data-rname value="${esc(localStorage.getItem('nx-review-name') || '')}" placeholder="Prénom Nom"></label>
        <label>Commentaire<textarea class="input" rows="4" data-rtext placeholder="Ce qui vous plaît, ce qu’il faut changer…"></textarea></label>
        <div class="dzx-review-acts"><button class="btn primary" data-rsend="approve">Approuver</button><button class="btn" data-rsend="changes">Demander des changements</button><button class="btn" data-rsend="comment">Commenter</button></div>
        <div data-rlist>${list()}</div></aside></div>`;
    const v = box.querySelector('video');
    const place = () => { const d = v.duration || 0; box.querySelectorAll('.dzx-rv-mark').forEach((m) => { m.style.left = d ? `${(+m.dataset.rseek / d) * 100}%` : '0'; }); };
    v.addEventListener('loadedmetadata', place);
    v.addEventListener('timeupdate', () => { const n = box.querySelector('[data-rnow]'); if (n) n.textContent = mmss(v.currentTime); });
  }
  ov.addEventListener('click', async (e) => {
    if (e.target.closest('[data-rclose]')) { close(); return; }
    const seek = e.target.closest('[data-rseek]'); const v = box.querySelector('video');
    if (seek && v) { v.currentTime = +seek.dataset.rseek; v.pause(); return; }
    const s = e.target.closest('[data-rsend]'); if (!s || !v) return;
    const author = box.querySelector('[data-rname]').value.trim(); const comment = box.querySelector('[data-rtext]').value.trim();
    if (!author) { box.querySelector('[data-rname]').focus(); return; }
    if (!comment && s.dataset.rsend !== 'approve') { box.querySelector('[data-rtext]').focus(); return; }
    localStorage.setItem('nx-review-name', author);
    const { data: rows, error } = await sb.rpc('nx_review_post', { p_token: token, p_author: author, p_decision: s.dataset.rsend, p_comment: comment, p_page: 0, p_x: null, p_y: null, p_t: Math.round(v.currentTime * 100) / 100 }).then((r) => r, (er) => ({ error: er }));
    if (error) { const h = box.querySelector('aside .dzx-hint'); if (h) h.textContent = 'Votre avis n’a pas pu être envoyé. Réessayez dans un instant.'; return; }
    data.reviews = rows || data.reviews; box.querySelector('[data-rtext]').value = ''; box.querySelector('[data-rlist]').innerHTML = list();
  });
}
async function openShare(token) {
  const ov = overlay('<div class="dzx-review-box"><p>Chargement…</p></div>');
  const { data } = await sb.rpc('get_shared', { share_token: token }).then((r) => r, () => ({ data: null }));
  const box = ov.querySelector('.dzx-review-box');
  const thumb = data && (data.thumb || (data.target && data.target.thumb) || (data.document && data.document.thumb));
  const name = data && (data.name || (data.target && data.target.name) || (data.document && data.document.name));
  box.innerHTML = data ? `<header><div><small>Design partagé</small><h2>${esc(name || 'Design')}</h2></div><span class="grow"></span><button class="btn" data-rclose>Fermer</button></header>${thumb ? `<div class="dzx-review-img"><img src="${esc(thumb)}" alt="${esc(name || 'Aperçu')}"></div>` : '<p>L’aperçu de ce design n’est pas disponible.</p>'}<p class="dzx-hint">Pour le modifier, ouvrez-le dans NEXORA avec votre compte.</p>` : '<h2>Lien introuvable</h2><p>Ce lien de partage n’existe pas ou a expiré.</p><button class="btn" data-rclose>Fermer</button>';
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
// NEXORA #075 : mode « view » : lien en lecture seule, toutes les pages, sans avis (migration 20261108000001).
export async function createLink(D, renderPages, { mode = 'review' } = {}) {
  if (!cloud.user || !cloud.orgId) throw new Error(mode === 'view' ? 'Connectez-vous à votre compte NEXORA pour créer un lien de partage.' : 'Connectez-vous à votre compte NEXORA pour créer un lien de validation.');
  const pages = await renderPages();
  const row = { org_id: cloud.orgId, doc_local_id: D.doc.id, name: D.doc.name || 'Design', pages, created_by: cloud.user.id };
  if (mode === 'view') row.mode = 'view';
  const { data, error } = await sb.from('design_review_links').insert(row).select('token').single();
  if (error) throw new Error(mode === 'view' && /mode/.test(error.message || '') ? 'Les liens en lecture seule demandent la dernière mise à jour du serveur NEXORA (migration 20261108000001).' : 'Le lien n’a pas pu être créé. Réessayez dans un instant.');
  return `${webUrl()}#/revue/${data.token}`;
}
export async function links(D) {
  if (!cloud.user || !cloud.orgId) return null;
  const { data, error } = await sb.from('design_review_links').select('*, design_reviews(author, decision, comment, page, x, y, created_at)').eq('org_id', cloud.orgId).eq('doc_local_id', D.doc.id).order('created_at', { ascending: false });
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
  if (!cloud.user || !cloud.orgId) throw new Error('Connectez-vous à votre compte NEXORA pour partager avec votre équipe.');
  const { error } = await sb.from('design_libraries').upsert({ org_id: cloud.orgId, kind, name, data, updated_by: cloud.user.id, updated_at: new Date().toISOString() }, { onConflict: 'org_id,kind,name' });
  if (error) throw new Error('La bibliothèque n’a pas pu être publiée. Réessayez dans un instant.');
}
export { DECISIONS, esc };
