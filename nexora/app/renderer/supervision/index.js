// NEXORA #015 : supervision de NEXORA, onglet « Supervision & alertes » de l'espace Sécurité.
// Tableaux de bord analytiques (vue d'ensemble, sites, incidents, tests de charge, plateforme, alertes)
// alimentés par le processus principal (src/monitor.js, src/loadtest.js, src/telemetry.js).
// Chargé à la demande par renderer/dist/chunks/security-PRU3E45U.js (renderMonitor).
import { api, call, esc, icon, debounce, RANGES, $ } from './util.js';
import { renderOverview } from './overview.js';
import { renderSites } from './sites.js';
import { renderIncidents } from './incidents.js';
import { renderLoad, onLoadProgress } from './load.js';
import { renderPlatform } from './platform.js';
import { renderAlerts } from './alerts.js';
// NEXORA #048 : maintenance et déploiements, page de statut publique, visiteurs réels.
import { renderPlanning } from './planning.js';
import { renderStatus } from './status.js';
import { renderRum } from './rum.js';
import { siteSheet } from './ui.js';
import { links, onAccount } from './cloud.js';

const TABS = [
  ['overview', 'Vue d’ensemble', 'grid', renderOverview],
  ['sites', 'Sites', 'globe', renderSites],
  ['incidents', 'Incidents', 'warn', renderIncidents],
  ['load', 'Tests de charge', 'bolt', renderLoad],
  ['planning', 'Planning', 'clock', renderPlanning],
  ['status', 'Page publique', 'globe', renderStatus],
  ['rum', 'Visiteurs réels', 'user', renderRum],
  ['platform', 'Plateforme', 'laptop', renderPlatform],
  ['alerts', 'Alertes', 'bell', renderAlerts],
];
const WITH_RANGE = new Set(['overview', 'sites', 'incidents']);
const PREF_KEY = 'nexora:supervision';

