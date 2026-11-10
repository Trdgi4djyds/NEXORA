// Aperçu navigateur de NEXORA : sert l'interface (nexora/app/renderer) telle qu'Electron la charge,
// avec preview/bridge.js à la place de preload.js. Utilisé par Vite (`pnpm dev`, aperçu Figma Make)
// et par scripts/build-web.mjs (`pnpm build`, publication).
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import setup from "../supabase/nexora.json" with { type: "json" }
import { RELAY_PREFIX, relaySupabaseApi } from "../worker/supabase-relay.js"

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
/** Mode web de NEXORA (#025) : seulement dans la version publiée (scripts/build-web.mjs). */
export const WEB_FILE = path.join(ROOT, "preview", "web.js")
export const WEB_PATH = "__nexora-preview/web.js"

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

/**
 * Outils de développement d'un PC neuf (aucun installé) : même forme que le canal `tools:status`
 * (src/tools.js, NEXORA #016), avec le catalogue et les étapes de Windows.
 */
export function devTools() {
  const require = createRequire(import.meta.url)
  const srcDir = path.join(APP_DIR, "src") + path.sep
  // Relu à chaque appel : une modification de src/tools.js ou src/sdk.js est prise en compte sans redémarrer.
  for (const id of Object.keys(require.cache))
    if (id.startsWith(srcDir)) delete require.cache[id]
  const { catalog } = require(path.join(APP_DIR, "src", "tools.js"))
  return {
    platform: "win32",
    home: "",
    userPath: true,
    busy: null,
    tools: catalog("win32"),
  }
}

/** Mode démonstration de la supervision (NEXORA #015) : appels IPC et flux d'évènements. */
export const DEMO_MAIN_PATH = "__nexora-preview/main"

/**
 * Desktop Builder sur un PC neuf (NEXORA #023) : même forme que le canal `desktop:status`
 * (src/desktop/builder.js) ; rien d'installé, version du kit lue dans src/desktop/project.js et version
 * d'Electron de NEXORA lue dans l'application Windows.
 */
export function desktopStatus() {
  const require = createRequire(import.meta.url)
  const file = path.join(APP_DIR, "src", "desktop", "project.js")
  delete require.cache[file]
  const { BUILDER_VERSION } = require(file)
  let nexora = ""
  try {
    nexora = fs
      .readFileSync(
        path.join(ROOT, "nexora", "NEXORA-win32-x64", "version"),
        "utf8",
      )
      .trim()
  } catch {
    nexora = ""
  }
  return {
    platform: "win32",
    node: { ok: false, version: null, min: 18 },
    kit: { version: null, expected: BUILDER_VERSION },
    electron: { nexora, cached: [] },
    home: "",
    outRoot: "",
    autoInstall: true,
    busy: false,
  }
}
export const DEMO_EVENTS_PATH = "__nexora-preview/events"

const appVersion = () =>
  JSON.parse(fs.readFileSync(path.join(APP_DIR, "package.json"), "utf8"))
    .version || ""

// Rechargé quand preview/demo-main.mjs change (le serveur d'aperçu tourne en continu).
const DEMO_FILE = path.join(ROOT, "preview", "demo-main.mjs")
// Chemin absolu : Vite assemble vite.config.ts (et ce fichier) dans node_modules/.vite-temp.
const demoModule = () =>
  import(`${pathToFileURL(DEMO_FILE).href}?v=${fs.statSync(DEMO_FILE).mtimeMs}`)
// NEXORA #052 : mode démonstration du Dev Lab (chargé une seule fois : il crée le projet de démonstration).
const DEV_DEMO_FILE = path.join(ROOT, "preview", "demo-dev.mjs")
const devDemoModule = () => import(pathToFileURL(DEV_DEMO_FILE).href)

function demoMain(req, res) {
  const chunks = []
  req.on("data", (c) => chunks.push(c))
  req.on("end", async () => {
    let out
    try {
      const { channel, args } = JSON.parse(
        Buffer.concat(chunks).toString("utf8") || "{}",
      )
      // NEXORA #052 : canaux du Dev Lab (dev:, git:, devx:) servis par preview/demo-dev.mjs.
      if (/^(dev|git|devx|gh|tunnel):[\w-]+$/.test(String(channel))) {
        const { demoDevInvoke } = await devDemoModule()
        out = { ok: true, value: await demoDevInvoke(channel, args) }
      } else {
        if (!/^(mon|tel|sec):[\w-]+$/.test(String(channel)))
          throw new Error("Canal non autorisé.")
        const { demoInvoke } = await demoModule()
        out = { ok: true, value: await demoInvoke(channel, args, appVersion()) }
      }
    } catch (err) {
      out = { ok: false, error: String((err && err.message) || err) }
    }
    res.writeHead(200, {
      "Content-Type": MIME[".json"],
      "Cache-Control": "no-store",
    })
    res.end(JSON.stringify(out ?? { ok: true, value: null }))
  })
}

/** Relais de l'API de gestion de Supabase (NEXORA #026), comme le Worker Cloudflare de la publication. */
function supabaseRelay(req, res, rel) {
  const chunks = []
  req.on("data", (c) => chunks.push(c))
  req.on("end", async () => {
    const headers = new Headers()
    for (const name of ["authorization", "content-type"])
      if (req.headers[name]) headers.set(name, String(req.headers[name]))
    const body = Buffer.concat(chunks)
    const out = await relaySupabaseApi(
      new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
      }),
      { project: setup.projectRef, path: `/${rel.slice(RELAY_PREFIX.length)}` },
    )
    res.writeHead(out.status, Object.fromEntries(out.headers))
    res.end(Buffer.from(await out.arrayBuffer()))
  })
}

