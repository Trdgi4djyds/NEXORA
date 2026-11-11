'use strict';
/* NEXORA #048 — Audit de sécurité sur plusieurs pages : parcourt les pages du même site (liens internes, au
 * plus 40) et relève, page par page, les formulaires sans jeton anti-CSRF, les mots de passe envoyés sans
 * chiffrement, les cookies de session mal protégés, le contenu mixte, les messages d'erreur détaillés et les
 * commentaires sensibles ; puis vérifie les pages d'administration et de diagnostic les plus courantes.
 * Lecture seule : uniquement des requêtes GET, comme un visiteur. */
const { collector, finish, grab, pool } = require('./util');

const SKIP_EXT = /\.(png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|map|json|xml|txt|pdf|zip|rar|7z|gz|mp4|webm|mp3|wav|ogg|woff2?|ttf|otf|eot|apk|exe|dmg|msi|docx?|xlsx?|pptx?)$/i;
const LEAKS = [
  [/Traceback \(most recent call last\)/, 'trace Python'],
  [/at [\w$.<>]+ \((?:\/|[A-Z]:\\)[^)]+:\d+:\d+\)/, 'trace JavaScript'],
  [/(Fatal error|Parse error|Warning): .* in .* on line \d+/i, 'erreur PHP'],
  [/SQLSTATE\[|You have an error in your SQL syntax|ORA-\d{5}|PG::\w+Error/i, 'erreur SQL'],
  [/Exception in thread "|java\.lang\.\w+Exception/, 'exception Java'],
  [/Whoops! There was an error|Ignition|laravel\.log/i, 'page de débogage Laravel'],
  [/Server Error in '\/' Application|ASP\.NET is configured to show verbose error/i, 'erreur ASP.NET'],
  [/Django Version:|DisallowedHost at/i, 'page de débogage Django'],
];
const PROBES = [
  ['/server-status', /Apache Server Status/i, 'high', 'Page d’état d’Apache publique', 'Elle montre les adresses et les pages consultées par tes visiteurs.', 'Restreins /server-status à 127.0.0.1 (Require local).'],
  ['/actuator/env', /"propertySources"|"activeProfiles"/, 'critical', 'Variables de configuration Spring exposées', 'Mots de passe et clés de configuration lisibles par tous.', 'N’expose pas les endpoints actuator sensibles (management.endpoints.web.exposure.include=health).'],
  ['/actuator/heapdump', /JAVA PROFILE|HPROF/, 'critical', 'Mémoire de l’application téléchargeable', 'Le contenu de la mémoire (sessions, secrets) peut être récupéré.', 'Désactive l’endpoint heapdump.'],
  ['/_profiler/', /Symfony Profiler/i, 'high', 'Profileur Symfony public', 'Il affiche les requêtes, la configuration et les variables d’environnement.', 'Désactive le profileur en production (APP_ENV=prod).'],
  ['/telescope', /Laravel Telescope|telescope/i, 'high', 'Laravel Telescope public', 'Il montre les requêtes, les e-mails et les exceptions de ton application.', 'Limite Telescope à l’environnement local ou protège-le par une autorisation.'],
  ['/phpinfo.php', /phpinfo\(\)|PHP Version/i, 'medium', 'phpinfo() public', 'Toute la configuration PHP du serveur est lisible.', 'Supprime ce fichier du serveur.'],
  ['/adminer.php', /Adminer|Login - Adminer/i, 'high', 'Adminer accessible', 'Une page de connexion à ta base de données est ouverte à tous.', 'Supprime Adminer du serveur ou protège-le par une liste d’adresses autorisées.'],
  ['/phpmyadmin/', /phpMyAdmin/i, 'medium', 'phpMyAdmin accessible', 'La page de connexion à la base est publique : cible de choix pour les robots.', 'Restreins phpMyAdmin à ton adresse IP ou passe par un VPN.'],
  ['/backup.sql', /CREATE TABLE|INSERT INTO/i, 'critical', 'Sauvegarde de base de données téléchargeable', 'Toutes tes données peuvent être récupérées.', 'Supprime le fichier du dossier public et garde les sauvegardes hors du site.'],
  ['/dump.sql', /CREATE TABLE|INSERT INTO/i, 'critical', 'Sauvegarde de base de données téléchargeable', 'Toutes tes données peuvent être récupérées.', 'Supprime le fichier du dossier public.'],
  ['/db.sql', /CREATE TABLE|INSERT INTO/i, 'critical', 'Sauvegarde de base de données téléchargeable', 'Toutes tes données peuvent être récupérées.', 'Supprime le fichier du dossier public.'],
  ['/wp-config.php.bak', /DB_PASSWORD|DB_NAME/, 'critical', 'Copie de wp-config.php lisible', 'Le mot de passe de ta base WordPress est lisible.', 'Supprime la copie et change le mot de passe de la base.'],
  ['/config.php.bak', /password|\$db/i, 'critical', 'Copie d’un fichier de configuration lisible', 'Des identifiants peuvent être lus.', 'Supprime la copie et change les mots de passe concernés.'],
  ['/.DS_Store', /Bud1/, 'low', 'Fichier .DS_Store exposé', 'Il révèle la liste des fichiers d’un dossier.', 'Supprime les fichiers .DS_Store avant la mise en ligne.'],
  ['/swagger.json', /"swagger"|"openapi"/, 'low', 'Documentation de l’API publique', 'La liste complète des routes de ton API est lisible : vérifie qu’aucune n’est sans protection.', 'Rends la documentation privée si l’API n’est pas publique.'],
  ['/openapi.json', /"openapi"/, 'low', 'Documentation de l’API publique', 'La liste complète des routes de ton API est lisible.', 'Rends la documentation privée si l’API n’est pas publique.'],
  ['/graphql?query=%7B__schema%7Btypes%7Bname%7D%7D%7D', /"__schema"/, 'medium', 'Introspection GraphQL ouverte', 'Tout le schéma de ton API GraphQL est lisible par n’importe qui.', 'Désactive l’introspection en production.'],
];
const ADMIN = ['/admin', '/administrator/', '/wp-admin/', '/wp-login.php', '/user/login', '/login', '/backoffice', '/dashboard'];

function links(html, base, origin) {
  const out = new Set();
  const re = /<a\b[^>]*?\bhref\s*=\s*["']([^"'#]+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const u = new URL(m[1], base);
      if (u.origin !== origin || SKIP_EXT.test(u.pathname) || /^(mailto|tel|javascript):/i.test(m[1])) continue;
      u.hash = '';
      if (/logout|deconnexion|signout|delete|supprimer/i.test(u.pathname)) continue;
      out.add(u.href);
    } catch { /* lien invalide */ }
  }
  return [...out];
}

