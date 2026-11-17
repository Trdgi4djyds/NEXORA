// NEXORA #128 : `pnpm video:presentation` enregistre la vidéo de présentation de NEXORA (scripts/video/presentation.html)
// image par image avec le Chromium du système, puis l'assemble avec ffmpeg (H.264, 1920 × 1080, sans son).
// La composition ne dépend que du temps (window.seek(t)) : le rendu est identique à chaque passage.
//
// Options :
//   --out <fichier>      vidéo produite (défaut : videos/nexora-presentation.mp4 ; videos/ est ignoré par Git)
//   --fps <n>            images par seconde (défaut : 30)
//   --images <t,t,…>     seulement ces instants (secondes), en PNG dans --dossier, sans vidéo (contrôle rapide)
//   --dossier <dossier>  dossier des images de --images (défaut : captures/AAAA-MM-JJ-video)
//   --de <s> --a <s>     enregistre seulement cette portion (essai)
import { spawn } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import puppeteer from "puppeteer-core"
import { ROOT } from "../preview/server.mjs"

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const FPS = Number(opt("fps", 30))
const OUT = path.resolve(ROOT, opt("out", "videos/nexora-presentation.mp4"))
const STILLS = opt("images", "")
const STILL_DIR = path.resolve(ROOT, opt("dossier", `captures/${new Date().toISOString().slice(0, 10)}-video`))
const CHROMIUM = process.env.CHROME_PATH || "/usr/bin/chromium"

// Serveur des fichiers du dépôt (polices, captures, icônes), sur un port libre de la machine locale.
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" }
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname)
  const file = path.join(ROOT, rel)
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404)
    res.end()
    return
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" })
  fs.createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const url = `http://127.0.0.1:${server.address().port}/scripts/video/presentation.html`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--force-device-scale-factor=1", "--hide-scrollbars"] })
const page = await browser.newPage()
const problems = []
page.on("pageerror", (e) => problems.push(`exception : ${e.message}`))
page.on("console", (m) => { if (m.type() === "error") problems.push(`console : ${m.text()}`) })
page.on("requestfailed", (r) => problems.push(`requête : ${r.url()}`))
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })
await page.goto(url, { waitUntil: "load" })
await page.waitForFunction(() => window.__ready instanceof Promise, { timeout: 15000 })
await page.evaluate(() => window.__ready)
const duration = await page.evaluate(() => window.DURATION)
const shot = async (t, opts) => {
  await page.evaluate((x) => window.seek(x), t)
  return page.screenshot({ clip: { x: 0, y: 0, width: 1920, height: 1080 }, ...opts })
}

try {
  if (STILLS) {
    fs.mkdirSync(STILL_DIR, { recursive: true })
    for (const t of STILLS.split(",").map(Number)) {
      const file = path.join(STILL_DIR, `image-${String(t.toFixed(1)).padStart(5, "0")}s.png`)
      fs.writeFileSync(file, await shot(t, { type: "png" }))
      console.log(path.relative(ROOT, file))
    }
  } else {
    const from = Number(opt("de", 0)), to = Math.min(Number(opt("a", duration)), duration)
    const frames = Math.round((to - from) * FPS)
    fs.mkdirSync(path.dirname(OUT), { recursive: true })
    const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
      // Plage de couleurs « TV » (yuv420p) : les images JPEG sont en plage complète, que certains lecteurs affichent délavée.
      "-vf", "scale=in_range=pc:out_range=tv,format=yuv420p", "-color_range", "tv",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-movflags", "+faststart", OUT], { stdio: ["pipe", "inherit", "inherit"] })
    const done = new Promise((resolve, reject) => ff.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg : code ${c}`)))))
    const started = Date.now()
    for (let i = 0; i < frames; i += 1) {
      const buf = await shot(from + i / FPS, { type: "jpeg", quality: 94, optimizeForSpeed: true })
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r))
      if (i % (FPS * 5) === 0) console.log(`  ${(from + i / FPS).toFixed(0).padStart(3)} s / ${to} s (${Math.round((Date.now() - started) / 1000)} s écoulées)`)
    }
    ff.stdin.end()
    await done
    console.log(`Vidéo : ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1048576).toFixed(1)} Mo, ${frames} images, ${FPS} i/s, ${to - from} s)`)
  }
} finally {
  await browser.close()
  server.close()
}
console.log(problems.length ? `Erreurs relevées :\n  ${problems.join("\n  ")}` : "Erreurs relevées : aucune.")
if (problems.some((p) => p.startsWith("exception"))) process.exitCode = 1
