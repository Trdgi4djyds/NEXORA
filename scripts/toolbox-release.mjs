// NEXORA #076 : `pnpm toolbox` prépare une publication de NEXORA pour le lanceur NEXORA Devs Toolbox.
//   1. paquet ZIP déterministe du dossier nexora/NEXORA-win32-x64 (reconstruit par pnpm pack:windows) ;
//   2. empreinte SHA-256 et taille de chaque fichier ;
//   3. lanceur Go cross-compilé pour Windows (launcher/, 10 Mo au plus) ;
//   4. manifeste nexora.manifest.json signé Ed25519 (nexora.manifest.sig) avec la clé de publication
//      (NX_RELEASE_SIGNING_KEY, jamais affichée), vérifié avec la clé publique de nexora/app/src/license.js ;
//   5. SHA256SUMS.txt.
// Rien n'est envoyé : la publication passe par `pnpm release:windows --repo <dépôt public> --toolbox`, seulement
// après `pnpm valider` (R26).
//
// Options : --out <dossier> (défaut build/toolbox) · --sans-lanceur · --verifier [dossier] (contrôle seul) ·
//           --jours <n> (validité du manifeste, 400 par défaut).
// NEXORA #077 : manifeste avec application, publication, numéro croissant (manifest_version, secondes depuis 1970 :
// toujours plus grand qu'une publication précédente, ce qui permet de refuser les retours en arrière), dates
// d'émission et de fin ; la fraîcheur quotidienne est apportée par la déclaration signée du service de sécurité.
import crypto from "node:crypto"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import yazl from "yazl"
import { ROOT } from "../preview/server.mjs"
import { releaseSigningKey } from "./local-secrets.mjs"

const args = process.argv.slice(2)
const opt = (name, fb = "") => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fb
}
const fail = (msg) => {
  console.error(`\n${msg}`)
  process.exit(1)
}
const mb = (n) => `${(n / 1048576).toFixed(1)} Mo`

const RUNTIME = path.join(ROOT, "nexora", "NEXORA-win32-x64")
const LAUNCHER_SRC = path.join(ROOT, "launcher")
const LAUNCHER_ASSET = "NEXORA-Devs-Toolbox.exe"
const LAUNCHER_MAX = 10 * 1048576
const SKIP = new Set(["resources/nexora.manifest.json", "resources/nexora.manifest.sig"])
const MTIME = new Date("2026-01-01T00:00:00Z") // paquet identique à contenu identique

const appVersion = JSON.parse(fs.readFileSync(path.join(ROOT, "nexora/app/package.json"), "utf8")).version
const releaseKeyB64 = /RELEASE_KEY = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, "nexora/app/src/license.js"), "utf8"))?.[1]
if (!releaseKeyB64) fail("Clé publique de publication introuvable dans nexora/app/src/license.js.")
const publicKey = crypto.createPublicKey({ key: Buffer.from(releaseKeyB64, "base64"), format: "der", type: "spki" })

function sha256File(file) {
  const h = crypto.createHash("sha256")
  const fd = fs.openSync(file, "r")
  const buf = Buffer.allocUnsafe(1 << 20)
  let n
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n))
  fs.closeSync(fd)
  return h.digest("hex")
}

function verifyDir(dir) {
  const raw = fs.readFileSync(path.join(dir, "nexora.manifest.json"))
  const sig = fs.readFileSync(path.join(dir, "nexora.manifest.sig"), "utf8").trim()
  if (!crypto.verify(null, raw, publicKey, Buffer.from(sig, "base64")))
    fail("Signature du manifeste refusée par la clé publique de l’application.")
  const m = JSON.parse(raw.toString("utf8"))
  if (m.application !== "NEXORA" || !(m.manifest_version > 0) || !m.issued_at || !m.expires_at) fail("Manifeste incomplet (application, numéro, dates).")
  if (Date.parse(m.expires_at) < Date.now()) fail("Manifeste expiré : relance pnpm toolbox.")
  const assets = [m.package, ...(m.launcher ? [m.launcher] : [])]
  for (const a of assets) {
    const f = path.join(dir, a.name)
    if (!fs.existsSync(f)) fail(`${a.name} manquant.`)
    if (fs.statSync(f).size !== a.size || sha256File(f) !== a.sha256) fail(`${a.name} : empreinte différente du manifeste.`)
  }
  if (!m.files?.["NEXORA.exe"] || !m.files?.["resources/app.asar"]) fail("Manifeste sans NEXORA.exe ou app.asar.")
  return m
}

if (args.includes("--verifier")) {
  const dir = path.resolve(opt("--verifier", path.join(ROOT, "build", "toolbox")))
  const m = verifyDir(dir)
  console.log(`Publication vérifiée : NEXORA ${m.version}, ${Object.keys(m.files).length} fichiers, signature et empreintes conformes.`)
  process.exit(0)
}

// ---------- 1. Fichiers du logiciel ----------
if (!fs.existsSync(path.join(RUNTIME, "NEXORA.exe")) || !fs.existsSync(path.join(RUNTIME, "resources", "app.asar")))
  fail("nexora/NEXORA-win32-x64 incomplet : lance d’abord pnpm pack:windows.")
const out = path.resolve(opt("--out", path.join(ROOT, "build", "toolbox")))
fs.mkdirSync(out, { recursive: true })
for (const f of fs.readdirSync(out)) fs.rmSync(path.join(out, f), { recursive: true, force: true })

const rels = fs
  .readdirSync(RUNTIME, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile())
  .map((e) => path.relative(RUNTIME, path.join(e.parentPath, e.name)).split(path.sep).join("/"))
  .filter((r) => !SKIP.has(r))
  .sort()
