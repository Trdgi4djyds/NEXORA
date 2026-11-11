// NEXORA #053 : création en série : un modèle (textes avec {{colonne}}, images nommées @colonne) et un fichier
// CSV donnent une page par ligne, ou une archive ZIP d'images.
import { esc, ico, uid, busy, toast, btn, readText, saveBytes, zip, dataUrlBytes, slug, pl } from './ui.js';
import { parseCsv, fill } from './pure.js';

export { parseCsv, fill };

const done = (t) => { if (!t) return; if (t.close) t.close(); else if (t.remove) t.remove(); };
export function placeholders(D) {
  const out = new Set();
  const visit = (list) => { for (const o of list || []) { if (typeof o.text === 'string') for (const m of o.text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) out.add(m[1]); if (/image/i.test(o.type || '') && String(o.name || '').startsWith('@')) out.add(o.name.slice(1)); if (o.objects) visit(o.objects); } };
  visit(D.pageJson().objects);
  return [...out];
}
export function panel(D, st) {
  const ph = placeholders(D);
  const d = st.data;
  const missing = d ? ph.filter((p) => !d.head.includes(p)) : [];
  return `<p class="dzx-hint">1. Dans la page modèle, écris <code>{{nom}}</code>, <code>{{prix}}</code>… dans les textes, et nomme <code>@photo</code> une image à remplacer (adresse web de l’image dans le tableau).<br>2. Choisis un fichier CSV (exporté d’un tableur) dont la première ligne porte les noms des colonnes.</p>
    <p class="dzx-hint">Champs trouvés dans cette page : ${ph.length ? ph.map((p) => `<code>${esc(p)}</code>`).join(' ') : '<i>aucun pour l’instant</i>'}</p>
    <div class="nx-btns">${btn('bulk-csv', 'file', d ? `${d.name || 'Tableau'} · ${pl(d.rows.length, 'ligne', 'lignes')}` : 'Choisir le fichier CSV', '', d ? '' : 'primary')}</div>
    ${d ? `${missing.length ? `<p class="dzx-hint bad">${ico('warn', 12)} Colonnes absentes du tableau : ${missing.map((m) => `<code>${esc(m)}</code>`).join(' ')}</p>` : ''}
      <div class="dzp-table"><table><thead><tr>${d.head.slice(0, 5).map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${d.rows.slice(0, 4).map((r) => `<tr>${d.head.slice(0, 5).map((h) => `<td>${esc(String(r[h]).slice(0, 30))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="nx-btns">${btn('bulk-pages', 'layers', `Créer ${pl(Math.min(500, d.rows.length), 'page', 'pages')}`, '', 'primary')}${btn('bulk-zip', 'nxZip', 'Exporter en images (ZIP)')}</div>` : ''}`;
}
export function makePages(D, rows) {
  D.capturePage();
  const src = D.page;
  const json = D.pageJson();
  const key = Object.keys(rows[0] || {})[0];
  return rows.slice(0, 500).map((r, i) => ({ id: uid(), name: `${src.name} · ${(key && r[key]) || i + 1}`.slice(0, 80), w: src.w, h: src.h, bg: src.bg, json: fill(json, r) }));
}
export async function onPanel(D, e, rerender, st) {
  const b = e.target.closest('[data-dzx]');
  if (!b) return false;
  const a = b.dataset.dzx;
  if (a === 'bulk-csv') { const f = await readText(['csv', 'txt', 'tsv'], 'Tableau CSV'); if (f) { st.data = { ...parseCsv(f.text), name: f.name.split(/[\\/]/).pop() }; if (!st.data.rows.length) toast('Ce fichier ne contient aucune ligne de données.', { kind: 'bad' }); } rerender(); return true; }
  if (!st.data || !st.data.rows.length) return false;
  if (a === 'bulk-pages') {
    const pages = makePages(D, st.data.rows);
    D.doc.pages.splice(D.pageIdx + 1, 0, ...pages);
    await D.openPage(D.pageIdx + 1, { save: false });
    D.save(); if (D.renderLeft) D.renderLeft();
    toast(`${pl(pages.length, 'page créée', 'pages créées')} après le modèle.`);
    return true;
  }
  if (a === 'bulk-zip') {
    const pages = makePages(D, st.data.rows);
    const t = busy(`Export de ${pl(pages.length, 'image', 'images')}…`);
    const cur = D.pageIdx;
    const files = [];
    const at = D.doc.pages.length;
    try {
      D.doc.pages.push(...pages);
      for (let i = 0; i < pages.length; i += 1) {
        await D.openPage(at + i, { save: false });
        const c = await D.exportCanvas(2, false);
        files.push({ name: `${String(i + 1).padStart(3, '0')}-${slug(pages[i].name.split('·').pop())}.png`, data: dataUrlBytes(c.toDataURL('image/png')) });
      }
    } finally { D.doc.pages.splice(at, pages.length); await D.openPage(cur, { save: false }); done(t); }
    await saveBytes(zip(files), { name: `${D.doc.name || 'serie'} (série)`, ext: 'zip', kind: 'document', project: D.doc.name || 'NEXORA' });
    return true;
  }
  return false;
}
