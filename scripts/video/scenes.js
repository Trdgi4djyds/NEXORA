// NEXORA #129 : scénario de la vidéo de présentation (deuxième version), calé sur la voix off (narration.json).
// Acte 1, le problème (0 → 29,5 s) : un site réussi sur l'écran mais qui déborde du téléphone, des outils empilés,
// des heures d'installation, un projet éparpillé, une erreur introuvable, des applications longues et chères.
// Acte 2, le basculement (29,5 → 34,8 s) : « Et si tout tenait dans un seul logiciel ? », impact, logo.
// Acte 3, la solution (34,8 → 74,4 s) : coupes sur la pulsation de la musique (100 battements par minute à partir
// de l'impact) : NEXORA en 3D, puis chaque espace avec ses vraies captures, un curseur et des gestes réels.
// Acte 4 (74,4 → 95,2 s) : concevoir, coder, tester, sécuriser, publier ; un même projet ; appel final.
import { E, clamp, cues, drift, fade, h, lerp, prog, revealWords, rng, scene, seek, sfx, tick, track, words } from "./moteur.js"
import { ECR, LOGO, browser, cursor, desktop, device, glare, icon, installer, label, toolHtml, win11 } from "./decor.js"
import { appareil, plateau } from "./trois.js"

const N = await (await fetch("/scripts/video/narration.json")).json()
const R = Object.fromEntries(N.repliques.map((r) => [r.id, r]))
const at = (id, mot) => R[id].debut + (mot ? R[id].mots[mot] : 0)

const DURATION = 95.2
const T0 = 32.4 // impact : premier temps de la musique de la solution
const BEAT = 0.6 // 100 battements par minute
const cut = (b) => Math.round((T0 + b * BEAT) * 1000) / 1000
const C = { hero: cut(4), design: cut(10), dev: cut(19), resp: cut(25), browser: cut(33), secu: cut(42), build: cut(52), studio: cut(62), recap: cut(70), end: 83.7 }
const ready = []

const $stage = document.getElementById("stage")
const $bg = document.getElementById("bg")
const $fx = document.getElementById("fx")
const px = (v) => `${v}px`
const at2 = (el, x, y) => { el.style.left = px(x); el.style.top = px(y); return el }
const pan = (x) => clamp((x / 1920) * 2 - 1, -1, 1) * 0.7

/**
 * Place un élément (origine en haut à gauche) : le point (fx, fy) de l'élément arrive en (cx, cy) de l'image, à
 * l'échelle s, avec une rotation 3D autour de ce point (le parent porte la perspective).
 */
function place(el, { s = 1, rx = 0, ry = 0, rz = 0, fx, fy, cx = 960, cy = 540, x = 0, y = 0 }) {
  el.style.transform = `translate(${cx - fx * s + x}px, ${cy - fy * s + y}px) scale(${s}) translate(${fx}px, ${fy}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) translate(${-fx}px, ${-fy}px)`
}
const persp = (parent, p = 2600) => { const l = h("div", "layer", null, { perspective: px(p) }); parent.appendChild(l); return l }
const blurOf = (el, b) => { el.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : "none" }
const opa = (el, o) => { el.style.opacity = clamp(o) }

// ---------------------------------------------------------------- Décor permanent
{
  const grid = h("div", "grid")
  const beams = [260, 820, 1420].map((x) => h("div", "beam", null, { left: px(x) }))
  const vig = h("div", "vignette")
  $bg.append(grid, ...beams)
  // Grain de film : tuile de bruit reproductible, déplacée à chaque image (texture commune à toute la vidéo).
  const c = document.createElement("canvas")
  c.width = c.height = 256
  const x = c.getContext("2d")
  const img = x.createImageData(256, 256)
  const rnd = rng(129)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rnd() - 0.5) * 255
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  x.putImageData(img, 0, 0)
  const grain = h("div", "grain", null, { backgroundImage: `url(${c.toDataURL()})` })
  const black = h("div", "layer", null, { background: "#000", opacity: 0 })
  $fx.append(vig, grain, black)
  const g = rng(7)
  const offs = Array.from({ length: 64 }, () => [Math.floor(g() * 128), Math.floor(g() * 128)])
  tick((t) => {
    const f = Math.floor(t * 30) % offs.length
    grain.style.transform = `translate(${-offs[f][0]}px, ${-offs[f][1]}px)`
    // Grille et colonnes de lumière : discrètes pendant le problème, présentes pendant la solution.
    const sol = prog(t, 32.2, 1.5, E.inOut3) * (1 - prog(t, 93.0, 1.5))
    grid.style.opacity = 0.18 + 0.5 * sol
    grid.style.transform = `translate(${(t * 6) % 120}px, ${(t * 3) % 120}px)`
    beams.forEach((b, i) => {
      b.style.opacity = (0.15 + 0.55 * sol) * (0.75 + 0.25 * Math.sin(t * 0.7 + i * 2))
      b.style.transform = `translateX(${Math.sin(t * 0.18 + i) * 80}px) skewX(-12deg)`
    })
    black.style.opacity = prog(t, 0, 0.9, E.out2) < 1 ? 1 - prog(t, 0, 0.9, E.out2) : prog(t, 93.7, 1.45, E.inOut2)
  })
}

// ================================================================ ACTE 1 : LE PROBLÈME
// ---------------------------------------------------------------- 1. « Votre site est réussi… sur votre écran. »
{
  const s = scene(0, 4.98)
  s.appendChild(h("div", "spot", null, { left: px(360), top: px(-260), width: px(1200), height: px(1200) }))
  const lay = persp(s)
  const W = 1440
  const H = 984
  const win = browser({ w: W, hgt: 900, img: `${ECR}/kora-bureau.webp` })
  win.style.transformOrigin = "0 0"
  lay.appendChild(win)
  tick((t) => {
    if (t > 5) return
    const sc = track(t, [[0, 0.64], [1.5, 0.735, E.out5], [4.5, 0.8, E.inOutSine]])
    const morph = prog(t, 4.42, 0.5, E.in3)
    place(win, { fx: W / 2, fy: H / 2, s: sc * lerp(1, 0.3, morph), rx: track(t, [[0, 10], [1.5, 4, E.out5], [4.5, 1.5, E.inOutSine]]), ry: track(t, [[0, -18], [1.5, -7, E.out5], [4.5, -2, E.inOutSine]]), cx: 960 + drift(t, 0.1) * 5 - morph * 150, cy: 548 })
    opa(win, prog(t, 0.05, 1.1, E.out3) * (1 - prog(t, 4.62, 0.3, E.in2)))
    blurOf(win, morph * 9)
  })
  glare(win, (t) => prog(t, 0.2, 4.4, E.inOutSine))
  const p = at2(h("div", "abs", `<span class="pill">Sur votre écran</span>`), 120, 92)
  s.appendChild(p)
  fade(p, at("v01b") + 0.05, 4.35)
  const ok = at2(h("div", "abs", `<span class="pill" style="gap:12px">${icon("check")} Tout s’affiche parfaitement</span>`), 1310, 92)
  s.appendChild(ok)
  fade(ok, at("v01b") + 0.4, 4.35, { y: 0, x: 24 })
  sfx("tick", at("v01b") + 0.4, { gain: 0.5, pan: 0.5 })
  cursor(s, [[1.5, 1720, 1010], [2.7, 1230, 700, E.inOut3], [4.1, 1120, 655, E.inOutSine]], { hide: 4.3 })
  sfx("air", 0.15, { dur: 2.6, gain: 0.55 })
  sfx("whoosh", 4.42, { dur: 0.75, gain: 0.75, pan: -0.3 })
}

// ---------------------------------------------------------------- 2. « Mais sur le téléphone de vos visiteurs, tout déborde. »
{
  const s = scene(4.45, 8.5)
  s.appendChild(h("div", "spot", null, { left: px(140), top: px(-200), width: px(1100), height: px(1100) }))
  const lay = persp(s, 2200)
  const rig = h("div", "abs", null, { left: 0, top: 0, width: px(1000), height: px(900), transformOrigin: "0 0" })
  lay.appendChild(rig)
  const PH = 860
  const k = PH / 2760
  const sx = 72 * k
  const sy = 69 * k
  const sw = 1206 * k
  const sh = 2622 * k
  const PAGE = 720 // la page de bureau (1440 px) à moitié : plus large que l'écran du téléphone
  const page = `<div class="kp" style="position:absolute;left:0;top:0;width:${PAGE}px"><img src="${ECR}/kora-page.webp" style="width:100%;display:block"></div>`
  const phone = device("iphone", page, PH, { html: true })
  at2(phone, 0, 0)
  // Partie de la page hors de l'écran : en transparence, bordée de pointillés rouges.
  const ghost = h("div", "abs", `<div class="kg" style="position:absolute;top:0;width:${PAGE}px"><img src="${ECR}/kora-page.webp" style="width:100%;display:block"></div>`, { left: px(sx + sw), top: px(sy), height: px(sh), overflow: "hidden", borderTop: "2px dashed rgba(255,106,95,.85)", borderRight: "2px dashed rgba(255,106,95,.85)", borderBottom: "2px dashed rgba(255,106,95,.85)", background: "rgba(255,106,95,.05)" })
  const edge = h("div", "abs", null, { left: px(sx + sw - 1), top: px(sy - 18), width: "2px", height: px(sh + 36), background: "rgba(255,106,95,.95)", boxShadow: "0 0 14px rgba(255,106,95,.8)" })
  const bar = h("div", "abs", null, { left: px(sx + 10), top: px(sy + sh - 14), height: "6px", borderRadius: "3px", background: "rgba(0,0,0,.45)" })
  phone.screen.appendChild(bar)
  rig.append(ghost, phone, edge)
  const kp = phone.querySelector(".kp")
  const kg = ghost.querySelector(".kg")
  const d0 = at("v02", "deborde")
  tick((t) => {
    if (t < 4.4 || t > 8.6) return
    const intro = prog(t, 4.45, 0.75, E.out5)
    place(rig, { fx: 210, fy: 430, s: lerp(0.72, 1, intro), ry: track(t, [[4.45, 24], [5.3, 8, E.out5], [8.4, -6, E.inOutSine]]), rx: 4, cx: 760 + drift(t, 0.08) * 4 - prog(t, 8.05, 0.4, E.in3) * 1400, cy: 545 })
    opa(rig, prog(t, 4.45, 0.35, E.out2))
    blurOf(rig, (1 - intro) * 10 + prog(t, 8.05, 0.4, E.in3) * 14)
    // Le visiteur essaie de faire défiler la page de côté : elle part, puis revient.
    const scroll = track(t, [[5.3, 0], [5.95, -120, E.inOut3], [6.45, -30, E.inOut3], [d0, -150, E.out5], [8.4, -150]])
    const jit = t > d0 && t < d0 + 0.35 ? Math.sin((t - d0) * 90) * 10 * (1 - (t - d0) / 0.35) : 0
    kp.style.transform = `translateX(${scroll + jit}px)`
    kg.style.transform = `translateX(${scroll + jit - sw}px)`
    const gw = Math.max(0, PAGE - sw + scroll)
    ghost.style.width = px(gw)
    opa(ghost, 0.55 * prog(t, d0 - 0.05, 0.35, E.out3))
    opa(edge, prog(t, d0 - 0.05, 0.25, E.out3))
    const vis = sw / PAGE
    bar.style.width = px((sw - 20) * vis)
    bar.style.transform = `translateX(${(-scroll / PAGE) * (sw - 20)}px)`
    opa(bar, prog(t, 5.3, 0.3))
  })
  const p = at2(h("div", "abs", `<span class="pill">Sur le téléphone de vos visiteurs</span>`), 120, 92)
  s.appendChild(p)
  fade(p, 4.95, 7.95)
  ;[["Le texte déborde de l’écran", 0], ["Menu coupé", 0.26], ["Défilement de côté", 0.52]].forEach(([txt, dt], i) => {
    const w = at2(h("div", "abs", `<span class="pill warn">${icon("warn")} ${txt}</span>`), 1340, 360 + i * 86)
    s.appendChild(w)
    fade(w, d0 + dt, 7.95, { y: 0, x: 30, ease: E.spring })
    sfx("error", d0 + dt, { gain: 0.42 - i * 0.06, pan: 0.6, soft: true })
  })
  sfx("glitch", d0, { gain: 0.5 })
  sfx("whoosh", 8.0, { dur: 0.6, gain: 0.6, pan: -0.6 })
}

