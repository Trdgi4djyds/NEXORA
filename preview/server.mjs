// Aperçu navigateur de NEXORA : sert l'interface (nexora/app/renderer) telle qu'Electron la charge,
// avec preview/bridge.js à la place de preload.js. Utilisé par Vite (`pnpm dev`, aperçu Figma Make)
// et par scripts/build-web.mjs (`pnpm build`, publication).
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)
export const APP_DIR = path.join(ROOT, "nexora", "app")
export const RENDERER_DIR = path.join(APP_DIR, "renderer")
export const BRIDGE_FILE = path.join(ROOT, "preview", "bridge.js")
const ANDROID_TEMPLATES_DIR = path.join(APP_DIR, "android", "templates")
const DEV_IPC_FILE = path.join(APP_DIR, "src", "dev", "ipc.js")
/** Fichiers propres à l'aperçu (chemins relatifs à la page), en dehors des noms de fichiers de NEXORA. */
export const BRIDGE_PATH = "__nexora-preview/bridge.js"

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
}

const escapeAttr = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")

/** Icônes d'onglets des apps Android : même calcul que le canal `android:tab-icons` (src/android/ipc.js). */
export function tabIcons() {
  const dir = path.join(ANDROID_TEMPLATES_DIR, "drawable")
  const out = {}
  for (const f of fs.readdirSync(dir)) {
    const m = /^vt_tab_([a-z]+)\.xml$/.exec(f)
    if (!m) continue
    const src = fs.readFileSync(path.join(dir, f), "utf8")
    out[m[1]] = [...src.matchAll(/<path([^>]*)\/>/g)].map((p) => {
      const attr = (n) =>
        (new RegExp(`android:${n}="([^"]*)"`).exec(p[1]) || [])[1]
      const fill = attr("fillColor")
      return {
        d: attr("pathData"),
        fill: Boolean(fill && !/^#00/.test(fill)),
        stroke: Boolean(attr("strokeColor")),
        width: Number(attr("strokeWidth")) || 1.8,
      }
    })
  }
  return out
}

/** Modèles de projet du Dev Lab : même liste que le canal `dev:templates` (src/dev/ipc.js). */
export function devTemplates() {
  const src = fs.readFileSync(DEV_IPC_FILE, "utf8")
  const start = src.indexOf("const TEMPLATES = {")
  if (start < 0) return []
  const block = src.slice(start, src.indexOf("\n};", start))
  return [...block.matchAll(/^ {2}([\w-]+): \{\s*label: '([^']+)'/gm)].map(
    ([, id, label]) => ({ id, label }),
  )
}

/** Données calculées à partir des sources de NEXORA et servies à côté du pont (chemin relatif à la page). */
export const PREVIEW_DATA = {
  "__nexora-preview/tab-icons.json": tabIcons,
  "__nexora-preview/dev-templates.json": devTemplates,
}

/** Page d'accueil de l'interface NEXORA avec les ajouts de l'aperçu (pont, icône, balises en plus). */
export function renderPage({ head = [] } = {}) {
  const html = fs.readFileSync(path.join(RENDERER_DIR, "index.html"), "utf8")
  const { version = "" } = JSON.parse(
    fs.readFileSync(path.join(APP_DIR, "package.json"), "utf8"),
  )
  if (!html.includes("</head>"))
    throw new Error(
      "nexora/app/renderer/index.html : balise </head> introuvable.",
    )
  const tags = [
    '<link rel="icon" href="logo.png">',
    `<script src="${BRIDGE_PATH}" data-version="${escapeAttr(version)}"></script>`,
    ...head,
  ]
  return html.replace("</head>", `  ${tags.join("\n  ")}\n</head>`)
}

/** Fichier de l'interface correspondant à un chemin d'URL relatif, ou null (hors dossier ou absent). */
function rendererFile(rel) {
  const file = path.resolve(RENDERER_DIR, rel)
  if (!file.startsWith(RENDERER_DIR + path.sep)) return null
  try {
    return fs.statSync(file).isFile() ? file : null
  } catch {
    return null
  }
}

/**
 * Plugin Vite de l'aperçu : sert les fichiers de NEXORA sans les transformer et recharge la page
 * quand l'interface ou le pont changent (Vite ne suit pas ces fichiers dans son graphe de modules).
 * @returns {import('vite').Plugin}
 */
export function nexoraPreview() {
  return {
    name: "nexora-preview",
    apply: "serve",
    configureServer(server) {
      const base = server.config.base
      server.middlewares.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next()
        let pathname
        try {
          pathname = decodeURIComponent(
            new URL(req.url ?? "/", "http://localhost").pathname,
          )
        } catch {
          return next()
        }
        if (!pathname.startsWith(base)) return next()
        const rel = pathname.slice(base.length)

        if (rel === "" || rel === "index.html") {
          const body = renderPage({
            head: [`<script type="module" src="${base}@vite/client"></script>`],
          })
          res.writeHead(200, {
            "Content-Type": MIME[".html"],
            "Cache-Control": "no-store",
          })
          res.end(req.method === "HEAD" ? undefined : body)
          return
        }
        const data = PREVIEW_DATA[rel]
        if (data) {
          res.writeHead(200, {
            "Content-Type": MIME[".json"],
            "Cache-Control": "no-store",
          })
          res.end(req.method === "HEAD" ? undefined : JSON.stringify(data()))
          return
        }

        const file = rel === BRIDGE_PATH ? BRIDGE_FILE : rendererFile(rel)
        if (!file) return next()
        res.writeHead(200, {
          "Content-Type":
            MIME[path.extname(file).toLowerCase()] ??
            "application/octet-stream",
          "Content-Length": fs.statSync(file).size,
          "Cache-Control": "no-cache",
        })
        if (req.method === "HEAD") return res.end()
        fs.createReadStream(file).pipe(res)
      })

      const affectsPreview = (file) =>
        file === BRIDGE_FILE ||
        file === DEV_IPC_FILE ||
        file.startsWith(RENDERER_DIR + path.sep) ||
        file.startsWith(ANDROID_TEMPLATES_DIR + path.sep)
      const reload = (file) => {
        if (affectsPreview(path.resolve(file)))
          server.ws.send({ type: "full-reload", path: "*" })
      }
      for (const event of ["add", "change", "unlink"])
        server.watcher.on(event, reload)
    },
  }
}
