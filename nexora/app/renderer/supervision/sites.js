// NEXORA #015 : fiche détaillée d'un site surveillé (percentiles, détail du temps de réponse,
// disponibilité, codes HTTP, incidents, dernières vérifications, erreurs de page) et actions.
import { call, esc, icon, num, pct, ms, bytes, dur, ago, time, dateTime, host, PHASE, KIND, stateChip, chip, toast, popover, closePopover, csv, sheet, RANGE_MS } from './util.js';
import { Chart, statusBars, spark } from './charts.js';
import { kpi, card, btn, iconBtn, confirmSheet } from './ui.js';
import { emptyState, barTip, availTone, incidentRow } from './overview.js';
import { account, links, link, unlink, series as serverSeries } from './cloud.js';

export async function renderSites(ctx) {
  const ov = await call('mon:overview', { range: ctx.range, bars: 40 });
  ctx.state.overview = ov;
  if (!ov.sites.length) return emptyState(ctx);
  if (!ov.sites.some((s) => s.id === ctx.siteId)) ctx.siteId = (ov.sites.find((s) => s.state === 'down') || ov.sites[0]).id;
  const d = await call('mon:series', { id: ctx.siteId, range: ctx.range, points: 120 });
  const s = d.site;
  const list = ov.sites.map((x) => `<button type="button" class="sup-sitebtn ${x.id === ctx.siteId ? 'on' : ''}" data-site="${esc(x.id)}" aria-label="${esc(x.name || host(x.url))}">
      <span class="sup-dot ${x.state}"></span>
      <span class="sup-sitebtn-t"><b>${esc(x.name || host(x.url))}</b><small>${esc(host(x.url))}</small></span>
      <span class="sup-sitebtn-v"><b class="${availTone(x.avail)}">${pct(x.avail)}</b><small>${ms(x.p95)}</small></span>
      ${spark(x.bars.map((b) => (b.n ? (b.fails && b.avail < 50 ? -1 : b.p95) : null)), { w: 210, h: 22 })}
    </button>`).join('');
  const st = s.state;
  const since = s.since ? `${st === 'down' ? 'depuis' : 'depuis'} ${dur(d.to - s.since, { short: true })}` : '';
  const tot = d.totals;
  const certTone = s.cert && s.cert.days != null ? (s.cert.days <= 7 ? 'bad' : s.cert.days <= 14 ? 'warn' : 'good') : '';
  const kpis = [
    kpi({ label: 'Disponibilité', ic: 'pass', value: pct(tot.avail), tone: availTone(tot.avail), hint: `${num(tot.n)} vérifications · ${num(tot.fails)} échec${tot.fails > 1 ? 's' : ''}` }),
    kpi({ label: 'Médiane (p50)', ic: 'clock', value: ms(tot.p50), hint: `Moyenne ${ms(tot.avg)}` }),
    kpi({ label: 'p95', ic: 'clock', value: ms(tot.p95), tone: s.thresholdMs && tot.p95 > s.thresholdMs ? 'warn' : '', hint: s.thresholdMs ? `Seuil de lenteur ${ms(s.thresholdMs)}` : '95 % des réponses plus rapides' }),
    kpi({ label: 'p99', ic: 'clock', value: ms(tot.p99), hint: `Maximum ${ms(tot.max)}` }),
    kpi({ label: 'Incidents', ic: 'warn', value: num(d.stats.count), tone: s.open.length ? 'bad' : d.stats.count ? 'warn' : 'good', hint: d.stats.down ? `${num(d.stats.down)} panne${d.stats.down > 1 ? 's' : ''} · ${dur(d.stats.downtime, { short: true })} hors ligne` : 'Aucune panne sur la période' }),
    kpi({ label: 'Certificat', ic: 'lock', value: s.cert && s.cert.days != null ? `${num(s.cert.days)} j` : '—', tone: certTone, hint: s.cert && s.cert.issuer ? `Émis par ${esc(s.cert.issuer)}` : s.url.startsWith('https') ? 'Relevé à la prochaine vérification' : 'Site sans https' }),
  ].join('');
  const codes = Object.entries(tot.codes || {}).sort((a, b) => b[1] - a[1]);
  const codeTotal = codes.reduce((a, c) => a + c[1], 0) || 1;
  const codeHtml = codes.length ? `<div class="sup-hbars">${codes.map(([c, n]) => { const tone = c === '0' ? 'bad' : Number(c) >= 500 ? 'bad' : Number(c) >= 400 ? 'warn' : Number(c) >= 300 ? 'info' : 'good'; return `<div class="sup-hbar"><span>${c === '0' ? 'Sans réponse' : `HTTP ${esc(c)}`}</span><div><i class="${tone}" style="width:${Math.max(1.5, (n / codeTotal) * 100)}%"></i></div><b>${num(n)}</b><small>${num((n / codeTotal) * 100, 1)} %</small></div>`; }).join('')}</div>` : '<p class="sup-none">Aucune réponse sur la période.</p>';
  const incHtml = d.incidents.length ? `<div class="sup-list">${d.incidents.slice(0, 6).map((i) => incidentRow(i, d.to)).join('')}</div>` : `<p class="sup-none">${icon('pass', 14)} Aucun incident sur la période.</p>`;
  const recent = d.recent.slice(0, 30).map((r) => `<tr class="${r.up ? '' : 'fail'}">
      <td class="nowrap">${esc(time(r.at, true))}<small class="muted inline"> ${esc(new Date(r.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }))}</small></td>
      <td>${r.up ? chip(r.slow ? 'Lente' : 'OK', r.slow ? 'warn' : 'good') : chip('Échec', 'bad')}</td>
      <td class="num">${r.status || '—'}</td>
      <td class="num"><b>${ms(r.ms)}</b></td>
      ${PHASE.map(([k]) => `<td class="num muted">${r[k] != null ? ms(r[k]) : '—'}</td>`).join('')}
      <td class="num muted">${r.size != null ? bytes(r.size) : '—'}</td>
      <td class="sup-reason">${esc(r.reason || (r.via === 'net' ? 'mesuré par le réseau du système' : ''))}</td>
    </tr>`).join('');
  const errHtml = s.watchErrors ? card('Erreurs de la page', `<div class="sup-errsum">${s.errors ? `${chip(`${s.errors.js} erreur${s.errors.js > 1 ? 's' : ''} JavaScript`, s.errors.js ? 'bad' : 'good', s.errors.js ? 'warn' : 'pass')}${chip(`${s.errors.failed} ressource${s.errors.failed > 1 ? 's' : ''} en échec`, s.errors.failed ? 'bad' : 'good')}<small class="muted">Relevé ${esc(ago(s.errors.at))}</small>` : '<small class="muted">Premier relevé en attente.</small>'}</div>`, { actions: btn('Voir le relevé', 'data-site-act="errors"', { ic: 'code' }) }) : '';
  const mutedTxt = s.muted ? chip(`Sourdine jusqu’à ${time(s.mutedUntil)}`, 'warn', 'bell') : '';
  const token = ctx.token;
  ctx.afterRender = () => { mountCharts(ctx, d); bind(ctx, d); fillServer(ctx, d, token); };
  return `<div class="sup-split">
    <aside class="sup-sites"><div class="sup-sites-h"><b>${ov.sites.length} site${ov.sites.length > 1 ? 's' : ''}</b>${iconBtn('plus', 'Ajouter un site', 'data-sup-add="new"')}</div>${list}</aside>
    <div class="sup-detail">
      <header class="sup-dhead">
        <span class="sup-dot big ${st}"></span>
        <div class="sup-dhead-t">
          <h2>${esc(s.name || host(s.url))}</h2>
          <div class="sup-dhead-m"><button type="button" class="link-btn small" data-external="${esc(s.url)}">${esc(s.url)}</button>${s.ip ? `<small class="muted">${esc(s.ip)}${s.http ? ` · HTTP/${esc(s.http)}` : ''}</small>` : ''}</div>
          <div class="sup-dhead-c">${stateChip(st, s.pending)}${since ? `<small class="muted">${esc(since)}</small>` : ''}${s.reason && st !== 'up' ? chip(s.reason, 'bad') : ''}${mutedTxt}<small class="muted">Toutes les ${s.intervalSec < 60 ? `${s.intervalSec} s` : `${s.intervalSec / 60} min`} · vérifié ${s.last ? esc(ago(s.last.at)) : 'jamais'}</small></div>
        </div>
        <div class="sup-dhead-a">
          ${btn('Vérifier', 'data-site-act="check"', { ic: 'sync' })}
          ${btn(s.muted ? 'Sourdine active' : 'Sourdine', 'data-site-act="mute"', { ic: 'bell' })}
          ${btn(s.enabled ? 'Pause' : 'Reprendre', 'data-site-act="pause"', { ic: s.enabled ? 'pause' : 'play' })}
          ${iconBtn('download', 'Exporter les mesures (CSV)', 'data-site-act="csv"')}
          ${iconBtn('wrench', 'Réglages du site', 'data-site-act="edit"')}
          ${iconBtn('trash', 'Retirer de la supervision', 'data-site-act="remove"')}
        </div>
      </header>
      <div class="sup-kpis k6">${kpis}</div>
      <div data-server-card>${card('Serveurs NEXORA · 24 h/24', '<div class="sec-ai-load"><span class="spinner small"></span> Lecture des mesures du serveur…</div>', { sub: 'Vérifié même NEXORA fermée' })}</div>
      ${card('Temps de réponse', '<div data-chart="pct"></div>', { sub: `Percentiles par tranche de ${dur(d.step, { short: true })}${d.hourly ? ' (agrégats horaires)' : ''}` })}
      <div class="sup-grid g-1-1">
        ${card('Détail du temps de réponse', '<div data-chart="phases"></div>', { sub: 'Durée moyenne de chaque étape, comme pour un premier visiteur' })}
        ${card('Disponibilité', `<div data-chart="avail"></div>${statusBars(s.bars, (b) => barTip(b, s.step))}`, { sub: 'Part du temps où le site répondait correctement' })}
      </div>
      <div class="sup-grid g-1-1">
        ${card('Codes HTTP', codeHtml, { sub: `${num(codeTotal)} réponses` })}
        ${card('Incidents', incHtml, { actions: btn('Voir tout', 'data-site-act="incidents"', { ic: 'chevronRight' }) })}
      </div>
      ${errHtml}
      ${card('Dernières vérifications', `<div class="sup-table-wrap"><table class="sup-table dense"><thead><tr><th>Heure</th><th>Résultat</th><th class="num">Code</th><th class="num">Total</th>${PHASE.map(([, l]) => `<th class="num">${esc(l)}</th>`).join('')}<th class="num">Taille</th><th>Détail</th></tr></thead><tbody>${recent || '<tr><td colspan="11" class="sup-none">Aucune vérification pour l’instant.</td></tr>'}</tbody></table></div>`, { sub: 'Les 30 plus récentes' })}
    </div>
  </div>`;
}

