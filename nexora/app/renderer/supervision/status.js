// NEXORA #048 : « Page publique » : page de statut sur NEXORA web (état des services, disponibilité sur
// 90 jours, incidents en cours et passés, maintenances prévues), avec abonnement des visiteurs par e-mail.
// Basée sur les sites surveillés 24 h/24 par les serveurs NEXORA de l'équipe active. Offre Standard.
import { esc, icon, toast, call } from './util.js';
import { card, btn, iconBtn } from './ui.js';
import { account, statusPages, saveStatusPage, deleteStatusPage, statusUrl, outdated } from './cloud.js';

const slugify = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export async function renderStatus(ctx) {
  const acc = account();
  if (!acc.signedIn || !acc.orgId) {
    return card('Page de statut publique', `<p class="sup-note">${icon('cloud', 13)} Une page publique, par exemple <b>statut de votre boutique</b>, qui montre à vos clients si tout fonctionne, l’historique sur 90 jours et les incidents en cours. Connectez-vous à votre compte NEXORA, puis activez la surveillance 24 h/24 de vos sites.</p><div class="nxs-actions">${btn('Se connecter', 'data-st-login', { ic: 'user', cls: 'small primary' })}</div>`, { sub: 'Offre Standard' }) + bindLater(ctx);
  }
  let data;
  try { data = await statusPages(); } catch (err) {
    return card('Page de statut publique', `<p class="sup-note">${esc(outdated(err) || /pas encore disponible/.test(err.message) ? 'Les pages de statut ne sont pas encore disponibles. Réessayez plus tard.' : err.message)}</p>`);
  }
  ctx.state.statusData = data;
  const mons = data.monitors.filter((m) => m.kind !== 'heartbeat');
  const page = ctx.state.statusEdit || data.list[0] || null;
  const editing = ctx.state.statusEdit !== undefined ? ctx.state.statusEdit : page;
  const e = editing || { title: acc.orgName ? `Statut de ${acc.orgName}` : 'Statut des services', slug: slugify(acc.orgName || 'mes-services'), intro: '', monitor_ids: mons.map((m) => m.id), published: true, show_incidents: true };
  ctx.afterRender = () => bind(ctx, e);
  const list = data.list.length ? `<div class="sup-list">${data.list.map((p) => `<div class="sup-mrow"><span class="sup-chip ${p.published ? 'good' : ''}">${p.published ? 'Publiée' : 'Brouillon'}</span><div><b>${esc(p.title)}</b><small>${esc(statusUrl(p.slug))} · ${(p.monitor_ids || []).length} service(s)</small></div>${iconBtn('external', 'Ouvrir la page', `data-external="${esc(statusUrl(p.slug))}"`)}${iconBtn('copy', 'Copier le lien', `data-st-copy="${esc(statusUrl(p.slug))}"`)}${iconBtn('pen', 'Modifier', `data-st-edit="${esc(p.id)}"`)}${iconBtn('trash', 'Supprimer', `data-st-del="${esc(p.id)}"`)}</div>`).join('')}</div>` : '<p class="pop-note">Aucune page pour l’instant : créez la première ci-dessous.</p>';
  return `<div class="sup-grid g-2-1 g-top">
    ${card(e.id ? 'Modifier la page' : 'Nouvelle page de statut', mons.length ? `<form class="sup-form sup-stform" data-st-form autocomplete="off">
      <div class="sup-form-grid"><label class="field"><span>Titre</span><input class="input" name="title" value="${esc(e.title)}" required></label><label class="field"><span>Adresse</span><div class="sup-slug"><small>${esc(statusUrl('').replace(/=$/, '='))}</small><input class="input" name="slug" value="${esc(e.slug)}" pattern="[a-z0-9-]{3,40}" required></div></label></div>
      <label class="field"><span>Message d’accueil (facultatif)</span><textarea class="input" name="intro" rows="2" placeholder="Ex. : Suivez ici l’état de nos services en temps réel.">${esc(e.intro || '')}</textarea></label>
      <div class="field"><span>Services affichés</span><div class="sup-checks sup-checks-col">${mons.map((m) => `<label class="sup-check"><input type="checkbox" name="m" value="${esc(m.id)}" ${(e.monitor_ids || []).includes(m.id) ? 'checked' : ''}><span>${esc(m.name || m.url)}</span><small>${esc(m.kind && m.kind !== 'http' ? m.kind.toUpperCase() : (m.url || '').replace(/^https?:\/\//, ''))}</small></label>`).join('')}</div></div>
      <label class="tog-row"><span class="tog-text"><span>Afficher les incidents</span><small>Incidents en cours et des 90 derniers jours, avec leur durée.</small></span><input type="checkbox" name="show_incidents" ${e.show_incidents !== false ? 'checked' : ''}><span class="tog" aria-hidden="true"></span></label>
      <label class="tog-row"><span class="tog-text"><span>Publier</span><small>Sinon, la page reste un brouillon visible seulement par vous.</small></span><input type="checkbox" name="published" ${e.published !== false ? 'checked' : ''}><span class="tog" aria-hidden="true"></span></label>
      <div class="nxs-actions">${btn(e.id ? 'Enregistrer' : 'Créer la page', 'type="submit"', { ic: 'check', cls: 'small primary' })}${e.id ? btn('Nouvelle page', 'data-st-new', { ic: 'plus' }) : ''}</div>
    </form>` : `<p class="sup-note">${icon('cloud', 13)} Une page de statut montre les sites surveillés <b>24 h/24 par les serveurs NEXORA</b>. Ouvrez la fiche d’un site et activez « Surveiller aussi 24 h/24 », puis revenez ici.</p>`, { sub: 'Vos visiteurs peuvent s’abonner aux incidents par e-mail' })}
    ${card('Vos pages', list, { sub: `Équipe « ${esc(acc.orgName)} »` })}
  </div>`;
}