function forms(html) {
  const list = [];
  const re = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const body = m[2];
    const method = ((/method\s*=\s*["']?(\w+)/i.exec(attrs) || [])[1] || 'get').toLowerCase();
    const action = (/action\s*=\s*["']([^"']*)["']/i.exec(attrs) || [])[1] || '';
    const password = /<input\b[^>]*type\s*=\s*["']?password/i.test(body);
    const token = /<input\b[^>]*type\s*=\s*["']?hidden[^>]*name\s*=\s*["'][^"']*(csrf|xsrf|token|nonce|authenticity|_wpnonce|__RequestVerificationToken)[^"']*["']/i.test(body)
      || /<input\b[^>]*name\s*=\s*["'][^"']*(csrf|xsrf|_token|authenticity|_wpnonce|__RequestVerificationToken)[^"']*["']/i.test(body);
    list.push({ method, action, password, token });
  }
  return list;
}

async function audit(start, { fetchImpl, max = 25, onStep = () => {} } = {}) {
  let origin;
  let startUrl;
  try { const u = new URL(start); origin = u.origin; startUrl = u.href; } catch { throw new Error('Adresse du site invalide.'); }
  const https = origin.startsWith('https:');
  const { findings, add } = collector();
  const seen = new Set([startUrl]);
  const queue = [startUrl];
  const pages = [];
  const issuesBy = new Map(); // titre → pages concernées (constats regroupés)
  const note = (sev, title, detail, fix, page, who = 'toi') => {
    const k = title;
    if (!issuesBy.has(k)) issuesBy.set(k, { sev, title, detail, fix, who, pages: [] });
    const it = issuesBy.get(k);
    if (!it.pages.includes(page) && it.pages.length < 50) it.pages.push(page);
  };
  const limit = Math.max(2, Math.min(40, Number(max) || 25));
  while (queue.length && pages.length < limit) {
    const batch = queue.splice(0, Math.min(4, limit - pages.length));
    const res = await pool(batch, 4, (u) => grab(fetchImpl, u, { timeout: 12000, max: 600000 }));
    batch.forEach((u, i) => {
      const r = res[i] || {};
      const path = (() => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } })();
      const ctype = (r.headers && r.headers['content-type']) || '';
      const page = { url: u, path, status: r.status || 0, title: ((/<title[^>]*>([^<]{0,120})/i.exec(r.body || '') || [])[1] || '').trim(), issues: 0 };
      pages.push(page);
      onStep({ label: `Page ${pages.length} sur ${limit} au plus : ${path}`, progress: Math.min(0.75, (pages.length / limit) * 0.75) });
      if (!r.status || !/html/i.test(ctype)) return;
      const before = issuesBy.size + [...issuesBy.values()].reduce((a, x) => a + x.pages.length, 0);
      const html = r.body || '';
      for (const f of forms(html)) {
        let actionUrl = null;
        try { actionUrl = new URL(f.action || u, u); } catch { actionUrl = null; }
        if (f.password && (!https || (actionUrl && actionUrl.protocol === 'http:'))) note('critical', 'Mot de passe envoyé sans chiffrement', 'Un formulaire avec un mot de passe est envoyé en HTTP : il peut être lu sur le réseau (Wi-Fi public…).', 'Sers toutes les pages en HTTPS et fais pointer le formulaire vers une adresse https://.', path);
        if (f.method === 'post' && !f.token && (!actionUrl || actionUrl.origin === origin)) note('medium', 'Formulaire sans jeton anti-CSRF', 'Un autre site peut faire envoyer ce formulaire à ton visiteur connecté sans qu’il le sache (falsification de requête).', 'Ajoute un jeton anti-CSRF caché (la plupart des frameworks le font : csrf_token, @csrf, antiforgery…) et des cookies SameSite.', path);
        if (f.password && f.method === 'get') note('high', 'Mot de passe envoyé dans l’adresse', 'Le formulaire utilise GET : le mot de passe apparaît dans l’adresse, l’historique et les journaux du serveur.', 'Utilise method="post" pour les formulaires de connexion.', path);
      }
      if (https) {
        const mixed = (html.match(/<(?:script|img|iframe|link|audio|video|source)\b[^>]*\b(?:src|href)\s*=\s*["']http:\/\/[^"']+/gi) || []).length;
        if (mixed) note('high', 'Contenu mixte', 'Des ressources sont chargées en HTTP sur une page HTTPS : elles peuvent être modifiées en route, et le navigateur les bloque souvent.', 'Charge toutes les ressources en https:// (ou en adresse relative).', path);
      }
      for (const [re, what] of LEAKS) if (re.test(html)) { note('medium', 'Message d’erreur détaillé', `La page affiche une ${what} : elle révèle des chemins de fichiers, des versions ou des requêtes internes.`, 'Désactive le mode débogage en production et affiche une page d’erreur générique.', path, 'toi'); break; }
      const comments = (html.match(/<!--[\s\S]*?-->/g) || []).filter((c) => /(password|mot de passe|api[_ -]?key|secret|token|TODO.*(auth|secur)|identifiant)/i.test(c));
      if (comments.length) note('low', 'Commentaires sensibles dans le code HTML', 'Des commentaires visibles dans le code source parlent de mots de passe, de clés ou de sécurité.', 'Retire ces commentaires du HTML publié (étape de minification).', path);
      for (const c of r.setCookies || []) {
        const name = c.split('=')[0].trim();
        const low = c.toLowerCase();
        const sess = /sess|sid|auth|token|jwt|login|remember/i.test(name);
        if (!sess) continue;
        if (https && !/;\s*secure/.test(low)) note('high', `Cookie de session « ${name} » sans Secure`, 'Il peut partir en HTTP et être intercepté.', 'Ajoute l’attribut Secure au cookie.', path);
        if (!/;\s*httponly/.test(low)) note('medium', `Cookie de session « ${name} » sans HttpOnly`, 'Un script injecté dans la page peut le lire et voler la session.', 'Ajoute l’attribut HttpOnly au cookie.', path);
        if (!/;\s*samesite/.test(low)) note('low', `Cookie de session « ${name} » sans SameSite`, 'Il est envoyé avec les requêtes venues d’autres sites.', 'Ajoute SameSite=Lax (ou Strict).', path);
      }
      const after = issuesBy.size + [...issuesBy.values()].reduce((a, x) => a + x.pages.length, 0);
      page.issues = after - before;
      for (const l of links(html, r.url || u, origin)) if (!seen.has(l) && seen.size < 400) { seen.add(l); queue.push(l); }
    });
  }
  for (const it of issuesBy.values()) add(it.sev, 'Pages', it.title, `${it.detail} Pages : ${it.pages.slice(0, 6).join(', ')}${it.pages.length > 6 ? ` et ${it.pages.length - 6} autre(s)` : ''}.`, it.fix, { who: it.who, pages: it.pages });

  // Pages de diagnostic et d'administration.
  onStep({ label: 'Pages d’administration et de diagnostic', progress: 0.8 });
  const probes = await pool(PROBES, 6, async ([p, re, sev, title, detail, fix]) => {
    const r = await grab(fetchImpl, origin + p, { timeout: 9000, max: 60000, redirect: 'manual' });
    return r.status === 200 && re.test(r.body) ? { p, sev, title, detail, fix } : null;
  });
  for (const x of probes) if (x && x.p) add(x.sev, 'Diagnostic exposé', `${x.title} (${x.p})`, x.detail, x.fix, { who: 'toi' });
  const admins = await pool(ADMIN, 6, async (p) => {
    const r = await grab(fetchImpl, origin + p, { timeout: 9000, max: 60000 });
    return r.status === 200 && /<input\b[^>]*type\s*=\s*["']?password/i.test(r.body) ? p : null;
  });
  const open = admins.filter((x) => typeof x === 'string');
  if (open.length) add('info', 'Diagnostic exposé', `Page de connexion d’administration trouvée (${open.join(', ')})`, 'C’est normal pour un site géré, mais ces pages sont attaquées en permanence par des robots.', 'Active la double authentification, limite les tentatives de connexion et, si possible, restreins l’accès par adresse IP.', { who: 'toi' });
  onStep({ label: 'Terminé', progress: 1 });
  return finish(findings, { kind: 'pages', target: origin, url: startUrl, host: new URL(origin).hostname, pages, https });
}

module.exports = { audit, links, forms };
