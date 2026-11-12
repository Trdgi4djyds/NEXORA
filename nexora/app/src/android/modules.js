'use strict';
/* NEXORA #114 : modules OneSignal et AdMob des applications de l'App Builder.
 *
 * Chaque module est un « kit » préparé une fois sur le PC, exactement comme celui des achats intégrés (billing.js) :
 * SDK officiel et ses dépendances lus dans les dépôts Maven, ressources compilées (aapt2), pont Java compilé (javac),
 * conversion au format Android (d8). À la construction, les bibliothèques déjà fournies par un autre kit de
 * l'application sont écartées, si bien qu'aucune classe n'apparaît deux fois.
 *   - OneSignal (com.onesignal:OneSignal, licence MIT) : notifications push envoyées depuis OneSignal, sans projet
 *     Firebase dans l'application ; pont VtOneSignal, NexoraApp.onesignal dans la page.
 *   - AdMob (com.google.android.gms:play-services-ads et com.google.android.ump:user-messaging-platform) : bannière,
 *     interstitiel, vidéo avec récompense, consentement ; pont VtAds, NexoraApp.ads dans la page. */
const path = require('path');
const { BillingKit } = require('./billing');

const SHIMS = path.join(__dirname, '..', '..', 'android', 'shell', 'modules', 'app', 'vitrine', 'shell');
const ONESIGNAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMOB_APP_ID = /^ca-app-pub-\d{16}~\d{10}$/;
const ADMOB_UNIT = /^ca-app-pub-\d{16}\/\d{10}$/;
// Identifiants d'essai publiés par Google : annonces de test, jamais rémunérées, sans risque pour le compte AdMob.
const ADMOB_TEST = {
  appId: 'ca-app-pub-3940256099942544~3347511713',
  banner: 'ca-app-pub-3940256099942544/9214589741',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
};
const UMP = ['com.google.android.ump', 'user-messaging-platform'];
const UMP_FALLBACK = '4.0.0';
// Versions minimales communes à tous les kits (mêmes que FLOORS de push.js).
const BASE_FLOORS = [['androidx.core', 'core', '1.13.1'], ['androidx.activity', 'activity', '1.9.3']];

class OneSignalKit extends BillingKit {
  constructor(opts) {
    super({
      ...opts,
      name: 'onesignal',
      root: ['com.onesignal', 'OneSignal'],
      fallbackVersion: '5.11.0',
      format: 1,
      module: {
        shim: path.join(SHIMS, 'VtOneSignal.java'),
        shimClass: 'VtOneSignal',
        lib: 'OneSignal',
        title: 'OneSignal',
        bridge: 'pont OneSignal',
        ready: 'Kit OneSignal prêt',
        permissions: ['android.permission.INTERNET', 'android.permission.POST_NOTIFICATIONS', 'android.permission.WAKE_LOCK', 'android.permission.VIBRATE'],
      },
    });
  }

  async forBuild(spec, opts) {
    const r = await super.forBuild(spec, opts);
    // Le lien d'une notification s'ouvre dans l'application (VtOneSignal), jamais dans le navigateur.
    r.application.push('<meta-data android:name="com.onesignal.suppressLaunchURLs" android:value="true"/>');
    return r;
  }
}

class AdsKit extends BillingKit {
  constructor(opts) {
    super({
      ...opts,
      name: 'admob',
      root: ['com.google.android.gms', 'play-services-ads'],
      fallbackVersion: '25.5.0',
      format: 1,
      floors: [...BASE_FLOORS, [...UMP, UMP_FALLBACK]],
      module: {
        shim: path.join(SHIMS, 'VtAds.java'),
        shimClass: 'VtAds',
        lib: 'Google Mobile Ads (AdMob)',
        title: 'AdMob',
        bridge: 'pont des publicités',
        ready: 'Kit AdMob prêt',
        permissions: ['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE', 'com.google.android.gms.permission.AD_ID'],
      },
    });
  }

  // Formulaire de consentement de Google (UMP) : dernière version publiée, ajoutée comme seconde racine.
  async installInner(tools, onStep) {
    try {
      const x = await this.getText(`${this.repos[0]}${UMP[0].replace(/\./g, '/')}/${UMP[1]}/maven-metadata.xml`);
      const v = x && (/<release>([^<]+)<\/release>/.exec(x) || /<latest>([^<]+)<\/latest>/.exec(x));
      if (v) this.floors = [...BASE_FLOORS, [...UMP, v[1]]];
    } catch { /* version de repli */ }
    return super.installInner(tools, onStep);
  }

