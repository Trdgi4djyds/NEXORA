// NEXORA #022 : supervision par les serveurs NEXORA (Supabase, 24 h/24, même NEXORA fermée). Un site de
// la supervision peut être « aussi surveillé par le serveur » : une ligne de la table monitors de l'équipe
// active, reliée par app_site_id à l'identifiant du site sur ce PC. Mesures et incidents du serveur lus
// par monitor_series (supabase/migrations/20261104000002_supervision_serveur.sql).
import { b as sb, e as cloud } from '../dist/chunks/chunk-EZKHFSAB.js';

export const HOURS = { '1h': 1, '24h': 24, '7j': 168, '30j': 720, '90j': 2160 };

// Le serveur n'a pas encore la migration #022 (colonne ou fonction inconnue).
export const outdated = (err) => /app_site_id|threshold_ms|monitor_series|PGRST202|42703|could not find/i.test(`${(err && err.code) || ''} ${(err && err.message) || err || ''}`);

export function account() {
  return {
    signedIn: Boolean(cloud.user),
    email: (cloud.user && cloud.user.email) || '',
    orgId: cloud.orgId || null,
    orgName: (cloud.org && cloud.org.name) || '',
    canEdit: Boolean(cloud.canEdit),
  };
}

export function onAccount(fn) {
  const offs = ['auth', 'org', 'ready', 'account'].map((ev) => { try { return cloud.on(ev, fn); } catch { return () => {}; } });
  return () => offs.forEach((off) => off());
}

// Sites de l'équipe active reliés à la supervision de ce PC : Map(app_site_id → ligne monitors).
export async function links() {
  const a = account();
  if (!a.signedIn || !a.orgId) return { map: new Map(), outdated: false };
  const { data, error } = await sb.from('monitors').select('id, app_site_id, active, last_status, last_checked_at, last_latency_ms, last_error, interval_minutes').eq('org_id', a.orgId).not('app_site_id', 'is', null);
  if (error) return { map: new Map(), outdated: outdated(error), error };
  return { map: new Map((data || []).map((m) => [m.app_site_id, m])), outdated: false };
}

function row(site, orgId) {
  return {
    org_id: orgId,
    app_site_id: site.id,
    name: String(site.name || '').slice(0, 120),
    url: site.url,
    interval_minutes: Math.max(1, Math.round((Number(site.intervalSec) || 300) / 60)),
    threshold_ms: Math.max(0, Number(site.thresholdMs) || 0),
    expected_status: Number(site.expectStatus) || 200,
    keyword: site.keyword ? String(site.keyword) : null,
    confirm_count: Math.min(10, Math.max(1, Number(site.confirm) || 2)),
    active: site.enabled !== false,
  };
}

// Active (ou met à jour) la surveillance par le serveur d'un site de ce PC.
export async function link(site) {
  const a = account();
  if (!a.signedIn) throw new Error('Connecte-toi à ton compte NEXORA pour activer la surveillance 24 h/24.');
  if (!a.orgId) throw new Error('Choisis d’abord un espace d’équipe dans ton compte NEXORA.');
  if (!a.canEdit) throw new Error('Ton rôle dans cet espace ne permet pas d’ajouter des sites surveillés (éditeur au moins).');
  const values = row(site, a.orgId);
  const found = await sb.from('monitors').select('id').eq('org_id', a.orgId).eq('app_site_id', site.id).limit(1);
  if (found.error) throw serverError(found.error);
  const existing = (found.data || [])[0];
  const res = existing
    ? await sb.from('monitors').update(values).eq('id', existing.id).select('id').single()
    : await sb.from('monitors').insert({ ...values, created_by: cloud.user.id }).select('id').single();
  if (res.error) throw serverError(res.error);
  return res.data.id;
}

export async function unlink(siteId) {
  const a = account();
  if (!a.signedIn || !a.orgId) return false;
  const { error } = await sb.from('monitors').delete().eq('org_id', a.orgId).eq('app_site_id', siteId);
  if (error) throw serverError(error);
  return true;
}

export async function series(monitorId, range) {
  const { data, error } = await sb.rpc('monitor_series', { p_monitor: monitorId, p_hours: HOURS[range] || 24, p_buckets: 90 });
  if (error) throw serverError(error);
  return data;
}

function serverError(err) {
  const m = String((err && err.message) || err || '');
  if (outdated(err)) return Object.assign(new Error('Le serveur NEXORA n’est pas encore à jour pour la supervision 24 h/24 : l’administrateur doit appliquer la migration « supervision_serveur » depuis le back office (section Supabase).'), { outdated: true });
  if (/quota|limit|plan/i.test(m)) return new Error(`Limite de ton offre atteinte pour les sites surveillés par le serveur. ${m}`);
  if (/row-level security|permission denied/i.test(m)) return new Error('Tu n’as pas les droits pour modifier les sites surveillés de cet espace.');
  return new Error(m || 'Le serveur NEXORA n’a pas répondu.');
}
