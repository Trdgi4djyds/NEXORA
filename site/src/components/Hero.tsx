import { useEffect, useRef, useState, type CSSProperties } from "react"
import { SPACE_FACTS } from "../data/content"
import { SPACES, SPACE_BY_ID } from "../data/spaces"
import { Icon } from "../lib/icons"
import { CountUp, useInView, usePageVisible, useReducedMotion } from "../lib/motion"
import { DEVICE_COUNT } from "../lib/product"
import { MainButton, SecondButton } from "./Download"
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
 * Hero : trois vraies captures de NEXORA superposées en perspective, cartes de chiffres vérifiés, onglets des
 * espaces. #069 : grille éclairée par le pointeur, parallaxe des écrans et reflet qui suit la souris
 * (`lib/glow.ts`), barre de progression lumineuse sous l'onglet actif.
 * #074 (« Prisme ») : sol en perspective qui défile et halos vert, rose et violet derrière la scène ; écrans qui
 * se déplient à l'arrivée et se redressent au défilement (`data-depth`, `lib/depth.ts`), cartes qui pivotent puis
 * flottent, capture de l'espace qui tourne en 3D au changement d'onglet.
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
  // #072 : sur téléphone, les onglets tiennent sur une rangée qui défile : l'onglet actif y reste visible.
  const tabs = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const list = tabs.current
    const btn = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!list || !btn || list.scrollWidth <= list.clientWidth) return
    list.scrollTo({ left: btn.offsetLeft - (list.clientWidth - btn.offsetWidth) / 2, behavior: reduced ? "auto" : "smooth" })
  }, [index, reduced])
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
      <div className="hero-3d" aria-hidden="true">
        <i className="orb o1" />
        <i className="orb o2" />
        <i className="orb o3" />
        <div className="floor">
          <i />
        </div>
      </div>
      <i className="grid-bg" aria-hidden="true" />
      <i className="grid-lit" aria-hidden="true" />
      <i className="torch" aria-hidden="true" />
      <div className="container hero-copy">
        <a href="#/licence" className="pill rise">
          <i className="pill-dot" />
          NEXORA Devs Toolbox · Responsive Lab et Browser Lab gratuits
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
          Design, code, tests sur {DEVICE_COUNT} modèles d’appareils, sécurité et publication sur le web, Android et Windows, dans une seule application.
        </p>
        <div className="actions rise" style={{ animationDelay: "340ms" }} data-glow>
          <MainButton size="lg" />
          <SecondButton size="lg" />
        </div>
      </div>

      <div className="stage rise" style={{ animationDelay: "420ms" }} data-tilt data-depth data-capture="apercu" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
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
          {/* #072 : icône de l'espace au lieu d'un point « en direct » : ces chiffres sont fixes. */}
          <span className="label" data-space="preview">
            <Icon name={SPACE_BY_ID.preview.icon} size={13} /> Responsive Lab
          </span>
          <b>
            <Fact value={String(DEVICE_COUNT)} delay={900} />
          </b>
          <small>modèles d’appareils à l’écran</small>
        </div>
        <div className={`kpi k2${first.current ? "" : " swap"}`} key={space} data-space={space} aria-hidden="true">
          <span className="label">
            <Icon name={SPACE_BY_ID[space].icon} size={13} /> {SPACE_BY_ID[space].name}
          </span>
          <b>
            <Fact value={SPACE_FACTS[space][0]} delay={first.current ? 900 : 150} />
          </b>
          <small>{SPACE_FACTS[space][1]}</small>
        </div>
        <div className="kpi k3" aria-hidden="true">
          <span className="label" data-space="security">
            <Icon name={SPACE_BY_ID.security.icon} size={13} /> Sécurité
          </span>
          <b>24 h/24</b>
          <small>6 vérifications par les serveurs</small>
        </div>
      </div>

      <div className="container">
        <div className="space-tabs" role="tablist" aria-label="Espaces montrés dans l’aperçu" ref={tabs}>
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
