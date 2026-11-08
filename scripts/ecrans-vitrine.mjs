// NEXORA #066 : écrans du site vitrine, tirés de la vraie interface de NEXORA (plus aucune reproduction).
//   pnpm build && node scripts/ecrans-vitrine.mjs [espace…]
// Sert dist/ (version web : les appareils affichent les sites dans des cadres) et le site de démonstration
// « Kora » (scripts/vitrine/kora/, photos Unsplash), lance `scripts/captures.mjs` pour chaque espace avec un
// compte de démonstration Pro, l'adresse du site saisie là où l'espace en a besoin et les notifications
// masquées, puis range des WebP dans site/src/assets/ecrans/ (plus kora-bureau.webp et kora-mobile.webp).
import { spawn, spawnSync } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"
import puppeteer from "puppeteer-core"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DIST = path.join(ROOT, "dist")
const KORA = path.join(ROOT, "scripts", "vitrine", "kora")
const OUT = path.join(ROOT, "site", "src", "assets", "ecrans")
const CHROMIUM = process.env.CHROME_PATH || "/usr/bin/chromium"
const WEB = "http://localhost:4180/"
const SITE = "http://localhost:4181/"

// Lancement asynchrone : les serveurs ci-dessus tournent dans ce même processus et doivent rester disponibles.
function run(cmd, args, env) {
  return new Promise((ok) => {
    const child = spawn(cmd, args, { cwd: ROOT, env })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (d) => (stdout += d))
    child.stderr.on("data", (d) => (stderr += d))
    child.on("close", (status) => ok({ status, stdout, stderr }))
  })
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".ico": "image/x-icon", ".wasm": "application/wasm" }
function serve(dir, port) {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname)
    if (rel.endsWith("/")) rel += "index.html"
    const file = path.join(dir, rel)
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise((ok) => server.listen(port, () => ok(server)))
}

// Pour chaque espace : version web (cadres réels) ou aperçu (démonstrations du Dev Lab et de la supervision).
const PLAN = [
  { slug: "accueil", web: true, args: [] },
  { slug: "responsive", web: true, args: ["--saisir", `https://monsite=${SITE}`, "--attendre", "3500"] },
  // Le Browser Lab affiche la page dans une vraie webview d'Electron, absente de la version web : écran d'accueil.
  { slug: "browser", web: true, args: [] },
  { slug: "dev", web: false, args: ["--demo-dev", "--click", "server.js"] },
  // L'aperçu « Application » charge le site dans une webview d'Electron : écran de démarrage à la place.
  { slug: "apps", web: true, args: ["--click", "Démarrage"] },
  { slug: "studio", web: true, args: [] },
  { slug: "design", web: true, args: ["--click", "Publication promo"] },
  { slug: "securite", web: false, args: ["--demo", "--click", "Supervision & alertes"] },
  // Sans adresse : une adresse locale en http ferait afficher l'avertissement « échanges non chiffrés ».
  { slug: "desktop", web: true, args: [] },
]

async function koraShots() {
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu"] })
  for (const [name, w, h, scale] of [["kora-bureau", 1440, 900, 1], ["kora-mobile", 390, 844, 2]]) {
    const page = await browser.newPage()
    await page.setViewport({ width: w, height: h, deviceScaleFactor: scale })
    await page.goto(SITE, { waitUntil: "networkidle0" })
    await page.screenshot({ path: path.join(OUT, `${name}.webp`), type: "webp", quality: 80 })
    console.log(`  ${name}.webp`)
  }
  await browser.close()
}

if (!fs.existsSync(path.join(DIST, "index.html"))) throw new Error("dist/ absent : lancer d'abord pnpm build.")
fs.mkdirSync(OUT, { recursive: true })
// --sombre : mêmes écrans dans le thème sombre de NEXORA, fichiers « <espace>-sombre.webp » (#068).
const dark = process.argv.includes("--sombre")
const wanted = process.argv.slice(2).filter((a) => a !== "--sombre")
const servers = [await serve(DIST, 4180), await serve(KORA, 4181)]
let failed = 0
try {
  if (!dark && (!wanted.length || wanted.includes("kora"))) await koraShots()
  for (const step of PLAN.filter((p) => !wanted.length || wanted.includes(p.name ?? p.slug))) {
    const args = ["scripts/captures.mjs", step.slug, "--compte", "demo", "--taille", "1600x1000", "--sans-notifications", "--label", `vitrine-${step.name ?? step.slug}${dark ? "-sombre" : ""}`, ...(dark ? ["--theme", "sombre"] : []), ...(step.web ? ["--url", WEB] : []), ...step.args]
    const res = await run("node", args, { ...process.env, NX_DEMO_OFFRE: "pro" })
    const png = /captures\/\S+\.png/.exec(res.stdout || "")?.[0]
    if (res.status !== 0 || !png) {
      failed += 1
      console.error(`ÉCHEC ${step.slug} :\n${(res.stderr || res.stdout || "").slice(-800)}`)
      continue
    }
    const out = path.join(OUT, `${step.name ?? step.slug}${dark ? "-sombre" : ""}.webp`)
    const conv = spawnSync("convert", [path.join(ROOT, png), "-quality", "80", out])
    if (conv.status !== 0) {
      failed += 1
      console.error(`ÉCHEC conversion ${step.slug}`)
      continue
    }
    console.log(`  ${step.name ?? step.slug}${dark ? "-sombre" : ""}.webp (${Math.round(fs.statSync(out).size / 1024)} Ko, depuis ${png})`)
  }
} finally {
  for (const s of servers) s.close()
}
if (failed) process.exitCode = 1
