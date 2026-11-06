// NEXORA #048 : onglet « Audit du site » enrichi. Le rendu d'origine (security-PRU3E45U.js) reste en place ;
// ce module ajoute après coup : comparaison avec l'audit précédent, historique de la note, risque concret et
// « qui doit agir » sur chaque constat, risques acceptés, correctifs écrits dans le projet, assistant CSP, audit
// sur plusieurs pages, audits programmés, export SARIF et rapport PDF.
import {
  call, esc, icon, toast, sheet, closeSheet, btn, card, dateTime, ago, SEV, WHO, whoOf, riskOf, sevChip, counts, ring,
  compareHtml, historyHtml, findingsHtml, bindAccept, acceptSheet, progressHtml, followJob, projects, currentProject, baseName, copyText, hostOf, toneOf,
} from './common.js';
import { auditReportHtml, saveReport } from './report.js';

const keyOf = (f) => f.key || `${f.cat || ''}|${String(f.title || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()}`;
const targetOf = (rep) => rep.target || rep.host;

// Après le rendu d'origine d'un rapport.
export async function enhanceReport(inst) {
  const rep = inst.report;
  const body = inst.el.querySelector('.sec-body');
  const sum = body && body.querySelector('.sec-summary');
  if (!rep || !sum || sum.dataset.nxs) return;
  sum.dataset.nxs = '1';
  for (const f of rep.findings || []) f.key = keyOf(f);
  const target = targetOf(rep);
  const act = sum.querySelector('.sec-actions');
  if (act) {
    const exp = act.querySelector('[data-sec="export"] span');
    if (exp) exp.textContent = 'Rapport PDF';
    act.insertAdjacentHTML('beforeend', [
      btn('Correctifs', 'data-nxa="fix"', { ic: 'wrench' }),
      btn('Assistant CSP', 'data-nxa="csp"', { ic: 'shield' }),
      btn('Plusieurs pages', 'data-nxa="pages"', { ic: 'layers' }),
      btn('Programmer', 'data-nxa="schedule"', { ic: 'clock' }),
      rep.id ? btn('SARIF', 'data-nxa="sarif"', { ic: 'code' }) : '',
    ].join(''));
  }
  let accepted = [];
  let hist = [];
  try { [accepted, hist] = await Promise.all([call('sec:accepted', { target }), call('sec:history', { kind: 'site', target, limit: 20 })]); } catch { /* aperçu */ }
  if (!body.contains(sum)) return;
  const acc = new Map(accepted.map((a) => [a.key, a]));
  const cmp = compareHtml(rep.compare);
  const histHtml = hist.length > 1 ? `<div class="nxs-histcard"><div class="nxs-histcard-h"><b>Note dans le temps</b><small>${hist.length} audit${hist.length > 1 ? 's' : ''} de ${esc(rep.host)}</small></div>${historyHtml(hist, rep.id)}</div>` : '';
  if (cmp || histHtml) sum.insertAdjacentHTML('afterend', `<div class="nxs-row">${cmp}${histHtml}</div>`);
  // Constats : risque concret, qui doit agir, risque accepté.
  for (const el of body.querySelectorAll('.sec-find[data-find]')) {
    const [cat, idx] = el.dataset.find.split(':');
    const f = (rep.findings || []).filter((x) => x.cat === cat)[Number(idx)];
    if (!f) continue;
    const a = acc.get(f.key);
    const risk = riskOf(f);
    const grid = `<div class="nxs-find-g">${risk && f.sev !== 'info' ? `<div><small>Ce que ça risque</small><span>${esc(risk)}</span></div>` : ''}<div><small>Qui doit agir</small><span>${esc(WHO[whoOf(f)] || WHO.toi)}</span></div></div>`;
    const fix = el.querySelector('.sec-fix');
    if (fix) fix.insertAdjacentHTML('beforebegin', grid); else el.querySelector('p') && el.querySelector('p').insertAdjacentHTML('afterend', grid);
    if (a) {
      el.classList.add('nxs-accepted');
      el.querySelector('.sec-find-h').insertAdjacentHTML('beforeend', `<span class="sup-chip">${icon('check', 11)}Risque accepté</span>`);
      if (a.reason) el.querySelector('.sec-find-h').insertAdjacentHTML('afterend', `<p class="nxs-acc-why">${icon('info', 12)} ${esc(a.reason)}</p>`);
    }
    const bar = el.querySelector('.sec-find-act');
    if (bar && f.sev !== 'info') bar.insertAdjacentHTML('beforeend', a ? btn('Ne plus accepter', `data-nxs-unaccept="${esc(f.key)}"`, { ic: 'close' }) : btn('Accepter le risque', `data-nxs-accept="${esc(f.key)}"`, { ic: 'check' }));
  }
  bindAccept(body, { ...rep, target }, () => { sum.dataset.nxs = ''; inst.renderReport(); inst.renderPageHealth && inst.pageErr && inst.renderPageHealth(); });
  for (const b of body.querySelectorAll('[data-nxs-open]')) b.onclick = () => openAudit(inst, b.dataset.nxsOpen);
  for (const b of body.querySelectorAll('[data-nxa]')) b.onclick = () => action(inst, b.dataset.nxa);
}

