// NEXORA #032 : fenêtre « Mon compte NEXORA » redessinée : rubriques à gauche, accueil « Bonjour », onglet Profil
// en carte de profil (bannière aux couleurs de l'accent, photo, chiffres clés) et cartes d'informations.
// Les onglets, formulaires et actions restent ceux de chunk-EOM7FQDL.js : on ne fournit que le gabarit de la
// fenêtre et celui de l'onglet Profil, avec les mêmes attributs (data-tab, data-form, data-avatar, data-tab-back),
// si bien que l'enregistrement, la photo, l'e-mail et la navigation fonctionnent sans autre changement.
// NEXORA #047 : bannière de profil personnalisée (image choisie ou déposée, recadrée au format large), rangée
// dans le même dossier personnel que la photo ; son adresse est gardée dans les données du compte (banner_url).
// NEXORA #120 : fuseau horaire au choix (liste de tous les fuseaux, celui de l'ordinateur proposé) ; mot de passe
// actuel exigé pour changer le mot de passe ou l'adresse e-mail (vérifié par une vraie connexion avant l'envoi),
// nouveau mot de passe trop faible refusé ; onglet Sécurité fourni ici (crochet security de chunk-EOM7FQDL.js).
import { b as sb, c as errText, e as cloud, u as avatar } from '../../dist/chunks/chunk-EZKHFSAB.js';
import { ico, esc, toast } from '../core.js';
import { FALLBACK, money } from '../offres/catalog.js';
import { score, passwordProblem, emailProblem } from '../auth/motdepasse.js';

// NEXORA #037 : offres Gratuit, Standard et Pro (Équipe et Entreprise : anciennes offres, passées à Pro).
const PLANS = { free: 'Gratuit', standard: 'Pro', pro: 'Pro', team: 'Pro', enterprise: 'Pro' };
const MEMBER = { owner: 'Propriétaire', admin: 'Administrateur', editor: 'Éditeur', viewer: 'Lecteur' };
export const planName = (p) => PLANS[p] || p || PLANS.free;
const platformRole = (r) => (r === 'superadmin' ? 'Super-administrateur' : r === 'admin' ? 'Administrateur' : 'Utilisateur');
const longDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');
const count = (n) => new Intl.NumberFormat('fr-FR', { notation: n >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);

function firstName(p, email) {
  const name = String((p && p.full_name) || '').trim();
  return name ? name.split(/\s+/)[0] : String(email || '').split('@')[0];
}

// ------------------------------------------------------------------ bannière (#047)
const BANNER_W = 1500;
const BANNER_RATIO = 3;
const BANNER_MAX = 15 * 1024 * 1024;
const BUCKET = 'avatars';
// Seules les images des serveurs NEXORA sont affichées (politique de sécurité de la page, adresse sans guillemets).
const SAFE_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/[\w\-./%]+$/i;

export function bannerUrl() {
  const meta = cloud.user && cloud.user.user_metadata;
  const url = meta && typeof meta.banner_url === 'string' ? meta.banner_url : '';
  return SAFE_URL.test(url) ? url : '';
}

// Chemin du fichier dans le dossier de l'utilisateur, pour effacer l'ancienne bannière (jamais celle d'un autre).
function bannerPath(url) {
  const id = cloud.user && cloud.user.id;
  const part = String(url || '').split(`/object/public/${BUCKET}/`)[1];
  const path = part ? decodeURIComponent(part.split('?')[0]) : '';
  return id && path.startsWith(`${id}/banner-`) ? path : '';
}

function coverInner(url) {
  const label = url ? 'Changer la bannière' : 'Ajouter une bannière';
  return `${url ? `<img class="nxc-cover-img" src="${esc(url)}" alt="" draggable="false">` : ''}
      <div class="nxc-cover-acts">
        <button type="button" class="nxc-cover-btn" data-nx-banner-pick title="Image au format large, 1500 × 500 px conseillé">${ico('image', 14)}<span>${label}</span></button>
        ${url ? `<button type="button" class="nxc-cover-btn icon" data-nx-banner-del title="Retirer la bannière" aria-label="Retirer la bannière">${ico('trash', 14)}</button>` : ''}
      </div>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-nx-banner hidden>`;
}

// Mini carte du menu du compte : la même bannière, par une variable CSS (adresse déjà vérifiée).
export function applyBanner() {
  const url = bannerUrl();
  const root = document.documentElement;
  if (url) {
    root.style.setProperty('--nxc-banner', `url("${url}")`);
    root.dataset.nxBanner = '';
  } else {
    root.style.removeProperty('--nxc-banner');
    delete root.dataset.nxBanner;
  }
}

function refreshCover() {
  applyBanner();
  const cover = document.querySelector('#sheet [data-nx-cover]');
  if (!cover) return;
  const url = bannerUrl();
  cover.classList.toggle('has-img', !!url);
  cover.innerHTML = coverInner(url);
}

// Message affiché : les erreurs connues sont traduites par errText ; une erreur technique reste dans la console.
class BannerError extends Error {}
function bannerMessage(e) {
  if (e instanceof BannerError) return e.message;
  const raw = String((e && (e.message || e.error_description || e.msg)) || e || '').replace(/^Error:\s*/, '');
  const msg = errText(e);
  console.warn('[NEXORA] bannière', e);
  return msg && msg !== raw ? msg : 'La bannière n’a pas pu être enregistrée. Réessayez dans un instant.';
}

// Recadrage au centre au format 3:1, 1500 px de large au plus, en JPEG : fichier léger et affichage net.
async function bannerBlob(file) {
  if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) throw new BannerError('Choisissez une image PNG, JPG, WebP ou GIF.');
  if (file.size > BANNER_MAX) throw new BannerError('Image trop lourde : 15 Mo maximum.');
  let img;
  try {
    img = await createImageBitmap(file);
  } catch {
    throw new BannerError('Cette image ne peut pas être lue. Essayez un autre fichier.');
  }
  const iw = img.width;
  const ih = img.height;
  const cw = iw / ih > BANNER_RATIO ? ih * BANNER_RATIO : iw;
  const ch = cw / BANNER_RATIO;
  const ow = Math.round(Math.min(BANNER_W, cw));
  const oh = Math.round(ow / BANNER_RATIO);
  const canvas = document.createElement('canvas');
  canvas.width = ow;
  canvas.height = oh;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ow, oh);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (iw - cw) / 2, (ih - ch) / 2, cw, ch, 0, 0, ow, oh);
  if (img.close) img.close();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
  if (!blob) throw new BannerError('Cette image ne peut pas être préparée. Essayez un autre fichier.');
  return blob;
}

