// NEXORA #059 : essais des mises à jour de NEXORA, sans Electron ni réseau.
//   1. src/maint.js : choix du fichier d'une version publiée (installateur, puis version portable .zip),
//      update:check et update:install de la version portable (téléchargement dans Téléchargements, empreinte
//      SHA-256, Explorateur, fenêtre d'explication) avec un faux serveur GitHub et un faux module electron ;
//   2. renderer/nx/version/notes.js : dépôt déduit de l'adresse de téléchargement, notes de la version publiée.
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import Module, { createRequire } from "node:module"

const require = createRequire(import.meta.url)
let count = 0
let fails = 0
const ok = (cond, msg, extra) => {
  count += 1
  if (!cond) fails += 1
  console.log(
    `${cond ? "OK  " : "ÉCHEC"} ${msg}${!cond && extra !== undefined ? ` → ${JSON.stringify(extra)}` : ""}`,
  )
}

// Faux module electron (fenêtre d'explication de la version portable).
const dialogs = []
let answer = 1
const fakeElectron = {
  dialog: {
    showMessageBox: async (win, o) => {
      dialogs.push(o)
      return { response: answer }
    },
  },
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
}
const load = Module._load
Module._load = function (req, ...rest) {
  return req === "electron" ? fakeElectron : load.call(this, req, ...rest)
}

console.log("\n— Choix du fichier (src/maint.js)")
const maint = require("../nexora/app/src/maint.js")
const A = (name) => ({ name, browser_download_url: `https://dl/${name}`, size: 10 })
ok(maint.pickAsset([A("NEXORA-portable.zip"), A("NEXORA Setup 1.3.0.exe")]).kind === "exe", "installateur préféré à la version portable")
ok(maint.pickAsset([A("notes.zip"), A("NEXORA-portable.zip")]).name === "NEXORA-portable.zip", "version portable nommée « portable » préférée")
ok(maint.pickAsset([A("NEXORA.zip")]).kind === "zip", "tout .zip accepté à défaut")
ok(maint.pickAsset([A("latest.yml")]) === null && maint.pickAsset(undefined) === null, "aucun fichier utilisable : rien")

console.log("\n— Version portable : vérification et téléchargement")
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nx-maj-"))
const bytes = crypto.randomBytes(200000)
const digest = crypto.createHash("sha256").update(bytes).digest("hex")
let served = bytes
const handlers = {}
const sent = []
const shown = []
let quit = 0
const asked = []
const fetchImpl = async (url) => {
  if (/releases\/latest$/.test(url)) asked.push(url)
  if (/releases\/latest$/.test(url))
    return new Response(
      JSON.stringify({
        tag_name: "v1.3.0",
        body: "Nouveautés",
        assets: [{ ...A("NEXORA-portable.zip"), size: bytes.length, digest: `sha256:${digest}` }, A("latest.yml")],
      }),
      { status: 200 },
    )
  if (url === "https://dl/NEXORA-portable.zip")
    return new Response(served, { status: 200, headers: { "content-length": String(served.length) } })
  return new Response("{}", { status: 404 })
}
maint.register({
  ipcMain: { handle: (ch, fn) => { handlers[ch] = fn } },
  app: {
    getVersion: () => "1.2.0",
    getPath: (k) => path.join(tmp, k),
    quit: () => { quit += 1 },
  },
  shell: { showItemInFolder: (f) => shown.push(f), openPath: async () => "" },
  net: { fetch: fetchImpl },
  send: (ch, d) => sent.push([ch, d]),
})
let r = await handlers["update:check"]({})
ok(r.available && r.version === "1.3.0" && r.kind === "zip" && r.current === "1.2.0", "version 1.3.0 portable trouvée (1.2.0 installée)", r)
// NEXORA #115 : la source des mises à jour est fixée par le processus principal ; un dépôt envoyé par l'interface
// (ancien réglage « Dépôt des versions ») est ignoré.
r = await handlers["update:check"]({}, { repo: "exemple/autre" })
ok(r.configured === true && asked.length === 2 && asked.every((u) => u === asked[0]) && !/exemple\/autre/.test(asked[1]), "dépôt envoyé par l’interface ignoré : source interne seulement", asked)
await handlers["update:check"]({})
r = await handlers["update:install"]({})
const file = path.join(tmp, "downloads", "NEXORA-1.3.0-portable.zip")
ok(r.kind === "zip" && r.file === file && fs.readFileSync(file).equals(bytes), "fichier rangé dans Téléchargements, contenu identique")
ok(shown.at(-1) === file, "fichier montré dans l’Explorateur")
ok(sent.some(([c, d]) => c === "update:progress" && d.progress === 1), "progression envoyée jusqu’à 100 %")
const d = dialogs.at(-1) || {}
ok(/NEXORA 1\.3\.0 est téléchargée/.test(d.message) && /empreinte vérifiée/.test(d.detail) && /profil Windows/.test(d.detail), "fenêtre : version, empreinte vérifiée, données gardées", d)
await new Promise((res) => setTimeout(res, 400))
ok(quit === 0, "« Plus tard » : NEXORA reste ouverte")
answer = 0
fs.rmSync(file, { force: true })
await handlers["update:install"]({})
await new Promise((res) => setTimeout(res, 400))
ok(quit === 1, "« Fermer NEXORA » : NEXORA se ferme")
fs.rmSync(file, { force: true })
served = crypto.randomBytes(1000)
let err = ""
try {
  await handlers["update:install"]({})
} catch (e) {
  err = e.message
}
ok(/empreinte SHA-256 différente/.test(err) && !fs.existsSync(file), "fichier altéré refusé (empreinte), rien de gardé", err)

