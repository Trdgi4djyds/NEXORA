// NEXORA #113 : essais du modèle Motion de NEX-DESIGN (nx/designplus/motion-model.js), sur le modèle des essais de
// desigma (presets.rs, clip.rs, easing.rs, track.rs, css_anim.rs) : `pnpm test:motion`.
// `pnpm test:motion --ui` : essai dans l'aperçu (test-motion-ui.mjs) à la place des essais du modèle.
import { spawnSync } from "node:child_process"
import * as M from "../nexora/app/renderer/nx/designplus/motion-model.js"

if (process.argv.includes("--ui")) {
  const ui = spawnSync(process.execPath, [new URL("./test-motion-ui.mjs", import.meta.url).pathname], { stdio: "inherit" })
  process.exit(ui.status ?? 1)
}

let fails = 0
let count = 0
function ok(cond, label, detail = "") {
  count += 1
  if (cond) console.log(`OK   ${label}`)
  else { fails += 1; console.log(`ÉCHEC ${label}${detail ? ` : ${detail}` : ""}`) }
}
const close = (a, b, e = 1e-3) => Math.abs(a - b) < e

// ---------- Courbes ----------
ok(M.EASES.length === 12, "12 courbes toutes faites (maintien, 7 courbes, 4 ressorts)")
ok([...M.EASES.map(([id]) => id), { bezier: [0.2, 0.8, 0.2, 1] }, { spring: 0.5 }].every((e) => M.ease(e, 0) === 0 && M.ease(e, 1) === 1), "chaque courbe vaut exactement 0 au départ et 1 à l’arrivée")
ok(close(M.ease("linear", 0.37), 0.37) && M.ease("hold", 0.99) === 0, "linéaire et maintien")
ok(close(M.cubicBezier([0.42, 0, 0.58, 1], 0.5), 0.5, 1e-4), "Bézier symétrique : 0,5 au milieu")
ok(Math.max(...M.sampleEase("bouncy", 200).map((p) => p[1])) > 1.2, "ressort rebondissant : dépassement de plus de 20 %")
ok(Math.max(...M.sampleEase("slow", 200).map((p) => p[1])) <= 1.0001, "ressort lent (amorti) : aucun dépassement")
ok(M.easeFamily("gentle") === "spring" && M.easeFamily({ bezier: [0, 0, 1, 1] }) === "curve" && M.easeFamily("hold") === "hold", "familles des courbes")
ok(JSON.stringify(M.toCustom("out")) === JSON.stringify({ bezier: [0, 0, 0.58, 1] }) && M.toCustom("quick").spring === 0.42, "préréglage → courbe ou ressort personnalisés de même forme")
ok(M.timingFunction("hold") === "step-end" && M.timingFunction("in") === "cubic-bezier(0.42, 0, 1, 1)" && M.timingFunction("gentle").startsWith("linear(0, "), "fonctions de temps CSS")
ok(JSON.stringify(M.sanitizeEase({ bezier: [2, 0, -1, 1] }).bezier) === "[1,0,0,1]" && M.sanitizeEase({ spring: 5 }).spring === 0.9 && M.sanitizeEase("??") === "linear", "courbes ramenées à des valeurs utilisables")

// ---------- Bibliothèque ----------
const names = (g) => M.presetsIn(g).map((p) => p.id)
ok(M.PRESETS.length === 41, "41 préréglages")
ok(JSON.stringify(names("basic")) === JSON.stringify(["position", "scale", "rotation", "size", "opacity"]), "Base : 5")
ok(names("enter").length === 12 && names("cycle").length === 12 && names("exit").length === 12, "Entrée, Boucle, Sortie : 12 chacun")
ok(new Set(M.PRESETS.map((p) => p.name)).size === 41, "noms français tous différents")
for (const g of ["enter", "cycle", "exit"]) ok(M.presetsIn(g).every((p, i) => p.speed === ["fast", "medium", "slow"][Math.floor(i / 4)]), `${M.GROUPS[g]} : vitesses par groupes de 4`)
const burst = M.instantiate(M.findPreset("burst"), 997, 1)
ok(burst.map((c) => c.kind).join() === "position,scale,rotation,opacity" && burst.every((c) => c.delay === 997 && c.dur === 300) && burst[0].amount === 116 && burst[0].dir === "bottom", "Éclat : 4 clips à la tête de lecture, 300 ms, 116 px depuis le bas")
const neutralOf = (c) => M.neutral(c.kind)
const away = (c, v) => { const n = neutralOf(c); return Math.abs(v.x - n.x) > 1e-3 || Math.abs(v.y - n.y) > 1e-3 }
let enterOk = true; let exitOk = true; let cycleOk = true; let finiteOk = true
for (const p of M.PRESETS) {
  const clips = M.instantiate(p, 0, 1)
  const end = Math.max(...clips.map((c) => M.clipEnd(c, 2000)))
  for (let s = 0; s <= 120; s += 1) for (const c of clips) { const v = M.clipValue(c, (end * s) / 120); if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || Math.abs(v.x) > 1000) finiteOk = false }
  if (p.group === "enter" && (!clips.some((c) => away(c, M.clipValue(c, 0))) || clips.some((c) => away(c, M.clipValue(c, 10000))))) enterOk = false
  if (p.group === "exit" && (clips.some((c) => away(c, M.clipValue(c, 0))) || !clips.some((c) => away(c, M.clipValue(c, 10000))))) exitOk = false
  if (p.group === "cycle") {
    const period = clips[0].yoyo ? clips[0].dur * 2 : clips[0].dur
    for (const c of clips) {
      const a = M.clipValue(c, period * 1.37 + 100); const b = M.clipValue(c, period * 5.37 + 100)
      const wrap = (v) => (c.kind === "rotation" ? ((v % 360) + 360) % 360 : v)
      if (!close(wrap(a.x), wrap(b.x), 1e-2) || !close(a.y, b.y, 1e-2)) cycleOk = false
    }
    if (!clips.every((c) => c.repeat === M.INFINITE)) cycleOk = false
  }
}
ok(finiteOk, "chaque préréglage donne des valeurs finies sur toute sa durée")
ok(enterOk, "entrées : partent d’ailleurs et se posent au repos")
ok(exitOk, "sorties : partent du repos et finissent ailleurs")
ok(cycleOk, "boucles : périodiques et sans fin")

