// NEXORA #076 : écran de verrouillage de la licence (le processus principal refuse de toute façon les canaux des
// espaces tant que la licence n'est pas validée : src/license.js) et décompte de l'essai Pro du premier jour.
//   - vérification en cours, connexion obligatoire (la fenêtre de connexion s'ouvre directement), Internet requis,
//     serveur indisponible, refus (comptes par PC, clé d'un autre compte, licence ou PC désactivé), fichiers modifiés ;
//   - pendant l'essai : pastille « Essai Pro » avec le temps restant ; à la fin, retour à l'offre Gratuite annoncé ;
//   - journaux de session : espace ouvert (envoyés par le processus principal avec le signal de vie).
import { b as sb } from '../../dist/chunks/chunk-EZKHFSAB.js';
import { esc, ico, toast } from '../core.js';

const api = window.vitrine;
let st = null;
let box = null;
let chip = null;
let askedLogin = false;
let wasTrial = false;

// NEXORA #084 : textes réduits à l'essentiel (« Vérification de la licence », « Chargement de votre espace ») ; aucun
// détail technique (fichiers, signatures, serveurs de sécurité) n'est montré : il reste dans le journal local.
const TEXT = {
  checking: ['Vérification de la licence', 'Chargement de votre espace…', 'shield'],
  auth: ['Connecte-toi pour ouvrir NEXORA', 'NEXORA Devs Toolbox s’utilise avec un compte NEXORA (gratuit). Ta licence est liée à ton compte : connecte-toi ou crée ton compte.', 'user'],
  offline: ['Connexion perdue', 'Impossible de joindre NEXORA. Vérifie ta connexion à Internet, puis réessaie.', 'globe'],
  server: ['NEXORA est momentanément indisponible', 'Réessaie dans quelques minutes.', 'cloud'],
  integrity: ['Échec du contrôle d’intégrité — Installation non authentifiée', 'NEXORA ne peut pas s’ouvrir : répare l’installation pour continuer.', 'shield'],
  manifest: ['Vérification de la licence impossible', 'Vérifie la date et l’heure de Windows, puis réessaie.', 'shield'],
  outdated: ['Version non autorisée', 'Mets NEXORA à jour pour continuer.', 'download'],
  rollback: ['Version non autorisée', 'Mets NEXORA à jour pour continuer.', 'download'],
  device_limit: ['Trop d’ordinateurs pour cette licence', '', 'laptop'],
  device_accounts: ['Limite de comptes gratuits atteinte', '', 'group'],
  device_gmail: ['Limite d’adresses Gmail atteinte', '', 'group'],
  key_mismatch: ['Clé d’un autre compte', '', 'key'],
  revoked: ['Licence désactivée', '', 'lock'],
  device_blocked: ['Ordinateur non autorisé', '', 'lock'],
  signature: ['Vérification de la licence impossible', 'Réessaie dans un instant.', 'shield'],
};
// États techniques : texte fixe ci-dessus, jamais le message détaillé du serveur.
const FIXED = new Set(['checking', 'offline', 'server', 'integrity', 'manifest', 'outdated', 'rollback', 'signature']);

function remaining(t) {
  const ms = new Date(t).getTime() - Date.now();
  if (!(ms > 0)) return '';
  const h = Math.floor(ms / 3600000);
  const m = Math.max(1, Math.floor((ms % 3600000) / 60000));
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

const button = (k, label, icon, primary = false) => `<button type="button" class="btn${primary ? ' primary' : ''}" data-lic="${k}">${ico(icon, 14)}<span>${esc(label)}</span></button>`;
function actions(s) {
  if (s.status === 'checking') return '<span class="spinner"></span>';
  if (s.status === 'auth') return button('login', 'Se connecter', 'user', true) + button('site', 'Créer mon compte et ma licence', 'globe');
  if (s.status === 'offline' || s.status === 'server') return button('retry', 'Réessayer', 'refreshCw', true) + button('quit', 'Quitter NEXORA', 'close');
  if (s.status === 'integrity' || s.status === 'manifest') return button('repair', 'Réparer', 'download', true) + button('quit', 'Quitter NEXORA', 'close');
  if (s.status === 'outdated') return button('repair', 'Mettre à jour NEXORA', 'download', true) + button('quit', 'Quitter NEXORA', 'close');
  if (s.reason === 'device_limit') return button('site', 'Gérer mes ordinateurs', 'globe', true) + button('retry', 'Réessayer', 'refreshCw');
  const pro = ['device_accounts', 'device_gmail'].includes(s.reason) ? button('pro', 'Passer à Pro', 'nxCrown', true) : '';
  return `${pro}${button('switch', 'Changer de compte', 'user', !pro)}${button('retry', 'Réessayer', 'refreshCw')}`;
}

function render() {
  if (!st || !st.active || st.status === 'ok') { if (box) box.hidden = true; return; }
  if (!box) {
    box = document.createElement('div');
    box.id = 'nxLicence';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    document.body.append(box);
    box.addEventListener('click', onClick);
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-lic-key]')) { e.preventDefault(); saveKey(); } });
  }
  const t = (['integrity', 'manifest', 'outdated', 'offline', 'checking'].includes(st.status) ? TEXT[st.status] : null) || TEXT[st.reason] || TEXT[st.status] || ['NEXORA est verrouillé', '', 'lock'];
  const keyBox = ['blocked', 'auth'].includes(st.status)
    ? '<details class="nxl-key"><summary>J’ai une clé de licence</summary><div class="nxl-row"><input class="input" data-lic-key placeholder="NXDT-XXXX-XXXX-XXXX-XXXX" maxlength="24" spellcheck="false"><button type="button" class="btn" data-lic="key">Valider</button></div><small>Ta clé est sur le site de NEXORA, page « Ma licence ». Elle doit appartenir au compte connecté.</small></details>'
    : '';
  const who = st.email && st.status === 'blocked' ? `<p class="nxl-who">Compte : <b>${esc(st.email)}</b>${st.license_key ? ` · licence ${esc(st.license_key)}` : ''}</p>` : '';
  box.hidden = false;
  // NEXORA #077 : gravité visible (rouge : installation ou licence refusée ; ambre : réseau, serveur, version).
  const danger = ['integrity', 'manifest'].includes(st.status) || ['signature', 'revoked', 'device_blocked', 'key_mismatch'].includes(st.reason);
  const warn = ['offline', 'server', 'outdated'].includes(st.status);
  box.dataset.tone = danger ? 'danger' : warn ? 'warn' : '';
  const fixed = FIXED.has(st.status) || FIXED.has(st.reason);
  const text = fixed ? t[1] : String(st.message || t[1]);
  const shown = text.charAt(0).toUpperCase() + text.slice(1);
  box.innerHTML = `<div class="nxl-card">
    <div class="nxl-brand"><img src="logo.png" alt=""><span><b>NEXORA</b><small>Devs Toolbox</small></span></div>
    <span class="nxl-ico">${ico(t[2], 26)}</span>
    <h2>${esc(t[0])}</h2>
    ${shown ? `<p>${esc(shown)}</p>` : ''}
    ${who}
    <div class="nxl-acts">${actions(st)}</div>
    ${keyBox}
  </div>`;
  if (st.status === 'auth' && !askedLogin) { askedLogin = true; setTimeout(login, 400); }
}

