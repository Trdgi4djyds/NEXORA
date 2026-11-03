// `pnpm captures` : captures d'écran de l'interface NEXORA dans l'aperçu Figma Make, prises avec le
// Chromium du système (sans fenêtre). Elles servent au suivi : chaque mise à jour est montrée dans le
// chat avec ces images et rangée dans captures/ (voir REGLES.md).
//
// Utilisation : pnpm captures [écrans…] [options]
//   écrans                accueil, responsive, browser, dev, apps, studio, design, securite (défaut : les 8),
//                         premier-lancement (visite guidée et « Préparer les outils », capturé en premier),
//                         tout (premier lancement puis les 8 espaces)
//   --label <nom>         série rangée dans captures/AAAA-MM-JJ-<nom>/ (défaut : « apercu »)
//   --click <texte>       avec un seul espace : clique ensuite sur le bouton portant ce texte, ou cette
//                         infobulle pour un bouton à icône seule (répétable)
//   --theme sombre        thème sombre de NEXORA (défaut : clair)
//   --taille 1440x900     taille de la fenêtre capturée
//   --upload              envoie chaque image dans le chat (figma artifacts upload) et affiche le Markdown
//   --url <adresse>       adresse de l'aperçu (défaut : figma make preview get-local-url)
// Le script signale aussi les erreurs de la page (exceptions, console, requêtes en échec) et se termine
// en erreur si une exception survient : il sert de test rapide de l'interface.
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import puppeteer from "puppeteer-core"
import { ROOT } from "../preview/server.mjs"

