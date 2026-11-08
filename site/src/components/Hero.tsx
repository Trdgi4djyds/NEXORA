import { useEffect, useRef, useState, type CSSProperties } from "react"
import { SPACE_FACTS } from "../data/content"
import { SPACES, SPACE_BY_ID } from "../data/spaces"
import { Icon } from "../lib/icons"
import { CountUp, useInView, usePageVisible, useReducedMotion } from "../lib/motion"
import { APP_VERSION, DEVICE_COUNT } from "../lib/product"
import { DownloadButton, WebButton } from "./Download"
import { Screen, Screens } from "./Screen"

const PERIOD = 5000

/**
 * Chiffre d'une carte flottante : défile quand c'est un nombre (181, 15…), sinon affiché tel quel (APK · AAB).
 * Démarre au montage (`delay`) : la carte est toujours à l'écran, juste après l'entrée de la scène.
 */
function Fact({ value, delay }: { value: string; delay: number }) {
  return /^\d+$/.test(value) ? <CountUp value={Number(value)} duration={1100} delay={delay} /> : <>{value}</>
}

/**
 * Hero « Nocturne » : trois vraies captures de NEXORA superposées en perspective, cartes de chiffres vérifiés,
 * onglets des espaces. #069 : grille éclairée par le pointeur, parallaxe des écrans et reflet qui suit la souris
 * (`lib/glow.ts`), barre de progression lumineuse sous l'onglet actif.
 */
export function Hero() {
  const order = SPACES.map((s) => s.id).filter((id) => id !== "home")
  const reduced = useReducedMotion()
  const page = usePageVisible()
  const ref = useRef<HTMLElement>(null)
  const visible = useInView(ref, { margin: "-80px 0px" })
  const [index, setIndex] = useState(order.indexOf("dev"))
  const [hover, setHover] = useState(false)
  const playing = !reduced && visible && page && !hover
  const space = order[index]
  // Premier affichage : les chiffres attendent l'entrée de la scène ; ensuite, ils défilent dès le changement.
  const first = useRef(true)
  useEffect(() => {
    const id = window.setTimeout(() => (first.current = false), 1200)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    if (!playing) return
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % order.length), PERIOD)
    return () => window.clearTimeout(id)
  }, [playing, index, order.length])

  return (
    <section className="hero" ref={ref} data-light>
      <i className="grid-bg" aria-hidden="true" />
      <i className="grid-lit" aria-hidden="true" />
      <i className="torch" aria-hidden="true" />
      <div className="container hero-copy">
        <a href="#/nouveautes" className="pill rise">
          <i className="pill-dot" />
          NEXORA {APP_VERSION} · Dev Lab gratuit, IA sans limite
          <Icon name="nxArrowRight" size={13} stroke={2.2} />
        </a>
        <h1 className="display">
          <span className="line rise" style={{ animationDelay: "90ms" }}>
            L’atelier complet du web,
          </span>
          <span className="line dim rise" style={{ animationDelay: "180ms" }}>
            installé sur ton PC.
          </span>
        </h1>
        <p className="lead rise" style={{ animationDelay: "260ms" }}>
          Design, code, tests sur {DEVICE_COUNT} appareils, sécurité et publication sur le web, Android et Windows, dans une seule application.
        </p>
        <div className="actions rise" style={{ animationDelay: "340ms" }} data-glow>
          <DownloadButton size="lg" />
          <WebButton size="lg" />
        </div>
      </div>

      <div className="stage rise" style={{ animationDelay: "420ms" }} data-tilt data-capture="apercu" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <div className="scr s-back">
          <Screen space="security" eager />
        </div>
        <div className="scr s-right">
          <Screen space="preview" eager />
        </div>
        <div className="scr s-front">
          <Screens spaces={order} current={space} eager />
          <i className="glare" aria-hidden="true" />
        </div>
        <div className="kpi k1" aria-hidden="true">
          <span className="label">
            <i className="live" /> Responsive Lab
          </span>
          <b>
            <Fact value={String(DEVICE_COUNT)} delay={900} />
          </b>
          <small>appareils réels à l’écran</small>
        </div>
        <div className="kpi k2" key={space} data-space={space} aria-hidden="true">
          <span className="label">
            <Icon name={SPACE_BY_ID[space].icon} size={13} /> {SPACE_BY_ID[space].name}
          </span>
          <b>
            <Fact value={SPACE_FACTS[space][0]} delay={first.current ? 900 : 150} />
          </b>
          <small>{SPACE_FACTS[space][1]}</small>
        </div>
        <div className="kpi k3" aria-hidden="true">
          <span className="label">
            <i className="live" /> Sécurité
          </span>
          <b>24 h/24</b>
          <small>7 types de vérification</small>
        </div>
      </div>

      <div className="container">
        <div className="space-tabs" role="tablist" aria-label="Espaces montrés dans l’aperçu">
          {order.map((id, i) => (
            <button key={id} type="button" role="tab" aria-selected={i === index} className={i === index ? "on" : ""} data-space={id} onClick={() => setIndex(i)}>
              <Icon name={SPACE_BY_ID[id].icon} size={15} />
              {SPACE_BY_ID[id].rail}
              {i === index && <i key={index} className={`tab-bar${playing ? " run" : ""}`} style={{ "--t": `${PERIOD}ms` } as CSSProperties} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
