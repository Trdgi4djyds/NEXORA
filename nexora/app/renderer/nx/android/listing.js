// NEXORA #017 : section « Fiche Play Store » de l'App Builder. Textes et coordonnées de la fiche, politique de
// confidentialité, icône, bannière et captures d'écran générées par NEXORA, contenu de l'application à
// déclarer, puis envoi par l'API de la Play Console (même clé de compte de service que la publication).
import { api, esc, toast, busy, pickFile, loadImage, makeCanvas, $ } from '../core.js';
import { b as icon } from '../../dist/chunks/chunk-S4I2LXHS.js';
import * as D from './draw.js';

export const SECTION = ['listing', 'Fiche Play Store', 'star', 'Textes, images, confidentialité'];

export const LIMITS = { title: 30, shortDescription: 80, fullDescription: 4000 };
const LANGS = {
  'fr-FR': 'Français (France)', 'fr-CA': 'Français (Canada)', 'en-US': 'Anglais (États-Unis)', 'en-GB': 'Anglais (Royaume-Uni)', 'es-ES': 'Espagnol (Espagne)', 'es-419': 'Espagnol (Amérique latine)', 'pt-BR': 'Portugais (Brésil)', 'de-DE': 'Allemand', 'it-IT': 'Italien', 'nl-NL': 'Néerlandais', ar: 'Arabe', 'tr-TR': 'Turc',
};
const KIND_LABEL = { icon: 'Icône', featureGraphic: 'Bannière', phoneScreenshots: 'Captures téléphone', tenInchScreenshots: 'Captures tablette 10 pouces' };
const PERM_DATA = {
  location: { cat: 'Position', type: 'Position approximative et position exacte', why: 'afficher ce qui est proche de vous (cartes, magasins, livraison)' },
  camera: { cat: 'Photos et vidéos', type: 'Photos (si vous les envoyez depuis l’application)', why: 'prendre une photo ou scanner un code' },
  microphone: { cat: 'Fichiers audio', type: 'Enregistrements vocaux ou audio', why: 'appels, messages vocaux et recherche vocale' },
  contacts: { cat: 'Contacts', type: 'Contacts', why: 'choisir un contact à qui écrire ou partager' },
};

/* Valeurs de la fiche, complétées à partir de l'application (nom, description, propriétaire). */
export function L(app, cfg) {
  const l = cfg.listing || (cfg.listing = {});
  const own = app.ownerFor();
  const def = {
    lang: 'fr-FR', title: String(cfg.appName || '').slice(0, 30), shortDescription: '', fullDescription: '', video: '',
    contactEmail: own.email || '', contactWebsite: own.website || (cfg.source.kind === 'url' ? cfg.source.url : '') || '', contactPhone: own.phone || '', privacyUrl: '',
    bannerStyle: 'logo', tagline: '', shotStyle: 'framed', shotBg: 'brand', caption: '',
  };
  for (const [k, v] of Object.entries(def)) if (l[k] == null) l[k] = v;
  if (!l.shortDescription) {
    const d = app.appDescription();
    if (d && !/application mobile\.$/.test(d)) l.shortDescription = d.slice(0, 80);
  }
  return l;
}

/* Ce que l'application elle-même traite comme données (pour la politique de confidentialité et
 * le formulaire « Sécurité des données » de la Play Console). */
export function practices(cfg) {
  const out = [];
  for (const p of cfg.permissions || []) {
    const d = PERM_DATA[p];
    if (d) out.push({ id: p, cat: d.cat, type: d.type, why: d.why, collected: 'Seulement si votre site envoie ces données à son serveur', shared: 'Non', optional: true });
  }
  // NEXORA #018 : statistiques et plantages envoyés au compte NEXORA du propriétaire.
  if (cfg.insights && cfg.insights.enabled) {
    out.push({ id: 'crash', cat: 'Infos et performances de l’application', type: 'Journaux de plantage et diagnostics (modèle, version d’Android et de l’application)', why: 'corriger les plantages et suivre la stabilité', collected: 'Oui', shared: 'Non (NEXORA agit comme prestataire)', optional: false });
    if (cfg.insights.launches !== false) out.push({ id: 'launch', cat: 'Identifiants de l’appareil ou autres', type: 'Identifiant d’installation tiré au hasard (pas d’identifiant du téléphone)', why: 'compter les installations actives et les ouvertures', collected: 'Oui', shared: 'Non (NEXORA agit comme prestataire)', optional: false });
  }
  // NEXORA #019 : achats intégrés (paiement traité par Google Play ; l'application reçoit la preuve d'achat).
  if (cfg.billing && cfg.billing.enabled && cfg.engine !== 'twa') {
    out.push({ id: 'billing', cat: 'Infos financières', type: 'Historique des achats (preuve d’achat Google Play)', why: 'activer et restaurer les achats faits dans l’application', collected: 'Oui, si votre site enregistre les achats', shared: 'Non', optional: false });
  }
  if (cfg.push && cfg.push.enabled && cfg.engine !== 'twa') {
    out.push({ id: 'push', cat: 'Identifiants de l’appareil ou autres', type: 'Jeton de notification de l’appareil (Firebase Cloud Messaging)', why: 'envoyer les notifications push', collected: 'Oui', shared: 'Non (Google agit comme prestataire)', optional: true });
  }
  return out;
}

