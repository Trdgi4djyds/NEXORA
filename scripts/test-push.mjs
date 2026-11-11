// NEXORA #073 : essais des notifications push et de la messagerie des applications de l'App Builder.
//   pnpm test:push          essais rapides, sans réseau : messages FCM (src/android/push.js), configuration de
//                           l'application (builder.js), règles de la section (nx/android/pushmsg.js), pont
//                           window.NexoraApp.push (android/templates/bridge.js) dans un navigateur simulé
//   pnpm test:push --apk    en plus : prépare le vrai kit Firebase Messaging (dépôts Maven de Google), compile le
//                           service de réception, construit un APK avec messagerie, appels et catégories, puis lit
//                           son manifeste, son code (dexdump) et sa configuration. Outils Android : ceux de
//                           pnpm android:shell (~/.cache/nexora-android, téléchargés s'ils manquent).
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import vm from "node:vm"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import * as M from "../nexora/app/renderer/nx/android/pushmsg.js"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)
const push = require("../nexora/app/src/android/push.js")
const builder = require("../nexora/app/src/android/builder.js")

let count = 0
let fails = 0
function ok(cond, label, detail) {
  count += 1
  if (!cond) fails += 1
  console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}${!cond && detail !== undefined ? ` → ${JSON.stringify(detail).slice(0, 400)}` : ""}`)
}
const allStrings = (o) => Object.values(o || {}).every((v) => typeof v === "string")

// ---------- Messages FCM ----------
const n = push.buildMessage({ appId: "com.ex.chat", title: "Promo", body: "-20 %", url: "https://ex.com/p", topic: "all" })
ok(n.notification && n.notification.title === "Promo" && n.android.notification.channel_id === "vt_default" && n.data.url === "https://ex.com/p", "Notification simple : bloc notification, catégorie par défaut, lien", n)
ok(n.topic === "com_ex_chat__all" && n.android.restricted_package_name === "com.ex.chat" && n.data.vt_app === "com.ex.chat", "Notification simple : sujet préfixé, paquet visé", n)
const tn = push.buildMessage({ appId: "com.ex.chat", title: "x", tag: "commande_7", channel: "Commandes à emporter" })
ok(tn.android.notification.tag === "commande_7" && tn.android.notification.channel_id === "vt_commandes_a_emporter", "Notification simple : tag (remplacement) et catégorie choisie", tn.android)
const msg = push.buildMessage({ kind: "message", appId: "com.ex.chat", token: " abc ", sender: "Awa", body: "Salut", tag: "conv_42", channel: "Messages", badge: 3.4, avatar: "https://ex.com/a.jpg", key: "k1" })
ok(!msg.notification && msg.data.type === "message" && msg.data.sender === "Awa" && msg.data.tag === "conv_42" && msg.data.badge === "3" && msg.data.key === "k1", "Conversation : message data seulement, champs de conversation", msg)
ok(msg.token === "abc" && !msg.topic && msg.android.priority === "high" && allStrings(msg.data), "Conversation : jeton visé, priorité haute, valeurs data en texte", msg)
const call = push.buildMessage({ kind: "call", appId: "com.ex.chat", sender: "Awa", timeout: 500 })
ok(call.data.type === "call" && call.data.tag === "appel" && call.data.timeout === "120" && call.android.ttl === "120s" && allStrings(call.data), "Appel : tag par défaut, sonnerie plafonnée à 120 s, expiration identique", call)
const call2 = push.buildMessage({ kind: "call", appId: "com.ex.chat", sender: "Awa", timeout: 3 })
ok(call2.data.timeout === "10" && call2.android.ttl === "10s", "Appel : sonnerie d'au moins 10 s", call2)
const cancel = push.buildMessage({ kind: "cancel", appId: "com.ex.chat", tag: "conv_42", body: "ignoré", sender: "ignoré" })
ok(cancel.data.type === "cancel" && cancel.data.tag === "conv_42" && !cancel.data.body && !cancel.data.sender, "Retrait : type et tag seulement", cancel.data)
ok(push.buildMessage({ kind: "inconnu", title: "t" }).notification, "Type inconnu : notification simple")
ok(push.channelId("Commandes à emporter") === "vt_commandes_a_emporter" && push.channelId("  ") === "vt_default" && push.channelId("Été ★ 2026") === "vt_ete_2026", "Identifiant de catégorie : accents, espaces, symboles")
for (const name of ["Messages", "Commandes à emporter", "Rappels / Agenda", "Œuvre", "ÇA VA", "x".repeat(60)]) {
  ok(push.channelId(name) === M.channelId(name), `Même identifiant côté PC et dans l'interface : « ${name.slice(0, 20)} »`)
}
ok(push.appTopic("com.ex.chat", "promos") === "com_ex_chat__promos" && push.appTopic("com.ex.chat", "com_ex_chat__promos") === "com_ex_chat__promos" && push.appTopic("com.ex.chat", "/topics/a b") === "com_ex_chat__a_b", "Sujets : préfixe ajouté une seule fois, caractères nettoyés")

