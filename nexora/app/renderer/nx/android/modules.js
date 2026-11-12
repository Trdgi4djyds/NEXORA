// NEXORA #114 : sections « OneSignal » et « Publicités AdMob » de l'App Builder. L'application construite avec un
// module contient le SDK officiel (kit préparé une fois par src/android/modules.js) et expose NexoraApp.onesignal ou
// NexoraApp.ads à la page. Réglages dans cfg.onesignal et cfg.ads, ajoutés à spec() ; contrôles dans validate() et
// dans « Prêt pour le Play Store ».
import { api, esc, toast, busy, $ } from '../core.js';
import { b as icon } from '../../dist/chunks/chunk-S4I2LXHS.js';

export const SECTION_OS = ['onesignal', 'OneSignal', 'bell', 'Notifications push par OneSignal'];
export const SECTION_ADS = ['admob', 'Publicités AdMob', 'nxiCoins', 'Bannière, interstitiel, récompense'];

const OS_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADM_APP = /^ca-app-pub-\d{16}~\d{10}$/;
const ADM_UNIT = /^ca-app-pub-\d{16}\/\d{10}$/;
const fmtSize = (n) => `${(Number(n || 0) / 1e6).toFixed(1).replace('.', ',')} Mo`;
const FORMATS = [
  ['banner', 'Bannière', 'Bandeau adaptatif en haut ou en bas de l’écran, sans jamais masquer la page.'],
  ['interstitial', 'Interstitiel', 'Annonce plein écran entre deux pages, au moment que vous choisissez.'],
  ['rewarded', 'Vidéo avec récompense', 'Le client choisit de regarder une vidéo pour obtenir un bonus (pièces, essai, contenu).'],
];

function osDefaults(cfg) {
  const o = cfg.onesignal || (cfg.onesignal = {});
  if (o.enabled == null) o.enabled = false;
  if (o.appId == null) o.appId = '';
  if (o.ask == null) o.ask = true;
  if (o.openUrls == null) o.openUrls = true;
  if (o.consentRequired == null) o.consentRequired = false;
  if (!Array.isArray(o.tags)) o.tags = [];
  return o;
}
function adsDefaults(cfg) {
  const a = cfg.ads || (cfg.ads = {});
  if (a.enabled == null) a.enabled = false;
  if (a.test == null) a.test = true;
  if (a.appId == null) a.appId = '';
  for (const [k] of FORMATS) if (!a[k]) a[k] = { enabled: k === 'banner', id: '' };
  if (!a.banner.position) a.banner.position = 'bottom';
  if (a.banner.auto == null) a.banner.auto = true;
  if (a.interstitial.every == null) a.interstitial.every = 0;
  if (a.interstitial.minGap == null) a.interstitial.minGap = 90;
  if (a.child == null) a.child = false;
  if (a.rating == null) a.rating = '';
  return a;
}
const appAdsLine = (appId) => { const m = /^ca-app-pub-(\d{16})~/.exec(String(appId || '').trim()); return m ? `google.com, pub-${m[1]}, DIRECT, f08c47fec0942fa0` : ''; };

const OS_SAMPLE = `// NexoraApp.onesignal existe seulement dans l’application Android construite avec le module OneSignal.
const os = window.NexoraApp && NexoraApp.onesignal;
if (os && os.available) {
  // 1. Après la connexion du client : relie ce téléphone à son compte (envois ciblés depuis OneSignal)
  await os.login(client.id);
  // 2. Étiquettes pour vos segments (valeur vide = étiquette retirée)
  await os.tags({ offre: 'pro', ville: 'Abidjan' });
  // 3. Notification touchée : le lien s’ouvre déjà dans l’application ; données supplémentaires ici
  os.onClick((n) => console.log(n.title, n.url, n.data));
  // À la déconnexion
  // await os.logout();
}`;
const ADS_SAMPLE = `// NexoraApp.ads existe seulement dans l’application Android construite avec le module AdMob.
const ads = window.NexoraApp && NexoraApp.ads;
if (ads && ads.available) {
  // Interstitiel à un moment naturel (fin de niveau, retour à l’accueil…)
  boutonSuivant.onclick = () => ads.interstitial().catch(() => {}).finally(allerPageSuivante);

  // Vidéo avec récompense : le bonus n’est donné que si la vidéo est regardée jusqu’au bout
  boutonBonus.onclick = async () => {
    try { const r = await ads.rewarded(); ajouterPieces(r.amount); } catch (e) { alert(e.message); }
  };

  // Bannière masquée sur une page de paiement
  ads.banner(false);

  // Lien « Gérer mes choix de confidentialité » (obligatoire en Europe quand le formulaire s’applique)
  const etat = await ads.state();
  if (etat.privacyOptions) lienConfidentialite.onclick = () => ads.privacyOptions();
}`;

