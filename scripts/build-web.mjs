// `pnpm build` : publication web de NEXORA dans dist/ (Cloudflare Workers, domaine nexoradevs.online).
// NEXORA #096 : le site vitrine occupe la racine du domaine, page par page en HTML pré-généré (scripts/site-ssg.mjs :
// référencement, PWA, robots.txt, sitemap.xml, llms.txt) ; NEXORA web passe à /studio/ ; back office à /admin/,
// espace des parrains à /referral/, page de statut à /status/. Les anciennes adresses /site/… sont redirigées.
// Même contenu que l'aperçu : l'interface telle quelle et le pont preview/bridge.js, plus le mode
// web de NEXORA (preview/web.js, #025) : compte et synchronisation, appareils affichés par iframe.
// Le back office web (admin/, React) est assemblé par Vite dans dist/admin/, avec des chemins
// relatifs : il fonctionne quelle que soit l'adresse de publication (Figma Make, GitHub Pages…).
// Le site vitrine (site/, React, NEXORA #060) est assemblé de la même façon dans dist/site/.
// L'espace des parrains (referral/, React, NEXORA #090) est assemblé de la même façon dans dist/referral/.
// `--mode development` (passé seulement par .figma/make/deploy-preview, l'aperçu déployé de Figma Make,
// NEXORA #063) : le site vitrine devient la page d'entrée (dist/index.html) et NEXORA web passe à
// dist/app.html. La publication (Cloudflare : `pnpm run build`, sans argument) garde NEXORA web à la racine.
import fs from "node:fs"
import path from "node:path"
import react from "@vitejs/plugin-react"
import { build } from "vite"
import { buildSite } from "./site-ssg.mjs"
import {
  BRIDGE_FILE,
  BRIDGE_PATH,
  PREVIEW_DATA,
  RENDERER_DIR,
  ROOT,
  renderPage,
  statusConfig,
  WEB_DIR,
  WEB_FILE,
  WEB_PATH,
} from "../preview/server.mjs"

const OUT_DIR = path.join(ROOT, "dist")
// NEXORA #096 : NEXORA web (interface de l'application, mode web) sous /studio/ ; ses chemins sont relatifs.
const STUDIO_DIR = path.join(OUT_DIR, "studio")

function readSiteSettings() {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(ROOT, ".figma", "make", "site.json"), "utf8"),
    )
  } catch {
    return {}
  }
}

const argv = process.argv.slice(2)
const previewEntry =
  argv.includes("--mode=development") ||
  argv.some((a, i) => a === "--mode" && argv[i + 1] === "development")
// NEXORA #096 : le réglage « ne pas indexer » de Figma Make (.figma/make/site.json) ne vaut que pour l'aperçu déployé
// de Make (--mode development) ou si NEXORA_NOINDEX=1 : la publication sur le domaine (Cloudflare) est indexable.
// (Jusqu'au #095, il s'appliquait aussi à Cloudflare : robots.txt « Disallow: / » bloquait tout le site.)
const noIndex = process.env.NEXORA_NOINDEX === "1" || (previewEntry && readSiteSettings().robots?.index === false)

fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.cpSync(RENDERER_DIR, STUDIO_DIR, { recursive: true })
fs.mkdirSync(path.dirname(path.join(STUDIO_DIR, BRIDGE_PATH)), { recursive: true })
fs.copyFileSync(BRIDGE_FILE, path.join(STUDIO_DIR, BRIDGE_PATH))
fs.copyFileSync(WEB_FILE, path.join(STUDIO_DIR, WEB_PATH))
for (const [file, data] of Object.entries(PREVIEW_DATA)) {
  fs.writeFileSync(path.join(STUDIO_DIR, file), JSON.stringify(data()))
}

// NEXORA #048 : page de statut publique (/status/?p=…) et script des visiteurs réels (/rum.js).
fs.cpSync(WEB_DIR, OUT_DIR, { recursive: true })
fs.writeFileSync(
  path.join(OUT_DIR, "status", "config.json"),
  JSON.stringify(statusConfig()),
)

