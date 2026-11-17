// NEXORA #129 : moteur de la vidéo de présentation. Chaque image ne dépend que du temps : seek(t) appelle les
// fonctions enregistrées par tick(), qui calculent tous les styles à partir de t (aucune horloge, aucune animation
// CSS en cours) ; le rendu est donc identique à chaque passage et chaque image peut être tirée seule.
// Les bruitages sont posés par sfx() au même endroit que l'image qu'ils accompagnent : la liste (window.AUDIO.cues)
// est lue par scripts/video/audio.mjs, qui fabrique la piste son.

export const ticks = []
export const cues = []
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const lerp = (a, b, k) => a + (b - a) * k

// Courbes d'accélération : jamais de mouvement linéaire (lent au départ et à l'arrivée), ressort léger pour les
// éléments qui se posent (dépassement d'environ 4 %, comme un objet qui a du poids).
export const E = {
  lin: (x) => x,
  out2: (x) => 1 - (1 - x) * (1 - x),
  out3: (x) => 1 - Math.pow(1 - x, 3),
  out5: (x) => 1 - Math.pow(1 - x, 5),
  outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  in2: (x) => x * x,
  in3: (x) => x * x * x,
  inExpo: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
  inOut2: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  inOut3: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  inOut5: (x) => (x < 0.5 ? 16 * Math.pow(x, 5) : 1 - Math.pow(-2 * x + 2, 5) / 2),
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  inOutExpo: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2),
  spring: (x) => (x >= 1 ? 1 : 1 - Math.exp(-8 * x) * Math.cos(8 * x)),
  back: (x) => { const c1 = 1.25; const c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2) },
}

/** Avancement 0 → 1 entre start et start + dur, avec une courbe. */
export const prog = (t, start, dur, ease = E.inOut3) => ease(clamp((t - start) / (dur || 1e-6)))

/** Piste d'images clés : [[t0, v0], [t1, v1, courbe], …] ; valeurs numériques ou tableaux de nombres. */
export function track(t, keys) {
  if (t <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i += 1) {
    const [t1, v1, e = E.inOut3] = keys[i]
    if (t <= t1) {
      const [t0, v0] = keys[i - 1]
      const k = e(clamp((t - t0) / (t1 - t0 || 1e-6)))
      return Array.isArray(v0) ? v0.map((a, j) => lerp(a, v1[j], k)) : lerp(v0, v1, k)
    }
  }
  return keys[keys.length - 1][1]
}

export function tick(fn) {
  ticks.push(fn)
  return fn
}

/** Repère sonore : type de bruitage, instant (secondes) et réglages (durée, volume, panoramique…). */
export function sfx(type, t, o = {}) {
  cues.push({ type, t: Math.round(t * 1000) / 1000, ...o })
}

export function h(tag, cls, html, style) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html != null) e.innerHTML = html
  if (style) Object.assign(e.style, style)
  return e
}

export const STAGE = () => document.getElementById("scenes")

/** Scène : calque affiché seulement entre start et end (les autres ne sont ni dessinés ni calculés). */
export function scene(start, end, parent = STAGE()) {
  const el = h("div", "scene")
  el.t0 = start
  el.t1 = end
  parent.appendChild(el)
  tick((t) => {
    const on = t >= start && t < end
    if (el.__on !== on) {
      el.style.display = on ? "block" : "none"
      el.__on = on
    }
  })
  return el
}

/** Tick limité à une plage (avec une marge) : évite de calculer les scènes cachées. */
export function during(start, end, fn) {
  return tick((t) => {
    if (t >= start - 0.05 && t <= end + 0.05) fn(t)
  })
}

/**
 * Texte découpé en mots masqués : chaque mot monte depuis sous sa ligne (masque), en cascade.
 * « | » sépare la partie blanche de la partie grise (titres en deux tons du site) ; « / » force un retour à la ligne.
 */
export function words(el, text) {
  const [a, b] = text.split("|")
  const make = (t, tone) => t.trim().split(/\s+/).map((w) => (w === "/" ? "<br>" : `<span class="mk"><span class="mw${tone ? " tone" : ""}">${w}</span></span>`)).join(" ")
  el.innerHTML = make(a, false) + (b ? " " + make(b, true) : "")
  return [...el.querySelectorAll(".mw")]
}

/** Apparition (et sortie éventuelle) des mots créés par words(). */
export function revealWords(ws, start, { step = 0.045, dur = 0.75, out = null, outStep = 0.025, outDur = 0.45, blur = true } = {}) {
  ws.forEach((w, i) => {
    const a = start + i * step
    const b = out == null ? null : out + i * outStep
    tick((t) => {
      if (t < a - 0.05 && w.__s === 0) return
      let y = 110
      let o = 0
      let bl = 0
      if (t >= a) {
        const k = prog(t, a, dur, E.out5)
        y = 110 * (1 - k)
        o = clamp(k * 1.6)
        bl = blur ? (1 - k) * 6 : 0
      }
      if (b != null && t >= b) {
        const k = prog(t, b, outDur, E.in3)
        y = -110 * k
        o = 1 - k
      }
      w.style.transform = `translateY(${y}%)`
      w.style.opacity = o
      w.style.filter = bl > 0.05 ? `blur(${bl}px)` : "none"
      w.__s = t < a ? 0 : 1
    })
  })
}

/** Fondu avec léger déplacement, entrée et sortie (instants absolus). */
export function fade(el, a, b, { dur = 0.6, outDur = 0.4, y = 18, x = 0, scale = 1, ease = E.out5 } = {}) {
  tick((t) => {
    let k = prog(t, a, dur, ease)
    if (b != null) k *= 1 - prog(t, b, outDur, E.in3)
    el.style.opacity = k
    const s = scale === 1 ? "" : ` scale(${lerp(scale, 1, k)})`
    el.style.transform = `translate(${(1 - k) * x}px, ${(1 - k) * y}px)${s}`
  })
}

/** Bruit pseudo-aléatoire reproductible (même suite à chaque rendu). */
export function rng(seed = 1) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let x = Math.imul(s ^ (s >>> 15), 1 | s)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

/** Petit tremblement organique (caméra tenue à la main, objets qui « respirent »), continu dans le temps. */
export const drift = (t, f = 0.35, seed = 0) => Math.sin(t * f * 6.283 + seed) * 0.6 + Math.sin(t * f * 2.71 * 6.283 + seed * 1.7) * 0.4

export function seek(t) {
  for (const f of ticks) f(t)
}
