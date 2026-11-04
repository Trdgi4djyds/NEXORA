// NEXORA #018 : section « Statistiques et plantages » de l'App Builder. L'application construite envoie ses
// ouvertures et ses plantages au compte NEXORA du propriétaire (fonction app_track de la base de NEXORA,
// migration supabase/migrations/20261104000001_statistiques_applications.sql) ; le tableau de bord les lit ici.
import { esc, toast, busy, $ } from '../core.js';
import { b as icon } from '../../dist/chunks/chunk-S4I2LXHS.js';
import { b as supabase, e as cloud } from '../../dist/chunks/chunk-EZKHFSAB.js';

export const SECTION = ['insights', 'Statistiques et plantages', 'timeline', 'Installations, versions, erreurs'];
const ID_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const fmtN = (n) => Number(n || 0).toLocaleString('fr-FR');
const ago = (d) => {
  if (!d) return '—';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 90) return 'à l’instant';
  if (s < 5400) return `il y a ${Math.round(s / 60)} min`;
  if (s < 129600) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
};

/* Message clair quand la base n'a pas encore la migration, ou que la connexion manque. */
export function explain(err) {
  const m = String((err && (err.message || err.details)) || err || '');
  if (/PGRST202|Could not find the function|function .* does not exist|schema cache/i.test(m)) return 'Les statistiques des applications ne sont pas encore disponibles. Réessaie plus tard.';
  if (/JWT|Connexion requise|not authenticated|permission denied/i.test(m)) return 'Connecte-toi à ton compte NEXORA pour voir les statistiques.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Connexion à NEXORA impossible : vérifie ta connexion Internet.';
  return m || 'Erreur inconnue.';
}

function chart(daily) {
  const W = 640; const H = 150; const pad = 22;
  const n = daily.length || 1;
  const max = Math.max(1, ...daily.map((d) => d.installs));
  const bw = (W - pad * 2) / n;
  const y = (v) => H - pad - (v / max) * (H - pad * 2);
  const day = (d) => esc(new Date(d.day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }));
  const bars = daily.map((d, i) => `<rect x="${(pad + i * bw + bw * 0.18).toFixed(1)}" y="${y(d.installs).toFixed(1)}" width="${Math.max(1, bw * 0.64).toFixed(1)}" height="${(H - pad - y(d.installs)).toFixed(1)}" rx="2" class="nxi-bar"><title>${day(d)} : ${d.installs} installation(s) active(s), ${d.launches} ouverture(s), ${d.crashes} plantage(s)</title></rect>${d.crashes ? `<circle cx="${(pad + i * bw + bw / 2).toFixed(1)}" cy="${(pad - 8).toFixed(1)}" r="${Math.min(6, 2.5 + d.crashes)}" class="nxi-crash"><title>${d.crashes} plantage(s)</title></circle>` : ''}`).join('');
  return `<svg class="nxi-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Installations actives par jour">
    <line x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}" class="nxi-axis"/>
    ${bars}
    ${daily.length ? `<text x="${pad}" y="${H - 6}" class="nxi-lbl">${day(daily[0])}</text><text x="${W - pad}" y="${H - 6}" class="nxi-lbl" text-anchor="end">${day(daily[daily.length - 1])}</text>` : ''}
  </svg>`;
}

function table(title, rows, cols) {
  if (!rows || !rows.length) return '';
  const max = Math.max(1, ...rows.map((r) => r.installs || 0));
  return `<div class="nxi-tbl"><b class="nxa-sub">${title}</b>${rows.map((r) => `<div class="nxi-row"><span class="nxi-name" title="${esc(r[cols[0]])}">${esc(r[cols[0]])}</span><span class="nxi-meter"><i style="width:${Math.round(((r.installs || 0) / max) * 100)}%"></i></span><span class="nxi-num">${fmtN(r.installs)}</span>${cols[1] ? `<span class="nxi-num${r[cols[1]] ? ' bad' : ''}" title="Plantages">${r[cols[1]] ? `${fmtN(r[cols[1]])} ✕` : '0'}</span>` : ''}</div>`).join('')}</div>`;
}

