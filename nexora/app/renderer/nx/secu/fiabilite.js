// NEXORA #048 : « Vue d'ensemble » de l'espace Sécurité : centre de fiabilité par projet NEXORA. Une note
// globale (sécurité du site, domaine, code, disponibilité, rapidité), la liste « À faire cette semaine » triée
// par urgence, et « Protéger ce projet » en un clic (surveillance, audits du site, du domaine et du code, audit
// programmé chaque semaine et après chaque déploiement).
import { call, esc, icon, toast, btn, card, kpi, ago, ring, sevChip, projects, hostOf, baseName, toneOf, sheet, closeSheet, WHO, whoOf } from './common.js';

const AVAIL = (v) => (v == null ? null : v >= 99.9 ? 100 : v >= 99.5 ? 90 : v >= 99 ? 80 : v >= 98 ? 65 : v >= 95 ? 45 : 25);
const SPEED = (v) => (v == null ? null : v <= 500 ? 100 : v <= 1000 ? 85 : v <= 2000 ? 60 : v <= 4000 ? 40 : 20);
const W = { site: 30, domain: 15, code: 25, avail: 20, speed: 10 };
const DAY = 86400e3;
const pctTxt = (v) => (v == null ? '—' : `${(Math.floor(v * 100) / 100).toLocaleString('fr-FR')} %`);
const msTxt = (v) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s` : `${Math.round(v)} ms`);

async function gather() {
  const [sum, ov, sched] = await Promise.all([
    call('sec:summary').catch(() => ({ latest: [], accepted: [], schedules: [] })),
    call('mon:overview', { range: '30j', bars: 30 }).catch(() => ({ sites: [] })),
    call('sec:schedules').catch(() => []),
  ]);
  const acc = new Set((sum.accepted || []).map((a) => `${a.target}|${a.key}`));
  const latest = sum.latest || [];
  const sites = (ov.sites || []).filter((s) => /^https?:/.test(s.url || ''));
  const ents = [];
  const used = new Set();
  for (const p of projects()) {
    const host = hostOf(p.url);
    if (!host && !p.dir) continue;
    ents.push({ id: p.id, name: p.name, url: p.url, host, dir: p.dir, project: true });
    if (host) used.add(host);
  }
  for (const s of sites) { const h = hostOf(s.url); if (h && !used.has(h)) { used.add(h); ents.push({ id: `m:${s.id}`, name: s.name || h, url: s.url, host: h, dir: '' }); } }
  for (const a of latest.filter((x) => x.kind === 'site')) if (a.host && !used.has(a.host)) { used.add(a.host); ents.push({ id: `a:${a.host}`, name: a.host, url: a.url || `https://${a.host}`, host: a.host, dir: '' }); }
  const now = Date.now();
  for (const e of ents) {
    e.site = e.host ? latest.find((a) => a.kind === 'site' && a.target === e.host) : null;
    e.domain = e.host ? latest.find((a) => a.kind === 'domain' && (e.host === a.target || e.host.endsWith(`.${a.target}`))) : null;
    e.code = e.dir ? latest.find((a) => a.kind === 'code' && a.target === e.dir) : null;
    e.mon = e.host ? sites.find((s) => hostOf(s.url) === e.host) : null;
    e.sched = e.url ? sched.find((s) => hostOf(s.url) === e.host) : null;
    const parts = { site: e.site ? e.site.score : null, domain: e.domain ? e.domain.score : null, code: e.code ? e.code.score : null, avail: e.mon ? AVAIL(e.mon.avail) : null, speed: e.mon ? SPEED(e.mon.p95) : null };
    let wsum = 0; let total = 0;
    for (const [k, v] of Object.entries(parts)) if (v != null) { wsum += W[k]; total += W[k] * v; }
    e.parts = parts;
    e.score = wsum ? Math.round(total / wsum) : null;
    e.todo = todos(e, acc, now);
  }
  return { ents, sched, latest };
}

