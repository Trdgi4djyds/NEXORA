// NEXORA #129 : éléments de décor de la vidéo de présentation : fenêtres (barre native de Windows 11 en mode sombre,
// comme NEXORA sous Windows : titleBarStyle « default », titre « NEXORA », icône, réduire, agrandir, fermer),
// navigateur, curseur, cadres d'appareils, bureau et fenêtres d'outils de la partie « problème ».
import { LUCIDE } from "/nexora/app/renderer/nx/icons/lucide.js"
import { E, clamp, h, lerp, prog, sfx, tick, track } from "./moteur.js"

export const LOGO = "/site/public/icons/icon-512.png"
export const ECR = "/scripts/video/ecrans"
const APP = "/site/src/assets/appareils"

export const icon = (name, cls = "ic") => `<svg class="${cls}" viewBox="0 0 24 24">${LUCIDE[name] || ""}</svg>`

// Boutons de légende de Windows 11 (glyphes fins de Segoe Fluent Icons, redessinés).
const CAPTION = `<span class="cap"><i><svg viewBox="0 0 10 10"><path d="M0 5.5h10"/></svg></i><i><svg viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9" rx="1.2"/></svg></i><i><svg viewBox="0 0 10 10"><path d="M.5.5l9 9M9.5.5l-9 9"/></svg></i></span>`

/** Fenêtre Windows 11 sombre : barre de titre native de 32 px, contenu (image ou HTML) de w × hgt. */
export function win11({ w, hgt, img = null, html = "", title = "NEXORA", ic = LOGO, light = false, cls = "" }) {
  const el = h("div", `w11${light ? " light" : ""} ${cls}`)
  el.style.width = `${w}px`
  el.style.height = `${hgt + 32}px`
  el.innerHTML = `<div class="w11-bar">${ic.startsWith("<") ? ic : `<img class="w11-ic" src="${ic}">`}<span class="w11-t">${title}</span>${CAPTION}</div><div class="w11-body">${img ? `<img src="${img}">` : html}</div><div class="glare"></div>`
  return el
}

/** Navigateur (Chrome en mode sombre) : onglet, barre d'adresse, page. */
export function browser({ w, hgt, img, url = "monsite.fr", tab = "Kora — Boulangerie au levain, Lyon" }) {
  const el = h("div", "chw")
  el.style.width = `${w}px`
  el.style.height = `${hgt + 84}px`
  el.innerHTML = `<div class="chw-tabs"><div class="chw-tab"><span class="chw-fav">k</span><span class="chw-tt">${tab}</span><svg viewBox="0 0 10 10" class="chw-x"><path d="M2 2l6 6M8 2l-6 6"/></svg></div><span class="chw-plus">+</span>${CAPTION}</div>
  <div class="chw-bar">${icon("back", "chw-i")}${icon("forward", "chw-i dim")}${icon("reload", "chw-i")}<div class="chw-omni">${icon("lock", "chw-lock")}<span class="chw-url">${url}</span><span class="chw-star">${icon("star", "chw-i")}</span></div><span class="chw-av">M</span></div>
  <div class="chw-body"><img src="${img}"></div><div class="glare"></div>`
  return el
}

/** Reflet qui glisse sur le verre d'une fenêtre quand elle bouge (position 0 → 1). */
export function glare(el, fn) {
  const g = el.querySelector(".glare")
  tick((t) => {
    const k = fn(t)
    g.style.backgroundPosition = `${lerp(120, -20, k)}% 0`
  })
}

// ---------------------------------------------------------------- Curseur
const ARROW = `<svg viewBox="0 0 13 20" width="27" height="41"><path d="M1.2 1.2v15.4l3.7-3.6 2.6 6.1 2.6-1.1-2.6-6h5.2z" fill="#fff" stroke="#111" stroke-width="1.05" stroke-linejoin="round"/></svg>`

