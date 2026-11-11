// NEXORA #058 : essais du Desktop Builder sans Windows ni Electron : réglages et configuration de construction
// (src/desktop/project.js : signature Microsoft dans le cloud, paquet Microsoft Store, types de fichiers, canal
// bêta, intégration à Windows, statistiques), écriture du projet (pastilles), fonctions de distribution
// (src/desktop/distrib.js : suivi d'Electron, Bac à sable Windows, winget, latest.yml, publication GitHub avec un
// faux serveur), canaux desktop:* ajoutés (faux ipcMain) et logiciel généré (desktop/template/app/main.js chargé avec
// un faux module electron, Windows simulé). Lancement : pnpm test:desktop.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const project = require("../nexora/app/src/desktop/project.js")
const D = require("../nexora/app/src/desktop/distrib.js")
const { OWNER_FILE } = require("../nexora/app/src/desktop/builder.js")

let count = 0
let fails = 0
function ok(cond, label, detail) {
  count += 1
  if (!cond) fails += 1
  console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}${!cond && detail !== undefined ? ` → ${JSON.stringify(detail).slice(0, 300)}` : ""}`)
}
const throws = (fn, re) => { try { fn(); return false } catch (e) { return re ? re.test(e.message) : true } }
const base = () => ({
  name: "Boutique Awa", appId: "fr.boutique.awa", version: "1.2.0", publisher: "Awa SARL", description: "Commandes", source: { kind: "url", url: "https://boutique.exemple.fr/" },
  install: { formats: { nsis: true } }, updates: { mode: "github", owner: "awa", repo: "boutique" },
})

// ---------- Réglages ----------
let c = project.sanitize({ ...base(), behavior: { badge: true, shortcut: "CommandOrControl+Alt+B", jumpList: [{ label: "Nouvelle commande", path: "/commandes/nouvelle" }, { label: "Sans barre", path: "commandes" }, { label: "", path: "/x" }], fileTypes: [{ ext: ".DEVIS", name: "Devis" }, { ext: "exe", name: "Programme" }, { ext: "devis", name: "Doublon" }, { ext: "plan" }] } })
ok(c.behavior.badge === true && c.behavior.shortcut === "CommandOrControl+Alt+B", "Pastille et raccourci global gardés")
ok(c.behavior.jumpList.length === 1 && c.behavior.jumpList[0].path === "/commandes/nouvelle", "Actions de l’icône : chemin /… exigé, nom exigé", c.behavior.jumpList)
ok(JSON.stringify(c.behavior.fileTypes) === JSON.stringify([{ ext: "devis", name: "Devis" }, { ext: "plan", name: "PLAN" }]), "Types de fichiers : point retiré, .exe refusé, doublon écarté", c.behavior.fileTypes)
ok(project.sanitize({ ...base(), behavior: { shortcut: "Alt+F4+X" } }).behavior.shortcut === "" && project.sanitize({ ...base(), behavior: { shortcut: "Ctrl+Shift+F12" } }).behavior.shortcut === "Ctrl+Shift+F12", "Raccourci global : forme invalide ignorée")
ok(c.updates.channel === "latest" && project.sanitize({ ...base(), updates: { ...base().updates, channel: "beta" } }).updates.channel === "beta", "Canal des mises à jour")
ok(throws(() => project.sanitize({ ...base(), signing: { enabled: true, mode: "azure", azure: { endpoint: "https://exemple.com/", account: "acc", profile: "prof", publisherName: "Awa" } } }), /région/), "Signature Azure : région invalide refusée")
ok(throws(() => project.sanitize({ ...base(), signing: { enabled: true, mode: "azure", azure: { endpoint: "https://weu.codesigning.azure.net/", account: "acc", profile: "prof" } } }), /éditeur/), "Signature Azure : nom de l’éditeur exigé")
const az = project.sanitize({ ...base(), signing: { enabled: true, mode: "azure", azure: { endpoint: "https://weu.codesigning.azure.net", account: "awa-sign", profile: "public", publisherName: "Awa SARL" } } })
ok(az.signing.azure.endpoint === "https://weu.codesigning.azure.net/", "Signature Azure : adresse complétée par /")
ok(throws(() => project.sanitize({ ...base(), install: { formats: { appx: true } }, store: { identityName: "Awa.Boutique", publisher: "Awa" } }), /CN=/), "Paquet Store : éditeur CN=… exigé")
const st = project.sanitize({ ...base(), install: { formats: { nsis: true, appx: true } }, store: { identityName: "12345Awa.Boutique", publisher: "CN=1234ABCD-0000-1111-2222-333344445555" } })
ok(st.install.formats.appx && st.store.publisherDisplayName === "Awa SARL", "Paquet Store : nom affiché de l’éditeur repris")
ok(project.sanitize({ ...base(), insights: { url: "https://abc.supabase.co", anon: "clé-anon", key: "k1" } }).insights.key === "k1" && project.sanitize({ ...base(), insights: { url: "http://abc", anon: "a", key: "k" } }).insights === null, "Statistiques : https exigé")

// ---------- Configuration de construction ----------
let cfg = project.builderConfig(az, { electronVersion: "40.1.0" })
ok(cfg.win.azureSignOptions && cfg.win.azureSignOptions.codeSigningAccountName === "awa-sign" && cfg.win.azureSignOptions.certificateProfileName === "public" && cfg.win.azureSignOptions.publisherName === "Awa SARL" && !cfg.win.signtoolOptions, "electron-builder : signature Azure sans signtool")
cfg = project.builderConfig(project.sanitize({ ...base(), signing: { enabled: true } }), { electronVersion: "40.1.0" })
ok(cfg.win.signtoolOptions && !cfg.win.azureSignOptions, "electron-builder : certificat .pfx avec horodatage")
cfg = project.builderConfig(project.sanitize({ ...base(), updates: { ...base().updates, channel: "beta" } }), { electronVersion: "40.1.0" })
ok(cfg.publish.channel === "beta" && cfg.publish.releaseType === "prerelease", "electron-builder : canal bêta publié en pré-version")
cfg = project.builderConfig(c, { electronVersion: "40.1.0" })
ok(cfg.fileAssociations.length === 2 && cfg.fileAssociations[0].ext === "devis" && cfg.fileAssociations[0].role === "Editor" && cfg.publish.channel === undefined, "electron-builder : associations de fichiers")
cfg = project.builderConfig(st, { electronVersion: "40.1.0" })
ok(cfg.win.target.some((t) => t.target === "appx") && cfg.appx.identityName === "12345Awa.Boutique" && cfg.appx.publisher.startsWith("CN=") && /^[A-Za-z][A-Za-z0-9]*$/.test(cfg.appx.applicationId), "electron-builder : paquet MSIX", cfg.appx)
const ac = project.appConfig(project.sanitize({ ...base(), behavior: c.behavior, updates: { ...base().updates, channel: "beta" }, insights: { url: "https://abc.supabase.co", anon: "a", key: "k" } }))
ok(ac.updates.channel === "beta" && ac.insights.key === "k" && ac.behavior.jumpList.length === 1 && ac.behavior.badge, "config.json du logiciel : canal, statistiques, intégration")

// ---------- Projet écrit ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nx-desktop-"))
const png = Buffer.from("89504e470d0a1a0a", "hex")
const badges = Object.fromEntries([...Array.from({ length: 9 }, (_, i) => String(i + 1)), "9plus", "../x"].map((k) => [k, png]))
project.writeProject(path.join(tmp, "p"), c, { ico: png, png, png256: png, sidebar: png, badges }, { electronVersion: "40.1.0" })
const bdir = path.join(tmp, "p", "app", "assets", "badges")
ok(fs.readdirSync(bdir).length === 10 && fs.existsSync(path.join(bdir, "9plus.png")) && !fs.existsSync(path.join(tmp, "p", "app", "assets", "x.png")), "Projet : 10 pastilles écrites, nom suspect refusé")
const eb = JSON.parse(fs.readFileSync(path.join(tmp, "p", "electron-builder.json"), "utf8"))
ok(eb.fileAssociations && eb.fileAssociations.length === 2, "Projet : electron-builder.json avec associations")

// ---------- Electron ----------
const cycles = D.parseCycles([{ cycle: "40", eol: "2027-01-12", latest: "40.1.0" }, { cycle: "39", eol: "2026-11-20", latest: "39.4.2" }, { cycle: "38", eol: "2026-09-01", latest: "38.7.0" }, { cycle: "41", eol: false, latest: "41.0.0" }])
const now = Date.parse("2026-11-06T12:00:00Z")
ok(cycles[0].major === 41 && D.supportOf("41.0.0", cycles, now).state === "supported", "Electron : version récente suivie")
ok(D.supportOf("39.4.2", cycles, now).state === "soon" && D.supportOf("38.7.0", cycles, now).state === "ended" && D.supportOf("30.0.0", cycles, now).state === "ended", "Electron : bientôt plus suivi, plus suivi, très ancien")
ok(D.supportOf("", cycles, now).state === "unknown" && D.supportOf("38.7.0", cycles, now).newest === "41.0.0", "Electron : version inconnue, dernière version donnée")

// ---------- Bac à sable ----------
const wsb = D.sandboxConfig({ hostDir: "C:\\Users\\Awa\\Documents\\NEXORA\\Logiciels\\Boutique & Co", file: "C:\\x\\Boutique-Setup-1.2.0.exe", folder: "Boutique & Co" })
ok(wsb.includes("<HostFolder>C:\\Users\\Awa\\Documents\\NEXORA\\Logiciels\\Boutique &amp; Co</HostFolder>") && wsb.includes("<ReadOnly>true</ReadOnly>") && wsb.includes("<Command>&quot;C:\\Users\\WDAGUtilityAccount\\Desktop\\Boutique - Co\\Boutique-Setup-1.2.0.exe&quot;</Command>"), "Bac à sable : dossier en lecture seule, installateur lancé, XML échappé", wsb)
ok(D.sandboxConfig({ hostDir: "C:\\d", file: "C:\\d\\App-1.0.0-x64.msi" }).includes("msiexec /i"), "Bac à sable : MSI lancé par msiexec")

// ---------- winget ----------
const id = D.wingetId("Awa S.A.R.L.", "Boutique Awa")
ok(id === "AwaSARL.BoutiqueAwa", "winget : identifiant Éditeur.Logiciel", id)
const sha = crypto.createHash("sha256").update("x").digest("hex")
const man = D.wingetManifests({ id, name: "Boutique \"Awa\"", publisher: "Awa SARL", version: "1.2.0", url: "https://github.com/awa/boutique/releases/download/v1.2.0/Boutique-Setup-1.2.0.exe", sha256: sha, scope: "user", description: "Commandes", homepage: "https://boutique.exemple.fr/" })
ok(man.length === 3 && man[0].name === `${id}.yaml` && man[1].text.includes("InstallerType: nullsoft") && man[1].text.includes(`InstallerSha256: ${sha.toUpperCase()}`) && man[1].text.includes("Scope: user"), "winget : version, installateur NSIS, empreinte en majuscules")
ok(man[2].text.includes('PackageName: "Boutique \\"Awa\\""') && man[2].text.includes("License: \"Propriétaire\"") && man[2].text.includes("ShortDescription: \"Commandes\"") && man.every((m) => m.text.includes("ManifestVersion: 1.6.0")), "winget : textes entre guillemets, licence, description, schéma 1.6.0")
ok(throws(() => D.wingetManifests({ id, name: "x", version: "1.0.0", url: "http://x", sha256: sha })) && throws(() => D.wingetManifests({ id: "SansPoint", name: "x", version: "1.0.0", url: "https://x", sha256: sha })), "winget : https et identifiant à deux parties exigés")
ok(D.wingetDir(id, "1.2.0") === path.join("manifests", "a", "AwaSARL", "BoutiqueAwa", "1.2.0"), "winget : dossier du dépôt winget-pkgs")
const fsha = path.join(tmp, "f.bin"); fs.writeFileSync(fsha, "x")
ok((await D.sha256File(fsha)) === sha, "winget : empreinte SHA-256 du fichier")

// ---------- latest.yml ----------
const yml = "version: 1.2.0\nfiles:\n  - url: Boutique-Setup-1.2.0.exe\n    sha512: abc\npath: Boutique-Setup-1.2.0.exe\nreleaseDate: '2026-11-06T10:00:00.000Z'\n"
const y1 = D.patchUpdateYml(yml, { staging: 20, mandatory: true, notes: "• Plus rapide\n• Corrections" })
ok(y1.includes("stagingPercentage: 20\n") && y1.includes("nxMandatory: true\n") && y1.includes('releaseNotes: "• Plus rapide\\n• Corrections"') && y1.startsWith("version: 1.2.0\nfiles:"), "latest.yml : déploiement 20 %, obligatoire, nouveautés", y1)
const y2 = D.patchUpdateYml(y1, { staging: 100 })
ok(y2 === yml, "latest.yml : republier à 100 % retire tout", y2)
ok(D.patchUpdateYml("version: 1\nreleaseNotes: |\n  ligne 1\n  ligne 2\npath: a\n", {}) === "version: 1\npath: a\n", "latest.yml : anciennes nouveautés sur plusieurs lignes retirées")

// ---------- GitHub ----------
function fakeGh({ existing = false, status = {} } = {}) {
  const calls = []
  return { calls, fetch: async (url, opts = {}) => {
    calls.push(`${opts.method || "GET"} ${url.replace(/^https:\/\/(api|uploads)\.github\.com/, "")}`)
    const res = (s, j) => ({ ok: s < 300, status: s, json: async () => j })
    for (const [k, s] of Object.entries(status)) if (url.includes(k)) return res(s, { message: s === 422 ? "Repository is empty." : "x" })
    if (/releases\/tags\//.test(url)) return existing ? res(200, { id: 7, html_url: "https://github.com/awa/boutique/releases/tag/v1.2.0", prerelease: false, assets: [{ name: "latest.yml", id: 99 }] }) : res(404, {})
    if (/\/releases$/.test(url) && opts.method === "POST") return res(201, { id: 7, html_url: "https://github.com/awa/boutique/releases/tag/v1.2.0", assets: [] })
    if (/assets\/99$/.test(url)) return { ok: true, status: 204, json: async () => ({}) }
    if (/uploads|releases\/7\/assets/.test(url)) return res(201, { browser_download_url: `https://github.com/awa/boutique/releases/download/v1.2.0/${new URL(url).searchParams.get("name")}` })
    if (/releases\/7$/.test(url)) return res(200, { id: 7, html_url: "u", assets: [{ name: "latest.yml", id: 99 }] })
    return res(500, {})
  } }
}
const f1 = path.join(tmp, "Boutique-Setup-1.2.0.exe"); fs.writeFileSync(f1, "exe")
const f2 = path.join(tmp, "latest.yml"); fs.writeFileSync(f2, yml)
let g = fakeGh()
let r = await D.publishGithub({ owner: "awa", repo: "boutique", token: "ghp_x", version: "1.2.0", files: [{ path: f1 }, { path: f2 }], notes: "n" }, g.fetch)
ok(r.ok && r.tag === "v1.2.0" && g.calls.includes("POST /repos/awa/boutique/releases") && g.calls.filter((x) => x.startsWith("POST /repos/awa/boutique/releases/7/assets")).length === 2, "GitHub : version créée, 2 fichiers envoyés", g.calls)
g = fakeGh({ existing: true })
r = await D.publishGithub({ owner: "awa", repo: "boutique", token: "ghp_x", version: "1.2.0", files: [{ path: f2 }], prerelease: true }, g.fetch)
ok(g.calls.includes("DELETE /repos/awa/boutique/releases/assets/99") && g.calls.includes("PATCH /repos/awa/boutique/releases/7") && !g.calls.includes("POST /repos/awa/boutique/releases"), "GitHub : version existante, fichier remplacé, pré-version", g.calls)
let msg = ""; try { await D.publishGithub({ owner: "awa", repo: "boutique", token: "t", version: "1.2.0", files: [{ path: f1 }] }, fakeGh({ status: { "/releases/tags/": 401 } }).fetch) } catch (e) { msg = e.message }
ok(/Jeton GitHub refusé/.test(msg), "GitHub : jeton refusé expliqué", msg)
msg = ""; try { await D.publishGithub({ owner: "awa", repo: "boutique", token: "t", version: "1.2.0", files: [{ path: f1 }] }, fakeGh({ status: { "/releases": 422 } }).fetch) } catch (e) { msg = e.message }
ok(/dépôt est vide/.test(msg), "GitHub : dépôt vide expliqué", msg)
ok(D.publicUrl({ mode: "github", owner: "awa", repo: "boutique" }, "1.2.0", "C:\\x\\Boutique Setup.exe") === "https://github.com/awa/boutique/releases/download/v1.2.0/Boutique.Setup.exe" && D.publicUrl({ mode: "generic", url: "https://s.fr/maj/" }, "1", "a.exe") === "https://s.fr/maj/a.exe", "Adresse publique des fichiers (GitHub, serveur)")

