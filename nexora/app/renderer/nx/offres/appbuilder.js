// NEXORA #087 : App Builder et offres. L'offre Gratuite comprend 2 applications au total, App Builder et Desktop
// Builder confondus, applications supprimées comprises, avec tout l'App Builder et 5 constructions par application
// et par mois. Une application compte à sa première construction : le processus principal envoie son identifiant
// (champ nxApp de la construction) à nx_app_build, qui la réserve et compte la construction (src/plan.js,
// migration 20261108000006). Au-delà de la limite (application créée pendant l'essai d'un jour ou avec Pro, puis
// retour à l'offre Gratuite), l'application est verrouillée dans l'App Builder. Pro : jusqu'à 50 applications,
// sans limite par application. Les actions réservées ouvrent la fenêtre de l'offre ; le processus principal les
// refuse aussi.
// NEXORA #037 : essai de 7 jours des applications de l'ancienne offre Gratuite (gardé si une offre a des jours
// d'essai : nx_app_claim au moment où l'adresse du site est enregistrée).
import { ico, esc, settings } from '../core.js';
import { cloud, current, can, appTrials, trialsCached, claimApp, releaseApp, status } from './status.js';
import { openUpsell } from './upsell.js';
import { FALLBACK, money } from './catalog.js';

// Action de l'App Builder (data-act) → fonction de l'offre.
const ACT_FEATURES = {
  build: 'apk', install: 'apk', 'install-on': 'apk', 'test-on': 'apk', 'launch-sim': null,
  'pwa-pack': 'pwa', 'pwa-inject': 'pwa', 'play-publish': 'play_publish', 'play-check': 'play_publish',
  'push-send': 'push', 'push-kit': 'push', 'notif-send': 'push', 'notif-tpl-save': 'custom_notifications',
  // NEXORA #073 : section « Messagerie et appels ».
  'msg-on': 'messaging_events', 'msg-send': 'push',
  'pick-dir': 'source_import', 'use-project': 'source_import', 'build-web': 'source_import',
};
// Toujours permis, même application verrouillée : changer d'application, en créer, supprimer.
const ALWAYS = new Set(['app-new', 'app-del']);
const isPublic = (u) => {
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol) || !x.hostname.includes('.')) return false;
    return !/^(localhost|127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|\.(local|internal|localhost)$/i.test(x.hostname);
  } catch { return false; }
};
const localIds = (cfg) => [...new Set([cfg && cfg.id, ...((settings.android && settings.android.apps) || []).map((a) => a.id)].filter(Boolean))];
const asked = new Set(); // applications déjà demandées au serveur (une seule relecture par application)
const longDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '');
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const appLimit = (t) => (t && Number(t.limit) >= 0 ? Number(t.limit) : FALLBACK.free.limits.apps);
const trialMode = (t) => !!t && Number(t.trial_days) > 0;

// Identifiant de l'application transmis à la construction (src/plan.js, nx_app_build).
export function nxApp(cfg) {
  const src = (cfg && cfg.source) || {};
  return { id: cfg && cfg.id, name: (cfg && cfg.appName) || '', kind: src.kind === 'url' ? 'url' : src.kind === 'project' ? 'project' : 'folder', url: src.kind === 'url' ? src.url || null : null };
}

// État de l'application pour l'offre : { lock, reason, row, t, paid, trial, unclaimed }.
export function appState(cfg) {
  const s = current();
  if (!cfg) return { lock: false };
  if (!cloud.user) return { lock: true, reason: 'auth' };
  const t = trialsCached();
  if (s.admin) return { lock: false, paid: true, row: t && t.apps[cfg.id] };
  if (!t) return { lock: false, loading: true };
  if (t.unavailable) return { lock: false, unavailable: true };
  // Offre sans limite d'applications qui compte (Pro) : rien n'est verrouillé ici, le serveur garde le dernier mot.
  const capped = Number(t.limit) >= 0 && (t.lifetime || trialMode(t));
  const row = t.apps[cfg.id];
  if (row && !row.deleted) {
    if (row.status === 'trial') return { lock: false, trial: row, t };
    if (row.status === 'active') return { lock: false, paid: !capped && !(Number(t.builds_limit) > 0), row, t };
    return { lock: true, reason: row.status, row, t };
  }
  // Application supprimée puis reprise : elle garde sa place (aucune nouvelle application comptée).
  if (row && row.deleted) return { lock: false, unclaimed: true, restore: true, t };
  if (capped && t.used >= t.limit) return { lock: true, reason: 'quota', t };
  return { lock: false, unclaimed: true, paid: !capped, t };
}