async function storeBanner(url) {
  const { data, error } = await sb.auth.updateUser({ data: { banner_url: url } });
  if (error) throw error;
  if (data && data.user) cloud.user = data.user;
  else if (cloud.user) cloud.user.user_metadata = { ...(cloud.user.user_metadata || {}), banner_url: url };
}

function dropOld(path) {
  if (path) sb.storage.from(BUCKET).remove([path]).catch(() => {});
}

let bannerBusy = false;
async function withBusy(cover, job) {
  if (bannerBusy || !cloud.user) return;
  bannerBusy = true;
  cover && cover.classList.add('is-busy');
  cover && cover.setAttribute('aria-busy', 'true');
  try {
    await job();
  } catch (e) {
    toast(bannerMessage(e), { kind: 'bad' });
  } finally {
    bannerBusy = false;
    const live = document.querySelector('#sheet [data-nx-cover]');
    if (live) {
      live.classList.remove('is-busy');
      live.removeAttribute('aria-busy');
    }
    refreshCover();
  }
}

function uploadBanner(file, cover) {
  return withBusy(cover, async () => {
    const blob = await bannerBlob(file);
    const path = `${cloud.user.id}/banner-${Date.now()}.jpg`;
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (error) throw error;
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    const old = bannerPath(bannerUrl());
    await storeBanner(data.publicUrl);
    dropOld(old);
    toast('Bannière mise à jour.');
  });
}

function removeBanner(cover) {
  return withBusy(cover, async () => {
    const old = bannerPath(bannerUrl());
    await storeBanner(null);
    dropOld(old);
    toast('Bannière retirée.');
  });
}

