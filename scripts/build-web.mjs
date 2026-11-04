// `pnpm build` : version web de l'interface NEXORA dans dist/ (publiée par .figma/make/deploy).
// Même contenu que l'aperçu : l'interface telle quelle et le pont preview/bridge.js, plus le mode
// web de NEXORA (preview/web.js, #025) : compte et synchronisation, appareils affichés par iframe.
// Le back office web (admin/, React) est assemblé par Vite dans dist/admin/, avec des chemins
// relatifs : il fonctionne quelle que soit l'adresse de publication (Figma Make, GitHub Pages…).
// Les arguments passés par Figma Make (par exemple `--mode development`) n'ont pas d'effet ici.
import fs from "node:fs"
import path from "node:path"
import react from "@vitejs/plugin-react"
import { build } from "vite"
import {
  BRIDGE_FILE,
  BRIDGE_PATH,
  PREVIEW_DATA,
  RENDERER_DIR,
  ROOT,
  renderPage,
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

fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.cpSync(RENDERER_DIR, OUT_DIR, { recursive: true })
fs.mkdirSync(path.dirname(path.join(OUT_DIR, BRIDGE_PATH)), { recursive: true })
fs.copyFileSync(BRIDGE_FILE, path.join(OUT_DIR, BRIDGE_PATH))
fs.copyFileSync(WEB_FILE, path.join(OUT_DIR, WEB_PATH))
for (const [file, data] of Object.entries(PREVIEW_DATA)) {
  fs.writeFileSync(path.join(OUT_DIR, file), JSON.stringify(data()))
}

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