const files = {}
let total = 0
for (const rel of rels) {
  const abs = path.join(RUNTIME, rel)
  const size = fs.statSync(abs).size
  files[rel] = { sha256: sha256File(abs), size }
  total += size
}
console.log(`Logiciel    : NEXORA ${appVersion}, ${rels.length} fichiers, ${mb(total)}`)

// ---------- 2. Paquet ZIP ----------
const pkgName = `NEXORA-${appVersion}-win-x64.zip`
const pkgPath = path.join(out, pkgName)
await new Promise((resolve, reject) => {
  const zip = new yazl.ZipFile()
  for (const rel of rels) zip.addFile(path.join(RUNTIME, rel), rel, { mtime: MTIME, mode: 0o100644 })
  zip.end()
  zip.outputStream.pipe(fs.createWriteStream(pkgPath)).on("close", resolve).on("error", reject)
})
const pkg = { name: pkgName, size: fs.statSync(pkgPath).size, sha256: sha256File(pkgPath) }
console.log(`Paquet      : ${pkgName} (${mb(pkg.size)})`)

// ---------- 3. Lanceur ----------
const launcherVersion = /var version = "([^"]+)"/.exec(fs.readFileSync(path.join(LAUNCHER_SRC, "main.go"), "utf8"))?.[1] || "1.0.0"
let launcher = null
if (!args.includes("--sans-lanceur")) {
  const go = [process.env.GO, "go", "/tmp/go/bin/go"].find((g) => g && spawnSync(g, ["version"], { stdio: "ignore" }).status === 0)
  if (!go) fail("Go est introuvable : installe Go 1.23 (ou indique GO=<chemin>), ou relance avec --sans-lanceur.")
  const exe = path.join(out, LAUNCHER_ASSET)
  const r = spawnSync(
    go,
    ["build", "-trimpath", "-ldflags", `-s -w -H windowsgui -X main.version=${launcherVersion}`, "-o", exe, "."],
    {
      cwd: LAUNCHER_SRC,
      stdio: "inherit",
      env: { ...process.env, CGO_ENABLED: "0", GOOS: "windows", GOARCH: "amd64", GOCACHE: process.env.GOCACHE || path.join(os.tmpdir(), "nexora-gocache") },
    },
  )
  if (r.status !== 0) fail("Construction du lanceur en échec.")
  const size = fs.statSync(exe).size
  if (size > LAUNCHER_MAX) fail(`Lanceur trop lourd : ${mb(size)} (10 Mo au plus).`)
  if (fs.readFileSync(exe).subarray(0, 2).toString() !== "MZ") fail("Le lanceur construit n’est pas un exécutable Windows.")
  launcher = { name: LAUNCHER_ASSET, size, sha256: sha256File(exe), version: launcherVersion }
  console.log(`Lanceur     : ${LAUNCHER_ASSET} ${launcherVersion} (${mb(size)})`)
}

// ---------- 4. Manifeste signé ----------
const issued = new Date()
const days = Math.max(30, Math.min(800, Number(opt("--jours", "400")) || 400))
const manifest = {
  format: 1,
  application: "NEXORA",
  product: "NEXORA",
  version: appVersion,
  release: "stable",
  channel: "stable",
  manifest_version: Math.floor(issued.getTime() / 1000),
  issued_at: issued.toISOString(),
  expires_at: new Date(issued.getTime() + days * 86400000).toISOString(),
  published_at: issued.toISOString(),
  exe: "NEXORA.exe",
  // NEXORA #083 : à partir de 1.0.2, un lanceur plus ancien que min_launcher se met à jour seul (1.0.0 et 1.0.1
  // n'appliquaient pas ce champ : à retélécharger). #084 : 1.0.3 (assistants, NEXORA reconstruit réinstallé).
  min_launcher: "1.0.3",
  package: pkg,
  ...(launcher ? { launcher } : {}),
  files,
}
const raw = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8")
const keyB64 = releaseSigningKey()
if (!keyB64) fail("Clé de signature absente : NX_RELEASE_SIGNING_KEY (variable ou fichier local de jetons).")
let privateKey
try {
  privateKey = crypto.createPrivateKey({ key: Buffer.from(keyB64, "base64"), format: "der", type: "pkcs8" })
} catch {
  fail("Clé de signature illisible (PKCS#8 DER en base64 attendu).")
}
const sig = crypto.sign(null, raw, privateKey).toString("base64")
if (!crypto.verify(null, raw, publicKey, Buffer.from(sig, "base64")))
  fail("La clé de signature ne correspond pas à la clé publique de l’application (RELEASE_KEY).")
fs.writeFileSync(path.join(out, "nexora.manifest.json"), raw)
fs.writeFileSync(path.join(out, "nexora.manifest.sig"), `${sig}\n`)

// ---------- 5. Sommes de contrôle ----------
const sums = fs
  .readdirSync(out)
  .filter((f) => f !== "SHA256SUMS.txt")
  .sort()
  .map((f) => `${sha256File(path.join(out, f))}  ${f}`)
fs.writeFileSync(path.join(out, "SHA256SUMS.txt"), `${sums.join("\n")}\n`)
verifyDir(out)
console.log(`Manifeste   : n° ${manifest.manifest_version}, valable jusqu’au ${manifest.expires_at.slice(0, 10)}, signé et vérifié (clé publique de l’application)`)
console.log(`Dossier     : ${path.relative(ROOT, out) || out}`)
console.log("\nRien n’a été envoyé. Publication : pnpm release:windows --repo <dépôt public> --toolbox (après pnpm valider).")
