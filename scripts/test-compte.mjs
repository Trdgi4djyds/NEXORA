// NEXORA #120 : `pnpm test:compte` vérifie dans l'aperçu (Chromium sans fenêtre, Supabase simulé) la fenêtre
// « Mon compte » : mot de passe actuel exigé pour changer le mot de passe ou l'adresse e-mail (vérifié par une vraie
// connexion avant l'envoi), nouveau mot de passe trop faible refusé sans appel au serveur, fuseau horaire au choix,
// et, dans la fenêtre de connexion, inscription refusée avec une adresse invalide ou un mot de passe trop faible.
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import puppeteer from "puppeteer-core"
import { demoResponse, demoSession } from "./admin-demo.mjs"

const CHROMIUM = process.env.CHROME_PATH || "/usr/bin/chromium"
const base = (() => {
  if (process.env.NX_PREVIEW_URL) return process.env.NX_PREVIEW_URL
  const r = spawnSync("figma", ["make", "preview", "get-local-url"], { encoding: "utf8" })
  const m = /(https?:\/\/[^\s]+)/.exec(r.stdout || "")
  return m ? m[1] : "http://localhost:3000"
})()
const version = JSON.parse(fs.readFileSync(new URL("../nexora/app/package.json", import.meta.url), "utf8")).version
const seed = { tourDone: true, setup: { done: true, chosen: [], pending: [] }, nxSeenVersion: version }
const GOOD = "Ancien-Secret-2025"
const demo = demoSession()
const results = []
const check = (name, ok, extra = "") => results.push({ ok: Boolean(ok), line: `${ok ? "OK   " : "ÉCHEC"} ${name}${extra ? ` — ${extra}` : ""}` })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--ignore-certificate-errors", "--window-size=1440,900"] })
const log = { token: [], userPut: [], signup: [], errors: [] }
async function openApp({ signedIn }) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  page.on("pageerror", (e) => log.errors.push(e.message))
  await page.evaluateOnNewDocument((s, sess) => {
    if (window !== window.top) return
    localStorage.setItem("nexora-preview:settings", s)
    if (sess) localStorage.setItem("nexora-auth", sess)
  }, JSON.stringify(seed), signedIn ? JSON.stringify(demo) : "")
  await page.setRequestInterception(true)
  page.on("request", (req) => {
    const u = req.url()
    if (!/\.supabase\.co\//.test(u) || /realtime\/v1/.test(u)) return req.continue()
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }
    if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors })
    const url = new URL(u)
    const json = (status, body) => req.respond({ status, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(body) })
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      const body = JSON.parse(req.postData() || "{}")
      log.token.push(body.password)
      if (body.password === GOOD) return json(200, { ...demo, expires_at: Math.floor(Date.now() / 1000) + 3600 })
      return json(400, { code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" })
    }
    if (url.pathname === "/auth/v1/signup") { log.signup.push(JSON.parse(req.postData() || "{}")); return json(200, { id: "nouveau", email: "x@exemple.fr" }) }
    if (url.pathname === "/auth/v1/user" && req.method() === "PUT") log.userPut.push(JSON.parse(req.postData() || "{}"))
    if (!signedIn && url.pathname.startsWith("/auth/v1/")) return json(200, {})
    const res = demoResponse(req.method(), u, req.headers(), req.postData())
    if (!res) return req.continue()
    req.respond({ status: res.status, headers: { ...cors, ...(res.headers || {}) }, ...(req.method() === "HEAD" || res.status === 204 ? {} : { body: typeof res.body === "string" ? res.body : JSON.stringify(res.body) }) })
  })
  const app = new URL(base)
  app.searchParams.set("app", "")
  await page.goto(app.href, { waitUntil: "load", timeout: 120000 })
  await page.waitForSelector("#modeSeg button[data-mode]", { timeout: 60000 })
  await wait(3000)
  return page
}