const count = (s) => [...String(s || '')].length;
function counter(path, v, max) {
  const n = count(v);
  return `<small class="nxa-count${n > max ? ' bad' : ''}" data-nxa-count="${path}" data-max="${max}">${n} / ${max}</small>`;
}

function thumbs(app, kind, list, { wide = false, max = 8, actions = '' } = {}) {
  const items = (list || []).map((im, i) => `<figure class="nxa-thumb${wide ? ' wide' : ''}">
      <img src="${im.dataUrl}" alt="">
      <figcaption>${im.w} × ${im.h}</figcaption>
      <span class="nxa-thumb-acts">
        ${list.length > 1 && i > 0 ? `<button class="icon-btn small" data-act="listing-img-move" data-kind="${kind}" data-id="${esc(im.id)}" data-delta="-1" title="Avancer">${icon('chevronLeft', 13)}</button>` : ''}
        ${list.length > 1 && i < list.length - 1 ? `<button class="icon-btn small" data-act="listing-img-move" data-kind="${kind}" data-id="${esc(im.id)}" data-delta="1" title="Reculer">${icon('chevronRight', 13)}</button>` : ''}
        <button class="icon-btn small" data-act="listing-img-del" data-kind="${kind}" data-id="${esc(im.id)}" title="Retirer">${icon('trash', 13)}</button>
      </span></figure>`).join('');
  return `<div class="nxa-thumbs">${items}${(list || []).length < max ? actions : ''}</div>`;
}

