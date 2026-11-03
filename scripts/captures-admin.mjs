// `pnpm captures:admin` : captures d'écran du back office web (admin/) dans l'aperçu Figma Make,
// avec le Chromium du système, comme `pnpm captures` pour l'application.
//
// Utilisation : pnpm captures:admin [écrans…] [options]
//   écrans                connexion, vue, utilisateurs, utilisateur, equipes, equipe, appareils,
//                         invitations, contenus, fichiers, supervision, site, audits, audit-site,
//                         support, ticket, annonces, offres, fonctionnalites, configuration,
//                         journal, supabase (défaut : tous)
//   --label <nom>         série rangée dans captures/AAAA-MM-JJ-<nom>/ (défaut : « admin »)
//   --theme sombre        thème sombre (défaut : clair)
//   --taille 1440x900     taille de la fenêtre
//   --donnees reelles     sans données de démonstration : seul l'écran de connexion a du sens ici
//   --upload              envoie chaque image dans le chat et affiche le Markdown
//   --url <adresse>       adresse de l'aperçu (défaut : figma make preview get-local-url)
//
// Le bac à sable de Figma Make bloque les écritures vers Supabase (connexion comprise) : par défaut,
// les appels à Supabase sont donc interceptés et reçoivent les données fictives de
// scripts/admin-demo.mjs (même forme que l'API réelle). Le script signale les erreurs de la page.
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import puppeteer from "puppeteer-core"
import { ROOT } from "../preview/server.mjs"
import {
  DEMO_TOKEN,
  demoIds,
  demoResponse,
  demoSession,
} from "./admin-demo.mjs"

const SCREENS = [
  ["connexion", "Connexion", null],
  ["vue", "Vue d’ensemble", "overview"],
  ["utilisateurs", "Utilisateurs", "users"],
  ["utilisateur", "Fiche utilisateur", `users/${demoIds.user}`],
  ["equipes", "Équipes et offres", "orgs"],
  ["equipe", "Fiche équipe", `orgs/${demoIds.org}`],
  ["appareils", "Appareils", "devices"],
  ["invitations", "Invitations", "invitations"],
  ["contenus", "Contenus", "content"],
  ["fichiers", "Fichiers", "files"],
  ["supervision", "Supervision", "monitors"],
  ["site", "Site surveillé", `monitors/${demoIds.monitor}`],
  ["audits", "Audits de sécurité", "scans"],
  ["audit-site", "Détail d’un audit", `scans/${demoIds.scan}`],
  ["support", "Support", "support"],
  ["ticket", "Ticket de support", `support/${demoIds.ticket}`],
  ["annonces", "Annonces et messages", "announce"],
  ["offres", "Offres", "plans"],
  ["fonctionnalites", "Fonctionnalités", "flags"],
  ["configuration", "Configuration", "config"],
  ["journal", "Journal d’audit", "audit"],
  ["supabase", "Supabase", "supabase"],
]
const CHROMIUM = process.env.CHROME_PATH || "/usr/bin/chromium"
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function parseArgs(argv) {
  const opts = {
    screens: [],
    label: "admin",
    theme: "clair",
    size: [1440, 900],
    upload: false,
    url: null,
    demo: true,
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
    else if (arg === "--theme") opts.theme = value()
    else if (arg === "--upload") opts.upload = true
    else if (arg === "--url") opts.url = value()
    else if (arg === "--donnees") opts.demo = value() !== "reelles"
    else if (arg === "--taille") {
      const m = /^(\d{3,4})x(\d{3,4})$/.exec(value())
      if (!m) throw new Error("--taille attend une valeur comme 1440x900.")
      opts.size = [Number(m[1]), Number(m[2])]
    } else if (arg.startsWith("--")) throw new Error(`Option inconnue : ${arg}`)
    else opts.screens.push(arg)
  }
  const unknown = opts.screens.filter(
    (s) => !SCREENS.some(([slug]) => slug === s),
  )
  if (unknown.length)
    throw new Error(
      `Écran inconnu : ${unknown.join(", ")}. Écrans : ${SCREENS.map(([s]) => s).join(", ")}.`,
    )
  if (!["clair", "sombre"].includes(opts.theme))
    throw new Error("--theme attend « clair » ou « sombre ».")
  opts.list = opts.screens.length
    ? SCREENS.filter(([slug]) => opts.screens.includes(slug))
    : SCREENS
  return opts
}

function previewUrl(explicit) {
  if (explicit) return explicit
  if (process.env.NEXORA_PREVIEW_URL) return process.env.NEXORA_PREVIEW_URL
  const r = spawnSync("figma", ["make", "preview", "get-local-url"], {
    encoding: "utf8",
  })
  return (
    (r.status === 0 && /https?:\/\/\S+/.exec(r.stdout || "")?.[0]) ||
    "http://localhost:3000"
  )
}

