// NEXORA #115 : section « Modules » de l'App Builder : OneSignal (notifications push), Google AdMob (publicités),
// Google Analytics pour Firebase (audience) et Meta (événements pour les campagnes Facebook et Instagram).
// L'application construite avec un module contient le SDK officiel (kit préparé une fois par
// src/android/modules.js) et expose NexoraApp.onesignal, NexoraApp.ads, NexoraApp.analytics ou NexoraApp.meta.
import { api, esc, toast, busy, $, $$, pickFile } from '../core.js';
import { b as icon } from '../../dist/chunks/chunk-S4I2LXHS.js';

export const SECTION = ['modules', 'Modules', 'nxComponent', 'OneSignal, AdMob, Google Analytics, Meta'];

// Mêmes formats que src/android/modules.js (contrôles avant construction).
const RE = {
  oneSignalApp: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  admobApp: /^ca-app-pub-\d{16}~\d{10}$/,
  admobUnit: /^ca-app-pub-\d{16}\/\d{10}$/,
  metaApp: /^\d{6,20}$/,
  metaToken: /^[0-9a-f]{32}$/i,
};
const MODS = [
  ['onesignal', 'OneSignal', 'bell', 'Notifications push envoyées depuis le tableau de bord OneSignal : campagnes, segments, messages automatiques.', 'https://dashboard.onesignal.com/'],
  ['admob', 'Google AdMob', 'tv', 'Publicités : bannière, interstitiel et vidéo avec récompense, avec le consentement exigé en Europe.', 'https://apps.admob.com/'],
  ['analytics', 'Google Analytics', 'nxiChart', 'Audience : utilisateurs actifs, écrans vus, événements et conversions, dans la console Firebase.', 'https://console.firebase.google.com/'],
  ['meta', 'Meta', 'target', 'Événements d’application pour mesurer et optimiser vos campagnes Facebook et Instagram.', 'https://developers.facebook.com/apps/'],
];

const SAMPLES = {
  onesignal: `// NexoraApp.onesignal existe seulement dans l’application Android construite avec OneSignal.
const os = window.NexoraApp && NexoraApp.onesignal;
if (os && os.available) {
  // Après la connexion de votre client : ses notifications le suivent sur tous ses appareils.
  os.login(idClient);
  os.tag('ville', 'Abidjan');          // segments du tableau de bord OneSignal
  const etat = await os.status();     // { subscriptionId, optedIn, permission }
  os.onOpen((n) => console.log('Notification touchée', n.url, n.data));
  // À la déconnexion :
  // os.logout();
}`,
  admob: `// NexoraApp.ads existe seulement dans l’application Android construite avec AdMob.
const ads = window.NexoraApp && NexoraApp.ads;
if (ads && ads.available) {
  // La bannière s’affiche seule ; sa hauteur est dans la variable CSS --nexora-banner.
  await ads.loadInterstitial();
  boutonSuivant.onclick = () => ads.showInterstitial().catch(() => {});

  // Vidéo avec récompense : débloquez le bonus seulement si elle a été regardée jusqu’au bout.
  await ads.loadRewarded();
  const r = await ads.showRewarded();  // { earned, amount, type }
  if (r.earned) ajouterPieces(r.amount);

  // Lien « Confidentialité » de votre page (obligatoire en Europe) :
  // ads.privacyOptions();
}`,
  analytics: `// NexoraApp.analytics existe seulement dans l’application Android construite avec Google Analytics.
const ga = window.NexoraApp && NexoraApp.analytics;
if (ga && ga.available) {
  ga.userId(idClient);                         // facultatif
  ga.event('add_to_cart', { item_id: 'p42', value: 4500, currency: 'XOF' });
  ga.event('purchase', { transaction_id: 'C-1007', value: 12000, currency: 'XOF' });
  // Les écrans sont suivis automatiquement (chaque page et changement d’adresse).
}`,
  meta: `// NexoraApp.meta existe seulement dans l’application Android construite avec Meta.
const meta = window.NexoraApp && NexoraApp.meta;
if (meta && meta.available) {
  meta.event('fb_mobile_add_to_cart', { fb_content_id: 'p42' }, 4500);
  meta.purchase(12000, 'XOF', { fb_content_type: 'product' });
  meta.userId(idClient);                       // facultatif
}`,
};

