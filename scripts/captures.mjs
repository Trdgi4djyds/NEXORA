// `pnpm captures` : captures d'écran de l'interface NEXORA dans l'aperçu Figma Make, prises avec le
// Chromium du système (sans fenêtre). Elles servent au suivi : chaque mise à jour est montrée dans le
// chat avec ces images et rangée dans captures/ (voir REGLES.md).
//
// Utilisation : pnpm captures [écrans…] [options]
//   écrans                accueil, responsive, browser, dev, apps, studio, design, securite, desktop (défaut : les 9),
//                         statut (page de statut publique, données fictives, #048),
//                         site (site vitrine, #060 : haut de page puis chaque section marquée data-capture),
//                         premier-lancement (visite guidée et « Préparer les outils », capturé en premier),
//                         tout (premier lancement puis les 9 espaces)
//   --label <nom>         série rangée dans captures/AAAA-MM-JJ-<nom>/ (défaut : « apercu »)
//   --route <#/chemin>    avec « site » : page du site à capturer (répétable ; défaut : #/, l'accueil du site)
//   --click <texte>       avec un seul espace : clique ensuite sur le bouton portant ce texte, ou cette
//                         infobulle pour un bouton à icône seule (répétable)
//   --theme sombre        thème sombre de NEXORA (défaut : clair)
//   --scroll <sélecteur>  après les clics, fait défiler jusqu'à l'élément visé (CSS), centré (#041)
//   --taille 1440x900     taille de la fenêtre capturée
//   --upload              envoie chaque image dans le chat (figma artifacts upload) et affiche le Markdown
//   --url <adresse>       adresse de l'aperçu (défaut : figma make preview get-local-url)
//   --compte demo         compte NEXORA fictif (données de scripts/admin-demo.mjs, appels Supabase interceptés) :
//                         montre les fonctions réservées aux comptes connectés (supervision 24 h/24, #022)
//   --demo                supervision de démonstration : sites fictifs et un mois de mesures simulées,
//                         servis par le vrai code du processus principal (preview/demo-main.mjs)
//   --demo-dev            Dev Lab de démonstration (#052) : projet de preview/demo-dev.mjs ouvert, canaux dev:,
//                         git: et devx: servis par le vrai code du processus principal
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
  { slug: "desktop", mode: "desktop", label: "Desktop Builder" },
]
const FIRST_RUN = "premier-lancement"
// NEXORA #048 : page de statut publique (web/status/), avec ses données fictives (?demo=1).
const STATUS = "statut"
// NEXORA #060 : site vitrine (site/, servi sous /site/).
const SITE = "site"
// Même clé que preview/bridge.js : réglages de NEXORA dans l'aperçu.
const SETTINGS_KEY = "nexora-preview:settings"
// Réglages d'un PC neuf dont la visite guidée et la préparation des outils sont déjà passées.
// NEXORA #059 : version de NEXORA marquée comme vue (pas de fenêtre « Nouveautés ») ; NX_NOUVEAUTES=1 la montre.
const APP_VERSION = JSON.parse(
  fs.readFileSync(new URL("../nexora/app/package.json", import.meta.url), "utf8"),
).version
const SETUP_DONE = {
  tourDone: true,
  setup: { done: true, chosen: [], pending: [] },
  ...(process.env.NX_NOUVEAUTES ? {} : { nxSeenVersion: APP_VERSION }),
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
    // #066 : clics et saisies dans l'ordre de la ligne de commande.
    actions: [],
    routes: [],
    quiet: false,
    wait: 0,
    theme: "clair",
    size: [1440, 900],
    upload: false,
    url: null,
    demo: false,
    account: false,
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
    else if (arg === "--click") {
      const text = value()
      opts.clicks.push(text)
      opts.actions.push({ kind: "click", text })
    } else if (arg === "--saisir") {
      // « <début du texte indicatif du champ>=<texte> » : tape le texte puis appuie sur Entrée (#066).
      const raw = value()
      const at = raw.indexOf("=")
      if (at < 1) throw new Error("--saisir attend « texte indicatif=valeur ».")
      opts.actions.push({ kind: "type", field: raw.slice(0, at), text: raw.slice(at + 1) })
    } else if (arg === "--sans-notifications") opts.quiet = true
    else if (arg === "--attendre") opts.wait = Number(value()) || 0
    else if (arg === "--route") opts.routes.push(value())
    else if (arg === "--scroll") opts.scroll = value()
    else if (arg === "--theme") opts.theme = value()
    else if (arg === "--upload") opts.upload = true
    else if (arg === "--demo") opts.demo = true
    else if (arg === "--demo-dev") opts.demoDev = true
    else if (arg === "--compte") {
      if (value() !== "demo") throw new Error("--compte attend « demo ».")
      opts.account = true
    } else if (arg === "--url") opts.url = value()
    else if (arg === "--taille") {
      const m = /^(\d{3,4})x(\d{3,4})$/.exec(value())
      if (!m) throw new Error("--taille attend une valeur comme 1440x900.")
      opts.size = [Number(m[1]), Number(m[2])]
    } else if (arg.startsWith("--")) throw new Error(`Option inconnue : ${arg}`)
    else opts.screens.push(arg)
  }
  const known = [...SPACES.map((s) => s.slug), FIRST_RUN, STATUS, SITE, "tout"]
  const unknown = opts.screens.filter((s) => !known.includes(s))
  if (unknown.length)
    throw new Error(
      `Écran inconnu : ${unknown.join(", ")}. Écrans : ${known.join(", ")}.`,
    )
  if (!["clair", "sombre"].includes(opts.theme))
    throw new Error("--theme attend « clair » ou « sombre ».")

  const everything = opts.screens.includes("tout")
  opts.firstRun = everything || opts.screens.includes(FIRST_RUN)
  opts.status = opts.screens.includes(STATUS)
  opts.site = opts.screens.includes(SITE)
  if (opts.routes.length && !opts.site)
    throw new Error("--route demande l'écran « site ».")
  // Sans écran précisé : les 9 espaces. Toujours dans l'ordre du rail.
  opts.spaces =
    everything || opts.screens.length === 0
      ? SPACES
      : SPACES.filter((space) => opts.screens.includes(space.slug))
  if (opts.actions.length && opts.spaces.length !== 1)
    throw new Error("--click et --saisir demandent un seul espace.")
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

