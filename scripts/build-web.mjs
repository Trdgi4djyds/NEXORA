// `pnpm build` : version web de l'interface NEXORA dans dist/ (publiée par .figma/make/deploy).
// Même contenu que l'aperçu : l'interface telle quelle et le pont preview/bridge.js, plus le mode
// web de NEXORA (preview/web.js, #025) : compte et synchronisation, appareils affichés par iframe.
// Le back office web (admin/, React) est assemblé par Vite dans dist/admin/, avec des chemins
// relatifs : il fonctionne quelle que soit l'adresse de publication (Figma Make, GitHub Pages…).
// Le site vitrine (site/, React, NEXORA #060) est assemblé de la même façon dans dist/site/.
// L'espace des parrains (referral/, React, NEXORA #090) est assemblé de la même façon dans dist/referral/.
// `--mode development` (passé seulement par .figma/make/deploy-preview, l'aperçu déployé de Figma Make,
// NEXORA #063) : le site vitrine devient la page d'entrée (dist/index.html) et NEXORA web passe à
// dist/app.html. La publication (Cloudflare : `pnpm run build`, sans argument) garde NEXORA web à la racine.
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import react from "@vitejs/plugin-react"
import { build } from "vite"
import { siteTailwind } from "../site/tailwind.mjs"
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

function readSiteSettings() {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(ROOT, ".figma", "make", "site.json"), "utf8"),
    )
  } catch {
    return {}
  }
}

const noIndex = readSiteSettings().robots?.index === false
const argv = process.argv.slice(2)
const previewEntry =
  argv.includes("--mode=development") ||
  argv.some((a, i) => a === "--mode" && argv[i + 1] === "development")

fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.cpSync(RENDERER_DIR, OUT_DIR, { recursive: true })
fs.mkdirSync(path.dirname(path.join(OUT_DIR, BRIDGE_PATH)), { recursive: true })
fs.copyFileSync(BRIDGE_FILE, path.join(OUT_DIR, BRIDGE_PATH))
fs.copyFileSync(WEB_FILE, path.join(OUT_DIR, WEB_PATH))
for (const [file, data] of Object.entries(PREVIEW_DATA)) {
  fs.writeFileSync(path.join(OUT_DIR, file), JSON.stringify(data()))
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
    ...(noIndex ? ['<meta name="robots" content="noindex, nofollow">'] : []),
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
fs.writeFileSync(path.join(OUT_DIR, "index.html"), page)
if (noIndex)
  fs.writeFileSync(
    path.join(OUT_DIR, "robots.txt"),
    "User-agent: *\nDisallow: /\n",
  )

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
    "/admin/*",
    "  X-Frame-Options: DENY",
    "  Content-Security-Policy: frame-ancestors 'none'",
    // NEXORA #090 : espace des parrains (NEXORA REFERRAL), même protection que le back office.
    "/referral/*",
    "  X-Frame-Options: DENY",
    "  Content-Security-Policy: frame-ancestors 'none'",
    "/referral/assets/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    // NEXORA #060 : fichiers du site vitrine nommés avec leur empreinte, gardés en cache un an.
    "/site/assets/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
  ].join("\n"),
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

// NEXORA #060 : site vitrine, servi sous /site/ (NEXORA web reste à la racine : liens des e-mails, partages).
await build({
  configFile: false,
  mode: "production",
  root: path.join(ROOT, "site"),
  base: "./",
  publicDir: false,
  logLevel: "warn",
  // #085 : Tailwind CSS 4 (site/tailwind.mjs).
  plugins: [react(), ...siteTailwind()],
  // Aperçu déployé (#063) : « Ouvrir NEXORA web » mène à app.html, le site occupant la racine.
  define: previewEntry
    ? { "import.meta.env.VITE_NEXORA_WEB": JSON.stringify("../app.html") }
    : {},
  build: {
    outDir: path.join(OUT_DIR, "site"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
  },
})
// Politique de sécurité du site vitrine, posée dans la page publiée seulement (Vite en a besoin d'une plus
// large pendant le développement) : fichiers du site, scripts en ligne éventuels autorisés par leur empreinte
// (aucun depuis #068 : le site est sombre seulement, sans script de thème), lectures publiques sur le serveur
// de NEXORA (offres, lien de téléchargement), aucune ressource tierce.
const sitePage = path.join(OUT_DIR, "site", "index.html")
let siteHtml = fs.readFileSync(sitePage, "utf8")
const inline = [...siteHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
  (m) => `'sha256-${crypto.createHash("sha256").update(m[1]).digest("base64")}'`,
)
const { projectRef } = statusConfigRef()
const siteCsp = [
  "default-src 'self'",
  `script-src 'self' ${inline.join(" ")}`.trim(),
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' https://${projectRef}.supabase.co`,
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join("; ")
if (!siteHtml.includes('<meta charset="UTF-8" />'))
  throw new Error("site/index.html : balise meta charset introuvable.")
siteHtml = siteHtml.replace(
  '<meta charset="UTF-8" />',
  [
    '<meta charset="UTF-8" />',
    `    <meta http-equiv="Content-Security-Policy" content="${siteCsp}" />`,
    ...(noIndex ? ['    <meta name="robots" content="noindex, nofollow" />'] : []),
  ].join("\n"),
)
fs.writeFileSync(sitePage, siteHtml)

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

// Aperçu déployé de Figma Make (#063) : le site vitrine à la racine (mêmes fichiers que dist/site/, chemins
// préfixés), NEXORA web dans app.html (ses chemins relatifs restent valables à la racine).
if (previewEntry) {
  fs.renameSync(path.join(OUT_DIR, "index.html"), path.join(OUT_DIR, "app.html"))
  const rootHtml = siteHtml.replaceAll('"./assets/', '"./site/assets/')
  if (!rootHtml.includes('"./site/assets/'))
    throw new Error("site/index.html : chemins des fichiers du site introuvables.")
  fs.writeFileSync(path.join(OUT_DIR, "index.html"), rootHtml)
}

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
  `Version web de NEXORA construite dans dist/ : ${files} fichiers, ${(bytes / 1048576).toFixed(1)} Mo.`,
)

function statusConfigRef() {
  const { url } = statusConfig()
  const projectRef = new URL(url).hostname.split(".")[0]
  if (!/^[a-z0-9]{10,40}$/.test(projectRef))
    throw new Error("supabase/nexora.json : identifiant du projet invalide.")
  return { projectRef }
}
