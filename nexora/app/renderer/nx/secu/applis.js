// NEXORA #048 : onglet « Applications » : audit d'un APK Android (manifeste, permissions, trafic en clair,
// débogage, signature) ou d'un projet Electron (isolation, Node.js, navigation, CSP, signature, fusibles).
import { call, esc, icon, toast, btn, card, ago, ring, counts, compareHtml, findingsHtml, bindAccept, progressHtml, projects, baseName } from './common.js';
import { auditReportHtml, saveReport } from './report.js';

const state = { report: null };

export async function render(inst, host) {
  const electron = projects().filter((p) => p.dir);
  host.innerHTML = `<div class="nxs">
    <div class="sec-bar nxs-bar"><span class="sec-ico">${icon('android', 15)}</span><span class="nxs-bar-t">Un fichier .apk ou le dossier d’un projet Electron</span>${electron.length ? `<select class="input nxs-mini" data-app-proj><option value="">Projet NEXORA…</option>${electron.map((p) => `<option value="${esc(p.dir)}">${esc(p.name)} · ${esc(baseName(p.dir))}</option>`).join('')}</select>` : ''}<button type="button" class="btn primary" data-app-pick>${icon('folderOpen', 14)}<span>Choisir et analyser</span></button></div>
    <div data-app-out></div>
  </div>`;
  const out = host.querySelector('[data-app-out]');
  host.querySelector('[data-app-pick]').onclick = async () => { const p = await call('sec:pick-app').catch(() => null); if (p) run(out, p); };
  const sel = host.querySelector('[data-app-proj]');
  if (sel) sel.onchange = () => { if (sel.value) run(out, sel.value); };
  if (!state.report) { try { state.report = await call('sec:latest', { kind: 'app' }); } catch { state.report = null; } }
  if (state.report) draw(out); else empty(out);
}

function empty(out) {
  out.innerHTML = `<div class="sec-empty">${icon('shield', 34)}<b>Vérifie tes applications avant de les publier</b>
    <p>Pour un APK (App Builder ou autre) : application débogable, trafic non chiffré, sauvegarde des données, composants ouverts aux autres applications, permissions sensibles et signature. Pour un logiciel Electron (Desktop Builder ou autre) : isolation des pages, accès à Node.js, ouverture des liens, CSP, version d’Electron et signature.</p>
    <div class="sec-chips">${['APK débogable', 'Trafic en clair', 'Composants exportés', 'Permissions', 'Clé de débogage', 'Isolation du contexte', 'nodeIntegration', 'Signature du logiciel'].map((s) => `<span>${esc(s)}</span>`).join('')}</div></div>`;
}

async function run(out, target) {
  out.innerHTML = progressHtml('Lecture de l’application…');
  try { state.report = await call('sec:app-audit', { target }); draw(out); } catch (err) { out.innerHTML = `<div class="sec-empty"><b class="bad">${esc(err.message)}</b></div>`; }
}

async function draw(out) {
  const r = state.report;
  let accepted = [];
  try { accepted = await call('sec:accepted', { target: r.target }); } catch { /* */ }
  const i = r.info || {};
  const facts = r.app === 'android'
    ? [['Paquet', i.package], ['Version', `${i.versionName || '—'} (${i.versionCode || '—'})`], ['Android minimum', i.minSdk ? `API ${i.minSdk}` : '—'], ['Android ciblé', i.targetSdk ? `API ${i.targetSdk}` : '—'], ['Permissions', String((i.permissions || []).length)], ['Composants', String(i.components || 0)], ['Signature', i.signature ? `${i.signature.v1 ? 'v1 ' : ''}${i.signature.v2 ? 'v2' : ''}`.trim() || 'aucune' : '—'], ['Architectures', (i.abis || []).join(', ') || 'toutes']]
    : [['Logiciel', i.name], ['Version', i.version || '—'], ['Electron', i.electron || '—'], ['Fichiers de code lus', String(i.files || 0)]];
  out.innerHTML = `
    <div class="sec-summary nxs-sum">${ring(r.score)}<div class="sec-sum-txt"><h2>${esc(r.name)}<small class="muted"> · ${r.app === 'android' ? 'application Android' : 'logiciel Electron'} · ${esc(ago(r.at))}</small></h2><div class="sec-counts">${counts(r.counts)}</div>
      <div class="sec-actions">${btn('Réanalyser', 'data-aa="re"', { ic: 'sync' })}${btn('Rapport PDF', 'data-aa="pdf"', { ic: 'download' })}</div></div></div>
    ${compareHtml(r.compare)}
    <div class="nxs-facts">${facts.map(([k, v]) => `<div><small>${esc(k)}</small><b>${esc(v || '—')}</b></div>`).join('')}</div>
    ${card('Points à vérifier', findingsHtml(r, accepted), { sub: r.app === 'android' ? 'D’après le manifeste et la signature de l’APK' : 'D’après le code, les pages et la configuration de construction' })}`;
  bindAccept(out, r, () => draw(out));
  for (const b of out.querySelectorAll('[data-aa]')) b.onclick = () => {
    if (b.dataset.aa === 're') run(out, r.target);
    else saveReport(auditReportHtml(r, { accepted }), `Application ${r.name}`);
  };
}

export { toast };
