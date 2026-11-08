// NEXORA #070 : maquettes animées du site vitrine : vraies interfaces, vrais appareils, transitions de page.
//   node scripts/videos-vitrine.mjs [kora-mobile|kora-web|appareils|windows …]   (défaut : les quatre)
//   node scripts/videos-vitrine.mjs --essai <dossier> [noms…]   images clés en JPEG dans <dossier>, sans encoder
// 1. Sert l'interface de NEXORA (nexora/app/renderer/ : moteur des Maquettes du Studio 3D & Motion et aperçu
//    Windows 11 du Desktop Builder), le site de démonstration Kora (scripts/vitrine/kora/), les captures sombres
//    du site (site/src/assets/ecrans/) et le compositeur (scripts/vitrine/videos/).
// 2. Prend les pages de Kora en pleine hauteur (mobile 402 points en double densité, bureau 1440 points) avec la
//    position des éléments touchés, puis l'écran Windows 11 de l'aperçu du Desktop Builder (NEXORA agrandi, Kora
//    installé comme logiciel) à la taille de l'écran du Surface Laptop 15.
// 3. Compose chaque image dans Chromium (scripts/vitrine/videos/composer.js) et l'envoie à ffmpeg (H.264, boucle
//    de 12 s à 30 images par seconde).
// Résultat : site/src/assets/videos/<nom>.mp4 et son image d'attente <nom>.webp. Rien n'est publié d'autre.
import { spawn, spawnSync } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import puppeteer from "puppeteer-core"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUT = path.join(ROOT, "site", "src", "assets", "videos")
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-videos-"))
const CHROMIUM = process.env.CHROME_PATH || "/usr/bin/chromium"
const PORT = 4183
const BASE = `http://localhost:${PORT}`
const ROUTES = [
  ["/kora/", path.join(ROOT, "scripts", "vitrine", "kora")],
  ["/ecrans/", path.join(ROOT, "site", "src", "assets", "ecrans")],
  ["/videos/", path.join(ROOT, "scripts", "vitrine", "videos")],
  ["/tmp/", TMP],
  ["/", path.join(ROOT, "nexora", "app", "renderer")],
]
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".wasm": "application/wasm" }
const ALL = ["kora-mobile", "kora-web", "appareils", "windows"]
const LOOP = 12
const FPS = 30
// Qualité (CRF de x264) : écrans à plat plus nets, appareils (toute l'image bouge à chaque image) plus légers.
const CRF = { "kora-mobile": 27, "kora-web": 27, appareils: 26, windows: 27 }
// Images JPEG (YCbCr BT.601, pleine plage) converties en plage vidéo BT.709, balisée : lue partout de la même
// façon (une vidéo en pleine plage peut sortir délavée sur certains lecteurs). aq-mode 3 : moins de bandes dans
// les ombres sombres.
const X264 = ["-vf", "scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709", "-c:v", "libx264", "-preset", "veryslow", "-profile:v", "high", "-x264-params", "aq-mode=3"]
// Image d'attente : un instant représentatif de chaque boucle.
const POSTER = { "kora-mobile": 1.2, "kora-web": 1.4, appareils: 0.9, windows: 4.2 }