function bindLater(ctx) { ctx.afterRender = () => { const b = ctx.view.querySelector('[data-st-login]'); if (b) b.onclick = () => { const x = document.getElementById('btnAccount'); if (x) x.click(); }; }; return ''; }

function bind(ctx, e) {
  const v = ctx.view;
  const f = v.querySelector('[data-st-form]');
  if (f) {
    const t = f.elements.title; const sl = f.elements.slug;
    let touched = Boolean(e.id);
    sl.oninput = () => { touched = true; };
    t.oninput = () => { if (!touched) sl.value = slugify(t.value); };
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const fd = new FormData(f);
      try {
        const saved = await saveStatusPage({ id: e.id, title: fd.get('title'), slug: slugify(fd.get('slug')), intro: fd.get('intro'), monitor_ids: fd.getAll('m'), published: Boolean(fd.get('published')), show_incidents: Boolean(fd.get('show_incidents')) });
        ctx.state.statusEdit = saved;
        toast(saved.published ? 'Page publiée.' : 'Brouillon enregistré.', { action: 'Ouvrir', onAction: () => call('shell:external', statusUrl(saved.slug)) });
        ctx.show(true);
      } catch (err) { toast(err.message, { kind: 'bad' }); }
    };
  }
  const nw = v.querySelector('[data-st-new]');
  if (nw) nw.onclick = () => { ctx.state.statusEdit = null; ctx.show(true); };
  for (const b of v.querySelectorAll('[data-st-edit]')) b.onclick = () => { ctx.state.statusEdit = ctx.state.statusData.list.find((p) => p.id === b.dataset.stEdit); ctx.show(true); };
  for (const b of v.querySelectorAll('[data-st-del]')) b.onclick = async () => { try { await deleteStatusPage(b.dataset.stDel); ctx.state.statusEdit = undefined; toast('Page supprimée.'); ctx.show(true); } catch (err) { toast(err.message, { kind: 'bad' }); } };
  for (const b of v.querySelectorAll('[data-st-copy]')) b.onclick = () => call('clipboard:write', b.dataset.stCopy).then(() => toast('Lien copié.')).catch(() => {});
}
