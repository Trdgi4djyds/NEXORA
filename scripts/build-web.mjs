// `pnpm build` : version web de l'interface NEXORA dans dist/ (publiée par .figma/make/deploy).
// Même contenu que l'aperçu : l'interface telle quelle et le pont preview/bridge.js.
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
for (const [file, data] of Object.entries(PREVIEW_DATA)) {
  fs.writeFileSync(path.join(OUT_DIR, file), JSON.stringify(data()))
}
fs.writeFileSync(
  path.join(OUT_DIR, "index.html"),
  renderPage({
    head: noIndex ? ['<meta name="robots" content="noindex, nofollow">'] : [],
  }),
)
if (noIndex)
  fs.writeFileSync(
    path.join(OUT_DIR, "robots.txt"),
    "User-agent: *\nDisallow: /\n",
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
