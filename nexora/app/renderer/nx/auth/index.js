// NEXORA #034 : écrans de connexion et d'inscription modernisés (fenêtre « Connexion » du compte NEXORA, dans
// l'application Windows et la version web). Deux panneaux : la marque (logo, illustration, avantages) et le
// formulaire (onglets Connexion / Inscription, icônes dans les champs, affichage du mot de passe, jauge de
// robustesse, lien de connexion par e-mail).
// Branché sur chunk-EOM7FQDL.js par globalThis.__nxAuth : sheet(mode) donne la fenêtre, form(mode, fermé) chaque
// formulaire. Les formulaires gardent les attributs lus par le code d'origine (form[data-auth], noms des champs,
// .nx-submit, [data-msg], [data-auth-go], [data-auth-magic], [data-autofocus]) : connexion, inscription, lien
// magique, mot de passe oublié et réinitialisation restent ceux de NEXORA. Sans ce module, l'affichage d'origine
// s'applique.
import { a as ICONS } from '../../dist/chunks/chunk-S4I2LXHS.js';
import { ico } from '../core.js';
import { authArt } from './art.js';

const LOGO = new URL('../../logo.png', import.meta.url).href;

// Icônes manquantes, dans le style de NEXORA (trait 1,6, grille 24).
const MORE_ICONS = {
  nxlArrow: '<path d="M4.5 12h15"/><path d="m13.5 6 6 6-6 6"/>',
  nxlBack: '<path d="M19.5 12h-15"/><path d="m10.5 6-6 6 6 6"/>',
};