async function openAudit(inst, id) {
  try {
    const r = await call('sec:history-get', id);
    if (!r) return;
    inst.report = r;
    inst.pageErr = null;
    const input = inst.el.querySelector('[data-sec-url]');
    if (input && r.url) input.value = r.url;
    inst.renderReport();
  } catch (err) { toast(err.message, { kind: 'bad' }); }
}

function action(inst, what) {
  const rep = inst.report;
  if (what === 'fix') fixSheet(rep);
  else if (what === 'csp') cspSheet(rep.url, rep);
  else if (what === 'pages') pagesSheet(rep.url);
  else if (what === 'schedule') scheduleSheet(rep.url);
  else if (what === 'sarif') call('sec:sarif-save', { id: rep.id }).then((p) => { if (p) toast('Fichier SARIF enregistré.', { action: 'Afficher', onAction: () => call('sec:reveal', p) }); }).catch((err) => toast(err.message, { kind: 'bad' }));
}

// Rapport PDF à la place de l'export texte d'origine.
export async function exportReport(inst) {
  const rep = inst.report;
  if (!rep) return;
  let accepted = [];
  try { accepted = await call('sec:accepted', { target: targetOf(rep) }); } catch { accepted = []; }
  await saveReport(auditReportHtml({ ...rep, kind: rep.kind || 'site' }, { accepted }), `Sécurité ${rep.host || 'site'} ${new Date(rep.at).toISOString().slice(0, 10)}`);
}

// Sous l'état vide : derniers audits et audits programmés.
export async function enhanceEmpty(inst) {
  const box = inst.el.querySelector('.sec-body .sec-empty');
  if (!box || box.dataset.nxs) return;
  box.dataset.nxs = '1';
  let hist = [];
  let sched = [];
  try { [hist, sched] = await Promise.all([call('sec:history', { kind: 'site', limit: 30 }), call('sec:schedules')]); } catch { return; }
  const seen = new Set();
  const last = hist.filter((a) => (seen.has(a.target) ? false : seen.add(a.target))).slice(0, 6);
  if (!last.length && !sched.length) return;
  box.insertAdjacentHTML('afterend', `<div class="nxs-recent">
    ${last.length ? `<section><h4>Derniers audits</h4>${last.map((a) => `<button type="button" class="nxs-recent-i" data-nxs-open="${esc(a.id)}" aria-label="Ouvrir l’audit de ${esc(a.host || a.target)}">${ring(a.score, 's')}<span><b>${esc(a.host || a.target)}</b><small>${esc(ago(a.at))}${a.counts && (a.counts.critical || a.counts.high) ? ` · ${(a.counts.critical || 0) + (a.counts.high || 0)} grave(s)` : ''}</small></span>${icon('chevronRight', 14)}</button>`).join('')}</section>` : ''}
    ${sched.length ? `<section><h4>Audits programmés</h4>${sched.map((s) => `<div class="nxs-recent-i static">${icon('clock', 16)}<span><b>${esc(hostOf(s.url))}</b><small>${esc(EVERY_LABEL[s.every] || '')}${s.onDeploy ? ' et après chaque déploiement' : ''}${s.lastAt ? ` · dernier ${esc(ago(s.lastAt))}` : ''}</small></span>${s.lastScore != null ? `<b class="${toneOf(s.lastScore)}">${s.lastScore}</b>` : ''}</div>`).join('')}</section>` : ''}
  </div>`);
  for (const b of inst.el.querySelectorAll('.nxs-recent [data-nxs-open]')) b.onclick = () => openAudit(inst, b.dataset.nxsOpen);
}

