// NEXORA #120 : `pnpm mesures <mesure>` : mesures de performance dans Chromium sans fenêtre.
//   repos [espaces]            aperçu de NEXORA : processeur au repos, rappels d'animation et recalculs de styles par
//                              espace (défaut : les 9 espaces, Studio compris, dans l'ordre du rail) ; espaces nommés
//                              comme pour `pnpm captures` (accueil, apps, securite…) ou par leur identifiant du rail
//                              (home, android…), séparés par des espaces ou des virgules
//   editeur                    Dev Lab de démonstration : temps d'ouverture du premier fichier dans l'éditeur
//   defilement [adresse]       page web (défaut : https://nexoradevs.online/) : geste de défilement réel, images
//                              présentées et coût du fil principal pendant le défilement
// Options : --cpu <n> (processeur ralenti n fois, défaut 1 ; 4 ≈ portable modeste), --attente <ms> (editeur),
//           --dist (defilement : pages et fichiers du site servis depuis dist/, la version construite par
//           `pnpm build` et pas encore publiée, à l'adresse demandée, sans lancer de serveur).
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROME_PATH || "/usr/bin/chromium"
const args = process.argv.slice(2)
const opt = (name, fb) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : fb }
const pos = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")))
const what = pos[0] || "repos"
const cpu = Number(opt("--cpu", "1")) || 1
const fromDist = args.includes("--dist")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const previewBase = () => {
  if (process.env.NX_PREVIEW_URL) return process.env.NX_PREVIEW_URL
  const r = spawnSync("figma", ["make", "preview", "get-local-url"], { encoding: "utf8" })
  const m = /(https?:\/\/[^\s]+)/.exec(r.stdout || "")
  return m ? m[1] : "http://localhost:3000"
}
const version = JSON.parse(fs.readFileSync(new URL("../nexora/app/package.json", import.meta.url), "utf8")).version
const SEED = { tourDone: true, setup: { done: true, chosen: [], pending: [] }, nxSeenVersion: version }
const launch = () => puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--ignore-certificate-errors", "--window-size=1440,900"] })

async function openApp(browser, { demoDev = false } = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  const seed = { ...SEED }
  if (demoDev) {
    const { DEMO_DEV_ROOT } = await import("../preview/demo-dev.mjs")
    seed.devLab = { root: DEMO_DEV_ROOT, open: [], bottom: true, preview: false }
  }
  await page.evaluateOnNewDocument((s, demo) => {
    if (window !== window.top) return
    localStorage.setItem("nexora-preview:settings", s)
    if (demo) localStorage.setItem("nexora-preview:demo", "devlab")
    const raf = window.requestAnimationFrame.bind(window)
    window.__rafCount = 0
    window.requestAnimationFrame = (cb) => raf((t) => { window.__rafCount++; cb(t) })
  }, JSON.stringify(seed), demoDev)
  const cdp = await page.createCDPSession()
  await cdp.send("Performance.enable")
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
  const app = new URL(previewBase())
  app.searchParams.set("app", "")
  const t0 = Date.now()
  await page.goto(app.href, { waitUntil: "load", timeout: 120000 })
  await page.waitForSelector("#modeSeg button[data-mode]", { timeout: 60000 })
  return { page, cdp, railMs: Date.now() - t0 }
}

async function repos() {
  const MODES = { accueil: "home", responsive: "preview", apps: "android", securite: "security" }
  const spaces = (pos.slice(1).join(",") || "home,preview,browser,dev,android,studio,design,security,desktop").split(",").filter(Boolean).map((s) => MODES[s] || s)
  const browser = await launch()
  try {
    const { page, cdp, railMs } = await openApp(browser)
    const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]))
    console.log(`Rail affiché en ${railMs} ms (processeur ×${cpu})`)
    await sleep(4000)
    for (const mode of spaces) {
      const t = Date.now()
      await page.click(`#modeSeg button[data-mode="${mode}"]`)
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))))
      const shown = Date.now() - t
      await sleep(mode === "studio" ? 12000 : 2500)
      const a = await metrics(); const r0 = await page.evaluate(() => window.__rafCount)
      await sleep(4000)
      const b = await metrics(); const r1 = await page.evaluate(() => window.__rafCount)
      const busy = ((b.TaskDuration - a.TaskDuration) / 4) * 100
      console.log(`${`${mode} (${shown} ms)`.padEnd(22)} repos : processeur ${busy.toFixed(1).padStart(5)} %  rappels d'animation/s ${((r1 - r0) / 4).toFixed(0).padStart(3)}  recalculs de styles ${b.RecalcStyleCount - a.RecalcStyleCount}`)
    }
  } finally { await browser.close() }
}

