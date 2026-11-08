// NEXORA #070 : compositeur des maquettes animées du site vitrine, chargé dans Chromium par
// scripts/videos-vitrine.mjs. Chaque image d'une boucle de LOOP secondes est dessinée sur un canevas :
//   - écrans à plat : pages du site de démonstration Kora (mobile et bureau) avec défilement, toucher ou clic et
//     transitions de page ; NEXORA agrandi dans Windows 11 (vraies captures, curseur qui choisit les espaces) ;
//     Kora installé comme logiciel dans Windows 11 ;
//   - appareils : ces écrans placés dans un Surface Laptop et un iPhone par le moteur des Maquettes de NEXORA
//     (nxRenderMockup, renderer/dist/chunks/mockup-*.js), image par image.
// Le bureau Windows 11 (fond, barre de titre, barre des tâches) vient de l'aperçu du Desktop Builder
// (renderer/nx/desktop/preview.js, pcHtml), capturé une fois par le script.
export const LOOP = 12
export const FPS = 30

// Pont minimal de l'application (lu au chargement par certains modules de l'interface de NEXORA).
window.vitrine ||= { platform: "win32", invoke: async () => null, on: () => () => {}, send: () => {} }

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const seg = (t, a, b) => clamp((t - a) / (b - a))
const inout = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const out = (x) => 1 - Math.pow(1 - x, 3)
const lerp = (a, b, x) => a + (b - a) * x
const load = (src) =>
  new Promise((ok, ko) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.onerror = () => ko(new Error(`Image introuvable : ${src}`))
    i.src = src
  })
const canvas = (w, h) => {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  return c
}

let CFG = null
const IMG = {}
let MOCK = null

// Début des trois transitions de page de Kora (accueil → fiche produit → commande → accueil), en secondes.
const M_PUSH = [2.75, 5.45, 8.35]
const W_PUSH = [2.85, 5.3, 8.1]
const M_DUR = 0.45
const W_DUR = 0.5
// NEXORA : espaces visités dans l'ordre, changement d'espace au clic à 2 i + 1,75 s, transition de 0,4 s.
const ORDER = ["dev", "preview", "security", "studio", "design", "home"]
const switchAt = (i) => 2 * i + 1.75
// Fond de chaque scène d'appareils, raccord avec la section du site qui l'affiche (#09090b, #0f0f12). Valeurs
// compensées : après JPEG, plage vidéo et sous-échantillonnage, Chromium affiche #09090b en (6, 9, 8) ; #0b0b0e
// ressort en (9, 11, 10) et #101014 en (15, 15, 19), au plus près des fonds du site (mesuré dans Chromium).
const BG = { appareils: "#0b0b0e", windows: "#101014" }

/** Chapitres des boucles, repris par le site (site/src/assets/videos/chapitres.json) : [id, début, fin] en s. */
export function chapters() {
  const wrap = (v) => Math.round(((v + LOOP) % LOOP) * 100) / 100
  const pages = (push, dur) => [
    ["accueil", wrap(push[2] + dur), push[0]],
    ["produit", wrap(push[0] + dur), push[1]],
    ["commande", wrap(push[1] + dur), push[2]],
  ]
  return {
    loop: LOOP,
    nexora: ORDER.map((id, i) => [id, wrap(switchAt(i - 1) + 0.4), switchAt(i)]),
    koraMobile: pages(M_PUSH, M_DUR),
    koraWeb: pages(W_PUSH, W_DUR),
  }
}