// ---------------------------------------------------------------- 3 et 4. Outils empilés, heures d'installation, projet éparpillé
{
  const s = scene(8.05, 19.1)
  const world = h("div", "layer", null, { transformOrigin: "960px 520px" })
  s.appendChild(world)
  const D = desktop()
  world.appendChild(D.el)
  const wins = h("div", "layer")
  world.appendChild(wins)
  const v3 = (m) => at("v03", m)
  const LIST = [
    ["files", "Explorateur de fichiers — kora", "folder", 150, 112, 520, 290, 8.75, true],
    ["design", "Design — maquette-v3", "pen", 300, 196, 660, 410, v3("design"), false],
    ["code", "app.js — Éditeur de code", "code", 890, 92, 640, 396, v3("code"), false],
    ["terminal", "Windows PowerShell", "terminal", 1190, 470, 600, 320, v3("code") + 0.24, false],
    ["tests", "Tests — 4 réussis, 2 échecs", "pass", 610, 548, 470, 296, v3("tests"), true],
    ["secu", "Analyse de sécurité", "shield", 1300, 168, 490, 300, v3("securite"), false],
    ["deploy", "Publication — tableau de bord", "rocket", 96, 600, 520, 252, v3("publication"), true],
    ["android", "Android — compilation (Gradle)", "android", 820, 330, 600, 286, v3("publication") + 0.36, false],
  ]
  D.app("search", 8.2, { active: false })
  D.app("globe", 8.3)
  const els = LIST.map(([kind, title, glyph, x, y, w, hh, t, light]) => {
    const el = win11({ w, hgt: hh, title, ic: icon(glyph, "w11-ic svg"), html: toolHtml(kind), light })
    at2(el, x, y)
    wins.appendChild(el)
    el.t = t
    el.c = [x + w / 2, y + hh / 2]
    D.app(glyph, t + 0.05)
    sfx("pop", t, { gain: 0.6, pan: pan(x + w / 2) })
    return el
  })
  // Boîtes d'installation (« Des heures à tout installer »).
  const v4 = at("v04")
  const inst = [
    installer("Installation de Node.js", "Téléchargement des composants…", (t) => track(t, [[v4 + 0.2, 0.05], [17.1, 0.92, E.out2]])),
    installer("Installation de Python", "Ajout au PATH…", (t) => track(t, [[v4 + 0.5, 0], [15.7, 0.63, E.out3], [18, 0.63]])),
    installer("Configuration de Git", "Choix de l’éditeur par défaut…", (t) => track(t, [[v4 + 0.85, 0], [17.5, 0.34, E.out2]])),
  ]
  inst.forEach((el, i) => {
    at2(el, 640 + i * 70, 330 + i * 64)
    el.t = v4 + 0.15 + i * 0.35
    el.c = [870 + i * 70, 430 + i * 64]
    wins.appendChild(el)
    sfx("pop", el.t, { gain: 0.5, pan: 0.1 * i })
  })
  const all = [...els, ...inst]
  D.clock((t) => track(t, [[v4 + 0.1, 552], [17.2, 947, E.inOut3]]))
  sfx("clock", v4 + 0.2, { dur: 2.7, gain: 0.45 })
  // « à tout relier » : liens en pointillés entre les fenêtres.
  const rel = at("v04", "relier")
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("width", "1920")
  svg.setAttribute("height", "1080")
  Object.assign(svg.style, { position: "absolute", left: 0, top: 0, overflow: "visible" })
  const pairs = [[0, 1], [1, 2], [2, 3], [3, 7], [4, 5], [6, 1], [5, 7]]
  const paths = pairs.map(([a, b]) => {
    const [x1, y1] = all[a].c
    const [x2, y2] = all[b].c
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path")
    const mx = (x1 + x2) / 2 + (y2 - y1) * 0.25
    const my = (y1 + y2) / 2 - (x2 - x1) * 0.25
    p.setAttribute("d", `M${x1},${y1} Q${mx},${my} ${x2},${y2}`)
    Object.assign(p.style, { fill: "none", stroke: "rgba(255,255,255,.55)", strokeWidth: "2", strokeDasharray: "7 9" })
    svg.appendChild(p)
    const dots = [x1, y1, x2, y2]
    return { p, len: Math.hypot(x2 - x1, y2 - y1) * 1.15, dots }
  })
  wins.appendChild(svg)
  sfx("swish", rel, { gain: 0.5 })
  const ep = at("v04", "eparpille")
  tick((t) => {
    if (t < 8 || t > 19.2) return
    const zoom = track(t, [[8.05, 1.08], [9.0, 1.0, E.out5], [14.4, 0.95, E.inOutSine], [17.2, 0.93, E.inOutSine], [19, 0.9, E.out3]])
    // Petite secousse à chaque fenêtre qui s'ouvre (action secondaire), amortie.
    let shake = 0
    for (const el of all) if (t >= el.t && t < el.t + 0.4) shake += Math.sin((t - el.t) * 60) * 3 * (1 - (t - el.t) / 0.4)
    world.style.transform = `translate(${drift(t, 0.07) * 8 + shake}px, ${drift(t, 0.06, 2) * 5}px) scale(${zoom})`
    const outro = prog(t, 18.55, 0.5, E.in2)
    opa(world, prog(t, 8.05, 0.35, E.out2) * (1 - outro))
    const sc = prog(t, ep, 1.1, E.out5)
    world.style.filter = sc > 0.01 ? `brightness(${1 - sc * 0.35})` : "none"
    for (const el of all) {
      const k = prog(t, el.t, 0.5, E.spring)
      const vx = el.c[0] - 960
      const vy = el.c[1] - 520
      const r = ((el.c[0] * 7 + el.c[1] * 3) % 9) - 4
      el.style.opacity = clamp(prog(t, el.t, 0.18, E.out2)) * (1 - sc * 0.55)
      el.style.transform = `translate(${vx * sc * 0.6}px, ${(1 - k) * 18 + vy * sc * 0.6}px) scale(${lerp(0.92, 1, k) * (1 - sc * 0.12)}) rotate(${r * sc * 0.9}deg)`
      blurOf(el, sc * 5)
    }
    for (const { p, len } of paths) {
      const k = prog(t, rel, 0.8, E.inOut3)
      p.style.strokeDashoffset = px((1 - k) * len)
      p.style.strokeDasharray = `${k * len} ${len}`
      p.style.opacity = k * (1 - sc)
    }
  })
  sfx("whoosh", ep - 0.1, { dur: 1.0, gain: 0.85, wide: true })
  const scrim = h("div", "scrim-t")
  s.appendChild(scrim)
  const p = at2(h("div", "abs", `<span class="pill">Un outil pour chaque étape</span>`), 120, 72)
  s.appendChild(p)
  fade(p, 8.7, v4 - 0.25)
  const p2 = at2(h("div", "abs", `<span class="pill">Des heures d’installation</span>`), 120, 72)
  s.appendChild(p2)
  fade(p2, v4 + 0.1, ep - 0.2)
  const t3 = h("h2", "title abs", null, { left: 0, right: 0, top: px(430), textAlign: "center", fontSize: px(104), textShadow: "0 10px 50px rgba(0,0,0,.9)" })
  s.appendChild(t3)
  revealWords(words(t3, "Un projet|éparpillé."), ep + 0.12, { step: 0.07, out: 18.45 })
  opa(scrim, 1)
}

// ---------------------------------------------------------------- 5. « Une erreur apparaît ? Impossible de savoir d'où elle vient. »
{
  const s = scene(18.6, 22.8)
  s.appendChild(h("div", "spot", null, { left: px(760), top: px(-160), width: px(1200), height: px(1200) }))
  const lay = persp(s)
  const W = 980
  const con = win11({ w: W, hgt: 400, title: "Outils de développement — monsite.fr", ic: icon("terminal", "w11-ic svg"), html: toolHtml("console") })
  con.style.transformOrigin = "0 0"
  lay.appendChild(con)
  const rows = [...con.querySelectorAll(".tl-console p")]
  const v5 = at("v05")
  const times = [v5 + 0.05, v5 + 0.22, v5 + 0.55, v5 + 1.05, v5 + 1.55]
  rows.forEach((r, i) => {
    tick((t) => {
      const k = prog(t, times[i], 0.25, E.out3)
      r.style.opacity = k
      r.style.transform = `translateY(${(1 - k) * 8}px)`
    })
    if (i >= 2) sfx("error", times[i], { gain: i === 2 ? 0.7 : 0.55, pan: 0.3 })
  })
  tick((t) => {
    if (t < 18.5 || t > 22.9) return
    let shake = 0
    for (const tt of times.slice(2)) if (t >= tt && t < tt + 0.25) shake += Math.sin((t - tt) * 80) * 6 * (1 - (t - tt) / 0.25)
    const k = prog(t, 18.75, 0.6, E.out5)
    const out = prog(t, 22.35, 0.4, E.in3)
    place(con, { fx: W / 2, fy: 216, s: lerp(0.9, 1, k), ry: track(t, [[18.7, -14], [19.4, -6, E.out5], [22.4, -3]]), rx: 3, cx: 1250 + shake, cy: 560 + (1 - k) * 60 + out * 120 })
    opa(con, k * (1 - out))
    blurOf(con, out * 8)
  })
  const t5 = h("h2", "title abs", null, { left: px(120), top: px(372), width: px(640), fontSize: px(92) })
  s.appendChild(t5)
  revealWords(words(t5, "D’où vient|l’erreur ?"), at("v05", "impossible"), { step: 0.07, out: 22.3 })
  const p = at2(h("div", "abs", `<span class="pill">Une erreur, aucune piste</span>`), 120, 92)
  s.appendChild(p)
  fade(p, v5 + 0.5, 22.3)
  cursor(s, [[19.7, 1700, 960], [20.4, 1180, 560], [20.95, 1500, 620, E.inOut3], [21.5, 1240, 700, E.inOut3], [22.15, 1420, 540, E.inOut3]], { hide: 22.3, arc: 0.25 })
  sfx("whoosh", 22.38, { dur: 0.55, gain: 0.5, pan: 0.2 })
}

