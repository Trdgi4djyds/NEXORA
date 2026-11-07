// NEXORA #059 : publication de NEXORA pour Windows sur une version (Release) d'un dépôt GitHub public.
//   pnpm release:windows --repo <propriétaire/nom> [--essai]
// Dépose nexora/NEXORA-portable.zip (reconstruit par pnpm pack:windows) sur la version v<version de
// nexora/app/package.json>, avec les nouveautés de renderer/nx/version/notes.js. NEXORA vérifie ses mises à jour
// sur ce dépôt (src/maint.js) : le dépôt doit être public, car l'application lit les versions sans jeton.
// Mise en production (R26) : seulement après pnpm valider sans nouveau bloquant, et à la demande de l'utilisateur.
// --essai : affiche ce qui serait publié et vérifie le dépôt (lecture seule), sans rien envoyer.
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
const zip = path.join(ROOT, "nexora/NEXORA-portable.zip")
if (!fs.existsSync(zip))
  fail("nexora/NEXORA-portable.zip est absent : lance d’abord pnpm pack:windows.")
const size = fs.statSync(zip).size
const sha256 = crypto
  .createHash("sha256")
  .update(fs.readFileSync(zip))
  .digest("hex")
const notes = releaseNotes(version)

console.log(`Version     : v${version}`)
console.log(`Dépôt       : ${owner}/${repo}`)
console.log(`Fichier     : NEXORA-portable.zip (${(size / 1048576).toFixed(1)} Mo)`)
console.log(`SHA-256     : ${sha256}`)
console.log(
  `Lien stable : https://github.com/${owner}/${repo}/releases/latest/download/NEXORA-portable.zip`,
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
    ? `La version v${version} existe déjà : son fichier NEXORA-portable.zip serait remplacé.`
    : `La version v${version} serait créée.`,
)
if (essai) {
  console.log("\nEssai : rien n’a été envoyé.")
  process.exit(0)
}
if (!token) fail("Aucun jeton GitHub (GITHUB_TOKEN ou fichier local de jetons).")
const res = await publishGithub(
  { owner, repo, token, version, notes, name: `NEXORA ${version}`, files: [{ path: zip }] },
  (u, o) => fetch(u, o),
  (step) => console.log(`… ${step}`),
)
console.log(`\nPubliée : ${res.url}`)
for (const f of res.files) console.log(`  ${f.name} → ${f.url}`)
