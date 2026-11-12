// NEXORA #052 : explorateur de bases de données : SQLite, Postgres, Supabase ; tables, lignes, requêtes SQL,
// données de test. Réservé à l'offre Pro.
import { esc, ico, root, call, noProject, head, btn, iconBtn, pill, spinner, toast, has, proGate, confirmSheet, sheet, closeSheet, sheetHtml, fmtMs } from './ui.js';

const TYPES = { sqlite: ['SQLite', 'file'], postgres: ['Postgres', 'nxiDatabase'], supabase: ['Supabase', 'cloud'] };
const cell = (v) => (v === null || v === undefined ? '<i class="nxd-null">NULL</i>' : esc(typeof v === 'object' ? JSON.stringify(v) : String(v)).slice(0, 300));

export function mount(el) {
  const st = { list: null, detected: [], conn: null, tables: null, table: null, rows: null, offset: 0, sql: '', result: null, busy: false, view: 'rows' };
  const grid = (rows) => {
    if (!rows || !rows.length) return '<p class="nxd-muted">Aucune ligne.</p>';
    const cols = Object.keys(rows[0]);
    return `<div class="nxd-grid"><table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${cell(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  };
  const render = () => {
    if (!root()) { el.innerHTML = noProject(); return; }
    if (!has('devlab_pro')) { el.innerHTML = `${head('Bases de données', '')}${proGate('L’explorateur de bases de données', 'Parcourez les tables de SQLite, Postgres ou Supabase, lancez des requêtes et ajoutez des données de test.')}`; return; }
    const c = st.conn;
    const t = st.tables && st.table ? st.tables.find((x) => x.name === st.table) : null;
    const detected = st.detected.filter((d) => !(st.list || []).some((x) => x.type === d.type && (x.file || x.url) === (d.file || d.url)));
    let body;
    if (!c) {
      body = `${detected.map((d) => `<div class="nxd-note">${ico(TYPES[d.type][1], 16)}<div><b>${esc(d.name)}</b><p>${esc(d.file || d.url)} · repérée dans le projet</p></div>${btn('Ajouter', `data-detected="${esc(JSON.stringify(d))}"`, 'plus')}</div>`).join('')}`
        + (st.list ? (st.list.length ? `<div class="nxd-tiles">${st.list.map((x) => `<div class="nxd-tile-wrap"><button class="nxd-tile" data-conn="${esc(x.id)}" title="Ouvrir ${esc(x.name)}"><span class="nxd-tile-ic">${ico(TYPES[x.type][1], 20)}</span><b>${esc(x.name)}</b><small>${esc(TYPES[x.type][0])} · ${esc(x.file || x.url.replace(/:[^:@/]+@/, ':••••@'))}</small></button>${iconBtn('trash', `Retirer la connexion ${x.name}`, `data-del="${esc(x.id)}"`)}</div>`).join('')}</div>` : `<div class="nxd-empty">${ico('nxiDatabase', 26)}<b>Aucune connexion</b><p>Les mots de passe et clés sont chiffrés sur ce PC, jamais écrits dans le projet.</p></div>`) : spinner());
    } else {
      let main;
      if (st.view === 'sql') main = `<textarea class="input nxd-code nxd-sql" data-sql spellcheck="false" placeholder="select * from produits where prix > 10000">${esc(st.sql)}</textarea><div class="nxd-row">${btn(st.busy ? 'Exécution…' : 'Exécuter', `data-act="run" ${st.busy ? 'disabled' : ''}`, 'play', 'primary')}<small class="nxd-muted">Ctrl+Entrée</small></div>${st.result ? `<p class="nxd-muted">${st.result.changes != null ? `${st.result.changes} ligne(s) modifiée(s)` : `${st.result.total ?? st.result.rows.length} ligne(s)`} · ${fmtMs(st.result.ms)}</p>${grid(st.result.rows)}` : ''}`;
      else if (!t) main = '<p class="nxd-muted">Choisissez une table.</p>';
      else if (st.view === 'cols') main = `<div class="nxd-table">${t.columns.map((col) => `<div class="nxd-tr"><b>${esc(col.name)}</b><code>${esc(col.type || '')}</code>${col.pk ? pill('clé', 'ok') : ''}${col.nullable === false ? pill('obligatoire') : ''}</div>`).join('')}</div>`;
      else main = `<div class="nxd-row">${btn('Données de test…', 'data-act="seed"', 'sparkle')}<span class="grow"></span>${st.rows ? `<small class="nxd-muted">${st.rows.rows.length ? `${st.offset + 1}–${st.offset + st.rows.rows.length}` : '0'}${st.rows.total != null ? ` sur ${st.rows.total}` : ''}</small>${iconBtn('chevronLeft', 'Page précédente', `data-page="-1" ${st.offset ? '' : 'disabled'}`)}${iconBtn('chevronRight', 'Page suivante', `data-page="1" ${st.rows.total != null && st.offset + 100 >= st.rows.total ? 'disabled' : ''}`)}` : ''}</div>${st.rows ? grid(st.rows.rows) : spinner()}`;
      body = `<div class="nxd-db"><aside class="nxd-db-side">${st.tables ? st.tables.map((x) => `<button class="nxd-item ${x.name === st.table ? 'on' : ''}" data-table="${esc(x.name)}">${ico('nxTable', 13)}<span class="nxd-item-t">${esc(x.name)}</span>${x.count != null ? `<small>${x.count}</small>` : ''}</button>`).join('') || '<p class="nxd-muted">Aucune table.</p>' : spinner()}</aside>`
        + `<div class="nxd-db-main"><div class="seg nxd-seg nxd-subtabs">${[['rows', 'Lignes'], ['cols', 'Colonnes'], ['sql', 'Requête SQL']].map(([k, l]) => `<button class="${st.view === k ? 'on' : ''}" data-view="${k}">${l}</button>`).join('')}</div>${main}</div></div>`;
    }
    el.innerHTML = `${head('Bases de données', c ? `${esc(TYPES[c.type][0])} · ${esc(c.name)}` : 'Connectez la base du projet : fichier SQLite, adresse Postgres ou projet Supabase.', `${c ? btn('Connexions', 'data-act="back"', 'chevronLeft') : ''}${btn('Ajouter une connexion', 'data-act="add"', 'plus', c ? '' : 'primary')}`)}${body}`;
  };
  const load = async () => {
    if (!root() || !has('devlab_pro')) return render();
    try { const r = await call('devx:db-list', {}, { quiet: true }); st.list = r.items; st.detected = r.detected; } catch { st.list = []; }
    render();
  };
  const openTable = async (name) => {
    st.table = name; st.offset = 0; st.rows = null; render();
    try { st.rows = await call('devx:db-rows', { id: st.conn.id, table: name, limit: 100, offset: 0 }); } catch { st.rows = { rows: [] }; }
    render();
  };
  const openConn = async (id) => {
    st.conn = st.list.find((x) => x.id === id); st.tables = null; st.table = null; st.rows = null; st.result = null; st.view = 'rows'; render();
    try { st.tables = await call('devx:db-tables', { id }); if (st.tables[0]) await openTable(st.tables[0].name); } catch { st.tables = []; }
    render();
  };
  const addForm = (pre = {}) => {
    const fields = `<div class="seg nxd-seg" data-types>${Object.entries(TYPES).map(([k, [l]]) => `<button class="${(pre.type || 'sqlite') === k ? 'on' : ''}" data-type="${k}">${l}</button>`).join('')}</div>`
      + `<label class="field"><span>Nom</span><input class="input" data-name value="${esc(pre.name || '')}" placeholder="Base du projet"></label>`
      + `<label class="field" data-for="sqlite"><span>Fichier SQLite (chemin dans le projet)</span><input class="input" data-file value="${esc(pre.file || '')}" placeholder="data/app.db" spellcheck="false"></label>`
      + '<label class="field" data-for="postgres"><span>Adresse de connexion</span><input class="input" data-secret-pg placeholder="postgres://utilisateur:motdepasse@hôte:5432/base" spellcheck="false"><small>Vide : la variable protégée DATABASE_URL du projet est utilisée.</small></label>'
      + `<label class="field" data-for="supabase"><span>Adresse du projet</span><input class="input" data-url value="${esc(pre.type === 'supabase' ? pre.url || '' : '')}" placeholder="https://xxxx.supabase.co" spellcheck="false"></label>`
      + '<label class="field" data-for="supabase"><span>Clé du projet</span><input class="input" type="password" data-secret-sb placeholder="clé publique ou clé de service" spellcheck="false"><small>Vide : les variables protégées SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_ANON_KEY sont utilisées.</small></label>';
    const s = sheet('nxd-db', sheetHtml({ icon: 'nxiDatabase', title: 'Nouvelle connexion', sub: 'Mots de passe et clés chiffrés sur ce PC.', body: fields, go: 'Ajouter' }), {});
    let type = pre.type || 'sqlite';
    const sync = () => { for (const f of s.querySelectorAll('[data-for]')) f.hidden = f.dataset.for !== type; for (const b of s.querySelectorAll('[data-type]')) b.classList.toggle('on', b.dataset.type === type); };
    sync();
    s.onclick = async (e) => {
      const b = e.target.closest('[data-type]');
      if (b) { type = b.dataset.type; sync(); return; }
      if (!e.target.closest('[data-nx-go]')) return;
      const conn = { type, name: s.querySelector('[data-name]').value.trim() || TYPES[type][0], file: s.querySelector('[data-file]').value.trim(), url: type === 'supabase' ? s.querySelector('[data-url]').value.trim() : '', secret: type === 'postgres' ? s.querySelector('[data-secret-pg]').value.trim() : type === 'supabase' ? s.querySelector('[data-secret-sb]').value.trim() : '' };
      if (type === 'sqlite' && !conn.file) { toast('Indiquez le fichier SQLite.'); return; }
      if (type === 'supabase' && !/^https:\/\//.test(conn.url)) { toast('Indiquez l’adresse du projet (https://…).'); return; }
      try { st.list = await call('devx:db-save', { conn }); closeSheet('nxd-db'); render(); } catch { /* message affiché */ }
    };
  };
  const runSql = async () => {
    const ta = el.querySelector('[data-sql]');
    st.sql = ta ? ta.value : st.sql;
    if (!st.sql.trim() || st.busy) return;
    if (/^\s*(drop|delete|truncate|alter|update)\b/i.test(st.sql) && !await confirmSheet({ icon: 'warn', title: 'Cette requête modifie la base', sub: 'Les données supprimées ou modifiées ne pourront pas être récupérées par NEXORA.', go: 'Exécuter' })) return;
    st.busy = true; render();
    try { st.result = await call('devx:db-query', { id: st.conn.id, sql: st.sql }); if (st.result.changes != null) st.tables = await call('devx:db-tables', { id: st.conn.id }, { quiet: true }).catch(() => st.tables); } catch { st.result = null; }
    st.busy = false; render();
  };
  el.addEventListener('click', async (e) => {
    const t = e.target;
    const del = t.closest('[data-del]');
    if (del) { e.stopPropagation(); if (await confirmSheet({ icon: 'trash', title: 'Retirer cette connexion ?', sub: 'La base elle-même n’est pas touchée.', go: 'Retirer' })) { st.list = await call('devx:db-remove', { id: del.dataset.del }); render(); } return; }
    const c = t.closest('[data-conn]');
    if (c) return openConn(c.dataset.conn);
    const d = t.closest('[data-detected]');
    if (d) { const x = JSON.parse(d.dataset.detected); if (x.fromEnv) return addForm(x); st.list = await call('devx:db-save', { conn: x }).catch(() => st.list); render(); return; }
    if (t.closest('[data-act="add"]')) return addForm();
    if (t.closest('[data-act="back"]')) { st.conn = null; render(); return; }
    const tb = t.closest('[data-table]');
    if (tb) { st.view = st.view === 'sql' ? 'rows' : st.view; return openTable(tb.dataset.table); }
    const v = t.closest('[data-view]');
    if (v) { const ta = el.querySelector('[data-sql]'); if (ta) st.sql = ta.value; st.view = v.dataset.view; if (st.view === 'sql' && !st.sql && st.table) st.sql = `select * from ${st.table} limit 50`; render(); return; }
    if (t.closest('[data-act="run"]')) return runSql();
    const pg = t.closest('[data-page]');
    if (pg) { st.offset = Math.max(0, st.offset + 100 * +pg.dataset.page); st.rows = await call('devx:db-rows', { id: st.conn.id, table: st.table, limit: 100, offset: st.offset }).catch(() => st.rows); render(); return; }
    if (t.closest('[data-act="seed"]')) {
      const tbl = st.tables.find((x) => x.name === st.table);
      const s = sheet('nxd-seed', sheetHtml({ icon: 'sparkle', title: `Données de test dans ${st.table}`, sub: 'Valeurs plausibles d’après le nom et le type de chaque colonne (noms, e-mails, dates, prix…).', body: `<label class="field"><span>Nombre de lignes</span><input class="input" type="number" min="1" max="500" value="20" data-n></label><p class="nxd-muted">Colonnes remplies : ${tbl.columns.filter((x) => !/^(id|created_at|updated_at)$/.test(x.name)).map((x) => esc(x.name)).join(', ')}.</p>`, go: 'Ajouter' }), {});
      s.onclick = async (ev) => { if (!ev.target.closest('[data-nx-go]')) return; try { const r = await call('devx:db-seed', { id: st.conn.id, table: st.table, count: +s.querySelector('[data-n]').value }); closeSheet('nxd-seed'); toast(`${r.inserted} ligne(s) de test ajoutée(s).`); st.tables = await call('devx:db-tables', { id: st.conn.id }, { quiet: true }).catch(() => st.tables); await openTable(st.table); } catch { /* message affiché */ } };
    }
  });
  el.addEventListener('keydown', (e) => { if (e.target.matches('[data-sql]') && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runSql(); } });
  load();
  return { show: () => { if (!st.list) load(); else render(); } };
}