// #066 : champ visible dont le texte indicatif commence par `field` ; texte tapé comme au clavier, puis Entrée.
async function typeInto(page, field, text) {
  const handle = await page.evaluateHandle((wanted) => {
    const shown = [...document.querySelectorAll("input, textarea")].filter((el) => el.offsetParent !== null)
    return shown.find((el) => (el.getAttribute("placeholder") || "").startsWith(wanted)) ?? null
  }, field)
  const element = handle.asElement()
  if (!element) return false
  await element.click({ clickCount: 3 })
  await element.type(text, { delay: 8 })
  await page.keyboard.press("Enter")
  return true
}

async function clickByText(page, text) {
  const handle = await page.evaluateHandle((wanted) => {
    const shown = [
      ...document.querySelectorAll('button, [role="button"], [role="treeitem"], .btn, a'),
    ].filter((el) => el.offsetParent !== null)
    // Texte visible d'abord, puis infobulle ou libellé accessible (boutons à icône seule).
    return (
      shown.find((el) => el.textContent.trim() === wanted) ??
      shown.find(
        (el) =>
          el.getAttribute("title") === wanted ||
          el.getAttribute("aria-label") === wanted,
      ) ??
      // #066 : sinon, texte visible sans élément enfant (ligne d'une arborescence de fichiers, par exemple).
      [...document.querySelectorAll("body *")].find(
        (el) => el.offsetParent !== null && el.children.length === 0 && el.textContent.trim() === wanted,
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

// Compte NEXORA fictif (#022) : session gardée sous la clé du client Supabase de NEXORA (« nexora-auth »),
// appels Supabase servis par les données de démonstration du back office. Le site « Boutique » de la
// supervision de démonstration y est surveillé par les serveurs NEXORA.
async function useDemoAccount(page, quiet = false) {
  const { demoResponse, demoSession, monitors } = await import(
    "./admin-demo.mjs"
  )
  const servedHead = new Set()
  await page.evaluateOnNewDocument((s) => {
    // Seulement la page de NEXORA (pas les cadres des appareils, ni leurs pages data: sans stockage).
    if (window !== window.top) return
    if (!localStorage.getItem("nexora-auth"))
      localStorage.setItem("nexora-auth", s)
  }, JSON.stringify(demoSession()))
  const linked = new Map([
    [
      "demo-boutique",
      {
        id: monitors[0].id,
        app_site_id: "demo-boutique",
        active: true,
        last_status: "up",
        last_checked_at: new Date(Date.now() - 40000).toISOString(),
        last_latency_ms: 190,
        last_error: null,
        interval_minutes: 1,
      },
    ],
  ])
  await page.setRequestInterception(true)
  page.on("request", (req) => {
    if (req.isInterceptResolutionHandled()) return
    if (!/\.supabase\.co\//.test(req.url()) || /realtime\/v1/.test(req.url()))
      return req.continue()
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
      "access-control-expose-headers": "content-range",
    }
    if (req.method() === "OPTIONS")
      return req.respond({ status: 204, headers: cors })
    const url = new URL(req.url())
    const send = (body) =>
      req.respond({
        status: 200,
        headers: { ...cors, "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    // #066 : --sans-notifications, aucune annonce du compte de démonstration (bandeau de maintenance).
    if (quiet && url.pathname === "/rest/v1/announcements") return send([])
    if (url.pathname === "/rest/v1/monitors" && req.method() === "GET") {
      const site = url.searchParams.get("app_site_id") || ""
      if (site.startsWith("not.is")) return send([...linked.values()])
      const row = linked.get(site.replace(/^eq\./, ""))
      return send(row ? [{ id: row.id }] : [])
    }
    const res = demoResponse(
      req.method(),
      req.url(),
      req.headers(),
      req.postData(),
    )
    if (!res) return req.continue()
    if (req.method() === "HEAD") servedHead.add(req)
    req.respond({
      status: res.status,
      headers: { ...cors, ...(res.headers || {}) },
      ...(req.method() === "HEAD" || res.status === 204
        ? {}
        : {
            body:
              typeof res.body === "string" || Buffer.isBuffer(res.body)
                ? res.body
                : JSON.stringify(res.body),
          }),
    })
  })
  return servedHead
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
    // NEXORA #052 : Dev Lab de démonstration, projet de preview/demo-dev.mjs déjà ouvert.
    if (opts.demoDev) {
      const { DEMO_DEV_ROOT } = await import("../preview/demo-dev.mjs")
      seed.devLab = {
        root: DEMO_DEV_ROOT,
        open: [],
        bottom: true,
        preview: false,
      }
    }
    await page.evaluateOnNewDocument(
      (key, value, demo) => {
        // Seulement la page de NEXORA (version web, #025 : les appareils affichent des iframes).
        if (window !== window.top) return
        if (!localStorage.getItem(key)) localStorage.setItem(key, value)
        // Même clé que preview/bridge.js (mode démonstration de la supervision ou du Dev Lab, #052).
        if (demo) localStorage.setItem("nexora-preview:demo", demo)
      },
      SETTINGS_KEY,
      JSON.stringify(seed),
      opts.demoDev ? "devlab" : opts.demo ? "supervision" : "",
    )
    // Requêtes HEAD servies par l'interception : abouties, mais signalées « annulées » par Puppeteer.
    const servedHead = opts.account ? await useDemoAccount(page, opts.quiet) : new Set()
    let where = "démarrage"
    page.on("pageerror", (err) =>
      issues.push({ where, kind: "exception", text: err.message }),
    )
    // Compte fictif : le bac à sable bloque le WebSocket du temps réel de Supabase (attendu).
    const accountNoise = (text) =>
      opts.account && /supabase\.co\/realtime\/v1\/websocket/.test(text)
    page.on("console", (msg) => {
      if (
        msg.type() === "error" &&
        !NOISE.test(msg.text()) &&
        !accountNoise(msg.text())
      )
        issues.push({ where, kind: "console", text: msg.text() })
    })
    page.on(
      "requestfailed",
      (req) =>
        !servedHead.has(req) &&
        issues.push({
          where,
          kind: "requête",
          text: `${req.url()} (${req.failure()?.errorText})`,
        }),
    )

    const dir = outputDir(opts.label)
    // L'interface de NEXORA n'est chargée que si un de ses écrans est demandé (pas pour le site seul).
    if (opts.firstRun || opts.spaces.length) {
      // « ?app » : dans l'aperçu, la racine sans paramètre ouvre le site vitrine (#062).
      const app = new URL(url)
      app.searchParams.set("app", "")
      await page.goto(app.href, { waitUntil: "load", timeout: 30000 })
      await settle(page, 2500)
    }

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
      for (const action of opts.actions) {
        if (action.kind === "type") {
          if (!(await typeInto(page, action.field, action.text)))
            throw new Error(`Champ « ${action.field}… » introuvable dans ${space.label}.`)
        } else if (!(await clickByText(page, action.text)))
          throw new Error(`Bouton « ${action.text} » introuvable dans ${space.label}.`)
        await settle(page, 1200)
      }
      if (opts.wait) await sleep(opts.wait)
      if (opts.quiet)
        await page.addStyleTag({ content: "#toasts, .toast, .toasts { display: none !important; }" })
      if (opts.scroll) {
        const found = await page.evaluate((sel) => {
          const el = document.querySelector(sel)
          if (el) el.scrollIntoView({ block: "center", behavior: "instant" })
          return !!el
        }, opts.scroll)
        if (!found)
          throw new Error(
            `Élément « ${opts.scroll} » introuvable dans ${space.label}.`,
          )
        await settle(page, 800)
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
    if (opts.status) {
      where = "Page de statut"
      if (opts.theme === "sombre")
        await page.emulateMediaFeatures([
          { name: "prefers-color-scheme", value: "dark" },
        ])
      await page.goto(new URL("status/?demo=1", url).href, {
        waitUntil: "load",
        timeout: 30000,
      })
      await settle(page, 800)
      const file = path.join(dir, "10-statut.png")
      await page.screenshot({ path: file })
      shots.push({ file, label: "Page de statut" })
    }
    if (opts.site) {
      where = "Site vitrine"
      // Thème du site : clé propre au site (site/index.html), et réglage du système pour la première visite.
      await page.emulateMediaFeatures([
        {
          name: "prefers-color-scheme",
          value: opts.theme === "sombre" ? "dark" : "light",
        },
      ])
      await page.evaluateOnNewDocument((dark) => {
        if (window !== window.top) return
        localStorage.setItem("nexora-site-theme", dark ? "dark" : "light")
      }, opts.theme === "sombre")
      const base = url.endsWith("/") ? url : `${url}/`
      for (const route of opts.routes.length ? opts.routes : ["#/"]) {
        const hash = route.startsWith("#") ? route : `#${route}`
        const rest = hash.replace(/^#\/?/, "")
        const slug = rest ? slugify(rest) : "accueil"
        where = `Site vitrine ${hash}`
        await page.goto(new URL(`site/${hash}`, base).href, {
          waitUntil: "load",
          timeout: 30000,
        })
        await settle(page, 2600)
        const top = path.join(dir, `site-${slug}-00-haut.png`)
        await page.screenshot({ path: top })
        shots.push({ file: top, label: `Site vitrine ${hash} — haut de page` })
        const sections = await page.$$eval("[data-capture]", (els) =>
          els.map((el) => el.getAttribute("data-capture")),
        )
        let n = 0
        for (const name of sections) {
          if (name === "haut") continue
          n += 1
          await page.evaluate((wanted) => {
            const el = document.querySelector(`[data-capture="${wanted}"]`)
            if (!el) return
            const y = el.getBoundingClientRect().top + window.scrollY - 70
            window.scrollTo({ top: y, behavior: "instant" })
          }, name)
          await sleep(1500)
          const file = path.join(
            dir,
            `site-${slug}-${String(n).padStart(2, "0")}-${slugify(name)}.png`,
          )
          await page.screenshot({ path: file })
          shots.push({ file, label: `Site vitrine ${hash} — ${name}` })
        }
      }
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
