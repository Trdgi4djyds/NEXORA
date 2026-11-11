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
// NEXORA #101 : composition du hero (référence de l'utilisateur : outil de design) : colonnes de lumière, titre dans
// un cadre de sélection, pastille de couleur, curseur « Agent IA » ; aucune photo ni rendu 3D.
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 })
const ogFile = path.join(ROOT, "node_modules", ".cache", "nexora-og.html")
fs.mkdirSync(path.dirname(ogFile), { recursive: true })
fs.writeFileSync(
  ogFile,
  `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:U;src:url(${font("urbanist-var.woff2")});font-weight:300 700}
  *{margin:0;box-sizing:border-box}body{width:1200px;height:630px;color:#fff;font-family:U;position:relative;overflow:hidden;
  background:radial-gradient(55% 34% at 50% -4%,rgba(48,74,255,.75),transparent 72%),radial-gradient(60% 32% at 50% 104%,rgba(72,152,247,.6),transparent 72%),radial-gradient(28% 26% at 6% 102%,rgba(139,92,246,.55),transparent 70%),radial-gradient(28% 26% at 94% 0%,rgba(139,92,246,.5),transparent 70%),repeating-linear-gradient(90deg,transparent 0 99px,rgba(255,255,255,.1) 99px 100px),#000}
  .sel{position:absolute;left:50%;top:150px;translate:-50% 0;border:2px solid #4898f7;padding:2px 14px 8px;text-align:center}
  h1{font:600 128px/.92 U;letter-spacing:-.035em;white-space:nowrap}mark{display:inline-block;line-height:.92;color:#cfe0ff;background:rgba(72,152,247,.26)}
  .h{position:absolute;width:13px;height:13px;background:#000;border:2px solid #4898f7}.tl{left:-8px;top:-8px}.tr{right:-8px;top:-8px}.bl{left:-8px;bottom:-8px}.br{right:-8px;bottom:-8px}
  .chip{position:absolute;left:20px;top:-58px;display:flex;align-items:center;gap:10px;height:38px;padding:0 12px 0 8px;border-radius:8px;background:#1d1d22;font:500 15px U}.chip i{width:24px;height:24px;border-radius:5px;background:#4898f7}
  .size{position:absolute;left:50%;bottom:-44px;translate:-50% 0;padding:6px 12px;border-radius:6px;background:#4898f7;font:500 15px U}
  .agent{position:absolute;right:-118px;top:56%;padding:5px 9px;border-radius:5px;background:#f45d3c;font:600 14px U}
  .brand{position:absolute;left:56px;bottom:44px;font:700 34px U;letter-spacing:-.02em}.brand i{font-style:normal;color:#4898f7}
  .pill{position:absolute;right:56px;bottom:44px;padding:12px 20px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(120,130,255,.14);font:500 17px U}
  .url{position:absolute;left:50%;bottom:52px;translate:-50% 0;font:500 18px U;color:rgba(255,255,255,.75)}
  </style></head><body>
  <div class="sel"><span class="chip"><i></i>4898F7</span><i class="h tl"></i><i class="h tr"></i><i class="h bl"></i><i class="h br"></i><span class="agent">Agent IA</span>
  <h1><mark>L’atelier</mark> web<br>tout-en-un</h1><span class="size">nexoradevs.online</span></div>
  <span class="brand">NEXORA<i>.</i></span><span class="pill">Design × Code × Supervision</span>
  </body></html>`,
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
