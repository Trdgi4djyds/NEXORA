import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react"
import { SPACES, SPACE_BY_ID, type SpaceId } from "../data/spaces"
import { Icon } from "../lib/icons"
import { useInView, usePageVisible, useReducedMotion } from "../lib/motion"
import { APP_VERSION, DEVICE_COUNT } from "../lib/product"
import { SCENES } from "../scenes"
import { AppWindow, WIN_H, WIN_W } from "./AppWindow"
import { DownloadButton, WebButton } from "./Download"
import { Stage } from "./Stage"

// Le curseur part vers l'espace suivant un peu avant le changement (trajet, puis clic).
const LEAD = 950
const TICK = 100

// Ce que devient le site, mot qui défile dans le chapeau (couleur de l'espace concerné).
const BECOMES: [string, SpaceId][] = [
  ["une app Android", "android"],
  ["un logiciel Windows", "desktop"],
  [`une page testée sur ${DEVICE_COUNT} appareils`, "preview"],
  ["une vidéo 3D", "studio"],
  ["un projet surveillé 24 h/24", "security"],
]

// Résultat montré à côté de la fenêtre pour chaque espace (gauche, droite).
const CHIPS: Record<SpaceId, [[string, string], [string, string]]> = {
  home: [["folder", "Projet Kora ouvert"], ["cloud", "Réglages synchronisés"]],
  preview: [["phone", `${DEVICE_COUNT} appareils réels`], ["camera", "Photos et vidéos HD"]],
  browser: [["bolt", "Page chargée en 0,62 s"], ["audit", "Performance 98 / 100"]],
  dev: [["terminal", "Serveur prêt en 412 ms"], ["refreshCw", "Enregistré dans Git"]],
  android: [["android", "kora-1.0.0.apk · 4,8 Mo"], ["nxCheckCircle", "Prêt pour le Play Store"]],
  studio: [["video", "Orbite complète"], ["film", "Vidéo 9:16 prête"]],
  design: [["nxAccess", "Contraste AA et AAA"], ["chat", "Validé par le client"]],
  security: [["shield", "Note de fiabilité 92 / 100"], ["nxiPulse", "Disponibilité 99,98 %"]],
  desktop: [["download", "Installateur, portable, MSI"], ["sync", "Mises à jour automatiques"]],
}

// Tuiles des espaces qui flottent autour du titre (position, taille, profondeur pour le pointeur).
const FLOAT: { id: SpaceId; side: "left" | "right"; x: number; y: number; s: number; r: number; z: number }[] = [
  { id: "preview", side: "left", x: 2, y: 6, s: 72, r: -8, z: 18 },
  { id: "dev", side: "left", x: 9, y: 33, s: 58, r: 6, z: 10 },
  { id: "android", side: "left", x: 1, y: 58, s: 66, r: -4, z: 14 },
  { id: "studio", side: "left", x: 10, y: 82, s: 54, r: 10, z: 8 },
  { id: "desktop", side: "right", x: 2, y: 8, s: 70, r: 7, z: 16 },
  { id: "design", side: "right", x: 10, y: 35, s: 56, r: -6, z: 9 },
  { id: "security", side: "right", x: 1, y: 60, s: 64, r: 5, z: 13 },
  { id: "browser", side: "right", x: 9, y: 84, s: 52, r: -9, z: 7 },
]

/** Mot du chapeau qui change toutes les 2,4 s, en glissant vers le haut. */
function Becomes({ active }: { active: boolean }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setI((n) => (n + 1) % BECOMES.length), 2400)
    return () => window.clearInterval(id)
  }, [active])
  const [word, space] = BECOMES[i]
  return (
    <span className="becomes" data-space={space} aria-live="polite">
      <span key={i} className="becomes-word">
        {word}
      </span>
    </span>
  )
}

