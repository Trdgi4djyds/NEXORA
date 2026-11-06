// NEXORA #048 : onglet « Code & dépendances » : failles connues des dépendances (base OSV, tous langages),
// secrets écrits dans le code ou restés dans l'historique Git, .env suivi par Git ; outils des développeurs :
// crochet Git qui bloque un envoi contenant un secret, contrôle dans GitHub Actions, export SARIF.
import { call, esc, icon, toast, btn, card, kpi, ago, ring, counts, sevChip, compareHtml, findingsHtml, bindAccept, progressHtml, followJob, projects, currentProject, baseName, copyText } from './common.js';
import { auditReportHtml, saveReport } from './report.js';
import { pickDir } from './audit.js';

const state = { dir: '', report: null };

function dirSelect() {
  const list = projects().filter((p) => p.dir);
  const cur = currentProject();
  if (!state.dir) state.dir = (cur && cur.dir) || (list[0] && list[0].dir) || '';
  const known = list.some((p) => p.dir === state.dir);
  return `<select class="input" data-code-dir>${!known && state.dir ? `<option value="${esc(state.dir)}" selected>${esc(baseName(state.dir))}</option>` : ''}${list.map((p) => `<option value="${esc(p.dir)}" ${p.dir === state.dir ? 'selected' : ''}>${esc(p.name)} · ${esc(baseName(p.dir))}</option>`).join('')}<option value="__pick">${state.dir || list.length ? 'Choisir un autre dossier…' : 'Choisir le dossier du projet…'}</option></select>`;
}

export async function render(inst, host) {
  // Sans projet ouvert : dernier projet analysé.
  if (!state.dir && !projects().some((p) => p.dir)) {
    try { const last = await call('sec:latest', { kind: 'code' }); if (last) { state.dir = last.target; state.report = last; } } catch { /* aperçu */ }
  }
  host.innerHTML = `<div class="nxs">
    <div class="sec-bar nxs-bar"><span class="sec-ico">${icon('folder', 15)}</span>${dirSelect()}<button type="button" class="btn primary" data-code-run>${icon('search', 14)}<span>Analyser le code</span></button></div>
    <div data-code-out></div>
  </div>`;
  const out = host.querySelector('[data-code-out]');
  const sel = host.querySelector('[data-code-dir]');
  sel.onchange = async () => { if (sel.value === '__pick') { const d = await pickDir(sel); if (d) state.dir = d; } else state.dir = sel.value; state.report = null; load(out); };
  host.querySelector('[data-code-run]').onclick = () => run(out);
  load(out);
}

async function load(out) {
  if (!state.report && state.dir) {
    try { state.report = await call('sec:latest', { kind: 'code', target: state.dir }); } catch { state.report = null; }
  }
  if (state.report) draw(out); else empty(out);
}

function empty(out) {
  out.innerHTML = `<div class="sec-empty">${icon('code', 34)}<b>Vérifie ton code avant qu’il parte en ligne</b>
    <p>NEXORA compare tes dépendances à la base publique des failles connues (npm, PyPI, Composer, RubyGems, Go, Rust, Dart, NuGet), cherche les clés et mots de passe écrits dans le code ou restés dans l’historique Git, et peut bloquer un « git push » qui contient un secret.</p>
    <div class="sec-chips">${['Dépendances vulnérables', 'Clés et jetons', 'Historique Git', '.env suivi par Git', 'Crochet pre-push', 'GitHub Actions', 'SARIF'].map((s) => `<span>${esc(s)}</span>`).join('')}</div></div>
    ${state.dir ? devTools() : ''}`;
  bindTools(out);
}

async function run(out) {
  if (!state.dir) { const d = await pickDir(out.closest('.nxs').querySelector('[data-code-dir]')); if (!d) return; state.dir = d; }
  out.innerHTML = progressHtml('Lecture des fichiers du projet…');
  const off = followJob(out, 'code');
  try { state.report = await call('sec:code-audit', { dir: state.dir }); draw(out); } catch (err) { out.innerHTML = `<div class="sec-empty"><b class="bad">${esc(err.message)}</b></div>`; } finally { off(); }
}

