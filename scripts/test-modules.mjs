// NEXORA #114 : essais des modules OneSignal et AdMob des applications de l'App Builder.
//   pnpm test:modules          essais rapides, sans réseau : réglages embarqués (src/android/modules.js, builder.js),
//                              contrôles avant construction, ligne app-ads.txt, pont window.NexoraApp.onesignal et
//                              NexoraApp.ads (android/templates/bridge.js) dans un navigateur simulé
//   pnpm test:modules --apk    en plus : prépare les vrais kits OneSignal et AdMob (dépôts Maven), compile les ponts
//                              VtOneSignal et VtAds, construit un APK avec les deux modules, puis un APK avec les
//                              notifications push de NEXORA (Firebase) et AdMob (bibliothèques communes écartées), et lit
//                              leur manifeste, leur code (dexdump) et leur configuration. Outils Android : ceux de
//                              pnpm android:shell (~/.cache/nexora-android).
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import vm from "node:vm"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)
const mod = require("../nexora/app/src/android/modules.js")
const builder = require("../nexora/app/src/android/builder.js")

let count = 0
let fails = 0
function ok(cond, label, detail) {
  count += 1
  if (!cond) fails += 1
  console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}${!cond && detail !== undefined ? ` → ${JSON.stringify(detail).slice(0, 400)}` : ""}`)
}

const OS_ID = "8f1c2d3e-4a5b-4c6d-8e7f-0123456789ab"
const ADM_APP = "ca-app-pub-1234567890123456~1234567890"
const ADM_UNIT = "ca-app-pub-1234567890123456/0987654321"

// ---------- Réglages embarqués ----------
const os1 = mod.oneSignalConfig({ onesignal: { enabled: true, appId: ` ${OS_ID.toUpperCase()} `, ask: false, tags: [{ key: "ville", value: "Abidjan" }, { key: "", value: "x" }] } })
ok(os1.appId === OS_ID && os1.ask === false && os1.openUrls === true && os1.tags.length === 1 && os1.tags[0].key === "ville", "OneSignal : identifiant normalisé, permission, liens, étiquettes", os1)
const t = mod.adsConfig({ ads: { enabled: true, banner: { enabled: true, id: "" }, interstitial: { enabled: true, every: 4 } } })
ok(t.test && t.appId === mod.ADMOB_TEST.appId && t.banner === mod.ADMOB_TEST.banner && t.interstitial === mod.ADMOB_TEST.interstitial && t.rewarded === "" && t.autoEvery === 4 && t.minGap === 90, "AdMob en mode test : identifiants d'essai de Google, interstitiel toutes les 4 pages", t)
const real = mod.adsConfig({ ads: { enabled: true, test: false, appId: ADM_APP, banner: { enabled: true, id: ADM_UNIT, position: "top" }, rewarded: { enabled: true, id: "faux" }, rating: "PG", child: true } })
ok(real.appId === ADM_APP && real.banner === ADM_UNIT && real.position === "top" && real.rewarded === "" && real.rating === "PG" && real.child, "AdMob réel : vrais identifiants, bloc invalide écarté, classement et public enfant", real)
const shell = (extra) => builder.shellConfig({ appName: "Kora", appId: "fr.kora.app", mode: "remote", startUrl: "https://kora.example/", colors: {}, config: {}, ...extra })
const sc = shell({ onesignal: { enabled: true, appId: OS_ID }, ads: { enabled: true, banner: { enabled: true } } })
ok(sc.onesignal && sc.onesignal.enabled && sc.onesignal.appId === OS_ID && sc.ads && sc.ads.banner === mod.ADMOB_TEST.banner, "Configuration de l'application : blocs onesignal et ads", { onesignal: sc.onesignal, ads: sc.ads })
const scTwa = shell({ mode: "twa", onesignal: { enabled: true, appId: OS_ID }, ads: { enabled: true } })
ok(!scTwa.onesignal && !scTwa.ads, "Mode Trusted Web Activity : aucun module embarqué")
const scOff = shell({})
ok(!scOff.onesignal && !scOff.ads, "Modules désactivés : rien dans la configuration")
// ---------- Contrôles ----------
ok(mod.checkModules({ mode: "remote", onesignal: { enabled: true, appId: "abc" } }).some((m) => /identifiant de l’application OneSignal/.test(m)), "Contrôle : identifiant OneSignal manquant")
ok(mod.checkModules({ mode: "remote", onesignal: { enabled: true, appId: OS_ID }, push: { enabled: true } }).some((m) => /ne peuvent pas être actifs ensemble/.test(m)), "Contrôle : OneSignal et notifications push Firebase exclusifs")
ok(mod.checkModules({ mode: "remote", ads: { enabled: true, test: false, appId: "x", banner: { enabled: true, id: "y" } } }).length === 2, "Contrôle : identifiants AdMob réels invalides (application et bloc)")
ok(mod.checkModules({ mode: "remote", ads: { enabled: true } }).some((m) => /au moins un format/.test(m)), "Contrôle : aucun format d'annonce choisi")
ok(mod.checkModules({ mode: "remote", onesignal: { enabled: true, appId: OS_ID }, ads: { enabled: true, test: false, appId: ADM_APP, interstitial: { enabled: true, id: ADM_UNIT } } }).length === 0, "Contrôle : réglages valides acceptés")
ok(mod.checkModules({ mode: "twa", ads: { enabled: true, banner: { enabled: true } } }).some((m) => /Trusted Web Activity/.test(m)), "Contrôle : mode Trusted Web Activity refusé")
ok(mod.appAdsLine(ADM_APP) === "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0" && mod.appAdsLine("x") === "", "Ligne app-ads.txt tirée de l'identifiant AdMob")
// ---------- Pont de la page ----------
const calls = []
const win = {
  addEventListener: (type, cb) => { (win.listeners[type] ||= []).push(cb) },
  dispatchEvent: (e) => { for (const cb of win.listeners[e.type] || []) cb(e) },
  listeners: {},
  VitrineNative: { appInfo: () => "{}" },
  VitrineOneSignal: {
    login: (ext, id) => { calls.push(["login", ext]); win.__vitrineResolve(id, true, true) },
    tags: (json, id) => { calls.push(["tags", json]); win.__vitrineResolve(id, true, true) },
    state: (id) => win.__vitrineResolve(id, true, { permission: true, subscriptionId: "s1" }),
    lastClick: () => JSON.stringify({ type: "click", url: "https://kora.example/commande/7" }),
  },
  VitrineAds: {
    banner: (show, id) => { calls.push(["banner", show]); win.__vitrineResolve(id, true, true) },
    rewarded: (id) => win.__vitrineResolve(id, true, { type: "pièces", amount: 5 }),
  },
}
class CE { constructor(type, o) { this.type = type; this.detail = o && o.detail } }
const el = () => ({ style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, setAttribute() {}, getAttribute: () => null, nodeType: 1, clientWidth: 400, scrollTop: 0 })
const root = el()
const ctx = {
  window: win, screen: {}, navigator: {}, location: { href: "https://kora.example/" }, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, console, CustomEvent: CE,
  requestAnimationFrame: (f) => setTimeout(f, 0), innerWidth: 400, innerHeight: 800, addEventListener: win.addEventListener,
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }), getComputedStyle: () => ({ backgroundColor: "rgb(255, 255, 255)" }),
  Event: class { constructor(type) { this.type = type } },
  document: { addEventListener() {}, documentElement: root, body: el(), head: el(), scrollingElement: root, createElement: el, querySelectorAll: () => [], querySelector: () => null, elementFromPoint: () => null },
}
win.open = () => null
ctx.self = win
vm.createContext(ctx)
try { vm.runInContext(`var window = this.window; var addEventListener = window.addEventListener;${fs.readFileSync(path.join(ROOT, "nexora/app/android/templates/bridge.js"), "utf8")}`, ctx); ok(true, "bridge.js s'exécute dans le navigateur simulé") } catch (e) { ok(false, "bridge.js s'exécute dans le navigateur simulé", e.message) }
const A = win.NexoraApp
ok(A && A.onesignal && A.onesignal.available && A.ads && A.ads.available, "Pont : NexoraApp.onesignal et NexoraApp.ads disponibles")
if (A) {
  await A.onesignal.login(42)
  await A.onesignal.tags({ offre: "pro", ville: "" })
  const st = await A.onesignal.state()
  ok(calls[0][1] === "42" && JSON.parse(calls[1][1]).offre === "pro" && st.subscriptionId === "s1", "Pont OneSignal : login, étiquettes, état", calls)
  const clicks = []
  A.onesignal.onClick((d) => clicks.push(d))
  await new Promise((r) => setTimeout(r, 5))
  win.dispatchEvent(new CE("nexora-onesignal", { detail: { type: "click", url: "https://kora.example/x" } }))
  ok(clicks.length === 2 && clicks[0].url.endsWith("/commande/7"), "Pont OneSignal : clic d'avant le chargement remis, puis clics suivants", clicks)
  await A.ads.banner(false)
  const rw = await A.ads.rewarded()
  const evs = []
  A.ads.on("reward", (d, type) => evs.push([type, d]))
  win.dispatchEvent(new CE("nexora-ads", { detail: { type: "reward", data: { amount: 5 } } }))
  win.dispatchEvent(new CE("nexora-ads", { detail: { type: "ready", data: {} } }))
  ok(calls.some((c) => c[0] === "banner" && c[1] === false) && rw.amount === 5 && evs.length === 1, "Pont AdMob : bannière masquée, récompense, événements filtrés", { calls, rw, evs })
  await A.ads.interstitial().then(() => ok(false, "Fonction absente du pont natif : promesse rejetée"), () => ok(true, "Fonction absente du pont natif : promesse rejetée"))
}
// ---------- Construction réelle (option --apk) ----------
if (process.argv.includes("--apk")) await realBuild()
console.log(`\n${count} vérifications, ${fails} échec(s).`)
process.exit(fails ? 1 : 0)

function png(size) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 4, Buffer.from([0x5b, 0x5b, 0xd6, 0xff]))])
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
  return [...Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", require("node:zlib").deflateSync(raw)), chunk("IEND", Buffer.alloc(0))])]
}

async function realBuild() {
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
  // Réponses en erreur (Maven Central refuse parfois l'adresse du bac à sable) lues jusqu'au bout : un corps laissé
  // en attente fait planter undici (assert(!this.paused)) sur les longues séries de téléchargements.
  const get = async (u, o) => { const res = await fetch(u, o); if (!res.ok) await res.arrayBuffer().catch(() => {}); return res }
  const kitHome = process.env.NEXORA_KITS || path.join(os.homedir(), ".cache", "nexora-kits")
  const kitLog = (l) => { if (process.env.NEXORA_KITS_LOG) console.log(`     ${l}`) }
  const osKit = new mod.OneSignalKit({ home: kitHome, fetch: get, log: kitLog })
  const adsKit = new mod.AdsKit({ home: kitHome, fetch: get, log: kitLog })
  for (const [k, label] of [[osKit, "OneSignal"], [adsKit, "AdMob"]]) {
    if (!k.status().installed) {
      console.log(`Préparation du kit ${label} (réseau, une à trois minutes)…`)
      try { await k.install(tools, (p) => kitLog(p.label)) } catch (e) { ok(false, `Kit ${label} préparé`, e.message); return }
    }
    const s = k.status()
    ok(s.installed, `Kit ${label} ${s.version} préparé (${s.artifacts} bibliothèques, ${(s.size / 1e6).toFixed(1)} Mo), pont compilé`, s)
  }
  const { Keystores } = require("../nexora/app/src/android/keystore.js")
  const base = (work, extra) => {
    const spec = {
      appName: "Kora", appId: "fr.kora.app", versionName: "1.0.0", versionCode: 1, mode: "remote", startUrl: "https://kora.example/", publicUrl: "", hosts: [], permissions: [],
      orientation: "unspecified", downloads: true, tv: false, deepLinks: null, shortcuts: [], colors: { splashBg: "#FFFFFF", iconBg: "#FFFFFF", accent: "#5B5BD6" },
      config: { tabs: [], linkRules: [] }, images: {}, outputs: { apk: true, aab: false }, outDir: path.join(work, "out"), ...extra,
    }
    for (const d of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) for (const f of ["ic_launcher", "ic_launcher_round", "ic_launcher_foreground", "ic_launcher_monochrome"]) spec.images[`mipmap-${d}/${f}.png`] = png(96)
    spec.images["drawable-xxhdpi/vt_splash_icon.png"] = png(288)
    spec.images["drawable-xxhdpi/vt_splash_logo.png"] = png(288)
    return spec
  }
  const inspect = (r, work) => {
    const dump = spawnSync(tools.buildTools.aapt2, ["dump", "xmltree", "--file", "AndroidManifest.xml", r.apk], { encoding: "utf8", maxBuffer: 64e6 }).stdout
    const listing = spawnSync("unzip", ["-l", r.apk], { encoding: "utf8", maxBuffer: 64e6 }).stdout
    const dexes = [...new Set([...listing.matchAll(/(classes\d*\.dex)/g)].map((m) => m[1]))]
    fs.mkdirSync(path.join(work, "x"), { recursive: true })
    spawnSync("unzip", ["-qo", r.apk, "classes*.dex", "assets/vitrine/config.json", "-d", path.join(work, "x")])
    const descs = []
    for (const d of dexes) {
      const out = spawnSync(path.join(bt, "dexdump"), [path.join(work, "x", d)], { encoding: "utf8", maxBuffer: 1024e6 }).stdout || ""
      for (const m of out.matchAll(/^\s*Class descriptor\s*:\s*'([^']+)'/gm)) descs.push(m[1])
    }
    const seen = new Set()
    const dup = descs.filter((c) => (seen.has(c) ? true : (seen.add(c), false)))
    const conf = JSON.parse(fs.readFileSync(path.join(work, "x", "assets", "vitrine", "config.json"), "utf8"))
    const v = spawnSync(tools.java.java, ["-jar", tools.buildTools.apksigner, "verify", r.apk], { encoding: "utf8" })
    return { dump, classes: descs.join("\n"), conf, signed: v.status === 0, dup, dexes }
  }
  // 1. OneSignal et AdMob ensemble (identifiants réels de forme valide).
  let work = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-test-modules-"))
  let r
  try {
    r = await builder.build(base(work, {
      onesignal: { enabled: true, appId: OS_ID, ask: true },
      ads: { enabled: true, test: false, appId: ADM_APP, banner: { enabled: true, id: ADM_UNIT }, interstitial: { enabled: true, id: ADM_UNIT, every: 3 }, rewarded: { enabled: true, id: ADM_UNIT } },
    }), { tools, keystores: new Keystores({ dir: path.join(work, "keys") }), oneSignalKit: osKit, adsKit, owner: { name: "Kora" }, log: kitLog, step: () => {} })
  } catch (e) { ok(false, "APK construit avec OneSignal et AdMob", e.message); return }
  ok(r && r.apk && fs.existsSync(r.apk), `APK construit avec OneSignal et AdMob (${Math.round(fs.statSync(r.apk).size / 1024)} Ko)`, r)
  let x = inspect(r, work)
  ok(x.dump.includes("com.google.android.gms.ads.APPLICATION_ID") && x.dump.includes(ADM_APP), "Manifeste : identifiant de l'application AdMob")
  ok(/com\.onesignal\.suppressLaunchURLs/.test(x.dump) && /com\.google\.android\.gms\.version/.test(x.dump), "Manifeste : liens OneSignal gardés dans l'application, version des services Google")
  ok(/POST_NOTIFICATIONS/.test(x.dump) && /AD_ID/.test(x.dump) && /ACCESS_NETWORK_STATE/.test(x.dump), "Manifeste : notifications, identifiant publicitaire, état du réseau")
  ok(/com\.onesignal\.notifications/.test(x.dump) && /com\.google\.android\.gms\.ads\.AdActivity/.test(x.dump), "Manifeste : composants de OneSignal et activité des annonces fusionnés")
  ok(/Lapp\/vitrine\/shell\/VtOneSignal;/.test(x.classes) && /Lapp\/vitrine\/shell\/VtAds;/.test(x.classes), "Code : ponts VtOneSignal et VtAds présents")
  ok(/Lcom\/onesignal\/OneSignal;/.test(x.classes) && /Lcom\/google\/android\/gms\/ads\/MobileAds;/.test(x.classes) && /Lcom\/google\/android\/ump\/UserMessagingPlatform;/.test(x.classes), "Code : SDK OneSignal, Google Mobile Ads et consentement (UMP) intégrés")
  // Seules des classes identiques d'une grande bibliothèque gardée (guava : interface ListenableFuture) peuvent rester en double.
  const dupOk = (d) => d.every((c) => /^Lcom\/google\/common\/util\/concurrent\/ListenableFuture;$/.test(c))
  ok(dupOk(x.dup), `Code : aucune classe en double hors ListenableFuture (${x.dexes.length} fichiers dex)`, x.dup.slice(0, 5))
  ok(x.conf.onesignal && x.conf.onesignal.appId === OS_ID && x.conf.ads && x.conf.ads.banner === ADM_UNIT && x.conf.ads.autoEvery === 3 && x.conf.ads.test === false, "Configuration embarquée : OneSignal et AdMob", { onesignal: x.conf.onesignal, ads: x.conf.ads })
  ok(x.signed, "Signature de l'APK vérifiée (apksigner)")
  fs.rmSync(work, { recursive: true, force: true })
  // 2. Notifications push de NEXORA (Firebase) et AdMob : bibliothèques communes (services Google) une seule fois.
  const push = require("../nexora/app/src/android/push.js")
  const pushKit = new push.PushKit({ home: process.env.NEXORA_PUSH_KIT || path.join(os.homedir(), ".cache", "nexora-push-kit"), fetch: get, log: () => {} })
  if (!pushKit.status().installed) {
    console.log("Préparation du kit Firebase Messaging (réseau, environ une minute)…")
    await pushKit.install(tools, () => {})
  }
  work = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-test-modules-"))
  const gs = JSON.stringify({ project_info: { project_number: "123456789", project_id: "kora", storage_bucket: "kora.appspot.com" }, client: [{ client_info: { mobilesdk_app_id: "1:123456789:android:abcdef", android_client_info: { package_name: "fr.kora.app" } }, api_key: [{ current_key: "AIzaSyTEST" }] }] })
  try {
    r = await builder.build(base(work, { push: { enabled: true, googleServices: gs, channel: "Notifications" }, ads: { enabled: true, banner: { enabled: true } } }), { tools, keystores: new Keystores({ dir: path.join(work, "keys") }), pushKit, adsKit, owner: { name: "Kora" }, log: kitLog, step: () => {} })
  } catch (e) { ok(false, "APK construit avec les notifications push (Firebase) et AdMob en mode test", e.message); return }
  x = inspect(r, work)
  ok(x.signed && /VtPushService/.test(x.dump) && /Lcom\/google\/android\/gms\/ads\/MobileAds;/.test(x.classes) && /Lcom\/google\/firebase\/messaging\/FirebaseMessaging;/.test(x.classes), "APK avec notifications push (Firebase) et AdMob en mode test : construit et signé")
  ok(dupOk(x.dup) && /Lcom\/google\/common\/collect\/ImmutableList;/.test(x.classes) && x.conf.ads.appId === mod.ADMOB_TEST.appId && x.dump.includes(mod.ADMOB_TEST.appId), "Bibliothèques communes une seule fois (guava gardée), identifiants d'essai de Google en mode test", x.dup.slice(0, 5))
  fs.rmSync(work, { recursive: true, force: true })
}
