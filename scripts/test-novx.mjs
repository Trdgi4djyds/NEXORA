// NEXORA #076 : essais des fichiers de projet .novx (nexora/app/src/novx.js), sans Electron.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { ROOT } from "../preview/server.mjs"

const require = createRequire(path.join(ROOT, "nexora/app/package.json"))
const novx = require("./src/novx.js")
const yazl = require("yazl")

let fails = 0
let count = 0
const ok = (cond, label, extra = "") => {
  count++
  if (!cond) fails++
  console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}${!cond && extra ? ` → ${extra}` : ""}`)
}
const rejects = async (p, re, label) => {
  try {
    await p
    ok(false, label, "aucune erreur")
  } catch (e) {
    ok(re.test(e.message), label, e.message)
  }
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novx-"))
const w = (rel, txt) => {
  const f = path.join(tmp, "projet", rel)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, txt)
}
w("package.json", '{"name":"boutique"}')
w("src/index.js", "console.log('bonjour')\n")
w("public/logo.svg", "<svg/>")
w("node_modules/react/index.js", "x")
w("dist/app.js", "construit")
w(".git/HEAD", "ref")
w(".env", "SECRET=1")
w(".env.example", "SECRET=")
const project = { id: "p1", name: "Boutique", url: "https://boutique.test", dir: path.join(tmp, "projet") }
const docs = [{ id: "d1", name: "Affiche", pages: [] }, { id: "d1", name: "Doublon", pages: [] }]

const list = novx.listCode(project.dir)
ok(
  list.files.map((f) => f.rel).sort().join() === ".env.example,package.json,public/logo.svg,src/index.js",
  "code : dépendances, sorties de construction, .git et .env exclus ; .env.example gardé",
  list.files.map((f) => f.rel).join(),
)
ok(list.skipped.includes("node_modules/") && list.skipped.includes("dist/") && list.skipped.includes(".env"), "éléments exclus listés")
const sansProjet = fs.mkdtempSync(path.join(os.tmpdir(), "novx-site-"))
fs.mkdirSync(path.join(sansProjet, "dist"))
fs.writeFileSync(path.join(sansProjet, "dist", "index.html"), "<h1>site</h1>")
ok(novx.listCode(sansProjet).files.some((f) => f.rel === "dist/index.html"), "dossier de site sans fichier de projet : dist gardé")
ok(novx.listCode(project.dir, { includeEnv: true }).files.some((f) => f.rel === ".env"), ".env inclus seulement sur demande")

const file = path.join(tmp, "Boutique.novx")
const res = await novx.writeNovx(file, { project, documents: docs, config: { theme: "clair" }, codeDir: project.dir, includeCode: true, appVersion: "1.2.0" })
ok(fs.existsSync(file) && res.documents === 2 && res.codeFiles === 4, "export : 2 documents et 4 fichiers de code", JSON.stringify(res))
const head = await novx.readNovx(file)
ok(head.project.name === "Boutique" && head.documents.length === 2 && head.config.theme === "clair" && head.dir === "", "lecture sans extraire le code")
ok(head.manifest.app_version === "1.2.0" && head.manifest.contents.code && !head.manifest.contents.env_included, "manifeste : version, code, sans secrets")
const dest = path.join(tmp, "import", "Boutique")
const full = await novx.readNovx(file, { codeTo: dest })
ok(full.dir === dest && fs.readFileSync(path.join(dest, "src/index.js"), "utf8") === "console.log('bonjour')\n" && !fs.existsSync(path.join(dest, ".env")), "import : code extrait, identique, sans .env")
await rejects(novx.readNovx(file, { codeTo: dest }), /existe déjà/, "import : dossier existant jamais écrasé")

const manifest = JSON.parse(JSON.stringify(head.manifest))
const forge = async (name, entries) => {
  const z = new yazl.ZipFile()
  for (const [n, b] of entries) z.addBuffer(Buffer.from(b), n)
  z.end()
  const f = path.join(tmp, name)
  await new Promise((r) => z.outputStream.pipe(fs.createWriteStream(f)).on("close", r))
  return f
}
const base = [["novx.json", JSON.stringify(manifest)], ["project.json", JSON.stringify(head.project, null, 2)], ["config/settings.json", JSON.stringify(head.config, null, 2)]]
await rejects(novx.readNovx(await forge("altere.novx", [...base, ["documents/d1.json", '{"id":"d1","name":"Piégé"}']])), /altéré|incomplet/, "document modifié refusé")
await rejects(novx.readNovx(await forge("intrus.novx", [...base, ["code/evil.js", "x"]])), /inattendue/, "entrée inattendue refusée")
// yazl refuse « .. » à la création : le nom est remplacé ensuite dans l'archive (même longueur).
const slip = await forge("slip.novx", [...base, ["code/AA/evil.js", "x"]])
fs.writeFileSync(slip, Buffer.from(fs.readFileSync(slip).toString("latin1").split("code/AA/evil.js").join("code/../evil.js"), "latin1"))
await rejects(novx.readNovx(slip, { codeTo: path.join(tmp, "slip") }), /refusé/, "chemin « .. » refusé (zip slip)")
ok(!fs.existsSync(path.join(tmp, "evil.js")) && !fs.existsSync(path.join(tmp, "slip")), "rien n’est écrit hors du dossier ni laissé à moitié")
await rejects(novx.readNovx(await forge("vide.novx", [["project.json", "{}"]])), /novx\.json manquant/, "fichier sans novx.json refusé")
const futur = { ...manifest, version: 99 }
await rejects(novx.readNovx(await forge("futur.novx", [["novx.json", JSON.stringify(futur)]])), /plus récente/, "format futur : mise à jour demandée")
await rejects(novx.readNovx(path.join(tmp, "projet", "package.json")), /lisible/, "fichier qui n’est pas un ZIP refusé")

const fakeHome = "/home/essai"
const existing = new Set([path.join(fakeHome, "Google Drive", "Mon Drive")])
const drive = novx.driveFolders({ HOME: fakeHome }, (p) => existing.has(p))
ok(drive.length === 1 && drive[0].endsWith(path.join("Google Drive", "Mon Drive")), "Google Drive détecté quand il est installé")
ok(novx.driveFolders({ HOME: fakeHome }, () => false).length === 0, "Google Drive absent : aucune supposition")
ok(novx.novxFromArgs(["NEXORA.exe", "--x", "C:\\Projets\\Boutique.novx"]) === "C:\\Projets\\Boutique.novx", "fichier .novx reçu au lancement (double-clic)")

fs.rmSync(tmp, { recursive: true, force: true })
fs.rmSync(sansProjet, { recursive: true, force: true })
console.log(`\n${count} vérifications, ${fails ? `${fails} échec(s)` : "aucun échec"}.`)
process.exit(fails ? 1 : 0)