// ---------- Canaux (faux ipcMain) ----------
const handlers = {}
const enc = (s) => Buffer.from(`chiffré:${s}`).toString("base64")
const { register } = require("../nexora/app/src/desktop/ipc.js")
process.env.NEXORA_DESKTOP_HOME = path.join(tmp, "home")
register({
  ipcMain: { handle: (k, fn) => { handlers[k] = fn } },
  app: { getPath: () => tmp, getVersion: () => "1.1.0" },
  dialog: {}, shell: { openPath: async () => "" }, net: null, send: () => {}, getWin: () => null,
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(`chiffré:${s}`), decryptString: (b) => Buffer.from(b).toString().replace(/^chiffré:/, "") },
})
ok(["desktop:publish", "desktop:winget", "desktop:sandbox", "desktop:electron-support", "desktop:gh-token-save", "desktop:azure-save"].every((k) => handlers[k]), "Canaux de distribution déclarés")
const out = path.join(tmp, "Logiciels", "Boutique")
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, OWNER_FILE), JSON.stringify({ appId: "fr.boutique.awa" }))
const exe = path.join(out, "Boutique-Awa-Setup-1.2.0.exe"); fs.writeFileSync(exe, "exe")
const lat = path.join(out, "latest.yml"); fs.writeFileSync(lat, yml)
r = await handlers["desktop:publish"]({}, { mode: "generic", version: "1.2.0", files: [exe, lat, "/etc/passwd"], staging: 30, notes: "n" })
ok(r.ok && r.files.length === 2 && fs.readFileSync(lat, "utf8").includes("stagingPercentage: 30"), "desktop:publish (serveur web) : latest.yml complété, fichier étranger ignoré", r)
msg = ""; try { await handlers["desktop:publish"]({}, { mode: "github", owner: "awa", repo: "boutique", version: "1.2.0", files: [exe] }) } catch (e) { msg = e.message }
ok(/jeton GitHub/i.test(msg), "desktop:publish (GitHub) : jeton exigé", msg)
msg = ""; try { await handlers["desktop:gh-token-save"]({}, { token: "mot-de-passe" }) } catch (e) { msg = e.message }
const saved = await handlers["desktop:gh-token-save"]({}, { token: "github_pat_" + "A".repeat(40) })
const info = await handlers["desktop:gh-token-info"]({})
ok(/n’est pas un jeton/.test(msg) && saved.ok && info.ok && !JSON.stringify(info).includes("AAAAAAAAAAAAAAAAAAAA") && !fs.readFileSync(path.join(tmp, "home", "github.json"), "utf8").includes("AAAAAAAAAAAAAAAAAAAA"), "Jeton GitHub : forme vérifiée, chiffré, jamais renvoyé")
r = await handlers["desktop:winget"]({}, { file: exe, url: "https://s.fr/Boutique-Awa-Setup-1.2.0.exe", app: { name: "Boutique Awa", publisher: "Awa SARL", version: "1.2.0", description: "Commandes", scope: "machine" } })
ok(r.ok && r.files.length === 3 && fs.readFileSync(path.join(r.dir, `${r.id}.installer.yaml`), "utf8").includes("Scope: machine"), "desktop:winget : 3 fichiers écrits dans le dossier du logiciel", r)
msg = ""; try { await handlers["desktop:winget"]({}, { file: path.join(tmp, "f.bin"), url: "https://x", app: {} }) } catch (e) { msg = e.message }
ok(/pas été produit/.test(msg), "desktop:winget : fichier hors du dossier d’un logiciel refusé")
msg = ""; try { await handlers["desktop:sandbox"]({}, { file: exe }) } catch (e) { msg = e.message }
ok(process.platform === "win32" ? !msg : /Windows 10 et 11/.test(msg), "desktop:sandbox : réservé à Windows", msg)
msg = ""; try { await handlers["desktop:azure-save"]({}, { appId: "fr.boutique.awa", tenant: "x", client: "y", secret: "s" }) } catch (e) { msg = e.message }
const azs = await handlers["desktop:azure-save"]({}, { appId: "fr.boutique.awa", tenant: "11111111-2222-3333-4444-555555555555", client: "66666666-7777-8888-9999-000000000000", secret: "secret-de-test" })
ok(/forme 00000000/.test(msg) && azs.ok && !fs.readFileSync(path.join(tmp, "home", "certificats", "fr.boutique.awa.azure.json"), "utf8").includes("secret-de-test"), "Identifiants Azure : forme vérifiée, secret chiffré")

