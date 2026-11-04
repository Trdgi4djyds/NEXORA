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
    s.uid = cloud.user.id;
    s.view = cloud.orgId;
    last = s;
    lastAt = Date.now();
    emit();
    return s;
  })().finally(() => { pending = null; });
  return pending;
}

// Offres proposées : lignes de la table plans si elles sont migrées (standard présente), sinon le catalogue.
export async function plans() {
  try {
    const { data, error } = await sb.from('plans').select('*').eq('active', true).order('sort');
    if (!error && data && data.some((p) => p.id === 'standard')) {
      return data.map((p) => ({ ...(FALLBACK[p.id] || {}), ...p, limits: { ...((FALLBACK[p.id] || {}).limits || {}), ...(p.limits || {}) }, perms: { ...((FALLBACK[p.id] || {}).perms || {}), ...(p.perms || {}) } }));
    }
  } catch { /* hors ligne : catalogue */ }
  return PLAN_ORDER.map((id) => FALLBACK[id]);
}

// Essais des applications de l'App Builder : { ok, plan, trial_days, limit, used, apps: { id: état } } ou null
// (serveurs sans la migration, ou pas de compte).
// ids : applications de l'App Builder de ce PC (null : toutes celles du compte, pour l'onglet Offre et usage).
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

export async function claimApp(app) {
  const kind = app.source && app.source.kind === 'url' ? 'url' : app.source && app.source.kind === 'project' ? 'project' : 'folder';
  const { data, error } = await sb.rpc('nx_app_claim', {
    p_local_id: app.id, p_name: app.appName || '', p_source_kind: kind, p_url: (app.source && app.source.url) || null, p_org: cloud.orgId || null,
  });
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
