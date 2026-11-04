// NEXORA #015 : vue d'ensemble de la supervision (indicateurs clés, temps de réponse de tous les sites,
// échecs, bandeaux de disponibilité, incidents récents, certificats).
import { call, esc, icon, num, pct, ms, dur, ago, dateTime, host, PALETTE, KIND, stateChip, chip } from './util.js';
import { Chart, statusBars, tipTime } from './charts.js';
import { kpi, card, btn } from './ui.js';
import { links } from './cloud.js';

export function emptyState(ctx) {
  const cur = ctx.siteUrl();
  return `<div class="sup-empty sup-hero">
    <div class="sup-hero-ic">${icon('sync', 30)}</div>
    <b>Surveille tes sites en continu</b>
    <p>Disponibilité, temps de réponse détaillé (DNS, connexion, TLS, serveur, transfert), certificat et erreurs de page, avec des incidents suivis et des alertes par Telegram, e-mail ou WhatsApp.</p>
    <div class="sup-hero-act">${cur ? btn('Surveiller le site ouvert', 'data-sup-add="current"', { ic: 'plus', cls: 'primary' }) : ''}${btn('Ajouter un site', 'data-sup-add="new"', { ic: 'plus', cls: cur ? '' : 'primary' })}</div>
    <div class="sec-chips"><span>Vérification toutes les 30 s à 30 min</span><span>Pannes confirmées, sans fausse alerte</span><span>31 jours de détail, 13 mois d’historique</span></div>
  </div>`;
}

export function barTip(b, step) {
  if (!b.n) return `${tipTime(b.t, step)} · aucune mesure (NEXORA fermée ou site en pause)`;
  const parts = [`${tipTime(b.t, step)}`, `disponibilité ${pct(b.avail)}`];
  if (b.p95 != null) parts.push(`p95 ${ms(b.p95)}`);
  if (b.fails) parts.push(`${b.fails} échec(s)`);
  if (b.slow) parts.push(`${b.slow} lente(s)`);
  return parts.join(' · ');
}

export const availTone = (v) => (v == null ? '' : v >= 99.9 ? 'good' : v >= 99 ? 'warn' : 'bad');

export async function renderOverview(ctx) {
  const d = await call('mon:overview', { range: ctx.range, bars: 60 });
  ctx.state.overview = d;
  if (!d.sites.length) return emptyState(ctx);
  const t = d.totals;
  const inc = t.incidents || {};
  const open = d.sites.reduce((a, s) => a + s.open.length, 0);
  const certs = d.sites.filter((s) => s.cert && s.cert.days != null).sort((a, b) => a.cert.days - b.cert.days);
  const minCert = certs[0];
  const kpis = [
    kpi({ label: 'Disponibilité', ic: 'pass', value: pct(t.avail), tone: availTone(t.avail), hint: `${num(t.checks)} vérifications · ${num(t.fails)} échec${t.fails > 1 ? 's' : ''}`, tip: 'Part du temps surveillé pendant laquelle les sites répondaient correctement, tous sites confondus.' }),
    kpi({ label: 'Sites en ligne', ic: 'globe', value: `${t.up + t.slow}<small>/${t.active}</small>`, tone: t.down ? 'bad' : t.slow ? 'warn' : 'good', hint: [t.down ? `<span class="bad">${t.down} en panne</span>` : '', t.slow ? `<span class="warn">${t.slow} lent${t.slow > 1 ? 's' : ''}</span>` : '', t.paused ? `${t.paused} en pause` : ''].filter(Boolean).join(' · ') || 'Tous répondent normalement' }),
    kpi({ label: 'Incidents en cours', ic: 'warn', value: num(open), tone: open ? 'bad' : 'good', hint: `${num(inc.count || 0)} sur la période · ${dur(inc.downtime || 0, { short: true })} d’indisponibilité` }),
    kpi({ label: 'Temps de réponse p95', ic: 'clock', value: ms(t.p95), hint: 'Médiane des sites', tip: '95 % des réponses sont plus rapides que cette valeur (médiane des p95 de tous les sites).' }),
    kpi({ label: 'Rétablissement moyen', ic: 'restart', value: inc.mttr != null ? dur(inc.mttr, { short: true }) : '—', hint: inc.mtbf != null ? `Entre deux pannes : ${dur(inc.mtbf, { short: true })}` : 'Aucune panne sur la période', tip: 'MTTR : durée moyenne d’une panne, de sa détection au retour en ligne. MTBF : temps moyen surveillé entre deux pannes.' }),
    kpi({ label: 'Certificats', ic: 'lock', value: minCert ? `${num(minCert.cert.days)} j` : '—', tone: minCert && minCert.cert.days <= (d.settings ? d.settings.certDays : 14) ? 'warn' : minCert ? 'good' : '', hint: minCert ? `avant le renouvellement de ${esc(minCert.name || host(minCert.url))}` : 'Aucun site en https' }),
  ].join('');
  const rows = d.sites.map((s) => `<tr data-sup-open="${esc(s.id)}" class="click">
      <td class="sup-site-cell"><span class="sup-dot ${s.state}"></span><div><b>${esc(s.name || host(s.url))}</b><small>${esc(host(s.url))}</small></div></td>
      <td>${stateChip(s.state, s.pending)}</td>
      <td class="sup-bars-cell">${statusBars(s.bars, (b) => barTip(b, d.step))}</td>
      <td class="num ${availTone(s.avail)}">${pct(s.avail)}</td>
      <td class="num">${ms(s.p95)}</td>
      <td class="num muted">${s.last ? ago(s.last.at, d.now) : '—'}</td>
    </tr>`).join('');
  const incList = d.incidents.length ? `<div class="sup-list">${d.incidents.slice(0, 8).map((i) => incidentRow(i, d.now)).join('')}</div>` : `<p class="sup-none">${icon('pass', 14)} Aucun incident sur la période.</p>`;
  const certList = certs.length ? `<div class="sup-certs">${certs.map((s) => { const days = s.cert.days; const w = Math.max(3, Math.min(100, (days / 90) * 100)); const tone = days <= 7 ? 'bad' : days <= (d.settings ? d.settings.certDays : 14) ? 'warn' : 'good'; return `<div class="sup-cert" data-sup-open="${esc(s.id)}"><span>${esc(s.name || host(s.url))}</span><div class="sup-gauge ${tone}"><i style="width:${w}%"></i></div><b class="${tone}">${num(days)} j</b></div>`; }).join('')}</div>` : '<p class="sup-none">Aucun certificat relevé.</p>';
  const token = ctx.token;
  ctx.afterRender = () => {
    mountCharts(ctx, d);
    // Badge des sites aussi surveillés par les serveurs NEXORA (NEXORA #022).
    links().then(({ map }) => {
      if (token !== ctx.token) return;
      for (const id of map.keys()) {
        const cell = ctx.view.querySelector(`tr[data-sup-open="${CSS.escape(id)}"] .sup-site-cell b`);
        if (cell && !cell.querySelector('.sup-chip')) cell.insertAdjacentHTML('beforeend', ` <span class="sup-chip info" data-tip="Aussi vérifié 24 h/24 par les serveurs NEXORA">24 h/24</span>`);
      }
    }).catch(() => {});
  };
  return `<div class="sup-kpis">${kpis}</div>
    <div class="sup-grid g-2-1">
      ${card('Temps de réponse par site', '<div data-chart="lat"></div>', { sub: 'p95 par tranche de temps' })}
      ${card('Échecs et lenteurs', '<div data-chart="fails"></div>', { sub: 'Vérifications en échec ou au-dessus du seuil' })}
    </div>
    ${card('État des sites', `<div class="sup-table-wrap"><table class="sup-table"><thead><tr><th>Site</th><th>État</th><th>Disponibilité sur la période</th><th class="num">Dispo.</th><th class="num">p95</th><th class="num">Vérifié</th></tr></thead><tbody>${rows}</tbody></table></div>`, { actions: btn('Ajouter un site', 'data-sup-add="new"', { ic: 'plus' }), sub: `${d.sites.length} site${d.sites.length > 1 ? 's' : ''} · couverture ${t.coverage != null ? `${num(t.coverage, 1)} %` : '—'} de la période` })}
    <div class="sup-grid g-2-1">
      ${card('Incidents récents', incList, { actions: btn('Tous les incidents', 'data-sup-tab="incidents"', { ic: 'chevronRight' }) })}
      ${card('Certificats', certList, { sub: 'Jours avant expiration' })}
    </div>`;
}