console.log("\n— Dépôt de mises à jour et notes (nx/version/notes.js)")
const { repoFromUrl, releaseNotes, NOTES } = await import(
  `data:text/javascript,${encodeURIComponent(fs.readFileSync(new URL("../nexora/app/renderer/nx/version/notes.js", import.meta.url), "utf8"))}`
)
ok(repoFromUrl("https://github.com/nexora-app/nexora-windows/releases/latest/download/NEXORA-portable.zip") === "nexora-app/nexora-windows", "lien de téléchargement GitHub → dépôt")
ok(repoFromUrl("https://github.com/a/b.git") === "a/b" && repoFromUrl("https://github.com/a/b") === "a/b", "adresse du dépôt → dépôt")
ok(["", "https://exemple.com/NEXORA.zip", "http://github.com/a/b", "https://github.com/a"].every((u) => repoFromUrl(u) === ""), "autres adresses ignorées")
const pkg = JSON.parse(fs.readFileSync(new URL("../nexora/app/package.json", import.meta.url), "utf8"))
ok(!!NOTES[pkg.version], `nouveautés prévues pour la version ${pkg.version}`)
const notes = releaseNotes(pkg.version)
// NEXORA #087 : note 1.2.0 réécrite (2 applications gratuites), installation par le lanceur ; #090 : Pro à 25 $, 30 % de
// remise avec un parrain.
// NEXORA #106 : la note 1.2.0 reste affichée (Nouveautés du site) ; la version publiée (1.2.2) a sa propre note.
const notes120 = releaseNotes("1.2.0")
ok(/2 applications gratuites/.test(notes120) && /Pro à 25 \$/.test(notes120) && /30 % de remise/.test(notes120) && !/18 \$/.test(notes120) && !/Dev Lab gratuit|Standard|décompresse/.test(notes120), "notes de la version 1.2.0", notes120)
ok(notes.startsWith(NOTES[pkg.version].intro) && NOTES[pkg.version].items.length > 0 && /NEXORA-Devs-Toolbox\.exe/.test(notes) && !/18 \$|Dev Lab gratuit|Standard|décompresse/.test(notes), `notes de la version publiée (${pkg.version})`, notes)

fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n${count} vérifications, ${fails ? `${fails} échec(s)` : "aucun échec"}.`)
process.exit(fails ? 1 : 0)