// ---------- Configuration de l'application (assets/vitrine/config.json) ----------
const base = { appName: "Chat", startUrl: "https://ex.com/", mode: "remote" }
let c = builder.shellConfig({ ...base, push: { enabled: true, topics: ["all"], actionUrl: "https://ex.com/api/a", messaging: true, calls: true, callTimeout: 999, channels: [{ name: "Messages", importance: "high" }, { name: "messages" }, { name: "Rappels", importance: "bizarre" }, { name: "" }, { name: "Default" }] } })
ok(c.push.enabled && c.push.messaging && c.push.calls && c.push.callTimeout === 120 && c.push.actionUrl === "https://ex.com/api/a", "Configuration : messagerie, appels, délai plafonné, adresse des actions", c.push)
ok(JSON.stringify(c.push.channels) === JSON.stringify([{ id: "vt_messages", name: "Messages", importance: "high" }, { id: "vt_rappels", name: "Rappels", importance: "default" }]), "Configuration : catégories sans doublon ni nom réservé, importance vérifiée", c.push.channels)
c = builder.shellConfig({ ...base, push: { enabled: true, calls: true, actionUrl: "ftp://x" } })
ok(!c.push.calls && !c.push.messaging && c.push.actionUrl === "" && c.push.showWhenOpen === true, "Configuration : appels seulement avec la messagerie, adresse invalide écartée, notifications à l'écran par défaut", c.push)
c = builder.shellConfig({ ...base, mode: "twa", push: { enabled: true, messaging: true } })
ok(c.push.enabled === false, "Configuration : pas de notifications push en mode Trusted Web Activity")

