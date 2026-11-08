'use strict';
/* NEXORA #037 : offres Gratuit, Standard et Pro.
 * Les canaux réservés à une offre ou soumis à un quota demandent l'accord des serveurs NEXORA avant de
 * s'exécuter : fonction nx_use_feature de Supabase (migration 20261104000007), qui vérifie l'offre du compte et
 * consomme le quota de façon atomique. La session du compte est celle que l'interface transmet au processus
 * principal (canal mon:cloud-session, #030), gardée en mémoire seulement.
 *   - sans compte connecté : offre Gratuite ; les quotas (audits de sécurité, constructions…) demandent un
 *     compte (gratuit) ;
 *   - serveurs injoignables : une fonction à quota est refusée ; une fonction réservée suit la dernière offre
 *     confirmée par le serveur (moins de 24 h), sinon elle est refusée ;
 *   - serveurs sans la migration : la fonction réservée suit l'offre lue dans l'abonnement, sans quota compté.
 * Les administrateurs de NEXORA ne sont jamais limités (réponse du serveur). */

// Canal → [fonction, quantité consommée] ; quantité 0 : vérifie l'offre sans consommer.
const GATES = {
  // App Builder
  'android:build': ['apk', 1],
  'android:install': ['apk', 0],
  'android:install-apk': ['apk', 0],
  'android:test-run': ['apk', 0],
  'android:pick-dir': ['source_import', 0],
  'android:inspect-dir': ['source_import', 0],
  'android:build-web': ['source_import', 0],
  'android:pwa-pack': ['pwa', 1],
  'android:pwa-inject': ['pwa', 0],
  'android:play-publish': ['play_publish', 0],
  'android:listing-push': ['play_publish', 0],
  'android:push-install': ['push', 0],
  'android:push-test': ['push', 1],
  'android:notif-schedule': ['automation', 0],
  'android:billing-install': ['integrations', 0],
  'android:billing-products': ['integrations', 0],
  'android:billing-verify': ['integrations', 0],
  // Browser Lab et Sécurité
  'lab:scrape-start': ['crawler', 1],
  'lab:test-start': ['audit_advanced', 0],
  'sec:scan': ['scan', 1],
  // NEXORA #048 : audits avancés (plusieurs pages, code, applications, correctifs écrits, crochet Git, audits
  // programmés), intégration continue et SARIF (API et SDK), parcours rejoués de la supervision (Pro).
  'sec:crawl-audit': ['audit_advanced', 0],
  'sec:code-audit': ['audit_advanced', 0],
  'sec:app-audit': ['audit_advanced', 0],
  'sec:fix-write': ['audit_advanced', 0],
  'sec:hook-install': ['audit_advanced', 0],
  'sec:schedule-set': ['audit_advanced', 0],
  'sec:ci-write': ['ci_export', 0],
  'sec:sarif-save': ['ci_export', 0],
  'mon:journey-record': ['synthetic', 0],
  'mon:journey-run': ['synthetic', 0],
  // Responsive Lab : projets locaux (dossier de site ou code source) ; Responsive avancé (enregistrement
  // vidéo des appareils, outils de développement de l'appareil)
  'project:pick': ['source_import', 0],
  'project:start': ['source_import', 0],
  'screencast:start': ['responsive_advanced', 0],
  'device:devtools': ['responsive_advanced', 0],
  // Desktop Builder
  'desktop:pick-source': ['desktop_builder', 0],
  'desktop:build': ['desktop_builder', 1],
  'desktop:export': ['desktop_builder', 0],
  // NEXORA #058 : publication d'une mise à jour (GitHub ou serveur web).
  'desktop:publish': ['desktop_builder', 0],
  // Dev Lab. NEXORA #059 : dossiers, éditeur, terminal, Git, GitHub, VS Code et aperçu sont gratuits (canaux
  // dev:* et git:* libres) ; le partage en ligne (tunnel public) reste réservé à Standard.
  'tunnel:start': ['devlab', 0],
  // NEXORA #052 : outils du Dev Lab. Standard : Problèmes, scripts, variables protégées, Git avancé, demandes de
  // fusion, client d'API, tests, dépendances. Pro : assistant IA du projet, débogueur, mise en ligne, contrôles
  // avant mise en ligne, bases de données.
  'devx:problems': ['devlab', 0],
  'devx:task-start': ['devlab', 0],
  'devx:env-set': ['devlab', 0],
  'devx:env-import': ['devlab', 0],
  'devx:git-merge': ['devlab', 0],
  'devx:git-stash': ['devlab', 0],
  'devx:git-blame': ['devlab', 0],
  'devx:pr-create': ['devlab', 0],
  'devx:pr-review': ['devlab', 0],
  'devx:http': ['devlab', 0],
  'devx:tests-run': ['devlab', 0],
  'devx:deps': ['devlab', 0],
  'devx:deps-update': ['devlab', 0],
  'devx:agent-context': ['devlab_pro', 0],
  'devx:agent-apply': ['devlab_pro', 0],
  'devx:debug-start': ['devlab_pro', 0],
  'devx:debug-attach': ['devlab_pro', 0],
  'devx:deploy-run': ['devlab_pro', 0],
  'devx:checks-run': ['devlab_pro', 0],
  'devx:db-tables': ['devlab_pro', 0],
  'devx:db-query': ['devlab_pro', 0],
  'devx:db-seed': ['devlab_pro', 0],
  // NEXORA #053 : NEX-DESIGN complet (Pro) : import de fichiers Figma.
  'dzx:figma-file': ['design_full', 0],
  'dzx:figma-svg': ['design_full', 0],
  // NEXORA #059 : l'assistant IA (ai:*) utilise la clé de l'utilisateur ou Ollama sur son PC : plus de quota.
};