try {
  // ------------------------------------------------------------- Mon compte (compte connecté)
  const page = await openApp({ signedIn: true })
  const openTab = (tab) => page.evaluate(async (t) => { const m = await import(new URL("dist/chunks/chunk-EOM7FQDL.js", location.href).href); await m.j(t) }, tab)
  // Dernière notification de NEXORA (#toasts .toast .tt).
  const toast = () => page.evaluate(() => [...document.querySelectorAll("#toasts .toast .tt")].map((t) => t.textContent.trim()).filter(Boolean).slice(-1)[0] || "")
  const fill = (sel, v) => page.evaluate((s, val) => { const el = document.querySelector(s); el.value = val; el.dispatchEvent(new Event("input", { bubbles: true })) }, sel, v)
  const submit = (form) => page.evaluate((f) => document.querySelector(`#nxAccBody form[data-form="${f}"] button:not([type=button])`).click(), form)
  const P = '#nxAccBody form[data-form="password"]'
  await openTab("security")
  await page.waitForSelector(`${P} [name="current_password"]`, { timeout: 15000 })
  check("onglet Sécurité : champ « Mot de passe actuel »", true)
  // Le logiciel s'enregistre sous le nom « Application Windows » : jamais « Application Windows · Application Windows ».
  const devices = await page.evaluate(() => [...document.querySelectorAll("#nxAccBody .nx-li b")].map((b) => b.textContent.trim()))
  check("appareils connectés : libellé sans répétition", devices.length > 0 && devices.every((d) => !/^(.+) · \1$/.test(d)), devices.slice(0, 3).join(" | "))
  await fill(`${P} [name="current_password"]`, GOOD)
  await fill(`${P} [name="password"]`, "password123")
  await fill(`${P} [name="password2"]`, "password123")
  await submit("password"); await wait(700)
  let t = await toast()
  check("nouveau mot de passe trop courant refusé, rien envoyé", log.token.length === 0 && log.userPut.length === 0 && /trop facile/.test(t), t)
  const meter = await page.evaluate(() => document.querySelector("[data-nxc-meter]").dataset.score)
  check("jauge de robustesse mise à jour (« Trop faible »)", meter === "1", `score ${meter}`)
  await fill(`${P} [name="current_password"]`, "mauvais-mot")
  await fill(`${P} [name="password"]`, "Bleu-Ciel-2026")
  await fill(`${P} [name="password2"]`, "Bleu-Ciel-2026")
  await submit("password"); await wait(1500)
  t = await toast()
  check("mot de passe actuel incorrect : refusé, rien changé", log.token.length === 1 && log.userPut.length === 0 && /Mot de passe actuel incorrect/.test(t), t)
  check("champ du mot de passe actuel signalé", (await page.evaluate((s) => document.querySelector(s).getAttribute("aria-invalid"), `${P} [name="current_password"]`)) === "true")
  await fill(`${P} [name="current_password"]`, GOOD)
  await submit("password"); await wait(2500)
  t = await toast()
  check("bon mot de passe actuel : vérifié puis changement envoyé", log.token.length === 2 && log.userPut.some((b) => b.password === "Bleu-Ciel-2026") && /Mot de passe modifié/.test(t), t)
  await openTab("profile")
  const E = '#nxAccBody form[data-form="email"]'
  await page.waitForSelector(`${E} [name="current_password"]`, { timeout: 15000 })
  const before = log.userPut.length
  await fill(`${E} [name="email"]`, "nouvelle.adresse@exemple.fr")
  await page.evaluate((s) => document.querySelector(s).removeAttribute("required"), `${E} [name="current_password"]`)
  await submit("email"); await wait(800)
  t = await toast()
  check("adresse e-mail sans mot de passe : refusée", log.userPut.length === before && /mot de passe actuel/.test(t), t)
  await fill(`${E} [name="current_password"]`, "faux")
  await submit("email"); await wait(1500)
  t = await toast()
  check("adresse e-mail avec un mauvais mot de passe : refusée", log.userPut.length === before && /Mot de passe actuel incorrect/.test(t), t)
  await fill(`${E} [name="email"]`, "adresse@invalide")
  await fill(`${E} [name="current_password"]`, GOOD)
  await submit("email"); await wait(800)
  t = await toast()
  check("adresse e-mail invalide : refusée", log.userPut.length === before && /Adresse e-mail invalide/.test(t), t)
  await fill(`${E} [name="email"]`, "nouvelle.adresse@exemple.fr")
  await submit("email"); await wait(2500)
  t = await toast()
  check("adresse e-mail avec le bon mot de passe : envoyée", log.userPut.some((b) => b.email === "nouvelle.adresse@exemple.fr") && /Confirmez le changement/.test(t), t)
  const tz = await page.evaluate(() => { const s = document.querySelector('#nxAccBody select[name="timezone"]'); return s ? { options: s.options.length, value: s.value, portoNovo: [...s.options].some((o) => o.value === "Africa/Porto-Novo") } : null })
  check("fuseau horaire : liste de tous les fuseaux", tz && tz.options > 300 && tz.portoNovo, JSON.stringify(tz))
  await page.close()

  // ------------------------------------------------------------- inscription (sans compte)
  const p2 = await openApp({ signedIn: false })
  const opened = await p2.evaluate(async () => {
    const m = await import(new URL("dist/chunks/chunk-EOM7FQDL.js", location.href).href)
    const open = Object.values(m).find((f) => typeof f === "function" && /cloud-auth|auth-sheet|nx-auth-sheet/.test(String(f)))
    if (open) { await open("signup"); return true }
    const b = document.querySelector("[data-nxo-login], .rail-account, #railAccount")
    if (b) { b.click(); return true }
    return false
  })
  await wait(1500)
  let signupForm = await p2.$('form[data-auth="signup"]')
  if (!signupForm && opened) {
    await p2.evaluate(() => { const b = document.querySelector('[data-auth-go="signup"]'); if (b) b.click() })
    await wait(800)
    signupForm = await p2.$('form[data-auth="signup"]')
  }
  check("fenêtre d'inscription ouverte", Boolean(signupForm))
  if (signupForm) {
    const S = 'form[data-auth="signup"]'
    const put = (n, v) => p2.evaluate((s, name, val) => { const el = document.querySelector(`${s} [name="${name}"]`); if (el.type === "checkbox") el.checked = val; else el.value = val }, S, n, v)
    const send = async () => { await p2.evaluate((s) => document.querySelector(`${s} .nx-submit`).click(), S); await wait(900); return p2.evaluate((s) => (document.querySelector(`${s} [data-msg]`) || {}).textContent || "", S) }
    await put("name", "Camille Essai"); await put("terms", true)
    await put("email", "camille@exemple"); await put("password", "Bleu-Ciel-2026")
    const m1 = await send()
    check("inscription : adresse invalide refusée", log.signup.length === 0 && /Adresse e-mail invalide/.test(m1), m1)
    await put("email", "camille@exemple.fr"); await put("password", "12345678")
    const m2 = await send()
    check("inscription : mot de passe trop courant refusé", log.signup.length === 0 && /trop facile/.test(m2), m2)
    await put("password", "camilleessai1")
    const m3 = await send()
    check("inscription : mot de passe tiré du nom refusé", log.signup.length === 0 && /nom|adresse/.test(m3), m3)
    await put("password", "Bleu-Ciel-2026")
    await send(); await wait(800)
    check("inscription : adresse et mot de passe valides envoyés", log.signup.length === 1)
  }
  await p2.close()
} finally {
  await browser.close()
}
for (const r of results) console.log(r.line)
console.log(`Exceptions de la page : ${log.errors.length ? log.errors.join(" | ") : "aucune"}`)
const failed = results.filter((r) => !r.ok).length + (log.errors.length ? 1 : 0)
console.log(failed ? `\n${failed} échec(s).` : `\n${results.length} vérifications, aucun échec.`)
process.exit(failed ? 1 : 0)
