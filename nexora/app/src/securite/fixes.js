'use strict';
/* NEXORA #048 — Correctifs écrits pour de vrai : à partir des constats d'un audit, NEXORA produit le fichier de
 * configuration de l'hébergeur (Cloudflare Pages ou Netlify « _headers », netlify.toml, vercel.json,
 * firebase.json, nginx, Apache .htaccess, intergiciel Express) et l'écrit dans le dossier du projet. Une copie
 * « .avant-nexora » de chaque fichier existant est gardée ; les blocs ajoutés sont délimités et remplacés au
 * passage suivant, sans toucher au reste du fichier. */
const fs = require('fs');
const path = require('path');

const TARGETS = {
  cloudflare: { label: 'Cloudflare Pages', file: '_headers', hint: 'À placer dans le dossier publié (public/ ou dist/).' },
  netlify: { label: 'Netlify', file: 'netlify.toml', hint: 'À la racine du projet.' },
  vercel: { label: 'Vercel', file: 'vercel.json', hint: 'À la racine du projet.' },
  firebase: { label: 'Firebase Hosting', file: 'firebase.json', hint: 'À la racine du projet.' },
  nginx: { label: 'nginx', file: 'nexora-securite.conf', hint: 'À inclure dans le bloc « server » de ton site : include /chemin/nexora-securite.conf;' },
  apache: { label: 'Apache ou LiteSpeed (.htaccess)', file: '.htaccess', hint: 'À la racine publique du site.' },
  express: { label: 'Node.js (Express)', file: 'nexora-securite.js', hint: 'Dans ton serveur : app.use(require(\'./nexora-securite\'));' },
  meta: { label: 'Hébergement sans en-têtes (GitHub Pages…)', file: 'nexora-securite.html', hint: 'Balises à copier dans le <head> de chaque page.' },
};

// Hébergeur probable d'après les en-têtes de la réponse.
function detect(headers = {}) {
  const h = {};
  for (const [k, v] of Object.entries(headers || {})) h[k.toLowerCase()] = String(v || '');
  const server = (h.server || '').toLowerCase();
  if (h['x-vercel-id'] || server.includes('vercel')) return 'vercel';
  if (h['x-nf-request-id'] || server.includes('netlify')) return 'netlify';
  if (h['x-github-request-id'] || server.includes('github.com')) return 'meta';
  if (h['x-firebase-hosting'] || (server.includes('google frontend') && h['x-served-by'])) return 'firebase';
  if (h['cf-ray'] || server.includes('cloudflare')) return 'cloudflare';
  if (/express/i.test(h['x-powered-by'] || '')) return 'express';
  if (server.includes('nginx') || server.includes('openresty')) return 'nginx';
  if (server.includes('apache') || server.includes('litespeed')) return 'apache';
  return 'nginx';
}