export function install(proto, SECTIONS) {
  const at = SECTIONS.findIndex((s) => s[0] === 'store');
  if (!SECTIONS.some((s) => s[0] === SECTION[0])) SECTIONS.splice(at < 0 ? SECTIONS.length : at + 1, 0, SECTION);

  const ins = (cfg) => cfg.insights || (cfg.insights = { enabled: false, launches: true, days: 30 });

  proto.nxInsightsBind = function nxInsightsBind() {
    if (this.nxInsBound) return;
    this.nxInsBound = true;
    cloud.on('auth', () => { this.nxIns = null; if (this.section === 'insights') this.renderForm(); });
  };

  proto.nxInsightsLoad = function nxInsightsLoad(force = false) {
    const i = ins(this.cfg);
    const k = `${i.app}|${i.days}`;
    if (!i.app || (!force && this.nxIns && this.nxIns.k === k) || this.nxInsLoading === k) return;
    this.nxInsLoading = k;
    supabase.rpc('app_insights_summary', { p_app: i.app, p_days: Number(i.days) || 30 }).then(({ data, error }) => {
      this.nxIns = { k, data: error ? null : data, error: error ? explain(error) : null, at: Date.now() };
    }, (e) => { this.nxIns = { k, data: null, error: explain(e), at: Date.now() }; }).then(() => {
      this.nxInsLoading = null;
      if (this.section === 'insights') this.renderForm();
    });
  };

  proto.form_insights = function formInsights(cfg) {
    this.nxInsightsBind();
    const i = ins(cfg);
    const user = cloud.user;
    const idOk = ID_RE.test(cfg.appId || '');
    const stale = i.enabled && i.appId && i.appId !== cfg.appId;
    const twa = cfg.engine === 'twa' && cfg.source.kind === 'url';
    let h = this.card('Statistiques de l’application', `
      <p class="ab-hint">À chaque ouverture et à chaque plantage, l’application envoie à ton compte NEXORA : un identifiant d’installation tiré au hasard (aucun identifiant du téléphone), le modèle, la version d’Android et de l’application, la langue et, pour un plantage, la trace de l’erreur. Les données sont gardées 180 jours et visibles par toi seul.</p>
      ${user ? '' : `<div class="ab-note">${icon('user', 15)}<span>Connecte-toi à ton compte NEXORA : les statistiques y sont rangées.</span><button class="btn small primary" data-act="insights-login">${icon('user', 13)}<span>Se connecter</span></button></div>`}
      ${twa ? `<div class="ab-note">${icon('info', 15)}<span>En mode Trusted Web Activity, c’est Chrome qui affiche le site : seules les ouvertures de la WebView de repli seraient comptées. Choisis le moteur NEX-WEBVIEW (section Source) pour des statistiques complètes.</span></div>` : ''}
      ${this.tog('Envoyer les statistiques et les plantages', 'insights.enabled', 'Pris en compte à la prochaine construction de l’application.')}
      ${i.enabled ? this.tog('Compter les ouvertures', 'insights.launches', 'Sinon, seuls les plantages et les erreurs sont envoyés.') : ''}
      ${i.enabled && !i.key ? `<div class="ab-row"><button class="btn small primary" data-act="insights-register" ${user && idOk ? '' : 'disabled'}>${icon('cloud', 13)}<span>Inscrire l’application sur mon compte</span></button>${idOk ? '' : '<span class="ab-hint">Indique d’abord un identifiant valide (section Identité).</span>'}</div>` : ''}
      ${stale ? `<div class="ab-note">${icon('warn', 15)}<span>L’identifiant a changé (${esc(i.appId)} → ${esc(cfg.appId)}) : inscris à nouveau l’application.</span><button class="btn small" data-act="insights-register">${icon('sync', 13)}<span>Inscrire</span></button></div>` : ''}
      ${i.enabled && i.key && !stale ? `<p class="ab-hint nxi-ok">${icon('pass', 13)}<span>Application inscrite. Les premières données arrivent après la construction et l’installation de l’application.</span></p>` : ''}
      ${i.err ? `<p class="ab-hint bad">${esc(i.err)}</p>` : ''}`);
    if (!i.app || !user) return h;
    const st = this.nxIns && this.nxIns.k === `${i.app}|${i.days}` ? this.nxIns : null;
    if (!st) this.nxInsightsLoad();
    const d = st && st.data;
    const head = `<div class="ab-row nxi-head">${this.segK('insights.days', { 7: '7 jours', 30: '30 jours', 90: '90 jours' })}<button class="icon-btn small" data-act="insights-refresh" title="Actualiser">${icon('refreshCw', 14)}</button>${st ? `<small class="ab-hint">Mis à jour ${ago(st.at)}</small>` : ''}</div>`;
    if (!st) return h + this.card('Tableau de bord', `${head}<p class="ab-hint"><span class="spinner small"></span> Lecture des statistiques…</p>`);
    if (st.error) return h + this.card('Tableau de bord', `${head}<p class="ab-hint bad">${esc(st.error)}</p>`);
    const t = d.totals || {};
    const free = t.installs ? Math.max(0, 100 - (100 * (t.crashInstalls || 0)) / t.installs) : null;
    const kpi = (label, v, sub, cls = '') => `<div class="nxi-kpi ${cls}"><small>${label}</small><b>${v}</b><span>${sub}</span></div>`;
    h += this.card('Tableau de bord', `${head}
      <div class="nxi-kpis">
        ${kpi('Installations actives', fmtN(t.installs), `sur ${d.days} jours`)}
        ${kpi('Ouvertures', fmtN(t.launches), t.installs ? `${(t.launches / t.installs).toFixed(1).replace('.', ',')} par installation` : '—')}
        ${kpi('Plantages', fmtN(t.crashes), `${fmtN(t.errors)} autre(s) erreur(s)`, t.crashes ? 'bad' : '')}
        ${kpi('Sans plantage', free == null ? '—' : `${free.toFixed(1).replace('.', ',')} %`, 'des installations', free != null && free < 99 ? 'warn' : '')}
      </div>
      ${t.installs ? chart(d.daily || []) : `<p class="ab-hint">Aucune donnée sur cette période. ${t.last ? '' : 'Construis l’application avec l’option ci-dessus, installe-la et ouvre-la : la première ouverture apparaît ici.'}</p>`}
      ${t.last ? `<p class="ab-hint">Dernier événement reçu ${ago(t.last)}.</p>` : ''}`);
    if (t.installs) {
      h += this.card('Répartition', `<div class="nxi-tbls">${table('Versions de l’application', d.versions, ['version', 'crashes'])}${table('Appareils', d.models, ['model'])}${table('Versions d’Android', d.os, ['os'])}</div>`);
    }
    const crashes = d.crashes || [];
    h += this.card('Plantages et erreurs', crashes.length ? `<div class="nxi-crashes">${crashes.map((c, n) => `<details class="nxi-crashitem"${n === 0 ? ' open' : ''}>
        <summary><span class="nxi-kind ${c.kind}">${c.kind === 'crash' ? 'Plantage' : 'Erreur'}</span><code>${esc(c.signature || (c.detail && c.detail.message) || '—')}</code><span class="nxi-meta">${fmtN(c.count)} fois · ${fmtN(c.installs)} installation(s) · ${ago(c.last)}</span></summary>
        <p class="ab-hint">${c.detail && c.detail.message ? `${esc(c.detail.message)} · ` : ''}version ${esc(c.version || '?')}${c.model ? ` · ${esc(c.model)}` : ''}</p>
        ${c.detail && c.detail.stack ? `<pre class="nxi-stack">${esc(c.detail.stack)}</pre>` : ''}
        <div class="ab-row">${c.detail && c.detail.stack ? `<button class="btn small" data-copy="${esc(c.detail.stack)}">${icon('copy', 13)}<span>Copier la trace</span></button>` : ''}<button class="btn small" data-act="insights-ai" data-i="${n}">${icon('sparkle', 13)}<span>Expliquer avec l’IA</span></button></div>
        <div class="ab-ai-out" data-nxi-ai="${n}" hidden></div>
      </details>`).join('')}</div>` : `<p class="ab-hint nxi-ok">${icon('pass', 13)}<span>Aucun plantage ni erreur sur cette période.</span></p>`);
    return h;
  };

  proto.act_insights_login = async function act() {
    const ui = await import('../../dist/chunks/ui-AVQ7QKWX.js');
    ui.openAuthSheet();
  };
  proto.act_insights_refresh = async function act() { this.nxIns = null; this.nxInsightsLoad(true); this.renderForm(); };
  proto.act_insights_register = async function act() {
    const cfg = this.cfg; const i = ins(cfg);
    if (!cloud.user) { await this.act_insights_login(); return; }
    if (!ID_RE.test(cfg.appId || '')) throw new Error('Indique d’abord un identifiant d’application valide (section Identité).');
    const n = busy('Inscription de l’application…');
    try {
      const { data, error } = await supabase.rpc('app_insights_register', { p_app_id: cfg.appId, p_name: cfg.appName || '' });
      if (error) { i.err = explain(error); this.save(); this.renderForm(); return; }
      const row = Array.isArray(data) ? data[0] : data;
      Object.assign(i, { app: row.id, key: row.ingest_key, appId: cfg.appId, err: null });
      this.save();
      this.nxIns = null;
      this.renderForm();
      toast('Application inscrite : construis-la pour qu’elle envoie ses statistiques.');
    } finally { n.close(); }
  };
  proto.act_insights_ai = async function act(btn) {
    const st = this.nxIns && this.nxIns.data;
    const c = st && st.crashes && st.crashes[Number(btn.dataset.i)];
    if (!c) return;
    const ai = await import('../../dist/chunks/ai-RLNIHTXY.js');
    const { renderMd } = await import('../../dist/chunks/md-PEY42J2W.js');
    if (!await ai.aiReady()) { toast('Configure d’abord une IA (bouton IA en haut à droite).'); ai.openAiSettings(); return; }
    const out = $(`[data-nxi-ai="${btn.dataset.i}"]`, this.el);
    out.hidden = false;
    out.innerHTML = '<div class="ab-ai-load"><span class="spinner small"></span> L’IA lit la trace…</div>';
    let txt = '';
    try {
      await ai.aiChat({
        system: 'Tu aides le propriétaire d’une application Android construite par NEXORA (une WebView qui affiche son site, code natif fourni par NEXORA). On te donne un plantage regroupé. Explique simplement la cause probable, dis si elle vient du site (JavaScript, page trop lourde), du téléphone (mémoire, WebView ancienne) ou du code natif, et donne les actions concrètes. Réponds en français, brièvement, avec des listes.',
        messages: [{ role: 'user', content: `Application : ${this.cfg.appName} (${this.cfg.appId})\nType : ${c.kind}\nEmpreinte : ${c.signature}\nOccurrences : ${c.count} sur ${c.installs} installation(s)\nVersion : ${c.version} · Appareil : ${c.model || '?'}\nMessage : ${c.detail && c.detail.message}\nTrace :\n${(c.detail && c.detail.stack || '').slice(0, 5000)}` }],
        onChunk: (p) => { txt += p; out.innerHTML = `<div class="ab-ai-md">${renderMd(txt)}</div>`; },
      });
    } catch (e) { out.innerHTML = `<p class="ab-hint bad">${esc(e.message || String(e))}</p>`; }
  };

  // Construction : réglages ajoutés à la configuration de l'application ; vérification avant de construire.
  const spec0 = proto.spec;
  proto.spec = async function spec() {
    const s = await spec0.call(this);
    const i = this.cfg.insights;
    if (i && i.enabled && i.key && i.appId === this.cfg.appId) {
      s.insights = { url: supabase.supabaseUrl, anon: supabase.supabaseKey, key: i.key, launches: i.launches !== false };
    }
    return s;
  };
  const validate0 = proto.validate;
  proto.validate = function validate() {
    const out = validate0.call(this) || [];
    const i = this.cfg.insights;
    if (i && i.enabled && (!i.key || i.appId !== this.cfg.appId)) out.push(['insights', 'Statistiques : inscris l’application sur ton compte NEXORA (section Statistiques et plantages), ou décoche l’option.']);
    return out;
  };
}