function banner(inst) {
  const st = appState(inst.cfg), s = current();
  if (st.lock || st.loading || st.unavailable || s.admin) return '';
  const t = st.t || {};
  const pro = `<button type="button" class="nxo-btn primary small" data-nxo-ask="pro">Passer à Pro · ${esc(money(FALLBACK.pro.price_month_cents))} / mois</button>`;
  if (st.trial) {
    const days = Number(t.trial_days) || 7;
    const left = Number(st.trial.days_left) || 0, used = Math.max(0, Math.min(days, days - left));
    return `<div class="nxo-ab-banner trial">
      <span class="nxo-ab-ic">${ico('clock', 15)}</span>
      <div><b>Essai gratuit · encore ${plural(left, 'jour', 'jours')}</b><small>Fin de l’essai le ${esc(longDate(st.trial.trial_ends_at))}. Ensuite, l’application sera verrouillée dans l’App Builder.</small><i class="nxo-bar"><em style="width:${((used / days) * 100).toFixed(0)}%"></em></i></div>
      ${pro}
    </div>`;
  }
  if (st.paid) {
    const lim = Number(t.limit);
    return `<div class="nxo-ab-banner paid">${ico('check', 13)}<span>Offre <b>${esc(s.plan_name || 'Pro')}</b> : ${lim >= 0 ? `jusqu’à ${lim} applications, ` : ''}constructions sans limite par application.</span></div>`;
  }
  // NEXORA #087 : offre Gratuite.
  const lim = appLimit(t), used = Number(t.used) || 0, per = Number(t.builds_limit) > 0 ? Number(t.builds_limit) : FALLBACK.free.limits.builds_per_app_month;
  const apps = `${used} sur ${lim} application${lim > 1 ? 's' : ''} utilisée${used > 1 ? 's' : ''}, Android ou Windows, applications supprimées comprises`;
  if (st.row) {
    const n = Math.min(per, Number(st.row.builds_month) || 0), full = n >= per;
    return `<div class="nxo-ab-banner">
      <span class="nxo-ab-ic">${ico('android', 15)}</span>
      <div><b>Offre Gratuite · ${full ? 'constructions du mois utilisées' : `${n} sur ${plural(per, 'construction', 'constructions')} ce mois-ci`}</b><small>${full ? `Cette application a utilisé ses ${per} constructions de ce mois-ci : le compteur repart le 1ᵉʳ du mois. ` : ''}${esc(apps)}.</small><i class="nxo-bar"><em style="width:${((n / per) * 100).toFixed(0)}%"></em></i></div>
      ${full ? pro : '<button type="button" class="nxo-btn ghost small" data-nxo-offers>Voir les offres</button>'}
    </div>`;
  }
  return `<div class="nxo-ab-banner">
    <span class="nxo-ab-ic">${ico('android', 15)}</span>
    <div><b>Offre Gratuite : ${plural(lim, 'application', 'applications')} au total</b><small>${st.restore ? 'Cette application garde sa place parmi vos applications.' : `Cette application comptera parmi elles à sa première construction, puis ${per} constructions par mois.`} ${esc(apps)}.</small></div>
    <button type="button" class="nxo-btn ghost small" data-nxo-offers>Voir les offres</button>
  </div>`;
}