// ---------------------------------------------------------------- 6. « Et pour une application Android, ou un logiciel Windows ? Des mois, et un vrai budget. »
{
  const s = scene(22.45, 29.55)
  const v6 = at("v06")
  const mk = (ic, title, sub, x, y) => {
    const el = at2(h("div", "glass abs", `<div style="width:84px;height:84px;border-radius:24px;border:1px solid rgba(255,255,255,.16);display:grid;place-items:center;font-size:44px;background:rgba(255,255,255,.04)">${icon(ic)}</div><h3 style="margin:30px 0 8px;font-weight:400;font-size:44px;letter-spacing:-.02em">${title}</h3><p style="margin:0;font-size:24px;color:#8f8f8f">${sub}</p>`, { width: px(620), height: px(330), padding: "40px 44px" }), x, y)
    s.appendChild(el)
    return el
  }
  const a = mk("android", "Une application Android", "Développée sur mesure, publiée sur le Play Store", 250, 230)
  const w = mk("laptop", "Un logiciel Windows", "Installateur signé, mises à jour, Microsoft Store", 1050, 230)
  const ta = v6 + 0.25
  const tw = at("v06", "windows") - 0.05
  // Calendrier : les mois défilent ; jauge du budget qui se remplit.
  const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet"]
  const cal = at2(h("div", "glass abs", `<span style="font-size:22px;color:#8f8f8f">${icon("nxCalendar")} Délai</span><div class="m" style="font-size:64px;font-weight:300;margin-top:10px;letter-spacing:-.02em">Janvier</div>`, { width: px(620), height: px(190), padding: "30px 44px" }), 250, 600)
  const bud = at2(h("div", "glass abs", `<span style="font-size:22px;color:#8f8f8f">${icon("nxiCoins")} Budget</span><div style="margin-top:34px;height:14px;border-radius:7px;background:rgba(255,255,255,.08);overflow:hidden"><i style="display:block;height:100%;width:0;background:linear-gradient(90deg,#9a9a9a,#fff);border-radius:7px"></i></div><div class="v" style="margin-top:14px;font-size:22px;color:#bdbdbd">Développement, signature, publication…</div>`, { width: px(620), height: px(190), padding: "30px 44px" }), 1050, 600)
  s.append(cal, bud)
  const m = cal.querySelector(".m")
  const fill = bud.querySelector("i")
  const tm = at("v06", "mois")
  const tb = at("v06", "budget")
  MOIS.forEach((_, i) => { if (i) sfx("flip", tm + 0.05 + i * 0.13, { gain: 0.45 - i * 0.02 }) })
  sfx("ramp", tb + 0.05, { dur: 0.9, gain: 0.4 })
  const implode = 28.95
  tick((t) => {
    if (t < 22.4 || t > 29.6) return
    const imp = prog(t, implode, 0.5, E.in3)
    for (const [el, t0, cx, cy] of [[a, ta, 560, 395], [w, tw, 1360, 395], [cal, tm - 0.1, 560, 695], [bud, tb - 0.05, 1360, 695]]) {
      const k = prog(t, t0, 0.6, E.spring)
      const dx = (960 - cx) * imp
      const dy = (540 - cy) * imp
      el.style.opacity = clamp(prog(t, t0, 0.25)) * (1 - imp)
      el.style.transform = `translate(${dx}px, ${(1 - k) * 40 + dy}px) scale(${lerp(0.94, 1, k) * (1 - imp * 0.85)})`
      blurOf(el, imp * 12)
    }
    const i = clamp(Math.floor((t - tm - 0.05) / 0.13) + 1, 0, MOIS.length - 1)
    m.textContent = t < tm ? MOIS[0] : MOIS[i]
    fill.style.width = `${prog(t, tb + 0.05, 0.9, E.inOut3) * 100}%`
  })
  sfx("pop", ta, { gain: 0.55, pan: -0.4 })
  sfx("pop", tw, { gain: 0.55, pan: 0.4 })
  sfx("suck", implode, { dur: 0.55, gain: 0.8 })
}

// ================================================================ ACTE 2 : LE BASCULEMENT
// ---------------------------------------------------------------- 7. « Et si tout tenait dans un seul logiciel ? »
{
  const s = scene(29.3, T0 + 0.05)
  const dot = h("div", "abs", null, { left: px(960 - 60), top: px(640 - 60), width: px(120), height: px(120), borderRadius: "50%", background: "radial-gradient(circle, #fff 0 6%, rgba(255,255,255,.55) 12%, rgba(255,255,255,.12) 34%, transparent 66%)" })
  const t7 = h("h2", "title abs", null, { left: 0, right: 0, top: px(330), textAlign: "center", fontSize: px(100) })
  s.append(dot, t7)
  const ws = words(t7, "Et si tout tenait / |dans un seul logiciel ?")
  revealWords(ws, at("v07") + 0.12, { step: 0.19, dur: 0.8 })
  tick((t) => {
    if (t < 29.2 || t > T0 + 0.1) return
    const squeeze = prog(t, T0 - 0.42, 0.42, E.in3)
    t7.style.transform = `translateY(${squeeze * 170}px) scale(${1 - squeeze * 0.75})`
    t7.style.opacity = 1 - squeeze
    blurOf(t7, squeeze * 6)
    const pulse = 1 + Math.sin(t * 5) * 0.06
    const pre = prog(t, T0 - 0.3, 0.22, E.in2)
    dot.style.transform = `scale(${(0.6 + prog(t, 29.3, 0.6, E.out3) * 0.4) * pulse * (1 + pre * 0.6) * (1 - prog(t, T0 - 0.08, 0.08) * 0.5)})`
    dot.style.opacity = prog(t, 29.3, 0.5)
  })
  sfx("riser", 29.35, { dur: T0 - 29.35, gain: 0.85 })
}

// ---------------------------------------------------------------- 8. Impact, « Voici NEXORA. »
{
  const s = scene(T0, C.hero + 0.2)
  const flash = h("div", "abs", null, { left: px(960 - 900), top: px(400 - 900), width: px(1800), height: px(1800), borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,.5), rgba(255,255,255,.12) 30%, transparent 62%)" })
  const ring = h("div", "abs", null, { left: px(960 - 50), top: px(400 - 50), width: px(100), height: px(100), borderRadius: "50%", border: "2px solid rgba(255,255,255,.8)" })
  const parts = h("div", "layer")
  const rnd = rng(31)
  const P = Array.from({ length: 42 }, () => {
    const d = h("i", "abs", null, { left: px(960), top: px(400), width: "4px", height: "4px", borderRadius: "50%", background: "#fff" })
    parts.appendChild(d)
    const a = rnd() * Math.PI * 2
    return { d, a, v: 260 + rnd() * 640, z: 0.4 + rnd() * 0.9 }
  })
  const group = h("div", "layer", null, { transformOrigin: "960px 520px" })
  const glow = h("div", "abs", null, { left: px(960 - 320), top: px(400 - 320), width: px(640), height: px(640), borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,.22), transparent 62%)" })
  const logo = h("div", "abs", `<img src="${LOGO}" style="width:100%;height:100%;display:block"><div class="sweep" style="position:absolute;inset:0;border-radius:24%;background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.75) 50%,transparent 65%);background-size:300% 100%;mix-blend-mode:overlay"></div>`, { left: px(960 - 92), top: px(400 - 92), width: px(184), height: px(184) })
  const mark = h("div", "abs", null, { left: 0, right: 0, top: px(540), textAlign: "center", fontSize: px(118), fontWeight: 600, letterSpacing: ".3em", paddingLeft: ".3em" })
  mark.innerHTML = [..."NEXORA"].map((c) => `<span class="mk"><span class="mw">${c}</span></span>`).join("")
  const tag = h("div", "abs", `<span class="pill">Devs Toolbox</span>`, { left: 0, right: 0, top: px(716), textAlign: "center" })
  const sub = h("p", "abs", "Créez, testez et publiez vos sites et applications.", { left: 0, right: 0, top: px(790), margin: 0, textAlign: "center", fontSize: px(32), color: "#8a8a8a", fontWeight: 400 })
  group.append(glow, logo, mark, tag, sub)
  s.append(flash, ring, parts, group)
  revealWords([...mark.querySelectorAll(".mw")], at("v08", "nexora") - 0.12, { step: 0.06, dur: 0.8 })
  fade(tag, at("v08") + 0.95, null, { y: 12 })
  fade(sub, at("v08") + 1.15, null, { y: 12 })
  const sweep = logo.querySelector(".sweep")
  tick((t) => {
    if (t < T0 - 0.05 || t > C.hero + 0.25) return
    const e = t - T0
    flash.style.opacity = 0.9 * (1 - prog(t, T0, 0.8, E.out2))
    flash.style.transform = `scale(${0.4 + prog(t, T0, 0.8, E.outExpo) * 0.8})`
    const rk = prog(t, T0, 1.1, E.out3)
    ring.style.transform = `scale(${1 + rk * 16})`
    ring.style.opacity = 0.7 * (1 - rk)
    ring.style.borderWidth = px(2 / (1 + rk * 3))
    for (const p of P) {
      const k = 1 - Math.exp(-e * 2.6)
      p.d.style.transform = `translate(${Math.cos(p.a) * p.v * k}px, ${Math.sin(p.a) * p.v * k}px) scale(${p.z})`
      p.d.style.opacity = e < 0 ? 0 : clamp(1 - e / 1.6) * 0.8
    }
    const lk = prog(t, T0, 0.75, E.spring)
    logo.style.transform = `scale(${lerp(0.55, 1, lk)})`
    logo.style.opacity = prog(t, T0, 0.2)
    blurOf(logo, (1 - prog(t, T0, 0.5, E.out3)) * 16)
    glow.style.opacity = prog(t, T0, 0.6) * (0.8 + Math.sin(t * 2) * 0.2)
    sweep.style.backgroundPosition = `${lerp(110, -10, prog(t, T0 + 0.45, 0.8, E.inOut3))}% 0`
    const out = prog(t, C.hero - 0.38, 0.42, E.in3)
    group.style.transform = `scale(${1 + out * 0.35})`
    group.style.opacity = 1 - out
    blurOf(group, out * 10)
  })
  sfx("impact", T0, { gain: 1 })
  sfx("shimmer", T0 + 0.35, { dur: 1.6, gain: 0.45 })
  sfx("whoosh", C.hero - 0.42, { dur: 0.7, gain: 0.65 })
}

// ================================================================ ACTE 3 : LA SOLUTION
/** Étiquette d'un espace en haut à gauche : numéro, repère « /tag », titre en deux tons. */
function spaceLabel(s, { num, tag, title, t0, t1, size = 50 }) {
  const scr = h("div", "scrim-t")
  const el = label({ num, tag, title: "", x: 120, y: 58, w: 1300, size })
  s.append(scr, el)
  const row = el.querySelector(".lab-row")
  fade(row, t0, t1, { y: 10 })
  revealWords(words(el.querySelector("h2"), title), t0 + 0.12, { step: 0.05, out: t1 })
  tick((t) => { scr.style.opacity = prog(t, t0 - 0.2, 0.4) * (1 - prog(t, t1, 0.4)) })
  return el
}
/** Fenêtre de NEXORA (barre native de Windows 11) avec une vraie capture en double résolution. */
const nxWin = (shot, extra = "") => win11({ w: 1600, hgt: 1000, html: `<img src="${ECR}/${shot}-sombre.webp">${extra}` })
const WW = 1600
const WH = 1032