function loadCss() {
  if (document.querySelector('link[data-sup-css]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('./supervision.css', import.meta.url).href;
  l.dataset.supCss = '';
  document.head.append(l);
}

class Supervision {
  constructor() {
    let pref = {};
    try { pref = JSON.parse(sessionStorage.getItem(PREF_KEY) || '{}'); } catch { pref = {}; }
    this.tab = TABS.some((t) => t[0] === pref.tab) ? pref.tab : 'overview';
    this.range = RANGES.some((r) => r[0] === pref.range) ? pref.range : '24h';
    this.siteId = pref.siteId || null;
    this.state = {};
    this.charts = [];
    this.cleanups = [];
    this.busy = false;
    this.lastLive = 0;
    loadCss();
    const live = debounce(() => this.live(), 1500);
    api.on('mon:update', live);
    api.on('mon:incident', debounce(() => { this.updateBadge(); this.live(true); }, 600));
    api.on('mon:loadtest-progress', (p) => onLoadProgress(this, p));
    setInterval(() => this.live(), 30000);
    // Services en ligne de NEXORA (onglet Plateforme) : adresse et clé publique du client Supabase.
    import('../dist/chunks/chunk-EZKHFSAB.js').then((m) => {
      const sb = m && m.b;
      if (sb && sb.supabaseUrl && sb.supabaseKey) call('tel:services-config', { url: String(sb.supabaseUrl), key: String(sb.supabaseKey) }).catch(() => {});
    }).catch(() => {});
    this.bindTips();
    // Connexion, déconnexion ou changement d'équipe : la carte du serveur et les badges suivent.
    onAccount(debounce(() => { if (this.visible() && (this.tab === 'sites' || this.tab === 'overview')) this.show(true); }, 800));
  }

  savePref() {
    try { sessionStorage.setItem(PREF_KEY, JSON.stringify({ tab: this.tab, range: this.range, siteId: this.siteId })); } catch { /* */ }
  }

  attach(hostEl, { siteUrl } = {}) {
    this.host = hostEl;
    this.siteUrl = siteUrl || (() => '');
    const sec = hostEl.closest('.sec');
    if (sec) sec.classList.add('sup-wide');
    hostEl.innerHTML = `<div class="sup">
      <div class="sup-top">
        <div class="seg sup-nav" role="tablist" aria-label="Vues de la supervision">${TABS.map(([id, label, ic]) => `<button type="button" role="tab" data-sup-tab="${id}" class="${id === this.tab ? 'on' : ''}" aria-selected="${id === this.tab}" aria-label="${esc(label)}">${icon(ic, 13)}<span>${esc(label)}</span>${id === 'incidents' ? '<b class="sup-badge" hidden></b>' : ''}</button>`).join('')}</div>
        <span class="grow"></span>
        <span class="sup-live" data-tip="Les mesures arrivent en direct tant que NEXORA est ouverte"><i></i><span>En direct</span></span>
        <div class="seg sup-range" role="radiogroup" aria-label="Période">${RANGES.map(([id, label]) => `<button type="button" role="radio" data-sup-range="${id}" class="${id === this.range ? 'on' : ''}" aria-checked="${id === this.range}">${label}</button>`).join('')}</div>
      </div>
      <div class="sup-view" aria-live="polite"></div>
    </div>`;
    hostEl.querySelector('.sup').addEventListener('click', (ev) => this.onClick(ev));
    this.view = hostEl.querySelector('.sup-view');
    this.show();
    this.updateBadge();
  }

  visible() { return Boolean(this.host && this.host.isConnected && this.host.offsetParent !== null); }

  onClick(ev) {
    const tab = ev.target.closest('[data-sup-tab]');
    if (tab) { this.go(tab.dataset.supTab); return; }
    const r = ev.target.closest('[data-sup-range]');
    if (r) { this.range = r.dataset.supRange; this.savePref(); this.markNav(); this.show(); return; }
    const add = ev.target.closest('[data-sup-add]');
    if (add) { this.addSite(add.dataset.supAdd === 'current' ? this.siteUrl() : ''); }
    const open = ev.target.closest('[data-sup-open]');
    if (open) { this.go('sites', { siteId: open.dataset.supOpen }); }
  }

  markNav() {
    if (!this.host) return;
    for (const b of this.host.querySelectorAll('[data-sup-tab]')) { const on = b.dataset.supTab === this.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
    for (const b of this.host.querySelectorAll('[data-sup-range]')) { const on = b.dataset.supRange === this.range; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
    const rg = this.host.querySelector('.sup-range');
    if (rg) rg.hidden = !WITH_RANGE.has(this.tab);
  }

  go(tab, opts = {}) {
    if (opts.siteId) this.siteId = opts.siteId;
    if (opts.incidentFilter) this.state.incFilter = { ...(this.state.incFilter || {}), ...opts.incidentFilter };
    this.tab = tab;
    this.savePref();
    this.markNav();
    this.show();
    const pane = this.host && this.host.closest('.sec-pane');
    if (pane && pane.scrollTop > 200) pane.scrollTop = 0;
  }

  clearCharts() {
    for (const c of this.charts) { try { c.destroy(); } catch { /* */ } }
    this.charts = [];
    for (const f of this.cleanups) { try { f(); } catch { /* */ } }
    this.cleanups = [];
  }

  // Affiche la vue courante. `soft` : mise à jour en direct (pas d'indicateur de chargement).
  async show(soft = false) {
    if (!this.view) return;
    this.markNav();
    const entry = TABS.find((t) => t[0] === this.tab) || TABS[0];
    const token = (this.token = (this.token || 0) + 1);
    if (!soft) this.view.classList.add('loading');
    const pane = this.host.closest('.sec-pane');
    const keep = pane ? pane.scrollTop : 0;
    try {
      const html = await entry[3](this, { soft, token });
      if (token !== this.token) return;
      if (typeof html === 'string') {
        this.clearCharts();
        this.view.innerHTML = html;
      }
      if (typeof this.afterRender === 'function') { const f = this.afterRender; this.afterRender = null; f(); }
      if (soft && pane) pane.scrollTop = keep;
    } catch (err) {
      if (token !== this.token) return;
      this.clearCharts();
      this.view.innerHTML = `<div class="sup-empty">${icon('warn', 30)}<b>Impossible d’afficher cette vue</b><p>${esc(err && err.message ? err.message : String(err))}</p></div>`;
    } finally {
      if (token === this.token) this.view.classList.remove('loading');
      this.lastLive = Date.now();
      const live = this.host.querySelector('.sup-live span');
      if (live) live.textContent = `En direct · ${new Date().toLocaleTimeString('fr-FR')}`;
    }
  }

  // Mise à jour en direct (évènements du processus principal), au plus toutes les 8 s.
  live(force = false) {
    if (!this.visible() || !WITH_RANGE.has(this.tab)) return;
    if (document.querySelector('#sheetBackdrop:not([hidden])')) return;
    if (this.view && this.view.matches(':hover') && !force && Date.now() - this.lastLive < 30000) return;
    if (!force && Date.now() - this.lastLive < 8000) return;
    this.show(true);
  }

  refresh() { this.live(true); }

  async updateBadge() {
    if (!this.host) return;
    const b = this.host.querySelector('.sup-badge');
    if (!b) return;
    try {
      const q = await call('mon:incidents', { state: 'open', range: '90j', limit: 1 });
      const n = q && q.stats ? q.stats.open : 0;
      b.hidden = !n;
      b.textContent = n > 99 ? '99+' : String(n);
    } catch { b.hidden = true; }
  }

  async addSite(url = '') {
    let cfg;
    try { cfg = await call('mon:config'); } catch (err) { return; }
    const r = await siteSheet({ cfg, url });
    if (r) { this.siteId = r.id; this.state.overview = null; this.go('sites', { siteId: r.id }); }
  }

  async editSite(id) {
    const cfg = await call('mon:config');
    const site = (cfg.endpoints || []).find((x) => x.id === id);
    if (!site) return;
    const l = await links().catch(() => ({ map: new Map() }));
    const r = await siteSheet({ cfg, site, server: l.map.has(id) });
    if (r) this.show(true);
  }

  // Infobulle commune à tous les éléments [data-tip] de la supervision.
  bindTips() {
    let tip = null;
    const hide = () => { if (tip) tip.hidden = true; };
    document.addEventListener('mouseover', (ev) => {
      const t = ev.target.closest && ev.target.closest('.sup [data-tip], .sup-sheet [data-tip]');
      if (!t) { hide(); return; }
      if (!tip) { tip = document.createElement('div'); tip.className = 'sup-float-tip'; document.body.append(tip); }
      tip.textContent = t.dataset.tip;
      tip.hidden = false;
      const r = t.getBoundingClientRect();
      const w = tip.offsetWidth; const h = tip.offsetHeight;
      let x = r.left + r.width / 2 - w / 2;
      x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
      const y = r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8;
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
    });
    document.addEventListener('scroll', hide, true);
  }
}

let inst = null;

export function mount(hostEl, opts) {
  if (!inst) inst = new Supervision();
  inst.attach(hostEl, opts);
  return inst;
}

export function refresh() { if (inst) inst.refresh(); }

// NEXORA #048 : ouvrir une vue précise depuis la vue d'ensemble de l'espace Sécurité.
export function goTo(tab, opts = {}) {
  if (inst) { inst.tab = tab; if (opts.siteId) inst.siteId = opts.siteId; inst.savePref(); return; }
  try { sessionStorage.setItem(PREF_KEY, JSON.stringify({ tab, siteId: opts.siteId || null, range: '24h' })); } catch { /* */ }
}

export { $ };
