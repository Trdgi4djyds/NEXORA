// NEXORA #022 : supervision par les serveurs NEXORA (Supabase, 24 h/24, même NEXORA fermée). Un site de
// la supervision peut être « aussi surveillé par le serveur » : une ligne de la table monitors de l'équipe
// active, reliée par app_site_id à l'identifiant du site sur ce PC. Mesures et incidents du serveur lus
// par monitor_series (supabase/migrations/20261104000002_supervision_serveur.sql).
import { b as sb, e as cloud } from '../dist/chunks/chunk-EZKHFSAB.js';

export const HOURS = { '1h': 1, '24h': 24, '7j': 168, '30j': 720, '90j': 2160 };
// NEXORA #048 : adresse publique de NEXORA web (signal de vie, page de statut, visiteurs réels, déploiements).
// Même adresse que chunk-EZKHFSAB.js, admin/src/supabase.ts et supabase/nexora.json : à changer ensemble.
export const WEB = 'https://nexora.abrahamtogbonon0.workers.dev/';

// Le serveur n'a pas encore la migration #022 (colonne ou fonction inconnue).
export const outdated = (err) => /app_site_id|threshold_ms|monitor_series|status_pages|rum_sites|monitor_maintenance|nx_monitor_hook_token|rum_summary|PGRST202|PGRST205|42703|42P01|could not find/i.test(`${(err && err.code) || ''} ${(err && err.message) || err || ''}`);

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
  // NEXORA #048 : toutes les colonnes (type, signal de vie, deuxième région…), présentes ou non selon les migrations.
  const { data, error } = await sb.from('monitors').select('*').eq('org_id', a.orgId).not('app_site_id', 'is', null);
  if (error) return { map: new Map(), outdated: outdated(error), error };
  return { map: new Map((data || []).map((m) => [m.app_site_id, m])), outdated: false };
}

