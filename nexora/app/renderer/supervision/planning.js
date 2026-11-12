// NEXORA #048 : « Planning » de la supervision : fenêtres de maintenance (aucune alerte, exclues de la
// disponibilité), repères de déploiement (automatiques depuis le Dev Lab et le Desktop Builder, manuels ou envoyés
// par une intégration continue) et rapport mensuel de disponibilité en PDF.
import { call, esc, icon, toast, dateTime, ago, host } from './util.js';
import { card, btn } from './ui.js';
import { account, links, deployHook, pushMaintenance } from './cloud.js';

const RECUR = { none: 'Une fois', daily: 'Chaque jour', weekly: 'Chaque semaine' };
const SRC = { git: ['code', 'Envoi Git'], desktop: ['laptop', 'Desktop Builder'], manuel: ['pen', 'Ajouté à la main'], serveur: ['cloud', 'Intégration continue'] };
const localInput = (t) => { const d = new Date(t - new Date(t).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

function windowState(w, now) {
  const span = w.recur === 'daily' ? 86400e3 : w.recur === 'weekly' ? 7 * 86400e3 : 0;
  if (now < w.start) return ['À venir', ''];
  if (!span) return now < w.end ? ['En cours', 'warn'] : ['Terminée', 'muted'];
  return (now - w.start) % span < w.end - w.start ? ['En cours', 'warn'] : ['Récurrente', 'good'];
}

export async function renderPlanning(ctx) {
  const [cfg, maint, marks] = await Promise.all([call('mon:config'), call('mon:maintenance').catch(() => []), call('mon:marks', {}).catch(() => [])]);
  const sites = cfg.endpoints || [];
  const nameOf = (id) => { const s = sites.find((x) => x.id === id); return s ? s.name || host(s.url) : 'site retiré'; };
  const now = Date.now();
  const siteOpts = `<option value="">Tous les sites</option>${sites.map((s) => `<option value="${esc(s.id)}">${esc(s.name || host(s.url))}</option>`).join('')}`;
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1); return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })]; });
  const acc = account();
  ctx.afterRender = () => bind(ctx, maint);
  const mList = maint.length ? `<div class="sup-list">${maint.map((w) => { const [st, tone] = windowState(w, now); return `<div class="sup-mrow"><span class="sup-chip ${tone}">${esc(st)}</span><div><b>${esc(w.label)}</b><small>${esc(w.siteId ? nameOf(w.siteId) : 'Tous les sites')} · ${esc(RECUR[w.recur] || '')} · ${esc(dateTime(w.start))} → ${esc(new Date(w.end).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))}${w.recur === 'none' && w.end - w.start > 86400e3 ? ` (${esc(dateTime(w.end))})` : ''}</small></div><button type="button" class="icon-btn small" title="Retirer" aria-label="Retirer" data-mdel="${esc(w.id)}">${icon('trash', 13)}</button></div>`; }).join('')}</div>` : `<p class="sup-none">${icon('clock', 14)} Aucune maintenance prévue.</p>`;
  const kList = marks.length ? `<div class="sup-list">${marks.slice(0, 40).map((m) => { const [ic, lab] = SRC[m.source] || SRC.manuel; return `<div class="sup-mrow"><span class="sup-mark-i">${icon(ic, 13)}</span><div><b>${esc(m.label)}</b><small>${esc(dateTime(m.at))} · ${esc(m.siteId ? nameOf(m.siteId) : 'tous les sites')} · ${esc(lab)}</small></div><button type="button" class="icon-btn small" title="Retirer" aria-label="Retirer" data-kdel="${esc(m.id)}">${icon('trash', 13)}</button></div>`; }).join('')}</div>` : `<p class="sup-none">${icon('code', 14)} Aucun déploiement repéré pour l’instant.</p>`;
  return `<div class="sup-grid g-1-1 g-top">
    ${card('Fenêtres de maintenance', `${mList}
      <form class="sup-mform" data-mform autocomplete="off">
        <div class="sup-form-grid"><label class="field"><span>Libellé</span><input class="input" name="label" placeholder="Mise à jour du serveur" required></label><label class="field"><span>Concerne</span><select class="input" name="siteId">${siteOpts}</select></label></div>
        <div class="sup-form-grid"><label class="field"><span>Début</span><input class="input" type="datetime-local" name="start" value="${esc(localInput(now + 3600e3 - (now % 3600e3)))}" required></label><label class="field"><span>Durée</span><select class="input" name="dur">${[[30, '30 min'], [60, '1 h'], [120, '2 h'], [240, '4 h'], [480, '8 h'], [1440, '24 h']].map(([v, l]) => `<option value="${v}" ${v === 60 ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="field"><span>Répéter</span><select class="input" name="recur">${Object.entries(RECUR).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label></div>
        <div class="nxs-actions">${btn('Prévoir la maintenance', 'type="submit"', { ic: 'plus', cls: 'small primary' })}</div>
      </form>`, { sub: 'Aucune alerte, et la période ne compte pas dans la disponibilité' })}
    ${card('Repères de déploiement', `${kList}
      <form class="sup-mform" data-kform autocomplete="off"><div class="sup-form-grid"><label class="field"><span>Libellé</span><input class="input" name="label" placeholder="Version 2.4 en ligne" required></label><label class="field"><span>Concerne</span><select class="input" name="siteId">${siteOpts}</select></label></div><div class="nxs-actions">${btn('Ajouter un repère', 'type="submit"', { ic: 'plus', cls: 'small' })}</div></form>
      <div class="sup-note" data-hook-box>${icon('info', 12)} Les envois Git du Dev Lab et les constructions du Desktop Builder ajoutent un repère tout seuls. ${acc.signedIn && acc.orgId ? '<button type="button" class="link-btn small" data-hook-get>Afficher l’adresse pour votre intégration continue</button>' : 'Connectez-vous pour recevoir aussi les déploiements de votre intégration continue.'}</div>`, { sub: 'Visibles sur les graphiques : un ralentissement juste après une mise en ligne saute aux yeux' })}
  </div>
  ${card('Rapport mensuel', `<div class="sup-report"><p class="pop-note">Disponibilité de chaque site, objectifs atteints ou manqués, incidents et déploiements du mois, dans un PDF à partager avec votre équipe ou vos clients. Avec la surveillance 24 h/24, les serveurs NEXORA l’envoient aussi par e-mail le 1er de chaque mois (offre Standard).</p>
    <div class="sup-report-a"><select class="input" data-rmonth>${months.map(([v, l], i) => `<option value="${v}" ${i === 1 ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${btn('Créer le rapport PDF', 'data-rmake', { ic: 'download', cls: 'small primary' })}</div></div>`, { cls: 'sup-card-quiet' })}`;
}

function bind(ctx, maint) {
  const v = ctx.view;
  const saveMaint = async (list) => {
    const saved = await call('mon:set-maintenance', list);
    try { const l = await links(); if (l.map.size) await pushMaintenance(saved, l.map); } catch { /* serveurs sans la migration : maintenance sur ce PC seulement */ }
    ctx.show(true);
  };
  const mf = v.querySelector('[data-mform]');
  if (mf) mf.onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(mf);
    const start = new Date(String(fd.get('start'))).getTime();
    if (!start) { toast('Indiquez la date de début.', { kind: 'bad' }); return; }
    try { await saveMaint([...maint, { id: Math.random().toString(36).slice(2, 10), label: String(fd.get('label')).trim(), siteId: String(fd.get('siteId') || ''), start, end: start + Number(fd.get('dur')) * 60000, recur: fd.get('recur') }]); toast('Maintenance prévue : aucune alerte pendant cette période.'); } catch (err) { toast(err.message, { kind: 'bad' }); }
  };
  for (const b of v.querySelectorAll('[data-mdel]')) b.onclick = () => saveMaint(maint.filter((w) => w.id !== b.dataset.mdel)).catch((err) => toast(err.message, { kind: 'bad' }));
  const kf = v.querySelector('[data-kform]');
  if (kf) kf.onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(kf);
    try { await call('mon:mark-add', { label: String(fd.get('label')).trim(), siteId: String(fd.get('siteId') || '') }); toast('Repère ajouté.'); ctx.show(true); } catch (err) { toast(err.message, { kind: 'bad' }); }
  };
  for (const b of v.querySelectorAll('[data-kdel]')) b.onclick = async () => { await call('mon:mark-del', b.dataset.kdel); ctx.show(true); };
  const hg = v.querySelector('[data-hook-get]');
  if (hg) hg.onclick = async () => {
    const box = v.querySelector('[data-hook-box]');
    try {
      const u = await deployHook();
      if (!u) throw new Error('Adresse indisponible.');
      box.innerHTML = `${icon('link', 12)} À appeler à la fin de chaque déploiement : <code>curl -fsS -X POST "${esc(u)}?label=Version%201.2"</code> <button type="button" class="link-btn small" data-hook-copy>Copier</button>`;
      box.querySelector('[data-hook-copy]').onclick = () => call('clipboard:write', `curl -fsS -X POST "${u}?label=Déploiement"`).then(() => toast('Commande copiée.'));
    } catch (err) { box.innerHTML = `${icon('info', 12)} ${esc(/pas encore disponible|outdated/i.test(err.message) ? 'Les déploiements par intégration continue ne sont pas encore disponibles. Réessayez plus tard.' : err.message)}`; }
  };
  const mk = v.querySelector('[data-rmake]');
  if (mk) mk.onclick = async () => {
    mk.disabled = true;
    try {
      const month = v.querySelector('[data-rmonth]').value;
      const r = await call('mon:report', { month });
      const { monthlyReportHtml, saveReport } = await import('../nx/secu/report.js');
      await saveReport(monthlyReportHtml(r), `Disponibilité ${month}`);
    } catch (err) { toast(err.message, { kind: 'bad' }); } finally { mk.disabled = false; }
  };
  void ago;
}