function todos(e, acc, now) {
  const t = [];
  const push = (rank, title, detail, act, extra = {}) => t.push({ rank, title, detail, act, ent: e, ...extra });
  if (e.mon && e.mon.state === 'down') push(100, `Rétablir ${e.name}`, `Hors ligne${e.mon.since ? ` depuis ${ago(e.mon.since).replace(/^il y a /, '')}` : ''}${e.mon.reason ? ` (${e.mon.reason})` : ''}.`, { tab: 'supervision', siteId: e.mon.id });
  for (const [kind, a] of [['site', e.site], ['domain', e.domain], ['code', e.code]]) {
    if (!a) continue;
    for (const f of a.top || []) {
      if (!(f.sev === 'critical' || f.sev === 'high') || acc.has(`${a.target}|${f.key}`)) continue;
      push(f.sev === 'critical' ? 90 : 70, f.title, f.fix || '', { tab: kind === 'site' ? 'audit' : kind === 'domain' ? 'domaine' : 'code', id: a.id }, { sev: f.sev, who: whoOf(f) });
    }
  }
  if (e.mon && e.mon.cert && e.mon.cert.days != null && e.mon.cert.days <= 14) push(e.mon.cert.days <= 3 ? 95 : 75, `Renouveler le certificat de ${e.host}`, `Il expire dans ${e.mon.cert.days} jour(s).`, { tab: 'supervision', siteId: e.mon.id }, { who: 'hebergeur' });
  const exp = e.domain && e.domain.records && e.domain.records.expiry;
  if (exp && exp.days != null && exp.days <= 30) push(exp.days <= 7 ? 95 : 72, `Renouveler le domaine ${e.domain.target}`, `Il expire dans ${exp.days} jour(s).`, { tab: 'domaine', id: e.domain.id }, { who: 'registraire' });
  if (e.mon && e.mon.slo && e.mon.slo.used >= 1) push(65, `Budget d’erreur dépassé pour ${e.name}`, `Objectif ${String(e.mon.slo.target).replace('.', ',')} % manqué sur 30 jours : priorise la stabilité avant les nouveautés.`, { tab: 'supervision', siteId: e.mon.id });
  if (e.host && !e.mon) push(50, `Surveiller ${e.host}`, 'Sois prévenu dès que le site tombe, ralentit ou que son certificat expire.', { protect: true });
  if (e.host && (!e.site || now - e.site.at > 14 * DAY)) push(45, `${e.site ? 'Refaire' : 'Lancer'} l’audit de sécurité de ${e.host}`, e.site ? `Dernier audit ${ago(e.site.at)}.` : 'Aucun audit pour l’instant.', { run: 'site' });
  if (e.host && !e.domain && !/^(localhost|127\.)/.test(e.host)) push(35, `Vérifier le domaine et les e-mails de ${e.host}`, 'SPF, DMARC, expiration et sous-domaines oubliés.', { run: 'domain' });
  if (e.dir && !e.code) push(40, `Analyser le code de ${e.name}`, 'Dépendances vulnérables et secrets écrits dans le code.', { run: 'code' });
  if (e.host && e.site && !e.sched) push(20, `Programmer l’audit de ${e.host}`, 'Chaque semaine et après chaque déploiement.', { run: 'schedule' });
  return t.sort((a, b) => b.rank - a.rank);
}

function partChip(label, v, txt, missing) {
  return `<span class="nxs-part ${v == null ? 'none' : toneOf(v)}"><small>${esc(label)}</small><b>${v == null ? esc(missing) : esc(txt != null ? txt : String(v))}</b></span>`;
}