// ---------- Règles de la section (pushmsg.js) ----------
const cfg = { appId: "com.ex.chat", appName: "Chat", permissions: ["vibrate"], push: { enabled: true, messaging: true, calls: true, actionUrl: "http://ex.com/a", channels: [{ name: "Messages" }, { name: "messages" }, { name: "calls" }] } }
M.defaults(cfg)
ok(cfg.push.showWhenOpen === true && cfg.push.callTimeout === 45 && cfg.push.msgTest && cfg.push.msgTest.kind === "message", "Section : valeurs par défaut posées")
const pb = M.problems(cfg).map(([, m]) => m).join(" | ")
ok(/https:\/\//.test(pb) && /Micro/.test(pb) && /même nom/.test(pb) && /réservés/.test(pb), "Section : adresse non https, micro manquant, doublon, nom réservé signalés", pb)
cfg.push.actionUrl = "https://ex.com/a"; cfg.permissions.push("microphone"); cfg.push.channels = [{ name: "Messages" }]
ok(M.problems(cfg).length === 0, "Section : réglages corrects, rien à signaler", M.problems(cfg))
ok(M.problems({ push: { enabled: false, actionUrl: "x" } }).length === 0, "Section : notifications désactivées, aucun contrôle")
const ex = M.pushExtras(cfg)
ok(ex.messaging && ex.calls && ex.actionUrl === "https://ex.com/a" && ex.channels.length === 1 && ex.showWhenOpen, "Section : réglages envoyés à la construction", ex)
const samples = M.serverExamples(cfg)
let samplesOk = true
for (const [k, v] of Object.entries(samples)) {
  try {
    const j = JSON.parse(v)
    if (j.message && j.message.data && !allStrings(j.message.data)) samplesOk = false
    if (j.message && j.message.android && j.message.android.restricted_package_name !== "com.ex.chat") samplesOk = false
  } catch { samplesOk = false; console.log(`  exemple illisible : ${k}`) }
}
ok(samplesOk && JSON.parse(samples.event).message.topic === "com_ex_chat__all" && JSON.parse(samples.event).message.android.notification.channel_id === "vt_messages", "Section : exemples pour le serveur valides (JSON, valeurs data en texte, paquet, sujet, catégorie)")
ok(M.topicPrefix("fr.kora.chat") === "fr_kora_chat__", "Section : préfixe des sujets")

// ---------- Pont window.NexoraApp.push (navigateur simulé) ----------
const BRIDGE = fs.readFileSync(path.join(ROOT, "nexora/app/android/templates/bridge.js"), "utf8")
function browser(native) {
  const listeners = {}
  const win = {
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f) },
    removeEventListener: (t, f) => { listeners[t] = (listeners[t] || []).filter((x) => x !== f) },
    dispatchEvent: (e) => { for (const f of [...(listeners[e.type] || [])]) f(e); return true },
  }
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail } }
  const ctx = {
    window: win, CustomEvent, setTimeout, clearTimeout, Promise, JSON, console,
    setInterval: (f, ms) => { const t = setInterval(f, ms); t.unref(); return t }, clearInterval, FileReader: class {}, Notification: undefined,
    screen: {}, navigator: {}, location: { href: "https://ex.com/" },
    requestAnimationFrame: (f) => setTimeout(f, 0), innerWidth: 400, innerHeight: 800, addEventListener: win.addEventListener,
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }), getComputedStyle: () => ({ backgroundColor: "rgb(255, 255, 255)" }),
    Event: class { constructor(type) { this.type = type } },
  }
  // Document minimal : le pont pose quelques classes, styles et écouteurs au chargement.
  const el = () => ({ style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, setAttribute() {}, getAttribute: () => null, nodeType: 1, clientWidth: 400, scrollTop: 0 })
  const root = el()
  ctx.document = { addEventListener() {}, documentElement: root, body: el(), head: el(), scrollingElement: root, createElement: el, querySelectorAll: () => [], querySelector: () => null, elementFromPoint: () => null }
  win.open = () => null
  win.VitrineNative = native
  ctx.self = win
  vm.createContext(ctx)
  // Le pont lit « window » et les globales : on expose les deux.
  vm.runInContext(`var window = this.window; var addEventListener = window.addEventListener;${BRIDGE}`, ctx)
  const fire = (detail) => win.dispatchEvent(new CustomEvent("vitrinepush", { detail }))
  return { win, fire, App: win.NexoraApp }
}
const calls = []
let state = { enabled: true, token: null }
let queue = JSON.stringify([
  { type: "message", message: { id: "1", tag: "conv_1", body: "A" }, queued: true, receivedAt: 1 },
  { type: "action", action: "read", tag: "conv_1", ok: true, queued: true },
  { type: "message", message: { id: "2", tag: "conv_2", body: "B" }, queued: true, receivedAt: 2 },
  { type: "deleted", queued: true },
])
let opened = JSON.stringify({ type: "open", action: "accept", message: { id: "9", tag: "appel_1", url: "/appels/1" } })
const rec = (name) => (...a) => { calls.push([name, ...a]) }
const native = {
  appInfo: () => "{}",
  pushState: () => JSON.stringify(state),
  pushPending: () => { calls.push(["pushPending"]); const q = queue; queue = "[]"; return q },
  pushOpened: () => { const o = opened; opened = ""; return o },
  pushHandled: rec("pushHandled"), pushActive: rec("pushActive"), pushShowWhenOpen: rec("pushShowWhenOpen"), pushClear: rec("pushClear"),
  pushRequestToken: rec("pushRequestToken"), pushDeleteToken: rec("pushDeleteToken"), pushRegister: rec("pushRegister"), pushSettings: rec("pushSettings"),
  pushPageOpens: rec("pushPageOpens"), pushSubscribe: rec("pushSubscribe"), pushPermission: rec("pushPermission"),
  setOrientation: () => true, orientation: () => "portrait", toast() {}, notify() {}, share() {}, vibrate() {}, keepAwake() {}, exit() {},
}
const { win, fire, App } = browser(native)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
ok(!!(App && App.push && App.push.onMessage && App.push.deleteToken && App.push.onOpen), "Pont : NexoraApp.push complet")
const got = []
const acts = []
let missed = 0
App.push.onMessage((m) => { got.push(m); return m.tag === "conv_live" })
App.push.onAction((a) => acts.push(a))
App.push.onMissed(() => { missed += 1 })
await wait(5)
ok(got.length === 2 && got.every((m) => m.queued) && got[0].receivedAt === 1, "Pont : messages reçus page absente remis à l'ouverture", got)
ok(acts.length === 1 && acts[0].action === "read" && missed === 1, "Pont : actions et pertes en attente remises aussi", { acts, missed })
ok(calls.filter((x) => x[0] === "pushPending").length === 1, "Pont : file lue une seule fois par page")
const late = []
App.push.onMessage((m) => late.push(m))
await wait(5)
ok(late.length === 2, "Pont : un écouteur ajouté plus tard reçoit aussi les messages en attente", late)
fire({ type: "message", message: { tag: "conv_live", body: "x" }, ask: "q1" })
ok(calls.some((x) => x[0] === "pushHandled" && x[1] === "q1" && x[2] === true), "Pont : écouteur qui renvoie true → message pris en charge, pas de notification")
fire({ type: "message", message: { tag: "autre", body: "y" }, ask: "q2" })
ok(calls.some((x) => x[0] === "pushHandled" && x[1] === "q2" && x[2] === false), "Pont : aucun écouteur ne le prend → notification affichée, sans attendre")
App.push.onMessage((m) => (m.tag === "conv_async" ? new Promise((r) => setTimeout(() => r(true), 30)) : undefined))
fire({ type: "message", message: { tag: "conv_async" }, ask: "q3" })
await wait(80)
ok(calls.some((x) => x[0] === "pushHandled" && x[1] === "q3" && x[2] === true), "Pont : promesse de true dans le délai → prise en charge")
App.push.onMessage((m) => (m.tag === "conv_lent" ? new Promise(() => {}) : undefined))
fire({ type: "message", message: { tag: "conv_lent" }, ask: "q4" })
await wait(760)
ok(calls.some((x) => x[0] === "pushHandled" && x[1] === "q4" && x[2] === false), "Pont : réponse trop lente (700 ms) → notification affichée")
App.push.setActive("conv_42"); App.push.setActive(null); App.push.showWhenOpen(false); App.push.clear("conv_42"); App.push.openSettings("battery")
ok(calls.some((x) => x[0] === "pushActive" && x[1] === "conv_42") && calls.some((x) => x[0] === "pushActive" && x[1] === "") && calls.some((x) => x[0] === "pushShowWhenOpen" && x[1] === false)
  && calls.some((x) => x[0] === "pushClear" && x[1] === "conv_42") && calls.some((x) => x[0] === "pushSettings" && x[1] === "battery"), "Pont : conversation affichée, notifications à l'écran, retrait, réglages")
