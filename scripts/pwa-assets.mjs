// NEXORA #096 : fichiers de l'application installable (PWA) et du partage, rangés dans site/public/ et versionnés
// (la construction de Cloudflare n'a ni ImageMagick ni Chromium) : icônes « any » et « maskable », icône Apple,
// favicon, captures pour le manifeste (larges 1280 × 800 et étroites 780 × 1688), image de partage 1200 × 630.
//   node scripts/pwa-assets.mjs            icônes et image de partage
//   node scripts/pwa-assets.mjs --captures captures en plus (aperçu Figma Make lancé : http://localhost:3000/site/)
// À relancer quand le logo, le design ou le contenu du haut de page changent.
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import puppeteer from "puppeteer-core"

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const PUB = path.join(ROOT, "site", "public")
const SRC = path.join(ROOT, "nexora", "app", "build", "icon.png")
const BG = "#e4dbef"
const magick = (...args) => execFileSync("magick", args, { stdio: "inherit" })
for (const d of ["icons", "screenshots", "og"]) fs.mkdirSync(path.join(PUB, d), { recursive: true })

// Icônes « any » : le logo tel quel (coins transparents du squircle).
for (const s of [48, 72, 96, 144, 192, 256, 384, 512]) magick(SRC, "-resize", `${s}x${s}`, "-strip", path.join(PUB, "icons", `icon-${s}.png`))
// Icônes « maskable » : fond plein, logo dans la zone sûre (80 % du côté).
for (const s of [192, 512]) {
  const inner = Math.round(s * 0.8)
  magick("-size", `${s}x${s}`, `xc:${BG}`, "(", SRC, "-resize", `${inner}x${inner}`, ")", "-gravity", "center", "-composite", "-strip", path.join(PUB, "icons", `icon-maskable-${s}.png`))
}
// Icône Apple (180 × 180, opaque) et favicon (16, 32, 48).
magick("-size", "180x180", `xc:${BG}`, "(", SRC, "-resize", "164x164", ")", "-gravity", "center", "-composite", "-strip", path.join(PUB, "icons", "apple-touch-icon.png"))
magick(SRC, "-define", "icon:auto-resize=48,32,16", path.join(PUB, "favicon.ico"))

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/chromium", args: ["--no-sandbox", "--allow-file-access-from-files"] })
const page = await browser.newPage()

// Image de partage (Open Graph, X, LinkedIn, messageries) : composition aux couleurs du site.
const font = (f) => pathToFileURL(path.join(ROOT, "site", "src", "assets", "fonts", f)).href
const logo = pathToFileURL(SRC).href
const dots = ["#3048ff", "#0a9e9b", "#7340f0", "#1f8f52", "#e03c98", "#f5b400", "#e5352f", "#1d86e0", "#ff6a1f"]
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 })
const ogFile = path.join(ROOT, "node_modules", ".cache", "nexora-og.html")
fs.mkdirSync(path.dirname(ogFile), { recursive: true })
fs.writeFileSync(
  ogFile,
  `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:T;src:url(${font("inter-tight-var.woff2")});font-weight:400 900}
  @font-face{font-family:I;src:url(${font("inter-var.woff2")});font-weight:400 700}
  @font-face{font-family:M;src:url(${font("jetbrains-mono-normal.woff2")})}
  *{margin:0;box-sizing:border-box}body{width:1200px;height:630px;background:#0b0b0c;color:#f4f4f1;font-family:I;position:relative;overflow:hidden}
  .band{position:absolute;right:-120px;top:-140px;width:560px;height:560px;border-radius:50%;background:#d4ff3a;opacity:.12;filter:blur(90px)}
  .wrap{position:absolute;inset:64px 72px}.brand{display:flex;align-items:center;gap:18px}.brand img{width:72px;height:72px}
  .brand b{font:700 34px T;letter-spacing:-.02em}h1{margin-top:52px;font:700 84px/0.92 T;letter-spacing:-.045em;max-width:900px}
  h1 span{color:#d4ff3a}.foot{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:space-between}
  .dots{display:flex;gap:10px}.dots i{width:26px;height:26px;border-radius:50%}.url{font:500 22px M;color:#a09f9a;letter-spacing:.04em}
  .tag{display:inline-block;margin-top:26px;font:500 18px M;letter-spacing:.08em;text-transform:uppercase;color:#0b0b0c;background:#d4ff3a;padding:8px 14px;border-radius:999px}
  </style></head><body><i class="band"></i><div class="wrap">
  <div class="brand"><img src="${logo}"><b>NEXORA</b></div>
  <h1>L’atelier complet du web, <span>installé sur ton PC.</span></h1>
  <span class="tag">Design · Code · Tests · Apps · Windows</span>
  <div class="foot"><div class="dots">${dots.map((c) => `<i style="background:${c}"></i>`).join("")}</div><span class="url">nexoradevs.online</span></div>
  </div></body></html>`,
)
// Fichier local (et non setContent) : une page vide ne peut pas lire les polices ni le logo du dépôt.
await page.goto(pathToFileURL(ogFile).href, { waitUntil: "load" })
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: path.join(PUB, "og", "nexora-1200x630.png") })

// Captures du manifeste : vraies pages du site (aperçu), sans le bandeau de défilement.
if (process.argv.includes("--captures")) {
  const base = process.env.SITE_URL || "http://localhost:3000/site"
  const shots = [
    ["accueil-1280x800", "/", 1280, 800, 1],
    ["espaces-1280x800", "/espaces", 1280, 800, 1],
    ["app-builder-1280x800", "/espaces/apps", 1280, 800, 1],
    ["mobile-accueil-780x1688", "/", 390, 844, 2],
    ["mobile-espaces-780x1688", "/espaces", 390, 844, 2],
  ]
  for (const [name, route, w, h, dpr] of shots) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr })
    await page.goto(`${base}${route}`, { waitUntil: "networkidle2" })
    await new Promise((r) => setTimeout(r, 2600))
    await page.screenshot({ path: path.join(PUB, "screenshots", `${name}.png`) })
  }
  for (const f of fs.readdirSync(path.join(PUB, "screenshots"))) magick(path.join(PUB, "screenshots", f), "-strip", "-quality", "92", path.join(PUB, "screenshots", f))
}
// Icônes lourdes : palette réduite (taille divisée par 3 à 5, dégradés du logo préservés à l'œil).
for (const f of ["icon-maskable-192.png", "icon-maskable-512.png", "apple-touch-icon.png"]) {
  const file = path.join(PUB, "icons", f)
  magick(file, "-dither", "FloydSteinberg", "-colors", "256", "-strip", "-define", "png:compression-level=9", file)
}
await browser.close()
console.log("Fichiers PWA et partage écrits dans site/public/.")