function entCard(e) {
  const p = e.parts;
  const missing = (e.host && (!e.mon || !e.site || !e.domain)) || (e.dir && !e.code);
  return `<article class="nxs-ent">
    <header>${ring(e.score)}<div><h3>${esc(e.name)}</h3><small>${esc(e.host || baseName(e.dir))}${e.project ? '' : ' · hors projet'}</small></div></header>
    <div class="nxs-parts">
      ${partChip('Sécurité', p.site, null, 'à auditer')}
      ${partChip('Domaine', p.domain, null, e.host ? 'à auditer' : '—')}
      ${partChip('Code', p.code, null, e.dir ? 'à analyser' : '—')}
      ${partChip('Disponibilité', p.avail, e.mon ? pctTxt(e.mon.avail) : null, e.host ? 'non surveillé' : '—')}
      ${partChip('Rapidité', p.speed, e.mon ? msTxt(e.mon.p95) : null, e.host ? 'non mesurée' : '—')}
    </div>
    <footer>${e.todo.length ? `<span class="muted">${e.todo.length} action${e.todo.length > 1 ? 's' : ''} conseillée${e.todo.length > 1 ? 's' : ''}</span>` : `<span class="good">${icon('check', 12)} Rien à faire</span>`}<span class="grow"></span>${missing ? btn('Tout protéger', `data-protect="${esc(e.id)}"`, { ic: 'shield', cls: 'small primary' }) : ''}</footer>
  </article>`;
}