export function install(proto, SECTIONS) {
  let at = SECTIONS.findIndex((s) => s[0] === 'messaging');
  if (at < 0) at = SECTIONS.findIndex((s) => s[0] === 'push');
  if (!SECTIONS.some((s) => s[0] === SECTION_OS[0])) SECTIONS.splice(at < 0 ? SECTIONS.length : at + 1, 0, SECTION_OS);
  let at2 = SECTIONS.findIndex((s) => s[0] === 'billing');
  if (at2 < 0) at2 = SECTIONS.findIndex((s) => s[0] === 'store');
  if (!SECTIONS.some((s) => s[0] === SECTION_ADS[0])) SECTIONS.splice(at2 < 0 ? SECTIONS.length : at2 + 1, 0, SECTION_ADS);

  proto.nxModStatus = function nxModStatus(part, force = false) {
    const key = `nxMod_${part}`;
    if ((this[key] && !force) || this[`${key}_loading`]) return;
    this[`${key}_loading`] = true;
    api.invoke(`android:${part}-status`).catch(() => ({ installed: false })).then((st) => {
      this[key] = st; this[`${key}_loading`] = false;
      if (this.section === part) this.renderForm();
    });
    if (!this.nxModBound) {
      this.nxModBound = true;
      api.on('android:progress', (p) => {
        if (!p || (p.part !== 'onesignal' && p.part !== 'admob')) return;
        const el = $(`[data-nxmod-prog="${p.part}"]`, this.el);
        if (el) el.textContent = `${p.label || ''}${p.progress != null ? ` · ${Math.round(p.progress * 100)} %` : ''}`;
      });
    }
  };

  const kitRow = (inst, part, lib, weight) => {
    inst.nxModStatus(part);
    const st = inst[`nxMod_${part}`];
    if (!st) return '<span class="ab-hint"><span class="spinner small"></span> Vérification du kit…</span>';
    if (st.installed) return `<span class="ab-okchip">${icon('check', 12)} Kit ${esc(lib)} ${esc(st.version || '')} prêt</span><small class="ab-hint">${st.artifacts || 0} bibliothèques, ${fmtSize(st.size)}</small>`;
    return `<span class="ab-hint">Le kit (SDK officiel et ses dépendances, environ ${weight}) est préparé une fois sur ce PC, automatiquement à la première construction.</span><button class="btn small" data-act="${part}-install">${icon('download', 13)}<span>Préparer maintenant</span></button><small class="ab-hint" data-nxmod-prog="${part}"></small>`;
  };
  const twaNote = (cfg, what) => (cfg.engine === 'twa' && cfg.source.kind === 'url' ? `<div class="ab-note">${icon('info', 15)}<span>Le mode Trusted Web Activity n’est pas pris en charge ici : choisissez le moteur NEX-WEBVIEW (section Source) pour ${what}.</span></div>` : '');

  // ---------------------------------------------------------------- OneSignal
  proto.form_onesignal = function formOneSignal(cfg) {
    const o = osDefaults(cfg);
    const push = cfg.push && cfg.push.enabled;
    const badId = o.appId && !OS_ID.test(o.appId.trim());
    let h = this.card('Notifications push avec OneSignal', `
      <p class="ab-hint">OneSignal envoie vos notifications depuis son tableau de bord ou son API (campagnes, segments, envois programmés, statistiques), sans projet Firebase dans l’application ni serveur à écrire. Le SDK officiel est ajouté à l’application (environ 2 Mo) avec <code>NexoraApp.onesignal</code> pour votre page.</p>
      ${twaNote(cfg, 'OneSignal')}
      <div class="ab-row">${kitRow(this, 'onesignal', 'OneSignal', '6 Mo')}</div>
      ${this.tog('Activer OneSignal', 'onesignal.enabled', 'Remplace les notifications push de NEXORA (Firebase) : un seul service de notifications par application.')}
      ${o.enabled && push ? `<div class="ab-note warn">${icon('warn', 15)}<span>Les notifications push de NEXORA (Firebase) sont aussi activées : les deux ne peuvent pas fonctionner ensemble.</span><button class="btn small" data-act="onesignal-nopush">Désactiver les notifications Firebase</button></div>` : ''}`);
    if (!o.enabled) {
      h += this.card('Pour commencer', `<ol class="ab-psteps">
        <li class="ab-pstep"><i>1</i><div><b>Créer l’application dans OneSignal</b><p>onesignal.com › New App › Google Android (FCM). OneSignal vous guide pour relier un projet Firebase : c’est OneSignal qui l’utilise, pas votre application.</p></div></li>
        <li class="ab-pstep"><i>2</i><div><b>Copier l’identifiant</b><p>Settings › Keys &amp; IDs › OneSignal App ID, à coller ici après activation.</p></div></li>
        <li class="ab-pstep"><i>3</i><div><b>Construire et installer</b><p>Chaque téléphone qui accepte les notifications apparaît dans Audience › Subscriptions.</p></div></li></ol>
        <div class="ab-row"><button class="btn small" data-external="https://dashboard.onesignal.com">${icon('external', 13)}<span>Tableau de bord OneSignal</span></button><button class="btn small" data-external="https://documentation.onesignal.com/docs/android-sdk-setup">${icon('external', 13)}<span>Documentation</span></button></div>`);
      return h;
    }
    h += this.card('Réglages', `
      <label class="field"><span>Identifiant de l’application OneSignal (App ID)</span><input class="input${badId ? ' bad' : ''}" data-k="onesignal.appId" value="${esc(o.appId)}" placeholder="00000000-0000-0000-0000-000000000000" spellcheck="false"></label>
      ${badId ? '<p class="ab-hint bad">Identifiant invalide : 36 caractères, de la forme 8-4-4-4-12 (Settings › Keys &amp; IDs).</p>' : ''}
      ${this.tog('Demander l’autorisation au premier lancement', 'onesignal.ask', 'Android 13 et plus : sinon, votre page la demande au bon moment avec NexoraApp.onesignal.requestPermission().')}
      ${this.tog('Ouvrir les liens des notifications dans l’application', 'onesignal.openUrls', 'Le lien (Launch URL ou donnée « url ») s’affiche dans l’application plutôt que dans le navigateur.')}
      ${this.tog('Attendre le consentement de l’utilisateur', 'onesignal.consentRequired', 'RGPD : rien n’est envoyé à OneSignal tant que votre page n’appelle pas NexoraApp.onesignal.consent(true).')}`);
    h += this.card('Étiquettes posées à l’installation', `
      <p class="ab-hint">Étiquettes fixes ajoutées à chaque abonné (par exemple <code>source = android</code>) ; votre page peut en ajouter d’autres avec <code>tags()</code>.</p>
      <div class="nxb-products">${o.tags.map((t, i) => `<div class="nxb-prod nxmod-tag">
          <input class="input" data-k="onesignal.tags.${i}.key" value="${esc(t.key || '')}" placeholder="Clé" spellcheck="false" aria-label="Clé">
          <input class="input" data-k="onesignal.tags.${i}.value" value="${esc(t.value || '')}" placeholder="Valeur" spellcheck="false" aria-label="Valeur">
          <button class="icon-btn" data-list-del="onesignal.tags" data-i="${i}" title="Retirer">${icon('close', 13)}</button></div>`).join('') || '<p class="ab-hint">Aucune étiquette.</p>'}</div>
      <div class="ab-row"><button class="btn small" data-act="onesignal-tag">${icon('plus', 13)}<span>Ajouter une étiquette</span></button></div>`);
    h += this.card('Dans votre page', `
      <p class="ab-hint">Reliez chaque téléphone au compte de votre client pour lui écrire depuis OneSignal ou votre serveur (API REST de OneSignal, champ <code>include_aliases.external_id</code>).</p>
      <pre class="nxb-code">${esc(OS_SAMPLE)}</pre>
      <div class="ab-row"><button class="btn small" data-copy="${esc(OS_SAMPLE)}">${icon('copy', 13)}<span>Copier le code</span></button><button class="btn small" data-external="https://dashboard.onesignal.com">${icon('external', 13)}<span>Envoyer une notification</span></button></div>`);
    return h;
  };
  proto.act_onesignal_install = async function act() { await installKit(this, 'onesignal', 'OneSignal'); };
  proto.act_onesignal_tag = async function act() {
    const o = osDefaults(this.cfg);
    this.set('onesignal.tags', [...o.tags, { key: '', value: '' }], { rerender: true });
  };
  proto.act_onesignal_nopush = async function act() {
    this.set('push.enabled', false, { rerender: true });
    toast('Notifications push Firebase désactivées : OneSignal s’en charge.');
  };

  // ---------------------------------------------------------------- AdMob
  proto.form_admob = function formAdmob(cfg) {
    const a = adsDefaults(cfg);
    let h = this.card('Publicités avec Google AdMob', `
      <p class="ab-hint">Gagnez de l’argent avec des annonces Google dans l’application. Le SDK Google Mobile Ads et le formulaire de consentement de Google (obligatoire dans l’Espace économique européen, au Royaume-Uni et en Suisse) sont ajoutés à l’application (environ 5 Mo), avec <code>NexoraApp.ads</code> pour votre page.</p>
      ${twaNote(cfg, 'AdMob')}
      <div class="ab-row">${kitRow(this, 'admob', 'AdMob', '12 Mo')}</div>
      ${this.tog('Activer les publicités AdMob', 'ads.enabled', 'Déclarez ensuite « Contient des annonces » dans la Play Console (Contenu de l’application).')}`);
    if (!a.enabled) return h;
    const bad = (k) => !a.test && a[k].enabled && !ADM_UNIT.test(String(a[k].id || '').trim());
    const badApp = !a.test && !ADM_APP.test(String(a.appId || '').trim());
    h += this.card('Compte AdMob', `
      ${this.tog('Mode test (annonces d’essai de Google)', 'ads.test', 'À garder pendant vos essais : cliquer sur vos propres annonces réelles peut faire suspendre le compte AdMob. Décochez pour la version publiée.')}
      ${a.test ? `<div class="ab-note">${icon('info', 15)}<span>Les identifiants d’essai publiés par Google remplacent les vôtres : les annonces affichent « Test Ad » et ne sont pas rémunérées.</span></div>` : ''}
      <label class="field"><span>Identifiant de l’application AdMob</span><input class="input${badApp ? ' bad' : ''}" data-k="ads.appId" value="${esc(a.appId)}" placeholder="ca-app-pub-0000000000000000~0000000000" spellcheck="false"></label>
      ${badApp ? '<p class="ab-hint bad">AdMob › Applications › Paramètres de l’application : identifiant avec un tilde (~).</p>' : ''}
      <div class="ab-grid2">${this.field('Classement maximal des annonces', 'ads.rating', { type: 'select', options: { '': 'Par défaut du compte', G: 'Tout public (G)', PG: 'Accord parental (PG)', T: 'Adolescents (T)', MA: 'Adultes (MA)' } })}</div>
      ${this.tog('Application destinée aux enfants', 'ads.child', 'Annonces adaptées aux moins de 13 ans (règles Familles de Google Play, COPPA).')}`);
    h += this.card('Formats d’annonces', FORMATS.map(([k, label, hint]) => `
      <div class="nxmod-format">
        ${this.tog(label, `ads.${k}.enabled`, hint)}
        ${a[k].enabled ? `<label class="field"><span>Bloc d’annonces « ${label} »${a.test ? ' (utilisé hors mode test)' : ''}</span><input class="input${bad(k) ? ' bad' : ''}" data-k="ads.${k}.id" value="${esc(a[k].id || '')}" placeholder="ca-app-pub-0000000000000000/0000000000" spellcheck="false"></label>
        ${bad(k) ? '<p class="ab-hint bad">Identifiant de bloc invalide : barre oblique (/) au lieu du tilde.</p>' : ''}
        ${k === 'banner' ? `<div class="ab-grid2">${this.field('Position', 'ads.banner.position', { type: 'select', options: { bottom: 'En bas de l’écran', top: 'En haut de l’écran' } })}</div>${this.tog('Afficher la bannière dès l’ouverture', 'ads.banner.auto', 'Sinon, votre page l’affiche avec NexoraApp.ads.banner(true).')}` : ''}
        ${k === 'interstitial' ? `<div class="ab-grid2">${this.field('Automatique toutes les N pages (0 = jamais)', 'ads.interstitial.every', { type: 'number', placeholder: '0' })}${this.field('Intervalle minimal (secondes)', 'ads.interstitial.minGap', { type: 'number', placeholder: '90' })}</div>` : ''}` : ''}
      </div>`).join(''));
    const line = appAdsLine(a.appId);
    h += this.card('Fichier app-ads.txt', `
      <p class="ab-hint">AdMob vérifie que l’application vous appartient grâce au fichier <code>app-ads.txt</code> placé à la racine du site indiqué dans la fiche Play Store (par exemple <code>https://votre-site.fr/app-ads.txt</code>). Sans lui, les annonces sont limitées.</p>
      ${line ? `<pre class="nxb-code">${esc(line)}</pre><div class="ab-row"><button class="btn small" data-copy="${esc(line)}">${icon('copy', 13)}<span>Copier la ligne</span></button></div>` : '<p class="ab-hint">Indiquez l’identifiant de l’application AdMob pour obtenir la ligne à publier.</p>'}`);
    h += this.card('Dans votre page', `
      <pre class="nxb-code">${esc(ADS_SAMPLE)}</pre>
      <div class="ab-row"><button class="btn small" data-copy="${esc(ADS_SAMPLE)}">${icon('copy', 13)}<span>Copier le code</span></button><button class="btn small" data-external="https://admob.google.com">${icon('external', 13)}<span>Console AdMob</span></button></div>`);
    return h;
  };
  proto.act_admob_install = async function act() { await installKit(this, 'admob', 'AdMob'); };

  async function installKit(inst, part, label) {
    const n = busy(`Préparation du kit ${label}…`);
    try {
      inst[`nxMod_${part}`] = await api.invoke(`android:${part}-install`);
      toast(`Kit ${label} prêt.`);
      inst.renderForm();
    } finally { n.close(); }
  }

  // ---------------------------------------------------------------- construction
  const spec0 = proto.spec;
  proto.spec = async function spec() {
    const s = await spec0.call(this);
    const o = this.cfg.onesignal;
    if (o && o.enabled) s.onesignal = { enabled: true, appId: String(o.appId || '').trim(), ask: o.ask !== false, openUrls: o.openUrls !== false, consentRequired: Boolean(o.consentRequired), tags: (o.tags || []).filter((t) => t && String(t.key || '').trim()) };
    const a = this.cfg.ads;
    if (a && a.enabled) {
      s.ads = {
        enabled: true, test: a.test !== false, appId: String(a.appId || '').trim(), child: Boolean(a.child), rating: a.rating || '',
        banner: { ...a.banner, id: String((a.banner && a.banner.id) || '').trim() },
        interstitial: { ...a.interstitial, id: String((a.interstitial && a.interstitial.id) || '').trim() },
        rewarded: { ...a.rewarded, id: String((a.rewarded && a.rewarded.id) || '').trim() },
      };
    }
    return s;
  };
  const validate0 = proto.validate;
  proto.validate = function validate() {
    const out = validate0.call(this) || [];
    const cfg = this.cfg;
    const twa = cfg.engine === 'twa' && cfg.source.kind === 'url';
    const o = cfg.onesignal;
    if (o && o.enabled) {
      if (twa) out.push(['onesignal', 'OneSignal : choisissez le moteur NEX-WEBVIEW (section Source), le mode Trusted Web Activity n’est pas pris en charge.']);
      if (!OS_ID.test(String(o.appId || '').trim())) out.push(['onesignal', 'OneSignal : indiquez l’identifiant de l’application OneSignal (App ID).']);
      if (cfg.push && cfg.push.enabled) out.push(['onesignal', 'OneSignal et les notifications push de NEXORA (Firebase) ne peuvent pas être actifs ensemble : désactivez l’un des deux.']);
    }
    const a = cfg.ads;
    if (a && a.enabled) {
      if (twa) out.push(['admob', 'AdMob : choisissez le moteur NEX-WEBVIEW (section Source), le mode Trusted Web Activity n’est pas pris en charge.']);
      if (!FORMATS.some(([k]) => a[k] && a[k].enabled)) out.push(['admob', 'AdMob : activez au moins un format d’annonce.']);
      if (a.test === false) {
        if (!ADM_APP.test(String(a.appId || '').trim())) out.push(['admob', 'AdMob : identifiant d’application invalide.']);
        for (const [k, label] of FORMATS) if (a[k] && a[k].enabled && !ADM_UNIT.test(String(a[k].id || '').trim())) out.push(['admob', `AdMob : identifiant du bloc « ${label} » invalide.`]);
      }
    }
    return out;
  };

  // ---------------------------------------------------------------- Prêt pour le Play Store
  const groups0 = proto.nxReadyGroups;
  if (groups0) {
    proto.nxReadyGroups = function nxReadyGroups(cfg) {
      const groups = groups0.call(this, cfg);
      const it = (state, label, detail, sec, go = 'Régler') => ({ state, label, detail, sec, go });
      const o = cfg.onesignal;
      if (o && o.enabled) {
        groups.push(['OneSignal', [
          OS_ID.test(String(o.appId || '').trim()) ? it('ok', 'Identifiant OneSignal', esc(o.appId), 'onesignal', 'Voir') : it('bad', 'Indiquez l’identifiant OneSignal', 'Settings › Keys & IDs › OneSignal App ID.', 'onesignal'),
          ...(cfg.push && cfg.push.enabled ? [it('bad', 'Deux services de notifications', 'Désactivez les notifications push Firebase ou OneSignal.', 'onesignal')] : []),
        ]]);
      }
      const a = cfg.ads;
      if (a && a.enabled) {
        groups.push(['Publicités AdMob', [
          a.test !== false ? it('warn', 'Mode test encore actif', 'Les annonces d’essai ne rapportent rien : décochez le mode test pour la version publiée.', 'admob') : it('ok', 'Annonces réelles', esc(a.appId || ''), 'admob', 'Voir'),
          it('warn', 'Déclarez les annonces', 'Play Console › Contenu de l’application › Annonces : « Oui, mon application contient des annonces ».', 'admob', 'Voir'),
          it('warn', 'Identifiant publicitaire', 'Play Console › Contenu de l’application › Identifiant publicitaire : « Oui », utilisé pour la publicité.', 'admob', 'Voir'),
          appAdsLine(a.appId) ? it('warn', 'Publiez app-ads.txt', 'À la racine du site de la fiche Play Store.', 'admob', 'Voir') : it('warn', 'Fichier app-ads.txt', 'Indiquez l’identifiant AdMob pour obtenir la ligne à publier.', 'admob'),
        ]]);
      }
      return groups;
    };
  }
}