// Moteur des Maquettes servi avec un recouvrement des triangles de 2 px au lieu de 0,8 : la perspective de l'écran
// est dessinée triangle par triangle (At) et, sur l'hypoténuse, 0,8 px écarté du centre ne recouvre qu'environ
// 0,3 px ; sur un écran sombre, la tranche argentée transparaît alors en fines diagonales (A-035). Le fichier de
// l'application n'est pas modifié : seule la copie servie au compositeur l'est.
const SEAM = ["return[p[0]+m/C*.8,p[1]+b/C*.8]", "return[p[0]+m/C*2,p[1]+b/C*2]"]
function serve() {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname)
    if (/^\/dist\/chunks\/mockup-[\w-]+\.js$/.test(pathname)) {
      const code = fs.readFileSync(path.join(ROOT, "nexora", "app", "renderer", pathname), "utf8")
      if (code.split(SEAM[0]).length !== 2) throw new Error("Moteur des Maquettes : recouvrement des triangles introuvable.")
      res.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" }).end(code.replace(SEAM[0], SEAM[1]))
      return
    }
    const route = ROUTES.find(([prefix]) => pathname.startsWith(prefix))
    const file = path.join(route[1], pathname.slice(route[0].length))
    if (!file.startsWith(route[1]) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise((ok) => server.listen(PORT, () => ok(server)))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Pages de Kora : capture pleine hauteur, hauteur de l'en-tête collant et position des éléments touchés.
async function koraPages(browser, kind) {
  const mobile = kind === "mobile"
  const vw = mobile ? 402 : 1440
  const vh = mobile ? 874 : 900
  const dpr = mobile ? 2 : 1
  const pages = {}
  const tap = {}
  const target = { index: '.p[href="produit.html"]', produit: ".buy .btn", commande: ".box .btn" }
  for (const name of ["index", "produit", "commande"]) {
    const page = await browser.newPage()
    await page.setViewport({ width: vw, height: vh, deviceScaleFactor: dpr })
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    await page.goto(`${BASE}/kora/${name}.html`, { waitUntil: "networkidle0" })
    await page.evaluate(() => document.fonts.ready)
    const info = await page.evaluate((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect()
      return { h: document.documentElement.scrollHeight, header: document.querySelector("header").getBoundingClientRect().height, tap: [r.left + r.width / 2, r.top + r.height / 2 + scrollY] }
    }, target[name])
    const file = path.join(TMP, `kora-${kind}-${name}.png`)
    await page.screenshot({ path: file, fullPage: true })
    pages[name] = { img: `kora-${kind}-${name}`, h: info.h, header: info.header }
    tap[name] = info.tap
    await page.close()
  }
  // Défilement : l'élément touché finit aux deux tiers de l'écran (sans dépasser le bas de la page).
  const scroll = {}
  for (const name of Object.keys(pages)) {
    const max = pages[name].h - vh
    const goal = mobile ? (name === "index" ? 0.42 : 0.7) : name === "index" ? 0.5 : 0.62
    scroll[name] = Math.max(0, Math.min(max, Math.round(tap[name][1] - vh * goal)))
  }
  return { w: vw, h: vh, dpr, pages, tap, scroll }
}

async function main() {
  const args = process.argv.slice(2)
  const essai = args.includes("--essai") ? path.resolve(args[args.indexOf("--essai") + 1] ?? "") : null
  const wanted = args.filter((a) => ALL.includes(a))
  const todo = wanted.length ? wanted : ALL
  if (essai) fs.mkdirSync(essai, { recursive: true })
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) throw new Error("ffmpeg introuvable.")
  fs.mkdirSync(OUT, { recursive: true })
  const mockup = fs.readdirSync(path.join(ROOT, "nexora", "app", "renderer", "dist", "chunks")).find((f) => /^mockup-.*\.js$/.test(f))
  const server = await serve()
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] })
  const problems = []
  try {
    const mobile = await koraPages(browser, "mobile")
    const web = await koraPages(browser, "desktop")
    console.log(`Pages de Kora capturées (défilements mobile ${JSON.stringify(mobile.scroll)}, bureau ${JSON.stringify(web.scroll)}).`)

    const page = await browser.newPage()
    page.on("pageerror", (e) => problems.push(`exception : ${e.message}`))
    page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.location()?.url || "") && problems.push(`console : ${m.text()}`))
    await page.setViewport({ width: 1700, height: 1200 })
    await page.goto(`${BASE}/videos/composer.html`, { waitUntil: "load" })
    await page.waitForFunction(() => window.NX)
    const icon = await page.evaluate(async () => {
      await document.fonts.load('700 78px "Playfair Display"')
      return window.NX.koraIcon()
    })
    // Écrans Windows 11 de l'aperçu du Desktop Builder (écran du Surface Laptop 15 : 1664 × 1109 points).
    const shells = {}
    for (const kind of ["nexora", "kora"]) {
      shells[kind] = await page.evaluate((k, ic) => window.NX.shell(k, 1664, 1109, k === "nexora" ? "/logo.png" : ic), kind, icon)
      const os = await page.$("#os")
      await os.screenshot({ path: path.join(TMP, `shell-${kind}.png`), omitBackground: true })
    }
    // Boutons des espaces dans la barre latérale de NEXORA, pour 1600 × 1000 (captures du site).
    const rail = { home: [46, 107], preview: [46, 181], browser: [46, 242], dev: [46, 303], android: [46, 364], studio: [46, 425], design: [46, 486], security: [46, 547], desktop: [46, 608] }
    const ecran = { dev: "dev", preview: "responsive", security: "securite", studio: "studio", design: "design", home: "accueil" }
    const images = { shellNexora: "/tmp/shell-nexora.png", shellKora: "/tmp/shell-kora.png" }
    for (const [id, file] of Object.entries(ecran)) images[`ecran-${id}`] = `/ecrans/${file}-sombre.webp`
    for (const set of [mobile, web]) for (const p of Object.values(set.pages)) images[p.img] = `/tmp/${p.img}.png`
    const n = await page.evaluate((cfg) => window.NX.init(cfg), { mockup, mobile, web, shells, rail, images })
    console.log(`Compositeur prêt (${n} images).`)
    // Chapitres des boucles (espaces de NEXORA, pages de Kora), lus par le site pour suivre la vidéo.
    if (!essai) {
      const ch = await page.evaluate(() => window.NX.chapters())
      fs.writeFileSync(path.join(OUT, "chapitres.json"), `${JSON.stringify(ch, null, 2)}\n`)
    }

    for (const name of todo) {
      if (essai) {
        // Images clés : avant, pendant et après chaque transition de page.
        for (const t of [0.3, 1.6, 2.6, 2.95, 3.6, 5.2, 5.65, 7.0, 8.0, 8.55, 10]) {
          const url = await page.evaluate((nm, i) => window.NX.frame(nm, i), name, Math.round(t * FPS))
          fs.writeFileSync(path.join(essai, `${name}-${t.toFixed(2)}.jpg`), Buffer.from(url.slice(url.indexOf(",") + 1), "base64"))
        }
        console.log(`  ${name} : images clés écrites dans ${essai}`)
        continue
      }
      const file = path.join(OUT, `${name}.mp4`)
      const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", ...X264, "-crf", String(CRF[name]), "-g", String(FPS * 2), "-movflags", "+faststart", "-an", file], { stdio: ["pipe", "inherit", "inherit"] })
      const done = new Promise((ok, ko) => ff.on("close", (code) => (code === 0 ? ok() : ko(new Error(`ffmpeg ${name} : code ${code}`)))))
      const started = Date.now()
      const total = LOOP * FPS
      for (let f = 0; f < total; f += 1) {
        const url = await page.evaluate((nm, i) => window.NX.frame(nm, i), name, f)
        const buf = Buffer.from(url.slice(url.indexOf(",") + 1), "base64")
        if (f === Math.round(POSTER[name] * FPS)) fs.writeFileSync(path.join(TMP, `${name}-poster.jpg`), buf)
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r))
      }
      ff.stdin.end()
      await done
      const poster = path.join(OUT, `${name}.webp`)
      const conv = spawnSync("convert", [path.join(TMP, `${name}-poster.jpg`), "-quality", "78", poster])
      if (conv.status !== 0) problems.push(`image d'attente ${name} : échec de la conversion`)
      console.log(`  ${name}.mp4 : ${(fs.statSync(file).size / 1048576).toFixed(2)} Mo, ${total} images en ${Math.round((Date.now() - started) / 1000)} s ; ${name}.webp : ${Math.round(fs.statSync(poster).size / 1024)} Ko`)
    }
  } finally {
    await browser.close()
    server.close()
    fs.rmSync(TMP, { recursive: true, force: true })
  }
  if (problems.length) {
    console.error(`Erreurs relevées :\n  ${problems.join("\n  ")}`)
    process.exitCode = 1
  }
}

await main()
