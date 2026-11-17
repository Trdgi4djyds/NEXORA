// NEXORA #129 : écrans de la vidéo de présentation, en double résolution (textes nets dans les zooms).
//   pnpm build && node scripts/video/ecrans.mjs [espace… | kora]
// Mêmes scènes que les écrans du site vitrine (scripts/ecrans-vitrine.mjs : compte de démonstration Pro, site Kora
// dans les appareils, Dev Lab et supervision de démonstration), en thème sombre, 1600 × 1000 à l'échelle 2
// (3200 × 2000), rangées dans scripts/video/ecrans/ ; plus le site Kora en bureau (1440 × 900 à l'échelle 2) et sa
// page entière en bureau (kora-page : le site « qui déborde » d'un téléphone, au début de la vidéo).
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"
import puppeteer from "puppeteer-core"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const OUT = path.join(ROOT, "scripts", "video", "ecrans")
const KORA = path.join(ROOT, "scripts", "vitrine", "kora")
const CHROMIUM = process.env.CHROME_PATH || "/usr/bin/chromium"
const SPACES = ["accueil", "responsive", "dev", "apps", "studio", "design", "securite", "desktop"]

const wanted = process.argv.slice(2)
const spaces = wanted.length ? SPACES.filter((s) => wanted.includes(s)) : SPACES
fs.mkdirSync(OUT, { recursive: true })

if (!wanted.length || wanted.includes("kora")) {
  const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".woff": "font/woff", ".woff2": "font/woff2", ".svg": "image/svg+xml" }
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname)
    if (rel.endsWith("/")) rel += "index.html"
    const file = path.join(KORA, rel)
    if (!file.startsWith(KORA) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end()
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" })
    fs.createReadStream(file).pipe(res)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu"] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "networkidle0" })
    await page.evaluate(() => document.fonts.ready)
    await new Promise((r) => setTimeout(r, 800))
    const png = path.join(OUT, "kora-bureau.png")
    await page.screenshot({ path: png })
    spawnSync("convert", [png, "-quality", "84", path.join(OUT, "kora-bureau.webp")])
    fs.rmSync(png)
    console.log("  kora-bureau.webp (1440 × 900 @2)")
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
    await new Promise((r) => setTimeout(r, 500))
    await page.screenshot({ path: png, fullPage: true })
    spawnSync("convert", [png, "-quality", "82", path.join(OUT, "kora-page.webp")])
    fs.rmSync(png)
    console.log("  kora-page.webp (page entière, 1440 de large)")
  } finally {
    await browser.close()
    server.close()
  }
}

if (spaces.length) {
  if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) throw new Error("dist/ absent : lancer d'abord pnpm build.")
  const res = spawnSync("node", ["scripts/ecrans-vitrine.mjs", "--sombre", "--echelle", "2", "--sortie", path.relative(ROOT, OUT), ...spaces], { cwd: ROOT, stdio: "inherit" })
  if (res.status !== 0) process.exitCode = 1
}
