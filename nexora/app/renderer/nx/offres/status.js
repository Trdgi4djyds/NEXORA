// NEXORA #037 : offre du compte vue par l'interface. Source : fonction nx_plan_status du serveur
// (migration 20261104000007) ; sans la migration, l'offre lue dans l'abonnement de l'espace et les limites du
// catalogue ; sans compte, l'offre Gratuite. Les contrôles qui comptent sont faits par le serveur et par le
// processus principal (src/plan.js) : ici, on affiche et on évite d'aller au bout d'une action refusée.
import { b as sb, e as cloud } from '../../dist/chunks/chunk-EZKHFSAB.js';
import { FALLBACK, PLAN_ORDER, normPlan, planOf } from './catalog.js';

let last = null, lastAt = 0, pending = null;
let trials = null, trialsAt = 0;
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => { for (const fn of listeners) try { fn(last); } catch (e) { console.error('[NEXORA #037]', e); } };

// Fonction absente des serveurs (migration pas encore appliquée).
export const missing = (e) => !!e && (e.code === 'PGRST202' || e.code === '42883' || /Could not find the function|does not exist/i.test(e.message || ''));

function guest() {
  const p = FALLBACK.free;
  return { plan: 'free', plan_name: p.name, admin: false, perms: p.perms, limits: p.limits, org_limits: p.limits, usage: {}, source: 'invite', guest: true };
}

export const current = () => last || guest();

// NEXORA #084 : un administrateur de NEXORA a un accès total, quelle que soit son offre : toutes les fonctions et
// aucune limite (le serveur ne le limite déjà pas : nx_use_feature, déclencheurs des limites).
export function adminAccess(s) {
  if (!s || !s.admin) return s;
  const all = (o) => Object.fromEntries(Object.keys(o || {}).map((k) => [k, true]));
  const free = (o) => Object.fromEntries(Object.keys(o || {}).map((k) => [k, -1]));
  const pro = FALLBACK.pro;
  return { ...s, plan: 'pro', plan_name: pro.name, perms: all({ ...pro.perms, ...(s.perms || {}) }), limits: free({ ...pro.limits, ...(s.limits || {}) }), org_limits: free({ ...pro.limits, ...(s.org_limits || {}) }) };
}
export function can(perm) {
  const s = current();
  return !perm || s.admin || !!(s.perms && s.perms[perm]);
}

export async function status(force = false) {
  if (!cloud.user) { last = guest(); return last; }
  if (!force && last && last.uid === cloud.user.id && last.view === cloud.orgId && Date.now() - lastAt < 60000) return last;
  if (pending) return pending;
  pending = (async () => {
    let s;
    const { data, error } = await sb.rpc('nx_plan_status', { p_org: cloud.orgId || null }).then((r) => r, (e) => ({ error: e }));
    if (!error && data) s = { ...data, source: 'serveur' };
    else {
      // Repli : abonnement de l'espace et limites du catalogue (aucun quota compté).
      const def = planOf(cloud.plan);
      let usage = {};
      try { const r = await sb.rpc('org_quota', { org: cloud.orgId }); usage = (r.data && (r.data.usage || r.data)) || {}; } catch { /* hors ligne */ }
      for (const k of Object.keys(usage)) if (usage[k] && typeof usage[k] === 'object') usage[k] = usage[k].used;
      s = { plan: def.id, plan_name: def.name, admin: cloud.isAdmin, perms: def.perms, limits: def.limits, org_limits: def.limits, usage, source: error && !missing(error) ? 'hors-ligne' : 'abonnement' };
    }
    s.plan = normPlan(s.plan);
    s = adminAccess(s);
    s.uid = cloud.user.id;
    s.view = cloud.orgId;
    last = s;
    lastAt = Date.now();
    emit();
    return s;
  })().finally(() => { pending = null; });
  return pending;
}