// En-têtes recommandés d'après les constats (titres de src/security.js).
function plan(report, { csp = '' } = {}) {
  const titles = (report && report.findings ? report.findings : []).map((f) => `${f.cat}|${f.title}`).join('\n');
  const has = (re) => re.test(titles);
  const headers = [];
  const https = report ? report.https !== false : true;
  if (https && has(/HSTS/)) headers.push(['Strict-Transport-Security', 'max-age=31536000; includeSubDomains']);
  if (has(/X-Content-Type-Options/)) headers.push(['X-Content-Type-Options', 'nosniff']);
  if (has(/Referrer-Policy/)) headers.push(['Referrer-Policy', 'strict-origin-when-cross-origin']);
  if (has(/Permissions-Policy/)) headers.push(['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()']);
  if (has(/cadrage|X-Frame-Options/)) headers.push(['X-Frame-Options', 'SAMEORIGIN']);
  const needCsp = has(/Content-Security-Policy absente|CSP avec/) || Boolean(csp);
  if (needCsp) {
    const value = csp || "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' https:; font-src 'self' data: https:; connect-src 'self' https:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'";
    headers.push([csp && !/report-only/i.test(csp) ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', value]);
  }
  return {
    headers,
    hideVersion: has(/Version du serveur|X-Powered-By|Technologie révélée/),
    blockDotfiles: has(/Fichiers exposés\|.*(\.git|\.env|accessible)/),
    noIndexes: has(/Listing de répertoire/),
    noTrace: has(/TRACE/),
    forceHttps: has(/reste accessible en HTTP|Site en HTTP|Redirection HTTP/),
    cookies: has(/^Cookies\|/m),
    sourceMaps: has(/Source maps/),
  };
}

const BEGIN = 'NEXORA sécurité : début (bloc géré par NEXORA, remplacé à chaque correction)';
const END = 'NEXORA sécurité : fin';

function generate(report, target, { csp = '' } = {}) {
  const t = TARGETS[target] ? target : detect(report && report.headers);
  const p = plan(report, { csp });
  const H = p.headers;
  const notes = [];
  let content = '';
  let merge = 'markers';
  if (t === 'cloudflare') {
    content = ['/*', ...H.map(([k, v]) => `  ${k}: ${v}`)].join('\n');
    if (p.forceHttps) notes.push('Redirection vers HTTPS : active « Always Use HTTPS » dans Cloudflare (SSL/TLS → Edge Certificates).');
    if (p.blockDotfiles || p.sourceMaps) notes.push('Ne publie pas les fichiers .env, .git ni les fichiers .map : retire-les du dossier publié.');
  } else if (t === 'netlify') {
    content = ['[[headers]]', '  for = "/*"', '  [headers.values]', ...H.map(([k, v]) => `    ${k} = ${JSON.stringify(v)}`)].join('\n');
    if (p.blockDotfiles) content += '\n\n[[redirects]]\n  from = "/.env"\n  to = "/404"\n  status = 404\n  force = true\n\n[[redirects]]\n  from = "/.git/*"\n  to = "/404"\n  status = 404\n  force = true';
    if (p.forceHttps) notes.push('Netlify redirige déjà vers HTTPS quand un certificat est actif (Domain management → HTTPS).');
  } else if (t === 'vercel') {
    merge = 'json';
    content = JSON.stringify({ headers: [{ source: '/(.*)', headers: H.map(([key, value]) => ({ key, value })) }] }, null, 2);
    if (p.blockDotfiles) notes.push('Vercel ne publie pas les fichiers .env ; vérifie qu’aucun fichier .git ou .env n’est dans le dossier publié (public/).');
  } else if (t === 'firebase') {
    merge = 'json';
    content = JSON.stringify({ hosting: { headers: [{ source: '**', headers: H.map(([key, value]) => ({ key, value })) }] } }, null, 2);
  } else if (t === 'nginx') {
    merge = 'replace';
    const L = [`# ${BEGIN}`, '# À inclure dans le bloc server { … } du site (include …/nexora-securite.conf;).'];
    for (const [k, v] of H) L.push(`add_header ${k} "${v.replace(/"/g, '\\"')}" always;`);
    if (p.hideVersion) L.push('server_tokens off;', 'proxy_hide_header X-Powered-By;', 'fastcgi_hide_header X-Powered-By;');
    if (p.blockDotfiles) L.push('location ~ /\\.(?!well-known) { deny all; return 404; }');
    if (p.sourceMaps) L.push('location ~* \\.map$ { deny all; return 404; }');
    if (p.noIndexes) L.push('autoindex off;');
    if (p.noTrace) L.push('if ($request_method !~ ^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$) { return 405; }');
    if (p.cookies) L.push('proxy_cookie_flags ~ secure httponly samesite=lax;');
    L.push(`# ${END}`);
    content = L.join('\n');
    if (p.forceHttps) notes.push('Redirection HTTPS : dans le bloc « listen 80 », ajoute « return 301 https://$host$request_uri; ».');
  } else if (t === 'apache') {
    const L = ['<IfModule mod_headers.c>', ...H.map(([k, v]) => `  Header always set ${k} "${v.replace(/"/g, '\\"')}"`)];
    if (p.hideVersion) L.push('  Header unset X-Powered-By', '  Header always unset X-Powered-By');
    if (p.cookies) L.push('  Header always edit Set-Cookie ^(.*)$ "$1; HttpOnly; Secure; SameSite=Lax"');
    L.push('</IfModule>');
    if (p.noIndexes) L.push('Options -Indexes');
    if (p.blockDotfiles) L.push('<IfModule mod_alias.c>', '  RedirectMatch 404 /\\.(?!well-known)', '</IfModule>');
    if (p.sourceMaps) L.push('<FilesMatch "\\.map$">', '  Require all denied', '</FilesMatch>');
    if (p.forceHttps) L.push('<IfModule mod_rewrite.c>', '  RewriteEngine On', '  RewriteCond %{HTTPS} off', '  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]', '</IfModule>');
    content = L.join('\n');
    if (p.noTrace) notes.push('Méthode TRACE : ajoute « TraceEnable Off » dans la configuration du serveur (pas dans .htaccess).');
    if (p.hideVersion) notes.push('Version d’Apache : « ServerTokens Prod » et « ServerSignature Off » dans la configuration du serveur.');
  } else if (t === 'express') {
    merge = 'replace';
    content = [
      `// ${BEGIN}`,
      '// Intergiciel Express : app.use(require(\'./nexora-securite\')); placé avant tes routes.',
      `const HEADERS = ${JSON.stringify(Object.fromEntries(H), null, 2)};`,
      'module.exports = function nexoraSecurite(req, res, next) {',
      p.hideVersion ? "  res.removeHeader('X-Powered-By');" : '',
      p.noTrace ? "  if (req.method === 'TRACE' || req.method === 'TRACK') return res.status(405).end();" : '',
      p.blockDotfiles ? "  if (/\\/\\.(?!well-known)/.test(req.path)) return res.status(404).end();" : '',
      p.sourceMaps ? "  if (/\\.map$/.test(req.path)) return res.status(404).end();" : '',
      p.forceHttps ? "  if (req.headers['x-forwarded-proto'] === 'http') return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);" : '',
      '  for (const [k, v] of Object.entries(HEADERS)) res.setHeader(k, v);',
      '  next();',
      '};',
      `// ${END}`,
    ].filter(Boolean).join('\n');
    if (p.hideVersion) notes.push('Ajoute aussi app.disable(\'x-powered-by\') après la création de l’application.');
    if (p.cookies) notes.push('Cookies : { secure: true, httpOnly: true, sameSite: \'lax\' } dans les options de ta session (express-session, cookie-session…).');
  } else {
    merge = 'replace';
    const meta = H.filter(([k]) => /^Content-Security-Policy$|^Referrer-Policy$/.test(k));
    content = [`<!-- ${BEGIN} -->`, ...meta.map(([k, v]) => (k === 'Referrer-Policy' ? `<meta name="referrer" content="${v}">` : `<meta http-equiv="${k}" content="${v.replace(/frame-ancestors[^;]*;?\s*/, '')}">`)), `<!-- ${END} -->`].join('\n');
    notes.push('Cet hébergeur ne permet pas de régler les en-têtes HTTP : seules la CSP (sans frame-ancestors) et la politique de référent passent par des balises <meta>. Pour le reste, passe par un service intermédiaire (Cloudflare) ou un autre hébergeur.');
  }
  if (!H.length && !p.hideVersion && !p.blockDotfiles && !p.noIndexes && !p.noTrace && !p.forceHttps) notes.unshift('Aucun en-tête à corriger d’après cet audit.');
  return { target: t, label: TARGETS[t].label, hint: TARGETS[t].hint, files: [{ path: TARGETS[t].file, content, merge }], notes, headers: H };
}

function comment(file) {
  if (/\.html$/.test(file)) return ['<!-- ', ' -->'];
  if (/\.js$/.test(file)) return ['// ', ''];
  return ['# ', ''];
}

function mergeMarkers(existing, block, file) {
  const [a, b] = comment(file);
  const start = `${a}${BEGIN}${b}`;
  const end = `${a}${END}${b}`;
  const wrapped = block.includes(BEGIN) ? block : `${start}\n${block}\n${end}`;
  const i = existing.indexOf(start);
  const j = existing.indexOf(end);
  if (i >= 0 && j > i) return existing.slice(0, i) + wrapped + existing.slice(j + end.length);
  return `${existing.replace(/\s*$/, '')}${existing.trim() ? '\n\n' : ''}${wrapped}\n`;
}

// Fusion JSON : les en-têtes générés remplacent ceux de même nom pour la même source, le reste est gardé.
function mergeJson(existing, generated) {
  let cur = {};
  try { cur = existing.trim() ? JSON.parse(existing) : {}; } catch { throw new Error('Le fichier existant n’est pas un JSON valide : corrige-le d’abord, puis relance la correction.'); }
  const gen = JSON.parse(generated);
  const mergeList = (list, add) => {
    const out = Array.isArray(list) ? list.slice() : [];
    for (const g of add) {
      const hit = out.find((x) => x && x.source === g.source);
      if (!hit) { out.push(g); continue; }
      const map = new Map((hit.headers || []).map((h) => [String(h.key).toLowerCase(), h]));
      for (const h of g.headers) map.set(h.key.toLowerCase(), h);
      hit.headers = [...map.values()];
    }
    return out;
  };
  if (gen.hosting) {
    cur.hosting = cur.hosting && !Array.isArray(cur.hosting) ? cur.hosting : (cur.hosting || {});
    if (Array.isArray(cur.hosting)) cur.hosting = cur.hosting.map((h) => ({ ...h, headers: mergeList(h.headers, gen.hosting.headers) }));
    else cur.hosting.headers = mergeList(cur.hosting.headers, gen.hosting.headers);
  } else cur.headers = mergeList(cur.headers, gen.headers);
  return `${JSON.stringify(cur, null, 2)}\n`;
}

function write(dir, files) {
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error('Dossier du projet introuvable.');
  const done = [];
  for (const f of files || []) {
    const rel = String(f.path || '').replace(/\\/g, '/');
    if (!rel || rel.includes('..') || path.isAbsolute(rel)) throw new Error(`Chemin refusé : ${rel}`);
    const file = path.join(dir, rel);
    const exists = fs.existsSync(file);
    const before = exists ? fs.readFileSync(file, 'utf8') : '';
    let next;
    if (f.merge === 'json') next = mergeJson(before, f.content);
    else if (f.merge === 'replace') next = `${f.content.replace(/\s*$/, '')}\n`;
    else next = mergeMarkers(before, f.content, rel);
    if (exists && before === next) { done.push({ path: rel, file, changed: false }); continue; }
    if (exists && !fs.existsSync(`${file}.avant-nexora`)) fs.copyFileSync(file, `${file}.avant-nexora`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, next);
    done.push({ path: rel, file, changed: true, created: !exists, backup: exists ? `${rel}.avant-nexora` : '' });
  }
  return done;
}

module.exports = { TARGETS, detect, plan, generate, write, mergeMarkers, mergeJson };
