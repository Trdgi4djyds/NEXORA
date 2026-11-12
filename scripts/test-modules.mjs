// NEXORA #115 : essais des modules de l'App Builder (OneSignal, Google AdMob, Google Analytics, Meta).
//   pnpm test:modules          essais rapides, sans réseau : configuration embarquée (src/android/modules.js et
//                              builder.js), déclarations du manifeste, contrôles, pont window.NexoraApp
//                              (android/templates/bridge.js) dans un navigateur simulé
//   pnpm test:modules --apk    en plus : prépare les vrais kits (SDK officiels lus dans les dépôts Maven), compile
//                              les ponts VtOneSignal, VtAdMob, VtAnalytics et VtMeta contre eux, construit un APK avec
//                              les quatre modules, puis lit son manifeste, son code (dexdump) et sa configuration.
//                              Outils Android : ceux de pnpm android:shell (~/.cache/nexora-android).
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import vm from "node:vm"
import zlib from "node:zlib"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)
const modules = require("../nexora/app/src/android/modules.js")
const builder = require("../nexora/app/src/android/builder.js")

let count = 0
let fails = 0
function ok(cond, label, detail) {
  count += 1
  if (!cond) fails += 1
  console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}${!cond && detail !== undefined ? ` → ${JSON.stringify(detail).slice(0, 600)}` : ""}`)
}

// ---------- Configuration et contrôles ----------
const base = { appId: "fr.kora.app", appName: "Kora", mode: "remote" }
const os1 = modules.moduleConfig("onesignal", { ...base, onesignal: { enabled: true, appId: " 5f0c9a2e-1b2c-4d3e-8f90-123456789abc ", ask: false } })
ok(os1 && os1.appId === "5f0c9a2e-1b2c-4d3e-8f90-123456789abc" && os1.ask === false, "OneSignal : identifiant nettoyé, demande d'autorisation désactivable", os1)
const adT = modules.moduleConfig("admob", { ...base, admob: { enabled: true, test: true, banner: { unit: "ca-app-pub-1234567890123456/1234567890", position: "top" }, interstitial: { unit: "x" } } })
ok(adT.banner.unit === modules.ADMOB_TEST.banner && adT.interstitial.unit === modules.ADMOB_TEST.interstitial && adT.rewarded.unit === "" && adT.banner.position === "top", "AdMob en mode test : identifiants de test de Google, blocs vides ignorés", adT)
const adR = modules.moduleConfig("admob", { ...base, admob: { enabled: true, test: false, appId: "ca-app-pub-1234567890123456~1234567890", banner: { unit: "ca-app-pub-1234567890123456/1234567890" } } })
ok(adR.banner.unit === "ca-app-pub-1234567890123456/1234567890" && adR.consent === true, "AdMob réel : identifiants du compte, consentement de Google par défaut", adR)
ok(modules.moduleConfig("admob", { ...base, mode: "twa", admob: { enabled: true } }) === null, "Mode Trusted Web Activity : aucun module dans la configuration")
const mf = modules.moduleManifest("admob", { admob: { appId: "ca-app-pub-1234567890123456~1234567890" } }).join("")
ok(/APPLICATION_ID" android:value="ca-app-pub-1234567890123456~1234567890"/.test(mf), "AdMob : identifiant de l'application dans le manifeste", mf)
ok(/3940256099942544~3347511713/.test(modules.moduleManifest("admob", { admob: { test: true } }).join("")), "AdMob en mode test : application de test de Google dans le manifeste")
ok(/suppressLaunchURLs" android:value="true"/.test(modules.moduleManifest("onesignal", {}).join("")), "OneSignal : liens des notifications ouverts dans l'application")
const mv = modules.moduleValues("meta", { meta: { appId: "123456789012345", clientToken: "0123456789abcdef0123456789abcdef<x>" } })["vt_meta.xml"]
ok(/>123456789012345</.test(mv) && /0123456789abcdef0123456789abcdefx</.test(mv) && !/<x>/.test(mv), "Meta : identifiant et jeton client écrits sans caractère dangereux", mv)
const errs = modules.validate({ ...base, push: { enabled: false }, onesignal: { enabled: true, appId: "abc" }, admob: { enabled: true, test: false, appId: "", banner: { unit: "faux" } }, analytics: { enabled: true }, meta: { enabled: true, appId: "12", clientToken: "zz" } })
ok(errs.length === 6 && errs.some((e) => /google-services/.test(e)) && errs.some((e) => /jeton client/.test(e)) && errs.some((e) => /bloc d’annonces/.test(e)), "Contrôles : identifiants invalides, google-services.json manquant", errs)
ok(modules.validate({ ...base, push: { enabled: true }, onesignal: { enabled: true, appId: "5f0c9a2e-1b2c-4d3e-8f90-123456789abc" } }).some((e) => /un seul service/.test(e)), "Contrôles : OneSignal refusé avec les notifications Firebase de NEXORA")
ok(modules.validate({ ...base, admob: { enabled: true, test: true }, analytics: { enabled: true }, push: { enabled: true } }).length === 0, "Contrôles : mode test d'AdMob, Analytics avec le fichier Firebase des notifications")
const sc = builder.shellConfig({ ...base, startUrl: "https://kora.example/", colors: {}, config: {}, onesignal: { enabled: true, appId: "5f0c9a2e-1b2c-4d3e-8f90-123456789abc" }, meta: { enabled: false } })
ok(sc.onesignal && sc.onesignal.enabled && !("meta" in sc) && !("admob" in sc), "Configuration embarquée : seuls les modules activés", Object.keys(sc))
const plan = fs.readFileSync(path.join(ROOT, "nexora/app/src/plan.js"), "utf8")
ok(/'android:module-install': \['integrations', 0\]/.test(plan), "Offre : préparation d'un kit de module réservée aux outils d'intégration")
const pre = fs.readFileSync(path.join(ROOT, "nexora/app/preload.js"), "utf8")
ok(/'android:'/.test(pre), "Canaux android:module-* autorisés par le préfixe android: de preload.js")
const main = fs.readFileSync(path.join(ROOT, "nexora/app/android/shell/src/app/vitrine/shell/MainActivity.java"), "utf8")
ok(/"onesignal", "VtOneSignal"\}, \{"admob", "VtAdMob"\}, \{"analytics", "VtAnalytics"\}, \{"meta", "VtMeta"\}/.test(main), "MainActivity attache les quatre ponts par réflexion")
ok(/vt_splash_bg", "drawable"/.test(fs.readFileSync(path.join(ROOT, "nexora/app/android/shell/src/app/vitrine/shell/Splash.java"), "utf8")), "Splash.java pose le fond créé (drawable vt_splash_bg)")
const dexText = fs.readFileSync(path.join(ROOT, "nexora/app/android/shell/classes.dex")).toString("latin1")
ok(dexText.includes("VtOneSignal") && dexText.includes("vt_splash_bg"), "classes.dex reconstruit (modules et fond de démarrage)")
for (const id of modules.MODULE_IDS) ok(fs.existsSync(path.join(ROOT, `nexora/app/android/shell/modules/app/vitrine/shell/${modules.MODULES[id].shim}.java`)), `Pont ${modules.MODULES[id].shim}.java présent`)

// ---------- Pont window.NexoraApp ----------
function sandbox(natives) {
  const calls = []
  const listeners = {}
  const style = {}
  const win = {
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f) },
    removeEventListener: (t, f) => { listeners[t] = (listeners[t] || []).filter((x) => x !== f) },
    dispatchEvent: (e) => { for (const f of [...(listeners[e.type] || [])]) f(e); return true },
  }
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail } }
  const ctx = {
    window: win, CustomEvent, setTimeout, clearTimeout, Promise, JSON, console,
    setInterval: (f, ms) => { const t = setInterval(f, ms); t.unref(); return t }, clearInterval, FileReader: class {}, Notification: undefined,
    screen: {}, navigator: {}, location: { href: "https://kora.example/accueil", pathname: "/accueil", hash: "" }, history: { pushState() {}, replaceState() {} },
    requestAnimationFrame: (f) => setTimeout(f, 0), innerWidth: 400, innerHeight: 800, addEventListener: win.addEventListener,
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }), getComputedStyle: () => ({ backgroundColor: "rgb(255, 255, 255)" }),
    Event: class { constructor(type) { this.type = type } },
  }
  const el = () => ({ style: { setProperty(k, v) { style[k] = v } }, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, setAttribute() {}, getAttribute: () => null, nodeType: 1, clientWidth: 400, scrollTop: 0 })
  const root = el()
  ctx.document = { title: "Accueil", addEventListener() {}, documentElement: root, body: el(), head: el(), scrollingElement: root, createElement: el, querySelectorAll: () => [], querySelector: () => null, elementFromPoint: () => null }
  win.open = () => null
  win.VitrineNative = new Proxy({}, { get: (_t, m) => (m === "appInfo" ? () => "{}" : () => "") })
  const rec = (name) => new Proxy({}, { get: (_t, m) => (m === "autoScreens" ? () => true : (...a) => { calls.push([name, m, ...a]); const id = a[a.length - 1]; if (typeof id === "string" && /^m\d/.test(id)) setTimeout(() => win.__vitrineResolve(id, true, { ok: m }), 0) }) })
  for (const n of natives) win[n] = rec(n)
  ctx.self = win
  vm.createContext(ctx)
  vm.runInContext(`var window = this.window; var addEventListener = window.addEventListener; var location = this.location; var history = this.history; var document = this.document;${fs.readFileSync(path.join(ROOT, "nexora/app/android/templates/bridge.js"), "utf8")}`, ctx)
  return { ctx: win, calls, style }
}
const all = sandbox(["VitrineOneSignal", "VitrineAdMob", "VitrineAnalytics", "VitrineMeta"])
const A = all.ctx.NexoraApp
ok(A && A.onesignal.available && A.ads.available && A.analytics.available && A.meta.available, "Pont : les quatre modules disponibles quand l'application les contient")
ok(all.calls.some((c) => c[0] === "VitrineAnalytics" && c[1] === "screen" && c[2] === "/accueil"), "Google Analytics : premier écran suivi automatiquement", all.calls)
A.onesignal.login("client-42"); A.onesignal.tag("ville", "Abidjan"); A.analytics.event("ajout_panier", { valeur: 12.5, articles: [{ id: "p1" }] }); A.meta.purchase(9.99, "xof", { produit: "pro" })
ok(all.calls.some((c) => c[1] === "login" && c[2] === "client-42") && all.calls.some((c) => c[1] === "addTag" && c[2] === "ville" && c[3] === "Abidjan"), "OneSignal : identifiant client et étiquette transmis")
ok(all.calls.some((c) => c[1] === "logEvent" && c[2] === "ajout_panier" && JSON.parse(c[3]).valeur === 12.5), "Google Analytics : événement et paramètres en JSON")
ok(all.calls.some((c) => c[0] === "VitrineMeta" && c[1] === "logPurchase" && c[2] === 9.99 && c[3] === "xof"), "Meta : achat transmis (montant, devise)")
const rew = await A.ads.showRewarded()
ok(rew && rew.ok === "showRewarded", "AdMob : vidéo avec récompense, réponse asynchrone reçue", rew)
all.ctx.__vitrineAds({ type: "banner", shown: true, height: 62 })
ok(all.style["--nexora-banner"] === "62px", "AdMob : hauteur de la bannière posée dans --nexora-banner", all.style)
let opened = null
A.onesignal.onOpen((d) => { opened = d })
all.ctx.__vitrineOneSignal({ type: "open", url: "https://kora.example/commande/7", title: "Commande prête" })
ok(opened && opened.url === "https://kora.example/commande/7", "OneSignal : notification touchée signalée à la page", opened)
const none = sandbox([])
ok(!none.ctx.NexoraApp.ads.available && !none.ctx.NexoraApp.onesignal.available, "Pont : modules absents signalés (available = false)")
let refused = ""
await none.ctx.NexoraApp.ads.showInterstitial().catch((e) => { refused = e.message })
ok(/AdMob non activé/.test(refused), "Pont : appel d'un module absent refusé avec un message clair", refused)

// ---------- Vrais kits et APK ----------
function png(size) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0 }
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 4, 0xff)])
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(Buffer.concat(Array(size).fill(row)))), chunk("IEND", Buffer.alloc(0))])
}

async function apk() {
  const CACHE = path.join(os.homedir(), ".cache", "nexora-android")
  if (!fs.existsSync(CACHE)) {
    const r = spawnSync("node", [path.join(ROOT, "scripts/build-android-shell.mjs"), "--check"], { encoding: "utf8" })
    if (r.status) throw new Error(`Outils Android indisponibles : ${r.stderr || r.stdout}`)
  }
  const find = (dir, test) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (test(p, e)) return p
      if (e.isDirectory()) { const f = find(p, test); if (f) return f }
    }
    return null
  }
  const jdk = find(CACHE, (p, e) => e.isDirectory() && /^jdk-17/.test(e.name))
  const jar = find(path.join(CACHE, "platform"), (p) => path.basename(p) === "android.jar")
  const bt = path.dirname(path.dirname(find(path.join(CACHE, "build-tools"), (p) => path.basename(p) === "d8.jar")))
  const tools = {
    ready: true,
    buildTools: { dir: bt, version: "36", aapt2: path.join(bt, "aapt2"), zipalign: path.join(bt, "zipalign"), apksigner: path.join(bt, "lib", "apksigner.jar") },
    platform: { api: 36, jar },
    java: { home: jdk, version: 17, java: path.join(jdk, "bin", "java"), keytool: path.join(jdk, "bin", "keytool"), jarsigner: path.join(jdk, "bin", "jarsigner") },
  }
  const home = process.env.NEXORA_MODULE_KITS || path.join(os.homedir(), ".cache", "nexora-module-kits")
  const kits = {}
  for (const id of modules.MODULE_IDS) {
    const kit = new modules.ModuleKit(id, { home, fetch: (u, o) => fetch(u, o), log: (l) => { if (/Doublon|bibliothèques/.test(l)) console.log(`     ${l}`) } })
    if (!kit.status().installed) {
      console.log(`Préparation du kit ${modules.MODULES[id].label} (réseau)…`)
      try { await kit.install(tools, () => {}) } catch (e) { ok(false, `Kit ${modules.MODULES[id].label} préparé, pont compilé`, e.message); continue }
    }
    const st = kit.status()
    ok(st.installed, `Kit ${modules.MODULES[id].label} ${st.version} préparé (${st.artifacts} bibliothèques, ${(st.size / 1e6).toFixed(1)} Mo), pont ${modules.MODULES[id].shim} compilé contre le SDK`, st)
    kits[id] = kit
  }
  if (Object.keys(kits).length !== modules.MODULE_IDS.length) return
  const { Keystores } = require("../nexora/app/src/android/keystore.js")
  const { PushKit } = require("../nexora/app/src/android/push.js")
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-test-modules-"))
  const gs = JSON.stringify({
    project_info: { project_number: "123456789", project_id: "kora-app", storage_bucket: "kora-app.appspot.com" },
    client: [{ client_info: { mobilesdk_app_id: "1:123456789:android:abcdef", android_client_info: { package_name: "fr.kora.app" } }, api_key: [{ current_key: "AIzaSyTEST" }] }],
  })
  const spec = {
    appName: "Kora", appId: "fr.kora.app", versionName: "1.0.0", versionCode: 1, mode: "remote", startUrl: "https://kora.example/", publicUrl: "", hosts: [], permissions: [],
    orientation: "unspecified", downloads: true, tv: false, deepLinks: null, shortcuts: [], colors: { splashBg: "#FFFFFF", iconBg: "#FFFFFF", accent: "#5B5BD6" },
    config: { tabs: [], linkRules: [] }, images: {}, outputs: { apk: true, aab: false }, outDir: path.join(work, "out"),
    onesignal: { enabled: true, appId: "5f0c9a2e-1b2c-4d3e-8f90-123456789abc" },
    admob: { enabled: true, test: true, banner: { unit: "test" }, interstitial: { unit: "test" }, rewarded: { unit: "test" } },
    analytics: { enabled: true, googleServices: gs },
    meta: { enabled: true, appId: "123456789012345", clientToken: "0123456789abcdef0123456789abcdef" },
  }
  for (const d of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) for (const f of ["ic_launcher", "ic_launcher_round", "ic_launcher_foreground", "ic_launcher_monochrome"]) spec.images[`mipmap-${d}/${f}.png`] = png(96)
  spec.images["drawable-xxhdpi/vt_splash_icon.png"] = png(288)
  spec.images["drawable-xxhdpi/vt_splash_logo.png"] = png(288)
  spec.images["drawable-nodpi/vt_splash_bg.png"] = png(120)
  let r
  try {
    r = await builder.build(spec, { tools, keystores: new Keystores({ dir: path.join(work, "keys") }), pushKit: new PushKit({ home, fetch, log: () => {} }), moduleKits: kits, owner: { name: "Kora" }, log: (l) => { if (/version|bibliothèque/.test(l)) console.log(`     ${l}`) }, step: () => {} })
  } catch (e) {
    ok(false, "APK construit avec OneSignal, AdMob, Google Analytics et Meta", e.message)
    return
  }
  ok(r && r.apk && fs.existsSync(r.apk), `APK construit avec OneSignal, AdMob, Google Analytics et Meta (${(fs.statSync(r.apk).size / 1e6).toFixed(1)} Mo)`, r)
  const dump = spawnSync(tools.buildTools.aapt2, ["dump", "xmltree", "--file", "AndroidManifest.xml", r.apk], { encoding: "utf8", maxBuffer: 64e6 }).stdout
  ok(/com\.google\.android\.gms\.ads\.APPLICATION_ID/.test(dump) && /3940256099942544~3347511713/.test(dump), "Manifeste : application AdMob de test déclarée")
  ok(/com\.facebook\.sdk\.ApplicationId/.test(dump) && /com\.facebook\.sdk\.ClientToken/.test(dump), "Manifeste : identifiant et jeton client de Meta")
  ok(/com\.onesignal\.suppressLaunchURLs/.test(dump) && /POST_NOTIFICATIONS/.test(dump), "Manifeste : OneSignal (liens dans l'application, autorisation des notifications)")
  // Une ligne par déclaration (aapt2 écrit le nom deux fois sur la ligne : valeur et forme brute).
  const gmsVersion = dump.split("\n").filter((l) => /android:name\([^)]*\)="com\.google\.android\.gms\.version"/.test(l)).length
  ok(gmsVersion === 1, `Manifeste : une seule déclaration de la version des services Google (${gmsVersion})`)
  const res = spawnSync(tools.buildTools.aapt2, ["dump", "resources", r.apk], { encoding: "utf8", maxBuffer: 512e6 }).stdout
  ok(/drawable\/vt_splash_bg/.test(res), "Ressources : fond de l'écran de démarrage intégré (drawable vt_splash_bg)")
  const listing = spawnSync("unzip", ["-l", r.apk], { encoding: "utf8", maxBuffer: 64e6 }).stdout
  const dexes = [...new Set([...listing.matchAll(/(classes\d*\.dex)/g)].map((m) => m[1]))]
  fs.mkdirSync(path.join(work, "x"), { recursive: true })
  spawnSync("unzip", ["-qo", r.apk, "classes*.dex", "assets/vitrine/config.json", "-d", path.join(work, "x")])
  let classes = ""
  for (const d of dexes) classes += spawnSync(path.join(bt, "dexdump"), [path.join(work, "x", d)], { encoding: "utf8", maxBuffer: 1024e6 }).stdout.split("\n").filter((l) => /Class descriptor/.test(l)).join("\n")
  for (const [cls, label] of [["VtOneSignal", "OneSignal"], ["VtAdMob", "AdMob"], ["VtAnalytics", "Google Analytics"], ["VtMeta", "Meta"]]) ok(classes.includes(`Lapp/vitrine/shell/${cls};`), `Code de l'application : pont ${cls} (${label}) présent`)
  ok(/Lcom\/onesignal\/OneSignal;/.test(classes) && /Lcom\/google\/android\/gms\/ads\/MobileAds;/.test(classes) && /Lcom\/google\/firebase\/analytics\/FirebaseAnalytics;/.test(classes) && /Lcom\/facebook\/appevents\/AppEventsLogger;/.test(classes), "Code de l'application : les quatre SDK officiels intégrés")
  ok(/Lcom\/google\/android\/ump\/UserMessagingPlatform;/.test(classes), "Code de l'application : consentement de Google (UMP) intégré")
  const conf = JSON.parse(fs.readFileSync(path.join(work, "x", "assets", "vitrine", "config.json"), "utf8"))
  ok(conf.onesignal && conf.admob && conf.admob.banner.unit === modules.ADMOB_TEST.banner && conf.analytics && conf.meta, "Configuration embarquée : les quatre modules, identifiants de test d'AdMob", conf.admob)
  const v = spawnSync(tools.java.java, ["-jar", tools.buildTools.apksigner, "verify", r.apk], { encoding: "utf8" })
  ok(v.status === 0, "Signature de l'APK vérifiée (apksigner)", v.stderr)
  fs.rmSync(work, { recursive: true, force: true })
}

if (process.argv.includes("--apk")) await apk()
console.log(`\n${count - fails}/${count} vérification(s) réussie(s).`)
if (fails) process.exit(1)