/** Données calculées à partir des sources de NEXORA et servies à côté du pont (chemin relatif à la page). */
export const PREVIEW_DATA = {
  "__nexora-preview/tab-icons.json": tabIcons,
  "__nexora-preview/dev-templates.json": devTemplates,
  "__nexora-preview/dev-tools.json": devTools,
  "__nexora-preview/desktop-status.json": desktopStatus,
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

// NEXORA #048 : fichiers publics hors de l'interface (page de statut, script des visiteurs réels).
export const WEB_DIR = path.join(ROOT, "web")
export function webFile(rel) {
  if (rel !== "rum.js" && rel !== "status" && !rel.startsWith("status/"))
    return null
  const r =
    rel === "status" || rel.endsWith("/")
      ? `${rel.replace(/\/$/, "")}/index.html`
      : rel
  const file = path.resolve(WEB_DIR, r)
  if (
    !file.startsWith(WEB_DIR + path.sep) ||
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile()
  )
    return null
  return file
}
export function statusConfig() {
  const setup = JSON.parse(
    fs.readFileSync(path.join(ROOT, "supabase", "nexora.json"), "utf8"),
  )
  return {
    url: `https://${setup.projectRef}.supabase.co`,
    key: setup.publicKey,
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
        // NEXORA #087 : réglages publics du Worker (/license/config, lus par le site vitrine) : l'aperçu n'a ni le
        // service de licences ni le paiement en ligne, il répond comme le Worker quand rien n'est configuré.
        if (rel === "license/config" && req.method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" })
          res.end(JSON.stringify({ signing: false, payments: false, webhook: false, relay: false, yearly: false }))
          return
        }
        // Mode démonstration de la supervision (NEXORA #015) : canaux mon:/tel: exécutés par le vrai code
        // du processus principal dans Node (preview/demo-main.mjs), seulement quand le pont le demande.
        if (rel === DEMO_MAIN_PATH && req.method === "POST") {
          demoMain(req, res)
          return
        }
        if (rel === DEMO_EVENTS_PATH && req.method === "GET") {
          if (/[?&]dev=1/.test(req.url || "")) {
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-store",
              Connection: "keep-alive",
            })
            res.write(": nexora\n\n")
            devDemoModule().then(({ attachDevEvents }) => attachDevEvents(res))
            return
          }
          demoModule().then(({ demoEvents }) => demoEvents(res, appVersion()))
          return
        }
        if (rel.startsWith(`${RELAY_PREFIX.slice(1)}/`)) {
          supabaseRelay(req, res, rel)
          return
        }
        if (req.method !== "GET" && req.method !== "HEAD") return next()

        // NEXORA #062-#063 : le site vitrine est l'entrée de l'aperçu Figma Make : « / » sans paramètre sert
        // directement sa page (sans redirection, que l'aperçu de Make ne suit pas toujours) ; l'application
        // NEXORA reste servie à « /?app » (lien « Ouvrir NEXORA web » du site, captures). La version publiée
        // n'est pas concernée : NEXORA web y reste à la racine (liens des e-mails, partages).
        // NEXORA #096 : adresses réelles du site vitrine (/tarifs, /espaces/dev…, aussi sous /site/) et ses fichiers
        // publics (site/public : icônes, manifeste, robots.txt…), servis comme à la publication.
        // Manifeste de la PWA : écrit par la publication (scripts/site-ssg.mjs), repris de dist/ s'il existe.
        const builtManifest = path.join(ROOT, "dist", "manifest.webmanifest")
        const sitePublic = rel.replace(/^site\//, "") === "manifest.webmanifest" ? builtManifest : path.join(ROOT, "site", "public", rel.replace(/^site\//, ""))
        if (rel && !rel.endsWith("/") && rel.split("/").every((x) => x && x !== "..") && fs.existsSync(sitePublic) && fs.statSync(sitePublic).isFile()) {
          res.writeHead(200, { "Content-Type": sitePublic.endsWith(".webmanifest") ? "application/manifest+json" : MIME[path.extname(sitePublic)] || "application/octet-stream", "Cache-Control": "no-store" })
          res.end(req.method === "HEAD" ? undefined : fs.readFileSync(sitePublic))
          return
        }
        const siteRoute = /^(site\/)?(espaces|tarifs|telecharger|nouveautes|licence)(\/[a-z-]*)?\/?$/.test(rel) || /^site\/?$/.test(rel)
        if ((rel === "" && !(req.url ?? "").includes("?")) || siteRoute) {
          const html = fs
            .readFileSync(path.join(ROOT, "site", "index.html"), "utf8")
            .replace('src="./src/main.tsx"', `src="${base}site/src/main.tsx"`)
            .replace('href="../nexora/app/renderer/logo.png"', `href="${base}logo.png"`)
          server
            .transformIndexHtml(req.url ?? "/", html)
            .then((body) => {
              res.writeHead(200, {
                "Content-Type": MIME[".html"],
                "Cache-Control": "no-store",
              })
              res.end(req.method === "HEAD" ? undefined : body)
            })
            .catch(next)
          return
        }
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

        // NEXORA #048 : page de statut publique et script des visiteurs réels (web/), publiés avec NEXORA web.
        if (rel === "status/config.json") {
          res.writeHead(200, {
            "Content-Type": MIME[".json"],
            "Cache-Control": "no-store",
          })
          res.end(
            req.method === "HEAD" ? undefined : JSON.stringify(statusConfig()),
          )
          return
        }
        const pub = webFile(rel)
        if (pub) {
          res.writeHead(200, {
            "Content-Type":
              MIME[path.extname(pub).toLowerCase()] ??
              "application/octet-stream",
            "Cache-Control": "no-cache",
          })
          if (req.method === "HEAD") return res.end()
          fs.createReadStream(pub).pipe(res)
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
