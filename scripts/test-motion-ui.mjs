// NEXORA #113 : essai de Motion dans NEX-DESIGN, dans l'aperçu (Chromium sans fenêtre, compte de démonstration en
// offre Pro) : frise, animation toute faite, état affiché à la tête de lecture et état enregistré, modification à la
// tête de lecture (valeur fixe ou image clé), annuler, éditeur de courbe, code, fermeture. `pnpm test:motion --ui`.
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import puppeteer from "puppeteer-core"

process.env.NX_DEMO_OFFRE = process.env.NX_DEMO_OFFRE || "pro"
const { demoResponse, demoSession } = await import("./admin-demo.mjs")
const CHROMIUM = process.env.CHROME_PATH || "/usr/bin/chromium"
const url = process.env.NX_PREVIEW || (spawnSync("figma", ["make", "preview", "get-local-url"], { encoding: "utf8" }).stdout || "").trim() || "http://localhost:3000"

let fails = 0
let count = 0
const ok = (cond, label, detail = "") => { count += 1; if (cond) console.log(`OK   ${label}`); else { fails += 1; console.log(`ÉCHEC ${label}${detail ? ` : ${detail}` : ""}`) } }

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 900 } })
const page = await browser.newPage()
const errors = []
page.on("pageerror", (e) => errors.push(String(e.message || e)))
page.on("console", (m) => { if (m.type() === "error" && !/realtime|websocket|ERR_|Failed to load resource/i.test(m.text())) errors.push(m.text()) })
const demo = demoSession()
// Réglages d'un PC neuf dont la visite guidée et la préparation des outils sont passées (comme pnpm captures).
const version = JSON.parse(fs.readFileSync(new URL("../nexora/app/package.json", import.meta.url), "utf8")).version
const seed = { tourDone: true, setup: { done: true, chosen: [], pending: [] }, nxSeenVersion: version }
await page.evaluateOnNewDocument((s, settings) => {
  if (window !== window.top) return
  if (!localStorage.getItem("nexora-auth")) localStorage.setItem("nexora-auth", s)
  if (!sessionStorage.getItem("nx-test-seeded")) { localStorage.setItem("nexora-preview:settings", settings); sessionStorage.setItem("nx-test-seeded", "1") }
}, JSON.stringify(demo), JSON.stringify(seed))
await page.setRequestInterception(true)
page.on("request", (req) => {
  if (!/\.supabase\.co\//.test(req.url()) || /realtime\/v1/.test(req.url())) return req.continue()
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range" }
  if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors })
  const res = demoResponse(req.method(), req.url(), req.headers(), req.postData())
  if (!res) return req.continue()
  req.respond({ status: res.status, headers: { ...cors, ...(res.headers || {}) }, ...(req.method() === "HEAD" || res.status === 204 ? {} : { body: typeof res.body === "string" || Buffer.isBuffer(res.body) ? res.body : JSON.stringify(res.body) }) })
})
const u = new URL(url); u.searchParams.set("app", "")
await page.goto(u.href, { waitUntil: "load", timeout: 60000 })
await page.waitForSelector('#modeSeg button[data-mode="design"]', { timeout: 60000 })
await new Promise((r) => setTimeout(r, 2500))
await page.click('#modeSeg button[data-mode="design"]')
await page.waitForFunction(async () => { const { state } = await import("./nx/core.js"); return Boolean(state.design && state.design.ready && state.design.nxMotionUi) }, { timeout: 60000, polling: 500 })
const clickText = async (text) => page.evaluate((t) => { const b = [...document.querySelectorAll("button")].find((x) => x.offsetParent && x.textContent.trim().includes(t)); if (b) b.click(); return Boolean(b) }, text)
ok(await clickText("Publication promo"), "modèle « Publication promo » appliqué")
await new Promise((r) => setTimeout(r, 2500))