  async forBuild(spec, opts) {
    const r = await super.forBuild(spec, opts);
    const a = adsConfig(spec);
    // Identifiant de l'application AdMob : obligatoire dans le manifeste (sinon le SDK arrête l'application au démarrage).
    r.application.push(`<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="${a.appId}"/>`);
    r.application.push('<meta-data android:name="com.google.android.gms.ads.flag.OPTIMIZE_INITIALIZATION" android:value="true"/>');
    r.application.push('<meta-data android:name="com.google.android.gms.ads.flag.OPTIMIZE_AD_LOADING" android:value="true"/>');
    return r;
  }
}

const clean = (v) => String(v || '').trim();

/* Réglages OneSignal embarqués dans l'application (config.json, lus par VtOneSignal). */
function oneSignalConfig(spec) {
  const o = (spec && spec.onesignal) || {};
  return {
    enabled: true,
    appId: clean(o.appId).toLowerCase(),
    ask: o.ask !== false,
    openUrls: o.openUrls !== false,
    consentRequired: Boolean(o.consentRequired),
    tags: (o.tags || []).filter((t) => t && clean(t.key)).slice(0, 20).map((t) => ({ key: clean(t.key).slice(0, 64), value: clean(t.value).slice(0, 255) })),
  };
}

/* Réglages AdMob embarqués (lus par VtAds). En mode test, les identifiants d'essai de Google remplacent les vrais. */
function adsConfig(spec) {
  const a = (spec && spec.ads) || {};
  const test = a.test !== false;
  const unit = (k) => (a[k] && a[k].enabled !== false && (test || ADMOB_UNIT.test(clean(a[k].id))) ? (test ? ADMOB_TEST[k] : clean(a[k].id)) : '');
  return {
    enabled: true,
    test,
    appId: test ? ADMOB_TEST.appId : clean(a.appId),
    banner: unit('banner'),
    position: a.banner && a.banner.position === 'top' ? 'top' : 'bottom',
    bannerAuto: !(a.banner && a.banner.auto === false),
    interstitial: unit('interstitial'),
    autoEvery: a.interstitial && a.interstitial.enabled !== false ? Math.max(0, Math.min(50, Math.round(Number(a.interstitial.every) || 0))) : 0,
    minGap: Math.max(30, Math.min(3600, Math.round(Number(a.interstitial && a.interstitial.minGap) || 90))),
    rewarded: unit('rewarded'),
    child: Boolean(a.child),
    rating: ['G', 'PG', 'T', 'MA'].includes(a.rating) ? a.rating : '',
  };
}

/* Contrôles avant construction : liste de messages (vide si tout va bien). */
function checkModules(spec) {
  const out = [];
  const twa = spec.mode === 'twa';
  if (spec.onesignal && spec.onesignal.enabled) {
    if (twa) out.push('OneSignal : choisissez le moteur NEX-WEBVIEW (section Source), le mode Trusted Web Activity n’est pas pris en charge.');
    if (!ONESIGNAL_ID.test(clean(spec.onesignal.appId))) out.push('OneSignal : indiquez l’identifiant de l’application OneSignal (Settings › Keys & IDs › OneSignal App ID).');
    if (spec.push && spec.push.enabled) out.push('OneSignal et les notifications push de NEXORA (Firebase) ne peuvent pas être actifs ensemble : désactivez l’un des deux.');
  }
  if (spec.ads && spec.ads.enabled) {
    const a = spec.ads;
    if (twa) out.push('AdMob : choisissez le moteur NEX-WEBVIEW (section Source), le mode Trusted Web Activity n’est pas pris en charge.');
    if (a.test === false) {
      if (!ADMOB_APP_ID.test(clean(a.appId))) out.push('AdMob : identifiant d’application invalide (forme ca-app-pub-0000000000000000~0000000000).');
      for (const [k, l] of [['banner', 'bannière'], ['interstitial', 'interstitiel'], ['rewarded', 'vidéo avec récompense']]) {
        if (a[k] && a[k].enabled && !ADMOB_UNIT.test(clean(a[k].id))) out.push(`AdMob : identifiant du bloc d’annonces « ${l} » invalide (forme ca-app-pub-0000000000000000/0000000000).`);
      }
    }
    if (!['banner', 'interstitial', 'rewarded'].some((k) => a[k] && a[k].enabled)) out.push('AdMob : activez au moins un format d’annonce (bannière, interstitiel ou vidéo avec récompense).');
  }
  return out;
}

/* Ligne du fichier app-ads.txt à publier à la racine du site du développeur (exigé par AdMob). */
function appAdsLine(appId) {
  const m = /^ca-app-pub-(\d{16})~/.exec(clean(appId));
  return m ? `google.com, pub-${m[1]}, DIRECT, f08c47fec0942fa0` : '';
}

module.exports = {
  OneSignalKit, AdsKit, oneSignalConfig, adsConfig, checkModules, appAdsLine, ONESIGNAL_ID, ADMOB_APP_ID, ADMOB_UNIT, ADMOB_TEST,
};