function mountCharts(ctx, d) {
  const s = d.site;
  const bands = d.incidents.filter((i) => i.kind === 'down' || i.kind === 'slow').map((i) => ({ from: i.start, to: i.end || d.to, color: i.kind === 'down' ? 'var(--bad-dot)' : 'var(--warn-dot)', opacity: i.kind === 'down' ? 0.12 : 0.08, label: `${KIND[i.kind].label} : ${i.cause}` }));
  const at = (k) => d.points.map((p) => ({ t: p.t, v: p[k] }));
  const el = ctx.view.querySelector('[data-chart="pct"]');
  if (el) ctx.charts.push(new Chart(el, {
    height: 240, from: d.from, to: d.to, step: d.step, yFmt: ms, label: 'Temps de réponse', bands,
    thresholds: s.thresholdMs ? [{ value: s.thresholdMs, label: `Seuil ${ms(s.thresholdMs)}`, color: 'var(--warn-dot)' }] : [],
    thresholdInScale: false,
    series: [
      { id: 'p50', name: 'p50 (médiane)', color: '#30b0c7', type: 'area', points: at('p50') },
      { id: 'p95', name: 'p95', color: 'var(--accent)', points: at('p95'), width: 2 },
      { id: 'p99', name: 'p99', color: '#af52de', points: at('p99'), dash: '4 3' },
    ],
    tipExtra: (p) => { const q = d.points.find((x) => x.t === p.t); return q && q.n ? `<footer>${num(q.n)} vérification${q.n > 1 ? 's' : ''}${q.fails ? ` · <span class="bad">${q.fails} échec${q.fails > 1 ? 's' : ''}</span>` : ''}</footer>` : '<footer>Aucune mesure</footer>'; },
  }));
  const ep = ctx.view.querySelector('[data-chart="phases"]');
  if (ep) ctx.charts.push(new Chart(ep, {
    height: 220, from: d.from, to: d.to, step: d.step, yFmt: ms, label: 'Détail du temps de réponse',
    empty: 'Le détail apparaît dès les prochaines vérifications.',
    series: PHASE.map(([k, name, color]) => ({ id: k, name, color, type: 'stack', points: at(k) })),
  }));
  const ea = ctx.view.querySelector('[data-chart="avail"]');
  if (ea) {
    const lows = d.points.filter((p) => p.avail != null).map((p) => p.avail);
    const min = lows.length ? Math.min(...lows) : 100;
    ctx.charts.push(new Chart(ea, {
      height: 190, from: d.from, to: d.to, step: d.step, yMin: min >= 99 ? 98 : min >= 90 ? 90 : 0, yMax: 100, yFmt: (v) => `${num(v, 1)} %`, label: 'Disponibilité',
      series: [{ id: 'avail', name: 'Disponibilité', type: 'bar', color: 'var(--ok-dot)', colorOf: (p) => (p.v >= 99.99 ? 'var(--ok-dot)' : p.v >= 99 ? 'var(--warn-dot)' : 'var(--bad-dot)'), fmt: (v) => pct(v), points: at('avail') }],
    }));
  }
}