function privacyHtml(app, cfg) {
  const l = L(app, cfg);
  const own = app.ownerFor();
  const name = cfg.appName || 'Cette application';
  const site = cfg.source.kind === 'url' ? cfg.source.url : (cfg.source.publicUrl || '');
  const pr = practices(cfg);
  const perms = (cfg.permissions || []).filter((p) => PERM_DATA[p] || ['notifications', 'vibrate', 'biometric', 'nfc'].includes(p));
  const permText = { notifications: 'Notifications : vous informer (commande, message, nouveauté). Vous pouvez les couper dans les réglages d’Android.', vibrate: 'Vibration : retour au toucher.', biometric: 'Empreinte ou visage : déverrouiller l’application. La vérification se fait sur le téléphone ; aucune empreinte n’est transmise.', nfc: 'NFC : lire une étiquette sans contact quand vous le demandez.' };
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const h = (s) => esc(s);
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Politique de confidentialité — ${h(name)}</title>
<style>body{font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:760px;margin:0 auto;padding:32px 20px;color:#1d1d1f}h1{font-size:28px;line-height:1.2}h2{font-size:19px;margin-top:32px}li{margin:6px 0}small{color:#6e6e73}</style></head>
<body>
<h1>Politique de confidentialité de l’application ${h(name)}</h1>
<p><small>Dernière mise à jour : ${today}</small></p>
<h2>Qui sommes-nous</h2>
<p>L’application ${h(name)} (identifiant ${h(cfg.appId || '')}) est éditée par ${h(own.org || own.name || name)}${own.street || own.city ? `, ${h([own.street, own.postal, own.city, own.country].filter(Boolean).join(', '))}` : ''}. Pour toute question sur vos données : ${l.contactEmail ? `<a href="mailto:${h(l.contactEmail)}">${h(l.contactEmail)}</a>` : 'l’adresse indiquée sur la fiche Google Play'}.</p>
<h2>Ce que fait l’application</h2>
<p>${site ? `L’application affiche le site <a href="${h(site)}">${h(site)}</a>. Les données que vous saisissez sur ce site (compte, formulaires, commandes) sont traitées par ce site selon sa propre politique de confidentialité.` : 'L’application affiche des pages intégrées à l’application.'}</p>
<h2>Données traitées par l’application</h2>
${pr.length ? `<ul>${pr.map((p) => `<li><b>${h(p.cat)}</b> — ${h(p.type)} : pour ${h(p.why)}.</li>`).join('')}</ul>` : '<p>L’application elle-même ne collecte aucune donnée personnelle.</p>'}
${perms.length ? `<h2>Autorisations demandées</h2><ul>${perms.map((p) => `<li>${PERM_DATA[p] ? `${h(PERM_DATA[p].cat)} : ${h(PERM_DATA[p].why)}. Demandée seulement au moment où c’est nécessaire.` : h(permText[p])}</li>`).join('')}</ul>` : ''}
<h2>Partage</h2>
<p>${cfg.push && cfg.push.enabled ? 'Les notifications passent par Firebase Cloud Messaging (Google), qui agit pour notre compte. ' : ''}${cfg.billing && cfg.billing.enabled ? 'Les paiements faits dans l’application sont traités par Google Play : nous ne recevons ni votre carte ni vos coordonnées bancaires, seulement la preuve d’achat qui active votre achat. ' : ''}${cfg.insights && cfg.insights.enabled ? 'Les statistiques d’utilisation et les rapports de plantage sont hébergés par NEXORA, qui agit pour notre compte ; ils sont conservés 180 jours. ' : ''}Vos données ne sont ni vendues ni louées.</p>
<h2>Conservation et sécurité</h2>
<p>Les échanges avec nos serveurs sont chiffrés (HTTPS). Les données sont conservées le temps nécessaire au service, puis supprimées.</p>
<h2>Vos droits</h2>
<p>Vous pouvez demander à consulter, corriger ou supprimer vos données, ou vous opposer à leur traitement, en écrivant à ${l.contactEmail ? h(l.contactEmail) : 'l’adresse de contact'}. Vous pouvez aussi saisir l’autorité de protection des données de votre pays (en France, la CNIL).</p>
<h2>Enfants</h2>
<p>L’application ne s’adresse pas spécialement aux enfants de moins de 13 ans et ne collecte pas sciemment leurs données.</p>
<h2>Modifications</h2>
<p>Cette politique peut évoluer ; la date en haut de page indique la dernière version.</p>
</body></html>
`;
}

export function readiness(app, cfg, assets) {
  const l = L(app, cfg);
  const a = assets || {};
  return [
    [!!l.title.trim() && count(l.title) <= 30, 'Nom de l’application (30 caractères)'],
    [!!l.shortDescription.trim() && count(l.shortDescription) <= 80, 'Description courte (80 caractères)'],
    [!!l.fullDescription.trim() && count(l.fullDescription) <= 4000, 'Description complète (4 000 caractères)'],
    [/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.contactEmail || ''), 'Adresse e-mail de contact'],
    [/^https:\/\//.test(l.privacyUrl || ''), 'Politique de confidentialité en ligne (https)'],
    [(a.icon || []).length === 1, 'Icône 512 × 512'],
    [(a.featureGraphic || []).length === 1, 'Bannière 1024 × 500'],
    [(a.phoneScreenshots || []).length >= 2, 'Au moins 2 captures de téléphone'],
  ];
}

export function install(proto, SECTIONS) {
  const at = SECTIONS.findIndex((s) => s[0] === 'store');
  if (!SECTIONS.some((s) => s[0] === SECTION[0])) SECTIONS.splice(at < 0 ? SECTIONS.length : at, 0, SECTION);

  proto.nxListingLoad = function nxListingLoad(force = false) {
    const id = this.cfg.appId;
    if (!force && this.nxAssetsFor === id && this.nxAssets) return;
    if (this.nxAssetsLoading === id) return;
    this.nxAssetsLoading = id;
    Promise.all([
      api.invoke('android:listing-assets', id).catch(() => null),
      this.playSt ? Promise.resolve(this.playSt) : api.invoke('android:play-status', id).catch(() => ({ serviceAccount: false })),
    ]).then(([a, st]) => {
      this.nxAssets = a || {}; this.nxAssetsFor = id; this.nxAssetsLoading = null; this.playSt = st;
      if (this.section === 'listing') this.renderForm();
    });
  };

  proto.form_listing = function formListing(cfg) {
    const l = L(this, cfg);
    const a = this.nxAssetsFor === cfg.appId ? this.nxAssets : null;
    if (!a) this.nxListingLoad();
    this.nxListingBind();
    const st = this.playSt || {};
    const pr = practices(cfg);
    const raw = this.nxRaw && this.nxRaw.length;
    const ready = readiness(this, cfg, a || {});
    const okAll = ready.every(([ok]) => ok);
    const idOk = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(cfg.appId || '');
    const add = (act, ic, label, extra = '') => `<button class="nxa-add" data-act="${act}" ${extra}>${icon(ic, 18)}<span>${label}</span></button>`;

    const texts = this.card('Textes de la fiche', `
      <div class="nxa-lang">${this.field('Langue', 'listing.lang', { type: 'select', options: LANGS })}<div class="ab-row"><button class="btn small" data-act="listing-ai">${icon('sparkle', 13)}<span>Rédiger avec l’IA</span></button><button class="btn small" data-act="listing-read" ${st.serviceAccount && idOk ? '' : 'disabled'} title="${st.serviceAccount ? 'Reprendre les textes publiés sur Google Play' : 'Importez d’abord la clé du compte de service (section Publication Play Store)'}">${icon('download', 13)}<span>Reprendre la fiche en ligne</span></button></div></div>
      <label class="field"><span>Nom sur Google Play ${counter('listing.title', l.title, 30)}</span><input class="input" data-k="listing.title" value="${esc(l.title)}" placeholder="${esc(cfg.appName || 'Mon application')}"></label>
      <label class="field"><span>Description courte ${counter('listing.shortDescription', l.shortDescription, 80)}</span><input class="input" data-k="listing.shortDescription" value="${esc(l.shortDescription)}" placeholder="Ce que l’application vous apporte, en une phrase"></label>
      <label class="field"><span>Description complète ${counter('listing.fullDescription', l.fullDescription, 4000)}</span><textarea class="input" rows="9" data-k="listing.fullDescription" placeholder="Présentez l’application : ce qu’elle permet, pour qui, ses points forts. Évitez les superlatifs (« la meilleure ») et les appels au vote : Google les refuse.">${esc(l.fullDescription)}</textarea></label>
      ${this.field('Vidéo YouTube (facultatif)', 'listing.video', { placeholder: 'https://www.youtube.com/watch?v=…' })}`, ' <small>Visibles par tous sur Google Play</small>');

    const contact = this.card('Coordonnées et confidentialité', `
      <div class="ab-grid2">${this.field('E-mail de contact (obligatoire)', 'listing.contactEmail', { placeholder: 'contact@monsite.com' })}${this.field('Site web', 'listing.contactWebsite', { placeholder: 'https://www.monsite.com' })}</div>
      ${this.field('Téléphone (facultatif)', 'listing.contactPhone', { placeholder: '+33 1 23 45 67 89' })}
      <label class="field"><span>Adresse de la politique de confidentialité</span><input class="input" data-k="listing.privacyUrl" value="${esc(l.privacyUrl)}" placeholder="https://www.monsite.com/confidentialite.html"></label>
      <div class="ab-row"><button class="btn small" data-act="listing-privacy">${icon('file', 13)}<span>Créer la page de confidentialité</span></button><button class="btn small" data-act="listing-privacy-check" ${/^https?:\/\//.test(l.privacyUrl) ? '' : 'disabled'}>${icon('globe', 13)}<span>Vérifier en ligne</span></button><span class="ab-hint" data-nxa-privacy></span></div>
      <p class="ab-hint">Google exige une politique de confidentialité en ligne. NEXORA la rédige d’après votre application (autorisations, notifications, propriétaire) : enregistrez le fichier, publiez-le sur votre site, puis collez son adresse ci-dessus.</p>`);

    const banner = a && a.featureGraphic && a.featureGraphic[0];
    const iconImg = a && a.icon && a.icon[0];
    const graphics = this.card('Éléments graphiques', !a ? '<p class="ab-hint"><span class="spinner small"></span> Chargement des images…</p>' : `
      <div class="nxa-gfx">
        <div class="nxa-gfx-col">
          <b class="nxa-sub">Icône <small>512 × 512, PNG</small></b>
          <div class="nxa-icon">${iconImg ? `<img src="${iconImg.dataUrl}" alt="">` : `<span class="nxa-empty">${icon('image', 22)}</span>`}</div>
          <div class="ab-row"><button class="btn small" data-act="listing-icon-gen">${icon('sparkle', 13)}<span>${iconImg ? 'Regénérer' : 'Générer'}</span></button><button class="btn small" data-act="listing-icon-pick" title="Importer une image">${icon('upload', 13)}</button>${iconImg ? `<button class="btn small" data-act="listing-img-del" data-kind="icon" data-id="${esc(iconImg.id)}" title="Retirer">${icon('trash', 13)}</button>` : ''}</div>
        </div>
        <div class="nxa-gfx-col grow">
          <b class="nxa-sub">Bannière <small>1024 × 500, en haut de la fiche</small></b>
          <div class="nxa-banner">${banner ? `<img src="${banner.dataUrl}" alt="">` : `<span class="nxa-empty">${icon('image', 22)}<small>Générée aux couleurs de votre icône</small></span>`}</div>
          <div class="ab-row">${this.segK('listing.bannerStyle', { logo: 'Logo et nom', center: 'Centrée', capture: 'Avec l’écran' })}</div>
          ${this.field('Accroche de la bannière', 'listing.tagline', { placeholder: l.shortDescription || 'Commande en deux gestes, livrée chez vous' })}
          <div class="ab-row"><button class="btn small primary" data-act="listing-banner-gen">${icon('sparkle', 13)}<span>${banner ? 'Regénérer' : 'Générer la bannière'}</span></button><button class="btn small" data-act="listing-banner-pick">${icon('upload', 13)}<span>Importer</span></button>${banner ? `<button class="btn small" data-act="listing-img-del" data-kind="featureGraphic" data-id="${esc(banner.id)}" title="Retirer">${icon('trash', 13)}</button>` : ''}</div>
          ${l.bannerStyle === 'capture' && !raw ? '<p class="ab-hint">Le style « Avec l’écran » utilise la dernière capture de l’aperçu : capturez d’abord un écran ci-dessous.</p>' : ''}
        </div>
      </div>
      <div class="nxa-sep"></div>
      <b class="nxa-sub">Captures d’écran du téléphone <small>2 à 8, la première est la plus vue</small></b>
      <div class="ab-grid2">${this.field('Présentation', 'listing.shotStyle', { type: 'select', options: { framed: 'Habillée : appareil, légende et fond', plain: 'Écran seul' } })}${l.shotStyle === 'framed' ? this.field('Fond', 'listing.shotBg', { type: 'select', options: { brand: 'Couleurs de l’icône', light: 'Clair', dark: 'Sombre' } }) : '<span></span>'}</div>
      ${l.shotStyle === 'framed' ? this.field('Légende de la prochaine capture', 'listing.caption', { placeholder: 'Commande en deux gestes' }) : ''}
      ${thumbs(this, 'phoneScreenshots', a.phoneScreenshots, { actions: add('listing-shot-capture', 'camera', 'Capturer l’aperçu', `title="Capture l’écran affiché à droite, à la définition de l’appareil (${esc(this.previewDevice().dev.name)})"`) + add('listing-shot-pick', 'upload', 'Importer une image') })}
      <p class="ab-hint">Naviguez dans le site à droite jusqu’à l’écran voulu, puis « Capturer l’aperçu » : NEXORA reprend la barre d’état, les onglets et l’appareil choisi. Change d’appareil ou de couleur dans la liste au-dessus du téléphone.</p>
      <div class="nxa-sep"></div>
      <b class="nxa-sub">Captures de tablette <small>facultatif, recommandé si l’application s’adapte aux tablettes</small></b>
      ${thumbs(this, 'tenInchScreenshots', a.tenInchScreenshots, { wide: true, actions: add('listing-tab-pick', 'upload', 'Importer (10 pouces)') })}`);

    const content = this.card('Contenu de l’application (Play Console)', `
      <p class="ab-hint">Ces formulaires se remplissent une fois dans la Play Console (Règles › Contenu de l’application). Voici les réponses qui correspondent à ce que NEXORA met dans votre application.</p>
      <ol class="ab-psteps">
        <li class="ab-pstep ${/^https:\/\//.test(l.privacyUrl) ? 'ok' : ''}"><i>${/^https:\/\//.test(l.privacyUrl) ? icon('check', 12) : 1}</i><div><b>Règles de confidentialité</b><p>${l.privacyUrl ? `Adresse : ${esc(l.privacyUrl)}` : 'Créez et publiez la page ci-dessus, puis collez son adresse.'}</p></div></li>
        <li class="ab-pstep"><i>2</i><div><b>Sécurité des données</b>${pr.length ? `<p>Données liées aux fonctions de l’application (chiffrées pendant le transfert : oui ; suppression sur demande : selon votre site) :</p><ul class="nxa-ds">${pr.map((p) => `<li><b>${esc(p.cat)}</b> › ${esc(p.type)}<small>Collectée : ${esc(p.collected)} · Partagée : ${esc(p.shared)} · Finalité : ${esc(p.why)}</small></li>`).join('')}</ul>` : '<p>L’application elle-même ne collecte aucune donnée : répondez « Non » à la collecte, <b>sauf</b> pour ce que votre site collecte (comptes, formulaires, commandes, mesure d’audience), à déclarer aussi.</p>'}</div></li>
        <li class="ab-pstep"><i>3</i><div><b>Annonces</b><p>NEXORA n’ajoute aucune publicité. Répondez « Oui » seulement si votre site en affiche.</p></div></li>
        <li class="ab-pstep"><i>4</i><div><b>Accès à l’application</b><p>${cfg.config && cfg.config.passcode && cfg.config.passcode.enabled ? 'Votre application demande un code : donnez-le à Google dans les instructions d’accès.' : 'Si une partie du site demande un compte, fournissez un identifiant de test à Google ; sinon, « Toutes les fonctionnalités sont disponibles sans restriction ».'}</p></div></li>
        <li class="ab-pstep"><i>5</i><div><b>Classification du contenu</b><p>Questionnaire IARC (violence, achats, partage de position…) : répondez pour le contenu de votre site.${(cfg.permissions || []).includes('location') ? ' Indiquez que l’application peut partager la position.' : ''}</p></div></li>
        <li class="ab-pstep"><i>6</i><div><b>Public cible</b><p>Ne choisissez les moins de 13 ans que si l’application leur est destinée : les règles « Famille » s’appliquent alors.</p></div></li>
        <li class="ab-pstep"><i>7</i><div><b>Autorisations sensibles</b><p>NEXORA n’ajoute aucune autorisation soumise à déclaration (SMS, journal d’appels, position en arrière-plan, accès à tous les fichiers).</p></div></li>
      </ol>
      <div class="ab-row"><button class="btn small" data-external="https://play.google.com/console">${icon('external', 13)}<span>Ouvrir la Play Console</span></button></div>`);

    const send = this.card('Envoyer la fiche', `
      <ul class="nxa-ready">${ready.map(([ok, label]) => `<li class="${ok ? 'ok' : ''}">${icon(ok ? 'pass' : 'warn', 14)}<span>${label}</span></li>`).join('')}</ul>
      <div class="ab-row"><button class="btn primary small" data-act="listing-push" ${st.serviceAccount && idOk ? '' : 'disabled'}>${icon('upload', 13)}<span>Envoyer la fiche sur Google Play</span></button>${st.serviceAccount ? '' : `<button class="btn small" data-sec="store">${icon('key', 13)}<span>Ajouter la clé d’accès</span></button>`}</div>
      <p class="ab-hint">${st.serviceAccount ? 'NEXORA remplace les textes de la langue choisie, les coordonnées et, pour chaque emplacement rempli ci-dessus, les images en ligne. Google examine ensuite les modifications.' : 'L’envoi utilise la clé du compte de service de la section « Publication Play Store ».'} ${okAll ? '' : 'Les points en orange sont demandés par Google avant la première publication.'}</p>
      ${cfg.lastListing ? `<p class="ab-hint">Dernier envoi : ${new Date(cfg.lastListing.at).toLocaleString('fr-FR')}${cfg.lastListing.sentForReview === false ? ' (à envoyer en examen depuis la Play Console)' : ''}.</p>` : ''}`);

    return texts + contact + graphics + content + send;
  };

  // Compteurs de caractères mis à jour à la frappe (le formulaire n'est pas redessiné pendant la saisie).
  proto.nxListingBind = function nxListingBind() {
    if (this.nxListingBound) return;
    this.nxListingBound = true;
    this.el.addEventListener('input', (e) => {
      const k = e.target.dataset && e.target.dataset.k;
      if (!k || !k.startsWith('listing.')) return;
      const c = this.el.querySelector(`[data-nxa-count="${k}"]`);
      if (c) { const n = count(e.target.value); c.textContent = `${n} / ${c.dataset.max}`; c.classList.toggle('bad', n > Number(c.dataset.max)); }
    });
  };

  proto.nxPutImage = async function nxPutImage(kind, dataUrl, opts = {}) {
    this.nxAssets = await api.invoke('android:listing-asset-put', { appId: this.cfg.appId, kind, dataUrl, replace: opts.replace });
    this.nxAssetsFor = this.cfg.appId;
    this.renderForm();
  };
  proto.nxNeedId = function nxNeedId() {
    if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(this.cfg.appId || '')) throw new Error('Indiquez d’abord un identifiant d’application valide (section Identité) : les images de la fiche sont rangées par application.');
  };

  proto.act_listing_icon_gen = async function act() {
    this.nxNeedId();
    await this.nxPutImage('icon', await D.storeIcon(this.cfg));
    toast('Icône 512 × 512 générée à partir de l’icône de l’application.');
  };
  proto.act_listing_icon_pick = async function act() {
    this.nxNeedId();
    const f = await pickFile({ title: 'Icône de la fiche (carrée)', name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] });
    if (f) await this.nxPutImage('icon', await D.fitImage(f.dataUrl, 512, 512, { png: true }));
  };
  proto.act_listing_banner_gen = async function act() {
    this.nxNeedId();
    const l = L(this, this.cfg);
    const raw = this.nxRaw && this.nxRaw[this.nxRaw.length - 1];
    if (l.bannerStyle === 'capture' && !raw) throw new Error('Capturez d’abord un écran de l’aperçu (Captures d’écran du téléphone), ou choisissez un autre style.');
    await this.nxPutImage('featureGraphic', await D.banner(this.cfg, { style: l.bannerStyle, title: l.title || this.cfg.appName, tagline: l.tagline || l.shortDescription, screen: raw }));
    toast('Bannière 1024 × 500 générée.');
  };
  proto.act_listing_banner_pick = async function act() {
    this.nxNeedId();
    const f = await pickFile({ title: 'Bannière de la fiche (1024 × 500)', name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] });
    if (f) await this.nxPutImage('featureGraphic', await D.fitImage(f.dataUrl, 1024, 500));
  };

  // Écran de l'aperçu à la définition de l'appareil : page capturée par le processus principal, puis
  // barre d'état, onglets et barre de gestes redessinés autour.
  proto.nxCaptureScreen = async function nxCaptureScreen() {
    if (this.preview !== 'app') {
      this.preview = 'app';
      for (const b of this.el.querySelectorAll('[data-set="abPrev"]')) b.classList.toggle('on', b.dataset.val === 'app');
      this.renderPreview();
      await new Promise((r) => setTimeout(r, 300));
    }
    const screen = $('.ab-screen', this.el);
    if (!this.wv || !this.wvId) throw new Error(this.cfg.source.kind === 'url' ? 'Indiquez l’adresse du site (section Source) et attendez son affichage dans l’aperçu.' : 'Pour un projet local, lancez le site dans le Responsive Lab puis revenez ici, ou importez une image.');
    const k = (this.phoneL && this.phoneL.dpr) || 3;
    const shot = await api.invoke('capture:shot', { wcId: this.wvId, fullPage: false, dpr: k });
    if (!shot || !shot.tiles || !shot.tiles.length) throw new Error(shot && shot.error ? `Capture impossible : ${shot.error}` : 'Capture impossible : la page n’est pas encore affichée.');
    const page = makeCanvas(shot.width, shot.height);
    const pctx = page.getContext('2d');
    for (const t of shot.tiles) pctx.drawImage(await loadImage(`data:image/png;base64,${t.data}`), t.dx, t.dy);
    return D.rasterScreen(screen, { scale: this.phoneScale || 1, k, page });
  };
  proto.nxAddShot = async function nxAddShot(screen) {
    const l = L(this, this.cfg);
    const raw = screen instanceof HTMLCanvasElement ? screen.toDataURL('image/jpeg', 0.9) : screen;
    this.nxRaw = [...(this.nxRaw || []).slice(-5), raw];
    const { dev, color } = this.previewDevice();
    const url = l.shotStyle === 'plain' ? await D.plainShot(screen) : await D.framedShot(this.cfg, screen, { device: dev, color, state: this.previewState(dev), caption: l.caption, bg: l.shotBg });
    await this.nxPutImage('phoneScreenshots', url);
    if (l.shotStyle === 'framed' && l.caption) { this.set('listing.caption', ''); this.renderForm(); }
  };
  proto.act_listing_shot_capture = async function act() {
    this.nxNeedId();
    const n = busy('Capture de l’écran de l’aperçu…');
    try { await this.nxAddShot(await this.nxCaptureScreen()); toast('Capture ajoutée à la fiche.'); } finally { n.close(); }
  };
  proto.act_listing_shot_pick = async function act() {
    this.nxNeedId();
    const f = await pickFile({ title: 'Capture d’écran du téléphone', name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] });
    if (f) await this.nxAddShot(f.dataUrl);
  };
  proto.act_listing_tab_pick = async function act() {
    this.nxNeedId();
    const f = await pickFile({ title: 'Capture d’écran de tablette (10 pouces)', name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] });
    if (f) await this.nxPutImage('tenInchScreenshots', await D.tabletShot(f.dataUrl));
  };
  proto.act_listing_img_del = async function act(el) {
    this.nxAssets = await api.invoke('android:listing-asset-del', { appId: this.cfg.appId, kind: el.dataset.kind, id: el.dataset.id });
    this.renderForm();
  };
  proto.act_listing_img_move = async function act(el) {
    this.nxAssets = await api.invoke('android:listing-asset-move', { appId: this.cfg.appId, kind: el.dataset.kind, id: el.dataset.id, delta: Number(el.dataset.delta) });
    this.renderForm();
  };

  proto.act_listing_privacy = async function act() {
    const file = await api.invoke('lab:save-text', { name: 'confidentialite.html', text: privacyHtml(this, this.cfg), filters: [{ name: 'Page web', extensions: ['html'] }] });
    if (file) toast('Page enregistrée : publiez-la sur votre site, puis collez son adresse.', { action: 'Afficher', onAction: () => api.invoke('lab:reveal', file) });
  };
  proto.act_listing_privacy_check = async function act() {
    const out = $('[data-nxa-privacy]', this.el);
    const r = await api.invoke('url:check', L(this, this.cfg).privacyUrl).catch((e) => ({ ok: false, error: e.message }));
    if (out) out.textContent = r && (r.ok || r.status === 200) ? 'Page trouvée en ligne.' : 'Page introuvable à cette adresse.';
  };

  proto.act_listing_ai = async function act(btn) {
    const ai = await import('../../dist/chunks/ai-RLNIHTXY.js');
    if (!await ai.aiReady()) { toast('Configurez d’abord une IA (bouton IA en haut à droite).'); ai.openAiSettings(); return; }
    const cfg = this.cfg; const l = L(this, cfg);
    const lang = LANGS[l.lang] || l.lang;
    const n = busy('L’IA rédige la fiche…');
    let out = '';
    try {
      await ai.aiChat({
        system: 'Tu rédiges des fiches Google Play efficaces et conformes aux règles de Google : pas de superlatifs invérifiables (« n°1 », « le meilleur »), pas d’appel à noter l’application, pas de mots-clés répétés, pas d’emoji dans le nom. Réponds uniquement par un objet JSON {"title": "...", "shortDescription": "...", "fullDescription": "..."} : title 30 caractères au plus, shortDescription 80 caractères au plus, fullDescription 4000 caractères au plus, en paragraphes courts et listes à puces « • ».',
        messages: [{ role: 'user', content: `Langue de la fiche : ${lang}.\nNom de l’application : ${cfg.appName}\nSite : ${cfg.source.kind === 'url' ? cfg.source.url : 'application web intégrée'}\nDescription connue : ${this.appDescription()}\nFonctions de l’application : ${[cfg.push && cfg.push.enabled ? 'notifications push' : '', (cfg.permissions || []).join(', '), cfg.config && cfg.config.tabs && cfg.config.tabs.length ? `onglets ${cfg.config.tabs.map((t) => t.label).join(', ')}` : '', cfg.config && cfg.config.offlinePage ? 'page hors connexion' : ''].filter(Boolean).join(' ; ') || 'non précisé'}\nTextes actuels (à améliorer s’ils existent) : ${JSON.stringify({ title: l.title, shortDescription: l.shortDescription, fullDescription: l.fullDescription })}` }],
        onChunk: (p) => { out += p; },
      });
      const m = /\{[\s\S]*\}/.exec(out);
      const j = m ? JSON.parse(m[0]) : null;
      if (!j || !j.title) throw new Error('Réponse de l’IA illisible : réessayez.');
      const before = { title: l.title, shortDescription: l.shortDescription, fullDescription: l.fullDescription };
      this.set('listing.title', String(j.title).slice(0, 30));
      this.set('listing.shortDescription', String(j.shortDescription || '').slice(0, 80));
      this.set('listing.fullDescription', String(j.fullDescription || '').slice(0, 4000));
      this.renderForm();
      toast('Textes rédigés par l’IA : relisez-les avant l’envoi.', { action: 'Annuler', onAction: () => { for (const [k, v] of Object.entries(before)) this.set(`listing.${k}`, v); this.renderForm(); } });
    } finally { n.close(); if (btn) btn.blur(); }
  };

  proto.act_listing_read = async function act() {
    const l = L(this, this.cfg);
    const n = busy('Lecture de la fiche sur Google Play…');
    try {
      const r = await api.invoke('android:listing-read', { appId: this.cfg.appId, lang: l.lang });
      if (!r.listing) { toast(r.languages && r.languages.length ? `Aucune fiche en ${LANGS[l.lang] || l.lang} : langues en ligne ${r.languages.join(', ')}.` : 'Aucune fiche encore sur Google Play pour cette application.'); return; }
      const before = { ...l };
      for (const k of ['title', 'shortDescription', 'fullDescription', 'video']) this.set(`listing.${k}`, r.listing[k] || '');
      const d = r.details || {};
      if (d.contactEmail) this.set('listing.contactEmail', d.contactEmail);
      if (d.contactWebsite) this.set('listing.contactWebsite', d.contactWebsite);
      if (d.contactPhone) this.set('listing.contactPhone', d.contactPhone);
      this.renderForm();
      const im = r.images || {};
      toast(`Fiche reprise. En ligne : ${im.phoneScreenshots || 0} capture(s), ${im.featureGraphic ? 'une bannière' : 'pas de bannière'}.`, { action: 'Annuler', onAction: () => { this.cfg.listing = before; this.save(); this.renderForm(); } });
    } finally { n.close(); }
  };

  proto.act_listing_push = async function act() {
    const l = L(this, this.cfg);
    const n = busy('Envoi de la fiche sur Google Play…');
    try {
      const r = await api.invoke('android:listing-push', {
        appId: this.cfg.appId, lang: l.lang,
        listing: { title: l.title, shortDescription: l.shortDescription, fullDescription: l.fullDescription, video: l.video },
        details: { contactEmail: l.contactEmail, contactWebsite: l.contactWebsite, contactPhone: l.contactPhone },
      });
      this.cfg.lastListing = { at: Date.now(), sentForReview: r.sentForReview, images: r.images };
      this.save();
      this.renderForm();
      const imgs = Object.entries(r.images || {}).map(([k, v]) => `${v} ${KIND_LABEL[k] ? KIND_LABEL[k].toLowerCase() : k}`).join(', ');
      toast(`Fiche envoyée${imgs ? ` (${imgs})` : ''}.${r.sentForReview === false ? ' Lancez l’examen depuis la Play Console (Vue d’ensemble des publications).' : ' Google l’examine avant de la publier.'}`);
    } finally { n.close(); }
  };
}