// Fenêtre de connexion du compte (module des offres : bouton data-nxo-login, écouté sur tout le document).
function login() {
  const b = document.createElement('button');
  b.dataset.nxoLogin = '1';
  b.hidden = true;
  document.body.append(b);
  b.click();
  b.remove();
}
const clean = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
async function saveKey() {
  const i = box && box.querySelector('[data-lic-key]');
  if (!i) return;
  try { await api.invoke('license:key', i.value); toast('Clé enregistrée : vérification…'); } catch (e) { toast(clean(e), { kind: 'bad' }); }
}
async function onClick(e) {
  const b = e.target.closest('[data-lic]');
  if (!b) return;
  const k = b.dataset.lic;
  if (k === 'login') login();
  if (k === 'site') api.invoke('license:open-site', 'licence');
  if (k === 'pro') api.invoke('license:open-site', 'licence?offre=pro');
  if (k === 'repair') api.invoke('license:repair');
  if (k === 'quit') api.invoke('license:quit');
  if (k === 'key') saveKey();
  if (k === 'retry') {
    b.disabled = true;
    await api.invoke('license:check').catch(() => null);
    b.disabled = false;
  }
  if (k === 'switch') {
    try { await sb.auth.signOut(); } catch { /* déjà déconnecté */ }
    askedLogin = false;
  }
}

// Pastille de l'essai Pro : temps restant, et lien vers l'offre.
function renderChip() {
  const on = st && st.active && st.status === 'ok' && st.trial && st.trial_ends_at && remaining(st.trial_ends_at);
  if (!on) {
    if (chip) chip.hidden = true;
    if (wasTrial && st && st.status === 'ok' && !st.trial) {
      // NEXORA #087 : l'offre Gratuite comprend aussi 2 applications (App Builder et Desktop Builder confondus).
      toast('Ton essai Pro est terminé : NEXORA passe en offre Gratuite (Responsive Lab, Browser Lab et 2 applications). Passe à Pro pour tout garder.', { action: 'Passer à Pro', onAction: () => api.invoke('license:open-site', 'licence?offre=pro') });
    }
    wasTrial = false;
    return;
  }
  wasTrial = true;
  if (!chip) {
    chip = document.createElement('button');
    chip.id = 'nxTrialChip';
    chip.type = 'button';
    chip.addEventListener('click', () => api.invoke('license:open-site', 'licence?offre=pro'));
    document.body.append(chip);
  }
  chip.hidden = false;
  chip.innerHTML = `${ico('nxCrown', 13)}<span>Essai Pro · <b>${esc(remaining(st.trial_ends_at))}</b> restantes</span><em>Passer à Pro</em>`;
  chip.title = `Tout NEXORA est ouvert jusqu’au ${new Date(st.trial_ends_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}. Ensuite : offre Gratuite (Responsive Lab, Browser Lab et 2 applications), ou Pro à 18 $ par mois.`;
}
function update(s) { st = s; render(); renderChip(); }

export async function install() {
  if (!document.querySelector('link[data-nxl-css]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = new URL('./licence.css', import.meta.url).href;
    l.dataset.nxlCss = '1';
    document.head.append(l);
  }
  try { api.on('license:changed', update); } catch { /* aperçu */ }
  update(await api.invoke('license:state').catch(() => null));
  // Décompte de l'essai : mis à jour chaque minute ; à la fin, nouveau contrôle (l'offre change).
  setInterval(() => {
    if (!st || !st.trial) return;
    if (!remaining(st.trial_ends_at)) api.invoke('license:check').catch(() => null);
    renderChip();
  }, 60000);
  // Journaux de session : espace ouvert.
  let mode = document.body.dataset.mode || '';
  new MutationObserver(() => {
    const m = document.body.dataset.mode || '';
    if (m && m !== mode) { mode = m; api.invoke('license:log', { event: 'espace', detail: { mode: m } }).catch(() => {}); }
  }).observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });
}
