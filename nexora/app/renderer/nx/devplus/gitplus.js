// NEXORA #052 : Git avancé : branches, fusion avec résolution des conflits côte à côte, mises de côté, graphe,
// demandes de fusion GitHub (création, relecture, avis, fusion).
import { esc, ico, root, call, noProject, head, btn, iconBtn, pill, spinner, toast, confirmSheet, prompt, dev, openFile, ago } from './ui.js';

const TABS = [['branches', 'Branches'], ['conflicts', 'Conflits'], ['stash', 'Mises de côté'], ['graph', 'Graphe'], ['prs', 'Demandes de fusion']];

function patchHtml(p) {
  return `<pre class="nxd-diff">${esc(p).split('\n').map((l) => `<span class="${l.startsWith('+') && !l.startsWith('+++') ? 'add' : l.startsWith('-') && !l.startsWith('---') ? 'del' : l.startsWith('@@') ? 'hunk' : ''}">${l || ' '}</span>`).join('\n')}</pre>`;
}

export function mount(el, ctx) {
  const st = { tab: 'branches', b: null, err: '', conflicts: [], file: null, stash: null, stashDiff: null, graph: null, prs: null, prState: 'open', pr: null, busy: false };
  const gitMissing = () => `<div class="nxd-empty">${ico('download', 26)}<b>Git n’est pas installé sur ce PC</b><p>Les branches, fusions et mises de côté utilisent l’outil Git. NEXORA l’installe pour vous, sans droits d’administrateur.</p><button class="btn small primary" data-act="tools">Installer Git</button></div>`;
  const render = () => {
    if (!root()) { el.innerHTML = noProject(); return; }
    const b = st.b;
    const merging = b && b.merging;
    const tabs = `<div class="seg nxd-seg nxd-subtabs">${TABS.map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-tab="${k}">${l}${k === 'conflicts' && st.conflicts.length ? ` <i class="nxd-dot bad">${st.conflicts.length}</i>` : ''}</button>`).join('')}</div>`;
    let body = '';
    if (st.err === 'git') body = gitMissing();
    else if (st.err) body = `<p class="nxd-note bad">${ico('error', 14)} ${esc(st.err)}</p>`;
    else if (st.tab === 'branches') body = !b ? spinner() : `<div class="nxd-row nxd-wrap">${btn('Nouvelle branche', 'data-act="new-branch"', 'plus', 'primary')}${merging ? `${pill('fusion en cours', 'warn')}${btn('Terminer la fusion', 'data-act="merge-continue"', 'check')}${btn('Annuler la fusion', 'data-act="merge-abort"', 'close')}` : ''}</div>
      ${[['Branches locales', b.branches.filter((x) => !x.remote)], ['Branches du dépôt distant', b.branches.filter((x) => x.remote)]].map(([title, list]) => list.length ? `<h4 class="nxd-h4">${title}</h4><div class="nxd-table">${list.map((x) => `<div class="nxd-tr ${x.current ? 'on' : ''}">${ico(x.current ? 'pass' : 'sync', 14)}<b>${esc(x.name)}</b>${x.current ? pill('actuelle', 'ok') : ''}${x.track ? pill(x.track.replace('ahead', 'en avance de').replace('behind', 'en retard de')) : ''}<span class="nxd-grow nxd-muted">${esc(x.subject || '')} · ${esc(x.when || '')}</span>${!x.current ? `${iconBtn('chevronRight', 'Passer sur cette branche', `data-switch="${esc(x.name)}"`)}${iconBtn('nxCombine', `Fusionner dans ${b.current}`, `data-merge="${esc(x.name)}"`)}${!x.remote ? iconBtn('trash', 'Supprimer la branche', `data-del="${esc(x.name)}"`) : ''}` : ''}</div>`).join('')}</div>` : '').join('')}`;
    else if (st.tab === 'conflicts') body = !st.conflicts.length ? `<div class="nxd-empty">${ico('pass', 26)}<b>Aucun conflit</b><p>Quand une fusion ou une mise de côté touche les mêmes lignes que vous, les fichiers concernés apparaissent ici, avec les deux versions côte à côte.</p></div>` : `<div class="nxd-row nxd-wrap">${st.conflicts.map((f) => `<button class="nxd-chip ${st.file && st.file.file === f ? 'on' : ''}" data-cfile="${esc(f)}">${ico('warn', 12)}${esc(f)}</button>`).join('')}</div>${st.file ? `<div class="nxd-merge"><div><h4 class="nxd-h4">À vous (branchez actuelle)</h4><pre class="nxd-code">${esc(st.file.ours ?? '(fichier supprimé)')}</pre>${btn('Garder la mienne', 'data-pick="ours"', 'check')}</div><div><h4 class="nxd-h4">À fusionner</h4><pre class="nxd-code">${esc(st.file.theirs ?? '(fichier supprimé)')}</pre>${btn('Garder l’autre', 'data-pick="theirs"', 'check')}</div><div class="nxd-merge-res"><h4 class="nxd-h4">Résultat (modifiable)</h4><textarea class="input nxd-code" data-result spellcheck="false">${esc(st.file.merged)}</textarea><div class="nxd-row">${btn('Garder les deux', 'data-pick="both"', 'layers')}${btn('Marquer comme résolu', 'data-act="resolve"', 'pass', 'primary')}</div></div></div>` : '<p class="nxd-muted">Choisissez un fichier en conflit.</p>'}${merging ? `<div class="nxd-row">${btn('Terminer la fusion', 'data-act="merge-continue"', 'check', 'primary')}${btn('Annuler la fusion', 'data-act="merge-abort"', 'close')}</div>` : ''}`;
    else if (st.tab === 'stash') body = !st.stash ? spinner() : `<div class="nxd-row">${btn('Mettre de côté mes changements', 'data-act="stash"', 'download', 'primary')}</div><p class="nxd-muted">Rangez vos modifications en cours (fichiers nouveaux compris) pour changer de branche, puis reprenez-les plus tard.</p>${st.stash.length ? `<div class="nxd-table">${st.stash.map((s) => `<div class="nxd-tr">${ico('layers', 14)}<b>${esc(s.message)}</b><span class="nxd-grow nxd-muted">${esc(s.ref)} · ${esc(s.when)}</span>${iconBtn('eye', 'Voir le contenu', `data-sshow="${esc(s.ref)}"`)}${btn('Reprendre', `data-spop="${esc(s.ref)}"`, 'upload')}${iconBtn('copy', 'Appliquer en la gardant', `data-sapply="${esc(s.ref)}"`)}${iconBtn('trash', 'Supprimer', `data-sdrop="${esc(s.ref)}"`)}</div>`).join('')}</div>` : '<p class="nxd-muted">Aucune mise de côté.</p>'}${st.stashDiff ? patchHtml(st.stashDiff) : ''}`;
    else if (st.tab === 'graph') body = !st.graph ? spinner() : `<div class="nxd-graph">${st.graph.rows.map((r) => `<div class="nxd-gr"><code class="nxd-gl">${esc(r.graph)}</code>${r.hash ? `<code class="nxd-hash">${esc(r.hash)}</code>${(r.refs || []).map((x) => pill(x.replace('HEAD -> ', '● '), /HEAD ->/.test(x) ? 'ok' : x.startsWith('tag:') ? 'warn' : '')).join('')}<span class="nxd-grow">${esc(r.subject)}</span><small>${esc(r.author)} · ${esc(r.when)}</small>` : ''}</div>`).join('')}</div>`;
    else if (st.tab === 'prs') body = prsHtml();
    el.innerHTML = `${head('Git avancé', b ? `Branche actuelle : <b>${esc(b.current || '—')}</b>` : '', iconBtn('refreshCw', 'Actualiser', 'data-act="reload"'))}${tabs}${body}`;
  };
  const prsHtml = () => {
    if (st.pr) {
      const p = st.pr;
      return `<div class="nxd-row">${btn('Toutes les demandes', 'data-act="pr-back"', 'chevronLeft')}<span class="grow"></span>${iconBtn('external', 'Ouvrir sur GitHub', `data-url="${esc(p.url)}"`)}</div>
        <div class="nxd-pr-h"><h4>#${p.number} ${esc(p.title)}</h4><p>${pill(p.state === 'merged' ? 'fusionnée' : p.state === 'open' ? (p.draft ? 'brouillon' : 'ouverte') : 'fermée', p.state === 'open' ? 'ok' : '')} <code>${esc(p.head)}</code> → <code>${esc(p.base)}</code> · ${esc(p.user)} · <span class="nxd-add">+${p.additions}</span> <span class="nxd-del">−${p.deletions}</span></p>${p.body ? `<p class="nxd-pr-body">${esc(p.body)}</p>` : ''}</div>
        ${p.files.map((f) => `<details class="nxd-details" open><summary>${ico('file', 12)} ${esc(f.file)} <small>${esc(f.status)} · +${f.additions} −${f.deletions}</small></summary>${f.patch ? patchHtml(f.patch) : '<p class="nxd-muted">Fichier binaire ou trop gros pour être affiché.</p>'}<div class="nxd-row"><input class="input" placeholder="Commentaire sur une ligne de ce fichier" data-cpath="${esc(f.file)}"><input class="input nxd-num" type="number" min="1" placeholder="Ligne" data-cline="${esc(f.file)}"></div></details>`).join('')}
        ${[...p.reviews.filter((r) => r.state !== 'PENDING'), ...p.comments].length ? `<h4 class="nxd-h4">Avis et commentaires</h4>${p.reviews.map((r) => `<div class="nxd-comment"><b>${esc(r.user)}</b> ${pill({ APPROVED: 'approuvée', CHANGES_REQUESTED: 'changements demandés', COMMENTED: 'commentaire' }[r.state] || r.state, r.state === 'APPROVED' ? 'ok' : r.state === 'CHANGES_REQUESTED' ? 'warn' : '')} <small>${ago(r.at)}</small>${r.body ? `<p>${esc(r.body)}</p>` : ''}</div>`).join('')}${p.comments.map((c) => `<div class="nxd-comment"><b>${esc(c.user)}</b> <small>${ago(c.at)}</small><p>${esc(c.body)}</p></div>`).join('')}` : ''}
        ${p.state === 'open' ? `<h4 class="nxd-h4">Votre avis</h4><textarea class="input nx-ta" data-review rows="3" placeholder="Résumé de votre relecture"></textarea><div class="nxd-row nxd-wrap">${btn('Approuver', 'data-review-ev="APPROVE"', 'pass', 'primary')}${btn('Demander des changements', 'data-review-ev="REQUEST_CHANGES"', 'warn')}${btn('Commenter', 'data-review-ev="COMMENT"', 'nxComment')}<span class="grow"></span><select class="input nxd-sel" data-merge-method><option value="squash">Fusionner en un seul enregistrement</option><option value="merge">Fusionner avec l’historique</option><option value="rebase">Rejouer les enregistrements</option></select>${btn('Fusionner', 'data-act="pr-merge"', 'nxCombine')}</div>` : ''}`;
    }
    if (!st.prs) return spinner('Lecture des demandes de fusion…');
    if (st.prs.error) return `<div class="nxd-empty">${ico('link', 26)}<b>Demandes de fusion indisponibles</b><p>${esc(st.prs.error)}</p></div>`;
    return `<div class="nxd-row nxd-wrap"><div class="seg nxd-seg">${[['open', 'Ouvertes'], ['closed', 'Fermées']].map(([k, l]) => `<button class="${st.prState === k ? 'on' : ''}" data-prstate="${k}">${l}</button>`).join('')}</div><span class="grow"></span>${btn('Nouvelle demande de fusion', 'data-act="pr-new"', 'plus', 'primary')}</div>
      ${st.prs.length ? `<div class="nxd-table">${st.prs.map((p) => `<button class="nxd-tr nxd-click" data-pr="${p.number}">${ico('nxCombine', 14)}<b>#${p.number}</b><span class="nxd-grow">${esc(p.title)}</span>${p.draft ? pill('brouillon') : ''}${pill(p.state === 'merged' ? 'fusionnée' : p.state === 'open' ? 'ouverte' : 'fermée', p.state === 'open' ? 'ok' : '')}<small><code>${esc(p.head)}</code> → <code>${esc(p.base)}</code> · ${esc(p.user)} · ${ago(p.updated)}</small></button>`).join('')}</div>` : '<p class="nxd-muted">Aucune demande de fusion.</p>'}`;
  };
  const guard = async (fn) => {
    try { st.err = ''; return await fn(); } catch (e) { if (/Git n’est pas installé/.test(e.message)) st.err = 'git'; render(); return null; }
  };
  const loadBranches = () => guard(async () => { st.b = await call('devx:git-branches', {}, { quiet: true }); st.conflicts = await call('devx:git-conflicts', {}, { quiet: true }); render(); }).catch(() => {});
  const loadTab = async () => {
    if (!root()) return render();
    if (st.tab === 'stash') await guard(async () => { st.stash = await call('devx:git-stash-list', {}, { quiet: true }); });
    if (st.tab === 'graph') await guard(async () => { st.graph = await call('devx:git-graph', { limit: 300 }, { quiet: true }); });
    if (st.tab === 'prs' && !st.pr) { try { st.prs = await call('devx:pr-list', { state: st.prState }, { quiet: true }); } catch (e) { st.prs = { error: e.message }; } }
    render();
  };
  const refreshDev = () => { const d = dev(); if (d && d.git && d.git.refresh) d.git.refresh(); };
  const openConflict = async (file) => { st.file = await call('devx:git-conflict', { file }).catch(() => null); render(); };
  el.addEventListener('click', async (e) => {
    const t = e.target;
    const tab = t.closest('[data-tab]');
    if (tab) { st.tab = tab.dataset.tab; render(); loadTab(); return; }
    if (t.closest('[data-act="reload"]')) { await loadBranches(); loadTab(); return; }
    if (t.closest('[data-act="tools"]')) { const b = dev().el.querySelector('[data-nx-tools]'); if (b) b.click(); return; }
    if (t.closest('[data-act="new-branch"]')) { const n = await prompt('Nouvelle branche', { label: `Créée à partir de ${st.b.current}, puis ouverte`, placeholder: 'fonction/paiement', icon: 'sync', go: 'Créer' }); if (n) { await guard(async () => { st.b = await call('devx:git-branch-create', { name: n.trim() }); toast(`Vous travaillez maintenant sur ${n.trim()}.`); refreshDev(); }); render(); } return; }
    const sw = t.closest('[data-switch]');
    if (sw) { await guard(async () => { st.b = await call('devx:git-switch', { name: sw.dataset.switch }); refreshDev(); toast(`Branche ${st.b.current} ouverte.`); }); render(); return; }
    const mg = t.closest('[data-merge]');
    if (mg && await confirmSheet({ icon: 'nxCombine', title: `Fusionner ${mg.dataset.merge} dans ${st.b.current} ?`, sub: 'Les changements de cette branche sont ajoutés à la branche actuelle. En cas de conflit, vous choisissez ligne par ligne.', go: 'Fusionner' })) {
      const r = await guard(() => call('devx:git-merge', { branch: mg.dataset.merge }));
      if (r) { refreshDev(); if (r.ok) toast('Fusion terminée.'); else if (r.conflicts.length) { toast(`${r.conflicts.length} fichier(s) en conflit à résoudre.`); st.tab = 'conflicts'; st.conflicts = r.conflicts; await openConflict(r.conflicts[0]); } }
      await loadBranches(); return;
    }
    const del = t.closest('[data-del]');
    if (del && await confirmSheet({ icon: 'trash', title: `Supprimer la branche ${del.dataset.del} ?`, sub: 'Les enregistrements qui ne sont sur aucune autre branche seront perdus.', go: 'Supprimer' })) { await guard(async () => { try { st.b = await call('devx:git-branch-delete', { name: del.dataset.del }, { quiet: true }); } catch (err) { if (/not fully merged/.test(err.message) && await confirmSheet({ icon: 'warn', title: 'Cette branche n’a pas été fusionnée', sub: 'Supprimer quand même ? Son travail sera perdu.', go: 'Supprimer quand même' })) st.b = await call('devx:git-branch-delete', { name: del.dataset.del, force: true }); else if (!/not fully merged/.test(err.message)) toast(err.message, { kind: 'bad' }); } }); render(); return; }
    if (t.closest('[data-act="merge-abort"]')) { await guard(async () => { st.b = await call('devx:git-merge-abort'); st.conflicts = []; st.file = null; refreshDev(); toast('Fusion annulée : le projet est revenu comme avant.'); }); render(); return; }
    if (t.closest('[data-act="merge-continue"]')) { await guard(async () => { st.b = await call('devx:git-merge-continue'); refreshDev(); toast('Fusion enregistrée.'); }); render(); return; }
    const cf = t.closest('[data-cfile]');
    if (cf) return openConflict(cf.dataset.cfile);
    const pick = t.closest('[data-pick]');
    if (pick && st.file) { const ta = el.querySelector('[data-result]'); ta.value = pick.dataset.pick === 'ours' ? st.file.ours || '' : pick.dataset.pick === 'theirs' ? st.file.theirs || '' : `${st.file.ours || ''}${(st.file.ours || '').endsWith('\n') ? '' : '\n'}${st.file.theirs || ''}`; return; }
    if (t.closest('[data-act="resolve"]') && st.file) { const r = await call('devx:git-resolve', { file: st.file.file, content: el.querySelector('[data-result]').value }).catch(() => null); if (r) { st.conflicts = r.conflicts; st.file = null; toast(r.conflicts.length ? `Résolu. Encore ${r.conflicts.length} fichier(s).` : 'Tous les conflits sont résolus : terminez la fusion.'); if (r.conflicts[0]) await openConflict(r.conflicts[0]); await loadBranches(); } return; }
    if (t.closest('[data-act="stash"]')) { const m = await prompt('Mettre de côté', { label: 'Un petit nom pour retrouver ces changements', placeholder: 'Essai de remise', icon: 'download', go: 'Mettre de côté' }); if (m !== null) { await guard(async () => { st.stash = await call('devx:git-stash', { message: m.trim() }); refreshDev(); toast('Changements mis de côté.'); }); render(); } return; }
    const sp = t.closest('[data-spop], [data-sapply]');
    if (sp) { const r = await guard(() => call('devx:git-stash-apply', { ref: sp.dataset.spop || sp.dataset.sapply, pop: Boolean(sp.dataset.spop) })); if (r) { st.stash = r.list; refreshDev(); if (r.conflicts.length) { st.conflicts = r.conflicts; st.tab = 'conflicts'; await openConflict(r.conflicts[0]); toast('Des conflits sont apparus : choisissez les bonnes lignes.'); } else toast('Changements repris.'); } render(); return; }
    const sd = t.closest('[data-sdrop]');
    if (sd && await confirmSheet({ icon: 'trash', title: 'Supprimer cette mise de côté ?', sub: 'Ces changements seront perdus.', go: 'Supprimer' })) { st.stash = await call('devx:git-stash-drop', { ref: sd.dataset.sdrop }); st.stashDiff = null; render(); return; }
    const ss = t.closest('[data-sshow]');
    if (ss) { st.stashDiff = await call('devx:git-stash-show', { ref: ss.dataset.sshow }).catch(() => ''); render(); return; }
    const ps = t.closest('[data-prstate]');
    if (ps) { st.prState = ps.dataset.prstate; st.prs = null; render(); loadTab(); return; }
    const pr = t.closest('[data-pr]');
    if (pr) { st.pr = null; render(); st.pr = await call('devx:pr-get', { number: +pr.dataset.pr }).catch(() => null); render(); return; }
    if (t.closest('[data-act="pr-back"]')) { st.pr = null; loadTab(); return; }
    const url = t.closest('[data-url]');
    if (url) { window.open(url.dataset.url, '_blank'); return; }
    if (t.closest('[data-act="pr-new"]')) {
      const title = await prompt('Nouvelle demande de fusion', { label: `De ${st.b ? st.b.current : 'votre branche'} vers main. Envoyez d’abord votre branche avec « Envoyer ».`, placeholder: 'Ajout du paiement par Mobile Money', icon: 'nxCombine', go: 'Continuer' });
      if (!title) return;
      const body = await prompt('Description', { label: 'Ce qui change et comment le tester (facultatif)', multiline: true, icon: 'pen', go: 'Créer la demande' });
      if (body === null) return;
      const base = st.b && st.b.branches.some((x) => x.name === 'main') ? 'main' : st.b && st.b.branches.some((x) => x.name === 'master') ? 'master' : 'main';
      const r = await call('devx:pr-create', { title, body, head: st.b.current, base }).catch(() => null);
      if (r) { toast(`Demande de fusion #${r.number} créée.`); st.prs = null; loadTab(); }
      return;
    }
    const rv = t.closest('[data-review-ev]');
    if (rv && st.pr) { const comments = [...el.querySelectorAll('[data-cpath]')].map((i) => ({ path: i.dataset.cpath, body: i.value.trim(), line: (el.querySelector(`[data-cline="${CSS.escape(i.dataset.cpath)}"]`) || {}).value })).filter((c) => c.body && c.line); st.pr = await call('devx:pr-review', { number: st.pr.number, event: rv.dataset.reviewEv, body: el.querySelector('[data-review]').value, comments }).catch(() => st.pr); toast('Avis envoyé.'); render(); return; }
    if (t.closest('[data-act="pr-merge"]') && st.pr && await confirmSheet({ icon: 'nxCombine', title: `Fusionner la demande #${st.pr.number} ?`, sub: `Les changements de ${st.pr.head} rejoignent ${st.pr.base} sur GitHub.`, go: 'Fusionner' })) { st.pr = await call('devx:pr-merge', { number: st.pr.number, method: el.querySelector('[data-merge-method]').value }).catch(() => st.pr); toast('Demande fusionnée.'); render(); }
  });
  loadBranches();
  render();
  return { show: () => { loadBranches(); loadTab(); } };
}