export async function render(inst, host) {
  host.innerHTML = '<div class="nxs nxs-fiab"><div class="sec-ai-load"><span class="spinner small"></span> Lecture des audits et de la supervision…</div></div>';
  const data = await gather();
  const { ents } = data;
  // Un même constat du domaine concerne tous ses sous-domaines : il n'apparaît qu'une fois.
  const seen = new Set();
  const all = ents.flatMap((e) => e.todo).sort((a, b) => b.rank - a.rank).filter((t) => { const k = `${t.act.id || t.ent.id}|${t.title}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const scored = ents.filter((e) => e.score != null);
  const avg = scored.length ? Math.round(scored.reduce((a, e) => a + e.score, 0) / scored.length) : null;
  const grave = all.filter((t) => t.sev === 'critical' || t.sev === 'high').length;
  const down = ents.filter((e) => e.mon && e.mon.state === 'down').length;
  const soon = all.filter((t) => /Renouveler/.test(t.title)).length;
  const covered = ents.filter((e) => e.host && e.mon && e.site).length;
  const box = host.querySelector('.nxs');
  if (!ents.length) {
    box.innerHTML = `<div class="sec-empty">${icon('shield', 34)}<b>Ton centre de fiabilité</b>
      <p>Une note par projet qui réunit la sécurité du site, du domaine et du code, la disponibilité et la rapidité, et la liste de ce qu’il reste à faire cette semaine. Colle l’adresse de ton site pour tout mettre en place en un clic.</p>
      <form class="sec-bar nxs-bar nxs-protect" data-protect-form><span class="sec-ico">${icon('globe', 15)}</span><input class="input" name="url" placeholder="https://ton-site.com" spellcheck="false" value="${esc(inst.siteUrl() || '')}"><button class="btn primary">${icon('shield', 14)}<span>Protéger ce site</span></button></form></div>`;
    box.querySelector('[data-protect-form]').onsubmit = (ev) => { ev.preventDefault(); const u = String(new FormData(ev.target).get('url') || '').trim(); if (u) protect(inst, { name: hostOf(u), url: /^https?:/i.test(u) ? u : `https://${u}`, host: hostOf(u), dir: '' }, () => render(inst, host)); };
    return;
  }
  const todoHtml = all.length ? `<div class="nxs-todo">${all.slice(0, 9).map((t, i) => `<div class="nxs-todo-i">
      <span class="nxs-todo-n ${t.rank >= 90 ? 'bad' : t.rank >= 65 ? 'warn' : ''}">${i + 1}</span>
      <div><b>${esc(t.title)}</b><small>${t.sev ? `${sevChip(t.sev)} ` : ''}${esc(t.ent.name)}${t.who ? ` · ${esc(WHO[t.who] || '')}` : ''}${t.detail ? ` · ${esc(t.detail)}` : ''}</small></div>
      ${btn(t.act.protect ? 'Surveiller' : t.act.run === 'site' ? 'Auditer' : t.act.run === 'domain' ? 'Vérifier' : t.act.run === 'code' ? 'Analyser' : t.act.run === 'schedule' ? 'Programmer' : 'Voir', `data-todo="${i}"`, { ic: 'chevronRight' })}
    </div>`).join('')}</div>` : `<p class="sup-none">${icon('pass', 14)} Rien d’urgent : tout est en ordre cette semaine.</p>`;
  box.innerHTML = `
    <div class="sup-kpis k5">
      ${kpi({ label: 'Note globale', ic: 'shield', value: avg == null ? '—' : `${avg}<small>/100</small>`, tone: toneOf(avg), hint: `${scored.length} projet${scored.length > 1 ? 's' : ''} noté${scored.length > 1 ? 's' : ''}` })}
      ${kpi({ label: 'Problèmes graves', ic: 'warn', value: String(grave), tone: grave ? 'bad' : 'good', hint: grave ? 'critiques ou élevés, non acceptés' : 'aucun en attente' })}
      ${kpi({ label: 'Sites en panne', ic: 'error', value: String(down), tone: down ? 'bad' : 'good', hint: down ? 'en ce moment' : 'tout répond' })}
      ${kpi({ label: 'Échéances proches', ic: 'clock', value: String(soon), tone: soon ? 'warn' : 'good', hint: 'certificats et domaines' })}
      ${kpi({ label: 'Projets protégés', ic: 'pass', value: `${covered}<small>/${ents.filter((e) => e.host).length}</small>`, tone: covered < ents.filter((e) => e.host).length ? 'warn' : 'good', hint: 'surveillés et audités' })}
    </div>
    <div class="sup-grid g-2-1 g-top">
      ${card('À faire cette semaine', todoHtml, { sub: 'Du plus urgent au moins urgent, tous projets confondus' })}
      ${card('Audits programmés', data.sched.length ? `<div class="nxs-sched">${data.sched.map((s) => `<div class="nxs-sched-i"><span><b>${esc(hostOf(s.url))}</b><small>${s.every === 'day' ? 'Chaque jour' : s.every === 'week' ? 'Chaque semaine' : 'Après chaque déploiement'} · ${s.lastAt ? `dernier ${esc(ago(s.lastAt))}` : 'pas encore lancé'}</small></span>${s.lastScore != null ? `<b class="${toneOf(s.lastScore)}">${s.lastScore}</b>` : ''}</div>`).join('')}</div>` : `<p class="pop-note">Aucun audit programmé. « Tout protéger » en crée un par projet : chaque semaine et après chaque déploiement.</p>`, { sub: 'Alerte si la note baisse ou si un problème grave apparaît' })}
    </div>
    <div class="nxs-ents">${ents.map(entCard).join('')}</div>`;
  for (const b of box.querySelectorAll('[data-protect]')) b.onclick = () => { const e = ents.find((x) => x.id === b.dataset.protect); if (e) protect(inst, e, () => render(inst, host)); };
  for (const b of box.querySelectorAll('[data-todo]')) b.onclick = () => doTodo(inst, all[Number(b.dataset.todo)], () => render(inst, host));
}

async function doTodo(inst, t, reload) {
  const a = t.act;
  if (a.protect) return protect(inst, t.ent, reload);
  if (a.run) return protect(inst, t.ent, reload, [a.run]);
  if (a.tab === 'supervision') {
    try { (await import('../../supervision/index.js')).goTo('sites', { siteId: a.siteId }); } catch { /* */ }
    inst.switchTab('supervision');
    return;
  }
  if (a.tab === 'audit' && a.id) { try { inst.report = await call('sec:history-get', a.id); } catch { /* */ } inst.switchTab('audit'); return; }
  inst.switchTab(a.tab);
}

// « Tout protéger » : surveillance, audits (site, domaine, code), audit programmé. Chaque étape est indépendante.
async function protect(inst, e, reload, only) {
  const steps = [];
  const want = (k) => !only || only.includes(k);
  if (e.host && !e.mon && want('monitor')) steps.push(['monitor', `Surveiller ${e.host} en continu`]);
  if (e.host && want('site')) steps.push(['site', `Audit de sécurité de ${e.host}`]);
  if (e.host && !/^(localhost|127\.)/.test(e.host) && want('domain')) steps.push(['domain', 'Domaine et messagerie']);
  if (e.dir && want('code')) steps.push(['code', `Code de ${baseName(e.dir)}`]);
  if (e.host && !e.sched && (want('schedule') || !only)) steps.push(['schedule', 'Audit chaque semaine et après chaque déploiement']);
  if (!steps.length) return;
  const owner = 'nxs-protect';
  const el = sheet(owner, `<div class="nxs-sheet"><div class="sheet-head"><span class="sheet-icon">${icon('shield', 22)}</span><div><h2>${only ? esc(steps[0][1]) : `Protéger ${esc(e.name)}`}</h2><p>${only ? 'Analyse en cours.' : 'NEXORA met tout en place : chaque étape est indépendante, une étape refusée (offre, réseau) n’empêche pas les autres.'}</p></div></div>
    <div class="sheet-body"><ol class="nxs-steps">${steps.map(([k, l]) => `<li data-step="${k}"><span class="nxs-step-i">${icon('clock', 13)}</span><span><b>${esc(l)}</b><small></small></span></li>`).join('')}</ol></div>
    <div class="sheet-foot"><span class="grow"></span><button type="button" class="btn primary" data-pr="close" disabled>Patiente…</button></div></div>`, { onClose: reload });
  el.onclick = (ev) => { if (ev.target.closest('[data-pr="close"]')) closeSheet(owner); };
  const mark = (k, ok, txt) => {
    const li = el.querySelector(`[data-step="${k}"]`);
    if (!li) return;
    li.className = ok === null ? 'run' : ok ? 'ok' : 'bad';
    li.querySelector('.nxs-step-i').innerHTML = ok === null ? '<span class="spinner small"></span>' : icon(ok ? 'check' : 'warn', 13);
    li.querySelector('small').textContent = txt || '';
  };
  for (const [k] of steps) {
    mark(k, null, 'en cours…');
    try {
      if (k === 'monitor') {
        const cfg = await call('mon:config');
        const list = (cfg.endpoints || []).slice();
        list.push({ id: Math.random().toString(36).slice(2, 9), name: e.name, url: e.url, intervalSec: 300, thresholdMs: 2000, enabled: true, slo: 99.9, watchChange: false });
        await call('mon:set-endpoints', list);
        mark(k, true, 'vérifié toutes les 5 minutes');
      } else if (k === 'site') { const r = await call('sec:scan', { url: e.url }); mark(k, true, `note ${r.score}/100`); }
      else if (k === 'domain') { const r = await call('sec:domain', { host: e.host }); mark(k, true, `note ${r.score}/100`); }
      else if (k === 'code') { const r = await call('sec:code-audit', { dir: e.dir }); mark(k, true, `note ${r.score}/100`); }
      else if (k === 'schedule') { await call('sec:schedule-set', { url: e.url, every: 'week', onDeploy: true, minScore: 70 }); mark(k, true, 'programmé'); }
    } catch (err) { mark(k, false, err.message || String(err)); }
  }
  const b = el.querySelector('[data-pr="close"]');
  b.disabled = false;
  b.textContent = 'Terminé';
  toast(only ? 'Analyse terminée.' : `${e.name} est protégé.`);
}
