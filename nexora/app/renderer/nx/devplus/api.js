// NEXORA #052 : client d'API intégré : requêtes rangées en collections par projet, variables {{nom}}, import
// OpenAPI (JSON), historique ; envoyées par NEXORA (pas de blocage CORS).
import { esc, ico, root, call, noProject, head, btn, iconBtn, pill, toast, prompt, fmtMs, fmtBytes, uid } from './api-ui.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const pretty = (r) => { if (r.json != null) { try { return JSON.stringify(r.json, null, 2); } catch { /* texte brut */ } } return r.body || ''; };
const hl = (s) => esc(s).replace(/("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?\b)/g, (m, str, colon, kw, num) => (str ? `<span class="${colon ? 'k' : 's'}">${str}</span>${colon || ''}` : kw ? `<span class="b">${kw}</span>` : `<span class="n">${num}</span>`));

export function mount(el, ctx) {
  const st = { data: null, sel: null, req: null, res: null, busy: false, tab: 'body', rtab: 'body' };
  let saveT = 0;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => call('devx:api-save', { data: st.data }, { quiet: true }).catch(() => {}), 500); };
  const items = () => (st.data ? st.data.collections.flatMap((c, ci) => c.items.map((it) => ({ ...it, ci }))) : []);
  const render = () => {
    if (!root()) { el.innerHTML = noProject(); return; }
    if (!st.data) { el.innerHTML = '<div class="nxd-loading"><span class="spin"></span>Chargement…</div>'; return; }
    const q = st.req;
    const r = st.res;
    const vars = st.data.vars || {};
    el.innerHTML = `${head('Client d’API', 'Testez vos routes sans quitter NEXORA. Variables : <code>{{baseUrl}}</code> et les autres définies ci-dessous.', `${btn('Importer OpenAPI', 'data-act="import"', 'download')}${btn('Nouvelle requête', 'data-act="new"', 'plus', 'primary')}<input type="file" accept=".json,application/json" data-file hidden>`)}
      <div class="nxd-api"><aside class="nxd-api-side">${st.data.collections.map((c, ci) => `<div class="nxd-group"><div class="nxd-group-h">${ico('folder', 13)}<b>${esc(c.name)}</b><small>${c.items.length}</small>${iconBtn('plus', 'Ajouter une requête ici', `data-add="${ci}"`)}</div>${c.items.map((it) => `<button class="nxd-req ${st.sel === it.id ? 'on' : ''}" data-sel="${esc(it.id)}"><em class="m-${it.method.toLowerCase()}">${it.method}</em><span>${esc(it.name)}</span></button>`).join('')}</div>`).join('')}
        ${st.data.history && st.data.history.length ? `<div class="nxd-group"><div class="nxd-group-h">${ico('nxHistory', 13)}<b>Historique</b></div>${st.data.history.slice(0, 8).map((h) => `<div class="nxd-hist"><em class="m-${h.method.toLowerCase()}">${h.method}</em><span title="${esc(h.url)}">${esc(h.url.replace(/^https?:\/\//, ''))}</span><small class="${h.status < 400 ? 'ok' : 'bad'}">${h.status || '×'}</small></div>`).join('')}</div>` : ''}</aside>
      <div class="nxd-api-main">${q ? `<div class="nxd-api-url"><select class="input nxd-sel" data-f="method">${METHODS.map((m) => `<option ${m === q.method ? 'selected' : ''}>${m}</option>`).join('')}</select><input class="input" data-f="url" value="${esc(q.url)}" placeholder="{{baseUrl}}/api/produits" spellcheck="false"><button class="btn primary" data-act="send" ${st.busy ? 'disabled' : ''}>${ico('nxSend', 14)}<span>${st.busy ? 'Envoi…' : 'Envoyer'}</span></button></div>
        <div class="nxd-row"><input class="input nxd-name" data-f="name" value="${esc(q.name)}" aria-label="Nom de la requête">${iconBtn('copy', 'Dupliquer', 'data-act="dup"')}${iconBtn('trash', 'Supprimer la requête', 'data-act="del"')}</div>
        <div class="seg nxd-seg nxd-subtabs">${[['body', 'Corps'], ['headers', `En-têtes (${(q.headers || []).filter((h) => h.key).length})`], ['vars', `Variables (${Object.keys(vars).length})`]].map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
        ${st.tab === 'body' ? `<textarea class="input nxd-code nxd-body-ta" data-f="body" spellcheck="false" placeholder='{ "exemple": true }'>${esc(q.body || '')}</textarea>` : st.tab === 'headers' ? `<div class="nxd-kv">${[...(q.headers || []), { key: '', value: '' }].map((h, i) => `<div class="nxd-row"><input class="input" data-h="${i}" data-hk value="${esc(h.key)}" placeholder="Authorization"><input class="input" data-h="${i}" data-hv value="${esc(h.value)}" placeholder="Bearer {{token}}"></div>`).join('')}</div>` : `<div class="nxd-kv">${[...Object.entries(vars), ['', '']].map(([k, v], i) => `<div class="nxd-row"><input class="input" data-v="${i}" data-vk value="${esc(k)}" placeholder="baseUrl"><input class="input" data-v="${i}" data-vv value="${esc(v)}" placeholder="http://localhost:5173"></div>`).join('')}${ctx.url() ? `<button class="nxd-link" data-act="use-url">Utiliser l’adresse du serveur lancé (${esc(ctx.url())})</button>` : ''}</div>`}
        <div class="nxd-resp">${r ? (r.error ? `<p class="nxd-note bad">${ico('error', 14)} ${esc(r.error)}</p>` : `<div class="nxd-row nxd-wrap">${pill(`${r.status} ${r.statusText}`, r.status < 300 ? 'ok' : r.status < 400 ? 'warn' : 'bad')}${pill(fmtMs(r.ms))}${pill(fmtBytes(r.size))}${r.truncated ? pill('réponse tronquée', 'warn') : ''}<span class="grow"></span><div class="seg nxd-seg">${[['body', 'Réponse'], ['headers', `En-têtes (${r.headers.length})`]].map(([k, l]) => `<button class="${st.rtab === k ? 'on' : ''}" data-rtab="${k}">${l}</button>`).join('')}</div>${iconBtn('copy', 'Copier la réponse', 'data-act="copy"')}</div>${st.rtab === 'body' ? `<pre class="nxd-json">${r.binary ? 'Réponse binaire.' : hl(pretty(r))}</pre>` : `<div class="nxd-table">${r.headers.map(([k, v]) => `<div class="nxd-tr"><code>${esc(k)}</code><span class="nxd-grow">${esc(v)}</span></div>`).join('')}</div>`}`) : `<p class="nxd-muted">${ico('info', 12)} La réponse s’affiche ici.</p>`}</div>` : `<div class="nxd-empty">${ico('globe', 26)}<b>Aucune requête choisie</b><p>Créez une requête ou importez la description OpenAPI de votre API.</p></div>`}</div></div>`;
  };
  const select = (id) => { const it = items().find((x) => x.id === id); st.sel = id; st.req = it ? st.data.collections[it.ci].items.find((x) => x.id === id) : null; st.res = null; render(); };
  const load = async () => {
    if (!root()) return render();
    try { st.data = await call('devx:api-load', {}, { quiet: true }); } catch { st.data = { collections: [], vars: {}, history: [] }; }
    st.data.collections = st.data.collections || [];
    st.data.vars = st.data.vars || {};
    if (!st.data.vars.baseUrl && ctx.url()) st.data.vars.baseUrl = ctx.url().replace(/\/$/, '');
    if (!st.data.collections.length) st.data.collections.push({ name: 'Mes requêtes', items: [] });
    const first = items()[0];
    if (first) select(first.id); else render();
  };
  const add = (ci = 0, base = {}) => { const it = { id: uid(), name: 'Nouvelle requête', method: 'GET', url: '{{baseUrl}}/', headers: [], body: '', ...base }; st.data.collections[ci].items.push(it); save(); select(it.id); };
  const send = async () => {
    if (!st.req || st.busy) return;
    st.busy = true; render();
    try {
      st.res = await call('devx:http', { method: st.req.method, url: st.req.url, headers: st.req.headers || [], body: st.req.body, vars: st.data.vars }, { quiet: true });
    } catch (e) { st.res = { error: e.message }; }
    st.data.history = [{ method: st.req.method, url: st.req.url, status: st.res.status || 0, at: Date.now() }, ...(st.data.history || [])].slice(0, 30);
    save(); st.busy = false; render();
  };
  el.addEventListener('click', async (e) => {
    const t = e.target;
    const s = t.closest('[data-sel]');
    if (s) return select(s.dataset.sel);
    const a = t.closest('[data-add]');
    if (a) return add(+a.dataset.add);
    if (t.closest('[data-act="new"]')) return add(0);
    if (t.closest('[data-act="send"]')) return send();
    const tb = t.closest('[data-tab]');
    if (tb) { st.tab = tb.dataset.tab; render(); return; }
    const rt = t.closest('[data-rtab]');
    if (rt) { st.rtab = rt.dataset.rtab; render(); return; }
    if (t.closest('[data-act="copy"]') && st.res) { navigator.clipboard.writeText(pretty(st.res)).then(() => toast('Réponse copiée.')).catch(() => {}); return; }
    if (t.closest('[data-act="use-url"]')) { st.data.vars.baseUrl = ctx.url().replace(/\/$/, ''); save(); render(); return; }
    if (t.closest('[data-act="dup"]') && st.req) { const it = items().find((x) => x.id === st.sel); add(it.ci, { ...JSON.parse(JSON.stringify(st.req)), id: uid(), name: `${st.req.name} (copie)` }); return; }
    if (t.closest('[data-act="del"]') && st.req) { for (const c of st.data.collections) c.items = c.items.filter((x) => x.id !== st.sel); st.sel = null; st.req = null; save(); const f = items()[0]; if (f) select(f.id); else render(); return; }
    if (t.closest('[data-act="import"]')) { el.querySelector('[data-file]').click(); }
  });
  el.addEventListener('change', async (e) => {
    if (e.target.matches('[data-file]')) {
      const f = e.target.files[0];
      if (!f) return;
      try { const r = await call('devx:api-import', { text: await f.text() }); st.data.collections.push({ name: r.name, items: r.items.map((it) => ({ ...it, id: uid() })) }); st.data.vars = { ...r.vars, ...st.data.vars }; save(); toast(`${r.items.length} requête(s) importée(s) dans « ${r.name} ».`); select(st.data.collections[st.data.collections.length - 1].items[0].id); } catch { /* message affiché */ }
      e.target.value = '';
    }
  });
  el.addEventListener('input', (e) => {
    const t = e.target;
    if (!st.req) return;
    if (t.dataset.f) { st.req[t.dataset.f] = t.value; save(); if (t.dataset.f === 'name' || t.dataset.f === 'method') { const b = el.querySelector(`[data-sel="${CSS.escape(st.sel)}"]`); if (b) b.innerHTML = `<em class="m-${st.req.method.toLowerCase()}">${st.req.method}</em><span>${esc(st.req.name)}</span>`; } return; }
    if (t.dataset.h !== undefined) { const hs = [...el.querySelectorAll('[data-hk]')].map((k, i) => ({ key: k.value, value: el.querySelectorAll('[data-hv]')[i].value })).filter((h) => h.key || h.value); st.req.headers = hs; save(); return; }
    if (t.dataset.v !== undefined) { const vs = {}; [...el.querySelectorAll('[data-vk]')].forEach((k, i) => { if (k.value.trim()) vs[k.value.trim()] = el.querySelectorAll('[data-vv]')[i].value; }); st.data.vars = vs; save(); }
  });
  el.addEventListener('change', (e) => { if (e.target.dataset.f === 'method') render(); if (e.target.dataset.h !== undefined || e.target.dataset.v !== undefined) render(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.target.dataset.f === 'url')) { e.preventDefault(); send(); } });
  load();
  return { show: () => render() };
}