// ---------------------------------------------------------------- 9. NEXORA en 3D (vrai MacBook Pro 16 du Studio)
{
  const s = scene(C.hero - 0.25, C.design + 0.35)
  s.appendChild(h("div", "spot", null, { left: px(560), top: px(-420), width: px(1500), height: px(1500) }))
  const cv = h("canvas", "gl")
  cv.width = 1920
  cv.height = 1080
  s.appendChild(cv)
  const P = plateau(cv)
  let mac = null
  ready.push(appareil("macbook-pro-16", `${ECR}/accueil-sombre.webp`).then((m) => { mac = P.place(m, { shadow: 1.1 }) }))
  const H0 = C.hero
  const H1 = C.design
  tick((t) => {
    if (!mac || t < H0 - 0.3 || t > H1 + 0.4) return
    const pos = track(t, [[H0 - 0.25, [-74, 30, 80]], [H1 - 1.25, [-24, 18, 62], E.inOutSine], [H1, [0, 11.8, 21.5], E.inOut5]])
    const tgt = track(t, [[H0 - 0.25, [-17, 9, 9]], [H1 - 1.25, [-12, 10.5, 4], E.inOutSine], [H1, [0, 11.2, -4.4], E.inOut5]])
    const fov = track(t, [[H0, 24], [H1 - 1.25, 24, E.inOutSine], [H1, 21, E.inOut5]])
    P.look(pos, tgt, fov)
    P.render()
    opa(cv, prog(t, H0 - 0.25, 0.45, E.out2) * (1 - prog(t, H1 + 0.02, 0.25, E.inOut2)))
  })
  const scr = h("div", "scrim-l")
  s.appendChild(scr)
  const p = at2(h("div", "abs", `<span class="pill">9 espaces, un seul logiciel</span>`), 120, 360)
  s.appendChild(p)
  fade(p, H0 + 0.35, H1 - 1.3)
  const t9 = h("h2", "title abs", null, { left: px(120), top: px(440), width: px(760), fontSize: px(82) })
  s.appendChild(t9)
  revealWords(words(t9, "Tout votre projet, / |au même endroit."), H0 + 0.5, { step: 0.06, out: H1 - 1.3 })
  tick((t) => { scr.style.opacity = prog(t, H0, 0.4) * (1 - prog(t, H1 - 1.4, 0.5)) })
  sfx("whoosh", H0 + 0.1, { dur: 2.2, gain: 0.35, soft: true })
  sfx("swell", H1 - 1.2, { dur: 1.2, gain: 0.5 })
}

// ---------------------------------------------------------------- 10. NEX-DESIGN
{
  const T = C.design
  const X = C.dev
  const s = scene(T - 0.05, X + 0.2)
  const lay = persp(s)
  const win = nxWin("design")
  win.style.transformOrigin = "0 0"
  lay.appendChild(win)
  glare(win, (t) => prog(t, T, 1.2, E.inOut3) * 0.6 + prog(t, X - 0.5, 0.5) * 0.4)
  const tz = at("v09", "logos")
  // Instants du geste : glisser une sélection autour de la carte ALTURA.
  const c0 = tz + 0.55
  const c1 = c0 + 0.6
  const Z = 1.45
  const F = [810, 552]
  const S0 = (lx, ly) => [960 + (lx - F[0]) * Z, 560 + (ly - F[1]) * Z]
  const A0 = S0(676, 478)
  const A1 = S0(972, 598)
  tick((t) => {
    if (t < T - 0.1 || t > X + 0.25) return
    const k = prog(t, T, 0.95, E.inOut5)
    const z = prog(t, tz, 0.85, E.inOut5)
    const zo = prog(t, at("v09", "atelier") + 0.45, 0.8, E.inOut5)
    const whip = prog(t, X - 0.38, 0.4, E.in3)
    const sc = lerp(lerp(1.2, 0.78, k), Z, z) * lerp(1, 0.86, zo)
    const fx = lerp(WW / 2, F[0], z)
    const fy = lerp(WH / 2, F[1], z)
    place(win, { fx, fy, s: sc, cx: lerp(960, 960, z) - zo * 260 - whip * 2400, cy: lerp(540, lerp(632, 560, z), k) })
    blurOf(win, whip * 18)
    opa(win, prog(t, T - 0.05, 0.2))
  })
  // Sélection (rectangle tiré puis poignées) et taille affichée, comme dans un outil de design.
  const sel = h("div", "abs", null, { border: "1.5px solid #fff", background: "rgba(255,255,255,.06)", boxShadow: "0 0 0 1px rgba(0,0,0,.4)" })
  const handles = [0, 1, 2, 3, 4, 5, 6, 7].map(() => h("i", "abs", null, { width: "12px", height: "12px", background: "#fff", border: "1.5px solid #111", borderRadius: "2px" }))
  const dim = h("div", "abs", "296 × 120", { padding: "5px 12px", borderRadius: "999px", background: "#fff", color: "#0a0a0a", font: "600 16px Urbanist" })
  s.append(sel, ...handles, dim)
  tick((t) => {
    if (t < c0 - 0.1 || t > X + 0.3) { sel.style.opacity = 0; handles.forEach((d) => (d.style.opacity = 0)); dim.style.opacity = 0; return }
    const k = prog(t, c0, c1 - c0, E.inOut3)
    const x2 = lerp(A0[0], A1[0], k)
    const y2 = lerp(A0[1], A1[1], k)
    const zo = prog(t, at("v09", "atelier") + 0.45, 0.8, E.inOut5)
    const whip = prog(t, X - 0.38, 0.4, E.in3)
    const ox = -zo * 260 - whip * 2400
    const sk = lerp(1, 0.86, zo)
    const cx = (x) => 960 + ox + (x - 960) * sk
    const cy = (y) => 560 + (y - 560) * sk
    const L = cx(A0[0])
    const Tp = cy(A0[1])
    const Wd = cx(x2) - L
    const Hd = cy(y2) - Tp
    Object.assign(sel.style, { left: px(L), top: px(Tp), width: px(Wd), height: px(Hd) })
    sel.style.opacity = t < c0 ? 0 : 1 - whip
    const hk = prog(t, c1, 0.25, E.spring)
    const pts = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]]
    handles.forEach((d, i) => {
      d.style.left = px(L + pts[i][0] * Wd - 6)
      d.style.top = px(Tp + pts[i][1] * Hd - 6)
      d.style.opacity = clamp(hk) * (1 - whip)
      d.style.transform = `scale(${lerp(0.3, 1, hk)})`
    })
    dim.style.left = px(L + Wd / 2 - 52)
    dim.style.top = px(Tp + Hd + 16)
    dim.style.opacity = clamp(hk) * (1 - whip)
  })
  cursor(s, [[tz + 0.15, 1500, 980], [c0, A0[0], A0[1], E.inOut3], [c1, A1[0], A1[1], E.inOut2], [c1 + 0.6, A1[0] + 60, A1[1] + 90, E.inOutSine]], { clicks: [c0], hide: at("v09", "atelier") + 0.5 })
  sfx("tick", c1, { gain: 0.5 })
  // « dans le même atelier que votre code » : le code de la sélection.
  const ta = at("v09", "atelier")
  const code = at2(h("div", "nxcard abs", `<div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #262626"><b style="font-weight:500;font-size:22px">Code de la sélection</b><span style="display:flex;gap:6px;font-size:15px"><span style="padding:5px 12px;border-radius:999px;background:#fff;color:#0a0a0a;font-weight:600">CSS</span><span style="padding:5px 12px;border-radius:999px;border:1px solid #333;color:#aaa">React</span><span style="padding:5px 12px;border-radius:999px;border:1px solid #333;color:#aaa">SwiftUI</span></span></div><pre class="cd" style="margin:0;padding:20px 24px;font:18px/1.75 Mono;color:#d8d8d8;white-space:pre"></pre>`, { width: px(560) }), 1260, 360)
  s.appendChild(code)
  const LINES = [".altura {", "  display: grid;", "  place-items: center;", "  background: #d6f24c;", "  border-radius: 18px;", "  font: 700 64px \"Space Grotesk\";", "}"]
  const cd = code.querySelector(".cd")
  tick((t) => {
    const n = Math.floor(prog(t, ta + 0.45, 0.95, E.lin) * LINES.join("\n").length)
    cd.textContent = LINES.join("\n").slice(0, n)
    const k = prog(t, ta + 0.3, 0.6, E.out5)
    const whip = prog(t, X - 0.38, 0.4, E.in3)
    code.style.opacity = k * (1 - whip)
    code.style.transform = `translateX(${(1 - k) * 80 - whip * 2400}px)`
    blurOf(code, whip * 18)
  })
  sfx("type", ta + 0.45, { dur: 0.95, gain: 0.35, pan: 0.5 })
  sfx("swish", ta + 0.3, { gain: 0.4, pan: 0.6 })
  spaceLabel(s, { num: "01", tag: "NEX-DESIGN", title: "Maquettes, logos et visuels,|à côté du code.", t0: T + 0.55, t1: tz - 0.15 })
  sfx("whoosh", X - 0.42, { dur: 0.6, gain: 0.8, pan: -0.5 })
}

// ---------------------------------------------------------------- 11. Dev Lab
{
  const T = C.dev
  const X = C.resp
  const s = scene(T - 0.1, X + 0.15)
  const lay = persp(s)
  // Masques des lignes 6 à 15 du fichier (fond exact de l'éditeur) : le code s'écrit ligne par ligne.
  const ENDS = { 6: 670, 7: 726, 8: 925, 9: 1000, 10: 526, 11: 470, 12: 970, 13: 562, 14: 462, 15: 1031 }
  const masks = Object.keys(ENDS).map((n) => `<i class="lm" data-n="${n}" style="position:absolute;left:395px;top:${162 + (n - 1) * 18}px;width:1035px;height:18px;background:#1e1e20"></i>`).join("")
  const term = `<div class="tm" style="position:absolute;left:362px;top:770px;font:13px/1.7 Mono;color:#cfcfcf;white-space:pre"></div>`
  const win = nxWin("dev", `<div style="position:absolute;inset:0">${masks}${term}<i class="crt" style="position:absolute;width:2px;height:16px;background:#e8e8e8"></i></div>`)
  win.style.transformOrigin = "0 0"
  lay.appendChild(win)
  glare(win, (t) => prog(t, T, 1.6, E.inOut3))
  const lms = [...win.querySelectorAll(".lm")]
  const crt = win.querySelector(".crt")
  const tm = win.querySelector(".tm")
  const ty0 = T + 0.55
  const LT = 0.105
  tick((t) => {
    if (t < T - 0.15 || t > X + 0.2) return
    const enter = prog(t, T, 0.62, E.out5)
    const z = prog(t, T + 0.5, 0.8, E.inOut5)
    const zo = prog(t, at("v10", "outils") + 0.75, 0.75, E.inOut5)
    const out = prog(t, X - 0.38, 0.42, E.in3)
    const sc = lerp(0.78, 1.05, z) * lerp(1, 0.85, zo) * lerp(1, 0.6, out)
    place(win, { fx: lerp(WW / 2, 735, z * (1 - zo)), fy: lerp(WH / 2, 332, z * (1 - zo)), s: sc, cx: 960 + (1 - enter) * 2400 - zo * 150, cy: lerp(632, 540, z) + zo * 60 })
    blurOf(win, (1 - enter) * 18 + out * 8)
    opa(win, 1 - out)
    // Écriture : chaque ligne se découvre de gauche à droite, le curseur de saisie la suit.
    let cx = 0
    let cy = 0
    lms.forEach((el, i) => {
      const n = Number(el.dataset.n)
      const k = prog(t, ty0 + i * LT, LT, E.lin)
      const x0 = 434 + (ENDS[n] - 434) * k
      el.style.left = px(k > 0 ? x0 : 395)
      el.style.width = px(1430 - (k > 0 ? x0 : 395))
      if (k > 0 && k <= 1 && t < ty0 + lms.length * LT + 0.4) { cx = x0; cy = 162 + (n - 1) * 18 }
    })
    crt.style.left = px(cx + 1)
    crt.style.top = px(cy + 1)
    crt.style.opacity = cx && Math.floor(t * 3) % 2 === 0 ? 1 : cx && t < ty0 + lms.length * LT ? 1 : 0
    const ln = t > X - 1.1 ? "$ node server.js\nBoutique prête sur http://localhost:4173" : t > X - 1.35 ? "$ node server.js" : ""
    tm.textContent = ln
  })
  sfx("type", ty0, { dur: lms.length * LT + 0.1, gain: 0.5, pan: 0.1 })
  // « les outils s'installent pour vous » : préparation des outils de NEXORA.
  const to = at("v10", "outils")
  const card = at2(h("div", "nxcard abs", `<div style="padding:20px 24px 8px;font-size:22px;font-weight:500">Outils de développement</div>${["Node.js", "Git", "Python"].map((n) => `<div class="tr" style="display:flex;align-items:center;gap:14px;padding:12px 24px;font-size:22px;color:#cfcfcf"><span class="st" style="width:26px;height:26px;border-radius:50%;border:2px solid #444;display:grid;place-items:center"></span>${n}<span class="lb" style="margin-left:auto;font-size:17px;color:#777">Installation…</span></div>`).join("")}<div style="padding:12px 24px 20px"><span class="pill" style="font-size:18px">Installés pour vous</span></div>`, { width: px(470) }), 1330, 600)
  s.appendChild(card)
  const rows = [...card.querySelectorAll(".tr")]
  rows.forEach((r, i) => {
    const ti = to + 0.35 + i * 0.27
    sfx("tick", ti, { gain: 0.55, pan: 0.6 })
    const st = r.querySelector(".st")
    const lb = r.querySelector(".lb")
    tick((t) => {
      const done = t >= ti
      st.style.borderColor = done ? "#fff" : "#444"
      st.style.background = done ? "#fff" : "transparent"
      st.innerHTML = done ? `<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:#0a0a0a;stroke-width:3"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>` : ""
      st.style.transform = done ? `scale(${lerp(1.25, 1, prog(t, ti, 0.25, E.out3))})` : `rotate(${t * 360}deg)`
      st.style.borderTopColor = done ? "#fff" : "#bbb"
      lb.textContent = done ? "Prêt" : "Installation…"
      lb.style.color = done ? "#e5e5e5" : "#777"
    })
  })
  tick((t) => {
    const k = prog(t, to - 0.05, 0.55, E.spring)
    const out = prog(t, X - 0.38, 0.42, E.in3)
    card.style.opacity = clamp(prog(t, to - 0.05, 0.25)) * (1 - out)
    card.style.transform = `translateY(${(1 - k) * 40}px) scale(${lerp(0.96, 1, k)})`
  })
  sfx("pop", to - 0.05, { gain: 0.5, pan: 0.6 })
  spaceLabel(s, { num: "02", tag: "Dev Lab", title: "Codez tout de suite,|sans rien préparer.", t0: T + 0.4, t1: X - 0.45 })
  sfx("whoosh", X - 0.42, { dur: 0.6, gain: 0.55, soft: true })
}

