// NEXORA #015 : santé de NEXORA elle-même (processus, mémoire, erreurs, plantages, sessions) et des
// services en ligne dont elle dépend (comptes, base de données, stockage, temps réel, fonctions).
import { call, esc, icon, num, pct, ms, dur, ago, dateTime, toast } from './util.js';
import { Chart, spark } from './charts.js';
import { kpi, card, btn } from './ui.js';

const GROUP_COLOR = { main: '#5856d6', window: '#007aff', webview: '#30b0c7', gpu: '#ff9500', other: '#a2845e' };
const EVENT = {
  error: ['Erreur de l’interface', 'warn', 'bad'], crash: ['Plantage', 'error', 'bad'], freeze: ['Interface figée', 'clock', 'warn'],
  'freeze-ok': ['Interface rétablie', 'pass', 'good'], service: ['Service injoignable', 'cloud', 'bad'], 'service-ok': ['Service rétabli', 'cloud', 'good'],
};

export async function renderPlatform(ctx) {
  let s;
  try { s = await call('tel:snapshot'); } catch (err) { s = null; ctx.state.telErr = err.message; }
  if (!s) return `<div class="sup-empty">${icon('laptop', 30)}<b>Santé de NEXORA</b><p>${esc(ctx.state.telErr || 'Mesures indisponibles.')}</p></div>`;
  const cur = s.current || {};
  const c = s.counters || {};
  const desktop = Boolean(s.samples && s.samples.length);
  const services = s.services || [];
  const svcDown = services.filter((x) => x.last && !x.last.ok).length;
  const kpis = [
    kpi({ label: 'NEXORA', ic: 'info', value: esc(s.app.version || '—'), hint: s.app.electron ? 'Application de bureau' : esc(s.app.os || '') }),
    kpi({ label: 'Session en cours', ic: 'clock', value: dur(s.app.uptime, { short: true }), hint: c.avgSession ? `Durée moyenne : ${dur(c.avgSession, { short: true })}` : `${num(c.sessions7d || 1)} session(s) sur 7 jours` }),
    kpi({ label: 'Processeur', ic: 'bolt', value: desktop ? `${num(cur.cpu, 1)} %` : '—', tone: cur.cpu > 80 ? 'warn' : '', hint: desktop ? `PC entier : ${cur.sysCpu != null ? `${num(cur.sysCpu, 0)} %` : '—'}` : 'Mesuré dans l’application Windows' }),
    kpi({ label: 'Mémoire', ic: 'layers', value: desktop ? `${num(cur.mem)} Mo` : '—', hint: desktop ? `${num(cur.procs)} processus · PC : ${num(cur.sysMem / 1024, 1)} / ${num(s.app.totalMem / 1024, 1)} Go` : '' }),
    kpi({ label: 'Erreurs (24 h)', ic: 'warn', value: num(c.errors24h || 0), tone: c.errors24h ? 'warn' : 'good', hint: 'Erreurs JavaScript de l’interface' }),
    kpi({ label: 'Plantages (7 j)', ic: 'error', value: num(c.crashes7d || 0), tone: c.crashes7d ? 'bad' : 'good', hint: svcDown ? `<span class="bad">${svcDown} service(s) injoignable(s)</span>` : 'Services en ligne disponibles' }),
  ].join('');
  const svcRows = services.length ? services.map((v) => {
    const ok = v.last ? v.last.ok : null;
    return `<div class="sup-svc">
      <span class="sup-dot ${ok == null ? 'unknown' : ok ? 'up' : 'down'}"></span>
      <div class="sup-svc-t"><b>${esc(v.label)}</b><small>${v.last ? (ok ? `Répond en ${ms(v.last.ms)}` : esc(v.last.error || 'injoignable')) : 'Pas encore vérifié'}${v.last ? ` · ${esc(ago(v.last.t))}` : ''}</small></div>
      ${spark(v.series.map((r) => (r.ok ? r.ms : -1)), { w: 160, h: 26 })}
      <div class="sup-svc-v"><b>${pct(v.avail)}</b><small>p95 ${ms(v.p95)}</small></div>
    </div>`;
  }).join('') : '<p class="sup-none">Les services de NEXORA seront vérifiés dès la prochaine minute.</p>';
  const ev = (s.events || []).slice(0, 40).map((e) => {
    const [label, ic, tone] = EVENT[e.kind] || ['Évènement', 'info', ''];
    return `<div class="sup-ev"><span class="sup-inc-ic ${tone}">${icon(ic, 13)}</span><div class="grow"><b>${esc(e.message)}</b><small>${esc(label)}${e.source ? ` · ${esc(e.source)}` : ''}${e.count > 1 ? ` · ${num(e.count)} fois` : ''}</small></div><small class="muted nowrap">${esc(ago(e.last || e.at, s.now))}</small></div>`;
  }).join('');
  const sessions = (s.sessions || []).slice(0, 8).map((x, i) => `<tr><td class="nowrap">${esc(dateTime(x.start))}</td><td class="num">${i === 0 && !x.end ? `<span class="sup-chip good">En cours</span>` : dur((x.end || x.lastSeen || x.start) - x.start, { short: true })}</td><td>${esc(x.version || '')}</td><td class="num">${num(x.errors || 0)}</td><td>${x.unexpected ? '<span class="sup-chip bad" data-tip="NEXORA s’est fermée sans passer par la fermeture normale (plantage ou coupure).">Fermeture brutale</span>' : x.crashes ? `<span class="sup-chip warn">${num(x.crashes)} plantage(s)</span>` : '<span class="muted">—</span>'}</td></tr>`).join('');
  const sys = [
    ['Système', s.app.os], ['Processeur', `${s.app.cpuModel || '—'}${s.app.cpus ? ` · ${s.app.cpus} cœurs` : ''}`], ['Mémoire', s.app.totalMem ? `${num(s.app.totalMem / 1024, 1)} Go` : '—'],
    ['Moteur d’interface', s.app.electron ? 'Prêt' : '—'], ['Affichage', s.app.chrome ? 'Prêt' : '—'], ['Environnement système', s.app.node ? 'Prêt' : '—'], ['Démarrée', dateTime(s.app.startedAt)],
  ].map(([k, v]) => `<span>${esc(k)}</span><b>${esc(v)}</b>`).join('');
  ctx.afterRender = () => { mountCharts(ctx, s); bind(ctx); };
  const note = desktop ? '' : '<p class="sup-note">Les mesures du processeur et de la mémoire de chaque processus sont relevées par l’application NEXORA pour Windows.</p>';
  return `<div class="sup-kpis k6">${kpis}</div>
    <div class="sup-grid g-1-1">
      ${card('Processeur de NEXORA', `${note}<div data-chart="cpu"></div>`, { sub: 'Par processus, dernière heure (relevé toutes les 10 s)' })}
      ${card('Mémoire de NEXORA', `${note}<div data-chart="mem"></div>`, { sub: 'Mémoire utilisée par processus, dernière heure' })}
    </div>
    <div class="sup-grid g-2-1">
      ${card('Services en ligne de NEXORA', `<div class="sup-svcs">${svcRows}</div><div data-chart="svc"></div>`, { sub: 'Comptes, synchronisation et fichiers · vérifiés toutes les minutes, disponibilité sur 24 h', actions: btn('Vérifier', 'data-tel="check"', { ic: 'sync' }) })}
      ${card('Ce PC', `<div class="sup-kv">${sys}</div>`)}
    </div>
    <div class="sup-grid g-2-1">
      ${card('Journal de NEXORA', ev ? `<div class="sup-list sup-evs">${ev}</div>` : `<p class="sup-none">${icon('pass', 14)} Aucune erreur ni plantage enregistré.</p>`, { sub: 'Erreurs de l’interface, plantages et coupures de service, gardés sur ce PC', actions: ev ? btn('Effacer', 'data-tel="clear"', { ic: 'trash' }) : '' })}
      ${card('Sessions', `<div class="sup-table-wrap"><table class="sup-table dense"><thead><tr><th>Début</th><th class="num">Durée</th><th>Version</th><th class="num">Erreurs</th><th></th></tr></thead><tbody>${sessions}</tbody></table></div>`, { sub: 'Dernières ouvertures de NEXORA' })}
    </div>
    <p class="sup-foot">${icon('lock', 12)} Ces mesures restent sur ce PC : NEXORA ne les envoie nulle part.</p>`;
}