const tokP = App.push.getToken(2000)
ok(calls.some((x) => x[0] === "pushRequestToken"), "Pont : sans jeton, getToken() en demande un nouveau")
fire({ type: "token", token: "T1" })
ok((await tokP) === "T1", "Pont : getToken() reçoit le nouveau jeton")
state = { enabled: true, token: "T1" }
const regP = App.push.register({ fields: { user: "42" }, headers: { Authorization: "Bearer x" } })
await wait(5)
const reg = calls.find((x) => x[0] === "pushRegister")
ok(reg && JSON.parse(reg[1]).fields.user === "42" && /^v\d+_/.test(reg[2]), "Pont : register() transmet champs et en-têtes", reg)
win.__vitrineResolve(reg[2], true, true)
ok((await regP) === true, "Pont : register() résolu par l'application")
const delP = App.push.deleteToken()
const del = calls.find((x) => x[0] === "pushDeleteToken")
win.__vitrineResolve(del[1], true, true)
ok(del && (await delP) === true, "Pont : deleteToken() appelle l'application et attend sa réponse")
const opens = []
App.push.onOpen((m, action) => opens.push([m.id, action]), { navigate: false })
await wait(5)
ok(opens.length === 1 && opens[0][0] === "9" && opens[0][1] === "accept" && calls.some((x) => x[0] === "pushPageOpens" && x[1] === true), "Pont : notification touchée remise à la page (appel accepté), navigation gérée par la page", opens)
const opens2 = []
App.push.onOpen((m, action) => opens2.push(action))
await wait(5)
ok(opens2.length === 1 && opens2[0] === "accept", "Pont : un second écouteur reçoit aussi l'ouverture")
fire({ type: "action", action: "reply", tag: "conv_1", text: "Oui", ok: true })
ok(acts.length === 2 && acts[1].text === "Oui", "Pont : réponse depuis la notification transmise à la page")