/**
 * Curseur de Windows qui suit des images clés [t, x, y] en arcs (jamais en ligne droite), clique aux instants
 * donnés (léger enfoncement, onde, bruit de clic) et apparaît / disparaît en fondu.
 */
export function cursor(parent, keys, { clicks = [], show = null, hide = null, arc = 0.18 } = {}) {
  const el = h("div", "cur", ARROW)
  const ring = h("div", "cur-ring")
  parent.append(ring, el)
  for (const c of clicks) sfx("click", c, { gain: 0.9 })
  const t0 = show ?? keys[0][0]
  const t1 = hide ?? keys[keys.length - 1][0] + 0.6
  tick((t) => {
    if (t < t0 - 0.1 || t > t1 + 0.5) {
      el.style.opacity = 0
      ring.style.opacity = 0
      return
    }
    // Segment courant : courbe de Bézier quadratique dont le point de contrôle est décalé sur le côté.
    let x = keys[0][1]
    let y = keys[0][2]
    for (let i = 1; i < keys.length; i += 1) {
      const [ta, xa, ya] = keys[i - 1]
      const [tb, xb, yb, e = E.inOut3] = keys[i]
      if (t <= ta) break
      const k = e(clamp((t - ta) / (tb - ta)))
      const dx = xb - xa
      const dy = yb - ya
      const cx = (xa + xb) / 2 - dy * arc
      const cy = (ya + yb) / 2 + dx * arc
      x = (1 - k) * (1 - k) * xa + 2 * (1 - k) * k * cx + k * k * xb
      y = (1 - k) * (1 - k) * ya + 2 * (1 - k) * k * cy + k * k * yb
    }
    let s = 1
    let ro = 0
    let rs = 0.3
    for (const c of clicks) {
      if (t >= c - 0.06 && t < c + 0.16) s = 0.86
      if (t >= c && t < c + 0.55) {
        const k = (t - c) / 0.55
        ro = 0.55 * (1 - k)
        rs = 0.3 + E.out3(k) * 1.4
      }
    }
    el.style.opacity = prog(t, t0, 0.25, E.out2) * (1 - prog(t, t1, 0.3, E.in2))
    el.style.transform = `translate(${x - 2}px, ${y - 2}px) scale(${s})`
    ring.style.opacity = ro
    ring.style.transform = `translate(${x - 30}px, ${y - 30}px) scale(${rs})`
  })
  return el
}

// ---------------------------------------------------------------- Appareils (cadres de site/src/lib/devices.ts)
// Mesures dans l'image d'origine (avant réduction de moitié des WebP) : cadre, position et taille de la dalle.
export const DEV = {
  iphone: { frame: "iphone-17-pro.webp", w: 1350, h: 2760, x: 72, y: 69, sw: 1206, sh: 2622, layer: "under", r: 150 },
  galaxy: { frame: "galaxy-s21-ultra.webp", w: 1540, h: 3324, x: 44, y: 54, sw: 1440, sh: 3200, layer: "under", r: 60 },
  pixel: { frame: "pixel-10-pro.webp", w: 1410, h: 2968, x: 59, y: 60, sw: 1280, sh: 2856, r: 99, layer: "over" },
  fold: { frame: "pixel-10-pro-fold.webp", w: 2201, h: 2268, x: 62, y: 58, sw: 2076, sh: 2152, r: 133, layer: "over" },
  ipad: { frame: "ipad-pro-12-9.webp", w: 2245, h: 2930, x: 96, y: 102, sw: 2048, sh: 2732, layer: "under", r: 40 },
  tablet: { frame: "pixel-tablet.webp", w: 2798, h: 1837, x: 119, y: 117, sw: 2560, sh: 1600, r: 31, layer: "over" },
  macbook: { frame: "macbook-pro-16.webp", w: 3910, h: 2241, x: 419, y: 98, sw: 3072, sh: 1920, layer: "under", r: 0 },
}