// ---------------------------------------------------------------- 12. Responsive Lab : 182 modèles d'appareils
{
  const T = C.resp
  const X = C.browser
  const s = scene(T - 0.1, X + 0.35)
  s.appendChild(h("div", "spot", null, { left: px(360), top: px(-200), width: px(1200), height: px(1200) }))
  const lay = persp(s, 2400)
  const win = nxWin("responsive")
  win.style.transformOrigin = "0 0"
  lay.appendChild(win)
  // Rangée d'appareils aux cadres réels (site Kora), en arc, avec reflet sur le sol.
  const row = h("div", "abs", null, { left: 0, top: 0, width: px(1920), height: px(1080), transformStyle: "preserve-3d", transformOrigin: "960px 640px" })
  lay.appendChild(row)
  const KO = "/site/src/assets/ecrans"
  const LINE = [["pixel", `${KO}/kora-pixel.webp`, 330, 196, -26], ["tablet", `${KO}/kora-tablette.webp`, 268, 520, -14], ["macbook", `${ECR}/kora-bureau.webp`, 412, 960, 0], ["fold", `${KO}/kora-pliable.webp`, 300, 1400, 14], ["iphone", `${KO}/kora-mobile.webp`, 330, 1726, 26]]
  const devs = LINE.map(([kind, img, hh, cx, ry], i) => {
    const d = device(kind, img, hh)
    const w = parseFloat(d.style.width)
    d.style.left = px(cx - w / 2)
    d.style.top = px(800 - hh)
    d.style.webkitBoxReflect = "below 4px linear-gradient(transparent 72%, rgba(255,255,255,.16))"
    d.ry = ry
    d.i = i
    row.appendChild(d)
    return d
  })
  const mac = devs[2]
  const tr = T + 0.95
  tick((t) => {
    if (t < T - 0.15 || t > X + 0.4) return
    const k = prog(t, T, 0.55, E.out5)
    const back = prog(t, tr - 0.15, 0.6, E.inOut3)
    place(win, { fx: WW / 2, fy: WH / 2, s: lerp(0.5, 0.66, k) * lerp(1, 0.82, back), cx: 960, cy: lerp(640, 600, k) })
    opa(win, k * (1 - back * 0.85))
    blurOf(win, (1 - k) * 10 + back * 6)
    const dolly = prog(t, X - 0.55, 0.6, E.in3)
    row.style.transform = `translateX(${track(t, [[tr, 70], [X - 0.5, -70, E.inOutSine]])}px) rotateY(${track(t, [[tr, 7], [X - 0.5, -5, E.inOutSine]])}deg) scale(${lerp(1, 2.9, dolly)})`
    row.style.transformOrigin = `${lerp(960, 960, dolly)}px ${lerp(640, 560, dolly)}px`
    for (const d of devs) {
      const kk = prog(t, tr + d.i * 0.075, 0.7, E.spring)
      d.style.opacity = clamp(prog(t, tr + d.i * 0.075, 0.3)) * (d === mac ? 1 : 1 - dolly)
      d.style.transform = `translateY(${(1 - kk) * 120}px) translateZ(${-Math.abs(d.ry) * 9}px) rotateY(${-d.ry * 0.9}deg)`
    }
  })
  devs.forEach((d) => sfx("pop", tr + d.i * 0.075, { gain: 0.3, pan: pan(parseFloat(d.style.left)) }))
  sfx("whoosh", tr - 0.15, { dur: 0.7, gain: 0.45, soft: true })
  // Compteur calé sur « cent quatre-vingt-deux ».
  const tn = at("v11", "nombre")
  const num = h("div", "abs big", "0", { left: 0, right: 0, top: px(96), textAlign: "center", fontSize: px(176), lineHeight: 1 })
  const cap = h("div", "abs", "modèles d’appareils, côte à côte", { left: 0, right: 0, top: px(292), textAlign: "center", fontSize: px(36), color: "#8d8d8d" })
  s.append(num, cap)
  tick((t) => {
    num.textContent = String(Math.round(182 * prog(t, tn - 0.05, 1.0, E.out3)))
    const o = prog(t, tn - 0.25, 0.3) * (1 - prog(t, X - 0.6, 0.35))
    num.style.opacity = o
    num.style.transform = `translateY(${(1 - prog(t, tn - 0.25, 0.5, E.out5)) * 30}px)`
  })
  fade(cap, tn + 0.9, X - 0.6)
  sfx("counter", tn - 0.05, { dur: 1.0, gain: 0.45 })
  const p = at2(h("div", "abs", `<span class="lab-num" style="margin-right:18px">03</span><span class="pill">Responsive Lab</span>`, { display: "flex", alignItems: "center" }), 120, 64)
  s.appendChild(p)
  fade(p, T + 0.3, X - 0.6)
  sfx("swell", X - 0.75, { dur: 0.75, gain: 0.5 })
}