// Écouteurs posés une fois sur le document : la fenêtre du compte est redessinée à chaque onglet.
let wired = false;
export function wireBanner() {
  if (wired) return;
  wired = true;
  applyBanner();
  for (const ev of ['auth', 'account']) cloud.on(ev, applyBanner);
  document.addEventListener('click', (e) => {
    const pick = e.target.closest('#sheet [data-nx-banner-pick]');
    if (pick) {
      const input = pick.closest('[data-nx-cover]').querySelector('[data-nx-banner]');
      if (input && !bannerBusy) input.click();
      return;
    }
    const del = e.target.closest('#sheet [data-nx-banner-del]');
    if (del) removeBanner(del.closest('[data-nx-cover]'));
    // Onglets en bande (fenêtre étroite) : l'onglet ouvert reste visible.
    if (e.target.closest('#sheet .nxc-nav [data-tab]')) requestAnimationFrame(showActiveTab);
  });
  document.addEventListener('change', (e) => {
    const input = e.target.closest && e.target.closest('#sheet [data-nx-banner]');
    if (!input || !input.files || !input.files[0]) return;
    const file = input.files[0];
    input.value = '';
    uploadBanner(file, input.closest('[data-nx-cover]'));
  });
  const coverOf = (e) => e.target.closest && e.target.closest('#sheet [data-nx-cover]');
  const hasFile = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  document.addEventListener('dragover', (e) => {
    const cover = coverOf(e);
    if (!cover || !hasFile(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    cover.classList.add('is-drop');
  });
  document.addEventListener('dragleave', (e) => {
    const cover = coverOf(e);
    if (cover && !cover.contains(e.relatedTarget)) cover.classList.remove('is-drop');
  });
  document.addEventListener('drop', (e) => {
    const cover = coverOf(e);
    if (!cover || !hasFile(e)) return;
    e.preventDefault();
    cover.classList.remove('is-drop');
    const file = e.dataTransfer.files[0];
    if (file) uploadBanner(file, cover);
  });
}

function showActiveTab() {
  const on = document.querySelector('#sheet .nxc-nav button.on');
  const nav = on && on.closest('.nxc-side');
  if (!on || !nav || nav.scrollWidth <= nav.clientWidth) return;
  const r = on.getBoundingClientRect();
  const n = nav.getBoundingClientRect();
  if (r.left < n.left + 8 || r.right > n.right - 8) nav.scrollLeft += r.left - n.left - (n.width - r.width) / 2;
}

// Gabarit de la fenêtre (appelé par openAccount, chunk-EOM7FQDL.js) : tab = onglet ouvert, tabs = [id, nom, icône].
export function sheet(tab, tabs) {
  wireBanner();
  requestAnimationFrame(() => requestAnimationFrame(showActiveTab));
  const p = cloud.profile || {};
  const email = cloud.user ? cloud.user.email : '';
  const org = cloud.org;
  const free = !cloud.plan || cloud.plan === 'free';
  const nav = tabs.map(([id, label, icon]) => `<button type="button" class="${id === tab ? 'on' : ''}" data-tab="${id}"><span class="nxc-nav-ic">${ico(icon, 15)}</span><span class="nxc-nav-lb">${esc(label)}</span>${id === 'notifications' && cloud.unread ? `<b class="nx-count">${cloud.unread > 99 ? '99+' : cloud.unread}</b>` : ''}</button>`).join('');
  const promo = free
    ? `<div class="nxc-promo">
        <span class="nxc-promo-ic">${ico('star', 18)}</span>
        <b>Passez à Pro</b>
        <small>Dev Lab complet, jusqu’à ${FALLBACK.pro.limits.apps} applications, Studio et NEX-DESIGN complets, pour ${esc(money(FALLBACK.pro.price_month_cents))} par mois.</small>
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

// ------------------------------------------------------------------ fuseau horaire (#120)
// Tous les fuseaux reconnus par le moteur (Intl), groupés par région, triés par décalage puis par ville ; celui de
// l'ordinateur est choisi tant que le compte n'en a pas.
const REGIONS = { Africa: 'Afrique', America: 'Amérique', Antarctica: 'Antarctique', Arctic: 'Arctique', Asia: 'Asie', Atlantic: 'Atlantique', Australia: 'Australie', Europe: 'Europe', Indian: 'Océan Indien', Pacific: 'Pacifique' };
export function systemZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}
function zoneOffset(zone, now) {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(now).find((x) => x.type === 'timeZoneName');
    const v = part ? part.value.replace(/^GMT/, '') : '';
    return /^[+-]\d{2}:\d{2}$/.test(v) ? v : '+00:00';
  } catch { return '+00:00'; }
}
const offsetMinutes = (o) => { const m = /^([+-])(\d{2}):(\d{2})$/.exec(o); return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0; };
let ZONES = null;
function zones() {
  if (ZONES) return ZONES;
  let list = [];
  try { list = Intl.supportedValuesOf('timeZone'); } catch { list = []; }
  if (!list.includes('UTC')) list = [...list, 'UTC'];
  const now = new Date();
  ZONES = list.map((z) => {
    const [region, ...rest] = z.split('/');
    const off = zoneOffset(z, now);
    return { z, region: rest.length ? (REGIONS[region] || region) : 'Autres', city: (rest.length ? rest.join(' / ') : z).replace(/_/g, ' '), off, mins: offsetMinutes(off) };
  });
  return ZONES;
}
const zoneLabel = (x) => `(UTC${x.off === '+00:00' ? '' : x.off}) ${x.city}`;
function zoneField(current) {
  const cur = current || systemZone();
  const all = zones();
  const groups = new Map();
  for (const x of all) { if (!groups.has(x.region)) groups.set(x.region, []); groups.get(x.region).push(x); }
  const names = [...groups.keys()].sort((a, b) => (a === 'Autres') - (b === 'Autres') || a.localeCompare(b, 'fr'));
  let options = all.some((x) => x.z === cur) ? '' : `<option value="${esc(cur)}" selected>${esc(cur)}</option>`;
  for (const name of names) {
    const items = groups.get(name).sort((a, b) => a.mins - b.mins || a.city.localeCompare(b.city, 'fr'));
    options += `<optgroup label="${esc(name)}">${items.map((x) => `<option value="${esc(x.z)}"${x.z === cur ? ' selected' : ''}>${esc(zoneLabel(x))}</option>`).join('')}</optgroup>`;
  }
  const sys = systemZone();
  const sysItem = all.find((x) => x.z === sys);
  const hint = sys && sys !== cur
    ? `<small class="nxc-hint">Fuseau de cet ordinateur : ${esc(sysItem ? zoneLabel(sysItem) : sys)} · <button type="button" class="link-btn" data-nxc-tz="${esc(sys)}">L’utiliser</button></small>`
    : '<small class="nxc-hint">Fuseau de cet ordinateur.</small>';
  return `<label class="nx-field"><span>Fuseau horaire</span><select class="input" name="timezone">${options}</select>${hint}</label>`;
}

// ------------------------------------------------------------------ sécurité (#120)
// Onglet Sécurité (appelé par l'onglet « security » de chunk-EOM7FQDL.js) : mêmes formulaires et mêmes actions
// (data-form="password", data-acc-act, data-del-confirm), avec le mot de passe actuel et la jauge de robustesse.
export function security(devices = [], { when = (d) => d } = {}) {
  const email = cloud.user ? cloud.user.email : '';
  const list = (devices || []).map((n) => `<div class="nx-li">${ico(n.platform === 'web' ? 'globe' : 'laptop', 16)}<div><b>${esc(n.platform === 'web' ? 'Navigateur' : 'Application Windows')}${n.name ? ` · ${esc(n.name)}` : ''}</b><small>Dernière activité ${esc(when(n.last_seen_at))}${n.app_version ? ` · v${esc(n.app_version)}` : ''}</small></div></div>`).join('') || '<p class="nx-muted">Aucun appareil.</p>';
  return `
  <form class="nxc-card nx-form nxc-pass" data-form="password">
    <div class="nxc-card-head"><span class="nxc-card-ic">${ico('lock', 15)}</span><div><h3>Mot de passe</h3><p>Confirmez d’abord votre mot de passe actuel. Le nouveau doit compter au moins 8 caractères et ne pas être trop simple.</p></div></div>
    <input type="email" name="username" value="${esc(email)}" autocomplete="username" hidden>
    <div class="nx-grid2 nxc-pass-grid">
      <label class="nx-field nxc-span"><span>Mot de passe actuel</span><input class="input" type="password" name="current_password" required autocomplete="current-password"></label>
      <label class="nx-field"><span>Nouveau mot de passe</span><input class="input" type="password" name="password" minlength="8" maxlength="72" required autocomplete="new-password">
        <span class="nxl-meter nxc-meter" data-nxc-meter data-score="0"><i></i><i></i><i></i><i></i><em>8 caractères minimum</em></span></label>
      <label class="nx-field"><span>Confirmation</span><input class="input" type="password" name="password2" minlength="8" maxlength="72" required autocomplete="new-password"></label>
    </div>
    <p class="nxc-hint">${ico('info', 13)}<span>Mot de passe oublié ? Déconnectez-vous, puis choisissez « Mot de passe oublié ? » sur l’écran de connexion.</span></p>
    <div class="nx-actions"><button class="btn primary">Changer le mot de passe</button></div>
  </form>
  <section class="nxc-card">
    <div class="nxc-card-head"><span class="nxc-card-ic">${ico('laptop', 15)}</span><div><h3>Appareils connectés</h3><p>Ordinateurs et navigateurs où votre compte est ouvert.</p></div></div>
    <div class="nx-list">${list}</div>
    <div class="nx-actions"><button type="button" class="btn" data-acc-act="logout-all">${ico('lock', 13)}<span>Se déconnecter partout</span></button></div>
  </section>
  <section class="nxc-card nx-danger">
    <h3>Zone sensible</h3>
    <p>Supprimer votre compte efface votre profil, votre espace personnel et ses contenus. Les équipes partagées sont confiées à un autre membre.</p>
    <div class="nx-inline"><input class="input" data-del-confirm placeholder="Tapez SUPPRIMER pour confirmer" aria-label="Tapez SUPPRIMER pour confirmer"><button type="button" class="btn danger" data-acc-act="delete-account">Supprimer mon compte</button></div>
  </section>`;
}

// Vrai contrôle du mot de passe actuel : une connexion au même compte (la session reste celle de cet utilisateur).
async function verifyPassword(password) {
  const email = cloud.user && cloud.user.email;
  if (!email) throw new Error('Session expirée : reconnectez-vous.');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (!error) return;
  if (error.status === 400 || /invalid (login )?credentials|invalid_credentials/i.test(error.message || '')) throw new Error('Mot de passe actuel incorrect.');
  throw new Error(errText(error));
}

const LEVELS = ['8 caractères minimum', 'Trop faible', 'Correct', 'Bon', 'Excellent'];

// Changement du mot de passe ou de l'adresse : refusé tant que le mot de passe actuel n'est pas confirmé ou que le
// nouveau est trop faible ; une fois vérifié, le formulaire repart vers son traitement d'origine (requestSubmit).
// Écouteur en phase de capture : il passe avant celui de la fenêtre « Mon compte » (chunk-EOM7FQDL.js).
let securityWired = false;
export function wireSecurity() {
  if (securityWired) return;
  securityWired = true;
  document.addEventListener('submit', async (e) => {
    const form = e.target && e.target.closest && e.target.closest('form[data-form]');
    if (!form || !['password', 'email'].includes(form.dataset.form) || !form.closest('#nxAccBody')) return;
    if (form.dataset.nxcVerified === '1') { delete form.dataset.nxcVerified; return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (form.dataset.nxcBusy) return;
    const val = (n) => (form.querySelector(`[name="${n}"]`) || {}).value || '';
    const fail = (msg, field) => {
      toast(msg, { kind: 'bad' });
      const el = field && form.querySelector(`[name="${field}"]`);
      if (el) { el.setAttribute('aria-invalid', 'true'); el.focus(); }
    };
    const email = cloud.user ? cloud.user.email : '';
    const current = val('current_password');
    if (form.dataset.form === 'password') {
      const pw = val('password');
      const problem = passwordProblem(pw, { email, name: cloud.profile && cloud.profile.full_name });
      if (problem) return fail(problem, 'password');
      if (pw !== val('password2')) return fail('Les deux mots de passe ne correspondent pas.', 'password2');
      if (current && pw === current) return fail('Le nouveau mot de passe doit être différent de l’actuel.', 'password');
    } else {
      const next = val('email').trim();
      const problem = emailProblem(next);
      if (problem) return fail(problem, 'email');
      if (next.toLowerCase() === String(email).toLowerCase()) return fail('C’est déjà l’adresse de votre compte.', 'email');
    }
    if (!current) return fail('Saisissez votre mot de passe actuel pour confirmer.', 'current_password');
    const btn = form.querySelector('button:not([type=button])');
    form.dataset.nxcBusy = '1';
    if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
    try {
      await verifyPassword(current);
    } catch (err) {
      return fail(err.message, 'current_password');
    } finally {
      delete form.dataset.nxcBusy;
      if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
    }
    const cur = form.querySelector('[name="current_password"]');
    form.dataset.nxcVerified = '1';
    form.requestSubmit();
    if (cur) cur.value = '';
  }, true);
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || !t.closest || !t.closest('#nxAccBody')) return;
    if (t.hasAttribute('aria-invalid')) t.removeAttribute('aria-invalid');
    const meter = t.name === 'password' && t.closest('form[data-form="password"]') && t.closest('form').querySelector('[data-nxc-meter]');
    if (!meter) return;
    const s = score(t.value);
    meter.dataset.score = String(s);
    const left = 8 - t.value.length;
    meter.querySelector('em').textContent = t.value && left > 0 ? `Encore ${left} caractère${left > 1 ? 's' : ''}` : LEVELS[s];
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-nxc-tz]');
    if (!b) return;
    const sel = b.closest('form') && b.closest('form').querySelector('select[name="timezone"]');
    if (sel) { sel.value = b.dataset.nxcTz; sel.dispatchEvent(new Event('change', { bubbles: true })); b.closest('.nxc-hint').textContent = 'Fuseau de cet ordinateur : enregistrez pour le garder.'; }
  });
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
  const banner = bannerUrl();
  return `
  <article class="nxc-card nxc-hero">
    <div class="nxc-cover${banner ? ' has-img' : ''}" data-nx-cover>${coverInner(banner)}</div>
    <div class="nxc-id" data-audit-recouvre>
      <label class="nxc-av" for="nxcAvatar" title="Changer la photo">${avatar(p.id ? p : { ...p, email, id: cloud.user && cloud.user.id }, 96)}<span class="nxc-av-edit">${ico('camera', 14)}</span></label>
      <div class="nxc-who">
        <h3>${esc(p.full_name || email)}</h3>
        <p>${esc(job || email)}</p>
      </div>
      <div class="nxc-acts">
        <label class="nxc-pill" for="nxcAvatar" title="Changer la photo">${ico('upload', 14)}<span>Changer la photo</span></label>
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
      <div class="nxc-card-head"><span class="nxc-card-ic">${ico('user', 15)}</span><div><h3>Informations personnelles</h3><p>Votre nom et votre photo sont visibles par les membres de vos équipes.</p></div></div>
      <div class="nx-grid2">
        <label class="nx-field"><span>Nom complet</span><input class="input" name="full_name" value="${esc(p.full_name || '')}" maxlength="80" autocomplete="name"></label>
        <label class="nx-field"><span>Entreprise</span><input class="input" name="company" value="${esc(p.company || '')}" maxlength="80" autocomplete="organization"></label>
        <label class="nx-field"><span>Fonction</span><input class="input" name="job_title" value="${esc(p.job_title || '')}" maxlength="80" autocomplete="organization-title"></label>
        ${zoneField(p.timezone)}
      </div>
      <div class="nx-actions"><button class="btn primary">Enregistrer</button></div>
    </form>
    <div class="nxc-stack">
      <form class="nxc-card nx-form" data-form="email">
        <div class="nxc-card-head"><span class="nxc-card-ic">${ico('mail', 15)}</span><div><h3>Adresse e-mail</h3><p>Un lien de confirmation est envoyé à la nouvelle adresse. Confirmez avec votre mot de passe.</p></div></div>
        <label class="nx-field"><span>Adresse e-mail</span><input class="input" name="email" type="email" value="${esc(email)}" required autocomplete="email"></label>
        <label class="nx-field"><span>Mot de passe actuel</span><input class="input" name="current_password" type="password" required autocomplete="current-password"></label>
        <div class="nx-actions"><button class="btn">Changer l’adresse</button></div>
      </form>
      <div class="nxc-card">
        <div class="nxc-card-head"><span class="nxc-card-ic">${ico('info', 15)}</span><div><h3>Votre compte</h3></div></div>
        <dl class="nxc-kv">
          <dt>Compte créé</dt><dd>${esc(longDate(p.created_at))}</dd>
          <dt>Rôle sur la plateforme</dt><dd>${esc(platformRole(p.app_role))}</dd>
          ${org ? `<dt>Espace actif</dt><dd>${esc(org.name)}${cloud.role ? ` · ${esc(MEMBER[cloud.role] || cloud.role)}` : ''}</dd>` : ''}
        </dl>
      </div>
    </div>
  </div>`;
}