function row(site, orgId, extended = true) {
  const type = site.type || 'http';
  const base = {
    org_id: orgId,
    app_site_id: site.id,
    name: String(site.name || '').slice(0, 120),
    url: type === 'dns' || type === 'domain' ? `https://${site.host}` : type === 'heartbeat' ? `https://heartbeat.invalid/${site.id}` : site.url,
    interval_minutes: Math.max(1, Math.round((Number(site.intervalSec) || 300) / 60)),
    threshold_ms: Math.max(0, Number(site.thresholdMs) || 0),
    expected_status: Number(site.expectStatus) || 200,
    keyword: site.keyword ? String(site.keyword) : null,
    confirm_count: Math.min(10, Math.max(1, Number(site.confirm) || 2)),
    active: site.enabled !== false,
  };
  if (!extended) return base;
  // NEXORA #048 : colonnes de la migration 20261105000008 (types, objectif, contenu modifié).
  const headers = {};
  for (const line of String(site.headers || '').split(/\r?\n/)) { const i = line.indexOf(':'); if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return {
    ...base,
    kind: type,
    method: type === 'api' ? String(site.method || 'GET') : 'GET',
    req_headers: type === 'api' ? headers : {},
    req_body: type === 'api' && site.body ? String(site.body) : null,
    json_path: type === 'api' && site.jsonPath ? String(site.jsonPath) : null,
    json_op: type === 'api' ? String(site.jsonOp || 'equals') : 'equals',
    json_expect: type === 'api' && site.jsonExpect != null ? String(site.jsonExpect) : null,
    dns_type: type === 'dns' ? String(site.recordType || 'A') : 'A',
    dns_expect: type === 'dns' && site.dnsExpect ? String(site.dnsExpect) : null,
    dns_watch: type === 'dns' ? site.dnsWatch !== false : false,
    domain_warn_days: Number(site.domainWarn) || 30,
    watch_change: Boolean(site.watchChange),
    slo: Number(site.slo) || 99.9,
    escalate_min: Math.max(0, Number(site.escalateMin) || 0),
  };
}

// Active (ou met à jour) la surveillance par le serveur d'un site de ce PC.
export async function link(site) {
  const a = account();
  if (!a.signedIn) throw new Error('Connecte-toi à ton compte NEXORA pour activer la surveillance 24 h/24.');
  if (!a.orgId) throw new Error('Choisis d’abord un espace d’équipe dans ton compte NEXORA.');
  if (!a.canEdit) throw new Error('Ton rôle dans cet espace ne permet pas d’ajouter des sites surveillés (éditeur au moins).');
  const found = await sb.from('monitors').select('id').eq('org_id', a.orgId).eq('app_site_id', site.id).limit(1);
  if (found.error) throw serverError(found.error);
  const existing = (found.data || [])[0];
  const save = (values) => (existing
    ? sb.from('monitors').update(values).eq('id', existing.id).select('id').single()
    : sb.from('monitors').insert({ ...values, created_by: cloud.user.id }).select('id').single());
  let res = await save(row(site, a.orgId, true));
  // Serveurs sans la migration 20261105000008 : colonnes d'origine seulement (page web).
  if (res.error && /column|kind|schema cache|42703|PGRST204/i.test(`${res.error.code || ''} ${res.error.message || ''}`)) {
    if ((site.type || 'http') !== 'http') throw Object.assign(new Error('Ce type de vérification par les serveurs NEXORA n’est pas encore disponible. Réessaie plus tard.'), { outdated: true });
    res = await save(row(site, a.orgId, false));
  }
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
  if (outdated(err)) return Object.assign(new Error('La surveillance 24 h/24 n’est pas encore disponible. Réessaie plus tard.'), { outdated: true });
  if (/quota|limit|plan/i.test(m)) return new Error(/Limite de ton offre/.test(m) ? m : 'Limite de ton offre atteinte pour les sites surveillés.');
  if (/row-level security|permission denied/i.test(m)) return new Error('Tu n’as pas les droits pour modifier les sites surveillés de cet espace.');
  return new Error(m || 'NEXORA n’a pas répondu : réessaie dans un instant.');
}

// ---------- NEXORA #048 : signal de vie, déploiements, pages de statut, visiteurs réels ----------
export const heartbeatUrl = (m) => (m && m.heartbeat_token ? `${WEB}hb/${m.heartbeat_token}` : '');

// Jeton de l'équipe pour poser un repère de déploiement depuis une intégration continue.
export async function deployHook() {
  const a = account();
  if (!a.signedIn || !a.orgId) return null;
  const { data, error } = await sb.rpc('nx_monitor_hook_token', { p_org: a.orgId });
  if (error) throw serverError(error);
  return data ? `${WEB}hook/deploy/${data}` : null;
}

export async function statusPages() {
  const a = account();
  if (!a.signedIn || !a.orgId) return { list: [], monitors: [], account: a };
  const [p, m] = await Promise.all([
    sb.from('status_pages').select('*').eq('org_id', a.orgId).order('created_at'),
    sb.from('monitors').select('id, name, url, kind, active, last_status, app_site_id').eq('org_id', a.orgId).order('name'),
  ]);
  if (p.error) throw serverError(p.error);
  return { list: p.data || [], monitors: m.data || [], account: a };
}

export async function saveStatusPage(page) {
  const a = account();
  const values = { org_id: a.orgId, slug: String(page.slug || '').toLowerCase(), title: String(page.title || '').slice(0, 120), intro: String(page.intro || '').slice(0, 600), monitor_ids: page.monitor_ids || [], published: page.published !== false, show_incidents: page.show_incidents !== false };
  const res = page.id ? await sb.from('status_pages').update(values).eq('id', page.id).select('*').single() : await sb.from('status_pages').insert({ ...values, created_by: cloud.user.id }).select('*').single();
  if (res.error) {
    if (/duplicate|unique/i.test(res.error.message || '')) throw new Error('Cette adresse est déjà prise : choisis un autre nom.');
    throw serverError(res.error);
  }
  return res.data;
}

export async function deleteStatusPage(id) {
  const { error } = await sb.from('status_pages').delete().eq('id', id);
  if (error) throw serverError(error);
  return true;
}

export const statusUrl = (slug) => `${WEB}status/?p=${encodeURIComponent(slug)}`;

export async function rumSites() {
  const a = account();
  if (!a.signedIn || !a.orgId) return { list: [], account: a };
  const { data, error } = await sb.from('rum_sites').select('*').eq('org_id', a.orgId).order('created_at');
  if (error) throw serverError(error);
  return { list: data || [], account: a };
}

export async function createRumSite({ name, origin }) {
  const a = account();
  const { data, error } = await sb.from('rum_sites').insert({ org_id: a.orgId, name: String(name || origin || 'Site').slice(0, 120), origins: origin ? [origin] : [], created_by: cloud.user.id }).select('*').single();
  if (error) throw serverError(error);
  return data;
}

export async function deleteRumSite(id) {
  const { error } = await sb.from('rum_sites').delete().eq('id', id);
  if (error) throw serverError(error);
  return true;
}

export async function rumSummary(siteId, hours = 168) {
  const { data, error } = await sb.rpc('rum_summary', { p_site: siteId, p_hours: hours });
  if (error) throw serverError(error);
  return data;
}

export const rumSnippet = (key) => `<script src="${WEB}rum.js" data-site="${key}" defer></script>`;

// Fenêtres de maintenance partagées avec les serveurs (aucune alerte, exclues de la disponibilité).
export async function pushMaintenance(list, map) {
  const a = account();
  if (!a.signedIn || !a.orgId || !a.canEdit) return false;
  const rows = list.map((w) => ({ org_id: a.orgId, local_id: w.id, monitor_id: w.siteId ? (map.get(w.siteId) || {}).id || null : null, label: w.label, starts_at: new Date(w.start).toISOString(), ends_at: new Date(w.end).toISOString(), recur: w.recur || 'none', created_by: cloud.user.id }))
    .filter((r) => !list.find((w) => w.id === r.local_id).siteId || r.monitor_id);
  const del = await sb.from('monitor_maintenance').delete().eq('org_id', a.orgId).not('local_id', 'is', null);
  if (del.error) throw serverError(del.error);
  if (rows.length) { const ins = await sb.from('monitor_maintenance').insert(rows); if (ins.error) throw serverError(ins.error); }
  return true;
}

// Heures calmes partagées avec les serveurs (e-mails des alertes non critiques retenus pendant la plage).
export async function saveAlertPrefs({ quietFrom, quietTo }) {
  const a = account();
  if (!a.signedIn) return false;
  const on = quietFrom >= 0 && quietTo >= 0 && quietFrom !== quietTo;
  const { error } = await sb.from('nx_alert_prefs').upsert({ user_id: cloud.user.id, quiet_from: on ? quietFrom : null, quiet_to: on ? quietTo : null, updated_at: new Date().toISOString() });
  if (error && !outdated(error)) throw serverError(error);
  return !error;
}