function loadCss() {
  if (document.querySelector('link[data-nx-auth]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./auth.css', import.meta.url).href;
  link.dataset.nxAuth = '';
  document.head.appendChild(link);
}

/* ---------------------------------------------------------------- champs */

function field({ label, name, type = 'text', auto, icon, placeholder = '', attrs = '', aside = '' }) {
  return `<label class="nx-field nxl-field"><span class="nxl-label">${label}${aside}</span>
    <span class="nxl-input">${ico(icon, 16)}<input class="input" name="${name}" type="${type}" autocomplete="${auto}" placeholder="${placeholder}" ${attrs}></span></label>`;
}

function password({ label, name, auto, placeholder = '', attrs = '', aside = '', meter = false }) {
  return `<label class="nx-field nxl-field"><span class="nxl-label">${label}${aside}</span>
    <span class="nxl-input">${ico('lock', 16)}<input class="input" name="${name}" type="password" autocomplete="${auto}" placeholder="${placeholder}" ${attrs}>
      <button type="button" class="nxl-eye" data-nxl-eye aria-label="Afficher le mot de passe" title="Afficher le mot de passe">${ico('eye', 16)}</button></span>
    ${meter ? '<span class="nxl-meter" data-nxl-meter data-score="0"><i></i><i></i><i></i><i></i><em>8 caractères minimum</em></span>' : ''}</label>`;
}

const tabs = (mode) => `<div class="nxl-tabs" role="tablist" aria-label="Compte NEXORA">
  <button type="button" role="tab" aria-selected="${mode === 'login'}" class="${mode === 'login' ? 'on' : ''}" data-auth-go="login">Connexion</button>
  <button type="button" role="tab" aria-selected="${mode === 'signup'}" class="${mode === 'signup' ? 'on' : ''}" data-auth-go="signup">Inscription</button>
</div>`;

const head = (title, text, badge = '') => `<div class="nxl-head">${badge ? `<span class="nxl-badge">${ico(badge, 20)}</span>` : ''}<h2>${title}</h2><p>${text}</p></div>`;
const submit = (label, disabled = false) => `<button class="btn primary wide nx-submit nxl-submit" ${disabled ? 'disabled' : ''}><span>${label}</span>${ico('nxlArrow', 16)}</button>`;
const msg = '<p class="nx-msg" data-msg role="status" aria-live="polite"></p>';
const EMAIL = { label: 'Adresse e-mail', name: 'email', type: 'email', auto: 'email', icon: 'mail', placeholder: 'toi@exemple.com' };

// Formulaire d'un mode (appelé à la place de Z(mode) de chunk-EOM7FQDL.js). closed : inscriptions fermées.
export function form(mode = 'login', closed = false) {
  if (mode === 'signup') {
    return `<form class="nx-auth nxl-form" data-auth="signup">
      ${tabs('signup')}
      ${head('Crée ton compte', 'Gratuit, sans carte bancaire. Tes projets, designs et scènes te suivent sur le web et sur Windows.')}
      ${closed ? '<p class="nx-alert">Les inscriptions sont momentanément fermées.</p>' : ''}
      ${field({ label: 'Nom complet', name: 'name', auto: 'name', icon: 'user', placeholder: 'Camille Laurent', attrs: 'required maxlength="80" data-autofocus' })}
      ${field({ ...EMAIL, attrs: 'required' })}
      ${password({ label: 'Mot de passe', name: 'password', auto: 'new-password', placeholder: '8 caractères minimum', attrs: 'minlength="8" required', meter: true })}
      <label class="check-row small nxl-terms"><input type="checkbox" name="terms" required><span class="box"></span><span>J’accepte les conditions d’utilisation et la politique de confidentialité de NEXORA.</span></label>
      ${submit('Créer mon compte', closed)}
      ${msg}
      <p class="nx-switch">Déjà inscrit ? <button type="button" class="link-btn" data-auth-go="login">Se connecter</button></p>
    </form>`;
  }
  if (mode === 'forgot') {
    return `<form class="nx-auth nxl-form" data-auth="forgot">
      <button type="button" class="nxl-back" data-auth-go="login">${ico('nxlBack', 15)}<span>Retour à la connexion</span></button>
      ${head('Mot de passe oublié ?', 'Indique ton adresse e-mail : tu recevras un lien pour choisir un nouveau mot de passe.', 'key')}
      ${field({ ...EMAIL, attrs: 'required data-autofocus' })}
      ${submit('Envoyer le lien')}
      ${msg}
    </form>`;
  }
  if (mode === 'reset') {
    return `<form class="nx-auth nxl-form" data-auth="reset">
      ${head('Choisis un nouveau mot de passe', 'Au moins 8 caractères. Mélange majuscules, chiffres et symboles pour plus de sécurité.', 'lock')}
      ${password({ label: 'Nouveau mot de passe', name: 'password', auto: 'new-password', placeholder: '8 caractères minimum', attrs: 'minlength="8" required data-autofocus', meter: true })}
      ${password({ label: 'Confirmation', name: 'password2', auto: 'new-password', placeholder: 'Le même mot de passe', attrs: 'minlength="8" required' })}
      ${submit('Enregistrer le mot de passe')}
      ${msg}
    </form>`;
  }
  return `<form class="nx-auth nxl-form" data-auth="login">
    ${tabs('login')}
    ${head('Bon retour sur NEXORA', 'Connecte-toi pour retrouver tes projets, designs et scènes 3D, sur Windows comme sur le web.')}
    ${field({ ...EMAIL, attrs: 'required data-autofocus' })}
    ${password({ label: 'Mot de passe', name: 'password', auto: 'current-password', placeholder: 'Ton mot de passe', attrs: 'required', aside: '<button type="button" class="link-btn nxl-forgot" data-auth-go="forgot">Mot de passe oublié ?</button>' })}
    ${submit('Se connecter')}
    <div class="nxl-or" role="separator"><span>ou</span></div>
    <button type="button" class="btn wide nxl-alt" data-auth-magic>${ico('mail', 15)}<span>Recevoir un lien de connexion par e-mail</span></button>
    ${msg}
    <p class="nx-switch">Pas encore de compte ? <button type="button" class="link-btn" data-auth-go="signup">Crée-le gratuitement</button></p>
  </form>`;
}

// Fenêtre (appelée à la place du gabarit de G(mode) de chunk-EOM7FQDL.js) : .nx-auth-sheet reçoit le formulaire.
export function sheet(mode = 'login') {
  const feats = [
    ['sync', 'Un seul compte', 'Réglages et projets synchronisés entre Windows et le web'],
    ['phone', 'Responsive Lab', 'Tes sites dans de vrais appareils, côte à côte'],
    ['cube', 'Studio 3D et NEX-DESIGN', 'Visuels, maquettes et vidéos de tes projets'],
    ['bell', 'Supervision', 'Tes sites surveillés, alertes par e-mail'],
  ];
  return `<div class="nxl">
    <aside class="nxl-brand">
      <div class="nxl-logo"><img src="${LOGO}" alt=""><b>NEXORA</b></div>
      <div class="nxl-art">${authArt('nxl-app')}</div>
      <div class="nxl-pitch">
        <h3>Crée, teste et publie tes sites et applications.</h3>
        <ul>${feats.map(([i, b, t]) => `<li><span class="nxl-ic">${ico(i, 15)}</span><span><b>${b}</b><small>${t}</small></span></li>`).join('')}</ul>
      </div>
      <p class="nxl-trust">${ico('lock', 12)}<span>Connexion chiffrée · données protégées</span></p>
    </aside>
    <section class="nxl-main">
      <button type="button" class="nxl-close" data-sheet="close" title="Fermer" aria-label="Fermer">${ico('close', 15)}</button>
      <div class="nx-auth-sheet nxl-body" data-mode="${mode}"></div>
    </section>
  </div>`;
}

/* ---------------------------------------------------------------- mot de passe : affichage et robustesse */

const LEVELS = ['8 caractères minimum', 'Faible', 'Correct', 'Bon', 'Excellent'];
export function score(pw) {
  if (!pw || pw.length < 8) return 0;
  let s = 1;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  else if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s += 0.5;
  return Math.min(4, Math.floor(s));
}

function bind() {
  document.addEventListener('click', (e) => {
    const eye = e.target.closest('[data-nxl-eye]');
    if (!eye) return;
    e.preventDefault();
    const input = eye.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    const label = show ? 'Masquer le mot de passe' : 'Afficher le mot de passe';
    eye.innerHTML = ico(show ? 'eyeOff' : 'eye', 16);
    eye.setAttribute('aria-label', label);
    eye.title = label;
    input.focus();
  });
  document.addEventListener('input', (e) => {
    const input = e.target.closest('.nxl-form input[name="password"]');
    const meter = input && input.closest('.nxl-field').querySelector('[data-nxl-meter]');
    if (!meter) return;
    const s = score(input.value);
    meter.dataset.score = String(s);
    meter.querySelector('em').textContent = input.value && input.value.length < 8 ? `Encore ${8 - input.value.length} caractère${8 - input.value.length > 1 ? 's' : ''}` : LEVELS[s];
  });
}

export function install() {
  for (const [k, v] of Object.entries(MORE_ICONS)) if (!ICONS[k]) ICONS[k] = v;
  loadCss();
  bind();
  globalThis.__nxAuth = { sheet, form };
}
