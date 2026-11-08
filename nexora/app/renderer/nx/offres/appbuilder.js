// NEXORA #037 : App Builder et offres. En offre Gratuite : 2 applications au plus, créées depuis l'adresse
// d'un site accessible, essai de 7 jours chacune (suivi par les serveurs : nx_app_claim, nx_app_status) ;
// après l'essai, l'application est verrouillée dans l'App Builder (aperçu, construction, export bloqués).
// Offres Standard et Pro : pas de limite d'essai. Les actions réservées (APK, PWA, Play Store, push, achats
// intégrés, source dossier ou code) ouvrent la fenêtre de l'offre ; le processus principal les refuse aussi.
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

// État de l'application pour l'offre : { lock, reason, trial }.
export function appState(cfg) {
  const s = current();
  if (!cfg) return { lock: false };
  if (!cloud.user) return { lock: true, reason: 'auth' };
  const t = trialsCached();
  if (s.admin || (t && Number(t.trial_days) <= 0 && !t.unavailable)) return { lock: false, paid: true, row: t && t.apps[cfg.id] };
  if (!t) return { lock: false, loading: true };
  if (t.unavailable) return { lock: false, unavailable: true };
  const row = t.apps[cfg.id];
  if (row && !row.deleted) {
    if (row.status === 'trial') return { lock: false, trial: row };
    if (row.status === 'active') return { lock: false, paid: true, row };
    return { lock: true, reason: row.status, row };
  }
  if (t.used >= t.limit && t.limit >= 0) return { lock: true, reason: 'quota', t };
  return { lock: false, unclaimed: true, t };
}

function banner(inst) {
  const st = appState(inst.cfg), s = current();
  if (st.lock || st.loading) return '';
  if (st.paid) return s.admin ? '' : `<div class="nxo-ab-banner paid">${ico('check', 13)}<span>Offre <b>${esc(s.plan_name || 'Pro')}</b> : application sans limite d’essai.</span></div>`;
  if (st.unavailable) return `<div class="nxo-ab-banner">${ico('clock', 13)}<span>Offre Gratuite : jusqu’à 2 applications créées depuis l’adresse d’un site, 7 jours d’essai chacune.</span></div>`;
  const days = Number(current().limits.app_trial_days) || 7;
  if (st.trial) {
    const left = Number(st.trial.days_left) || 0, used = Math.max(0, Math.min(days, days - left));
    return `<div class="nxo-ab-banner trial">
      <span class="nxo-ab-ic">${ico('clock', 15)}</span>
      <div><b>Essai gratuit · encore ${left} jour${left > 1 ? 's' : ''}</b><small>Fin de l’essai le ${esc(longDate(st.trial.trial_ends_at))}. Ensuite, l’application sera verrouillée dans l’App Builder.</small><i class="nxo-bar"><em style="width:${((used / days) * 100).toFixed(0)}%"></em></i></div>
      <button type="button" class="nxo-btn primary small" data-nxo-ask="pro">Garder mon app · ${esc(money(FALLBACK.pro.price_month_cents))} / mois</button>
    </div>`;
  }
  const t = st.t || {};
  return `<div class="nxo-ab-banner">
    <span class="nxo-ab-ic">${ico('globe', 15)}</span>
    <div><b>Offre Gratuite : application créée depuis l’adresse d’un site</b><small>Indique l’adresse d’un site accessible (https://…) : l’essai de ${days} jours démarre à son enregistrement. ${t.used || 0} essai${(t.used || 0) > 1 ? 's' : ''} utilisé${(t.used || 0) > 1 ? 's' : ''} sur ${t.limit ?? 2}.</small></div>
    <button type="button" class="nxo-btn ghost small" data-nxo-offers>Voir les offres</button>
  </div>`;
}

