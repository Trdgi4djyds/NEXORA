// NEXORA #059 : publication de NEXORA pour Windows sur une version (Release) d'un dépôt GitHub public.
//   pnpm release:windows --repo <propriétaire/nom> [--essai]
// Dépose nexora/NEXORA-portable.zip (reconstruit par pnpm pack:windows) sur la version v<version de
// nexora/app/package.json>, avec les nouveautés de renderer/nx/version/notes.js. NEXORA vérifie ses mises à jour
// sur ce dépôt (src/maint.js) : le dépôt doit être public, car l'application lit les versions sans jeton.
// Mise en production (R26) : seulement après pnpm valider sans nouveau bloquant, et à la demande de l'utilisateur.
// --essai : affiche ce qui serait publié et vérifie le dépôt (lecture seule), sans rien envoyer.
// NEXORA #076 : --toolbox publie à la place le dossier préparé par `pnpm toolbox` (build/toolbox : paquet ZIP,
// nexora.manifest.json signé, nexora.manifest.sig, lanceur NEXORA-Devs-Toolbox.exe, SHA256SUMS.txt), lu par le
// lanceur NEXORA Devs Toolbox. desktop_download_url = …/releases/latest/download/NEXORA-Devs-Toolbox.exe.
// Jeton : GITHUB_TOKEN ou fichier local de jetons (scripts/local-secrets.mjs), jamais affiché.
// Ensuite, régler desktop_download_url (back office → Configuration) sur
// https://github.com/<propriétaire/nom>/releases/latest/download/NEXORA-portable.zip : les applications déjà
// installées en déduisent le dépôt de mises à jour (nx/version/index.js).
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { ROOT } from "../preview/server.mjs"
import { githubToken } from "./local-secrets.mjs"

const require = createRequire(import.meta.url)
const { publishGithub } = require("../nexora/app/src/desktop/distrib.js")
// notes.js est un module de l'interface dans un paquet CommonJS (nexora/app) : chargé tel quel, sans avertissement.
const { releaseNotes } = await import(
  `data:text/javascript,${encodeURIComponent(fs.readFileSync(path.join(ROOT, "nexora/app/renderer/nx/version/notes.js"), "utf8"))}`
)

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] || "" : ""
}
const essai = args.includes("--essai")
const repoArg = opt("--repo") || process.env.NEXORA_RELEASE_REPO || ""
const fail = (msg) => {
  console.error(`\n${msg}`)
  process.exit(1)
}

if (!/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(repoArg))
  fail(
    "Indique le dépôt public de distribution : pnpm release:windows --repo <propriétaire/nom> [--essai].",
  )
const [owner, repo] = repoArg.split("/")
const version = JSON.parse(
  fs.readFileSync(path.join(ROOT, "nexora/app/package.json"), "utf8"),
).version
const toolbox = args.includes("--toolbox")
const TOOLBOX_DIR = path.join(ROOT, "build", "toolbox")
let uploads
if (toolbox) {
  const raw = fs.existsSync(path.join(TOOLBOX_DIR, "nexora.manifest.json")) ? fs.readFileSync(path.join(TOOLBOX_DIR, "nexora.manifest.json")) : null
  if (!raw) fail("build/toolbox est vide : lance d’abord pnpm toolbox.")
  const pub = /RELEASE_KEY = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, "nexora/app/src/license.js"), "utf8"))[1]
  const sig = fs.readFileSync(path.join(TOOLBOX_DIR, "nexora.manifest.sig"), "utf8").trim()
  if (!crypto.verify(null, raw, crypto.createPublicKey({ key: Buffer.from(pub, "base64"), format: "der", type: "spki" }), Buffer.from(sig, "base64")))
    fail("Signature du manifeste de build/toolbox refusée : relance pnpm toolbox.")
  const m = JSON.parse(raw.toString("utf8"))
  if (m.version !== version) fail(`build/toolbox contient NEXORA ${m.version}, l’application est en ${version} : relance pnpm toolbox.`)
  uploads = fs.readdirSync(TOOLBOX_DIR).sort().map((f) => path.join(TOOLBOX_DIR, f))
} else {
  const zip = path.join(ROOT, "nexora/NEXORA-portable.zip")
  if (!fs.existsSync(zip))
    fail("nexora/NEXORA-portable.zip est absent : lance d’abord pnpm pack:windows.")
  uploads = [zip]
}
// NEXORA #079 : publication du lanceur : pas de « version portable » à décompresser, on lance le lanceur.
const notes = toolbox
  ? releaseNotes(version).replace(
      /Version portable : .*$/m,
      "Installation : téléchargez NEXORA-Devs-Toolbox.exe puis lancez-le. Il vérifie la signature et chaque fichier, installe NEXORA sans droits d’administrateur et le tient à jour. Vos réglages, vos projets et votre compte sont gardés.",
    )
  : releaseNotes(version)

console.log(`Version     : v${version}`)
console.log(`Dépôt       : ${owner}/${repo}`)
for (const f of uploads) {
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex")
  console.log(`Fichier     : ${path.basename(f)} (${(fs.statSync(f).size / 1048576).toFixed(1)} Mo) · SHA-256 ${sha256}`)
}
console.log(
  `Lien stable : https://github.com/${owner}/${repo}/releases/latest/download/${toolbox ? "NEXORA-Devs-Toolbox.exe" : "NEXORA-portable.zip"}`,
)
console.log(`\nNotes :\n${notes}\n`)

const token = githubToken()
const gh = async (url) => {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "NEXORA",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const r = await fetch(url, { headers })
  return { status: r.status, j: await r.json().catch(() => ({})) }
}
const info = await gh(`https://api.github.com/repos/${owner}/${repo}`)
if (info.status === 404)
  fail(
    `Dépôt ${owner}/${repo} introuvable (ou inaccessible avec le jeton) : crée-le d’abord, en public.`,
  )
if (info.status !== 200)
  fail(`Lecture du dépôt impossible (HTTP ${info.status}).`)
if (info.j.private)
  fail(
    `Le dépôt ${owner}/${repo} est privé : NEXORA ne pourrait pas y lire ses mises à jour. Utilise un dépôt public dédié à la distribution.`,
  )
const tag = await gh(
  `https://api.github.com/repos/${owner}/${repo}/releases/tags/v${version}`,
)
console.log(
  tag.status === 200
    ? `La version v${version} existe déjà : ses fichiers seraient remplacés.`
    : `La version v${version} serait créée.`,
)
if (essai) {
  console.log("\nEssai : rien n’a été envoyé.")
  process.exit(0)
}
if (!token) fail("Aucun jeton GitHub (GITHUB_TOKEN ou fichier local de jetons).")
const res = await publishGithub(
  { owner, repo, token, version, notes, name: `NEXORA ${version}`, files: uploads.map((f) => ({ path: f })) },
  (u, o) => fetch(u, o),
  (step) => console.log(`… ${step}`),
)
console.log(`\nPubliée : ${res.url}`)
for (const f of res.files) console.log(`  ${f.name} → ${f.url}`)
