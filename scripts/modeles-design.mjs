// NEXORA #118 : images tirées de NEXORA lui-même (aperçu Figma Make, Chromium sans fenêtre) :
//   node scripts/modeles-design.mjs [vignettes] [site] [studio]   (sans argument : les trois)
// - vignettes : aperçu de chaque modèle « photo » de NEX-DESIGN avec le kit de marque par défaut
//   → nexora/app/renderer/nx/design/modeles/<modèle>.webp (montré par « Commencez avec un modèle »).
// - site : chaque modèle appliqué avec un kit de marque fictif différent, exporté en 1600 px
//   → site/src/assets/realisations/<modèle>.webp (galerie de la page NEX-DESIGN du site).
// - studio : chaque mise en scène réaliste du Studio, rendue en image (éditeur masqué)
//   → site/src/assets/realisations/studio-<mise-en-scène>.webp (galerie de la page Studio du site).
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import puppeteer from "puppeteer-core"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const THUMBS = path.join(ROOT, "nexora", "app", "renderer", "nx", "design", "modeles")
const GALLERY = path.join(ROOT, "site", "src", "assets", "realisations")
const CHROMIUM = process.env.CHROME_PATH || "/usr/bin/chromium"
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "nexora", "app", "package.json"), "utf8")).version

const TEMPLATES = ["planche", "mosaique", "cartes", "facade", "rochers", "dessous", "tablette"]
const STAGINGS = ["rochers", "dessous", "diagonale", "tablette"]
// Marques fictives (aucune vraie entreprise), une par réalisation : montre que tout suit le kit de marque.
const kit = (name, accent, title = "NX Inter") => ({ name, colors: [accent, "#ff5b3a", "#ffd23f", "#111113", "#f4f4f1"], fonts: { title, body: "NX Inter" }, logo: null })
const KITS = {
  planche: kit("Altura", "#c6f24e", "NX Space Grotesk"),
  mosaique: kit("Lumi", "#2fd27a"),
  cartes: kit("Viora", "#ff6a2c"),
  facade: kit("Avela", "#3d6bff"),
  rochers: kit("Pixa", "#ff7a2f", "NX Space Grotesk"),
  dessous: kit("Daxo", "#34d17c"),
  tablette: kit("Orya", "#2bb673"),
  "studio-rochers": kit("Pixa", "#ff7a2f"),
  "studio-dessous": kit("Daxo", "#34d17c"),
  "studio-diagonale": kit("Avela", "#3d6bff"),
  "studio-tablette": kit("Orya", "#2bb673"),
}

function previewUrl() {
  if (process.env.NEXORA_PREVIEW_URL) return process.env.NEXORA_PREVIEW_URL
  const r = spawnSync("figma", ["make", "preview", "get-local-url"], { encoding: "utf8" })
  return (r.status === 0 && /https?:\/\/\S+/.exec(r.stdout || "")?.[0]) || "http://localhost:3000"
}
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
// Images préparées hors du dépôt puis copiées à la fin : l'aperçu se recharge dès qu'un fichier de
// l'interface change, ce qui interromprait les rendus suivants.
const STAGE = fs.mkdtempSync(path.join(os.tmpdir(), "nx-modeles-"))
const pending = []
function saveWebp(dataUrl, out, quality = 82) {
  const png = path.join(STAGE, "rendu.png")
  const tmp = path.join(STAGE, `${pending.length}-${path.basename(out)}`)
  fs.writeFileSync(png, Buffer.from(dataUrl.split(",")[1], "base64"))
  const r = spawnSync("convert", [png, "-strip", "-quality", String(quality), tmp])
  if (r.status !== 0) throw new Error(`Conversion impossible : ${out}`)
  pending.push([tmp, out])
  console.log(`  ${path.relative(ROOT, out)} (${Math.round(fs.statSync(tmp).size / 1024)} Ko)`)
}