const LOCK = {
  expired: (r) => [`L’essai de « ${r.name || 'ton application'} » est terminé`, `Les 7 jours d’essai de l’offre Gratuite se sont terminés le ${longDate(r.trial_ends_at)}. L’application est verrouillée dans l’App Builder : aperçu, construction et export sont bloqués. Passe à Pro pour la débloquer tout de suite, sans limite de durée.`],
  plan: (r) => [`« ${r.name || 'Cette application'} » demande une offre payante`, 'Elle a été créée avec l’offre Pro, qui n’est plus active sur ton compte. Reprends l’offre Pro pour la débloquer.'],
  quota: () => ['Tes applications d’essai sont utilisées', `L’offre Gratuite comprend ${FALLBACK.free.limits.apps} applications d’essai de 7 jours, applications supprimées comprises. Passe à Pro pour créer d’autres applications, sans limite de durée.`],
  auth: () => ['Connecte-toi pour utiliser l’App Builder', 'L’essai gratuit de 7 jours de tes applications est suivi par ton compte NEXORA. Crée un compte gratuit ou connecte-toi pour continuer.'],
};
function lockCard(inst, st) {
  const [title, text] = (LOCK[st.reason] || LOCK.expired)(st.row || {});
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
      ${others ? '<small class="nx-muted">Tu peux choisir une autre application dans la liste à gauche.</small>' : ''}
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
  // Débloquée (essai confirmé, offre payante) : l'aperçu verrouillé est redessiné.
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
        if (now.reason === 'auth') openUpsell({ reason: 'auth', need: 'free', title: 'Connecte-toi pour utiliser l’App Builder', message: LOCK.auth()[1] });
        else openUpsell({ feature: 'apk', reason: now.reason, need: 'pro', title: (LOCK[now.reason] || LOCK.expired)(now.row || {})[0], message: 'Passe à Pro pour débloquer ton application, sans limite de durée.' });
        return;
      }
      const feat = act && ACT_FEATURES[act];
      if (feat && !can(feat)) {
        e.stopPropagation(); e.preventDefault();
        openUpsell({ feature: feat, reason: 'plan' });
      }
    }, true);
  }
  if (st.unclaimed) claimSoon(inst);
}

function claimSoon(inst) {
  clearTimeout(inst.__nxoClaim);
  inst.__nxoClaim = setTimeout(async () => {
    const cfg = inst.cfg;
    if (!cfg || !cloud.user) return;
    const st = appState(cfg);
    if (!st.unclaimed) return;
    // Offre Gratuite : seule une adresse publique démarre l'essai.
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
    // Application affichée inconnue de l'état des essais : une relecture pour les applications de ce PC.
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
    // Offre Gratuite : source « adresse web » seulement.
    if (path === 'source.kind' && value !== 'url' && !can('source_import')) {
      openUpsell({ feature: 'source_import', reason: 'source', message: 'Avec l’offre Gratuite, une application se crée uniquement à partir de l’adresse d’un site accessible (https://…). Passe à Pro pour partir d’un projet ou d’un dossier construit.' });
      if (typeof this.renderForm === 'function') this.renderForm();
      return undefined;
    }
    const r = set.call(this, path, value, opts);
    if (path === 'source.url' || path === 'source.kind') { const st = appState(this.cfg); if (st.unclaimed) claimSoon(this); }
    return r;
  };
  const del = proto.act_app_del;
  if (del) {
    proto.act_app_del = function (...a) {
      const id = this.cfg && this.cfg.id, before = settings.android && settings.android.apps ? settings.android.apps.length : 0;
      const r = del.apply(this, a);
      const after = settings.android && settings.android.apps ? settings.android.apps.length : 0;
      if (id && after < before && cloud.user) releaseApp(id);
      return r;
    };
  }
}

// Offre ou compte changé : relire les essais et redessiner l'App Builder ouvert.
export async function refresh(inst) {
  await status(true).catch(() => {});
  await appTrials(true, localIds(inst && inst.cfg)).catch(() => {});
  if (inst && inst.el && inst.el.isConnected) { decorate(inst); try { inst.renderPreview(); } catch { /* rien */ } }
}
