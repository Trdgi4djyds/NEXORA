// NEXORA #132 : essai de bout en bout des fichiers de l'App Builder. Construit, avec le vrai code de NEXORA
// (src/android/builder.js), une application « site en ligne » (NEX-WEBVIEW), une Trusted Web Activity et un
// projet intégré hors ligne, chacun en APK et en AAB, puis les fait contrôler par les outils officiels de
// Google : apksigner (signatures), aapt2 (manifeste, Android ciblé), jarsigner et bundletool (validité de l'AAB,
// découpage en APK par appareil comme le fait Google Play, APK universel). Vérifie aussi le téléchargement
// épinglé de bundletool (empreinte SHA-256 juste acceptée, fausse refusée) et la clé de signature (RSA 2048,
// valable après le 22 octobre 2033, même certificat pour l'APK et l'AAB).
//
// Lancement : pnpm test:android
// Outils (téléchargés une fois hors du dépôt) : JDK 17, plateforme Android 36 et build-tools 36 de
// pnpm android:shell (~/.cache/nexora-android), bundletool par Toolchain.install (même dossier).
// Non couvert : installation sur un téléphone ou un émulateur, envoi dans la Play Console, kits Firebase,
// achats et modules (voir pnpm test:modules --apk).
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import zlib from "node:zlib"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)
const builder = require("../nexora/app/src/android/builder.js")
const { Toolchain, BUNDLETOOL, TARGET_API } = require("../nexora/app/src/android/toolchain.js")
const { Keystores } = require("../nexora/app/src/android/keystore.js")

