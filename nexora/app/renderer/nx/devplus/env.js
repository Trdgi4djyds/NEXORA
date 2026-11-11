// NEXORA #052 : variables d'environnement protégées du projet (chiffrées par Windows, jamais dans le projet),
// .env.example généré, import et export du .env.
import { esc, ico, root, call, noProject, head, btn, iconBtn, pill, toast, confirmSheet, sheet, closeSheet, sheetHtml, openFile } from './ui.js';

export function mount(el, ctx) {
  const st = { data: null, shown: new Map(), findings: null };
  const render = () => {
    if (!root()) { el.innerHTML = noProject(); return; }
    const d = st.data;
    el.innerHTML = `${head('Variables protégées', d ? (d.encrypted ? `${ico('lock', 12)} Chiffrées par Windows sur ce PC, gardées hors du projet : elles ne partent jamais sur un dépôt.` : 'Le chiffrement du système n’est pas disponible sur ce PC : les valeurs sont gardées hors du projet, sans chiffrement.') : '', `${btn('Ajouter', 'data-act="add"', 'plus', 'primary')}${btn('Importer un .env', 'data-act="import"', 'download')}${btn('Générer .env.example', 'data-act="example"', 'file')}${btn('Écrire le .env', 'data-act="export"', 'upload')}`)}
      ${st.findings && st.findings.length ? `<div class="nxd-note bad">${ico('shield', 16)}<div><b>${st.findings.length} secret(s) repéré(s) dans les fichiers modifiés</b><p>Déplace chaque valeur ici, puis lis-la dans le code avec la variable (par exemple <code>process.env.MA_CLE</code> ou <code>import.meta.env.VITE_MA_CLE</code>).</p><ul class="nxd-findings">${st.findings.slice(0, 8).map((f) => `<li><button class="nxd-link" data-open="${esc(f.file)}" data-line="${f.line}">${esc(f.file)}:${f.line}</button> · ${esc(f.rule)}</li>`).join('')}</ul></div></div>` : ''}
      ${d && d.dotenv.length ? `<p class="nxd-muted">${ico('info', 12)} Fichiers trouvés dans le projet : ${d.dotenv.map((f) => `<code>${esc(f)}</code>`).join(', ')}. « Importer un .env » les range ici.</p>` : ''}
      ${d && !d.vars.length ? `<div class="nxd-empty">${ico('key', 26)}<b>Aucune variable</b><p>Ajoute tes clés d’API, adresses de base de données et jetons : NEXORA les donne aux scripts, aux tests, au débogueur et à la mise en ligne.</p></div>` : ''}
      <div class="nxd-table">${(d ? d.vars : []).map((v) => `<div class="nxd-tr"><code class="nxd-key">${esc(v.key)}</code><span class="nxd-val ${v.secret ? 'secret' : ''}">${esc(st.shown.has(v.key) ? st.shown.get(v.key) : v.secret ? v.preview : v.value)}</span>${v.secret ? pill('secret', 'warn') : pill('publique')}${v.secret ? iconBtn(st.shown.has(v.key) ? 'eyeOff' : 'eye', st.shown.has(v.key) ? 'Masquer' : 'Afficher la valeur', `data-reveal="${esc(v.key)}"`) : ''}${iconBtn('pen', 'Modifier', `data-edit="${esc(v.key)}"`)}${iconBtn('trash', 'Supprimer', `data-del="${esc(v.key)}"`)}</div>`).join('')}</div>`;
  };
  const load = async () => { if (!root()) { render(); return; } try { st.data = await call('devx:env-list', {}, { quiet: true }); } catch { st.data = { vars: [], dotenv: [], encrypted: false }; } render(); };
  const edit = (v = {}) => {
    const s = sheet('nxd-env', sheetHtml({ icon: 'key', title: v.key ? `Modifier ${v.key}` : 'Nouvelle variable', sub: 'Disponible dans les scripts, les tests, le débogueur et la mise en ligne de ce projet.', body: `<label class="field"><span>Nom</span><input class="input" data-k value="${esc(v.key || '')}" placeholder="API_KEY" spellcheck="false" ${v.key ? 'readonly' : 'data-autofocus'}></label><label class="field"><span>Valeur</span><textarea class="input nx-ta" data-v rows="3" spellcheck="false" placeholder="${v.key ? 'Laisse vide pour garder la valeur actuelle' : ''}" ${v.key ? 'data-autofocus' : ''}>${esc(v.secret ? '' : v.value || '')}</textarea></label><label class="nxd-check"><input type="checkbox" data-s ${v.secret !== false ? 'checked' : ''}> Valeur secrète (masquée, jamais écrite dans .env.example)</label>`, go: 'Enregistrer' }), {});
    s.onclick = async (e) => {
      if (!e.target.closest('[data-nx-go]')) return;
      const key = s.querySelector('[data-k]').value.trim();
      let value = s.querySelector('[data-v]').value;
      if (v.key && !value && v.secret) { try { value = await call('devx:env-reveal', { key: v.key }); } catch { return; } }
      try { st.data = await call('devx:env-set', { key, value, secret: s.querySelector('[data-s]').checked }); closeSheet('nxd-env'); st.shown.delete(key); render(); toast(`${key} est enregistrée.`); } catch { /* message affiché */ }
    };
  };
  el.addEventListener('click', async (e) => {
    const t = e.target;
    const o = t.closest('[data-open]');
    if (o) return openFile(o.dataset.open, +o.dataset.line);
    if (t.closest('[data-act="add"]')) return edit();
    const ed = t.closest('[data-edit]');
    if (ed) return edit(st.data.vars.find((v) => v.key === ed.dataset.edit));
    const rv = t.closest('[data-reveal]');
    if (rv) { const k = rv.dataset.reveal; if (st.shown.has(k)) st.shown.delete(k); else { try { st.shown.set(k, await call('devx:env-reveal', { key: k })); } catch { return; } } render(); return; }
    const del = t.closest('[data-del]');
    if (del && await confirmSheet({ icon: 'trash', title: `Supprimer ${del.dataset.del} ?`, sub: 'Les scripts du projet ne la recevront plus.', go: 'Supprimer' })) { st.data = await call('devx:env-remove', { key: del.dataset.del }); render(); return; }
    if (t.closest('[data-act="import"]')) { const f = st.data && st.data.dotenv[0]; if (!f) { toast('Aucun fichier .env dans le projet.'); return; } try { const r = await call('devx:env-import', { file: f }); st.data = r; render(); toast(`${r.imported} variable(s) importée(s) depuis ${f}. Tu peux maintenant supprimer ce fichier du projet.`); } catch { /* message affiché */ } return; }
    if (t.closest('[data-act="example"]')) { try { const r = await call('devx:env-example'); toast(`.env.example écrit avec ${r.count} nom(s), sans aucune valeur secrète.`); openFile('.env.example'); } catch { /* message affiché */ } return; }
    if (t.closest('[data-act="export"]') && await confirmSheet({ icon: 'warn', title: 'Écrire les valeurs dans .env ?', sub: 'Certains outils ne lisent que ce fichier. Les valeurs y seront en clair ; NEXORA l’ajoute au .gitignore pour qu’il ne parte pas sur le dépôt.', go: 'Écrire le .env' })) { try { const r = await call('devx:env-export'); toast(`.env écrit (${r.count} variable(s))${r.gitignoreUpdated ? ', et ajouté au .gitignore' : ''}.`); } catch { /* message affiché */ } }
  });
  load();
  return { show: (opts = {}) => { if (opts.findings) { st.findings = opts.findings; render(); } } };
}