async function open(browser, mode) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1000 })
  const seed = { tourDone: true, setup: { done: true, chosen: [], pending: [] }, nxSeenVersion: VERSION, appTheme: "dark" }
  await page.evaluateOnNewDocument((v) => { if (window === window.top) localStorage.setItem("nexora-preview:settings", v) }, JSON.stringify(seed))
  page.on("pageerror", (e) => console.warn(`  exception : ${e.message}`))
  const url = new URL(previewUrl()); url.searchParams.set("app", "")
  await page.goto(url.href, { waitUntil: "load", timeout: 60000 })
  const btn = `#modeSeg button[data-mode="${mode}"]`
  await page.waitForSelector(btn, { timeout: 60000 })
  // Aperçu démarré à froid : le rail n'obéit qu'une fois l'application prête, d'où des clics répétés.
  for (let i = 0; i < 20; i++) {
    await sleep(1500)
    await page.click(btn)
    await sleep(1000)
    if (await page.$eval(btn, (b) => b.classList.contains("on"))) break
  }
  await sleep(2500)
  return page
}

// Modèle appliqué sur une nouvelle page avec le kit donné (null : kit par défaut), puis rendu de la page.
async function renderTemplate(page, id, brand, long) {
  return page.evaluate(async (id, brand, long) => {
    const { state } = await import(new URL("nx/core.js", location.href).href)
    const S = await import(new URL("nx/services.js", location.href).href)
    const C = await import(new URL("nx/design/content.js", location.href).href)
    for (let i = 0; i < 160 && !(state.design && state.design.canvas); i++) await new Promise((ok) => setTimeout(ok, 250))
    const D = state.design
    if (!D) throw new Error("NEX-DESIGN n'est pas ouvert.")
    if (brand) S.setBrand(brand)
    await C.applyTemplate(D, id, { onNewPage: true })
    await new Promise((ok) => setTimeout(ok, 400))
    D.canvas.discardActiveObject(); D.canvas.requestRenderAll()
    return D.renderPage(long / Math.max(D.page.w, D.page.h)).toDataURL("image/png")
  }, id, brand, long)
}

async function renderStaging(page, key, brand) {
  return page.evaluate(async (key, brand) => {
    for (let i = 0; i < 80 && !window.__nxStudioPlus; i++) await new Promise((ok) => setTimeout(ok, 250))
    const S = window.__nxStudioPlus && window.__nxStudioPlus.S
    if (!S) throw new Error("Le Studio n'est pas prêt.")
    const SV = await import(new URL("nx/services.js", location.href).href)
    const ST = await import(new URL("nx/studioplus/stagings.js", location.href).href)
    if (brand) SV.setBrand(brand)
    await ST.apply(S, key)
    S.select(null)
    await new Promise((ok) => setTimeout(ok, 800))
    S.editorVisible(false)
    try { return S.three.renderTo(1600, 1000, { transparent: false }).toDataURL("image/png") } finally { S.editorVisible(true) }
  }, key, brand)
}

const wanted = process.argv.slice(2)
const want = (k) => !wanted.length || wanted.includes(k)
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--ignore-certificate-errors", "--window-size=1600,1000"] })
try {
  if (want("vignettes")) {
    console.log("Vignettes des modèles (kit par défaut) :")
    fs.mkdirSync(THUMBS, { recursive: true })
    const page = await open(browser, "design")
    for (const id of TEMPLATES) saveWebp(await renderTemplate(page, id, null, 360), path.join(THUMBS, `${id}.webp`), 80)
    await page.close()
  }
  if (want("site")) {
    console.log("Réalisations NEX-DESIGN du site :")
    fs.mkdirSync(GALLERY, { recursive: true })
    const page = await open(browser, "design")
    for (const id of TEMPLATES) saveWebp(await renderTemplate(page, id, KITS[id], 1600), path.join(GALLERY, `${id}.webp`))
    await page.close()
  }
  if (want("studio")) {
    console.log("Mises en scène réalistes du Studio :")
    fs.mkdirSync(GALLERY, { recursive: true })
    const page = await open(browser, "studio")
    for (const key of STAGINGS) saveWebp(await renderStaging(page, key, KITS[`studio-${key}`]), path.join(GALLERY, `studio-${key}.webp`))
    await page.close()
  }
} finally {
  await browser.close()
}
for (const [tmp, out] of pending) fs.copyFileSync(tmp, out)
fs.rmSync(STAGE, { recursive: true, force: true })
console.log(`${pending.length} image(s) enregistrée(s).`)
