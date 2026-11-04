// NEXORA #032 : fenêtre « Mon compte NEXORA » redessinée : rubriques à gauche, accueil « Bonjour », onglet Profil
// en carte de profil (bannière aux couleurs de l'accent, photo, chiffres clés) et cartes d'informations.
// Les onglets, formulaires et actions restent ceux de chunk-EOM7FQDL.js : on ne fournit que le gabarit de la
// fenêtre et celui de l'onglet Profil, avec les mêmes attributs (data-tab, data-form, data-avatar, data-tab-back),
// si bien que l'enregistrement, la photo, l'e-mail et la navigation fonctionnent sans autre changement.
import { b as sb, e as cloud, u as avatar } from '../../dist/chunks/chunk-EZKHFSAB.js';
import { ico, esc } from '../core.js';

// NEXORA #037 : offres Gratuit, Standard et Pro (Équipe et Entreprise : anciennes offres, passées à Pro).
const PLANS = { free: 'Gratuit', standard: 'Standard', pro: 'Pro', team: 'Équipe', enterprise: 'Entreprise' };
const MEMBER = { owner: 'Propriétaire', admin: 'Administrateur', editor: 'Éditeur', viewer: 'Lecteur' };
export const planName = (p) => PLANS[p] || p || PLANS.free;
const platformRole = (r) => (r === 'superadmin' ? 'Super-administrateur' : r === 'admin' ? 'Administrateur' : 'Utilisateur');
const longDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');
const count = (n) => new Intl.NumberFormat('fr-FR', { notation: n >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);

function firstName(p, email) {
  const name = String((p && p.full_name) || '').trim();
  return name ? name.split(/\s+/)[0] : String(email || '').split('@')[0];
}

// Gabarit de la fenêtre (appelé par openAccount, chunk-EOM7FQDL.js) : tab = onglet ouvert, tabs = [id, nom, icône].
export function sheet(tab, tabs) {
  const p = cloud.profile || {};
  const email = cloud.user ? cloud.user.email : '';
  const org = cloud.org;
  const free = !cloud.plan || cloud.plan === 'free';
  const nav = tabs.map(([id, label, icon]) => `<button type="button" class="${id === tab ? 'on' : ''}" data-tab="${id}"><span class="nxc-nav-ic">${ico(icon, 15)}</span><span class="nxc-nav-lb">${esc(label)}</span>${id === 'notifications' && cloud.unread ? `<b class="nx-count">${cloud.unread > 99 ? '99+' : cloud.unread}</b>` : ''}</button>`).join('');
  const promo = free
    ? `<div class="nxc-promo">
        <span class="nxc-promo-ic">${ico('star', 18)}</span>
        <b>Passe à Standard</b>
        <small>APK, import de code, Crawler, Dev Lab et applications sans limite d’essai, dès 10 $ par mois.</small>
        <button type="button" class="nxc-promo-btn" data-tab-back="plan">Voir les offres</button>
      </div>`
    : `<button type="button" class="nxc-plan-card" data-tab-back="plan"><span class="nxc-nav-ic">${ico('star', 15)}</span><span><b>Offre ${esc(planName(cloud.plan))}</b><small>${esc(org ? org.name : '')}</small></span>${ico('chevronRight', 13)}</button>`;
  return `
  <div class="nxc">
    <aside class="nxc-side">
      <div class="nxc-brand"><span class="nxc-brand-ic">${ico('cloud', 18)}</span><div><b>Mon compte</b><small>NEXORA Cloud</small></div></div>
      <nav class="nxc-nav" aria-label="Rubriques du compte">${nav}</nav>
      ${promo}
    </aside>
    <section class="nxc-main">
      <header class="sheet-head nxc-head">
        <div><small class="nxc-kicker">Mon compte NEXORA</small><h2>Bonjour, ${esc(firstName(p, email))}</h2><p>${esc(email)}${org ? ` · ${esc(org.name)}` : ''}</p></div>
      </header>
      <div class="nx-acc-body nxc-body" id="nxAccBody"><div class="nx-loading"><span class="spinner"></span></div></div>
    </section>
  </div>
  <div class="sheet-foot"><span class="nx-muted small nxc-secure">${ico('lock', 12)} Connexion sécurisée NEXORA Cloud</span><span class="grow"></span><button class="btn" data-sheet="close">Fermer</button></div>`;
}

// Chiffres clés de l'espace actif : org_quota renvoie { plan, limits, usage } ; on accepte aussi { projets: { used } }.
async function usage() {
  try {
    const { data } = await sb.rpc('org_quota', { org: cloud.orgId });
    return (data && (data.usage || data)) || {};
  } catch {
    return {};
  }
}
function used(u, key) {
  const v = u[key];
  const n = Number(v && typeof v === 'object' ? v.used : v);
  return v == null || !Number.isFinite(n) ? null : n;
}

// Onglet Profil (appelé par l'onglet « profile » de chunk-EOM7FQDL.js).
export async function profile() {
  const p = cloud.profile || {};
  const email = cloud.user ? cloud.user.email : '';
  const org = cloud.org;
  const u = await usage();
  const teams = (cloud.orgs || []).length;
  const stats = [
    ['folder', used(u, 'projects'), 'Projets'],
    ['palette', used(u, 'designs'), 'Designs'],
    ['group', teams, teams > 1 ? 'Équipes' : 'Équipe'],
    ['sync', used(u, 'monitors'), 'Sites surveillés'],
  ];
  const job = [p.job_title, p.company].map((s) => String(s || '').trim()).filter(Boolean).join(' · ');
  const tags = [`<span class="nxc-tag accent">${ico('star', 11)}Offre ${esc(planName(cloud.plan))}</span>`];
  if (p.app_role === 'admin' || p.app_role === 'superadmin') tags.push(`<span class="nxc-tag">${ico('shield', 11)}${esc(platformRole(p.app_role))}</span>`);
  if (org && !org.personal && cloud.role) tags.push(`<span class="nxc-tag">${ico('group', 11)}${esc(MEMBER[cloud.role] || cloud.role)}</span>`);
  if (p.timezone) tags.push(`<span class="nxc-tag">${ico('globe', 11)}${esc(p.timezone)}</span>`);
  return `
  <article class="nxc-card nxc-hero">
    <div class="nxc-cover" aria-hidden="true"></div>
    <div class="nxc-id">
      <label class="nxc-av" for="nxcAvatar" title="Changer la photo">${avatar(p.id ? p : { ...p, email, id: cloud.user && cloud.user.id }, 96)}<span class="nxc-av-edit">${ico('camera', 14)}</span></label>
      <div class="nxc-who">
        <h3>${esc(p.full_name || email)}</h3>
        <p>${esc(job || email)}</p>
      </div>
      <div class="nxc-acts">
        <label class="nxc-pill" for="nxcAvatar">${ico('upload', 14)}<span>Changer la photo</span></label>
        <button type="button" class="nxc-round" data-tab-back="notifications" title="Notifications" aria-label="Notifications">${ico('bell', 16)}${cloud.unread ? '<i></i>' : ''}</button>
      </div>
      <input type="file" id="nxcAvatar" accept="image/*" data-avatar hidden>
    </div>
    <div class="nxc-tags">${tags.join('')}</div>
    <div class="nxc-stats">${stats.map(([icon, value, label]) => `<div class="nxc-stat"><span>${ico(icon, 17)}<b>${value == null ? '—' : count(value)}</b></span><small>${label}</small></div>`).join('')}</div>
    <button type="button" class="nxc-cta" data-tab-back="plan"><span class="nxc-cta-ic">${ico('nxArrowRight', 17)}</span><span>Voir mon offre et mon usage</span></button>
  </article>
  <div class="nxc-cols">
    <form class="nxc-card nx-form" data-form="profile">
      <div class="nxc-card-head"><span class="nxc-card-ic">${ico('user', 15)}</span><div><h3>Informations personnelles</h3><p>Ton nom et ta photo sont visibles par les membres de tes équipes.</p></div></div>
      <div class="nx-grid2">
        <label class="nx-field"><span>Nom complet</span><input class="input" name="full_name" value="${esc(p.full_name || '')}" maxlength="80" autocomplete="name"></label>
        <label class="nx-field"><span>Entreprise</span><input class="input" name="company" value="${esc(p.company || '')}" maxlength="80" autocomplete="organization"></label>
        <label class="nx-field"><span>Fonction</span><input class="input" name="job_title" value="${esc(p.job_title || '')}" maxlength="80" autocomplete="organization-title"></label>
        <label class="nx-field"><span>Fuseau horaire</span><input class="input" name="timezone" value="${esc(p.timezone || '')}" maxlength="60"></label>
      </div>
      <div class="nx-actions"><button class="btn primary">Enregistrer</button></div>
    </form>
    <div class="nxc-stack">
      <form class="nxc-card nx-form" data-form="email">
        <div class="nxc-card-head"><span class="nxc-card-ic">${ico('mail', 15)}</span><div><h3>Adresse e-mail</h3><p>Un lien de confirmation est envoyé à la nouvelle adresse.</p></div></div>
        <div class="nx-inline"><input class="input" name="email" type="email" value="${esc(email)}" required autocomplete="email" aria-label="Adresse e-mail"><button class="btn">Changer</button></div>
      </form>
      <div class="nxc-card">
        <div class="nxc-card-head"><span class="nxc-card-ic">${ico('info', 15)}</span><div><h3>Ton compte</h3></div></div>
        <dl class="nxc-kv">
          <dt>Compte créé</dt><dd>${esc(longDate(p.created_at))}</dd>
          <dt>Rôle sur la plateforme</dt><dd>${esc(platformRole(p.app_role))}</dd>
          ${org ? `<dt>Espace actif</dt><dd>${esc(org.name)}${cloud.role ? ` · ${esc(MEMBER[cloud.role] || cloud.role)}` : ''}</dd>` : ''}
        </dl>
      </div>
    </div>
  </div>`;
}