// Fonction → permission de l'offre (même catalogue que nx_feature_rule côté serveur).
const PERM = {
  apk: 'apk', pwa: 'pwa', source_import: 'source_import', play_publish: 'play_publish', push: 'push',
  automation: 'automation', integrations: 'integrations', crawler: 'crawler', audit_advanced: 'audits_advanced',
  desktop_builder: 'desktop_builder', devlab: 'devlab', responsive_advanced: 'responsive_advanced', scan: null, ai: null,
  // NEXORA #048
  ci_export: 'api_sdk', rum: 'api_sdk', synthetic: 'synthetic', status_page: 'status_page', multi_region: 'multi_region',
  // NEXORA #052
  devlab_pro: 'devlab_pro',
  // NEXORA #053
  design_extended: 'design_extended', design_full: 'design_full',
  // NEXORA #073 : messagerie des applications Android (style conversation, réponses, appels) et modèles.
  messaging_events: 'messaging_events', custom_notifications: 'custom_notifications',
};
const QUOTA = new Set(['apk', 'pwa', 'push', 'crawler', 'desktop_builder', 'scan', 'ai']);
const LABEL = {
  apk: 'La génération d’APK', pwa: 'Le paquet PWA', source_import: 'L’import de dossiers et de code source',
  play_publish: 'La publication sur le Play Store', push: 'Les notifications push', automation: 'Les notifications programmées',
  integrations: 'Les achats intégrés et les outils d’intégration', crawler: 'Le Crawler (aspirateur de site)',
  audit_advanced: 'Les tests et audits avancés', desktop_builder: 'Le Desktop Builder', devlab: 'Le Dev Lab avancé (partage en ligne, Problèmes, scripts, tests, API, Git avancé)',
  scan: 'L’audit de sécurité', ai: 'L’assistant IA',
  responsive_advanced: 'Le Responsive avancé (enregistrement vidéo et outils de développement des appareils)',
  ci_export: 'L’intégration continue et l’export SARIF', rum: 'La mesure des visiteurs réels', synthetic: 'Les parcours rejoués',
  status_page: 'La page de statut publique', multi_region: 'La confirmation depuis une deuxième région',
  devlab_pro: 'Les outils Pro du Dev Lab (assistant IA du projet, débogueur, mise en ligne, contrôles, bases de données)',
  design_extended: 'NEX-DESIGN étendu', design_full: 'NEX-DESIGN complet (IA, code vers le Dev Lab, validation client, équipe, import Figma)',
  messaging_events: 'La messagerie des applications (style conversation, réponse depuis la notification, appels entrants)',
  custom_notifications: 'Les notifications personnalisées (modèles)',
};
const NAME = { free: 'Gratuit', standard: 'Standard', pro: 'Pro' };