export function incidentRow(i, now) {
  const k = KIND[i.kind] || KIND.down;
  const length = (i.end || now) - i.start;
  return `<div class="sup-inc ${i.end == null ? 'open' : ''}" data-sup-open="${esc(i.siteId)}">
    <span class="sup-inc-ic ${k.tone}">${icon(k.icon, 14)}</span>
    <div class="grow"><b>${esc(i.siteName)}</b><small>${esc(k.label)} · ${esc(i.lastCause || i.cause || '')}</small></div>
    <div class="sup-inc-meta">${i.end == null ? chip(`En cours · ${dur(length, { short: true })}`, 'bad') : chip(dur(length, { short: true }), '')}<small>${esc(dateTime(i.start))}</small></div>
  </div>`;
}

function mountCharts(ctx, d) {
  const el = ctx.view.querySelector('[data-chart="lat"]');
  if (el) {
    ctx.charts.push(new Chart(el, {
      height: 230, from: d.from, to: d.to, step: d.step, yFmt: ms, label: 'Temps de réponse par site',
      series: d.sites.map((s, i) => ({ id: s.id, name: s.name || host(s.url), color: PALETTE[i % PALETTE.length], points: s.bars.map((b) => ({ t: b.t, v: b.p95 })) })).filter((s) => s.points.some((p) => p.v != null)),
    }));
  }
  const ef = ctx.view.querySelector('[data-chart="fails"]');
  if (ef) {
    const n = d.sites[0] ? d.sites[0].bars.length : 0;
    const sum = (k) => Array.from({ length: n }, (_, i) => ({ t: d.sites[0].bars[i].t, v: d.sites.reduce((a, s) => a + ((s.bars[i] || {})[k] || 0), 0) }));
    const fails = sum('fails'); const slow = sum('slow');
    const any = fails.some((p) => p.v) || slow.some((p) => p.v);
    ctx.charts.push(new Chart(ef, {
      height: 230, from: d.from, to: d.to, step: d.step, yFmt: (v) => num(v), label: 'Échecs et lenteurs',
      empty: 'Aucun échec ni lenteur sur la période.',
      series: any ? [
        { id: 'fails', name: 'Échecs', color: 'var(--bad-dot)', type: 'bar', stack: true, points: fails },
        { id: 'slow', name: 'Lentes', color: 'var(--warn-dot)', type: 'bar', stack: true, points: slow },
      ] : [],
    }));
  }
}