function devTools() {
  return `<div class="sup-grid g-1-1 nxs-tools" data-tools>
    ${card('Bloquer les secrets avant « git push »', `<p class="pop-note">Un crochet Git vérifie les commits envoyés : clé AWS, Stripe, GitHub, OpenAI, clé de service d’une base de données en ligne, clé privée ou fichier .env. L’envoi est refusé avec la liste des secrets trouvés (masqués).</p><div class="nxs-hook" data-hook>${icon('sync', 13)} Vérification…</div>`, { sub: 'Fonctionne avec Git en ligne de commande, VS Code et le Dev Lab' })}
    ${card('Contrôle à chaque envoi sur GitHub', `<p class="pop-note">NEXORA ajoute au projet un workflow GitHub Actions et un script d’audit sans dépendance : failles des dépendances, secrets et en-têtes du site publié. La construction échoue sous la note choisie.</p>
      <div class="sup-form-grid"><label class="field"><span>Adresse du site publié (facultatif)</span><input class="input" data-ci-url placeholder="https://ton-site.com"></label><label class="field"><span>Note minimale</span><input class="input" type="number" data-ci-min min="0" max="100" step="5" value="70"></label></div>
      <div class="nxs-actions">${btn('Ajouter le contrôle au projet', 'data-ci-write', { ic: 'download', cls: 'small primary' })}</div>`, { sub: 'Fichiers : .github/workflows/nexora-securite.yml et .nexora/audit-securite.cjs' })}
  </div>`;
}

async function bindTools(out) {
  const box = out.querySelector('[data-hook]');
  if (box) {
    let st;
    try { st = await call('sec:hook-status', { dir: state.dir }); } catch (err) { box.innerHTML = `<span class="muted">${esc(err.message)}</span>`; st = null; }
    if (st) {
      box.innerHTML = !st.repo ? `<span class="muted">${icon('info', 13)} Ce dossier n’est pas un dépôt Git.</span>`
        : st.installed ? `<span class="sup-chip good">${icon('check', 11)}Crochet actif</span>${st.chained ? '<small class="muted">Ton ancien crochet pre-push est toujours appelé ensuite.</small>' : ''}${btn('Retirer', 'data-hook-act="remove"', { ic: 'trash' })}`
          : `${st.other ? '<small class="muted">Un crochet pre-push existe déjà : il sera gardé et appelé ensuite.</small>' : ''}${btn('Activer le crochet', 'data-hook-act="install"', { ic: 'shield', cls: 'small primary' })}`;
      for (const b of box.querySelectorAll('[data-hook-act]')) b.onclick = async () => {
        try { await call(b.dataset.hookAct === 'install' ? 'sec:hook-install' : 'sec:hook-remove', { dir: state.dir }); toast(b.dataset.hookAct === 'install' ? 'Crochet activé : un envoi avec un secret sera refusé.' : 'Crochet retiré.'); bindTools(out); } catch (err) { toast(err.message, { kind: 'bad' }); }
      };
    }
  }
  const ci = out.querySelector('[data-ci-write]');
  if (ci) ci.onclick = async () => {
    try {
      const r = await call('sec:ci-write', { dir: state.dir, url: out.querySelector('[data-ci-url]').value.trim(), minScore: Number(out.querySelector('[data-ci-min]').value) || 70 });
      toast(`Ajouté au projet : ${r.files.join(', ')}. Envoie-les sur GitHub pour activer le contrôle.`);
    } catch (err) { toast(err.message, { kind: 'bad' }); }
  };
}