function conf(cfg, id) {
  const c = cfg[id] || (cfg[id] = {});
  if (c.enabled == null) c.enabled = false;
  if (id === 'onesignal') { if (c.ask == null) c.ask = true; if (c.appId == null) c.appId = ''; }
  if (id === 'admob') {
    if (c.test == null) c.test = true;
    if (c.consent == null) c.consent = true;
    if (c.webview == null) c.webview = false;
    if (c.appId == null) c.appId = '';
    c.banner = { unit: '', position: 'bottom', auto: true, ...(c.banner || {}) };
    c.interstitial = { unit: '', ...(c.interstitial || {}) };
    c.rewarded = { unit: '', ...(c.rewarded || {}) };
  }
  if (id === 'analytics') { if (c.collect == null) c.collect = true; if (c.autoScreens == null) c.autoScreens = true; if (c.googleServices == null) c.googleServices = ''; }
  if (id === 'meta') { if (c.appId == null) c.appId = ''; if (c.clientToken == null) c.clientToken = ''; if (c.autoEvents == null) c.autoEvents = true; if (c.advertiserId == null) c.advertiserId = true; }
  return c;
}
const pushOn = (cfg) => Boolean(cfg.push && cfg.push.enabled);
const pushGs = (cfg) => (cfg.push && cfg.push.googleServices) || '';
const fmtSize = (n) => `${(Number(n || 0) / 1e6).toFixed(1).replace('.', ',')} Mo`;

function gsProject(text) {
  try { const j = JSON.parse(text); return (j.project_info && j.project_info.project_id) || ''; } catch { return ''; }
}

/* Problèmes de configuration d'un module (mêmes règles que la construction). */
export function problems(cfg) {
  const out = [];
  const twa = cfg.engine === 'twa' && cfg.source && cfg.source.kind === 'url';
  for (const [id, label] of MODS) {
    const c = cfg[id];
    if (!c || !c.enabled) continue;
    if (twa) { out.push(`${label} : choisissez le moteur NEX-WEBVIEW (section Source), le mode Trusted Web Activity n’est pas pris en charge.`); continue; }
    if (id === 'onesignal') {
      if (!RE.oneSignalApp.test(String(c.appId || '').trim())) out.push('OneSignal : indiquez l’identifiant de l’application OneSignal (Settings › Keys & IDs).');
      if (pushOn(cfg)) out.push('OneSignal : désactivez les notifications push Firebase (section Notifications push), une application ne reçoit ses notifications que par un seul service.');
    }
    if (id === 'admob' && !c.test) {
      if (!RE.admobApp.test(String(c.appId || '').trim())) out.push('AdMob : indiquez l’identifiant de l’application AdMob (ca-app-pub-…~…), ou gardez le mode test.');
      for (const k of ['banner', 'interstitial', 'rewarded']) {
        const v = String((c[k] && c[k].unit) || '').trim();
        if (v && !RE.admobUnit.test(v)) out.push(`AdMob : identifiant de bloc d’annonces invalide (${v}).`);
      }
    }
    if (id === 'analytics' && !pushOn(cfg) && !String(c.googleServices || '').trim()) out.push('Google Analytics : importez le fichier google-services.json de votre projet Firebase.');
    if (id === 'meta') {
      if (!RE.metaApp.test(String(c.appId || '').trim())) out.push('Meta : indiquez l’identifiant de l’application Meta.');
      if (!RE.metaToken.test(String(c.clientToken || '').trim())) out.push('Meta : indiquez le jeton client (32 caractères).');
    }
  }
  return out;
}