// Modules du compte NEXORA que dist/main.js ne charge pas en mode web (noms à empreinte).
const mainJs = fs.readFileSync(
  path.join(RENDERER_DIR, "dist", "main.js"),
  "utf8",
)
const cloud =
  /Promise\.all\(\[import\("\.\/(chunks\/session-\w+\.js)"\),import\("\.\/(chunks\/ui-\w+\.js)"\),import\("\.\/(chunks\/sync-\w+\.js)"\)\]\)/.exec(
    mainJs,
  )
if (!cloud)
  throw new Error(
    "dist/main.js : chargement du compte NEXORA (session, ui, sync) introuvable.",
  )
let page = renderPage({
  head: [
    `<script src="${WEB_PATH}" data-cloud="${cloud
      .slice(1)
      .map((f) => `dist/${f}`)
      .join(",")}"></script>`,
    // NEXORA web est une application : jamais indexée (aussi par l'en-tête X-Robots-Tag de /studio/*).
    '<meta name="robots" content="noindex, nofollow">',
  ],
})
// Version web seulement : les appareils affichent les sites (et leur fond d'écran, page data:) dans
// des iframes (nx-webview), que la politique de sécurité de NEXORA (default-src 'self') bloquerait.
// L'application Windows garde la sienne.
const csp = "worker-src 'self' blob:"
if (!page.includes(`${csp}">`))
  throw new Error(
    "index.html : politique de sécurité (worker-src) introuvable.",
  )
page = page.replace(`${csp}">`, `${csp}; frame-src https: http: data:">`)
fs.writeFileSync(path.join(STUDIO_DIR, "index.html"), page)

// En-têtes de sécurité (#039), lus par Cloudflare (fichier _headers des ressources statiques) :
// type des fichiers respecté et adresse d'origine réduite partout ; back office jamais affiché dans le
// cadre d'un autre site (clics détournés sur « Tout appliquer », rôles…). NEXORA web reste affichable en
// cadre : la publication Figma Make sert aussi dist/. Contrôlé en ligne par `pnpm valider`.
fs.writeFileSync(
  path.join(OUT_DIR, "_headers"),
  [
    "/*",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    // NEXORA #096 : HTTPS imposé au navigateur (le domaine n'est servi qu'en HTTPS par Cloudflare).
    "  Strict-Transport-Security: max-age=31536000; includeSubDomains",
    "/admin/*",
    "  X-Frame-Options: DENY",
    "  Content-Security-Policy: frame-ancestors 'none'",
    "  X-Robots-Tag: noindex, nofollow",
    // NEXORA #090 : espace des parrains (NEXORA REFERRAL), même protection que le back office.
    "/referral/*",
    "  X-Frame-Options: DENY",
    "  Content-Security-Policy: frame-ancestors 'none'",
    "  X-Robots-Tag: noindex, nofollow",
    "/referral/assets/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    // NEXORA #096 : NEXORA web (application) jamais indexée ; fichiers du site à empreinte gardés un an ; service
    // worker et manifeste toujours relus.
    "/studio/*",
    "  X-Robots-Tag: noindex, nofollow",
    "/assets/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "/sw.js",
    "  Cache-Control: no-cache",
    "/manifest.webmanifest",
    "  Content-Type: application/manifest+json; charset=utf-8",
    "  Cache-Control: public, max-age=3600",
    "/robots.txt",
    "  Content-Type: text/plain; charset=utf-8",
    "/llms.txt",
    "  Content-Type: text/plain; charset=utf-8",
    "/llms-full.txt",
    "  Content-Type: text/plain; charset=utf-8",
    "",
  ].join("\n"),
)
// NEXORA #096 : anciennes adresses du site (/site/…, liens de l'application Windows, du lanceur et des e-mails) et de
// l'aperçu (app.html) redirigées pour de bon ; la partie après # suit la redirection et le site la convertit.
fs.writeFileSync(
  path.join(OUT_DIR, "_redirects"),
  ["/site / 301", "/site/ / 301", "/site/* /:splat 301", "/app.html /studio/ 301", ""].join("\n"),
)