const LOCK = {
  expired: (r) => [`L’essai de « ${r.name || 'votre application'} » est terminé`, `L’essai de l’offre Gratuite s’est terminé le ${longDate(r.trial_ends_at)}. L’application est verrouillée dans l’App Builder : aperçu, construction et export sont bloqués. Passez à Pro pour la débloquer tout de suite, sans limite de durée.`],
  plan: (r, t) => [`« ${r.name || 'Cette application'} » dépasse votre offre`, `L’offre Gratuite comprend ${appLimit(t)} applications au total, Android ou Windows : celle-ci a été créée en plus, pendant votre premier jour ou avec Pro. Elle reste verrouillée dans l’App Builder jusqu’à votre passage à Pro ; vos premières applications restent utilisables.`],
  quota: (r, t) => [`Vos ${appLimit(t)} applications gratuites sont créées`, `L’offre Gratuite comprend ${appLimit(t)} applications au total, Android ou Windows, applications supprimées comprises. Passez à Pro pour créer d’autres applications (jusqu’à ${FALLBACK.pro.limits.apps}), sans limite de constructions par application.`],
  auth: () => ['Connectez-vous pour utiliser l’App Builder', 'Vos 2 applications gratuites sont suivies par votre compte NEXORA. Créez un compte gratuit ou connectez-vous pour continuer.'],
};
const lockText = (st) => (LOCK[st.reason] || LOCK.plan)(st.row || {}, st.t);
function lockCard(inst, st) {
  const [title, text] = lockText(st);
  const others = (settings.android && settings.android.apps || []).length > 1;
  return `<div class="nxo-ab-lock" role="dialog" aria-label="${esc(title)}">
    <div class="nxo-ab-lock-card">
      <div class="nxo-lock-head">
        <span class="nxo-medal lock lg">${ico(st.reason === 'auth' ? 'user' : 'lock', 22)}</span>
        <div><small class="nxo-kicker">${st.reason === 'auth' ? 'Compte NEXORA' : 'Application verrouillée'}</small><h3>${esc(title)}</h3></div>
      </div>
      <p>${esc(text)}</p>
      <div class="nxo-ab-lock-acts">
        ${st.reason === 'auth' ? '<button type="button" class="nxo-btn primary" data-nxo-login>Se connecter</button>'
          : `<button type="button" class="nxo-btn primary" data-nxo-ask="pro">Passer à Pro · ${esc(money(FALLBACK.pro.price_month_cents))} / mois</button><button type="button" class="nxo-btn ghost" data-nxo-offers>Voir les offres</button>`}
      </div>
      ${others ? '<small class="nx-muted">Vous pouvez choisir une autre application dans la liste à gauche.</small>' : ''}
    </div>
  </div>`;
}

// Pose (ou retire) le bandeau et le verrou sur l'App Builder affiché.
export function decorate(inst) {
  const root = inst.el && inst.el.querySelector('.ab');
  if (!root) return;
  const st = appState(inst.cfg);
  const was = root.classList.contains('nxo-locked');
  root.classList.toggle('nxo-locked', !!st.lock);
  // Débloquée (offre payante, application gardée) : l'aperçu verrouillé est redessiné.
  if (was && !st.lock) setTimeout(() => { try { inst.renderPreview(); } catch { /* rien */ } }, 0);
  const main = root.querySelector('.ab-main');
  if (main) {
    let b = main.querySelector(':scope > .nxo-ab-slot');
    if (!b) { b = document.createElement('div'); b.className = 'nxo-ab-slot'; main.prepend(b); }
    const html = banner(inst);
    if (b.__html !== html) { b.innerHTML = html; b.__html = html; }
    let l = main.querySelector(':scope > .nxo-ab-lock');
    const lh = st.lock ? lockCard(inst, st) : '';
    if (!st.lock && l) l.remove();
    if (st.lock && (!l || l.__html !== lh)) { if (l) l.remove(); main.insertAdjacentHTML('beforeend', lh); l = main.lastElementChild; l.__html = lh; }
  }
  if (st.lock && typeof inst.dropWebview === 'function') { try { inst.dropWebview(); } catch { /* déjà retirée */ } }
  if (!inst.el.__nxoGuard) {
    inst.el.__nxoGuard = true;
    // Avant le gestionnaire de l'App Builder : action réservée ou application verrouillée.
    inst.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act], [data-sec]');
      if (!b || b.closest('.nxo-ab-lock, .nxo-ab-slot')) return;
      const act = b.dataset.act;
      const now = appState(inst.cfg);
      if (now.lock && !(act && ALWAYS.has(act))) {
        e.stopPropagation(); e.preventDefault();
        if (now.reason === 'auth') openUpsell({ reason: 'auth', need: 'free', title: 'Connectez-vous pour utiliser l’App Builder', message: LOCK.auth()[1] });
        else { const [title, message] = lockText(now); openUpsell({ feature: 'apk', reason: now.reason, need: 'pro', title, message }); }
        return;
      }
      const feat = act && ACT_FEATURES[act];
      if (feat && !can(feat)) {
        e.stopPropagation(); e.preventDefault();
        openUpsell({ feature: feat, reason: 'plan' });
      }
    }, true);
  }
  if (st.unclaimed && trialMode(st.t)) claimSoon(inst);
}