const EVERY_LABEL = { day: 'Chaque jour', week: 'Chaque semaine', deploy: 'Après chaque déploiement' };

// ---------- Correctifs écrits dans le projet ----------
function dirChoices(selected) {
  const list = projects().filter((p) => p.dir);
  const cur = currentProject();
  const sel = selected || (cur && cur.dir) || (list[0] && list[0].dir) || '';
  return { sel, html: `<select class="input" name="dir">${list.map((p) => `<option value="${esc(p.dir)}" ${p.dir === sel ? 'selected' : ''}>${esc(p.name)} · ${esc(baseName(p.dir))}</option>`).join('')}<option value="__pick">Choisir un dossier…</option></select>` };
}

export async function pickDir(select) {
  const d = await call('sec:pick-dir', { title: 'Choisis le dossier du projet' }).catch(() => null);
  if (!d) { if (select) select.value = select.options[0] && select.options[0].value !== '__pick' ? select.options[0].value : '__pick'; return null; }
  if (select && ![...select.options].some((o) => o.value === d)) select.insertAdjacentHTML('afterbegin', `<option value="${esc(d)}">${esc(baseName(d))}</option>`);
  if (select) select.value = d;
  return d;
}

export async function fixSheet(rep, { csp = '' } = {}) {
  const owner = 'nxs-fix';
  let plan;
  try { plan = await call('sec:fix-plan', { id: rep.id, csp }); } catch (err) { toast(err.message, { kind: 'bad' }); return; }
  const dirs = dirChoices();
  const el = sheet(owner, `<div class="nxs-sheet">
    <div class="sheet-head"><span class="sheet-icon">${icon('wrench', 22)}</span><div><h2>Correctifs prêts à écrire</h2><p>NEXORA a reconnu ton hébergeur et prépare le fichier de configuration qui corrige les en-têtes et l’exposition des fichiers. Une copie de chaque fichier modifié est gardée (.avant-nexora).</p></div></div>
    <div class="sheet-body">
      <div class="sup-form-grid">
        <label class="field"><span>Hébergeur</span><select class="input" name="target">${plan.targets.map((t) => `<option value="${esc(t.id)}" ${t.id === plan.target ? 'selected' : ''}>${esc(t.label)}${t.id === plan.detected ? ' (reconnu)' : ''}</option>`).join('')}</select></label>
        <label class="field"><span>Projet où écrire</span>${dirs.html}</label>
      </div>
      <div data-fix-out></div>
    </div>
    <div class="sheet-foot"><button type="button" class="btn" data-fx="copy">${icon('copy', 13)}<span>Copier</span></button><span class="grow"></span><button type="button" class="btn" data-fx="close">Fermer</button><button type="button" class="btn primary" data-fx="write">${icon('download', 13)}<span>Écrire dans le projet</span></button></div>
  </div>`, { wide: true });
  const out = el.querySelector('[data-fix-out]');
  const show = (p) => {
    plan = p;
    const f = p.files[0];
    out.innerHTML = `<div class="nxs-file"><div class="nxs-file-h">${icon('file', 13)}<b>${esc(f.path)}</b><small>${esc(p.hint || '')}</small></div><pre class="sec-code">${esc(f.content)}</pre></div>${p.notes.length ? `<ul class="nxs-notes">${p.notes.map((n) => `<li>${icon('info', 12)}<span>${esc(n)}</span></li>`).join('')}</ul>` : ''}`;
  };
  show(plan);
  el.querySelector('[name="target"]').onchange = async (ev) => { try { show(await call('sec:fix-plan', { id: rep.id, target: ev.target.value, csp })); } catch (err) { toast(err.message, { kind: 'bad' }); } };
  el.querySelector('[name="dir"]').onchange = (ev) => { if (ev.target.value === '__pick') pickDir(ev.target); };
  el.onclick = async (ev) => {
    const b = ev.target.closest('[data-fx]');
    if (!b) return;
    if (b.dataset.fx === 'close') closeSheet(owner);
    else if (b.dataset.fx === 'copy') copyText(plan.files[0].content);
    else if (b.dataset.fx === 'write') {
      const sel = el.querySelector('[name="dir"]');
      let dir = sel.value;
      if (!dir || dir === '__pick') dir = await pickDir(sel);
      if (!dir) return;
      b.disabled = true;
      try {
        const done = await call('sec:fix-write', { dir, files: plan.files });
        const d = done[0];
        closeSheet(owner);
        toast(d.changed ? `${d.created ? 'Fichier créé' : 'Fichier mis à jour'} : ${d.path}${d.backup ? ` (copie : ${d.backup})` : ''}. Publie le site, puis réanalyse.` : `${d.path} est déjà à jour.`, { action: 'Afficher', onAction: () => call('sec:reveal', d.file) });
      } catch (err) { toast(err.message, { kind: 'bad' }); } finally { b.disabled = false; }
    }
  };
}