function outputDir(label) {
  const slug =
    label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "admin"
  const base = `${new Date().toISOString().slice(0, 10)}-${slug}`
  let dir = path.join(ROOT, "captures", base)
  for (let n = 2; fs.existsSync(dir); n += 1)
    dir = path.join(ROOT, "captures", `${base}-${n}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function upload(file) {
  const r = spawnSync("figma", ["artifacts", "upload", file], {
    encoding: "utf8",
  })
  return (
    (r.status === 0 && /figma-blob:\/\/\S+/.exec(r.stdout || "")?.[0]) || null
  )
}

async function settle(page) {
  await sleep(600)
  await page
    .waitForFunction(() => !document.querySelector("[aria-busy='true']"), {
      timeout: 15000,
      polling: 200,
    })
    .catch(() => console.warn("Chargement encore en cours après 15 s."))
  await sleep(500)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const base = `${previewUrl(opts.url).replace(/\/$/, "")}/admin/`
  const [width, height] = opts.size
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--window-size=${width},${height}`,
      "--ignore-certificate-errors",
    ],
  })
  const shots = []
  const issues = []
  let where = "démarrage"
  try {
    const page = await browser.newPage()
    await page.setViewport({ width, height })
    page.on("pageerror", (err) =>
      issues.push({ where, kind: "exception", text: err.message }),
    )
    // Le bac à sable bloque le WebSocket du temps réel de Supabase (abonnement du ticket ouvert) : attendu ici.
    const noise = (text) => opts.demo && /realtime\/v1\/websocket/.test(text)
    page.on(
      "console",
      (msg) =>
        msg.type() === "error" &&
        !noise(msg.text()) &&
        issues.push({ where, kind: "console", text: msg.text() }),
    )
    // Une requête HEAD servie par l'interception aboutit (statut et en-têtes reçus) mais Puppeteer la
    // signale en échec (net::ERR_ABORTED) : vérifié à part, ce n'est pas une erreur de la page.
    const servedHead = new Set()
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
    if (opts.demo) {
      await page.setRequestInterception(true)
      page.on("request", (req) => {
        if (req.isInterceptResolutionHandled()) return
        if (req.method() === "OPTIONS" && /supabase\.(co|com)/.test(req.url()))
          return req.respond({
            status: 204,
            headers: {
              "access-control-allow-origin": "*",
              "access-control-allow-headers": "*",
              "access-control-allow-methods": "*",
            },
          })
        const res = demoResponse(
          req.method(),
          req.url(),
          req.headers(),
          req.postData(),
        )
        if (!res) return req.continue()
        const body =
          typeof res.body === "string" ? res.body : JSON.stringify(res.body)
        if (req.method() === "HEAD") servedHead.add(req)
        req.respond({
          status: res.status,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-expose-headers": "content-range",
            ...(res.headers || {}),
          },
          ...(req.method() === "HEAD" || res.status === 204 ? {} : { body }),
        })
      })
    }
    const dir = outputDir(opts.label)
    const theme = opts.theme === "sombre" ? "dark" : "light"
    for (const [index, [slug, label, route]] of opts.list.entries()) {
      where = label
      const session = route && opts.demo ? JSON.stringify(demoSession()) : ""
      await page.goto("about:blank")
      // Réglages de la page avant son chargement : thème, session de démonstration, jeton Supabase.
      const init = await page.evaluateOnNewDocument(
        (t, s, token) => {
          localStorage.setItem("nexora-admin-theme", t)
          if (s) localStorage.setItem("nexora-admin-auth", s)
          else localStorage.removeItem("nexora-admin-auth")
          if (token) sessionStorage.setItem("nexora-admin-sbp", token)
        },
        theme,
        session,
        route === "supabase" ? DEMO_TOKEN : "",
      )
      await page.goto(`${base}${route ? `#/${route}` : ""}`, {
        waitUntil: "load",
        timeout: 30000,
      })
      await settle(page)
      await page.removeScriptToEvaluateOnNewDocument(init.identifier)
      const file = path.join(
        dir,
        `${String(index + 1).padStart(2, "0")}-${slug}.png`,
      )
      await page.screenshot({ path: file, fullPage: false })
      shots.push({ file, label })
    }
  } finally {
    await browser.close()
  }

  console.log(
    `${shots.length} capture(s) dans ${path.relative(ROOT, path.dirname(shots[0]?.file ?? ROOT))}/ (${
      opts.demo ? "données de démonstration" : "données réelles"
    }, thème ${opts.theme}) :`,
  )
  for (const shot of shots) console.log(`  ${path.relative(ROOT, shot.file)}`)
  console.log(
    issues.length
      ? "\nErreurs relevées dans la page :"
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
          ? `![Back office — ${shot.label}](${ref})`
          : `  Échec de l'envoi : ${path.relative(ROOT, shot.file)}`,
      )
    }
  }
  if (issues.some((i) => i.kind === "exception")) process.exitCode = 1
}

main().catch((err) => {
  console.error(`Échec des captures : ${err.message}`)
  process.exitCode = 1
})
