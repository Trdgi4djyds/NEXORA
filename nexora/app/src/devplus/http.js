'use strict';
/* NEXORA #052 : client d'API intégré : requêtes envoyées par le processus principal (pas de blocage CORS),
 * collections par projet, import d'une description OpenAPI (JSON). */
const MAX = 2 * 1024 * 1024;

function substitute(s, vars) { return String(s ?? '').replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m)); }

async function send({ method = 'GET', url, headers = [], body = '', bodyType = 'json', timeout = 30000, vars = {} }) {
  const u = substitute(url, vars).trim();
  if (!/^https?:\/\//i.test(u)) throw new Error('Adresse invalide : elle doit commencer par http:// ou https://.');
  const h = {};
  for (const x of headers) if (x && x.key && x.on !== false) h[substitute(x.key, vars)] = substitute(x.value, vars);
  const init = { method, headers: h, redirect: 'follow', signal: AbortSignal.timeout(Math.max(1000, Math.min(120000, timeout))) };
  if (!['GET', 'HEAD'].includes(method) && body) {
    init.body = substitute(body, vars);
    if (!Object.keys(h).some((k) => k.toLowerCase() === 'content-type')) h['content-type'] = bodyType === 'json' ? 'application/json' : bodyType === 'form' ? 'application/x-www-form-urlencoded' : 'text/plain';
  }
  const t0 = Date.now();
  let r;
  try { r = await fetch(u, init); } catch (e) { throw new Error(e.name === 'TimeoutError' ? 'Pas de réponse dans le délai.' : `Requête impossible : ${e.cause ? e.cause.code || e.cause.message : e.message}`); }
  const ttfb = Date.now() - t0;
  const buf = Buffer.from(await r.arrayBuffer());
  const type = r.headers.get('content-type') || '';
  const text = /json|text|xml|html|javascript|csv|yaml/i.test(type) || !type ? buf.subarray(0, MAX).toString('utf8') : '';
  let json = null;
  if (/json/i.test(type) || /^\s*[[{]/.test(text)) { try { json = JSON.parse(text); } catch { /* pas du JSON */ } }
  return { status: r.status, statusText: r.statusText, ok: r.ok, url: r.url, ms: Date.now() - t0, ttfb, size: buf.length, truncated: buf.length > MAX, type, headers: [...r.headers.entries()], body: text, json, binary: !text && buf.length > 0 };
}

// Requêtes d'une description OpenAPI 3 / Swagger 2 (JSON).
function importOpenApi(text) {
  let spec;
  try { spec = JSON.parse(text); } catch { throw new Error('Description illisible : NEXORA lit le format JSON (convertis un fichier YAML en JSON).'); }
  if (!spec.paths) throw new Error('Ce fichier ne contient pas de chemins d’API (« paths »).');
  const base = spec.servers && spec.servers[0] ? spec.servers[0].url : spec.host ? `${(spec.schemes || ['https'])[0]}://${spec.host}${spec.basePath || ''}` : '{{baseUrl}}';
  const items = [];
  for (const [p, ops] of Object.entries(spec.paths)) {
    for (const [m, op] of Object.entries(ops)) {
      if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(m)) continue;
      const example = op.requestBody && op.requestBody.content && op.requestBody.content['application/json'];
      items.push({ name: op.summary || op.operationId || `${m.toUpperCase()} ${p}`, method: m.toUpperCase(), url: `{{baseUrl}}${p.replace(/\{([\w-]+)\}/g, '{{$1}}')}`, headers: [], body: example && example.example ? JSON.stringify(example.example, null, 2) : '', group: (op.tags && op.tags[0]) || 'API' });
    }
  }
  return { name: (spec.info && spec.info.title) || 'API importée', vars: { baseUrl: base.replace(/\/$/, '') }, items };
}

module.exports = { send, importOpenApi, substitute };