// Ancienne offre à essai (#037) : l'essai démarre quand l'adresse publique du site est enregistrée.
function claimSoon(inst) {
  clearTimeout(inst.__nxoClaim);
  inst.__nxoClaim = setTimeout(async () => {
    const cfg = inst.cfg;
    if (!cfg || !cloud.user) return;
    const st = appState(cfg);
    if (!st.unclaimed || !trialMode(st.t)) return;
    if (!(cfg.source && cfg.source.kind === 'url' && isPublic(cfg.source.url)) && !can('source_import')) return;
    try {
      const r = await claimApp(cfg);
      if (r && !r.ok) {
        await appTrials(true, localIds(cfg));
        if (r.reason === 'quota' || r.reason === 'source') openUpsell({ feature: r.reason === 'source' ? 'source_import' : 'apk', reason: r.reason, need: 'pro', message: r.message });
      } else await appTrials(true, localIds(cfg));
    } catch (e) { console.warn('[NEXORA #037] essai', e); }
    if (inst.el && inst.el.isConnected) decorate(inst);
  }, 700);
}

export function install(proto) {
  const render = proto.render;
  proto.render = function (...a) {
    const r = render.apply(this, a);
    try { decorate(this); } catch (e) { console.error('[NEXORA #037]', e); }
    // Application affichée inconnue de l'état des applications : une relecture pour les applications de ce PC.
    const id = this.cfg && this.cfg.id, t = trialsCached();
    if (cloud.user && (!t || (id && !t.unavailable && !t.apps[id] && !asked.has(id)))) {
      if (id) asked.add(id);
      appTrials(true, localIds(this.cfg)).then(() => this.el && this.el.isConnected && decorate(this)).catch(() => {});
    }
    return r;
  };
  const renderPreview = proto.renderPreview;
  proto.renderPreview = function (...a) {
    if (appState(this.cfg).lock) {
      try { if (typeof this.dropWebview === 'function') this.dropWebview(); } catch { /* rien */ }
      const sc = this.el && this.el.querySelector('.ab-screen');
      if (sc) sc.innerHTML = `<div class="nxo-ab-screen">${ico('lock', 26)}<b>Application verrouillée</b></div>`;
      return undefined;
    }
    return renderPreview.apply(this, a);
  };
  const set = proto.set;
  proto.set = function (path, value, opts) {
    // Offre sans import de code : source « adresse web » seulement.
    if (path === 'source.kind' && value !== 'url' && !can('source_import')) {
      openUpsell({ feature: 'source_import', reason: 'source', message: 'Avec votre offre, une application se crée uniquement à partir de l’adresse d’un site accessible (https://…). Passez à Pro pour partir d’un projet ou d’un dossier construit.' });
      if (typeof this.renderForm === 'function') this.renderForm();
      return undefined;
    }
    const r = set.call(this, path, value, opts);
    if (path === 'source.url' || path === 'source.kind') { const st = appState(this.cfg); if (st.unclaimed && trialMode(st.t)) claimSoon(this); }
    return r;
  };
  // NEXORA #087 : identifiant de l'application joint à la construction (constructions comptées par application).
  const spec = proto.spec;
  if (spec) {
    proto.spec = async function (...a) {
      const s = await spec.apply(this, a);
      return this.cfg && this.cfg.id ? { ...s, nxApp: nxApp(this.cfg) } : s;
    };
  }
  // Après une construction, réussie ou refusée : compteurs relus (application réservée, constructions du mois).
  const after = (inst) => { if (cloud.user) appTrials(true, localIds(inst.cfg)).then(() => inst.el && inst.el.isConnected && decorate(inst)).catch(() => {}); };
  const build = proto.build;
  if (build) {
    proto.build = async function (...a) {
      try { return await build.apply(this, a); } finally { after(this); }
    };
  }
  const del = proto.act_app_del;
  if (del) {
    proto.act_app_del = function (...a) {
      const id = this.cfg && this.cfg.id, before = settings.android && settings.android.apps ? settings.android.apps.length : 0;
      const r = del.apply(this, a);
      const after2 = settings.android && settings.android.apps ? settings.android.apps.length : 0;
      // Application supprimée : toujours comptée par le serveur (offre Gratuite, limite à vie).
      if (id && after2 < before && cloud.user) releaseApp(id);
      return r;
    };
  }
}

// Offre ou compte changé, construction refusée : relire les applications et redessiner l'App Builder ouvert.
export async function refresh(inst) {
  await status(true).catch(() => {});
  await appTrials(true, localIds(inst && inst.cfg)).catch(() => {});
  if (inst && inst.el && inst.el.isConnected) { decorate(inst); try { inst.renderPreview(); } catch { /* rien */ } }
}
