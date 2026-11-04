// NEXORA #015 : incidents de la supervision (indicateurs, frise par site, liste filtrable, fiche avec
// prise en charge, note et clôture).
import { call, esc, icon, num, dur, dateTime, host, KIND, chip, toast, sheet, closeSheet, ALERT_KIND, CHANNEL } from './util.js';
import { timeline } from './charts.js';
import { kpi, card, btn } from './ui.js';
import { emptyState } from './overview.js';

const KIND_COLOR = { down: 'var(--bad-dot)', slow: 'var(--warn-dot)', cert: '#af52de', errors: '#5856d6' };

export async function renderIncidents(ctx) {
  const f = (ctx.state.incFilter = { state: 'all', kind: '', siteId: '', ...(ctx.state.incFilter || {}) });
  const [q, ov] = await Promise.all([
    call('mon:incidents', { range: ctx.range, state: 'all', limit: 2000 }),
    call('mon:overview', { range: ctx.range, bars: 10 }),
  ]);
  ctx.state.overview = ov;
  if (!ov.sites.length && !q.list.length) return emptyState(ctx);
  const now = ov.now;
  const st = q.stats;
  const list = q.list.filter((i) => (!f.kind || i.kind === f.kind) && (!f.siteId || i.siteId === f.siteId) && (f.state === 'all' || (f.state === 'open' ? i.end == null : i.end != null)));
  const kpis = [
    kpi({ label: 'Incidents', ic: 'warn', value: num(st.count), hint: `${num(q.list.filter((i) => i.kind === 'slow').length)} lenteur(s) · ${num(q.list.filter((i) => i.kind === 'cert' || i.kind === 'errors').length)} autre(s)` }),
    kpi({ label: 'En cours', ic: 'error', value: num(st.open), tone: st.open ? 'bad' : 'good', hint: st.open ? `${num(q.list.filter((i) => i.end == null && !i.ackAt).length)} non pris en charge` : 'Tout est rétabli' }),
    kpi({ label: 'Pannes', ic: 'error', value: num(st.down), tone: st.down ? 'warn' : 'good', hint: `${dur(st.downtime, { short: true })} d’indisponibilité cumulée` }),
    kpi({ label: 'Rétablissement moyen', ic: 'restart', value: st.mttr != null ? dur(st.mttr, { short: true }) : '—', hint: 'MTTR : de la détection au retour en ligne', tip: 'Mean Time To Recovery : durée moyenne d’une panne.' }),
    kpi({ label: 'Entre deux pannes', ic: 'clock', value: st.mtbf != null ? dur(st.mtbf, { short: true }) : '—', hint: 'MTBF : temps moyen sans panne', tip: 'Mean Time Between Failures : temps moyen entre deux pannes, sur la période.' }),
  ].join('');
  const names = new Map(ov.sites.map((s) => [s.id, s.name || host(s.url)]));
  for (const i of q.list) if (!names.has(i.siteId)) names.set(i.siteId, `${i.siteName} (retiré)`);
  const lanes = [...names.entries()].map(([id, name]) => ({ id, name, items: q.list.filter((i) => i.siteId === id) })).filter((l) => l.items.length || ov.sites.some((s) => s.id === l.id));
  const tl = lanes.length ? timeline(lanes, q.from, q.to, (i) => `${KIND[i.kind].label} · ${i.lastCause || i.cause} · ${dateTime(i.start)} · ${dur((i.end || now) - i.start, { short: true })}${i.end == null ? ' (en cours)' : ''}`, (i) => KIND_COLOR[i.kind]) : '';
  const legend = `<div class="sup-legend static">${Object.entries(KIND).map(([k, v]) => `<span><i style="background:${KIND_COLOR[k]}"></i>${esc(v.label)}</span>`).join('')}</div>`;
  const filters = `<div class="sup-filters">
    <div class="seg">${[['open', 'En cours'], ['all', 'Tous'], ['closed', 'Clos']].map(([v, l]) => `<button type="button" data-inc-f="state" data-v="${v}" class="${f.state === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    <select class="input small" data-inc-sel="kind"><option value="">Tous les types</option>${Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${f.kind === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
    <select class="input small" data-inc-sel="siteId"><option value="">Tous les sites</option>${[...names.entries()].map(([id, n]) => `<option value="${esc(id)}" ${f.siteId === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
    <span class="grow"></span><small class="muted">${num(list.length)} incident${list.length > 1 ? 's' : ''}</small>
  </div>`;
  const rows = list.slice(0, 300).map((i) => {
    const k = KIND[i.kind] || KIND.down;
    return `<tr class="click" data-inc="${esc(i.id)}">
      <td>${i.end == null ? '<span class="sup-state bad pulse"><i></i>En cours</span>' : '<span class="sup-state mute"><i></i>Clos</span>'}</td>
      <td><span class="sup-kind ${k.tone}">${icon(k.icon, 12)}${esc(k.label)}</span></td>
      <td><b>${esc(names.get(i.siteId) || i.siteName)}</b></td>
      <td class="sup-reason">${esc(i.lastCause || i.cause || '')}</td>
      <td class="nowrap">${esc(dateTime(i.start))}</td>
      <td class="num nowrap">${dur((i.end || now) - i.start, { short: true })}</td>
      <td class="num">${num(i.notified || 0)}</td>
      <td>${i.ackAt ? chip('Pris en charge', 'good', 'check') : i.end == null ? `<button type="button" class="btn small" data-inc-ack="${esc(i.id)}">Prendre en charge</button>` : ''}${i.note ? `<span class="sup-note-ic" data-tip="${esc(i.note)}">${icon('pencil', 12)}</span>` : ''}</td>
    </tr>`;
  }).join('');
  ctx.afterRender = () => bind(ctx, q, names);
  return `<div class="sup-kpis k5">${kpis}</div>
    ${card('Frise des incidents', `${legend}${tl || '<p class="sup-none">Aucun site.</p>'}`, { sub: 'Chaque bloc est un incident ; clique pour l’ouvrir' })}
    ${card('Liste des incidents', `${filters}<div class="sup-table-wrap"><table class="sup-table"><thead><tr><th>État</th><th>Type</th><th>Site</th><th>Cause</th><th>Début</th><th class="num">Durée</th><th class="num">Alertes</th><th>Suivi</th></tr></thead><tbody>${rows || `<tr><td colspan="8" class="sup-none">${icon('pass', 14)} Aucun incident ne correspond.</td></tr>`}</tbody></table></div>`)}`;
}

function bind(ctx, q, names) {
  const v = ctx.view;
  for (const b of v.querySelectorAll('[data-inc-f]')) b.onclick = () => { ctx.state.incFilter[b.dataset.incF] = b.dataset.v; ctx.show(true); };
  for (const s of v.querySelectorAll('[data-inc-sel]')) s.onchange = () => { ctx.state.incFilter[s.dataset.incSel] = s.value; ctx.show(true); };
  for (const b of v.querySelectorAll('[data-inc-ack]')) b.onclick = async (ev) => { ev.stopPropagation(); await call('mon:incident', { id: b.dataset.incAck, action: 'ack' }); toast('Incident pris en charge : les rappels sont suspendus.'); ctx.updateBadge(); ctx.show(true); };
  const open = (id) => { const inc = q.list.find((i) => i.id === id); if (inc) incidentSheet(ctx, inc, names.get(inc.siteId) || inc.siteName); };
  for (const r of v.querySelectorAll('[data-inc]')) r.onclick = () => open(r.dataset.inc);
  for (const b of v.querySelectorAll('[data-incident]')) b.onclick = () => open(b.dataset.incident);
}

async function incidentSheet(ctx, inc, name) {
  const owner = 'sup-incident';
  const k = KIND[inc.kind] || KIND.down;
  let log = [];
  try { log = (await call('mon:alerts-log', { limit: 500 })).filter((a) => a.incidentId === inc.id); } catch { log = []; }
  const now = Date.now();
  const steps = [
    [inc.start, `Détection : ${inc.cause}`, 'bad'],
    ...log.slice().reverse().map((a) => [a.at, `${ALERT_KIND[a.kind] || a.kind}${a.muted ? ' (sourdine, non envoyée)' : a.results && a.results.length ? ` : ${a.results.map((r) => `${CHANNEL[r.channel] || r.channel} ${r.ok ? 'envoyé' : 'échec'}`).join(', ')}` : ' : aucun canal configuré'}`, a.level === 'ok' ? 'good' : 'warn']),
    ...(inc.ackAt ? [[inc.ackAt, 'Pris en charge', 'info']] : []),
    ...(inc.end ? [[inc.end, `Clos : ${inc.resolution || (inc.closedBy === 'manuel' ? 'à la main' : 'automatiquement')}`, 'good']] : []),
  ].sort((a, b) => a[0] - b[0]);
  const el = sheet(owner, `<div class="sup-sheet">
    <div class="sheet-head"><span class="sheet-icon ${k.tone === 'bad' ? 'warn' : ''}">${icon(k.icon, 22)}</span><div><h2>${esc(k.label)} · ${esc(name)}</h2><p>${esc(inc.url || '')}</p></div></div>
    <div class="sheet-body">
      <div class="sup-kv">
        <span>État</span><b>${inc.end == null ? '<span class="sup-state bad pulse"><i></i>En cours</span>' : '<span class="sup-state mute"><i></i>Clos</span>'}</b>
        <span>Début</span><b>${esc(dateTime(inc.start))}</b>
        <span>Durée</span><b>${dur((inc.end || now) - inc.start)}</b>
        <span>Cause</span><b>${esc(inc.cause)}${inc.lastCause && inc.lastCause !== inc.cause ? ` <small class="muted">(dernière : ${esc(inc.lastCause)})</small>` : ''}</b>
        <span>Vérifications</span><b>${num(inc.checks)} en anomalie</b>
        <span>Alertes</span><b>${num(inc.notified || 0)} envoyée(s)</b>
      </div>
      <h4 class="sup-h4">Chronologie</h4>
      <ol class="sup-steps">${steps.map(([t, txt, tone]) => `<li class="${tone}"><i></i><small>${esc(dateTime(t))}</small><span>${esc(txt)}</span></li>`).join('')}</ol>
      <label class="field"><span>Note (cause trouvée, action menée…)</span><textarea class="input" rows="3" data-inc-note placeholder="Ex. : redémarrage du serveur, certificat renouvelé…">${esc(inc.note || '')}</textarea></label>
    </div>
    <div class="sheet-foot">
      ${inc.end == null ? `<button class="btn" data-inc-a="ack">${icon('check', 13)}<span>${inc.ackAt ? 'Relâcher' : 'Prendre en charge'}</span></button><button class="btn" data-inc-a="close">${icon('pass', 13)}<span>Clore</span></button>` : ''}
      <span class="grow"></span><button class="btn" data-inc-a="cancel">Fermer</button><button class="btn primary" data-inc-a="save" data-autofocus>Enregistrer la note</button>
    </div></div>`, { wide: true });
  el.onclick = async (ev) => {
    const b = ev.target.closest('[data-inc-a]');
    if (!b) return;
    const a = b.dataset.incA;
    try {
      const note = el.querySelector('[data-inc-note]').value;
      if (a === 'cancel') { closeSheet(owner); return; }
      if (note !== (inc.note || '')) await call('mon:incident', { id: inc.id, action: 'note', note });
      if (a === 'ack') await call('mon:incident', { id: inc.id, action: 'ack' });
      if (a === 'close') await call('mon:incident', { id: inc.id, action: 'close', note: note ? note.slice(0, 200) : '' });
      closeSheet(owner);
      toast(a === 'close' ? 'Incident clos.' : a === 'ack' ? (inc.ackAt ? 'Prise en charge retirée.' : 'Incident pris en charge : les rappels sont suspendus.') : 'Note enregistrée.');
      ctx.updateBadge();
      ctx.show(true);
    } catch (err) { toast(err.message || String(err), { kind: 'bad' }); }
  };
}