let count = 0
let fails = 0
function ok(cond, label, detail) {
  count += 1
  if (!cond) fails += 1
  console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}${!cond && detail !== undefined ? ` → ${String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)}` : ""}`)
}
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 256e6, ...opts })

// ---------- Outils ----------
const CACHE = path.join(os.homedir(), ".cache", "nexora-android")
const find = (dir, test) => {
  if (!fs.existsSync(dir)) return null
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (test(p, e)) return p
    if (e.isDirectory()) { const f = find(p, test); if (f) return f }
  }
  return null
}
if (!find(path.join(CACHE, "build-tools"), (p) => path.basename(p) === "d8.jar")) {
  console.log("Préparation des outils Android (une seule fois)…")
  const r = sh("node", [path.join(ROOT, "scripts/build-android-shell.mjs"), "--check"])
  if (r.status) { console.error(`Outils Android indisponibles : ${r.stderr || r.stdout}`); process.exit(1) }
}
const jdk = find(CACHE, (p, e) => e.isDirectory() && /^jdk-17/.test(e.name))
const jar = find(path.join(CACHE, "platform"), (p) => path.basename(p) === "android.jar")
const bt = path.dirname(path.dirname(find(path.join(CACHE, "build-tools"), (p) => path.basename(p) === "d8.jar")))
const JAVA = path.join(jdk, "bin", "java")
const tools = {
  ready: true,
  buildTools: { dir: bt, version: "36", aapt2: path.join(bt, "aapt2"), zipalign: path.join(bt, "zipalign"), apksigner: path.join(bt, "lib", "apksigner.jar") },
  platform: { api: TARGET_API, jar },
  java: { home: jdk, version: 17, java: JAVA, keytool: path.join(jdk, "bin", "keytool"), jarsigner: path.join(jdk, "bin", "jarsigner") },
}

// ---------- bundletool épinglé (code de NEXORA : Toolchain.install) ----------
const btHome = path.join(CACHE, "bundletool")
try {
  const st = await new Toolchain({ home: btHome, fetch, log: () => {} }).install(["bundletool"])
  tools.bundletool = st.bundletool
  ok(st.bundletool && fs.existsSync(st.bundletool.jar), `bundletool ${BUNDLETOOL.version} téléchargé et vérifié (SHA-256 épinglée)`, st)
} catch (e) {
  ok(false, `bundletool ${BUNDLETOOL.version} téléchargé et vérifié (SHA-256 épinglée)`, e.message)
}
// Fichier modifié en route : refusé, rien n'est gardé.
{
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-bt-faux-"))
  const fake = async () => new Response(new Blob([Buffer.from("pas le vrai bundletool")]), { status: 200, headers: { "content-length": "22" } })
  let msg = ""
  try { await new Toolchain({ home, fetch: fake, log: () => {} }).install(["bundletool"]) } catch (e) { msg = e.message }
  ok(/SHA-256/.test(msg) && !fs.existsSync(path.join(home, "bundletool.jar")) && !fs.existsSync(path.join(home, "bundletool.jar.part")), "bundletool modifié : refusé et supprimé", msg)
  fs.rmSync(home, { recursive: true, force: true })
}
if (!tools.bundletool) { console.log(`\n${count} vérifications, ${fails} échec(s).`); process.exit(1) }
const BTL = tools.bundletool.jar

// ---------- Construction ----------
function png(size) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0 }
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 4, 0xff)])
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(Buffer.concat(Array(size).fill(row)))), chunk("IEND", Buffer.alloc(0))])
}
const work = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-test-android-"))
const keystores = new Keystores({ dir: path.join(work, "keys") })
const APP_ID = "fr.boutiquekora.app"
const www = path.join(work, "www")
fs.mkdirSync(www, { recursive: true })
fs.writeFileSync(path.join(www, "index.html"), '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Kora</title></head><body><h1>Boutique Kora</h1></body></html>')
const VARIANTS = [
  { name: "Site en ligne (NEX-WEBVIEW)", mode: "remote", activity: "app.vitrine.shell.MainActivity" },
  { name: "Trusted Web Activity", mode: "twa", activity: "app.vitrine.shell.TwaActivity" },
  { name: "Projet intégré hors ligne", mode: "local", activity: "app.vitrine.shell.MainActivity" },
]
const results = []
for (const v of VARIANTS) {
  const spec = {
    appName: "Boutique Kora", appId: APP_ID, versionName: "1.2.0", versionCode: 7, mode: v.mode, startUrl: v.mode === "local" ? "" : "https://boutique-kora.fr/", publicUrl: "", hosts: [],
    wwwDir: v.mode === "local" ? www : undefined, permissions: ["vibrate", "notifications"], orientation: "unspecified", downloads: true, tv: false, deepLinks: null, shortcuts: [],
    colors: { splashBg: "#FFFFFF", iconBg: "#FFFFFF", accent: "#5B5BD6" }, config: { tabs: [], linkRules: [] }, twa: {}, optimize: { enabled: false }, images: {},
    outputs: { apk: true, aab: true }, outDir: path.join(work, "out", v.mode),
  }
  for (const d of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) for (const f of ["ic_launcher", "ic_launcher_round", "ic_launcher_foreground", "ic_launcher_monochrome"]) spec.images[`mipmap-${d}/${f}.png`] = png(96)
  spec.images["drawable-xxhdpi/vt_splash_icon.png"] = png(288)
  spec.images["drawable-xxhdpi/vt_splash_logo.png"] = png(288)
  spec.images["drawable-nodpi/vt_splash_bg.png"] = png(120)
  const t0 = Date.now()
  try {
    const r = await builder.build(spec, { tools, keystores, owner: { name: "Boutique Kora" }, log: () => {}, step: () => {} })
    ok(r.apk && r.aab && fs.existsSync(r.apk) && fs.existsSync(r.aab), `${v.name} : APK et AAB construits en ${((Date.now() - t0) / 1000).toFixed(1)} s (${(r.apkSize / 1e3).toFixed(0)} Ko, ${(r.aabSize / 1e3).toFixed(0)} Ko)`, r)
    results.push({ ...v, r })
  } catch (e) {
    ok(false, `${v.name} : APK et AAB construits`, e.message)
  }
}

// ---------- Contrôles par les outils de Google ----------
const key = keystores.info(APP_ID)
const pass = key && keystores.password(key)
const keyPass = key && keystores.keyPassword(key)
if (key) {
  const kl = sh(tools.java.keytool, ["-J-Duser.language=en", "-list", "-v", "-keystore", key.file, "-storetype", "PKCS12", "-storepass", pass, "-alias", key.alias])
  const until = /until: (.+)$/m.exec(kl.stdout)
  const end = until ? new Date(until[1].replace(/ [A-Z]{3,4} (\d{4})$/, " $1")) : null
  ok(/Signature algorithm name: SHA(256|384|512)withRSA/.test(kl.stdout) && /2048-bit RSA/.test(kl.stdout), "Clé : RSA 2048 bits, signature SHA-256", kl.stdout.slice(-400))
  ok(end && end > new Date("2033-10-22"), `Clé valable jusqu’au ${end ? end.toISOString().slice(0, 10) : "?"} (Google Play : après le 22 octobre 2033)`, until && until[1])
}
const certOf = (apk) => (/Signer #1 certificate SHA-256 digest: ([0-9a-f]+)/.exec(sh(JAVA, ["-jar", tools.buildTools.apksigner, "verify", "--print-certs", apk]).stdout) || [])[1]
for (const { name, mode, activity, r } of results) {
  const v = sh(JAVA, ["-jar", tools.buildTools.apksigner, "verify", "--verbose", r.apk])
  ok(v.status === 0 && /Verified using v2 scheme \(APK Signature Scheme v2\): true/.test(v.stdout) && /Verified using v3 scheme \(APK Signature Scheme v3\): true/.test(v.stdout), `${name} : APK signé, schémas v2 et v3 vérifiés (apksigner)`, v.stdout + v.stderr)
  const cert = certOf(r.apk)
  ok(cert && key && cert === String(key.sha256 || "").replace(/:/g, "").toLowerCase(), `${name} : APK signé par la clé de l’application`, { cert, key: key && key.sha256 })
  const bad = sh(tools.buildTools.aapt2, ["dump", "badging", r.apk]).stdout
  ok(new RegExp(`^package: name='${APP_ID}' versionCode='7' versionName='1.2.0'`, "m").test(bad), `${name} : identifiant et version (n° 7, 1.2.0)`, bad.split("\n")[0])
  ok(new RegExp(`^targetSdkVersion:'${TARGET_API}'`, "m").test(bad) && /^(minSdkVersion|sdkVersion):'24'/m.test(bad), `${name} : cible Android ${TARGET_API}, dès Android 7 (API 24)`, bad.split("\n").filter((l) => /sdk/i.test(l)).join(" "))
  ok(/^application-label:'Boutique Kora'/m.test(bad) && !/application-debuggable/.test(bad), `${name} : nom de l’application, pas de version de débogage`)
  ok(new RegExp(`^launchable-activity: name='${activity.replace(/\./g, "\\.")}'`, "m").test(bad), `${name} : écran de lancement ${activity.split(".").pop()}`)
  const xml = sh(tools.buildTools.aapt2, ["dump", "xmltree", "--file", "AndroidManifest.xml", r.apk]).stdout
  // Android 12 et plus : tout composant à filtre d'intention déclare android:exported (sinon Google Play refuse).
  const comps = xml.split(/\n(?=\s+E: (?:activity|activity-alias|service|receiver|provider) )/).slice(1)
  const missing = comps.filter((c) => /E: intent-filter/.test(c.split(/\n\s+E: (?:activity|activity-alias|service|receiver|provider) /)[0]) && !/android:exported/.test(c.split("E: intent-filter")[0]))
  ok(comps.length > 0 && missing.length === 0, `${name} : android:exported déclaré pour les ${comps.length} composants`, missing.map((c) => c.slice(0, 200)))
  ok(/usesCleartextTraffic\(0x010104ec\)=false/.test(xml), `${name} : trafic non chiffré (http) interdit`)
  const list = sh("unzip", ["-Z1", r.apk]).stdout
  ok(!/^lib\/.*\.so$/m.test(list), `${name} : aucun code natif (exigence des pages de 16 Ko sans objet)`)
  if (mode === "local") ok(/^assets\/www\/index\.html$/m.test(list), `${name} : site intégré à l’APK (assets/www/index.html)`)

  const js = sh(tools.java.jarsigner, ["-J-Duser.language=en", "-verify", r.aab])
  ok(js.status === 0 && /jar verified\./.test(js.stdout), `${name} : AAB signé (jarsigner)`, js.stdout + js.stderr)
  const val = sh(JAVA, ["-jar", BTL, "validate", `--bundle=${r.aab}`])
  ok(val.status === 0, `${name} : AAB valide (bundletool validate)`, val.stderr.slice(-600))
  const ks = [`--ks=${key.file}`, `--ks-key-alias=${key.alias}`, `--ks-pass=pass:${pass}`, `--key-pass=pass:${keyPass}`]
  const set = path.join(work, `${mode}.apks`)
  const ba = sh(JAVA, ["-jar", BTL, "build-apks", `--bundle=${r.aab}`, `--output=${set}`, ...ks])
  const splits = ba.status === 0 ? sh("unzip", ["-Z1", set]).stdout.split("\n").filter((l) => /\.apk$/.test(l)) : []
  ok(splits.includes("splits/base-master.apk"), `${name} : découpage en APK par appareil, comme Google Play (${splits.length} APK)`, ba.stderr.slice(-600))
  const uni = path.join(work, `${mode}-universel.apks`)
  const bu = sh(JAVA, ["-jar", BTL, "build-apks", "--mode=universal", `--bundle=${r.aab}`, `--output=${uni}`, ...ks])
  const ux = path.join(work, `${mode}-universel`)
  if (bu.status === 0) sh("unzip", ["-qo", uni, "universal.apk", "-d", ux])
  const uapk = path.join(ux, "universal.apk")
  const uv = fs.existsSync(uapk) ? sh(JAVA, ["-jar", tools.buildTools.apksigner, "verify", uapk]) : { status: 1, stderr: bu.stderr }
  const ubad = fs.existsSync(uapk) ? sh(tools.buildTools.aapt2, ["dump", "badging", uapk]).stdout : ""
  ok(uv.status === 0 && new RegExp(`^targetSdkVersion:'${TARGET_API}'`, "m").test(ubad) && new RegExp(`^launchable-activity: name='${activity.replace(/\./g, "\\.")}'`, "m").test(ubad), `${name} : APK universel tiré de l’AAB, signé et complet`, (uv.stderr || "").slice(-400))
}

fs.rmSync(work, { recursive: true, force: true })
console.log(`\n${count} vérifications, ${fails ? `${fails} échec(s)` : "aucun échec"}.`)
process.exit(fails ? 1 : 0)