function bind(ctx, d) {
  const s = d.site;
  for (const b of ctx.view.querySelectorAll('[data-site]')) b.onclick = () => { ctx.siteId = b.dataset.site; ctx.savePref(); ctx.show(); };
  for (const b of ctx.view.querySelectorAll('[data-site-act]')) b.onclick = () => act(ctx, d, b.dataset.siteAct, b);
  void s;
}

async function setEnabled(id, enabled) {
  const cfg = await call('mon:config');
  return call('mon:set-endpoints', (cfg.endpoints || []).map((x) => (x.id === id ? { ...x, enabled } : x)));
}

async function act(ctx, d, what, el) {
  const s = d.site;
  try {
    if (what === 'check') {
      el.disabled = true;
      const r = await call('mon:check-now', s.id);
      toast(r ? (r.up ? `En ligne : ${ms(r.ms)} (HTTP ${r.status}).` : `Échec : ${r.reason || 'injoignable'}.`) : 'Vérification impossible.', r && !r.up ? { kind: 'bad' } : undefined);
      ctx.show(true);
    } else if (what === 'pause') {
      await setEnabled(s.id, !s.enabled);
      toast(s.enabled ? 'Surveillance en pause.' : 'Surveillance reprise.');
      ctx.show(true);
    } else if (what === 'edit') {
      ctx.editSite(s.id);
    } else if (what === 'remove') {
      const linked = (await links().catch(() => ({ map: new Map() }))).map.has(s.id);
      if (!(await confirmSheet({ title: `Retirer « ${s.name || host(s.url)} » ?`, text: `Les mesures de ce site sont effacées. Ses incidents restent dans l’historique.${linked ? ' Il ne sera plus surveillé par les serveurs NEXORA non plus.' : ''}`, ok: 'Retirer', ic: 'trash' }))) return;
      const cfg = await call('mon:config');
      await call('mon:set-endpoints', (cfg.endpoints || []).filter((x) => x.id !== s.id));
      if (linked) await unlink(s.id).catch((x) => toast(x.message || String(x), { kind: 'bad' }));
      ctx.siteId = null;
      toast('Site retiré de la supervision.');
      ctx.show();
    } else if (what === 'incidents') {
      ctx.go('incidents', { incidentFilter: { siteId: s.id, state: 'all' } });
    } else if (what === 'mute') {
      const opts = [[60, '1 heure'], [240, '4 heures'], [1440, '24 heures'], [10080, '7 jours']];
      const pop = popover(el, `<div class="sup-pop">${s.muted ? `<button class="menu-item" data-mute="0">${icon('bell', 13)}<span>Lever la sourdine</span></button><div class="menu-sep"></div>` : ''}${opts.map(([m, l]) => `<button class="menu-item" data-mute="${m}">${icon('clock', 13)}<span>Sourdine ${l}</span></button>`).join('')}<p class="pop-note">Les incidents restent enregistrés ; seules les alertes ne sont pas envoyées.</p></div>`, { width: 260 });
      if (pop) pop.onclick = async (ev) => {
        const b = ev.target.closest('[data-mute]');
        if (!b) return;
        closePopover();
        await call('mon:silence', { id: s.id, minutes: Number(b.dataset.mute) });
        toast(Number(b.dataset.mute) ? 'Alertes de ce site en sourdine.' : 'Sourdine levée.');
        ctx.show(true);
      };
    } else if (what === 'csv') {
      const list = await call('mon:raw', { id: s.id, range: ctx.range === '90j' ? '30j' : ctx.range });
      if (!list.length) { toast('Aucune mesure à exporter sur cette période.'); return; }
      const rows = [['date', 'en_ligne', 'lente', 'code', 'total_ms', 'dns_ms', 'connexion_ms', 'tls_ms', 'premier_octet_ms', 'transfert_ms', 'taille_octets', 'certificat_jours', 'detail']];
      for (const r of list) rows.push([new Date(r.at).toISOString(), r.up ? 1 : 0, r.slow ? 1 : 0, r.status, r.ms, r.dns, r.tcp, r.tls, r.ttfb, r.dl, r.size, r.certDays, r.reason]);
      const file = await call('lab:save-text', { name: `Supervision ${host(s.url)} ${new Date().toISOString().slice(0, 10)}.csv`, text: csv(rows), filters: [{ name: 'CSV', extensions: ['csv'] }] });
      if (file) toast(`${num(list.length)} mesures exportées.`, { action: 'Afficher', onAction: () => call('lab:reveal', file) });
    } else if (what === 'errors') {
      errorsSheet(s);
    }
  } catch (err) {
    toast(err.message || String(err), { kind: 'bad' });
  } finally {
    if (el) el.disabled = false;
  }
}