// ---------- Assistant CSP ----------
export async function cspSheet(url, rep) {
  const owner = 'nxs-csp';
  const el = sheet(owner, `<div class="nxs-sheet">
    <div class="sheet-head"><span class="sheet-icon">${icon('shield', 22)}</span><div><h2>Assistant CSP</h2><p>NEXORA charge ${esc(hostOf(url))} et relève tout ce que la page utilise vraiment, pour proposer une politique de sécurité du contenu qui ne casse rien.</p></div></div>
    <div class="sheet-body" data-csp-out>${progressHtml('Chargement de la page et relevé des ressources…')}</div>
    <div class="sheet-foot"><span class="grow"></span><button type="button" class="btn" data-cs="close">Fermer</button></div>
  </div>`, { wide: true });
  el.onclick = (ev) => { const b = ev.target.closest('[data-cs]'); if (b && b.dataset.cs === 'close') closeSheet(owner); };
  const out = el.querySelector('[data-csp-out]');
  let r;
  try { r = await call('sec:csp', { url }); } catch (err) { out.innerHTML = `<p class="bad">${esc(err.message)}</p>`; return; }
  const src = Object.entries(r.sources).filter(([, v]) => v.length).map(([k, v]) => `<tr><td><code>${esc(k)}</code></td><td>${v.map((x) => `<span class="nxs-src">${esc(x)}</span>`).join(' ')}</td></tr>`).join('');
  out.innerHTML = `
    <div class="nxs-kv"><span>${r.resources} ressource(s) relevée(s)</span><span>${r.inline.scripts} script(s) en ligne</span><span>${r.inline.handlers} gestionnaire(s) en ligne</span><span>${r.inline.styleAttr} attribut(s) style</span></div>
    <h4 class="sup-h4">1. Version d’observation (rien n’est bloqué)</h4>
    <p class="pop-note">À publier d’abord sous l’en-tête <code>Content-Security-Policy-Report-Only</code> : le navigateur signale ce qui serait bloqué, sans rien casser. Vérifie la console de ton site quelques jours.</p>
    <div class="nxs-policy"><pre class="sec-code">${esc(r.reportOnly)}</pre>${btn('Copier', 'data-cp="ro"', { ic: 'copy' })}</div>
    <h4 class="sup-h4">2. Version stricte</h4>
    <div class="nxs-policy"><pre class="sec-code">${esc(r.strict)}</pre>${btn('Copier', 'data-cp="st"', { ic: 'copy' })}</div>
    ${r.notes.length ? `<ul class="nxs-notes">${r.notes.map((n) => `<li>${icon('info', 12)}<span>${esc(n)}</span></li>`).join('')}</ul>` : ''}
    ${r.current ? `<details><summary>Politique actuelle du site</summary><pre class="sec-code">${esc(r.current)}</pre></details>` : ''}
    <details><summary>Sources autorisées par directive</summary><table class="sup-table dense"><tbody>${src}</tbody></table></details>
    ${rep ? `<div class="nxs-actions">${btn('Mettre la version d’observation dans les correctifs', 'data-cp="fix"', { ic: 'wrench', cls: 'primary small' })}</div>` : ''}`;
  for (const b of out.querySelectorAll('[data-cp]')) b.onclick = () => {
    if (b.dataset.cp === 'ro') copyText(r.reportOnly);
    else if (b.dataset.cp === 'st') copyText(r.strict);
    else { closeSheet(owner); fixSheet(rep, { csp: `${r.reportOnly}; report-only` }); }
  };
}