function mountCharts(ctx, s) {
  const samples = s.samples || [];
  const groups = Object.keys(s.groups || {});
  const stack = (k) => groups.map((g) => ({ id: g, name: s.groups[g], color: GROUP_COLOR[g] || '#8e8e93', type: 'stack', points: samples.map((x) => ({ t: x.t, v: x.groups && x.groups[g] ? x.groups[g][k] : null })) })).filter((ser) => ser.points.some((p) => p.v));
  const from = samples.length ? samples[0].t : s.now - 3600e3;
  const el = ctx.view.querySelector('[data-chart="cpu"]');
  if (el) ctx.charts.push(new Chart(el, { height: 200, from, to: s.now, yFmt: (v) => `${num(v)} %`, label: 'Processeur de NEXORA', empty: 'Mesures disponibles dans l’application Windows.', series: samples.length ? [...stack('cpu'), { id: 'sys', name: 'PC entier', color: 'var(--text-3)', dash: '3 3', points: samples.map((x) => ({ t: x.t, v: x.sysCpu })) }] : [] }));
  const em = ctx.view.querySelector('[data-chart="mem"]');
  if (em) ctx.charts.push(new Chart(em, { height: 200, from, to: s.now, yFmt: (v) => `${num(v)} Mo`, label: 'Mémoire de NEXORA', empty: 'Mesures disponibles dans l’application Windows.', series: samples.length ? stack('mem') : [] }));
  const es = ctx.view.querySelector('[data-chart="svc"]');
  const svc = (s.services || []).filter((v) => v.series && v.series.length);
  if (es && svc.length) {
    const colors = ['#007aff', '#34c759', '#ff9500', '#af52de', '#30b0c7'];
    ctx.charts.push(new Chart(es, { height: 170, yFmt: ms, label: 'Temps de réponse des services', series: svc.map((v, i) => ({ id: v.id, name: v.label, color: colors[i % colors.length], points: v.series.map((r) => ({ t: r.t, v: r.ok ? r.ms : null })) })) }));
  }
}

function bind(ctx) {
  for (const b of ctx.view.querySelectorAll('[data-tel]')) b.onclick = async () => {
    b.disabled = true;
    try {
      if (b.dataset.tel === 'check') { await call('tel:check-services'); toast('Services de NEXORA vérifiés.'); }
      if (b.dataset.tel === 'clear') { await call('tel:clear-events'); toast('Journal effacé.'); }
      ctx.show(true);
    } catch (err) { toast(err.message || String(err), { kind: 'bad' }); } finally { b.disabled = false; }
  };
}