// ---------- Clips ----------
const slide = M.makeClip("position", "in", { dir: "bottom", amount: 116, delay: 997, dur: 300, ease: "linear" })
ok(slide.from && JSON.stringify(M.endpoints(slide)) === JSON.stringify([{ x: 0, y: 116 }, { x: 0, y: 0 }]), "glisse en entrée depuis le bas : départ décalé de 116 px")
ok(M.clipValue(slide, 0).y === 116 && close(M.clipValue(slide, 1147).y, 58) && M.clipValue(slide, 5000).y === 0, "tenu avant le délai, à mi-course au milieu, au repos après")
const cw = M.makeClip("rotation", "in", { dir: "cw", amount: 90 })
ok(M.endpoints(cw)[0].x === -90 && M.endpoints(M.makeClip("rotation", "out", { dir: "ccw", amount: 30 }))[1].x === -30, "rotation dans le sens des aiguilles d’une montre (convention du champ Rotation)")
const yoyo = M.makeClip("opacity", "out", { amount: 0, dur: 100, ease: "linear", repeat: 2, yoyo: true })
ok(close(M.progressAt(yoyo, 150), 0.5) && M.progressAt(yoyo, 500) === 0, "aller-retour : revient au départ après 2 cycles")
ok(M.sanitizeClip({ kind: "nope", repeat: 0, dur: -5 }).kind === "opacity" && M.sanitizeClip({ kind: "scale", repeat: 0, dur: -5 }).dur === 1, "clip ramené à des valeurs utilisables")

// ---------- Pistes et composition ----------
const m = M.emptyMotion()
M.setKey(m, "position", 0, { x: 10, y: 20 }, "linear")
M.setKey(m, "position", 1000, { x: 110, y: 20 }, "hold")
M.setKey(m, "position", 1500, { x: 110, y: 70 })
ok(m.tracks.position.length === 3 && m.tracks.position[2].e === "hold", "nouvelle image clé : reprend la courbe de la précédente")
ok(M.trackValue(m.tracks.position, "vec2", 500).x === 60 && M.trackValue(m.tracks.position, "vec2", 1250).y === 20 && M.trackValue(m.tracks.position, "vec2", 9000).y === 70, "valeurs entre les images clés (linéaire, maintien, après la fin)")
M.setKey(m, "fill", 0, "#ff0000"); M.setKey(m, "fill", 1000, "rgba(0,0,255,1)")
ok(M.trackValue(m.tracks.fill, "color", 500) === "#800080", "couleur interpolée (rouge → bleu)")
M.moveKey(m, "position", 1500, 1000)
ok(m.tracks.position.length === 2 && m.tracks.position[1].v.y === 70, "déplacer une image clé sur une autre la remplace")
M.moveKey(m, "position", 0, 300, true)
ok(m.tracks.position.length === 3, "Alt + glisser : copie l’image clé")
M.removeKey(m, "fill", 0); M.removeKey(m, "fill", 1000)
ok(!("fill" in m.tracks), "piste supprimée avec sa dernière image clé")
const base = { position: { x: 0, y: 0 }, rotation: 15, width: 200, height: 100, opacity: 0.8, scale: { x: 1, y: 1 } }
const mc = M.emptyMotion(); M.applyPreset(mc, "breathe", 0); M.applyPreset(mc, "spin", 0)
const ev = M.evaluate(mc, base, 250)
ok(ev.rotation > 15 && ev.opacity < 0.8 && ev.scale.x > 1, "clips composés : rotation ajoutée, échelle et opacité multipliées")
const ms = M.emptyMotion(); M.applyPreset(ms, "size", 0)
ok(M.evaluate(ms, base, 0).width === 100 && M.evaluate(ms, base, 600).width === 200, "clip de taille : multiplie la taille fixe")
ok(M.keyedValueAt(mc, base, "rotation", 250) === 15 && M.valueAt(mc, base, "rotation", 250) > 15, "valeur de la piste seule (nouvelle image clé) et valeur affichée (clips compris)")
const nm = M.normalizeMotion({ tracks: { position: [{ t: 5, v: { x: 1, y: 2 } }, { t: 5, v: { x: 3, y: 4 } }], bad: [{ t: 0, v: 1 }], opacity: [{ t: 0, v: "x" }] }, clips: [{ kind: "scale", id: 1 }, { kind: "scale", id: 1 }] })
ok(nm.tracks.position.length === 1 && nm.tracks.position[0].v.x === 3 && !nm.tracks.bad && !nm.tracks.opacity && nm.clips[1].id !== nm.clips[0].id, "document relu : doublons, propriétés inconnues et valeurs invalides écartés")
ok(M.motionEnd(mc, 4000) === 4000 && M.motionEnd(m, 4000) === 1000, "fin de l’animation (boucle : fin de la frise)")
ok(M.animatedProps(mc).join() === "scale,rotation,opacity", "propriétés animées dans l’ordre de l’inspecteur")