async function editeur() {
  const browser = await launch()
  try {
    const { page } = await openApp(browser, { demoDev: true })
    await sleep(3000)
    await page.click('#modeSeg button[data-mode="dev"]')
    await sleep(Number(opt("--attente", "3000")))
    const t = Date.now()
    const ok = await page.evaluate(async () => {
      const item = [...document.querySelectorAll(".dk-tree [data-path]")].find((e) => /\.(js|html|css|json)$/.test(e.dataset.path || ""))
      if (!item) return "aucun fichier"
      item.click()
      for (let i = 0; i < 1500; i++) {
        const w = document.querySelector(".dk-welcome"); const v = document.querySelector(".dk-monaco .monaco-editor .view-lines")
        if (w && w.hidden && v && v.textContent.trim().length > 5) return "ok"
        await new Promise((r) => setTimeout(r, 10))
      }
      return "délai dépassé"
    })
    console.log(`Premier fichier ouvert dans l'éditeur : ${ok} en ${Date.now() - t} ms (processeur ×${cpu})`)
  } finally { await browser.close() }
}

async function defilement() {
  const url = pos[1] || "https://nexoradevs.online/"
  const browser = await launch()
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    if (fromDist) await serveDist(page, new URL(url).origin)
    await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 })
    await sleep(2500)
    const cdp = await page.createCDPSession()
    if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
    const events = []
    cdp.on("Tracing.dataCollected", (d) => events.push(...d.value))
    const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r))
    await cdp.send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame", transferMode: "ReportEvents" })
    await cdp.send("Input.synthesizeScrollGesture", { x: 720, y: 450, yDistance: -5000, speed: 1500, gestureSourceType: "mouse" })
    await sleep(600)
    await cdp.send("Tracing.end")
    await done
    const main = events.find((e) => e.name === "thread_name" && e.args && e.args.name === "CrRendererMain")
    const totals = new Map()
    const fns = new Map()
    let frames = 0
    let busy = 0
    let layouts = 0
    const draws = []
    for (const e of events) {
      if (e.name === "DrawFrame") { frames++; draws.push(e.ts) }
      if (!main || e.pid !== main.pid || e.tid !== main.tid || e.ph !== "X" || !e.dur) continue
      if (e.name === "RunTask") busy += e.dur
      if (e.name === "Layout") layouts++
      if (["FunctionCall", "FireAnimationFrame", "Layout", "UpdateLayoutTree", "PrePaint", "Paint", "Layerize", "IntersectionObserverController::computeIntersections", "EventDispatch", "HitTest", "ProxyMain::BeginMainFrame"].includes(e.name)) totals.set(e.name, (totals.get(e.name) || 0) + e.dur)
      if (e.name === "FunctionCall" && e.args && e.args.data) {
        const k = `${e.args.data.functionName || "(anonyme)"} ${String(e.args.data.url || "").split("/").pop()}:${e.args.data.lineNumber}:${e.args.data.columnNumber}`
        fns.set(k, (fns.get(k) || 0) + e.dur)
      }
    }
    draws.sort((a, b) => a - b)
    const gaps = draws.slice(1).map((t, i) => (t - draws[i]) / 1000)
    const long = gaps.filter((g) => g > 25).length
    console.log(`${url}${fromDist ? " (dist/)" : ""} · processeur ×${cpu}`)
    console.log(`  images présentées ${frames} · intervalle moyen ${gaps.length ? (gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1) : "—"} ms · images de plus de 25 ms ${long} · fil principal occupé ${(busy / 1000).toFixed(0)} ms · mises en page ${layouts}`)
    for (const [k, v] of [...totals].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(52)} ${(v / 1000).toFixed(0).padStart(6)} ms`)
    console.log("  fonctions les plus coûteuses :")
    for (const [k, v] of [...fns].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`    ${k.slice(0, 74).padEnd(76)} ${(v / 1000).toFixed(0).padStart(5)} ms`)
  } finally { await browser.close() }
}

// --dist : chaque requête vers l'adresse mesurée reçoit le fichier de dist/ (page pré-générée « chemin.html » pour
// une adresse sans extension, comme la publication) ; les autres adresses partent sur le réseau.
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml" }
async function serveDist(page, origin) {
  const root = new URL("../dist/", import.meta.url)
  if (!fs.existsSync(root)) throw new Error("dist/ absent : lancer d'abord pnpm build.")
  await page.setBypassServiceWorker(true)
  await page.setRequestInterception(true)
  page.on("request", (req) => {
    const u = new URL(req.url())
    if (u.origin !== origin) return req.continue()
    const p = decodeURIComponent(u.pathname)
    for (const c of p.endsWith("/") ? [p + "index.html"] : [p, p + ".html", p + "/index.html"]) {
      const file = new URL("." + c, root)
      if (!file.pathname.startsWith(root.pathname)) break
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        return req.respond({ status: 200, contentType: MIME[path.extname(file.pathname)] || "application/octet-stream", body: fs.readFileSync(file) })
      }
    }
    req.respond({ status: 404, contentType: "text/plain; charset=utf-8", body: "Introuvable dans dist/." })
  })
}

const run = { repos, editeur, defilement }[what]
if (!run) { console.error(`Mesure inconnue : ${what} (repos, editeur, defilement).`); process.exit(1) }
await run()