// Permissions par défaut (copie de la migration), pour un invité ou des serveurs sans la migration.
const STANDARD_PERMS = ['apk', 'pwa', 'source_import', 'play_publish', 'push', 'crawler', 'audits_advanced', 'desktop_builder', 'devlab', 'inapp', 'alerts', 'responsive_advanced', 'status_page', 'design_extended'];
const PRO_ONLY = ['automation', 'integrations', 'api_sdk', 'studio_advanced', 'synthetic', 'multi_region', 'devlab_pro', 'design_full', 'messaging_events', 'custom_notifications'];
function defaultPerms(plan) {
  const p = {};
  for (const k of [...STANDARD_PERMS, ...PRO_ONLY]) p[k] = false;
  if (plan === 'standard' || plan === 'pro' || plan === 'team' || plan === 'enterprise') for (const k of STANDARD_PERMS) p[k] = true;
  if (plan === 'pro' || plan === 'team' || plan === 'enterprise') for (const k of PRO_ONLY) p[k] = true;
  return p;
}
const neededFor = (perm) => (PRO_ONLY.includes(perm) ? 'pro' : 'standard');

let cloud = null; // { url, key, token, email }
let status = null; // dernière réponse de nx_plan_status (ou repli), avec at
let lastOk = null; // dernière offre confirmée par le serveur
let fetchImpl = (u, o) => fetch(u, o);
const timeout = (ms) => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);

function setCloud(c) {
  const next = c && c.url && c.key && c.token ? { url: String(c.url).replace(/\/+$/, ''), key: c.key, token: c.token, email: c.email || '' } : null;
  const changed = !next || !cloud || next.token !== cloud.token;
  if (!next || !cloud || uidOf(next.token) !== uidOf(cloud.token)) lastOk = null; // autre compte : rien de l'ancien
  cloud = next;
  if (changed) status = null;
}

function uidOf(token) {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')).sub || null; } catch { return null; }
}