// ---------------------------------------------------------------- 13. Browser Lab (dessiné : sa capture est vide sans site chargé)
{
  const T = C.browser
  const X = C.secu
  const s = scene(T - 0.05, X + 0.15)
  const lay = persp(s)
  const RAIL = ["home", "phone", "globe", "code", "android", "cube", "palette", "shield", "laptop"].map((g, i) => `<div style="width:56px;height:56px;margin:0 auto 6px;border-radius:16px;display:grid;place-items:center;font-size:24px;${i === 2 ? "background:#fff;color:#0a0a0a" : "color:#9a9a9a"}">${icon(g)}</div>`).join("")
  const NET = [["monsite.fr", "document", "14 Ko", "120 ms", 0, 0.12], ["styles.css", "feuille de style", "38 Ko", "90 ms", 0.12, 0.09], ["app.js", "script", "212 Ko", "240 ms", 0.14, 0.24], ["hero.jpg", "image", "2,4 Mo", "3,1 s", 0.2, 3.1], ["urbanist.woff2", "police", "46 Ko", "80 ms", 0.25, 0.08], ["api/produits", "fetch", "6 Ko", "180 ms", 0.4, 0.18], ["api/contact", "fetch", "—", "500", 0.6, 0.2]]
  const net = NET.map(([n, ty, sz, tm, a, d], i) => `<div class="nr" style="position:absolute;left:16px;right:16px;top:${110 + i * 46}px;height:40px;display:flex;align-items:center;font-size:17px;border-radius:10px;padding:0 12px;${n === "hero.jpg" ? "" : ""}"><span style="width:170px;color:${n === "api/contact" ? "#ff8a80" : "#e6e6e6"}">${n}</span><span style="width:130px;color:#7d7d7d">${ty}</span><span style="width:76px;color:#bdbdbd">${sz}</span><span style="width:70px;color:${tm === "500" ? "#ff8a80" : "#bdbdbd"}">${tm}</span><span style="position:relative;flex:1;height:10px"><i class="wf" data-a="${a}" data-d="${d}" style="position:absolute;top:0;height:10px;border-radius:5px;left:${(a / 3.6) * 100}%;width:0;background:${n === "hero.jpg" ? "#f2b24a" : n === "api/contact" ? "#ff6a5f" : "#d9d9d9"}"></i></span></div>`).join("")
  const CON = `<div class="con" style="position:absolute;left:16px;right:16px;top:100px;opacity:0;font:16px/1.5 Mono"><p style="margin:0;padding:10px 14px;color:#9a9a9a;border-bottom:1px solid #1d1d1d">[vite] connecté.</p><p class="er" style="margin:0;padding:12px 14px;background:#2a1414;color:#ff8a80;border-radius:10px;display:flex;gap:12px"><span>✕</span><span style="flex:1">TypeError: Cannot read properties of undefined (reading 'map')<br><span style="color:#a5706b">at afficherProduits</span></span><u class="lk" style="color:#fff;text-decoration:underline;text-underline-offset:4px;white-space:nowrap">app.js:42</u></p></div>`
  const SRC = ["async function afficherProduits() {", "  const reponse = await fetch(\"/api/produits\")", "  const donnees = await reponse.json()", "  const grille = document.querySelector(\".produits\")", "  grille.innerHTML = donnees.liste.map(carte).join(\"\")", "}"]
  const src = `<div class="src" style="position:absolute;left:16px;right:16px;top:300px;height:300px;border-radius:12px;background:#111;border:1px solid #242424;font:15px/2 Mono;opacity:0"><div style="padding:10px 16px;border-bottom:1px solid #222;color:#9a9a9a;font-family:Urbanist;font-size:17px">app.js</div>${SRC.map((l, i) => `<div style="display:flex;padding:0 16px;${i === 4 ? "background:rgba(255,106,95,.13);box-shadow:inset 3px 0 0 #ff6a5f" : ""}"><span style="width:40px;color:#5d5d5d">${38 + i}</span><span style="color:${i === 4 ? "#fff" : "#bdbdbd"};white-space:pre${i === 4 ? ";text-decoration:underline wavy #ff6a5f;text-underline-offset:6px" : ""}">${l.replace(/</g, "&lt;")}</span></div>`).join("")}<div class="tip" style="margin:14px 16px 0;padding:10px 14px;border-radius:10px;background:#1b1b1b;border:1px solid #2c2c2c;font:17px Urbanist;color:#e6e6e6">Ligne 42 : <b style="font-weight:600">donnees.liste</b> n’existe pas dans la réponse de /api/produits.</div></div>`
  const TABS = ["Éléments", "Réseau", "Console", "Tests", "Audit"]
  const html = `<div style="position:absolute;inset:0;background:#050505;font-family:Urbanist;color:#e8e8e8">
    <div style="position:absolute;left:0;top:0;bottom:0;width:84px;padding-top:14px"><img src="${LOGO}" style="display:block;width:44px;height:44px;margin:0 auto 26px;border-radius:12px">${RAIL}</div>
    <div style="position:absolute;left:100px;top:14px;display:flex;align-items:center;gap:14px"><span style="width:44px;height:44px;border-radius:50%;border:1px solid #262626;display:grid;place-items:center;font-size:20px">${icon("globe")}</span><span><b style="display:block;font-weight:500;font-size:19px">Browser Lab</b><span style="font-size:14px;color:#777">Inspection, réseau, console et audits</span></span></div>
    <div style="position:absolute;left:100px;right:20px;top:76px;height:46px;display:flex;align-items:center;gap:10px"><span style="flex:0 0 560px;height:44px;border-radius:999px;border:1px solid #262626;background:#0c0c0c;display:flex;align-items:center;gap:12px;padding:0 18px;font-size:18px;color:#d8d8d8">${icon("lock")} https://monsite.fr</span><span class="pill" style="font-size:16px;padding:8px 16px">Inspecter</span><span class="pill" style="font-size:16px;padding:8px 16px">Enregistrer un test</span><span class="pill" style="font-size:16px;padding:8px 16px">Auditer</span></div>
    <div style="position:absolute;left:100px;top:136px;width:796px;height:848px;border-radius:16px;overflow:hidden;border:1px solid #1e1e1e;background:#fff"><img src="${ECR}/kora-page.webp" style="width:100%;display:block"><div class="hl" style="position:absolute;left:426px;top:66px;width:350px;height:250px;border:2px solid #f2b24a;background:rgba(242,178,74,.12);opacity:0"></div></div>
    <div class="tools" style="position:absolute;left:912px;top:136px;width:672px;height:848px;border-radius:16px;background:#0b0b0b;border:1px solid #1e1e1e;overflow:hidden">
      <div style="position:absolute;left:16px;top:16px;display:flex;gap:8px">${TABS.map((n) => `<span class="tb" style="padding:9px 18px;border-radius:999px;border:1px solid #2a2a2a;font-size:17px;color:#bdbdbd">${n}</span>`).join("")}</div>
      <div class="netw"><div style="position:absolute;left:28px;right:28px;top:76px;display:flex;font-size:14px;color:#6c6c6c"><span style="width:170px">Nom</span><span style="width:130px">Type</span><span style="width:76px">Taille</span><span style="width:70px">Temps</span><span>Cascade</span></div>${net}</div>
      ${CON}${src}
    </div></div>`
  const win = win11({ w: 1600, hgt: 1000, html })
  win.style.transformOrigin = "0 0"
  lay.appendChild(win)
  glare(win, (t) => prog(t, T, 1.4, E.inOut3))
  const rows = [...win.querySelectorAll(".nr")]
  const wfs = [...win.querySelectorAll(".wf")]
  const tabs = [...win.querySelectorAll(".tb")]
  const netw = win.querySelector(".netw")
  const con = win.querySelector(".con")
  const srcEl = win.querySelector(".src")
  const hl = win.querySelector(".hl")
  const t0 = T + 0.5
  const tSlow = at("v12") + 0.85
  const tCasse = at("v12", "casse")
  const tFix = at("v12", "corriger")
  const tClick = tFix - 0.32
  rows.forEach((r, i) => sfx("tick", t0 + i * 0.1, { gain: 0.22, pan: 0.4 }))
  const F = [1248, 400]
  tick((t) => {
    if (t < T - 0.1 || t > X + 0.2) return
    const k = prog(t, T, 0.75, E.inOut5)
    const z = prog(t, tSlow - 0.2, 0.75, E.inOut5)
    const out = prog(t, X - 0.38, 0.42, E.in3)
    place(win, { fx: lerp(WW / 2, F[0], z), fy: lerp(WH / 2, F[1], z), s: lerp(lerp(2.2, 0.78, k), 1.18, z), cx: 960, cy: lerp(lerp(540, 632, k), 560, z) - out * 1300 })
    opa(win, prog(t, T - 0.05, 0.3))
    blurOf(win, out * 12 + (1 - prog(t, T, 0.4, E.out3)) * 6)
    rows.forEach((r, i) => {
      const a = prog(t, t0 + i * 0.1, 0.25, E.out3)
      r.style.opacity = a
      r.style.transform = `translateY(${(1 - a) * 10}px)`
      const w = wfs[i]
      w.style.width = `${(Number(w.dataset.d) / 3.6) * 100 * prog(t, t0 + i * 0.1 + 0.1, Math.min(1.4, 0.3 + Number(w.dataset.d) * 0.35), E.out3)}%`
      r.style.background = i === 3 ? `rgba(242,178,74,${0.14 * prog(t, tSlow, 0.3)})` : "transparent"
    })
    hl.style.opacity = prog(t, tSlow, 0.3) * (1 - prog(t, tCasse, 0.25))
    const toCon = prog(t, tCasse, 0.3, E.inOut3)
    tabs.forEach((b, i) => {
      const on = (i === 1 && toCon < 0.5) || (i === 2 && toCon >= 0.5)
      b.style.background = on ? "#fff" : "transparent"
      b.style.color = on ? "#0a0a0a" : "#bdbdbd"
      b.style.borderColor = on ? "#fff" : "#2a2a2a"
    })
    netw.style.opacity = 1 - toCon
    con.style.opacity = toCon
    con.style.transform = `translateY(${(1 - toCon) * 16}px)`
    const sk = prog(t, tFix - 0.05, 0.5, E.out5)
    srcEl.style.opacity = sk
    srcEl.style.transform = `translateY(${(1 - sk) * 40}px)`
  })
  sfx("error", tCasse + 0.12, { gain: 0.55, pan: 0.4 })
  sfx("swish", tCasse, { gain: 0.3, pan: 0.4 })
  const L = [960 + (1512 - F[0]) * 1.18, 560 + (300 - F[1]) * 1.18]
  cursor(s, [[tCasse + 0.25, 1700, 980], [tClick, L[0], L[1], E.inOut3], [tClick + 0.7, L[0] + 70, L[1] + 140, E.inOutSine]], { clicks: [tClick], hide: X - 0.5 })
  sfx("success", tFix + 0.3, { gain: 0.45, pan: 0.3 })
  spaceLabel(s, { num: "04", tag: "Browser Lab", title: "Ce qui ralentit,|ce qui casse.", t0: T + 0.45, t1: tSlow - 0.3 })
  sfx("whoosh", X - 0.42, { dur: 0.6, gain: 0.7, pan: 0 })
}

// ---------------------------------------------------------------- 14. Sécurité : audit, supervision, alerte
{
  const T = C.secu
  const X = C.build
  const s = scene(T - 0.05, X + 0.15)
  const lay = persp(s)
  const extra = `<div class="scan" style="position:absolute;left:0;right:0;height:180px;background:linear-gradient(180deg,transparent,rgba(255,255,255,.07) 70%,rgba(255,255,255,.5) 98%,transparent);opacity:0"></div><div class="live" style="position:absolute;left:1009px;top:706px;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 0 14px #fff;opacity:0"></div><div class="lring" style="position:absolute;left:995px;top:692px;width:40px;height:40px;border-radius:50%;border:2px solid #fff;opacity:0"></div>`
  const win = nxWin("securite", extra)
  win.style.transformOrigin = "0 0"
  lay.appendChild(win)
  glare(win, (t) => prog(t, T, 1.2, E.inOut3))
  const scan = win.querySelector(".scan")
  const live = win.querySelector(".live")
  const lring = win.querySelector(".lring")
  const ts = at("v13") + 0.15
  const tz = at("v13", "surveillez")
  const ta = at("v13", "alerte")
  tick((t) => {
    if (t < T - 0.1 || t > X + 0.2) return
    const k = prog(t, T, 0.62, E.out5)
    const z = prog(t, tz - 0.1, 0.9, E.inOut5)
    const out = prog(t, X - 0.38, 0.42, E.in3)
    place(win, { fx: lerp(WW / 2, 640, z), fy: lerp(WH / 2, 690, z), s: lerp(0.78, 1.5, z), cx: lerp(960, 860, z) - out * 2400, cy: lerp(632, 560, z) + (1 - k) * 1200 })
    blurOf(win, (1 - k) * 14 + out * 16)
    const sk = prog(t, ts, 1.35, E.inOut2)
    scan.style.top = px(-180 + sk * 1180)
    scan.style.opacity = sk > 0 && sk < 1 ? 1 : 0
    const lv = prog(t, tz + 0.6, 0.3)
    live.style.opacity = lv * (0.75 + 0.25 * Math.sin(t * 8))
    const ph = ((t - tz - 0.6) % 0.8) / 0.8
    lring.style.opacity = lv * (1 - ph) * 0.8
    lring.style.transform = `scale(${0.4 + ph * 1.6})`
  })
  sfx("scan", ts, { dur: 1.35, gain: 0.45 })
  for (let i = 0; i < 4; i += 1) sfx("pulse", tz + 0.6 + i * 0.8, { gain: 0.35 - i * 0.04 })
  // Notification de Windows : l'alerte arrive avant les clients.
  const toast = at2(h("div", "abs", `<div style="display:flex;align-items:center;gap:10px;font:500 14px Inter;color:#cfcfcf"><img src="${LOGO}" style="width:20px;height:20px;border-radius:5px">NEXORA · Supervision<span style="margin-left:auto;color:#8a8a8a;font-weight:400">maintenant</span></div><div style="margin-top:12px;font:600 20px Inter;color:#fff">monsite.fr ne répond plus</div><div style="margin-top:6px;font:400 16px Inter;color:#b8b8b8">Erreur 503 · alerte envoyée par e-mail</div>`, { width: px(470), padding: "18px 22px", borderRadius: "10px", background: "rgba(36,36,36,.96)", border: "1px solid rgba(255,255,255,.1)", boxShadow: "0 30px 80px rgba(0,0,0,.65)", backdropFilter: "blur(20px)" }), 1390, 820)
  s.appendChild(toast)
  tick((t) => {
    const k = prog(t, ta, 0.55, E.out5)
    const out = prog(t, X - 0.38, 0.42, E.in3)
    toast.style.opacity = clamp(prog(t, ta, 0.2)) * (1 - out)
    toast.style.transform = `translateX(${(1 - k) * 520 - out * 2400}px)`
  })
  sfx("notif", ta + 0.1, { gain: 0.6, pan: 0.6 })
  spaceLabel(s, { num: "05", tag: "Sécurité", title: "Audité, surveillé|jour et nuit.", t0: T + 0.4, t1: tz - 0.15 })
  sfx("whoosh", X - 0.42, { dur: 0.6, gain: 0.7, pan: -0.5 })
}