async function draw(out) {
  const r = state.report;
  let accepted = [];
  try { accepted = await call('sec:accepted', { target: r.target }); } catch { /* */ }
  const d = r.deps || { files: [], packages: 0, vulnerable: [] };
  const vulnRows = d.vulnerable.map((v) => `<tr>
      <td><b>${esc(v.name)}</b><small class="muted inline"> ${esc(v.version)}</small><div class="muted">${esc(v.eco)} · ${esc(v.file)}</div></td>
      <td>${sevChip(v.worst)}</td>
      <td>${v.vulns.slice(0, 3).map((x) => `<button type="button" class="link-btn small" data-external="${esc(x.url)}">${esc(x.cve || x.id)}</button>`).join(' ')}${v.vulns.length > 3 ? ` <small class="muted">+${v.vulns.length - 3}</small>` : ''}<div class="muted nxs-clamp">${esc(v.vulns[0].summary)}</div></td>
      <td>${v.fixed ? `<b>${esc(v.fixed)}</b>` : '<span class="muted">aucune</span>'}</td>
      <td>${v.command ? `<button type="button" class="nxs-cmd" data-copy-cmd="${esc(v.command)}" title="Copier la commande">${icon('copy', 11)}<code>${esc(v.command)}</code></button>` : ''}</td>
    </tr>`).join('');
  out.innerHTML = `
    <div class="sec-summary nxs-sum">${ring(r.score)}<div class="sec-sum-txt"><h2>${esc(baseName(r.dir || r.name))}<small class="muted"> · ${esc(ago(r.at))}</small></h2><div class="sec-counts">${counts(r.counts)}</div>
      <div class="sec-actions">${btn('Réanalyser', 'data-ca="re"', { ic: 'sync' })}${btn('Rapport PDF', 'data-ca="pdf"', { ic: 'download' })}${r.id ? btn('SARIF', 'data-ca="sarif"', { ic: 'code' }) : ''}</div></div></div>
    ${compareHtml(r.compare)}
    <div class="sup-kpis k5">
      ${kpi({ label: 'Dépendances', ic: 'layers', value: String(d.packages || 0), hint: d.files.length ? d.files.map((f) => f.file).slice(0, 2).join(', ') : 'aucun fichier verrouillé' })}
      ${kpi({ label: 'Vulnérables', ic: 'warn', value: String(d.vulnerable.length), tone: d.vulnerable.length ? 'bad' : 'good', hint: d.error ? 'vérification impossible' : 'base OSV' })}
      ${kpi({ label: 'Secrets dans le code', ic: 'key', value: String(r.secrets || 0), tone: r.secrets ? 'bad' : 'good', hint: `${r.files || 0} fichiers lus` })}
      ${kpi({ label: 'Dans l’historique Git', ic: 'code', value: r.git && r.git.git ? String(r.git.history || 0) : '—', tone: r.git && r.git.history ? 'warn' : '', hint: r.git && r.git.repo ? `${r.git.tracked || 0} fichiers suivis` : 'pas de dépôt Git' })}
      ${kpi({ label: '.env suivi par Git', ic: 'file', value: r.git && r.git.env && r.git.env.length ? 'Oui' : 'Non', tone: r.git && r.git.env && r.git.env.length ? 'bad' : 'good', hint: r.git && r.git.env && r.git.env.length ? r.git.env.slice(0, 2).join(', ') : 'rien à signaler' })}
    </div>
    ${d.vulnerable.length ? card('Dépendances à mettre à jour', `<div class="sup-table-wrap"><table class="sup-table"><thead><tr><th>Paquet</th><th>Gravité</th><th>Failles</th><th>Corrigé en</th><th>Commande</th></tr></thead><tbody>${vulnRows}</tbody></table></div>`, { sub: `${d.vulnerable.length} paquet(s) concerné(s) · un clic sur la commande la copie` }) : ''}
    ${card('Tous les constats', findingsHtml({ ...r, findings: r.findings.filter((f) => f.cat !== 'Dépendances') }, accepted), { sub: 'Secrets, Git et bonnes pratiques' })}
    ${devTools()}`;
  bindAccept(out, r, () => draw(out));
  bindTools(out);
  for (const b of out.querySelectorAll('[data-copy-cmd]')) b.onclick = () => copyText(b.dataset.copyCmd);
  for (const b of out.querySelectorAll('[data-ca]')) b.onclick = () => {
    if (b.dataset.ca === 're') run(out);
    else if (b.dataset.ca === 'pdf') saveReport(auditReportHtml(r, { accepted }), `Code ${r.name}`);
    else call('sec:sarif-save', { id: r.id }).then((p) => p && toast('Fichier SARIF enregistré.')).catch((err) => toast(err.message, { kind: 'bad' }));
  };
}

export function setDir(dir) { if (dir && dir !== state.dir) { state.dir = dir; state.report = null; } }