export function install(proto, SECTIONS) {
  const at = SECTIONS.findIndex((s) => s[0] === 'billing');
  if (!SECTIONS.some((s) => s[0] === SECTION[0])) SECTIONS.splice(at < 0 ? SECTIONS.length : at + 1, 0, SECTION);

  proto.nxModStatus = function nxModStatus(force = false) {
    if ((this.nxMod && !force) || this.nxModLoading) return;
    this.nxModLoading = true;
    api.invoke('android:module-status').catch(() => ({})).then((st) => {
      this.nxMod = st || {}; this.nxModLoading = false;
      if (this.section === 'modules') this.renderForm();
    });
    if (!this.nxModBound) {
      this.nxModBound = true;
      api.on('android:progress', (p) => {
        if (!p || !/^module-/.test(p.part || '')) return;
        const el = $(`[data-nxm-prog="${p.part.slice(7)}"]`, this.el);
        if (el) el.textContent = `${p.label || ''}${p.progress != null ? ` · ${Math.round(p.progress * 100)} %` : ''}`;
      });
    }
  };

  proto.form_modules = function formModules(cfg) {
    this.nxModStatus();
    const twa = cfg.engine === 'twa' && cfg.source.kind === 'url';
    const st = this.nxMod || {};
    for (const [id] of MODS) conf(cfg, id);
    const issues = problems(cfg);
    const kit = (id) => {
      const k = st[id];
      if (!this.nxMod) return '<span class="ab-hint"><span class="spinner small"></span> Vérification du kit…</span>';
      if (k && k.installed) return `<span class="ab-okchip">${icon('check', 12)} Kit ${esc(k.label || '')} ${esc(k.version || '')} prêt</span><small class="ab-hint">${k.artifacts || 0} bibliothèques, ${fmtSize(k.size)}</small>`;
      return `<span class="ab-hint">Le SDK officiel (${esc((k && k.size) || '≈ 5 Mo')}) est préparé une fois sur ce PC, automatiquement à la première construction.</span><button class="btn small" data-act="module-install" data-mod="${id}">${icon('download', 13)}<span>Préparer maintenant</span></button><small class="ab-hint" data-nxm-prog="${id}"></small>`;
    };
    const code = (id) => `<details class="nxm-code"><summary>${icon('code', 13)}<span>Dans votre page : NexoraApp.${id === 'admob' ? 'ads' : id}</span></summary><pre class="nxb-code">${esc(SAMPLES[id])}</pre><div class="ab-row"><button class="btn small" data-copy="${esc(SAMPLES[id])}">${icon('copy', 13)}<span>Copier le code</span></button></div></details>`;
    const head = (id, label, ic, sub, url) => `<div class="nxm-head"><span class="nxm-ic" aria-hidden="true">${icon(ic, 18)}</span><div class="nxm-ttl"><b>${label}</b><small>${sub}</small></div><button class="btn small" data-external="${url}">${icon('external', 13)}<span>Tableau de bord</span></button></div>`;

    let h = this.card('', `
      <p class="ab-hint">Ajoutez à l’application les services les plus utilisés. Chaque module intègre le SDK officiel de son éditeur et l’ouvre à votre page web par <code>NexoraApp</code> : aucune ligne de code Android à écrire.</p>
      ${twa ? `<div class="ab-note">${icon('info', 15)}<span>Le mode Trusted Web Activity n’est pas pris en charge : choisissez le moteur NEX-WEBVIEW (section Source) pour utiliser des modules.</span></div>` : ''}
      <div class="nxm-grid">${MODS.map(([id, label, ic]) => `<button type="button" class="nxm-tile${cfg[id].enabled ? ' on' : ''}" data-nxm-go="${id}"><span class="nxm-ic" aria-hidden="true">${icon(ic, 16)}</span><span class="nxm-tile-t"><b>${label}</b><small>${cfg[id].enabled ? (st[id] && st[id].installed ? 'Activé · kit prêt' : 'Activé') : 'Désactivé'}</small></span></button>`).join('')}</div>
      ${issues.length ? `<ul class="nxm-issues">${issues.map((x) => `<li>${icon('warn', 13)}<span>${esc(x)}</span></li>`).join('')}</ul>` : ''}`);

    // OneSignal
    const o = cfg.onesignal;
    h += this.card('', `<div data-nxm="onesignal">${head(...MODS[0])}
      ${this.tog('Activer OneSignal', 'onesignal.enabled', 'Le SDK OneSignal (environ 6 Mo) est intégré à l’application, NexoraApp.onesignal à votre page.')}
      ${o.enabled ? `
        ${pushOn(cfg) ? `<div class="ab-note">${icon('warn', 15)}<span>Les notifications push Firebase de NEXORA sont actives : une application ne reçoit ses notifications que par un seul service. Désactivez-les dans la section Notifications push.</span><button class="btn small" data-sec="push">${icon('bell', 13)}<span>Notifications push</span></button></div>` : ''}
        ${this.field('Identifiant de l’application OneSignal (App ID)', 'onesignal.appId', { placeholder: '5f0c9a2e-1b2c-4d3e-8f90-123456789abc', hint: 'Tableau de bord OneSignal › Settings › Keys & IDs. Reliez-y votre projet Firebase (Settings › Push & In-App › Google Android) : OneSignal s’en sert pour livrer les notifications.' })}
        ${o.appId && !RE.oneSignalApp.test(o.appId.trim()) ? '<p class="ab-err">Format attendu : 8-4-4-4-12 caractères (lettres a à f et chiffres).</p>' : ''}
        ${this.tog('Demander l’autorisation au premier lancement', 'onesignal.ask', 'Sinon, votre page la demande au bon moment avec NexoraApp.onesignal.requestPermission().')}
        <div class="ab-row">${kit('onesignal')}</div>${code('onesignal')}` : ''}</div>`);

    // AdMob
    const a = cfg.admob;
    h += this.card('', `<div data-nxm="admob">${head(...MODS[1])}
      ${this.tog('Activer AdMob', 'admob.enabled', 'Le SDK Google Mobile Ads (environ 8 Mo) est intégré à l’application, NexoraApp.ads à votre page.')}
      ${a.enabled ? `
        ${this.tog('Mode test (annonces de démonstration de Google)', 'admob.test', 'Gardez-le pendant vos essais : cliquer sur vos propres annonces réelles peut suspendre votre compte AdMob. Décochez-le pour la version publiée.')}
        ${a.test ? `<p class="ab-hint">${icon('info', 12)} Les identifiants de test publiés par Google remplacent les vôtres tant que ce mode est coché.</p>` : ''}
        ${this.field('Identifiant de l’application AdMob', 'admob.appId', { placeholder: 'ca-app-pub-1234567890123456~1234567890', hint: 'AdMob › Applications › Paramètres de l’application.' })}
        <div class="ab-grid2">${this.field('Bannière : identifiant du bloc', 'admob.banner.unit', { placeholder: 'ca-app-pub-…/…' })}${this.field('Position de la bannière', 'admob.banner.position', { type: 'select', options: { bottom: 'En bas', top: 'En haut' } })}</div>
        ${this.tog('Afficher la bannière dès l’ouverture', 'admob.banner.auto', 'Sinon, votre page l’affiche avec NexoraApp.ads.showBanner(). La page rétrécit : la bannière ne cache jamais votre contenu.')}
        <div class="ab-grid2">${this.field('Interstitiel : identifiant du bloc', 'admob.interstitial.unit', { placeholder: 'ca-app-pub-…/…' })}${this.field('Vidéo avec récompense : identifiant du bloc', 'admob.rewarded.unit', { placeholder: 'ca-app-pub-…/…' })}</div>
        ${this.tog('Demander le consentement (Europe, Royaume-Uni, Suisse)', 'admob.consent', 'Formulaire de consentement de Google (UMP), à configurer dans AdMob › Confidentialité et messages. Obligatoire pour diffuser des annonces dans ces pays.')}
        ${this.tog('Monétiser aussi les annonces web de votre site', 'admob.webview', 'Pour un site qui affiche déjà AdSense ou Google Ad Manager : ses annonces sont rattachées à l’application (meilleure rémunération).')}
        <div class="ab-row">${kit('admob')}</div>${code('admob')}
        <p class="ab-hint">Fichier <code>app-ads.txt</code> : publiez-le à la racine du site du développeur indiqué sur la fiche Play Store (AdMob › Applications › app-ads.txt).</p>` : ''}</div>`);

    // Google Analytics
    const g = cfg.analytics;
    const gsText = pushOn(cfg) ? pushGs(cfg) : g.googleServices;
    const proj = gsProject(gsText);
    h += this.card('', `<div data-nxm="analytics">${head(...MODS[2])}
      ${this.tog('Activer Google Analytics', 'analytics.enabled', 'Google Analytics pour Firebase (environ 3 Mo) est intégré à l’application, NexoraApp.analytics à votre page.')}
      ${g.enabled ? `
        ${pushOn(cfg) ? `<p class="ab-hint">${icon('check', 12)} Projet Firebase des notifications push utilisé${proj ? ` : <b>${esc(proj)}</b>` : ''}.</p>` : `
          <div class="ab-row"><button class="btn small" data-act="module-gs">${icon('upload', 13)}<span>${g.googleServices ? 'Remplacer google-services.json' : 'Importer google-services.json'}</span></button>${proj ? `<span class="ab-okchip">${icon('check', 12)} Projet ${esc(proj)}</span>` : ''}</div>
          <p class="ab-hint">Console Firebase › Ajouter une application › Android, avec l’identifiant <code>${esc(cfg.appId || '—')}</code>, puis téléchargez le fichier. Activez Google Analytics dans les paramètres du projet.</p>`}
        ${this.tog('Suivre les écrans automatiquement', 'analytics.autoScreens', 'Chaque page et chaque changement d’adresse devient un écran vu (screen_view).')}
        ${this.tog('Collecter dès l’ouverture', 'analytics.collect', 'Décochez si votre page attend l’accord de l’utilisateur : elle activera la collecte avec NexoraApp.analytics.enable(true).')}
        <div class="ab-row">${kit('analytics')}</div>${code('analytics')}` : ''}</div>`);

    // Meta
    const m = cfg.meta;
    h += this.card('', `<div data-nxm="meta">${head(...MODS[3])}
      ${this.tog('Activer Meta', 'meta.enabled', 'Le SDK Facebook (événements d’application, environ 2 Mo) est intégré à l’application, NexoraApp.meta à votre page.')}
      ${m.enabled ? `
        <div class="ab-grid2">${this.field('Identifiant de l’application Meta', 'meta.appId', { placeholder: '123456789012345', hint: 'Meta for Developers › votre application › Paramètres › Général.' })}${this.field('Jeton client', 'meta.clientToken', { placeholder: '32 caractères', hint: 'Paramètres › Avancé › Sécurité › Jeton client.' })}</div>
        ${this.tog('Événements automatiques', 'meta.autoEvents', 'Installations, ouvertures et achats intégrés mesurés sans code. À indiquer dans la déclaration « Sécurité des données » de la Play Console.')}
        ${this.tog('Identifiant publicitaire', 'meta.advertiserId', 'Permet d’attribuer les installations à vos campagnes. Décochez si votre public est composé d’enfants.')}
        <div class="ab-row">${kit('meta')}</div>${code('meta')}` : ''}</div>`);
    return h;
  };

  if (!proto.nxModBoundClick) {
    proto.nxModBoundClick = true;
    const render0 = proto.render;
    proto.render = function render(...args) {
      const r = render0.apply(this, args);
      if (this.el && !this.nxModClick) {
        this.nxModClick = true;
        this.el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-nxm-go]');
          if (!b || this.section !== 'modules') return;
          const card = $(`[data-nxm="${b.dataset.nxmGo}"]`, this.el);
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      return r;
    };
  }

  // Les actions reçoivent le bouton cliqué (data-act).
  proto.act_module_install = async function act(btn) {
    const id = (btn && btn.dataset && btn.dataset.mod) || '';
    const label = (MODS.find((x) => x[0] === id) || [])[1] || 'module';
    const n = busy(`Préparation du kit ${label}…`);
    try {
      await api.invoke('android:module-install', { id });
      this.nxModStatus(true);
      toast(`Kit ${label} prêt.`);
    } finally { n.close(); }
  };
  proto.act_module_gs = async function act() {
    const r = await pickFile({ title: 'Choisir le fichier google-services.json', name: 'Fichier Firebase', extensions: ['json'], as: 'bytes' });
    if (!r || !r.data) return;
    const text = new TextDecoder().decode(r.data);
    let j = null;
    try { j = JSON.parse(text); } catch { /* vérifié ci-dessous */ }
    if (!j || !j.project_info || !Array.isArray(j.client)) throw new Error('Ce fichier n’est pas un google-services.json de Firebase.');
    const pkgs = j.client.map((c) => c.client_info && c.client_info.android_client_info && c.client_info.android_client_info.package_name).filter(Boolean);
    if (this.cfg.appId && pkgs.length && !pkgs.includes(this.cfg.appId)) throw new Error(`Ce fichier est pour « ${pkgs.join(', ')} » : il doit contenir l’application « ${this.cfg.appId} ».`);
    this.set('analytics.googleServices', text, { rerender: true });
    toast(`Projet Firebase « ${j.project_info.project_id} » relié à Google Analytics.`);
  };

  // Aperçu : bannière d'essai AdMob dans le téléphone (vue de l'application), là où elle s'affichera.
  const preview0 = proto.renderPreview;
  proto.renderPreview = function renderPreview(...args) {
    const r = preview0.apply(this, args);
    try {
      const appEl = this.el && $('.ab-screen .ab-app', this.el);
      const old = appEl && $('.nxm-ad', appEl);
      const a = this.cfg && this.cfg.admob;
      const show = appEl && a && a.enabled && a.banner && a.banner.auto !== false && (a.test || String(a.banner.unit || '').trim()) && !(this.cfg.engine === 'twa' && this.cfg.source.kind === 'url');
      if (!show) { if (old) old.remove(); return r; }
      const top = a.banner.position === 'top';
      const ad = old || document.createElement('div');
      ad.className = 'nxm-ad';
      ad.innerHTML = `<span class="nxm-ad-tag">Annonce</span><span class="nxm-ad-txt"><b>${a.test ? 'Annonce de test' : 'Bannière AdMob'}</b><small>${a.test ? 'Google AdMob · mode test' : 'Bannière adaptative · Google AdMob'}</small></span><span class="nxm-ad-btn">Ouvrir</span>`;
      const content = $('.ab-content', appEl);
      if (content) appEl.insertBefore(ad, top ? content : content.nextSibling);
    } catch { /* aperçu facultatif */ }
    return r;
  };

  // Construction : réglages des modules dans la configuration de l'application.
  const spec0 = proto.spec;
  proto.spec = async function spec() {
    const s = await spec0.call(this);
    const cfg = this.cfg;
    for (const [id] of MODS) {
      const c = cfg[id];
      if (!c || !c.enabled) continue;
      if (id === 'onesignal') s.onesignal = { enabled: true, appId: String(c.appId || '').trim(), ask: c.ask !== false };
      if (id === 'admob') s.admob = { enabled: true, test: c.test !== false, appId: String(c.appId || '').trim(), consent: c.consent !== false, webview: Boolean(c.webview), banner: { ...c.banner, unit: String(c.banner.unit || '').trim() || (c.test !== false ? 'test' : '') }, interstitial: { unit: String(c.interstitial.unit || '').trim() || (c.test !== false ? 'test' : '') }, rewarded: { unit: String(c.rewarded.unit || '').trim() || (c.test !== false ? 'test' : '') } };
      if (id === 'analytics') s.analytics = { enabled: true, collect: c.collect !== false, autoScreens: c.autoScreens !== false, googleServices: pushOn(cfg) ? '' : c.googleServices || '' };
      if (id === 'meta') s.meta = { enabled: true, appId: String(c.appId || '').trim(), clientToken: String(c.clientToken || '').trim(), autoEvents: c.autoEvents !== false, advertiserId: c.advertiserId !== false };
    }
    return s;
  };
  const validate0 = proto.validate;
  proto.validate = function validate() {
    const out = validate0.call(this) || [];
    for (const msg of problems(this.cfg)) out.push(['modules', msg]);
    return out;
  };
}