// ---------- Construction réelle (option --apk) ----------
if (process.argv.includes("--apk")) await realBuild()

console.log(`\n${count} vérifications, ${fails} échec(s).`)
process.exit(fails ? 1 : 0)

// PNG uni (RGBA), sans dépendance.
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
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-test-push-"))
  const kitHome = process.env.NEXORA_PUSH_KIT || path.join(os.homedir(), ".cache", "nexora-push-kit")
  const kit = new push.PushKit({ home: kitHome, fetch: (u, o) => fetch(u, o), log: () => {} })
  if (!kit.status().installed) {
    console.log("Préparation du kit Firebase Messaging (réseau, environ une minute)…")
    await kit.install(tools, () => {})
  }
  const st = kit.status()
  ok(st.installed, `Kit Firebase Messaging ${st.version} préparé (${st.artifacts} bibliothèques), service de réception compilé`, st)
  const { Keystores } = require("../nexora/app/src/android/keystore.js")
  const gs = JSON.stringify({
    project_info: { project_number: "123456789", project_id: "kora-chat", storage_bucket: "kora-chat.appspot.com" },
    client: [{ client_info: { mobilesdk_app_id: "1:123456789:android:abcdef", android_client_info: { package_name: "fr.kora.chat" } }, api_key: [{ current_key: "AIzaSyTEST" }] }],
  })
  const cfg = {
    appId: "fr.kora.chat", appName: "Kora Chat", permissions: ["vibrate", "notifications", "microphone", "camera"],
    push: { enabled: true, googleServices: gs, ask: true, channel: "Notifications", registerUrl: "https://kora.example/api/appareils", topics: ["all"], messaging: true, calls: true, actionUrl: "https://kora.example/api/actions", channels: [{ name: "Messages", importance: "high" }, { name: "Commandes" }] },
  }
  const spec = {
    appName: "Kora Chat", appId: "fr.kora.chat", versionName: "1.0.0", versionCode: 1, mode: "remote", startUrl: "https://kora.example/", publicUrl: "", hosts: [], permissions: cfg.permissions,
    orientation: "unspecified", downloads: true, tv: false, deepLinks: null, shortcuts: [], colors: { splashBg: "#FFFFFF", iconBg: "#FFFFFF", accent: "#5B5BD6" },
    config: { tabs: [], linkRules: [], events: { enabled: true } }, push: { ...cfg.push, ...M.pushExtras(cfg) }, images: {}, outputs: { apk: true, aab: false }, outDir: path.join(work, "out"),
  }
  // Images normalement dessinées par l'interface de l'App Builder (icônes, écran de démarrage) : carrés unis.
  for (const d of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) for (const f of ["ic_launcher", "ic_launcher_round", "ic_launcher_foreground", "ic_launcher_monochrome"]) spec.images[`mipmap-${d}/${f}.png`] = png(96)
  spec.images["drawable-xxhdpi/vt_splash_icon.png"] = png(288)
  spec.images["drawable-xxhdpi/vt_splash_logo.png"] = png(288)
  let r
  try {
    r = await builder.build(spec, { tools, keystores: new Keystores({ dir: path.join(work, "keys") }), pushKit: kit, owner: { name: "Kora" }, log: () => {}, step: () => {} })
  } catch (e) {
    ok(false, "APK construit avec messagerie, appels et catégories", e.message)
    return
  }
  ok(r && r.apk && fs.existsSync(r.apk), `APK construit avec messagerie, appels et catégories (${Math.round(fs.statSync(r.apk).size / 1024)} Ko)`, r)
  const dump = spawnSync(tools.buildTools.aapt2, ["dump", "xmltree", "--file", "AndroidManifest.xml", r.apk], { encoding: "utf8", maxBuffer: 64e6 }).stdout
  ok(/app\.vitrine\.shell\.PushAction/.test(dump) && /app\.vitrine\.shell\.VtPushService/.test(dump) && /MESSAGING_EVENT/.test(dump), "Manifeste : service de réception et récepteur des actions déclarés")
  ok(/USE_FULL_SCREEN_INTENT/.test(dump) && /POST_NOTIFICATIONS/.test(dump) && /android\.permission\.VIBRATE/.test(dump) && /RECORD_AUDIO/.test(dump), "Manifeste : écran d'appel, notifications, vibration, micro")
  const listing = spawnSync("unzip", ["-l", r.apk], { encoding: "utf8" }).stdout
  const dexes = [...listing.matchAll(/(classes\d*\.dex)/g)].map((m) => m[1])
  fs.mkdirSync(path.join(work, "x"), { recursive: true })
  spawnSync("unzip", ["-qo", r.apk, "classes*.dex", "assets/vitrine/config.json", "-d", path.join(work, "x")])
  let classes = ""
  for (const d of new Set(dexes)) classes += spawnSync(path.join(bt, "dexdump"), [path.join(work, "x", d)], { encoding: "utf8", maxBuffer: 256e6 }).stdout
  ok(/Lapp\/vitrine\/shell\/Push;/.test(classes) && /'receive'/.test(classes) && /'deleteToken'/.test(classes) && /Lapp\/vitrine\/shell\/PushAction;/.test(classes) && /Lapp\/vitrine\/shell\/VtPushService;/.test(classes), "Code de l'application : Push (receive, deleteToken), PushAction et VtPushService présents")
  ok(/Lcom\/google\/firebase\/messaging\/FirebaseMessaging;/.test(classes), "Code de l'application : Firebase Messaging intégré")
  const conf = JSON.parse(fs.readFileSync(path.join(work, "x", "assets", "vitrine", "config.json"), "utf8"))
  ok(conf.push && conf.push.messaging && conf.push.calls && conf.push.actionUrl === "https://kora.example/api/actions" && conf.push.channels.length === 2 && conf.push.channels[0].id === "vt_messages", "Configuration embarquée : messagerie, appels, adresse des actions, catégories", conf.push)
  const v = spawnSync(tools.java.java, ["-jar", tools.buildTools.apksigner, "verify", r.apk], { encoding: "utf8" })
  ok(v.status === 0, "Signature de l'APK vérifiée (apksigner)", v.stderr)
  fs.rmSync(work, { recursive: true, force: true })
}