class Missing extends Error {}
async function call(method, path, body) {
  let r;
  try {
    r = await fetchImpl(`${cloud.url}${path}`, {
      method,
      headers: { apikey: cloud.key, authorization: `Bearer ${cloud.token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: timeout(10000),
    });
  } catch {
    const e = new Error('Connexion à NEXORA impossible : vérifie ta connexion à Internet, puis réessaie.');
    e.offline = true;
    throw e;
  }
  const j = await r.json().catch(() => null);
  if (r.ok) return j;
  const msg = String((j && (j.message || j.msg || j.error_description)) || `HTTP ${r.status}`);
  if (r.status === 401 || /jwt/i.test(msg)) throw new Error('Session NEXORA expirée : reconnecte-toi à ton compte, puis réessaie.');
  if ((j && j.code === 'PGRST202') || r.status === 404) throw new Missing(msg);
  throw new Error(msg);
}

// Repli sans la migration : offre lue dans les abonnements des espaces du compte (meilleure offre).
async function fromSubscriptions() {
  const uid = uidOf(cloud.token);
  const [rows, prof] = await Promise.all([
    call('GET', `/rest/v1/organization_members?select=organizations(subscriptions(plan_id,status,current_period_end))&user_id=eq.${uid}`),
    call('GET', `/rest/v1/profiles?select=app_role&id=eq.${uid}`),
  ]);
  const admin = Array.isArray(prof) && prof[0] && ['admin', 'superadmin'].includes(prof[0].app_role);
  const rank = { free: 0, standard: 1, pro: 2, team: 2, enterprise: 3 };
  let plan = 'free';
  for (const m of rows || []) {
    const subs = m.organizations && m.organizations.subscriptions;
    for (const s of Array.isArray(subs) ? subs : subs ? [subs] : []) {
      if (['active', 'trialing', 'past_due'].includes(s.status) && (rank[s.plan_id] || 0) > (rank[plan] || 0)) plan = s.plan_id;
    }
  }
  return { plan, plan_name: NAME[plan] || plan, admin, perms: defaultPerms(plan), limits: {}, usage: {}, source: 'abonnement' };
}

async function refresh(force = false) {
  if (!cloud) {
    status = { plan: 'free', plan_name: NAME.free, admin: false, perms: defaultPerms('free'), limits: {}, usage: {}, source: 'invite', at: Date.now() };
    return status;
  }
  if (!force && status && Date.now() - status.at < 5 * 60 * 1000) return status;
  try {
    const s = await call('POST', '/rest/v1/rpc/nx_plan_status', {});
    status = { ...s, source: 'serveur', at: Date.now() };
  } catch (e) {
    if (!(e instanceof Missing)) throw e;
    status = { ...(await fromSubscriptions()), at: Date.now() };
  }
  lastOk = status;
  return status;
}

function deny(info) {
  const e = new Error(info.message);
  e.plan = info;
  return e;
}

// Autorise (ou refuse) une fonction ; amount > 0 : consomme le quota sur le serveur.
async function check(feature, amount) {
  const perm = PERM[feature];
  const label = LABEL[feature] || 'Cette fonction';
  if (!cloud) {
    if (QUOTA.has(feature) && !perm) {
      throw deny({ feature, reason: 'auth', need: 'free', message: `${label} demande un compte NEXORA (gratuit) : connecte-toi pour profiter de ton quota mensuel.` });
    }
    if (perm && !defaultPerms('free')[perm]) {
      throw deny({ feature, reason: 'plan', plan: 'free', need: neededFor(perm), message: `${label} fait partie de l’offre ${NAME[neededFor(perm)]}. Connecte-toi à ton compte NEXORA, puis choisis ton offre dans Mon compte → Offre et usage.` });
    }
    return { ok: true, plan: 'free' };
  }
  if (amount > 0 || QUOTA.has(feature) && !perm) {
    let r;
    try {
      r = await call('POST', '/rest/v1/rpc/nx_use_feature', { p_feature: feature, p_amount: Math.max(1, amount || 1), p_check_only: !(amount > 0) });
    } catch (e) {
      if (!(e instanceof Missing)) throw e;
      // Serveurs sans la migration : l'offre de l'abonnement s'applique, aucun quota n'est compté.
      const s = await refresh();
      if (perm && !s.admin && !s.perms[perm]) throw deny({ feature, reason: 'plan', plan: s.plan, need: neededFor(perm), message: `${label} fait partie de l’offre ${NAME[neededFor(perm)]}. Ton offre actuelle : ${s.plan_name}.` });
      return { ok: true, plan: s.plan };
    }
    if (!r || !r.ok) throw deny({ ...(r || {}), feature, message: (r && r.message) || `${label} n’est pas disponible avec ton offre.` });
    if (status) status.at = 0; // consommation à jour au prochain plan:status
    return r;
  }
  let s;
  try { s = await refresh(); } catch (e) {
    if (e.offline && lastOk && Date.now() - lastOk.at < 24 * 3600 * 1000) s = lastOk; else throw e;
  }
  // NEXORA #048 : permission encore inconnue des serveurs (migration pas appliquée) : valeur par défaut de l'offre.
  const allowed = s.perms && perm in s.perms ? s.perms[perm] : defaultPerms(s.plan)[perm];
  if (s.admin || !perm || allowed) return { ok: true, plan: s.plan };
  throw deny({ feature, reason: 'plan', plan: s.plan, plan_name: s.plan_name, need: neededFor(perm), need_name: NAME[neededFor(perm)], message: `${label} fait partie de l’offre ${NAME[neededFor(perm)]}. Ton offre actuelle : ${s.plan_name || NAME[s.plan] || s.plan}.` });
}

// Remplace ipcMain.handle avant tout enregistrement : les canaux de GATES passent d'abord par check().
// mon:cloud-session (session du compte, #030) est aussi lu ici.
function guardIpc(ipcMain, opts = {}) {
  if (opts.fetchImpl) fetchImpl = opts.fetchImpl;
  const handle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, fn) => {
    if (channel === 'mon:cloud-session') return handle(channel, (e, c, ...rest) => { setCloud(c); return fn(e, c, ...rest); });
    const gate = GATES[channel];
    if (!gate) return handle(channel, fn);
    return handle(channel, async (e, ...args) => {
      try {
        await check(gate[0], gate[1]);
      } catch (err) {
        if (err.plan && e && e.sender && !e.sender.isDestroyed()) {
          try { e.sender.send('plan:blocked', { channel, ...err.plan }); } catch { /* fenêtre fermée */ }
        }
        throw err;
      }
      return fn(e, ...args);
    });
  };
  handle('plan:status', async (_e, force) => {
    const s = await refresh(Boolean(force));
    return { ...s, gates: Object.keys(GATES).length };
  });
  handle('plan:refresh', async () => { status = null; return refresh(true); });
}

module.exports = { guardIpc, check, refresh, setCloud, GATES, defaultPerms };