// Ordre et identifiants du rail de NEXORA (#modeSeg button[data-mode]).
const SPACES = [
  { slug: "accueil", mode: "home", label: "Accueil" },
  { slug: "responsive", mode: "preview", label: "Responsive Lab" },
  { slug: "browser", mode: "browser", label: "Browser Lab" },
  { slug: "dev", mode: "dev", label: "Dev Lab" },
  { slug: "apps", mode: "android", label: "App Builder" },
  { slug: "studio", mode: "studio", label: "Studio 3D & Motion", wait: 2500 },
  { slug: "design", mode: "design", label: "NEX-DESIGN" },
  { slug: "securite", mode: "security", label: "Sécurité" },
]
const FIRST_RUN = "premier-lancement"
// Même clé que preview/bridge.js : réglages de NEXORA dans l'aperçu.
const SETTINGS_KEY = "nexora-preview:settings"
// Réglages d'un PC neuf dont la visite guidée et la préparation des outils sont déjà passées.
const SETUP_DONE = {
  tourDone: true,
  setup: { done: true, chosen: [], pending: [] },
}
const CHROMIUM = process.env.CHROME_PATH || "/usr/bin/chromium"
// Messages du rendu WebGL logiciel d'un Chromium sans carte graphique : sans rapport avec NEXORA.
const NOISE =
  /WebGL|GL Driver Message|GPU stall|swiftshader|THREE\.WebGLShadowMap/i

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Attend la fin des chargements visibles de NEXORA (notification avec indicateur d'activité, bouton
// occupé), puis laisse l'affichage se stabiliser.
async function settle(page, minMs) {
  await sleep(minMs)
  await page
    .waitForFunction(
      () => !document.querySelector("#toasts .spinner, [aria-busy='true']"),
      {
        timeout: 20000,
        polling: 250,
      },
    )
    .catch(() =>
      console.warn(
        "Chargement encore en cours après 20 s : capture prise quand même.",
      ),
    )
  await sleep(800)
}
const slugify = (text) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "apercu"

function parseArgs(argv) {
  const opts = {
    screens: [],
    label: "apercu",
    clicks: [],
    theme: "clair",
    size: [1440, 900],
    upload: false,
    url: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const value = () => {
      if (argv[i + 1] === undefined)
        throw new Error(`${arg} attend une valeur.`)
      i += 1
      return argv[i]
    }
    if (arg === "--") continue
    else if (arg === "--label") opts.label = value()
    else if (arg === "--click") opts.clicks.push(value())
    else if (arg === "--theme") opts.theme = value()
    else if (arg === "--upload") opts.upload = true
    else if (arg === "--url") opts.url = value()
    else if (arg === "--taille") {
      const m = /^(\d{3,4})x(\d{3,4})$/.exec(value())
      if (!m) throw new Error("--taille attend une valeur comme 1440x900.")
      opts.size = [Number(m[1]), Number(m[2])]
    } else if (arg.startsWith("--")) throw new Error(`Option inconnue : ${arg}`)
    else opts.screens.push(arg)
  }
  const known = [...SPACES.map((s) => s.slug), FIRST_RUN, "tout"]
  const unknown = opts.screens.filter((s) => !known.includes(s))
  if (unknown.length)
    throw new Error(
      `Écran inconnu : ${unknown.join(", ")}. Écrans : ${known.join(", ")}.`,
    )
  if (!["clair", "sombre"].includes(opts.theme))
    throw new Error("--theme attend « clair » ou « sombre ».")

  const everything = opts.screens.includes("tout")
  opts.firstRun = everything || opts.screens.includes(FIRST_RUN)
  // Sans écran précisé : les 8 espaces. Toujours dans l'ordre du rail.
  opts.spaces =
    everything || opts.screens.length === 0
      ? SPACES
      : SPACES.filter((space) => opts.screens.includes(space.slug))
  if (opts.clicks.length && opts.spaces.length !== 1)
    throw new Error("--click demande un seul espace.")
  return opts
}

function previewUrl(explicit) {
  if (explicit) return explicit
  if (process.env.NEXORA_PREVIEW_URL) return process.env.NEXORA_PREVIEW_URL
  const result = spawnSync("figma", ["make", "preview", "get-local-url"], {
    encoding: "utf8",
  })
  return (
    (result.status === 0 && /https?:\/\/\S+/.exec(result.stdout || "")?.[0]) ||
    "http://localhost:3000"
  )
}

function outputDir(label) {
  const base = `${new Date().toISOString().slice(0, 10)}-${slugify(label)}`
  let dir = path.join(ROOT, "captures", base)
  for (let n = 2; fs.existsSync(dir); n += 1)
    dir = path.join(ROOT, "captures", `${base}-${n}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function upload(file) {
  const result = spawnSync("figma", ["artifacts", "upload", file], {
    encoding: "utf8",
  })
  return (
    (result.status === 0 &&
      /figma-blob:\/\/\S+/.exec(result.stdout || "")?.[0]) ||
    null
  )
}

async function clickByText(page, text) {
  const handle = await page.evaluateHandle((wanted) => {
    const shown = [
      ...document.querySelectorAll('button, [role="button"], .btn, a'),
    ].filter((el) => el.offsetParent !== null)
    // Texte visible d'abord, puis infobulle ou libellé accessible (boutons à icône seule).
    return (
      shown.find((el) => el.textContent.trim() === wanted) ??
      shown.find(
        (el) =>
          el.getAttribute("title") === wanted ||
          el.getAttribute("aria-label") === wanted,
      ) ??
      null
    )
  }, text)
  const element = handle.asElement()
  if (!element) return false
  // Vrai clic de souris (survol, appui, relâchement), comme un utilisateur.
  await element.click()
  return true
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!fs.existsSync(CHROMIUM))
    throw new Error(
      `Chromium introuvable (${CHROMIUM}). Indique son chemin avec CHROME_PATH.`,
    )
  const url = previewUrl(opts.url)
  const [width, height] = opts.size

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--window-size=${width},${height}`,
      // Le bac à sable de Figma Make filtre le HTTPS avec son propre certificat : sans cela, les appels
      // Supabase de NEXORA échoueraient dans ce Chromium alors qu'ils fonctionnent dans l'aperçu.
      "--ignore-certificate-errors",
    ],
  })
  const shots = []
  const issues = []
  try {
    const page = await browser.newPage()
    await page.setViewport({ width, height })
    // Réglages de départ : thème demandé, et premier lancement déjà passé sauf s'il faut le capturer.
    const theme = opts.theme === "sombre" ? { appTheme: "dark" } : {}
    const seed = opts.firstRun ? theme : { ...theme, ...SETUP_DONE }
    await page.evaluateOnNewDocument(
      (key, value) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, value)
      },
      SETTINGS_KEY,
      JSON.stringify(seed),
    )
    let where = "démarrage"
    page.on("pageerror", (err) =>
      issues.push({ where, kind: "exception", text: err.message }),
    )
    page.on("console", (msg) => {
      if (msg.type() === "error" && !NOISE.test(msg.text()))
        issues.push({ where, kind: "console", text: msg.text() })
    })
    page.on("requestfailed", (req) =>
      issues.push({
        where,
        kind: "requête",
        text: `${req.url()} (${req.failure()?.errorText})`,
      }),
    )

    await page.goto(url, { waitUntil: "load", timeout: 30000 })
    await settle(page, 2500)
    const dir = outputDir(opts.label)

    if (opts.firstRun) {
      const file = path.join(dir, "00-premier-lancement.png")
      await page.screenshot({ path: file })
      shots.push({ file, label: "Premier lancement" })
      if (opts.spaces.length) {
        // Passe le premier lancement comme l'aurait fait l'utilisateur, puis recharge.
        await page.evaluate(
          (key, extra) => {
            const current = JSON.parse(localStorage.getItem(key) || "{}")
            localStorage.setItem(
              key,
              JSON.stringify({ ...current, ...JSON.parse(extra) }),
            )
          },
          SETTINGS_KEY,
          JSON.stringify(SETUP_DONE),
        )
        await page.reload({ waitUntil: "load" })
        await settle(page, 2500)
      }
    }
    for (const space of opts.spaces) {
      where = space.label
      const button = await page.$(`#modeSeg button[data-mode="${space.mode}"]`)
      if (!button)
        throw new Error(
          `Bouton de l'espace « ${space.label} » introuvable dans le rail.`,
        )
      await button.click()
      await settle(page, space.wait ?? 1500)
      for (const text of opts.clicks) {
        if (!(await clickByText(page, text)))
          throw new Error(`Bouton « ${text} » introuvable dans ${space.label}.`)
        await settle(page, 1200)
      }
      const index = String(SPACES.indexOf(space) + 1).padStart(2, "0")
      const file = path.join(
        dir,
        `${index}-${space.slug}${
          opts.clicks.length ? `-${slugify(opts.clicks.join(" "))}` : ""
        }.png`,
      )
      await page.screenshot({ path: file })
      shots.push({ file, label: space.label })
    }
  } finally {
    await browser.close()
  }

  console.log(
    `${shots.length} capture(s) dans ${path.relative(ROOT, path.dirname(shots[0]?.file ?? ROOT))}/ (aperçu : ${url}) :`,
  )
  for (const shot of shots) console.log(`  ${path.relative(ROOT, shot.file)}`)
  console.log(
    issues.length
      ? `\nErreurs relevées dans la page :`
      : "\nErreurs relevées dans la page : aucune.",
  )
  for (const issue of issues)
    console.log(
      `  [${issue.where}] ${issue.kind} : ${issue.text.slice(0, 300)}`,
    )

  if (opts.upload) {
    console.log(
      "\nImages envoyées dans le chat (Markdown à copier dans la réponse) :",
    )
    for (const shot of shots) {
      const ref = upload(shot.file)
      console.log(
        ref
          ? `![NEXORA — ${shot.label}](${ref})`
          : `  Échec de l'envoi : ${path.relative(ROOT, shot.file)}`,
      )
    }
  }
  if (issues.some((issue) => issue.kind === "exception")) process.exitCode = 1
}

main().catch((err) => {
  console.error(`Échec des captures : ${err.message}`)
  process.exitCode = 1
})