// ---------------------------------------------------------------- 15. App Builder et Desktop Builder
{
  const T = C.build
  const X = C.studio
  const tw = at("v14", "windows")
  const S = tw - 0.35 // passage d'Android à Windows
  const s = scene(T - 0.05, X + 0.2)
  const lay = persp(s)
  // Partie Android : l'App Builder et le téléphone qui démarre l'application.
  const apps = nxWin("apps")
  apps.style.transformOrigin = "0 0"
  lay.appendChild(apps)
  const splash = `<div style="position:absolute;inset:0;background:#f3ece1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#1d1a16"><div style="font:700 64px Playfair">kora</div><div style="font:500 15px Inter;letter-spacing:.18em;margin-top:8px;color:#7a6a58">BOULANGERIE AU LEVAIN</div></div><img class="app" src="/site/src/assets/ecrans/kora-pixel.webp" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0">`
  const phone = device("pixel", splash, 720, { html: true })
  phone.style.left = px(1230)
  phone.style.top = px(214)
  s.appendChild(phone)
  const appImg = phone.querySelector(".app")
  const apk = at2(h("div", "abs", `<span class="pill" style="gap:12px;background:#fff;color:#0a0a0a;border-color:#fff">${icon("check")} APK signé, prêt pour le Play Store</span>`), 1120, 950)
  s.appendChild(apk)
  // Partie Windows : le Desktop Builder, l'installateur et l'icône dans la barre des tâches.
  const desk = nxWin("desktop")
  desk.style.transformOrigin = "0 0"
  lay.appendChild(desk)
  const inst = win11({ w: 600, hgt: 360, title: "Installation de Kora", ic: `<span class="w11-ic" style="display:grid;place-items:center;background:#f3ece1;color:#1d1a16;font:700 11px Playfair">k</span>`, light: true, html: `<div style="height:100%;display:flex;flex-direction:column;font:14px Inter;color:#1b1b1b"><div style="display:flex;align-items:center;gap:16px;padding:18px 22px;background:#fff;border-bottom:1px solid #ddd"><div style="flex:1"><b style="display:block;font-size:16px">Installation en cours</b><span class="st1" style="color:#555">Veuillez patienter pendant l’installation de Kora.</span></div><span style="width:48px;height:48px;border-radius:12px;background:#f3ece1;display:grid;place-items:center;font:700 26px Playfair">k</span></div><div style="padding:26px 22px;flex:1"><div class="st2" style="color:#333;margin-bottom:12px">Extraction : Kora.exe</div><div style="height:16px;border:1px solid #bdbdbd;background:#eee;border-radius:3px;overflow:hidden"><i class="pb" style="display:block;height:100%;width:0;background:linear-gradient(180deg,#5aa86b,#2f8a45)"></i></div></div><div style="display:flex;justify-content:flex-end;gap:10px;padding:14px 22px;border-top:1px solid #ddd;background:#f3f3f3"><span style="padding:6px 18px;border:1px solid #c8c8c8;border-radius:4px;color:#9a9a9a">Précédent</span><span class="fin" style="padding:6px 18px;border:1px solid #c8c8c8;border-radius:4px;color:#9a9a9a">Suivant</span><span style="padding:6px 18px;border:1px solid #c8c8c8;border-radius:4px;color:#9a9a9a">Annuler</span></div></div>` })
  inst.style.left = px(1190)
  inst.style.top = px(300)
  s.appendChild(inst)
  const pb = inst.querySelector(".pb")
  const st1 = inst.querySelector(".st1")
  const st2 = inst.querySelector(".st2")
  const fin = inst.querySelector(".fin")
  const bar = h("div", "taskbar", `<div class="tb-apps"></div>`)
  s.appendChild(bar)
  const tbApps = bar.querySelector(".tb-apps")
  const kApp = h("div", "tb-app", `<span style="width:24px;height:24px;border-radius:6px;background:#f3ece1;color:#1d1a16;display:grid;place-items:center;font:700 13px Playfair">k</span><i></i>`)
  for (const g of ["search", "folder", "globe"]) tbApps.appendChild(h("div", "tb-app", `${icon(g)}`, { width: "44px" }))
  const nxApp = h("div", "tb-app", `<img src="${LOGO}">`, { width: "44px" })
  tbApps.append(nxApp, kApp)
  const tDone = X - 1.45
  tick((t) => {
    if (t < T - 0.1 || t > X + 0.25) return
    const k = prog(t, T, 0.62, E.out5)
    const sw = prog(t, S, 0.55, E.inOut5)
    const out = prog(t, X - 0.4, 0.45, E.in3)
    place(apps, { fx: WW / 2, fy: WH / 2, s: 0.6, ry: 12, cx: 620 + (1 - k) * 2400 - sw * 2400, cy: 560 })
    blurOf(apps, (1 - k) * 16 + sw * 16)
    const pk = prog(t, T + 0.35, 0.7, E.spring)
    phone.style.transform = `translate(${(1 - pk) * 500 - sw * 2400}px, 0) rotate(${(1 - pk) * 6}deg)`
    opa(phone, prog(t, T + 0.3, 0.3))
    appImg.style.opacity = prog(t, T + 1.25, 0.35)
    const ak = prog(t, T + 1.6, 0.5, E.spring)
    apk.style.opacity = clamp(prog(t, T + 1.6, 0.2)) * (1 - sw)
    apk.style.transform = `translateY(${(1 - ak) * 30}px) translateX(${-sw * 2400}px)`
    place(desk, { fx: WW / 2, fy: WH / 2, s: 0.6, ry: 12, cx: 620 + (1 - sw) * 2400, cy: 540 - out * 40 })
    blurOf(desk, (1 - sw) * 16 + out * 10)
    opa(desk, 1 - out)
    const ik = prog(t, S + 0.3, 0.6, E.spring)
    inst.style.transform = `translateX(${(1 - ik) * 700}px) scale(${lerp(0.95, 1, ik)})`
    opa(inst, prog(t, S + 0.3, 0.25) * (1 - out))
    const p = prog(t, S + 0.75, tDone - S - 0.75, E.inOut2)
    pb.style.width = `${p * 100}%`
    const done = t >= tDone
    st1.textContent = done ? "Kora est installé sur cet ordinateur." : "Veuillez patienter pendant l’installation de Kora."
    st2.textContent = done ? "Installation terminée." : p > 0.55 ? "Création des raccourcis…" : "Extraction : Kora.exe"
    fin.textContent = done ? "Terminer" : "Suivant"
    fin.style.color = done ? "#fff" : "#9a9a9a"
    fin.style.background = done ? "#0067c0" : "transparent"
    fin.style.borderColor = done ? "#0067c0" : "#c8c8c8"
    const bk = prog(t, S + 0.2, 0.5, E.out5)
    bar.style.transform = `translateY(${(1 - bk) * 60}px)`
    opa(bar, bk * (1 - out))
    const kk = prog(t, tDone + 0.25, 0.45, E.spring)
    kApp.style.width = px(44 * prog(t, tDone + 0.25, 0.3, E.out3))
    kApp.style.opacity = clamp(kk)
    kApp.style.transform = `translateY(${(1 - kk) * 14}px)`
    kApp.querySelector("i").style.width = px(8 * prog(t, tDone + 0.45, 0.3))
  })
  sfx("whoosh", T - 0.05, { dur: 0.5, gain: 0.5, pan: 0.5 })
  sfx("pop", T + 0.35, { gain: 0.5, pan: 0.6 })
  sfx("success", T + 1.62, { gain: 0.5, pan: 0.5 })
  sfx("whoosh", S - 0.05, { dur: 0.6, gain: 0.65, pan: -0.4 })
  sfx("pop", S + 0.3, { gain: 0.5, pan: 0.5 })
  sfx("success", tDone, { gain: 0.5, pan: 0.5 })
  sfx("pop", tDone + 0.25, { gain: 0.4, pan: 0.1 })
  spaceLabel(s, { num: "06", tag: "App Builder", title: "Votre site devient|une application Android.", t0: T + 0.35, t1: S - 0.2 })
  spaceLabel(s, { num: "07", tag: "Desktop Builder", title: "Ou un logiciel Windows|à installer.", t0: S + 0.35, t1: X - 0.45 })
}

// ---------------------------------------------------------------- 16. Studio 3D & Motion : présentation en 3D, vidéos
{
  const T = C.studio
  const X = C.recap
  const s = scene(T - 0.25, X + 0.2)
  s.appendChild(h("div", "spot", null, { left: px(360), top: px(-520), width: px(1300), height: px(1300) }))
  const cv = h("canvas", "gl")
  cv.width = 1920
  cv.height = 1080
  s.appendChild(cv)
  const P = plateau(cv)
  let ok = false
  ready.push(Promise.all([appareil("macbook-pro-14", `${ECR}/kora-bureau.webp`), appareil("iphone-18-pro", "/site/src/assets/ecrans/kora-mobile.webp")]).then(([m, i]) => {
    P.place(m, { x: -11, z: -2, ry: 0.12, shadow: 1.1 })
    P.place(i, { x: 19, z: 9, ry: -0.42, shadow: 1.6 })
    ok = true
  }))
  tick((t) => {
    if (!ok || t < T - 0.3 || t > X + 0.25) return
    const a = track(t, [[T - 0.25, -0.62], [X, 0.22, E.inOutSine]])
    const r = track(t, [[T - 0.25, 138], [X, 118, E.inOutSine]])
    const y = track(t, [[T - 0.25, 36], [X, 24, E.inOutSine]])
    P.look([Math.sin(a) * r, y, Math.cos(a) * r], [4, 9, 2], 26)
    P.render()
    opa(cv, prog(t, T - 0.25, 0.45, E.out2) * (1 - prog(t, X - 0.35, 0.4, E.in2)))
  })
  // Formats des réseaux sociaux et frise de montage : « des vidéos prêtes pour les réseaux ».
  const tv = at("v15", "videos")
  const FR = [["16:9", 1120, 630], ["1:1", 630, 630], ["9:16", 354, 630]]
  FR.forEach(([n, w, hh], i) => {
    const f = h("div", "abs", `<span style="position:absolute;left:0;top:-38px;font:500 20px Urbanist;color:#dcdcdc">${n}</span>`, { left: px(960 - w / 2), top: px(520 - hh / 2), width: px(w), height: px(hh), border: "1.5px solid rgba(255,255,255,.75)", borderRadius: "10px", boxShadow: "0 0 0 2000px rgba(0,0,0,0)" })
    s.appendChild(f)
    tick((t) => {
      const k = prog(t, tv + i * 0.25, 0.4, E.out5)
      f.style.opacity = k * (1 - prog(t, X - 0.5, 0.35)) * (i === 2 ? 1 : 0.55)
      f.style.transform = `scale(${lerp(1.06, 1, k)})`
    })
    sfx("tick", tv + i * 0.25, { gain: 0.4, pan: 0 })
  })
  const tl = at2(h("div", "nxcard abs", `<div style="position:relative;height:100%"><div style="position:absolute;left:24px;right:24px;top:28px;height:4px;border-radius:2px;background:#2a2a2a"></div>${[0.08, 0.3, 0.55, 0.82].map((x) => `<i style="position:absolute;left:calc(24px + ${x} * (100% - 48px));top:22px;width:14px;height:14px;background:#fff;transform:translateX(-7px) rotate(45deg);border-radius:2px"></i>`).join("")}<div class="ph" style="position:absolute;top:10px;width:2px;height:40px;background:#fff;box-shadow:0 0 10px #fff"></div><span style="position:absolute;left:24px;bottom:12px;font:15px Mono;color:#8a8a8a">Caméra · orbite</span><span class="tc" style="position:absolute;right:24px;bottom:12px;font:15px Mono;color:#cfcfcf">00:00</span></div>`, { width: px(760), height: px(96) }), 580, 930)
  s.appendChild(tl)
  const ph = tl.querySelector(".ph")
  const tc = tl.querySelector(".tc")
  tick((t) => {
    const k = prog(t, tv + 0.4, 0.5, E.out5)
    tl.style.opacity = k * (1 - prog(t, X - 0.5, 0.35))
    tl.style.transform = `translateY(${(1 - k) * 30}px)`
    const p = prog(t, tv + 0.4, X - tv - 0.6, E.lin)
    ph.style.left = `calc(24px + ${p} * (100% - 48px))`
    tc.textContent = `00:0${Math.min(9, Math.floor(p * 8))}`
  })
  spaceLabel(s, { num: "08", tag: "Studio 3D & Motion", title: "Présentez-le en 3D,|en vidéo.", t0: T + 0.3, t1: X - 0.5 })
  sfx("whoosh", T - 0.2, { dur: 1.6, gain: 0.35, soft: true })
}