// ---------- Audit sur plusieurs pages ----------
export async function pagesSheet(url) {
  const owner = 'nxs-pages';
  const el = sheet(owner, `<div class="nxs-sheet">
    <div class="sheet-head"><span class="sheet-icon">${icon('layers', 22)}</span><div><h2>Audit sur plusieurs pages</h2><p>NEXORA parcourt les pages de ${esc(hostOf(url))} (25 au plus) comme un visiteur : formulaires sans protection, mots de passe envoyés en clair, cookies de session, messages d’erreur détaillés, pages d’administration et de diagnostic.</p></div></div>
    <div class="sheet-body" data-pg-out>${progressHtml('Lecture de la première page…')}</div>
    <div class="sheet-foot"><button type="button" class="btn" data-pg="pdf" hidden>${icon('download', 13)}<span>Rapport PDF</span></button><span class="grow"></span><button type="button" class="btn" data-pg="close">Fermer</button></div>
  </div>`, { wide: true });
  const out = el.querySelector('[data-pg-out]');
  const off = followJob(out, 'pages');
  let r;
  el.onclick = async (ev) => {
    const b = ev.target.closest('[data-pg]');
    if (!b) return;
    if (b.dataset.pg === 'close') closeSheet(owner);
    else if (r) { const accepted = await call('sec:accepted', { target: r.target }).catch(() => []); saveReport(auditReportHtml(r, { accepted }), `Sécurité ${r.host} plusieurs pages`); }
  };
  try { r = await call('sec:crawl-audit', { url, max: 25 }); } catch (err) { off(); out.innerHTML = `<p class="bad">${esc(err.message)}</p>`; return; }
  off();
  const draw = async () => {
    const accepted = await call('sec:accepted', { target: r.target }).catch(() => []);
    out.innerHTML = `<div class="nxs-head">${ring(r.score)}<div><h3>${r.pages.length} page(s) analysée(s)</h3><div class="nxs-counts">${counts(r.counts)}</div>${compareHtml(r.compare)}</div></div>
      ${findingsHtml(r, accepted)}
      <details><summary>Pages parcourues</summary><table class="sup-table dense"><thead><tr><th>Page</th><th class="num">Code</th><th class="num">Constats</th></tr></thead><tbody>${r.pages.map((p) => `<tr><td>${esc(p.path)}${p.title ? `<small class="muted inline"> ${esc(p.title)}</small>` : ''}</td><td class="num">${p.status || '—'}</td><td class="num">${p.issues || 0}</td></tr>`).join('')}</tbody></table></details>`;
    bindAccept(out, r, draw);
  };
  await draw();
  el.querySelector('[data-pg="pdf"]').hidden = false;
}