// ---------- Frise ----------
const tl = M.timeline({ dur: 2, fps: 24, loop: true })
ok(tl.ms === 2000 && tl.fps === 24 && tl.loop && M.frameCount(2000, 24) === 48 && close(M.snapToFrame(30, 24), 41.667, 0.01), "frise : durée, images par seconde, aimantation aux images")
ok(M.playbackTime(2500, 2000, true) === 500 && M.playbackTime(2500, 2000, false) === 2000, "lecture en boucle ou arrêtée à la fin")
ok(M.timeline({}).ms === 4000 && M.timeline({}).fps === 30, "frise par défaut : 4 s à 30 images par seconde (comme avant #113)")

// ---------- Code ----------
const layer = { name: "Carte d’accueil", text: false, base: { position: { x: 10, y: 20 }, rotation: 0, width: 40, height: 40, opacity: 1, scale: { x: 1, y: 1 } }, motion: M.emptyMotion() }
M.setKey(layer.motion, "position", 0, { x: 10, y: 20 }, { bezier: [0.4, 0, 0.2, 1] })
M.setKey(layer.motion, "position", 1000, { x: 110, y: 20 }, "hold")
M.setKey(layer.motion, "position", 1500, { x: 110, y: 70 })
M.setKey(layer.motion, "opacity", 500, 0, { spring: 0.4 }); M.setKey(layer.motion, "opacity", 1000, 1)
M.setKey(layer.motion, "fill", 0, "#ff0000", "linear"); M.setKey(layer.motion, "fill", 2000, "#0000ff")
const css = M.cssAnimation([layer], { ms: 2000, fps: 30, loop: true })
ok(css.includes("@keyframes carte-d-accueil-position {") && css.includes("0% { translate: 0px 0px; animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }") && css.includes("50% { translate: 100px 0px; animation-timing-function: step-end; }"), "CSS : position en translate, courbes par segment", css.slice(0, 300))
ok(css.includes("animation-timing-function: linear(0, ") && css.includes("background-color: #ff0000") && /infinite/.test(css), "CSS : ressort échantillonné, couleur de fond, boucle")
const sw = M.swiftuiAnimation([layer], { ms: 2000, fps: 30, loop: false })
ok(sw.includes("struct CarteDAccueilAnimation {") && sw.includes("SpringKeyframe(1, duration: 0.5, spring: Spring(duration: 0.5, bounce: 0.4))") && sw.includes(".offset(x: v.x, y: v.y)") && sw.includes("// non généré : remplissage"), "SwiftUI : keyframeAnimator, ressort, propriétés non gérées signalées")
const kt = M.composeAnimation([layer], { ms: 2000, fps: 30, loop: true })
ok(kt.includes("rememberInfiniteTransition") && kt.includes("CubicBezierEasing(0.4f, 0f, 0.2f, 1f)") && kt.includes("translationX = carteDAccueilX.dp.toPx()"), "Compose : keyframes, courbe de Bézier, graphicsLayer")
const baked = { ...layer, motion: M.emptyMotion() }; M.applyPreset(baked.motion, "rise", 0)
ok(M.cssAnimation([baked], { ms: 1000, fps: 30, loop: false }).split("\n").filter((l) => l.includes("translate:")).length > 20, "CSS : clip d’un préréglage échantillonné en images clés")

console.log(`\n${count} vérifications, ${fails ? `${fails} échec${fails > 1 ? "s" : ""}` : "aucun échec"}.`)
process.exit(fails ? 1 : 0)
