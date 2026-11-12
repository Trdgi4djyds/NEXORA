// NEXORA #052 : scripts du projet en boutons, sortie en direct, adresse du serveur repérée, erreurs cliquables.
import { api, esc, ico, root, call, openFile, noProject, head, btn, iconBtn, pill, plain, toast, prompt, fmtMs } from './ui.js';

const LOC = /((?:[A-Za-z]:)?[\w@~.\\/-]*\.(?:[cm]?[jt]sx?|vue|svelte|astro|css|scss|html|py|php|go|rs|dart|json))(?::|\()(\d+)(?:[:,](\d+))?\)?/g;

export function mount(el, ctx) {
  const st = { list: null, pm: '', runs: new Map(), active: null };
  const linkify = (t) => esc(t).replace(LOC, (m, f, l, c) => `<a href="#" data-loc="${esc(f)}" data-line="${l}" data-col="${c || 1}">${m}</a>`);
  const running = () => [...st.runs.values()].filter((r) => r.alive).length;
  const render = () => {
    if (!root()) { el.innerHTML = noProject(); return; }
    ctx.setBadge('scripts', running());
    const run = st.runs.get(st.active);
    el.innerHTML = `${head('Scripts', st.list ? `${st.list.length} script(s) · gestionnaire ${esc(st.pm)}` : 'Lecture du projet…', `${btn('Commande…', 'data-act="custom"', 'terminal')}${iconBtn('refreshCw', 'Relire les scripts', 'data-act="reload"')}`)}
      <div class="nxd-split"><div class="nxd-tasks">${st.list && !st.list.length ? '<p class="nxd-muted">Aucun script dans package.json, composer.json, deno.json ni Makefile.</p>' : ''}${(st.list || []).map((t) => { const r = [...st.runs.values()].find((x) => x.task.id === t.id && x.alive); return `<div class="nxd-task ${r ? 'on' : ''}"><span class="nxd-task-ic">${ico(t.icon || 'terminal', 15)}</span><div><b>${esc(t.name)}</b><small title="${esc(t.detail)}">${esc(t.detail)}</small></div>${r ? `${r.url ? pill('en ligne', 'ok') : pill('en cours', 'warn')}${iconBtn('stop', `Arrêter ${t.name}`, `data-stop="${r.id}"`)}` : iconBtn('play', `Lancer ${t.name}`, `data-run="${esc(t.id)}"`)}</div>`; }).join('')}</div>
      <div class="nxd-out">${run ? `<div class="nxd-out-h"><b>${esc(run.task.name)}</b>${run.alive ? pill('en cours', 'warn') : pill(run.code === 0 ? `terminé · ${fmtMs(run.ms)}` : `arrêté (code ${run.code})`, run.code === 0 ? 'ok' : 'bad')}${run.url ? `<a href="#" data-url="${esc(run.url)}">${esc(run.url)}</a>${btn('Sur les appareils', `data-devices="${esc(run.url)}"`, 'phone')}${btn('Contrôler', `data-checks="${esc(run.url)}"`, 'shield')}` : ''}<span class="grow"></span>${[...st.runs.values()].length > 1 ? `<select class="input nxd-sel" data-act="pick">${[...st.runs.values()].map((r) => `<option value="${r.id}" ${r.id === run.id ? 'selected' : ''}>${esc(r.task.name)}${r.alive ? ' (en cours)' : ''}</option>`).join('')}</select>` : ''}</div><pre class="nxd-console" data-console>${linkify(run.out)}</pre>` : `<div class="nxd-empty">${ico('terminal', 24)}<b>Aucun script lancé</b><p>Lancez un script : sa sortie s’affiche ici, l’adresse du serveur est repérée et les erreurs ouvrent le bon fichier.</p></div>`}</div></div>`;
    const con = el.querySelector('[data-console]');
    if (con) con.scrollTop = con.scrollHeight;
  };
  const load = async () => {
    if (!root()) { render(); return; }
    try { const r = await call('devx:tasks', {}, { quiet: true }); st.list = r.tasks; st.pm = r.pm; for (const x of r.running) if (!st.runs.has(x.id)) st.runs.set(x.id, { id: x.id, task: x.task, alive: true, url: x.url, out: '' }); } catch { st.list = []; }
    render();
  };
  const start = async (task) => {
    try { const r = await call('devx:task-start', { task }); st.runs.set(r.id, { id: r.id, task: r.task, alive: true, out: '', url: null }); st.active = r.id; render(); } catch { /* message affiché */ }
  };
  api.on('devx:task', (m) => {
    if (!el.isConnected) return;
    const r = st.runs.get(m.id);
    if (!r) return;
    if (m.type === 'data') {
      r.out = (r.out + plain(m.text)).slice(-120000);
      if (st.active === m.id) { const con = el.querySelector('[data-console]'); if (con) { const atEnd = con.scrollTop + con.clientHeight >= con.scrollHeight - 30; con.innerHTML = linkify(r.out); if (atEnd) con.scrollTop = con.scrollHeight; return; } }
    } else if (m.type === 'url') { r.url = m.url; ctx.setUrl(m.url); toast(`« ${r.task.name} » est en ligne sur ${m.url}`); } else if (m.type === 'exit') { r.alive = false; r.code = m.code; r.ms = m.ms; } else if (m.type === 'problems') ctx.bus.dispatchEvent(new CustomEvent('task-problems', { detail: m.items.map((i) => ({ ...i, message: m.text })) }));
    render();
  });
  el.addEventListener('click', async (e) => {
    const t = e.target;
    const loc = t.closest('[data-loc]');
    if (loc) { e.preventDefault(); const r = await call('devx:locate', { text: `${loc.dataset.loc}:${loc.dataset.line}:${loc.dataset.col}` }, { quiet: true }).catch(() => []); if (r[0]) openFile(r[0].file, r[0].line, r[0].col); else toast('Fichier introuvable dans le projet.'); return; }
    const run = t.closest('[data-run]');
    if (run) { start({ id: run.dataset.run }); return; }
    const stop = t.closest('[data-stop]');
    if (stop) { call('devx:task-stop', { id: stop.dataset.stop }); return; }
    const u = t.closest('[data-url]');
    if (u) { e.preventDefault(); window.open(u.dataset.url, '_blank'); return; }
    const dv = t.closest('[data-devices]');
    if (dv) { (await import('./apps.js')).showOnDevices(dv.dataset.devices); return; }
    const ck = t.closest('[data-checks]');
    if (ck) { ctx.setUrl(ck.dataset.checks); ctx.open('checks', { url: ck.dataset.checks }); return; }
    if (t.closest('[data-act="reload"]')) { load(); return; }
    if (t.closest('[data-act="custom"]')) { const c = await prompt('Lancer une commande', { label: 'Commande lancée dans le dossier du projet, avec ses variables protégées', placeholder: 'npm run dev -- --port 5174', icon: 'terminal', go: 'Lancer' }); if (c && c.trim()) start({ command: c.trim(), name: c.trim() }); }
  });
  el.addEventListener('change', (e) => { if (e.target.matches('[data-act="pick"]')) { st.active = e.target.value; render(); } });
  load();
  return { show: () => render(), start };
}