/** Appareil au cadre photoréaliste, de hauteur hgt (px) ; screen : image ou HTML de la dalle. */
export function device(kind, screen, hgt, { pos = "top", html = false } = {}) {
  const d = DEV[kind]
  const k = hgt / d.h
  const el = h("div", "dev")
  el.style.width = `${d.w * k}px`
  el.style.height = `${hgt}px`
  const scr = h("div", `dev-scr ${d.layer}`)
  Object.assign(scr.style, { left: `${d.x * k}px`, top: `${d.y * k}px`, width: `${d.sw * k}px`, height: `${d.sh * k}px`, borderRadius: `${(d.r || 0) * k}px` })
  scr.innerHTML = html ? screen : `<img src="${screen}" style="object-position:${pos}">`
  const fr = h("img", "dev-frame")
  fr.src = `${APP}/${d.frame}`
  if (d.layer === "under") el.append(scr, fr)
  else el.append(fr, scr)
  el.screen = scr
  el.k = k
  return el
}

// ---------------------------------------------------------------- Bureau Windows (fond d'écran sobre, barre des tâches)
export function desktop() {
  const el = h("div", "desk")
  el.innerHTML = `<div class="desk-wall"></div><div class="desk-bloom"></div><div class="taskbar"><div class="tb-apps"></div><div class="tb-tray">${icon("wave", "tb-ti")}${icon("bell", "tb-ti")}<div class="tb-clock"><b>09:12</b><span>17/11/2026</span></div></div></div>`
  const apps = el.querySelector(".tb-apps")
  const clock = el.querySelector(".tb-clock b")
  const api = {
    el,
    /** Icône d'application dans la barre des tâches, qui apparaît à l'instant t (avec l'indicateur d'activité). */
    app(glyph, t, { active = true } = {}) {
      const b = h("div", "tb-app", `${glyph.startsWith("<") ? glyph : icon(glyph)}<i></i>`)
      apps.appendChild(b)
      tick((tt) => {
        const k = prog(tt, t, 0.45, E.spring)
        b.style.width = `${44 * clamp(prog(tt, t, 0.3, E.out3))}px`
        b.style.opacity = clamp(k)
        b.style.transform = `translateY(${(1 - k) * 14}px)`
        b.querySelector("i").style.width = active ? `${lerp(0, 8, prog(tt, t + 0.15, 0.3, E.out3))}px` : "0"
      })
      return b
    },
    /** Horloge de la barre des tâches : fn(t) renvoie des minutes depuis minuit. */
    clock(fn) {
      tick((t) => {
        const m = Math.floor(fn(t))
        clock.textContent = `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
      })
    },
  }
  return api
}

// ---------------------------------------------------------------- Fenêtres d'outils (partie « problème »)
const code = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
const TOOL = {
  design: () => `<div class="tl-design"><div class="tl-side">${"<i></i>".repeat(9)}</div><div class="tl-canvas"><div class="tl-board"><b></b><em></em><span></span><span></span><u></u><u></u><u></u></div><div class="tl-sel"></div></div><div class="tl-props">${"<i></i>".repeat(7)}</div></div>`,
  code: () => `<div class="tl-code"><pre>${["<k>import</k> express <k>from</k> <s>\"express\"</s>", "<k>import</k> { db } <k>from</k> <s>\"./db.js\"</s>", "", "<k>const</k> app = <f>express</f>()", "", "app.<f>get</f>(<s>\"/api/produits\"</s>, <k>async</k> (req, res) => {", "  <k>const</k> liste = <k>await</k> db.<f>all</f>(<s>\"SELECT * FROM pains\"</s>)", "  res.<f>json</f>(liste)", "})", "", "app.<f>listen</f>(<n>3000</n>)"].map((l, i) => `<em>${i + 1}</em>${l}`).join("\n")}</pre></div>`,
  terminal: () => `<div class="tl-term"><pre>${code("PS C:\\projets\\kora> npm install\nnpm WARN deprecated inflight@1.0.6\nnpm WARN deprecated glob@7.2.3\n\nadded 1284 packages in 3m 12s\nPS C:\\projets\\kora> npm run dev\n\n> kora@0.1.0 dev\n> vite\n")}<r>Error: Cannot find module 'vite'</r>\n${code("PS C:\\projets\\kora> ")}<i class="caret"></i></pre></div>`,
  tests: () => `<div class="tl-tests">${[["ok", "Accueil s'affiche"], ["ok", "Menu mobile"], ["ko", "Formulaire de contact"], ["ok", "Panier"], ["ko", "Paiement (délai dépassé)"], ["ok", "Recherche"]].map(([s, n]) => `<p class="${s}"><i>${s === "ok" ? "✓" : "✕"}</i>${n}</p>`).join("")}<div class="tl-bar"><b style="width:64%"></b></div></div>`,
  secu: () => `<div class="tl-secu"><h4>Analyse en cours…</h4><div class="tl-bar"><b class="run"></b></div>${["En-tête Content-Security-Policy absent", "Certificat : expire dans 12 jours", "3 dépendances vulnérables", "Port 22 ouvert"].map((n) => `<p><i>!</i>${n}</p>`).join("")}</div>`,
  deploy: () => `<div class="tl-deploy">${[["Échec", "main · il y a 2 min"], ["En cours", "correctif-menu · maintenant"], ["En ligne", "v1.4 · hier"]].map(([s, n]) => `<p><b class="${s === "Échec" ? "ko" : s === "En cours" ? "run" : "ok"}">${s}</b><span>${n}</span></p>`).join("")}</div>`,
  android: () => `<div class="tl-term"><pre>${code("> Configure project :app\n> Task :app:preBuild UP-TO-DATE\n> Task :app:compileReleaseKotlin\n")}<r>${code("SDK location not found. Define ANDROID_HOME\nFAILURE: Build failed with an exception.")}</r>\n${code("BUILD FAILED in 4m 38s")}</pre></div>`,
  files: () => `<div class="tl-files">${["maquette-v3-finale", "logo-final-2", "site", "app-android", "visuels-reseaux", "factures"].map((n) => `<p>${icon("folder", "tl-fi")}<span>${n}</span></p>`).join("")}</div>`,
  console: () => `<div class="tl-console">${["<p class='lg'>[vite] connecté.</p>", "<p class='lg'>Chargement des produits…</p>", "<p class='er'><i>✕</i>Uncaught TypeError: Cannot read properties of undefined (reading 'map')<br><span>at &lt;anonymous&gt;</span></p>", "<p class='er'><i>✕</i>POST https://monsite.fr/api/contact 500 (Internal Server Error)</p>", "<p class='er'><i>✕</i>Script error.</p>"].join("")}</div>`,
}
export const toolHtml = (kind) => TOOL[kind]()

/** Boîte de dialogue d'installation (style Windows) avec barre de progression pilotée par fn(t) → 0..1. */
export function installer(title, sub, fn) {
  const el = win11({ w: 460, hgt: 170, title, ic: icon("download", "w11-ic svg"), html: `<div class="inst"><b>${title}</b><span>${sub}</span><div class="inst-bar"><i></i></div><em>Veuillez patienter…</em></div>` })
  const bar = el.querySelector(".inst-bar i")
  tick((t) => { bar.style.width = `${clamp(fn(t)) * 100}%` })
  return el
}

/** Repère « /tag » en pilule, titre en deux tons et numéro de l'espace (rappel du site vitrine). */
export function label({ num, tag, title, x = 120, y = 760, w = 900, size = 64 }) {
  const el = h("div", "lab")
  Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px` })
  el.innerHTML = `<div class="lab-row">${num ? `<span class="lab-num">${num}</span>` : ""}<span class="pill">${tag}</span></div><h2 class="title" style="font-size:${size}px"></h2>`
  return el
}

export { track }