// ================================================================ ACTE 4 : LE PARCOURS ET L'APPEL FINAL
// ---------------------------------------------------------------- 17. Concevoir, coder, tester, sécuriser, publier ; un même projet
{
  const T = C.recap
  const s = scene(T - 0.05, C.end + 0.1)
  const STEPS = [["pen", "Concevoir", "v16"], ["code", "Coder", "v17"], ["display", "Tester", "v18"], ["shield", "Sécuriser", "v19"], ["rocket", "Publier", "v20"]]
  const Y = 470
  const xs = STEPS.map((_, i) => 960 + (i - 2) * 330)
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("width", "1920")
  svg.setAttribute("height", "1080")
  Object.assign(svg.style, { position: "absolute", left: 0, top: 0 })
  const base = document.createElementNS("http://www.w3.org/2000/svg", "path")
  base.setAttribute("d", `M${xs[0]},${Y} L${xs[4]},${Y}`)
  Object.assign(base.style, { stroke: "rgba(255,255,255,.14)", strokeWidth: "2", fill: "none" })
  const lit = base.cloneNode()
  Object.assign(lit.style, { stroke: "#fff", strokeWidth: "2.5" })
  svg.append(base, lit)
  const group = h("div", "layer")
  group.appendChild(svg)
  s.appendChild(group)
  const LEN = xs[4] - xs[0]
  const nodes = STEPS.map(([ic, name, id], i) => {
    const n = h("div", "abs", `<div class="c" style="width:112px;height:112px;border-radius:50%;display:grid;place-items:center;font-size:46px;border:1px solid rgba(255,255,255,.2);background:rgba(16,16,16,.92)">${icon(ic)}</div><div class="n" style="margin-top:26px;font-size:34px;font-weight:400;text-align:center;color:#6f6f6f">${name}</div>`, { left: px(xs[i] - 90), top: px(Y - 56), width: px(180), display: "flex", flexDirection: "column", alignItems: "center" })
    group.appendChild(n)
    n.t = at(id)
    sfx("tick", n.t + 0.05, { gain: 0.5, pan: (i - 2) * 0.3 })
    return n
  })
  const outs = [["globe", "Web"], ["android", "Android"], ["laptop", "Windows"]].map(([ic, name], i) => {
    const o = h("div", "abs", `<span class="pill" style="gap:10px">${icon(ic)} ${name}</span>`, { left: px(xs[4] - 80), top: px(Y + 150 + i * 62) })
    group.appendChild(o)
    o.t = at("v20") + 0.35 + i * 0.12
    return o
  })
  // « Tout se passe dans le même projet » : les étapes se rassemblent dans une seule carte.
  const tp = at("v21")
  const card = h("div", "glass abs", `<div style="display:flex;align-items:center;gap:18px;font-size:30px;font-weight:400">${icon("folderOpen")} Votre projet</div><div style="display:flex;gap:22px;margin-top:30px">${STEPS.map(([ic]) => `<span style="width:84px;height:84px;border-radius:50%;background:#fff;color:#0a0a0a;display:grid;place-items:center;font-size:36px">${icon(ic)}</span>`).join("")}</div>`, { left: px(960 - 330), top: px(Y - 130), width: px(660), padding: "36px 48px", borderRadius: "32px" })
  s.appendChild(card)
  const t17 = h("h2", "title abs", null, { left: 0, right: 0, top: px(Y + 190), textAlign: "center", fontSize: px(64) })
  s.appendChild(t17)
  revealWords(words(t17, "Un seul logiciel,|un même projet."), tp + 0.35, { step: 0.06, out: C.end - 0.45 })
  sfx("whoosh", tp - 0.05, { dur: 0.7, gain: 0.45, soft: true })
  tick((t) => {
    if (t < T - 0.1 || t > C.end + 0.15) return
    const intro = prog(t, T, 0.6, E.out5)
    const gather = prog(t, tp - 0.05, 0.7, E.inOut5)
    group.style.opacity = intro * (1 - gather)
    group.style.transform = `scale(${lerp(0.96, 1, intro) * lerp(1, 0.7, gather)})`
    let lastLit = 0
    nodes.forEach((n, i) => {
      const k = prog(t, n.t - 0.05, 0.45, E.spring)
      const c = n.querySelector(".c")
      const on = t >= n.t - 0.05
      c.style.background = on ? "#fff" : "rgba(16,16,16,.92)"
      c.style.color = on ? "#0a0a0a" : "#d0d0d0"
      c.style.transform = `scale(${on ? lerp(1.18, 1, k) : 1})`
      c.style.boxShadow = on ? `0 0 ${60 * (1 - prog(t, n.t, 0.9))}px rgba(255,255,255,.6)` : "none"
      n.querySelector(".n").style.color = on ? "#f4f4f4" : "#6f6f6f"
      n.style.opacity = prog(t, T + 0.1 + i * 0.06, 0.4)
      if (on) lastLit = i
    })
    const nextT = nodes[Math.min(4, lastLit + 1)].t
    const segK = lastLit >= 4 ? 1 : prog(t, nodes[lastLit].t, nextT - nodes[lastLit].t, E.inOut3)
    const len = t < nodes[0].t ? 0 : ((lastLit + segK) / 4) * LEN
    lit.style.strokeDasharray = `${len} ${LEN}`
    for (const o of outs) {
      const k = prog(t, o.t, 0.5, E.spring)
      o.style.opacity = clamp(prog(t, o.t, 0.2))
      o.style.transform = `translateY(${(1 - k) * 24}px)`
    }
    const ck = prog(t, tp, 0.75, E.spring)
    card.style.opacity = clamp(prog(t, tp, 0.3)) * (1 - prog(t, C.end - 0.35, 0.35, E.in3))
    card.style.transform = `scale(${lerp(0.7, 1, ck) * (1 - prog(t, C.end - 0.35, 0.35, E.in3) * 0.6)})`
  })
  outs.forEach((o) => sfx("pop", o.t, { gain: 0.35, pan: 0.6 }))
}

// ---------------------------------------------------------------- 18. Appel final
{
  const T = C.end
  const s = scene(T - 0.05, DURATION + 1)
  const flash = h("div", "abs", null, { left: px(960 - 800), top: px(300 - 800), width: px(1600), height: px(1600), borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,.35), transparent 60%)" })
  const glow = h("div", "abs", null, { left: px(960 - 300), top: px(300 - 300), width: px(600), height: px(600), borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,.18), transparent 64%)" })
  const logo = h("img", "abs", null, { left: px(960 - 75), top: px(300 - 75), width: px(150), height: px(150) })
  logo.src = LOGO
  const mark = h("div", "abs", null, { left: 0, right: 0, top: px(420), textAlign: "center", fontSize: px(112), fontWeight: 600, letterSpacing: ".3em", paddingLeft: ".3em" })
  mark.innerHTML = [..."NEXORA"].map((c) => `<span class="mk"><span class="mw">${c}</span></span>`).join("")
  const line1 = h("h2", "title abs", null, { left: 0, right: 0, top: px(600), textAlign: "center", fontSize: px(52) })
  const line2 = h("h2", "title abs tone", null, { left: 0, right: 0, top: px(666), textAlign: "center", fontSize: px(52) })
  line1.innerHTML = `<span class="mk"><span class="mw a">Tout pour créer,</span></span> <span class="mk"><span class="mw b">tester</span></span> <span class="mk"><span class="mw c">et publier,</span></span>`
  line2.innerHTML = `<span class="mk"><span class="mw d tone">dans un seul logiciel.</span></span>`
  const cta = h("div", "abs", `<span class="btn">nexoradevs.online<span class="orb">${icon("nxArrowUpRight")}</span></span>`, { left: 0, right: 0, top: px(790), textAlign: "center" })
  const small = h("p", "abs", "Pour Windows 10 et 11 · en français · aussi sur le web", { left: 0, right: 0, top: px(930), margin: 0, textAlign: "center", fontSize: px(24), color: "#7d7d7d" })
  s.append(flash, glow, logo, mark, line1, line2, cta, small)
  revealWords([...mark.querySelectorAll(".mw")], at("v22") + 0.02, { step: 0.06, dur: 0.85 })
  revealWords([line1.querySelector(".a")], at("v22", "tout") - 0.08, { dur: 0.7 })
  revealWords([line1.querySelector(".b")], at("v22", "tester") - 0.08, { dur: 0.7 })
  revealWords([line1.querySelector(".c")], at("v22", "publier") - 0.1, { dur: 0.7 })
  revealWords([line2.querySelector(".d")], at("v22", "logiciel") - 0.1, { dur: 0.8 })
  const ta = at("v23")
  const btn = cta.querySelector(".btn")
  const tClick = at("v23", "adresse") - 0.25
  tick((t) => {
    if (t < T - 0.1) return
    flash.style.opacity = 0.8 * (1 - prog(t, T, 0.9, E.out2))
    flash.style.transform = `scale(${0.5 + prog(t, T, 0.9, E.outExpo) * 0.7})`
    const lk = prog(t, T, 0.8, E.spring)
    logo.style.transform = `scale(${lerp(0.6, 1, lk)})`
    logo.style.opacity = prog(t, T, 0.25)
    blurOf(logo, (1 - prog(t, T, 0.5, E.out3)) * 14)
    glow.style.opacity = prog(t, T, 0.8) * (0.8 + 0.2 * Math.sin(t * 1.6))
    const ck = prog(t, ta - 0.1, 0.6, E.spring)
    cta.style.opacity = clamp(prog(t, ta - 0.1, 0.25))
    cta.style.transform = `translateY(${(1 - ck) * 30}px)`
    const press = t >= tClick - 0.04 && t < tClick + 0.16 ? 0.965 : 1
    btn.style.transform = `scale(${press})`
    btn.style.boxShadow = `0 0 ${70 * clamp(1 - (t - tClick) / 0.9) * (t >= tClick ? 1 : 0)}px rgba(255,255,255,.55)`
  })
  fade(small, ta + 0.45, null, { y: 10 })
  cursor(s, [[ta + 0.3, 1420, 1010], [tClick, 1078, 852, E.inOut3], [tClick + 0.9, 1110, 880, E.inOutSine]], { clicks: [tClick], hide: DURATION - 2.2 })
  sfx("impact", T, { gain: 0.75, small: true })
  sfx("shimmer", T + 0.25, { dur: 2.2, gain: 0.4 })
}

// ---------------------------------------------------------------- Export : durée, positionnement, piste son, prêt
window.DURATION = DURATION
window.seek = seek
window.AUDIO = {
  cues: cues.sort((a, b) => a.t - b.t),
  music: { bpm: 100, t0: T0, tension: [at("v01"), 28.95], build: [at("v03"), at("v04"), at("v05"), at("v06")], riser: [29.35, T0], groove: [C.hero, C.recap], lift: C.secu, recap: ["v16", "v17", "v18", "v19", "v20"].map((id) => at(id)), project: at("v21"), resolve: C.end, end: DURATION },
  voix: N.repliques.map((r) => ({ id: r.id, debut: r.debut, texte: r.texte })),
}
window.__ready = (async () => {
  await Promise.all(["300 40px Urbanist", "600 40px Urbanist", "20px Mono", "400 14px Inter", "700 20px Playfair"].map((f) => document.fonts.load(f)))
  await Promise.all([...document.images].map((im) => im.decode().catch(() => { throw new Error(`image : ${im.src}`) })))
  await Promise.all(ready)
  seek(0)
  return true
})()
