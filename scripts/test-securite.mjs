// NEXORA #077 : essais du contrôle de sécurité de NEXORA au démarrage (nexora/app/src/license.js), sans Electron :
// installation simulée (manifeste signé avec une clé d'essai), contrôle de tous les fichiers, manifeste expiré,
// incohérent ou plus ancien que le dernier accepté, résultat envoyé au serveur, réponses signées du serveur
// (Connexion perdue, Version non autorisée, ouverture autorisée), intervalle des contrôles réglé par le serveur.
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { ROOT } from "../preview/server.mjs"

const require = createRequire(path.join(ROOT, "nexora/app/package.json"))
const L = require("./src/license.js")

let count = 0
let fails = 0
const ok = (cond, label, extra = "") => {
  count++
  if (!cond) fails++
  console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}${!cond && extra ? ` → ${typeof extra === "string" ? extra : JSON.stringify(extra).slice(0, 300)}` : ""}`)
}
const der = (k, type) => k.export({ format: "der", type }).toString("base64")
const rel = crypto.generateKeyPairSync("ed25519")
const lic = crypto.generateKeyPairSync("ed25519")
L._keys({ release: der(rel.publicKey, "spki"), license: der(lic.publicKey, "spki") })

// Installation simulée : <racine>/NEXORA.exe, resources/app.asar, locales/fr.pak + manifeste signé.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nx-secu-"))
const root = path.join(tmp, "app")
const userData = path.join(tmp, "userData")
fs.mkdirSync(path.join(root, "resources"), { recursive: true })
fs.mkdirSync(path.join(root, "locales"), { recursive: true })
fs.mkdirSync(userData)
const files = { "NEXORA.exe": "MZ exe", "resources/app.asar": "asar".repeat(5000), "locales/fr.pak": "fr" }
const writeInstall = (over = {}) => {
  for (const [r, c] of Object.entries(files)) fs.writeFileSync(path.join(root, ...r.split("/")), c)
  const m = {
    format: 1, application: "NEXORA", product: "NEXORA", version: "1.2.0", release: "stable", manifest_version: 202611080900,
    issued_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000 * 400).toISOString(), exe: "NEXORA.exe",
    files: Object.fromEntries(Object.entries(files).map(([r, c]) => [r, { sha256: crypto.createHash("sha256").update(c).digest("hex"), size: Buffer.byteLength(c) }])),
    ...over,
  }
  const raw = Buffer.from(JSON.stringify(m, null, 2))
  fs.writeFileSync(path.join(root, "resources", "nexora.manifest.json"), raw)
  fs.writeFileSync(path.join(root, "resources", "nexora.manifest.sig"), crypto.sign(null, raw, rel.privateKey).toString("base64"))
}
process.resourcesPath = path.join(root, "resources")
const sent = []
let server = "ok"
const signed = (payload) => {
  const text = JSON.stringify(payload)
  return { payload: text, sig: crypto.sign(null, Buffer.from(text), lic.privateKey).toString("base64") }
}
const fetchImpl = async (url, o) => {
  if (server === "offline") throw new Error("ECONNREFUSED")
  const b = JSON.parse(o.body)
  sent.push(b)
  const base = { nonce: b.nonce, device: b.device }
  if (server === "outdated") return { status: 200, json: async () => signed({ ...base, ok: false, reason: "outdated", message: "Cette version de NEXORA n’est plus autorisée." }) }
  if (server === "forged") return { status: 200, json: async () => ({ payload: JSON.stringify({ ...base, ok: true, plan: "pro" }), sig: "AAAA" }) }
  return { status: 200, json: async () => signed({ ...base, ok: true, plan: "pro", plan_name: "Pro", check_minutes: 3, session_id: "s1", publication: { version: "1.3.0" } }) }
}
const events = []
L._opts({ app: { isPackaged: true, getVersion: () => "1.2.0", getPath: () => userData }, fetch: fetchImpl, send: (c, d) => events.push([c, d]) })
L.setSession({ token: "jeton", url: "https://x.supabase.co", key: "anon", email: "a@b.c" })
const run = async () => L.check("démarrage")

writeInstall()
let r = await L.integrity(true)
ok(r.ok && r.files === 3 && r.manifest_version === 202611080900, "Intégrité : tous les fichiers du manifeste contrôlés au démarrage", r)
let s = await run()
ok(s.status === "ok" && sent.at(-1).integrity.ok === true && sent.at(-1).integrity.manifest_version === 202611080900, "Ouverture autorisée : fichiers conformes, licence validée, résultat transmis au serveur", s)
ok(s.update_available === "1.3.0", "Mise à jour signalée quand une version plus récente est publiée")
ok(JSON.parse(fs.readFileSync(path.join(userData, "securite.json"), "utf8")).manifest_version === 202611080900, "Dernier manifeste accepté mémorisé sur le PC")

fs.writeFileSync(path.join(root, "locales", "fr.pak"), "modifié")
s = await run()
ok(s.status === "integrity" && /fr\.pak/.test(s.message) && sent.at(-1).integrity.ok === false && sent.at(-1).integrity.file === "locales/fr.pak", "Fichier modifié : ouverture bloquée (Échec du contrôle d’intégrité), anomalie envoyée au serveur", s)
ok(!L.allowed("dev:open") && /intégrité/.test(L.lockedError().message), "Fichier modifié : canaux des espaces refusés par le processus principal")
writeInstall()
fs.rmSync(path.join(root, "locales", "fr.pak"))
s = await run()
ok(s.status === "integrity" && s.reason === "missing", "Fichier supprimé : ouverture bloquée", s)
writeInstall()
fs.writeFileSync(path.join(root, "resources", "nexora.manifest.sig"), crypto.sign(null, Buffer.from("autre"), rel.privateKey).toString("base64"))
s = await run()
ok(s.status === "integrity" && s.reason === "signature", "Signature invalide : ouverture bloquée", s)
writeInstall({ expires_at: new Date(Date.now() - 60000).toISOString() })
s = await run()
ok(s.status === "manifest" && s.reason === "expired", "Manifeste expiré : ouverture bloquée", s)
writeInstall({ version: "1.1.0" })
s = await run()
ok(s.status === "manifest" && s.reason === "inconsistent", "Manifeste incohérent (autre version) : ouverture bloquée", s)
writeInstall({ manifest_version: 202601010000 })
s = await run()
ok(s.status === "outdated" && s.reason === "rollback", "Retour en arrière : manifeste plus ancien que le dernier accepté refusé", s)

writeInstall()
server = "offline"
s = await run()
ok(s.status === "offline" && /^Connexion perdue/.test(s.message), "Serveur inaccessible : ouverture bloquée avec « Connexion perdue »", s)
fs.writeFileSync(path.join(root, "resources", "app.asar"), "asar altéré")
s = await run()
ok(s.status === "integrity", "Hors ligne et fichier modifié : « Échec du contrôle d’intégrité » (jamais confondu avec une panne réseau)", s)
writeInstall()
server = "outdated"
s = await run()
ok(s.status === "outdated" && /plus autorisée/.test(s.message), "Version non autorisée par le serveur : ouverture bloquée, mise à jour proposée", s)
server = "forged"
s = await run()
ok(s.status === "blocked" && s.reason === "signature", "Réponse du serveur non signée : refusée", s)
server = "ok"
s = await run()
ok(s.status === "ok" && L.allowed("dev:open"), "Connexion rétablie et contrôle validé : réouverture")
ok(events.some(([c]) => c === "license:changed"), "Interface prévenue de chaque changement d’état")

fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n${count} vérifications, ${fails ? `${fails} échec(s)` : "aucun échec"}.`)
process.exit(fails ? 1 : 0)