// Offres proposées : lignes de la table plans si elles sont migrées, sinon le catalogue. NEXORA #087 : repère
// « pro » avec ses permissions (l'offre Standard, retirée de la vente au #076, n'est plus parmi les offres actives :
// l'ancien repère renvoyait toujours le catalogue).
export async function plans() {
  try {
    const { data, error } = await sb.from('plans').select('*').eq('active', true).order('sort');
    if (!error && data && data.some((p) => p.id === 'pro' && p.perms && Object.keys(p.perms).length)) {
      return data.map((p) => ({ ...(FALLBACK[p.id] || {}), ...p, limits: { ...((FALLBACK[p.id] || {}).limits || {}), ...(p.limits || {}) }, perms: { ...((FALLBACK[p.id] || {}).perms || {}), ...(p.perms || {}) } }));
    }
  } catch { /* hors ligne : catalogue */ }
  return PLAN_ORDER.map((id) => FALLBACK[id]);
}

// Applications du compte (App Builder et, depuis le #087, Desktop Builder) : { ok, plan, trial_days, limit, used,
// lifetime, builds_limit, apps: { id: état } } ou null (serveurs sans la migration, ou pas de compte).
// ids : applications de ce PC (null : toutes celles du compte, pour l'onglet Offre et usage).
export async function appTrials(force = false, ids = null) {
  if (!cloud.user) return null;
  if (!force && trials && trials.uid === cloud.user.id && Date.now() - trialsAt < 60000) return trials;
  const { data, error } = await sb.rpc('nx_app_status', { p_local_ids: ids && ids.length ? ids : null }).then((r) => r, (e) => ({ error: e }));
  if (error || !data) { trials = error && missing(error) ? { unavailable: true, uid: cloud.user.id, apps: {} } : trials; trialsAt = Date.now(); return trials; }
  const keep = trials && trials.uid === cloud.user.id && !trials.unavailable ? trials.apps : {};
  trials = { ...data, apps: { ...keep, ...(data.apps || {}) }, uid: cloud.user.id };
  trialsAt = Date.now();
  return trials;
}
export function trialsCached() { return trials && cloud.user && trials.uid === cloud.user.id ? trials : null; }

// Réserve une application sur le compte. platform : « android » (réglages de l'App Builder) ou « windows »
// (logiciel du Desktop Builder, NEXORA #087).
export async function claimApp(app, platform = 'android') {
  const src = app.source || {};
  const kind = src.kind === 'url' ? 'url' : src.kind === 'project' || src.kind === 'electron' ? 'project' : 'folder';
  const args = { p_local_id: app.id, p_name: (platform === 'windows' ? app.name : app.appName) || '', p_source_kind: kind, p_url: src.url || null, p_org: cloud.orgId || null };
  let { data, error } = await sb.rpc('nx_app_claim', { ...args, p_platform: platform });
  // Serveurs sans la migration du #087 : fonction sans la plateforme.
  if (error && missing(error)) ({ data, error } = await sb.rpc('nx_app_claim', args));
  if (error) throw error;
  if (data && data.ok && trials) { trials.apps = { ...trials.apps, [app.id]: data }; trialsAt = 0; }
  return data;
}
export async function releaseApp(id) {
  try { await sb.rpc('nx_app_release', { p_local_id: id }); } catch { /* sans effet hors ligne */ }
  trialsAt = 0;
}

// Demande de changement d'offre : ticket « billing » au support (même parcours que l'onglet Offre et usage).
export async function askPlan(id) {
  const name = planOf(id).name;
  const org = cloud.org;
  const { data: t, error } = await sb.from('support_tickets').insert({ user_id: cloud.user.id, org_id: cloud.orgId, subject: `Passage à l’offre ${name}`, category: 'billing' }).select().single();
  if (error) throw error;
  await sb.from('ticket_messages').insert({ ticket_id: t.id, author_id: cloud.user.id, body: `Je souhaite passer l’espace « ${org ? org.name : ''} » à l’offre ${name}.` });
  return t;
}

// Le processus principal garde l'offre 5 minutes : on lui demande de la relire (changement d'offre, de compte).
export function refreshMain() {
  try { const api = window.vitrine; if (api && api.invoke) Promise.resolve(api.invoke('plan:refresh')).catch(() => {}); } catch { /* aperçu */ }
}

export { cloud, sb };