// ---------------------------------------------------------------- pointeurs
function arrow(ctx, x, y, s = 1, press = 0) {
  // Flèche de Windows : blanche, contour noir ; légèrement réduite à l'appui.
  const k = s * (1 - press * 0.12)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(k, k)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, 19)
  ctx.lineTo(4.6, 14.6)
  ctx.lineTo(7.6, 21.4)
  ctx.lineTo(10.6, 20.1)
  ctx.lineTo(7.7, 13.4)
  ctx.lineTo(13.8, 13.4)
  ctx.closePath()
  ctx.shadowColor = "rgba(0,0,0,.35)"
  ctx.shadowBlur = 3
  ctx.shadowOffsetY = 1
  ctx.fillStyle = "#fff"
  ctx.fill()
  ctx.shadowColor = "transparent"
  ctx.lineWidth = 1.2
  ctx.strokeStyle = "#111"
  ctx.stroke()
  ctx.restore()
}
function ring(ctx, x, y, q, scale = 1, color = "255,255,255") {
  if (q <= 0 || q >= 1) return
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, (5 + 16 * out(q)) * scale, 0, Math.PI * 2)
  ctx.lineWidth = 2 * scale
  ctx.strokeStyle = `rgba(${color},${0.55 * (1 - q)})`
  ctx.stroke()
  ctx.restore()
}
function ripple(ctx, x, y, q, scale) {
  if (q <= 0 || q >= 1) return
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, (8 + 30 * out(q)) * scale, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(31,26,22,${0.22 * (1 - q)})`
  ctx.fill()
  ctx.restore()
}
// Chemin du pointeur par images clés [t, x, y] (interpolation douce, boucle comprise).
function along(keys, t) {
  for (let i = 0; i < keys.length - 1; i += 1) {
    const [t0, x0, y0] = keys[i]
    const [t1, x1, y1] = keys[i + 1]
    if (t >= t0 && t <= t1) {
      const p = inout(seg(t, t0, t1))
      return [lerp(x0, x1, p), lerp(y0, y1, p)]
    }
  }
  const last = keys[keys.length - 1]
  return [last[1], last[2]]
}

// ---------------------------------------------------------------- pages de Kora
// Page à une position de défilement (px CSS) : contenu, puis en-tête collant redessiné en haut.
function drawPage(ctx, page, scroll, dx, W, H, k) {
  const img = IMG[page.img]
  const sy = Math.round(clamp(scroll, 0, page.h - H / k) * k)
  ctx.drawImage(img, 0, sy, W, H, dx, 0, W, H)
  const hh = Math.round(page.header * k)
  ctx.drawImage(img, 0, 0, W, hh, dx, 0, W, hh)
}
// Transition « pousser » : la nouvelle page arrive de la droite, l'ancienne recule et s'assombrit.
function push(ctx, from, to, p, W, H, k, depth = 0.28, fade = false) {
  const e = out(p)
  ctx.save()
  drawPage(ctx, from.page, from.scroll, -depth * e * W, W, H, k)
  ctx.fillStyle = `rgba(0,0,0,${0.22 * e})`
  ctx.fillRect(0, 0, W, H)
  const x = (1 - e) * W * (fade ? depth : 1)
  if (fade) ctx.globalAlpha = e
  const g = ctx.createLinearGradient(x - 24, 0, x, 0)
  g.addColorStop(0, "rgba(0,0,0,0)")
  g.addColorStop(1, "rgba(0,0,0,.18)")
  ctx.fillStyle = g
  ctx.fillRect(x - 24, 0, 24, H)
  drawPage(ctx, to.page, to.scroll, x, W, H, k)
  ctx.restore()
}

// Kora sur téléphone (402 × 874 points, en double densité).
function koraMobile(t) {
  const m = CFG.mobile
  const k = m.dpr
  const W = Math.round(m.w * k)
  const H = Math.round(m.h * k)
  const c = (koraMobile.c ||= canvas(W, H))
  const ctx = c.getContext("2d")
  const P = m.pages
  const sI = m.scroll.index
  const sP = m.scroll.produit
  const sC = m.scroll.commande
  ctx.fillStyle = "#f7f3ee"
  ctx.fillRect(0, 0, W, H)
  const at = (page, scroll) => ({ page, scroll })
  const [p1, p2, p3] = M_PUSH
  const d = M_DUR
  if (t < p1) drawPage(ctx, P.index, lerp(0, sI, inout(seg(t, 0.5, 2.3))), 0, W, H, k)
  else if (t < p1 + d) push(ctx, at(P.index, sI), at(P.produit, 0), seg(t, p1, p1 + d), W, H, k)
  else if (t < p2) drawPage(ctx, P.produit, lerp(0, sP, inout(seg(t, p1 + 0.85, p2 - 0.45))), 0, W, H, k)
  else if (t < p2 + d) push(ctx, at(P.produit, sP), at(P.commande, 0), seg(t, p2, p2 + d), W, H, k)
  else if (t < p3) drawPage(ctx, P.commande, lerp(0, sC, inout(seg(t, p2 + 0.85, p3 - 0.45))), 0, W, H, k)
  else if (t < p3 + d) push(ctx, at(P.commande, sC), at(P.index, 0), seg(t, p3, p3 + d), W, H, k)
  else drawPage(ctx, P.index, 0, 0, W, H, k)
  // Toucher juste avant chaque transition : carte « Grand levain », « Ajouter à ma commande », « Confirmer ».
  const tap = (tt, pt, scroll) => ripple(ctx, pt[0] * k, (pt[1] - scroll) * k, seg(t, tt, tt + 0.42), k)
  tap(p1 - 0.33, m.tap.index, sI)
  tap(p2 - 0.37, m.tap.produit, sP)
  tap(p3 - 0.37, m.tap.commande, sC)
  return c
}

// Kora dans un navigateur de bureau (1440 × 900), avec le pointeur (agrandi de `cursor` quand l'écran est réduit).
function koraWeb(t, cursor = 1) {
  const d = CFG.web
  const W = d.w
  const H = d.h
  const c = (koraWeb.c ||= canvas(W, H))
  const ctx = c.getContext("2d")
  const P = d.pages
  const sI = d.scroll.index
  const sP = d.scroll.produit
  const sC = d.scroll.commande
  ctx.fillStyle = "#f7f3ee"
  ctx.fillRect(0, 0, W, H)
  const at = (page, scroll) => ({ page, scroll })
  const [p1, p2, p3] = W_PUSH
  const wd = W_DUR
  const sIdx = lerp(0, sI, inout(seg(t, 0.6, 2.3)))
  const sCmd = lerp(0, sC, inout(seg(t, p2 + 0.7, p2 + 1.9)))
  if (t < p1) drawPage(ctx, P.index, sIdx, 0, W, H, 1)
  else if (t < p1 + wd) push(ctx, at(P.index, sI), at(P.produit, sP), seg(t, p1, p1 + wd), W, H, 1, 0.06, true)
  else if (t < p2) drawPage(ctx, P.produit, sP, 0, W, H, 1)
  else if (t < p2 + wd) push(ctx, at(P.produit, sP), at(P.commande, 0), seg(t, p2, p2 + wd), W, H, 1, 0.06, true)
  else if (t < p3) drawPage(ctx, P.commande, sCmd, 0, W, H, 1)
  else if (t < p3 + wd) push(ctx, at(P.commande, sC), at(P.index, 0), seg(t, p3, p3 + wd), W, H, 1, 0.06, true)
  else drawPage(ctx, P.index, 0, 0, W, H, 1)
  const card = [d.tap.index[0], d.tap.index[1] - sI]
  const buy = [d.tap.produit[0], d.tap.produit[1] - sP]
  const ok = [d.tap.commande[0], d.tap.commande[1] - sC]
  const start = [W * 0.66, H * 0.62]
  const [x, y] = along(
    [
      [0, ...start],
      [0.6, ...start],
      [p1 - 0.3, ...card],
      [p1 + wd + 0.05, ...card],
      [p2 - 0.2, ...buy],
      [p2 + wd + 0.2, ...buy],
      [p3 - 0.25, ...ok],
      [p3 + wd + 0.1, ...ok],
      [11.4, ...start],
      [LOOP, ...start],
    ],
    t,
  )
  const clicks = [p1 - 0.25, p2 - 0.15, p3 - 0.2]
  const press = Math.max(0, ...clicks.map((cl) => 1 - Math.abs(t - cl) / 0.12))
  clicks.forEach((cl) => ring(ctx, x, y, seg(t, cl, cl + 0.38), cursor, "31,26,22"))
  arrow(ctx, x, y, cursor, press)
  return c
}

// ---------------------------------------------------------------- NEXORA dans Windows 11
// Point regardé dans chaque espace (coordonnées des captures de 1600 × 1000).
const LOOK = { dev: [820, 420], preview: [1010, 520], security: [700, 380], studio: [930, 520], design: [860, 470], home: [720, 430] }
const RAIL_W = 92
function nexoraWindows(t) {
  const s = CFG.shells.nexora
  const c = (nexoraWindows.c ||= canvas(s.w, s.h))
  const ctx = c.getContext("2d")
  ctx.drawImage(IMG.shellNexora, 0, 0)
  const r = s.content
  ctx.fillStyle = "#0f0f12"
  ctx.fillRect(r.x, r.y, r.w, r.h)
  const k = Math.min(r.w / 1600, r.h / 1000)
  const ox = r.x + (r.w - 1600 * k) / 2
  const oy = r.y + (r.h - 1000 * k) / 2
  const map = ([x, y]) => [ox + x * k, oy + y * k]
  const rail = (id) => CFG.rail[id]
  // Changement d'espace au clic : T_i = 2 i + 1,75 s ; la dernière transition déborde sur la boucle suivante.
  const n = ORDER.length
  let cur = 0
  for (let i = 0; i < n; i += 1) if (t >= switchAt(i)) cur = (i + 1) % n
  const shot = (id, sx, sw) => ctx.drawImage(IMG[`ecran-${id}`], sx, 0, sw, 1000, ox + sx * k, oy, sw * k, 1000 * k)
  let from = null
  let p = 1
  for (let i = 0; i < n; i += 1) {
    const tt = switchAt(i)
    const dt = (t - tt + 12) % 12
    if (dt < 0.4) {
      from = ORDER[i]
      p = dt / 0.4
    }
  }
  const to = from ? ORDER[(ORDER.indexOf(from) + 1) % n] : ORDER[cur]
  if (from) {
    shot(from, 0, 1600)
    ctx.save()
    ctx.globalAlpha = out(p)
    ctx.translate(0, (1 - out(p)) * 14 * k)
    shot(to, RAIL_W, 1600 - RAIL_W)
    ctx.restore()
    shot(to, 0, RAIL_W)
  } else shot(to, 0, 1600)
  // Pointeur : du bouton de l'espace ouvert vers le contenu, puis vers le bouton de l'espace suivant.
  const keys = []
  for (let i = 0; i < n; i += 1) {
    const id = ORDER[i]
    const next = ORDER[(i + 1) % n]
    const [lx, ly] = LOOK[id]
    keys.push([2 * i, ...rail(id)], [2 * i + 0.85, lx, ly], [2 * i + 1.2, lx + 24, ly + 12], [2 * i + 1.75, ...rail(next)])
  }
  keys.push([12, ...rail(ORDER[0])])
  const [cx, cy] = map(along(keys, t < 0.0001 ? 0 : t))
  const press = Math.max(0, ...ORDER.map((_, i) => 1 - Math.abs(((t - switchAt(i) + 18) % 12) - 6) / 0.12))
  ORDER.forEach((_, i) => ring(ctx, cx, cy, ((t - switchAt(i) + 12) % 12) / 0.36, 1.5))
  arrow(ctx, cx, cy, 1.6, press)
  return c
}

// Kora installé comme logiciel : la fenêtre de l'aperçu du Desktop Builder affiche la page de bureau animée.
function windowsKora(t) {
  const s = CFG.shells.kora
  const c = (windowsKora.c ||= canvas(s.w, s.h))
  const ctx = c.getContext("2d")
  ctx.drawImage(IMG.shellKora, 0, 0)
  const r = s.content
  ctx.drawImage(koraWeb(t, 1.8), r.x, r.y, r.w, r.h)
  return c
}

// ---------------------------------------------------------------- appareils (moteur des Maquettes)
function scene(name) {
  const S = (scene.docs ||= {})
  if (S[name]) return S[name]
  const doc = MOCK.nxNewMockup("Site vitrine")
  doc.bg = { ...doc.bg, type: "solid", color: BG[name] }
  doc.overlay = "none"
  doc.anim = { preset: "none", dur: LOOP }
  const base = doc.slots[0]
  const slot = (o) => ({ ...base, id: `${name}-${o.media}`, style: "default", radius: "curved", gloss: 0, zoom: 1, shadow: { mode: "spread", opacity: 55 }, ...o })
  if (name === "appareils") {
    doc.w = 1600
    doc.h = 900
    doc.slots = [slot({ device: "surface-laptop-15", color: "#d6d7d9", x: 0.43, y: 0.53, size: 0.86, z: 0, media: "A" }), slot({ device: "iphone-18-pro", color: "#e1e2e4", x: 0.8, y: 0.6, size: 0.7, z: 1, media: "B" })]
  } else if (name === "windows") {
    doc.w = 1200
    doc.h = 900
    doc.slots = [slot({ device: "surface-laptop-15", color: "#d6d7d9", x: 0.5, y: 0.53, size: 0.92, z: 0, media: "D" })]
  }
  S[name] = doc
  return doc
}
function devices(name, t, f) {
  const doc = scene(name)
  const a = (t / LOOP) * Math.PI * 2
  const media = new Map()
  for (const s of doc.slots) {
    if (s.media.startsWith("A")) {
      Object.assign(s, { rx: 9 + Math.cos(a) * 1.5, ry: -17 + Math.sin(a) * 4.5, rz: 0, y: 0.53 + Math.sin(a) * 0.006 })
      s.media = `A${f}`
      media.set(s.media, nexoraWindows(t))
    } else if (s.media.startsWith("B")) {
      Object.assign(s, { rx: 5 + Math.cos(a + 0.8) * 2, ry: -21 + Math.sin(a + 0.8) * 5, rz: 3 + Math.sin(a + 1.6) * 1.2, y: 0.6 + Math.sin(a + 1.2) * 0.012 })
      s.media = `B${f}`
      media.set(s.media, koraMobile(t))
    } else if (s.media.startsWith("D")) {
      Object.assign(s, { rx: 8 + Math.cos(a) * 1.5, ry: -14 + Math.sin(a) * 5, rz: 0, y: 0.53 + Math.sin(a) * 0.006 })
      s.media = `D${f}`
      media.set(s.media, windowsKora(t))
    }
  }
  const c = (devices[name] ||= canvas(doc.w, doc.h))
  MOCK.nxRenderMockup(c.getContext("2d"), doc, doc.w, doc.h, { media, t: 0, quality: 1 })
  return c
}

// ---------------------------------------------------------------- sorties
const OUT = {
  "kora-mobile": { w: 540, h: 1174, draw: (t) => koraMobile(t) },
  "kora-web": { w: 1152, h: 720, draw: (t) => koraWeb(t) },
  appareils: { w: 1600, h: 900, draw: (t, f) => devices("appareils", t, f) },
  windows: { w: 1200, h: 900, draw: (t, f) => devices("windows", t, f) },
}
const final = {}
export function frame(name, f, quality = 0.92) {
  const o = OUT[name]
  const t = (f / FPS) % LOOP
  const src = o.draw(t, f)
  const c = (final[name] ||= canvas(o.w, o.h))
  const ctx = c.getContext("2d")
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(src, 0, 0, o.w, o.h)
  return c.toDataURL("image/jpeg", quality)
}

export async function init(cfg) {
  CFG = cfg
  MOCK = await import("/dist/chunks/" + cfg.mockup)
  const jobs = Object.entries(cfg.images).map(async ([k, src]) => (IMG[k] = await load(src)))
  await Promise.all(jobs)
  await document.fonts.ready
  return Object.keys(IMG).length
}

// Écran Windows 11 de l'aperçu du Desktop Builder, à la taille de l'écran du Surface Laptop 15.
export async function shell(kind, w, h, icon) {
  const P = await import("/nx/desktop/preview.js")
  P.SCREEN.w = w
  P.SCREEN.h = h
  const app = {
    name: kind === "nexora" ? "NEXORA" : "Kora",
    source: { kind: "url", url: "", dir: "" },
    window: kind === "nexora" ? { width: 1600, height: 1000, minWidth: 640, minHeight: 480, start: "maximized", resizable: true, menu: "auto", background: "#0f0f12", accent: "#7c6cff", title: "fixed" } : { width: 1280, height: 832, minWidth: 640, minHeight: 480, start: "normal", resizable: true, menu: "auto", background: "#f7f3ee", accent: "#b4572a", title: "fixed" },
    behavior: { badge: false, tray: false },
    install: { desktop: kind !== "nexora", startMenu: true, mode: "assisted", scope: "user" },
  }
  const host = document.getElementById("shell")
  host.innerHTML = P.pcHtml(app, "window", { dark: true, webview: false }).html
  const os = host.querySelector(".pc-os")
  host.replaceChildren(os)
  os.style.transform = "none"
  os.id = "os"
  for (const img of os.querySelectorAll("[data-prev-icon]")) img.src = icon
  await Promise.all([...os.querySelectorAll("img")].map((i) => (i.complete ? null : new Promise((ok) => (i.onload = i.onerror = ok)))))
  await document.fonts.ready
  const box = os.getBoundingClientRect()
  const r = os.querySelector(".pc-content").getBoundingClientRect()
  return { w, h, content: { x: Math.round(r.left - box.left), y: Math.round(r.top - box.top), w: Math.round(r.width), h: Math.round(r.height) } }
}

// Icône d'application de Kora (initiale sur tuile arrondie terre cuite), pour la barre des tâches et le bureau.
export function koraIcon() {
  const c = canvas(128, 128)
  const ctx = c.getContext("2d")
  ctx.fillStyle = "#b4572a"
  ctx.beginPath()
  ctx.roundRect(4, 4, 120, 120, 28)
  ctx.fill()
  ctx.fillStyle = "#fff8f0"
  ctx.font = '700 78px "Playfair Display"'
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("k", 64, 60)
  return c.toDataURL("image/png")
}

window.NX = { init, frame, shell, koraIcon, chapters, LOOP, FPS }