export function Hero() {
  const order = SPACES.map((s) => s.id)
  const reduced = useReducedMotion()
  const page = usePageVisible()
  const section = useRef<HTMLElement>(null)
  const show = useRef<HTMLDivElement>(null)
  const visible = useInView(section, { margin: "-80px 0px" })
  const [index, setIndex] = useState(0)
  const [cycle, setCycle] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [hover, setHover] = useState(false)
  const space = order[index]
  const duration = SCENES[space].duration + LEAD
  const playing = !reduced && visible && page && !hover

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => setElapsed((e) => e + TICK), TICK)
    return () => window.clearInterval(id)
  }, [playing])

  useEffect(() => {
    if (elapsed < duration) return
    setIndex((i) => (i + 1) % order.length)
    setCycle((c) => c + 1)
    setElapsed(0)
  }, [elapsed, duration, order.length])

  // Fenêtre inclinée en 3D qui se redresse quand on fait défiler la page (variables CSS, sans rendu React).
  useEffect(() => {
    const el = show.current
    if (!el || reduced) return
    let raf = 0
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const p = Math.min(1, Math.max(0, (window.innerHeight - r.top) / (window.innerHeight * 0.75)))
      el.style.setProperty("--tilt", `${(1 - p) * 18}deg`)
      el.style.setProperty("--lift", `${0.92 + p * 0.08}`)
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", on, { passive: true })
    window.addEventListener("resize", on)
    return () => {
      window.removeEventListener("scroll", on)
      window.removeEventListener("resize", on)
      cancelAnimationFrame(raf)
    }
  }, [reduced])

  // Les tuiles flottantes suivent légèrement le pointeur.
  const onPointer = (e: RPointerEvent<HTMLElement>) => {
    if (reduced || e.pointerType !== "mouse") return
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty("--mx", `${((e.clientX - r.left) / r.width - 0.5) * 2}`)
    e.currentTarget.style.setProperty("--my", `${((e.clientY - r.top) / r.height - 0.5) * 2}`)
  }

  const select = (i: number) => {
    setIndex(i)
    setCycle((c) => c + 1)
    setElapsed(0)
  }
  const next = !reduced && elapsed >= duration - LEAD ? order[(index + 1) % order.length] : null
  const [left, right] = CHIPS[space]

  return (
    <section className="hero" ref={section} onPointerMove={onPointer}>
      <div className="hero-bg dots" aria-hidden="true" />
      <div className="container hero-copy">
        <div className="hero-float" aria-hidden="true">
          {FLOAT.map((f, i) => (
            <span
              key={f.id}
              className="hf"
              data-space={f.id}
              style={
                {
                  [f.side]: `${f.x}%`,
                  top: `${f.y}%`,
                  width: f.s,
                  height: f.s,
                  "--r": `${f.r}deg`,
                  "--z": f.z,
                  "--i": i,
                } as CSSProperties
              }
            >
              <Icon name={SPACE_BY_ID[f.id].icon} size={Math.round(f.s * 0.42)} stroke={1.7} />
            </span>
          ))}
        </div>
        <a href="#/nouveautes" className="hero-badge rise" style={{ animationDelay: "40ms" }}>
          <span className="hero-badge-tag">Nouveau</span>
          NEXORA {APP_VERSION} : Dev Lab gratuit et IA sans limite
          <Icon name="nxArrowRight" size={14} stroke={2.2} />
        </a>
        <h1 className="h-display hero-title">
          <span className="rise" style={{ animationDelay: "120ms" }}>
            Conçois, code, publie.
          </span>
          <span className="rise tone-brand" style={{ animationDelay: "240ms" }}>
            Tout dans{" "}
            <span className="mark">
              NEXORA.
              <svg viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true">
                <path d="M4 16 C 60 6, 140 4, 296 12" pathLength={1} />
              </svg>
            </span>
          </span>
        </h1>
        <p className="lead hero-lead rise" style={{ animationDelay: "360ms" }}>
          L’atelier tout-en-un pour Windows qui fait de ton site
          <br />
          <Becomes active={!reduced && page} />
        </p>
        <div className="btn-stack center rise" style={{ animationDelay: "460ms" }}>
          <DownloadButton size="lg" />
          <WebButton size="lg" />
        </div>
        <ul className="hero-trust rise" style={{ animationDelay: "560ms" }}>
          {["Gratuit pour commencer", "Interface en français", "Windows 10 et 11"].map((t) => (
            <li key={t}>
              <Icon name="check" size={15} stroke={2.4} />
              {t}
            </li>
          ))}
        </ul>
      </div>

      <div className="container wide hero-show-wrap rise" style={{ animationDelay: "380ms" }} data-capture="apercu">
        <div className="hero-tilt" ref={show}>
          <div className="hero-show" data-space={space} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            <Stage width={WIN_W} height={WIN_H} className="win-stage" label={`Aperçu animé de l’interface de NEXORA : ${SPACE_BY_ID[space].name}`}>
              {() => <AppWindow space={space} cycle={cycle} pointer={!reduced} next={next} />}
            </Stage>
          </div>
          <span className="hero-chip left" data-space={space} key={`l-${space}-${cycle}`} aria-hidden="true">
            <span className="sp-ic sm solid">
              <Icon name={left[0]} size={15} />
            </span>
            {left[1]}
          </span>
          <span className="hero-chip right" data-space={space} key={`r-${space}-${cycle}`} aria-hidden="true">
            <span className="sp-ic sm">
              <Icon name={right[0]} size={15} />
            </span>
            {right[1]}
          </span>
        </div>
        <div className="hero-tabs" aria-label="Espaces présentés dans l’aperçu">
          {order.map((id, i) => {
            const s = SPACE_BY_ID[id]
            const on = i === index
            return (
              <button type="button" key={id} className={`hero-tab${on ? " on" : ""}`} data-space={id} aria-pressed={on} onClick={() => select(i)}>
                <span className={`sp-ic sm${on ? " solid" : ""}`}>
                  <Icon name={s.icon} size={15} />
                </span>
                <span>{s.rail}</span>
                <i className="hero-tab-bar">
                  <i style={{ transform: `scaleX(${on ? Math.min(1, elapsed / duration) : 0})` }} />
                </i>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