// ---------- Logiciel généré, avec un faux module electron (plateforme Windows simulée) ----------
const tpl = fs.mkdtempSync(path.join(os.tmpdir(), "nx-desktop-tpl-"))
fs.copyFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "..", "nexora", "app", "desktop", "template", "app", "main.js"), path.join(tpl, "main.js"))
fs.writeFileSync(path.join(tpl, "config.json"), JSON.stringify({ kind: "url", startUrl: "https://boutique.exemple.fr/", internal: ["boutique.exemple.fr"], behavior: { badge: true, shortcut: "CommandOrControl+Alt+B", jumpList: [{ label: "Nouvelle commande", path: "/commandes/nouvelle" }], fileTypes: [{ ext: "devis", name: "Devis" }] }, insights: { url: "https://abc.supabase.co", anon: "anon", key: "k1" } }))
fs.writeFileSync(path.join(tpl, "main-test.js"), `${fs.readFileSync(path.join(tpl, "main.js"), "utf8")}\nmodule.exports = { taskTarget, findDeepLink, findFileArg, versionCode, track, flushInsights, setBadge, setupWindowsIntegration, insQueue, setWin: (w) => { win = w; } };\n`)
fs.mkdirSync(path.join(tpl, "assets", "badges"), { recursive: true })
for (const n of ["3", "9plus"]) fs.writeFileSync(path.join(tpl, "assets", "badges", `${n}.png`), "x")
fs.writeFileSync(path.join(tpl, "a.devis"), "x"); fs.writeFileSync(path.join(tpl, "b.txt"), "x")
fs.writeFileSync(path.join(tpl, "harness.cjs"), `
Object.defineProperty(process, "platform", { value: "win32" });
const Module = require("module"); const fs = require("fs"); const path = require("path");
const calls = []; const noop = () => {};
const loose = (o) => new Proxy(o, { get: (t, k) => (k in t ? t[k] : noop) });
const app = { userAgentFallback: "Mozilla/5.0 Electron/40.0.0", requestSingleInstanceLock: () => true, whenReady: () => new Promise(noop), on: noop, getPath: () => path.join(__dirname, "data"), isPackaged: true, isReady: () => true, getVersion: () => "1.2.3", getLocale: () => "fr-FR", commandLine: { appendSwitch: noop }, setUserTasks: (t) => calls.push(["tasks", t]) };
const stub = { app: loose(app), BrowserWindow: function () {}, Menu: loose({}), Tray: function () {}, Notification: function () {}, dialog: {}, shell: {}, session: {}, nativeTheme: {}, protocol: loose({}), net: { fetch: async (u, o) => { calls.push(["fetch", u, JSON.parse(o.body)]); return { ok: true }; } }, screen: {}, desktopCapturer: {}, globalShortcut: { register: (a) => { calls.push(["shortcut", a]); return true; }, unregisterAll: noop }, nativeImage: { createFromPath: (p) => ({ isEmpty: () => !fs.existsSync(p), p }) } };
const load = Module._load; Module._load = function (r, ...x) { return r === "electron" ? stub : load.call(this, r, ...x); };
const res = {};
(async () => { try {
  const m = require("./main-test.js");
  const d = (f) => path.join(__dirname, f);
  res.task = m.taskTarget("--nx-open=/commandes/nouvelle"); res.taskBad = [m.taskTarget("--nx-open=/admin"), m.taskTarget("--nx-open=//evil.com/x")];
  res.deep = m.findDeepLink(["exe", "--nx-open=/commandes/nouvelle"]);
  res.file = m.findFileArg(["exe", d("b.txt"), d("a.devis")]) === d("a.devis") && m.findFileArg(["exe", d("absent.devis")]) === null;
  res.vc = [m.versionCode("1.2.3"), m.versionCode("10.0.1-beta.2")];
  m.track("launch"); m.track("crash", "page:crashed", { message: "x" });
  res.queue = m.insQueue.map((e) => [e.kind, e.version, Boolean(e.install), e.signature]);
  await m.flushInsights(); res.fetch = calls.find((c) => c[0] === "fetch");
  const ov = []; m.setWin({ isDestroyed: () => false, setOverlayIcon: (img, txt) => ov.push([img ? path.basename(img.p) : null, txt]) });
  m.setBadge(3); m.setBadge(3); m.setBadge(12); m.setBadge(0); res.badge = ov;
  m.setupWindowsIntegration(); res.calls = calls.filter((c) => c[0] !== "fetch");
} catch (e) { res.error = e.stack; } process.stdout.write(JSON.stringify(res)); process.exit(0); })();
`)
const { execFileSync } = await import("node:child_process")
let T = {}
try { T = JSON.parse(execFileSync(process.execPath, [path.join(tpl, "harness.cjs")], { encoding: "utf8", timeout: 30000 })) } catch (e) { T = { error: String(e.stdout || e.message) } }
ok(!T.error, "Logiciel généré : chargé avec un faux Electron", T.error)
ok(T.task === "https://boutique.exemple.fr/commandes/nouvelle" && T.taskBad && T.taskBad.every((x) => x === null) && T.deep === T.task, "Logiciel généré : actions de l’icône (page déclarée seulement, jamais un autre site)", T)
ok(T.file === true, "Logiciel généré : fichier ouvert reconnu par son extension")
ok(T.vc && T.vc[0] === 1002003 && T.vc[1] === 10000001 && T.queue && T.queue.length === 2 && T.queue[1][3] === "page:crashed" && T.queue.every((q) => q[2]), "Logiciel généré : statistiques préparées (installation, version, plantage)", T.queue)
ok(T.fetch && T.fetch[1] === "https://abc.supabase.co/rest/v1/rpc/app_track" && T.fetch[2].p_key === "k1" && T.fetch[2].p_events.length === 2, "Logiciel généré : envoi groupé à app_track", T.fetch)
ok(JSON.stringify(T.badge) === JSON.stringify([["3.png", "3 non lus"], ["9plus.png", "12 non lus"], [null, ""]]), "Logiciel généré : pastille 3, 9+, puis retirée (sans doublon)", T.badge)
ok(T.calls && T.calls.some((c) => c[0] === "tasks" && c[1][0].arguments === "--nx-open=/commandes/nouvelle" && c[1][0].title === "Nouvelle commande") && T.calls.some((c) => c[0] === "shortcut" && c[1] === "CommandOrControl+Alt+B"), "Logiciel généré : liste de raccourcis et raccourci global enregistrés", T.calls)
fs.rmSync(tpl, { recursive: true, force: true })

fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n${count} vérifications, ${fails ? `${fails} échec(s)` : "aucun échec"}.`)
process.exit(fails ? 1 : 0)