// ---------- Audits programmés ----------
export async function scheduleSheet(url) {
  const owner = 'nxs-sched';
  let list = [];
  try { list = await call('sec:schedules'); } catch { list = []; }
  const host = hostOf(url);
  const cur = list.find((s) => hostOf(s.url) === host);
  const el = sheet(owner, `<form class="sup-form" autocomplete="off">
    <div class="sheet-head"><span class="sheet-icon">${icon('clock', 22)}</span><div><h2>Programmer l’audit</h2><p>NEXORA réanalyse ${esc(host)} tout seul et te prévient (e-mail, webhooks) si la note baisse ou si un problème grave apparaît.</p></div></div>
    <div class="sheet-body sup-form-body">
      <div class="sup-form-grid">
        <label class="field"><span>Fréquence</span><select class="input" name="every"><option value="day" ${cur && cur.every === 'day' ? 'selected' : ''}>Chaque jour</option><option value="week" ${!cur || cur.every === 'week' ? 'selected' : ''}>Chaque semaine</option><option value="deploy" ${cur && cur.every === 'deploy' ? 'selected' : ''}>Seulement après un déploiement</option></select></label>
        <label class="field"><span>Note minimale (alerte en dessous)</span><input class="input" type="number" name="minScore" min="0" max="100" step="5" value="${esc(cur ? cur.minScore || '' : 70)}" placeholder="aucune"></label>
      </div>
      <label class="tog-row"><span class="tog-text"><span>Aussi après chaque déploiement</span><small>Envoi Git depuis le Dev Lab ou construction d’un logiciel : l’audit part deux minutes après.</small></span><input type="checkbox" name="onDeploy" ${!cur || cur.onDeploy ? 'checked' : ''}><span class="tog" aria-hidden="true"></span></label>
      <p class="sup-note">Les audits programmés tournent tant que NEXORA est ouverte et comptent dans ton quota d’audits du jour.</p>
      ${list.length ? `<div class="field"><span>Audits programmés</span><div class="nxs-sched">${list.map((s) => `<div class="nxs-sched-i"><span><b>${esc(hostOf(s.url))}</b><small>${esc(EVERY_LABEL[s.every] || '')}${s.onDeploy && s.every !== 'deploy' ? ' et après chaque déploiement' : ''} · ${s.lastAt ? `dernier ${esc(ago(s.lastAt))}` : 'jamais lancé'}${s.lastError ? ` · ${esc(s.lastError)}` : ''}</small></span>${s.lastScore != null ? `<b class="${toneOf(s.lastScore)}">${s.lastScore}</b>` : ''}<button type="button" class="icon-btn small" title="Lancer maintenant" aria-label="Lancer maintenant" data-sr="${esc(s.id)}">${icon('play', 13)}</button><button type="button" class="icon-btn small" title="Retirer" aria-label="Retirer" data-sd="${esc(s.id)}">${icon('trash', 13)}</button></div>`).join('')}</div></div>` : ''}
      <p class="sup-form-err" hidden></p>
    </div>
    <div class="sheet-foot"><span class="grow"></span><button type="button" class="btn" data-c="no">Fermer</button><button type="submit" class="btn primary">${cur ? 'Enregistrer' : 'Programmer'}</button></div>
  </form>`);
  const err = el.querySelector('.sup-form-err');
  el.onclick = async (ev) => {
    if (ev.target.closest('[data-c="no"]')) { closeSheet(owner); return; }
    const run = ev.target.closest('[data-sr]');
    if (run) { run.disabled = true; toast('Audit lancé…'); try { const r = await call('sec:schedule-run', run.dataset.sr); toast(`Audit terminé : ${r.score}/100.`); closeSheet(owner); scheduleSheet(url); } catch (x) { toast(x.message, { kind: 'bad' }); } finally { run.disabled = false; } return; }
    const del = ev.target.closest('[data-sd]');
    if (del) { await call('sec:schedule-delete', del.dataset.sd); closeSheet(owner); scheduleSheet(url); }
  };
  el.querySelector('form').onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    try {
      await call('sec:schedule-set', { id: cur && cur.id, url, every: fd.get('every'), minScore: Number(fd.get('minScore')) || 0, onDeploy: Boolean(fd.get('onDeploy')), enabled: true });
      closeSheet(owner);
      toast(`Audit de ${host} programmé.`);
    } catch (x) { err.hidden = false; err.textContent = x.message; }
  };
}

export { acceptSheet, sevChip, SEV, card, dateTime };