async function errorsSheet(s) {
  const owner = 'sup-errors';
  const el = sheet(owner, `<div class="sheet-head"><span class="sheet-icon">${icon('code', 22)}</span><div><h2>Erreurs de la page</h2><p>${esc(s.url)}</p></div></div><div class="sheet-body sup-errbody"><div class="sec-ai-load"><span class="spinner small"></span> Chargement du relevé…</div></div><div class="sheet-foot"><button class="btn" data-err="recheck">${icon('sync', 13)}<span>Revérifier maintenant</span></button><span class="grow"></span><button class="btn primary" data-err="close" data-autofocus>Fermer</button></div>`, { wide: true });
  const body = el.querySelector('.sup-errbody');
  const show = (r) => {
    if (!r) { body.innerHTML = '<p class="sup-none">Aucun relevé pour l’instant.</p>'; return; }
    const row = (tone, ic, title, sub) => `<div class="sup-erow ${tone}">${icon(ic, 13)}<div><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`;
    const short = (u) => { try { const x = new URL(u); return x.pathname.length > 1 ? x.pathname : x.host; } catch { return u; } };
    body.innerHTML = `<p class="muted">Relevé de ${esc(dateTime(r.at))} · chargement ${num(r.loadMs / 1000, 1)} s</p>
      ${r.mainFail ? row('bad', 'warn', 'La page n’a pas pu se charger', r.mainFail) : ''}
      ${r.crashed ? row('bad', 'warn', 'La page a planté', String(r.crashed)) : ''}
      ${r.errors.map((e) => row('bad', 'warn', e.message, `${e.source ? short(e.source) : ''}${e.line ? `:${e.line}` : ''}${e.count > 1 ? ` · ×${e.count}` : ''}`)).join('')}
      ${r.failed.map((f) => row('bad', 'warn', `${f.status ? `HTTP ${f.status}` : f.error} — ${short(f.url)}`, f.type || '')).join('')}
      ${r.warnings.slice(0, 10).map((w) => row('warn', 'info', w.message, w.source ? short(w.source) : '')).join('')}
      ${!r.mainFail && !r.crashed && !r.errors.length && !r.failed.length ? row('ok', 'pass', 'Aucune erreur JavaScript ni ressource en échec', r.warnings.length ? `${r.warnings.length} avertissement(s) mineur(s)` : '') : ''}`;
  };
  try { show(await call('mon:errors', s.id)); } catch (err) { body.innerHTML = `<p class="bad">${esc(err.message)}</p>`; }
  el.onclick = async (ev) => {
    const b = ev.target.closest('[data-err]');
    if (!b) return;
    if (b.dataset.err === 'close') { const { closeSheet } = await import('./util.js'); closeSheet(owner); return; }
    body.innerHTML = '<div class="sec-ai-load"><span class="spinner small"></span> Chargement de la page et relevé des erreurs…</div>';
    try { show(await call('mon:check-errors', s.id)); } catch (err) { body.innerHTML = `<p class="bad">${esc(err.message)}</p>`; }
  };
}