// L'environnement Figma Make peut définir NODE_ENV=development : le back office publié est assemblé
// en mode production (React optimisé, JSX sans aides de développement).
process.env.NODE_ENV = "production"
await build({
  configFile: false,
  mode: "production",
  root: path.join(ROOT, "admin"),
  base: "./",
  publicDir: false,
  logLevel: "warn",
  plugins: [react()],
  // Date de publication affichée par le back office (section Supabase, #027).
  define: { __ADMIN_BUILD__: JSON.stringify(new Date().toISOString()) },
  build: {
    outDir: path.join(OUT_DIR, "admin"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
  },
})

// NEXORA #060, #096 : site vitrine à la racine, une page HTML pré-générée par adresse (scripts/site-ssg.mjs).
// Politique de sécurité posée dans chaque page publiée (Vite en a besoin d'une plus large pendant le développement) :
// fichiers du site, aucun script en ligne (les données structurées JSON-LD ne s'exécutent pas), lectures publiques sur
// le serveur de NEXORA (offres, lien de téléchargement), aucune ressource tierce.
const { projectRef } = statusConfigRef()
const siteCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  // #096 : attributs style des pages pré-générées (variables CSS des animations et des couleurs, posées par React) ;
  // aucune balise <style> ni script en ligne permis pour autant.
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' https://${projectRef}.supabase.co`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join("; ")
const site = await buildSite({
  ROOT,
  OUT_DIR,
  csp: siteCsp,
  noIndex,
  define: { "import.meta.env.VITE_NEXORA_WEB": JSON.stringify("/studio/") },
})
for (const file of ["index.html", "tarifs.html", "404.html"]) {
  const html = fs.readFileSync(path.join(OUT_DIR, file), "utf8")
  if ([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].length)
    throw new Error(`${file} : aucun script en ligne n’est permis (politique de sécurité).`)
}

// NEXORA #090 : espace des parrains (NEXORA REFERRAL), servi sous /referral/. Politique de sécurité posée dans la page
// publiée : fichiers de l'espace seulement, connexion à Supabase (session et fonctions nx_partner_*), aucune ressource
// tierce, aucun cadre.
await build({
  configFile: false,
  mode: "production",
  root: path.join(ROOT, "referral"),
  base: "./",
  publicDir: false,
  logLevel: "warn",
  plugins: [react()],
  build: {
    outDir: path.join(OUT_DIR, "referral"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
  },
})
const referralPage = path.join(OUT_DIR, "referral", "index.html")
let referralHtml = fs.readFileSync(referralPage, "utf8")
if ([...referralHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].length)
  throw new Error("referral/index.html : aucun script en ligne n’est permis (politique de sécurité).")
const referralCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' https://${projectRef}.supabase.co`,
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join("; ")
if (!referralHtml.includes('<meta charset="UTF-8" />'))
  throw new Error("referral/index.html : balise meta charset introuvable.")
referralHtml = referralHtml.replace(
  '<meta charset="UTF-8" />',
  ['<meta charset="UTF-8" />', `    <meta http-equiv="Content-Security-Policy" content="${referralCsp}" />`].join("\n"),
)
fs.writeFileSync(referralPage, referralHtml)

let files = 0
let bytes = 0
for (const entry of fs.readdirSync(OUT_DIR, {
  recursive: true,
  withFileTypes: true,
})) {
  if (!entry.isFile()) continue
  files += 1
  bytes += fs.statSync(path.join(entry.parentPath, entry.name)).size
}
console.log(
  `Version web de NEXORA construite dans dist/ : ${files} fichiers, ${(bytes / 1048576).toFixed(1)} Mo ; site vitrine : ${site.pages.length} pages pré-générées${noIndex ? " (non indexées)" : ""}.`,
)

function statusConfigRef() {
  const { url } = statusConfig()
  const projectRef = new URL(url).hostname.split(".")[0]
  if (!/^[a-z0-9]{10,40}$/.test(projectRef))
    throw new Error("supabase/nexora.json : identifiant du projet invalide.")
  return { projectRef }
}