const R = await page.evaluate(async () => {
  const { state } = await import("./nx/core.js")
  const D = state.design
  const out = {}
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const o = D.canvas.getObjects().find((x) => x.type === "textbox" && /Nouvelle/.test(x.text || ""))
  out.found = Boolean(o)
  D.canvas.setActiveObject(o); D.renderProps(); await wait(300)
  const raw0 = { left: o.left, top: o.top, opacity: o.opacity ?? 1 }
  const stageH0 = D.$.stage.clientHeight
  document.querySelector('[data-nx2="motion"]').click(); await wait(400)
  out.open = Boolean(document.querySelector(".nxm")) && D.nxMotionUi.isOpen()
  out.stageShrinks = D.$.stage.clientHeight < stageH0 - 100
  out.tab = Boolean([...document.querySelectorAll("[data-ptab-go]")].find((b) => b.dataset.ptabGo === "motion" && !b.hidden))
  document.querySelector('.nxm [data-mo="lib"]').click(); await wait(300)
  const tiles = document.querySelectorAll("#popover [data-preset]")
  out.tiles = tiles.length
  document.querySelector('#popover [data-lg="enter"]').click(); await wait(150)
  document.querySelector('#popover [data-preset="burst"]').click(); await wait(500)
  out.clips = (o.nxMotion && o.nxMotion.clips.length) || 0
  out.rows = document.querySelectorAll(".nxm-row.clp").length
  D.nxMotionUi.seek(0); await wait(200)
  out.atZero = { opacity: o.opacity, dy: Math.round(o.getCenterPoint().y - (raw0.top + o.getScaledHeight() / 2)) }
  const saved = o.toObject()
  out.savedIsBase = Math.abs(saved.top - raw0.top) < 0.01 && Math.abs((saved.opacity ?? 1) - raw0.opacity) < 1e-6 && Array.isArray(saved.nxMotion && saved.nxMotion.clips)
  D.nxMotionUi.seek(300); await wait(200)
  out.atEnd = { opacity: Math.round((o.opacity ?? 1) * 1000) / 1000, top: Math.round(o.top - raw0.top) }
  // Modification fixe (aucune piste de position, enregistrement automatique arrêté) : l'état de base se déplace.
  o.set({ left: o.left + 50 }); o.setCoords(); D.changed(); await wait(200)
  out.staticMove = Math.round(o.toObject().left - raw0.left)
  out.noTrack = !(o.nxMotion.tracks && o.nxMotion.tracks.position)
  // ◇ Position : image clé à la tête de lecture, puis une autre à 1 s par un déplacement sur la page.
  D.renderProps(); await wait(200)
  const tabBtn = [...document.querySelectorAll("[data-ptab-go]")].find((b) => b.dataset.ptabGo === "motion"); if (tabBtn) tabBtn.click(); await wait(150)
  const kb = document.querySelector('#dzProps [data-mo="key"][data-p="position"]')
  out.keyButton = Boolean(kb)
  if (kb) kb.click(); await wait(300)
  D.page.nxAnim = { ...(D.page.nxAnim || {}), dur: 2 }
  D.nxMotionUi.seek(1000); await wait(150)
  o.set({ left: o.left + 100 }); o.setCoords(); D.changed(); await wait(250)
  out.keys = ((o.nxMotion.tracks || {}).position || []).map((k) => k.t)
  out.keyedBase = Math.round(o.toObject().left - raw0.left)
  D.nxMotionUi.seek(650); await wait(150)
  out.midX = Math.round(o.getCenterPoint().x)
  // Éditeur de courbe (double-clic sur une image clé de la frise).
  const key = document.querySelector('.nxm-key[data-prop="position"]')
  out.keyInTimeline = Boolean(key)
  if (key) key.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); await wait(250)
  out.easeEditor = Boolean(document.querySelector("#popover .nxm-graph"))
  const sp = document.querySelector('#popover [data-ef="spring"]'); if (sp) sp.click(); await wait(200)
  out.springSet = JSON.stringify(((o.nxMotion.tracks || {}).position || [])[0] && o.nxMotion.tracks.position[0].e)
  document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await wait(200)
  // Code de l'animation.
  document.querySelector('.nxm [data-mo="code"]').click(); await wait(300)
  const code = document.querySelector(".nxm-code code")
  out.css = code ? code.textContent.slice(0, 2000) : ""
  const swBtn = document.querySelector('[data-mc] [data-v="swift"]'); if (swBtn) swBtn.click(); await wait(100)
  out.swift = code ? code.textContent.includes("keyframeAnimator") : false
  const closeBtn = document.querySelector('.sheet [data-sheet="close"], [data-sheet="close"]'); if (closeBtn) closeBtn.click(); await wait(200)
  // Annuler : la page est rechargée, la frise remontre la tête de lecture.
  const before = JSON.stringify(o.nxMotion.tracks.position)
  await D.undo(); await wait(500)
  const o2 = D.canvas.getObjects().find((x) => x.type === "textbox" && /Nouvelle/.test(x.text || ""))
  out.undo = Boolean(o2) && JSON.stringify((o2.nxMotion && o2.nxMotion.tracks && o2.nxMotion.tracks.position) || null) !== before
  // Export : la fenêtre propose la suite d'images PNG.
  const PG = await import("./nx/design/pages.js")
  PG.animExportSheet(D); await wait(300)
  out.pngOption = Boolean(document.querySelector('[data-nx-seg="fmt"] [data-v="png"]')) && Boolean(document.querySelector('[data-nx-seg="fps"]'))
  const c2 = document.querySelector('[data-sheet="close"]'); if (c2) c2.click(); await wait(200)
  // Fermeture : chaque calque retrouve son état de base.
  D.nxMotionUi.seek(0); await wait(100)
  document.querySelector('.nxm [data-mo="close"]').click(); await wait(300)
  const o3 = D.canvas.getObjects().find((x) => x.type === "textbox" && /Nouvelle/.test(x.text || ""))
  out.closed = !document.querySelector(".nxm") && Math.abs((o3.opacity ?? 1) - 1) < 1e-6
  out.hasAnim = PG.hasAnim(D)
  // Prototype : page animée jouée à l'arrivée, action « Contrôler l'animation », Smart Animate entre deux pages.
  const PROTO = await import("./nx/designplus/proto.js")
  const first = D.page
  const title = D.canvas.getObjects().find((x) => x.type === "textbox" && /Nouvelle/.test(x.text || ""))
  await D.pageAction("dup"); await wait(600)
  const second = D.page
  const t2 = D.canvas.getObjects().find((x) => x.type === "textbox" && /Nouvelle/.test(x.text || ""))
  t2.set({ left: t2.left - 200, fill: "#ff2d78" }); t2.setCoords(); D.changed(); await wait(300)
  D.capturePage()
  await D.openPage(D.doc.pages.indexOf(first)); await wait(500)
  const btnObj = D.canvas.getObjects().find((x) => x.type === "textbox" && /Jusqu/.test(x.text || ""))
  btnObj.nxProto = { to: "page", page: second.id, trans: "smart", on: "click" }
  const logo = D.canvas.getObjects().find((x) => x.type === "textbox" && /Logo/.test(x.text || ""))
  if (logo) logo.nxProto = { to: "anim", op: "toggle", on: "key", key: "a" }
  D.changed(); await wait(300)
  const P = await PROTO.build(D, 1)
  out.protoPages = P.length
  out.protoFrames = (P[0].anim && P[0].anim.frames.length) || 0
  out.protoWait = Boolean(P[0].anim && P[0].anim.wait)
  out.smartFrames = (P[0].smart && P[0].smart[second.id] && P[0].smart[second.id].length) || 0
  out.protoKey = P[0].hot.some((h) => h.to === "anim" && h.on === "key" && h.key === "a")
  void title
  // Fonctions reprises de desigma : couleurs de la sélection, lissage des coins, pense-bête, connecteur, notes, code.
  D.canvas.discardActiveObject(); D.renderProps(); await wait(200)
  out.pageColors = Boolean([...document.querySelectorAll("#dzProps .dz-card-h span")].find((x) => x.textContent.trim() === "Couleurs de la page"))
  const purple = D.canvas.getObjects().filter((x) => typeof x.fill === "string" && /^#6a4cff$/i.test(x.fill)).length
  const inp = document.querySelector('#dzProps [data-exc="#6a4cff"]')
  if (inp) { inp.value = "#00a86b"; inp.dispatchEvent(new Event("change", { bubbles: true })) }
  await wait(250)
  out.recolor = { before: purple, after: D.canvas.getObjects().filter((x) => typeof x.fill === "string" && /^#00a86b$/i.test(x.fill)).length, input: Boolean(inp) }
  const { Rect } = await import("./nx/design/fab.js")
  const r = new Rect({ left: 40, top: 40, width: 200, height: 120, rx: 30, ry: 30, fill: "#222222" }); r.id = "t113rect"
  D.canvas.add(r); D.canvas.setActiveObject(r); D.renderProps(); await wait(200)
  const sm = document.querySelector('#dzProps [data-exk="smooth"]')
  if (sm) { sm.value = "60"; sm.dispatchEvent(new Event("input", { bubbles: true })); sm.dispatchEvent(new Event("change", { bubbles: true })) }
  await wait(150)
  out.smooth = r.nxSmooth === 0.6 && r.toObject().nxSmooth === 0.6
  const EX = await import("./nx/designplus/extras.js")
  const st = EX.addSticky(D); await wait(150)
  st.text = "Une très longue idée notée pendant l’atelier, qui ne tiendrait jamais en entier dans un pense-bête carré sans rétrécir le texte"
  D.canvas.fire("text:changed", { target: st }); await wait(100)
  out.sticky = { size: st.fontSize, square: Math.abs(st.height - st.width) < 2, saved: st.toObject().nxKind === "sticky" }
  const c = EX.connect(D, r, st); await wait(100)
  const x0 = c.x2
  st.set({ left: st.left + 300 }); st.setCoords(); D.canvas.fire("object:moving", { target: st }); await wait(100)
  out.connector = { follows: Math.round(c.x2 - x0) !== 0, arrow: c.nxArrows && c.nxArrows.end === "triangle", saved: Boolean(c.toObject().nxConn) }
  D.canvas.discardActiveObject(); D.renderProps(); await wait(150)
  const ta = document.querySelector('#dzProps [data-exk="notes"]')
  if (ta) { ta.value = "Accueillir le public, puis présenter la remise."; ta.dispatchEvent(new Event("change", { bubbles: true })) }
  await wait(100)
  out.notes = D.page.nxNotes === "Accueillir le public, puis présenter la remise."
  const CODE = await import("./nx/designplus/code.js")
  const sw = CODE.toSwiftUI(D, null); const kt = CODE.toCompose(D, null)
  out.native = { swift: sw.includes("struct ") && sw.includes("ZStack(alignment: .topLeading)") && sw.includes("Text("), compose: kt.includes("@Composable") && kt.includes("Text(") && kt.includes("Modifier") }
  r.nxDev = { status: "ready", note: "Bouton principal" }
  out.devComment = CODE.toHtml(D, null).includes("<!-- Prêt pour le développement · Bouton principal -->") && CODE.toSwiftUI(D, null).includes("// Prêt pour le développement · Bouton principal")
  const PGm = await import("./nx/design/pages.js")
  PGm.present(D, D.pageIdx); await wait(500)
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "n", bubbles: true })); await wait(150)
  const nb = document.querySelector(".nx-present-notes")
  out.presentNotes = Boolean(nb && !nb.hidden && nb.textContent.includes("présenter la remise"))
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await wait(300)
  return out
})
ok(R.found, "calque « Nouvelle collection » trouvé")
ok(R.open && R.stageShrinks, "frise ouverte sous le canevas (le canevas se réduit)")
ok(R.tab, "onglet « Animation » du panneau de droite")
ok(R.tiles >= 12, "bibliothèque : vignettes des animations", String(R.tiles))
ok(R.clips === 4 && R.rows >= 4, "« Éclat » : 4 clips dans le calque et dans la frise", `${R.clips} clips, ${R.rows} lignes`)
ok(R.atZero && R.atZero.opacity === 0 && R.atZero.dy > 100, "à 0 s : calque invisible et 116 px plus bas (état affiché)", JSON.stringify(R.atZero))
ok(R.savedIsBase, "enregistrement : état de base et animation, jamais l’état affiché")
ok(R.atEnd && R.atEnd.opacity === 1 && R.atEnd.top === 0, "à 300 ms : calque à sa place", JSON.stringify(R.atEnd))
ok(R.staticMove === 50 && R.noTrack, "déplacement sans piste de position : le calque se déplace (aucune image clé)", `${R.staticMove}`)
ok(R.keyButton, "bouton ◇ de la position dans l’onglet Animation")
ok(JSON.stringify(R.keys) === "[300,1000]" && R.keyedBase === 50, "déplacement à 1 s avec une piste : image clé à 1 s, état de base inchangé", `${JSON.stringify(R.keys)} ${R.keyedBase}`)
ok(R.keyInTimeline && R.easeEditor, "éditeur de courbe ouvert par double-clic sur l’image clé")
ok(/spring|bounce|gentle/.test(R.springSet || ""), "courbe passée en ressort", R.springSet)
ok(R.css.includes("@keyframes") && R.css.includes("translate:") && R.swift, "code : CSS @keyframes et SwiftUI", R.css.slice(0, 120))
ok(R.undo, "annuler : animation revenue à l’état précédent, frise remise à jour")
ok(R.pngOption, "export : suite d’images PNG et images par seconde")
ok(R.closed && R.hasAnim, "frise fermée : calque à son état de base, animation gardée")
ok(R.protoPages === 2 && R.protoFrames === 48, "prototype : page animée en 48 images (2 s à 24 images par seconde)", `${R.protoPages} pages, ${R.protoFrames} images`)
ok(R.protoWait && R.protoKey, "prototype : « Contrôler l’animation » à la touche A, la page attend d’être lancée")
ok(R.smartFrames === 15, "prototype : Smart Animate entre la page et sa copie (15 images)", String(R.smartFrames))
ok(R.pageColors && R.recolor.input && R.recolor.before > 0 && R.recolor.after >= R.recolor.before, "couleurs de la page : une couleur remplacée partout", JSON.stringify(R.recolor))
ok(R.smooth, "lissage des coins : réglé et enregistré")
ok(R.sticky.size < 24 && R.sticky.square && R.sticky.saved, "pense-bête : texte rétréci pour tenir, carré, enregistré", JSON.stringify(R.sticky))
ok(R.connector.follows && R.connector.arrow && R.connector.saved, "connecteur : suit le calque déplacé, flèche, enregistré", JSON.stringify(R.connector))
ok(R.notes && R.presentNotes, "notes de présentation : enregistrées et lues dans la présentation (touche N)")
ok(R.native.swift && R.native.compose, "code SwiftUI et Jetpack Compose de la page", JSON.stringify(R.native))
ok(R.devComment, "statut « Prêt pour le développement » repris en commentaire (HTML, SwiftUI)")
ok(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3).join(" | "))
await browser.close()
console.log(`\n${count} vérifications, ${fails ? `${fails} échec${fails > 1 ? "s" : ""}` : "aucun échec"}.`)
process.exit(fails ? 1 : 0)