// Carte « Serveurs NEXORA · 24 h/24 » (NEXORA #022) : état du site vu par le serveur, ou activation.
async function fillServer(ctx, d, token) {
  const host0 = ctx.view.querySelector('[data-server-card]');
  if (!host0) return;
  const s = d.site;
  const acc = account();
  const sub = 'Vérifié par les serveurs NEXORA, même NEXORA fermée et ordinateur éteint';
  const paint = (body, actions = '') => { if (token === ctx.token && host0.isConnected) { host0.innerHTML = card('Serveurs NEXORA · 24 h/24', body, { sub, actions, cls: 'sup-srv-card' }); bindServer(ctx, d, host0); } };
  if (!acc.signedIn) {
    paint(`<p class="sup-note">${icon('cloud', 13)} Connecte-toi à ton compte NEXORA (bouton Connexion du rail) : les serveurs NEXORA vérifieront ce site jour et nuit et préviendront ton équipe dans NEXORA dès qu’il tombe ou ralentit.</p>`);
    return;
  }
  let l;
  try { l = await links(); } catch (err) { paint(`<p class="sup-note bad">${esc(err.message || String(err))}</p>`); return; }
  if (l.outdated) { paint('<p class="sup-note">Le serveur NEXORA n’est pas encore à jour pour la supervision 24 h/24 : l’administrateur doit appliquer la migration « supervision_serveur » depuis le back office (section Supabase).</p>'); return; }
  const m = l.map.get(s.id);
  if (!m) {
    paint(`<p class="sup-note">${icon('cloud', 13)} Ce site n’est vérifié que pendant que NEXORA est ouverte sur ce PC. Active la surveillance par les serveurs NEXORA pour l’équipe « ${esc(acc.orgName)} » : vérification toutes les ${Math.max(1, Math.round(s.intervalSec / 60))} min, pannes confirmées, notification dans NEXORA.</p>`,
      acc.canEdit ? btn('Activer la surveillance 24 h/24', 'data-srv="on"', { ic: 'cloud', cls: 'small primary' }) : '<small class="muted">Rôle éditeur requis</small>');
    return;
  }
  let srv = null;
  try { srv = await serverSeries(m.id, ctx.range); } catch (err) { srv = { error: err }; }
  const state = m.active ? m.last_status : 'paused';
  const label = { up: 'En ligne', down: 'En panne', degraded: 'Lent', paused: 'En pause' }[state] || 'En attente de la première vérification';
  const tone = { up: 'good', down: 'bad', degraded: 'warn' }[state] || '';
  const actions = btn('Arrêter', 'data-srv="off"', { ic: 'close' });
  if (!srv || srv.error) {
    paint(`<div class="sup-srv-row">${chip(label, tone, 'cloud')}<small class="muted">Vérifié ${esc(ago(m.last_checked_at ? Date.parse(m.last_checked_at) : 0))}${m.last_latency_ms != null ? ` · ${ms(m.last_latency_ms)}` : ''}${m.last_error ? ` · ${esc(m.last_error)}` : ''}</small></div>${srv && srv.error ? `<p class="sup-note">${esc(srv.error.message)}</p>` : ''}`, actions);
    return;
  }
  const tot = srv.totals || {};
  const open = (srv.incidents || []).filter((i) => !i.ended_at);
  const k = [
    kpi({ label: 'État vu par le serveur', ic: 'cloud', value: esc(label), tone, hint: m.last_checked_at ? `Vérifié ${esc(ago(Date.parse(m.last_checked_at)))}` : 'Première vérification dans la minute' }),
    kpi({ label: 'Disponibilité', ic: 'pass', value: pct(tot.avail), tone: availTone(tot.avail), hint: `${num(tot.n || 0)} vérifications · ${num(tot.fails || 0)} échec${tot.fails > 1 ? 's' : ''}` }),
    kpi({ label: 'p95 (serveur)', ic: 'clock', value: ms(tot.p95), hint: `Médiane ${ms(tot.p50)} · depuis le serveur NEXORA` }),
    kpi({ label: 'Incidents', ic: 'warn', value: num((srv.incidents || []).length), tone: open.length ? 'bad' : 'good', hint: open.length ? `${open.length} en cours` : 'Aucun en cours' }),
  ].join('');
  paint(`<div class="sup-kpis k4">${k}</div><div data-chart="srv"></div>`, actions);
  const el = host0.querySelector('[data-chart="srv"]');
  if (!el) return;
  const t = (v) => Date.parse(v);
  const pts = (key) => (srv.points || []).map((p) => ({ t: t(p.t), v: p[key] }));
  ctx.charts.push(new Chart(el, {
    height: 180, from: t(srv.from), to: t(srv.to), step: srv.step, yFmt: ms, label: 'Temps de réponse vu par le serveur',
    empty: 'Les premières mesures du serveur arrivent dans la minute.',
    bands: (srv.incidents || []).map((i) => ({ from: t(i.started_at), to: i.ended_at ? t(i.ended_at) : t(srv.to), color: i.kind === 'down' ? 'var(--bad-dot)' : 'var(--warn-dot)', opacity: 0.12, label: `${i.kind === 'down' ? 'Panne' : 'Lenteur'} : ${i.cause}` })),
    series: [
      { id: 'p50', name: 'p50 (serveur)', color: '#30b0c7', type: 'area', points: pts('p50') },
      { id: 'p95', name: 'p95 (serveur)', color: 'var(--accent)', points: pts('p95'), width: 2 },
    ],
  }));
}

function bindServer(ctx, d, root) {
  for (const b of root.querySelectorAll('[data-srv]')) b.onclick = async () => {
    b.disabled = true;
    try {
      if (b.dataset.srv === 'on') {
        const cfg = await call('mon:config');
        const site = (cfg.endpoints || []).find((x) => x.id === d.site.id);
        if (!site) throw new Error('Site introuvable.');
        await link(site);
        toast('Site surveillé 24 h/24 par les serveurs NEXORA.');
      } else {
        if (!(await confirmSheet({ title: 'Arrêter la surveillance par le serveur ?', text: 'Le site reste surveillé par NEXORA sur ce PC. Les mesures déjà prises par le serveur sont effacées.', ok: 'Arrêter', ic: 'cloud' }))) return;
        await unlink(d.site.id);
        toast('Surveillance par le serveur arrêtée.');
      }
      ctx.show(true);
    } catch (err) {
      toast(err.message || String(err), { kind: 'bad' });
    } finally {
      b.disabled = false;
    }
  };
}

export { RANGE_MS };
