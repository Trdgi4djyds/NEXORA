import { useEffect, useRef, useState, type CSSProperties } from "react"
import { SPACE_FACTS } from "../data/content"
import { SPACES, SPACE_BY_ID } from "../data/spaces"
import { Icon } from "../lib/icons"
import { CountUp, useInView, usePageVisible, useReducedMotion } from "../lib/motion"
import { APP_VERSION, DEVICE_COUNT } from "../lib/product"
import { cn } from "../lib/utils"
import { Backdrop } from "./Backdrop"
import { MainButton, SecondButton } from "./Download"
import { Device, Screens, Window } from "./Screen"
import { Badge } from "./ui/badge"

const PERIOD = 5000

/** Chiffre d'une pastille : défile quand c'est un nombre (181, 15…), sinon affiché tel quel (APK · AAB). */
function Fact({ value, delay }: { value: string; delay: number }) {
  return /^\d+$/.test(value) ? <CountUp value={Number(value)} duration={1100} delay={delay} /> : <>{value}</>
}

/**
 * Hero (#086) : décor technique (halos qui dérivent, circuit parcouru d'impulsions, lignes de code estompées), titre
 * mot à mot. Scène de face : la vraie fenêtre de NEXORA (captures des espaces au fil des onglets) et, devant, un iPad Pro
 * et un iPhone 17 Pro photoréalistes qui affichent ce site. Profondeur par l'échelle, l'ombre et la parallaxe (pointeur
 * et défilement), jamais par une rotation.
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
  // Sur téléphone, les onglets tiennent sur une rangée qui défile : l'onglet actif y reste visible.
  const tabs = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const list = tabs.current
    const btn = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!list || !btn || list.scrollWidth <= list.clientWidth) return
    list.scrollTo({ left: btn.offsetLeft - (list.clientWidth - btn.offsetWidth) / 2, behavior: reduced ? "auto" : "smooth" })
  }, [index, reduced])
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

  const words = (text: string, from: number) =>
    text.split(" ").map((w, i, a) => (
      <span key={i}>
        <span className="w" style={{ "--wi": from + i } as CSSProperties}>
          <span>{w}</span>
        </span>
        {i < a.length - 1 ? " " : ""}
      </span>
    ))

  return (
    <section className="hero" ref={ref} data-light>
      <Backdrop variant="hero" />

      <div className="wrap relative text-center">
        <a href="#/licence" className="rise group inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.03] py-1 pr-3.5 pl-1 text-[13px] text-foreground backdrop-blur transition hover:border-primary/50">
          <Badge variant="solid">Nouveau</Badge>
          {/* #087 : version courte sur téléphone (la pastille passait sur trois lignes). */}
          <span className="text-muted-foreground sm:hidden">NEXORA Devs Toolbox · 2 applications gratuites</span>
          <span className="hidden text-muted-foreground sm:inline">NEXORA Devs Toolbox · Responsive Lab, Browser Lab et 2 applications gratuits</span>
          <Icon name="nxArrowRight" size={13} stroke={2.2} className="text-primary transition-transform group-hover:translate-x-0.5" />
        </a>
        <h1 className="title-xl words go mx-auto mt-7 max-w-[16ch]">
          {words("L’atelier complet du web,", 0)} <span className="tone-neon">{words("installé sur ton PC.", 4)}</span>
        </h1>
        <p className="lead rise mx-auto mt-6 max-w-[620px]" style={{ animationDelay: "380ms" }}>
          Design, code, tests sur {DEVICE_COUNT} modèles d’appareils, sécurité et publication sur le web, Android et Windows, dans une seule application.
        </p>
        <div className="rise mt-9 flex flex-wrap justify-center gap-3" style={{ animationDelay: "480ms" }}>
          <MainButton size="lg" />
          <SecondButton size="lg" />
        </div>
        <p className="rise mt-6 inline-flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12.5px] text-muted-foreground" style={{ animationDelay: "560ms" }}>
          <span className="inline-flex items-center gap-2">
            <i className="dot live" /> Version {APP_VERSION}
          </span>
          <span>Windows 10 et 11</span>
          <span>Licence gratuite, sans limite de durée</span>
        </p>
      </div>

      <div
        className="hero-visual rise wrap mt-20 max-w-[1120px] md:mt-24"
        style={{ animationDelay: "650ms" }}
        data-tilt
        data-depth
        data-capture="apercu"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <i className="halo inset-x-[10%] top-[8%] bottom-[10%] opacity-[0.12]" aria-hidden="true" />
        <div className="par relative mx-auto w-full md:w-[84%]" style={{ "--k": "4px", "--ky": "-10px" } as CSSProperties}>
          <Window title={`NEXORA — ${SPACE_BY_ID[space].name}`}>
            <Screens spaces={order} current={space} eager />
          </Window>
        </div>
        <div className="par absolute bottom-[-7%] left-[1%] hidden w-[23%] md:block" style={{ "--k": "10px", "--ky": "-34px" } as CSSProperties}>
          <div className="float f2">
            <Device kind="ipad" eager />
          </div>
        </div>
        <div className="par absolute right-[3%] bottom-[-9%] w-[22%] md:right-[1%] md:w-[13%]" style={{ "--k": "14px", "--ky": "-50px" } as CSSProperties}>
          <div className="float">
            <Device kind="iphone" eager />
          </div>
        </div>
        {/* #087 : pastilles hors de la fenêtre (aucun chevauchement) : à gauche dans la marge, à droite au-dessus. */}
        <div className="par absolute top-[16%] left-[-10%] hidden lg:block" style={{ "--k": "18px", "--ky": "-24px" } as CSSProperties} aria-hidden="true">
          <div className="chip-glass float f3">
            <span className="sp-ic sm">
              <Icon name={SPACE_BY_ID.preview.icon} size={15} />
            </span>
            <span className="text-left leading-tight">
              <b className="block text-[18px] font-semibold text-primary">
                <Fact value={String(DEVICE_COUNT)} delay={900} />
              </b>
              <small className="text-[11.5px] text-muted-foreground">modèles d’appareils</small>
            </span>
          </div>
        </div>
        <div className="par absolute top-[-13%] right-[2%] hidden md:block" style={{ "--k": "16px", "--ky": "-20px" } as CSSProperties} aria-hidden="true">
          <div key={space} className={cn("chip-glass", first.current ? "" : "kpi-swap")}>
            <span className="sp-ic sm">
              <Icon name={SPACE_BY_ID[space].icon} size={15} />
            </span>
            <span className="text-left leading-tight">
              <b className="block text-[18px] font-semibold text-primary">
                <Fact value={SPACE_FACTS[space][0]} delay={first.current ? 900 : 150} />
              </b>
              <small className="text-[11.5px] text-muted-foreground">{SPACE_FACTS[space][1]}</small>
            </span>
          </div>
        </div>
      </div>

      <div className="wrap relative mt-28 md:mt-32">
        <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] md:flex-wrap md:justify-center" role="tablist" aria-label="Espaces montrés dans l’aperçu" ref={tabs}>
          {order.map((id, i) => {
            const on = i === index
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                className={cn(
                  "relative inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-[13.5px] font-medium transition-all",
                  on ? "border-primary bg-primary text-primary-foreground shadow-[0_0_24px_rgb(var(--neon)/0.35)]" : "border-white/10 bg-white/[0.02] text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
                onClick={() => setIndex(i)}
              >
                <Icon name={SPACE_BY_ID[id].icon} size={15} />
                {SPACE_BY_ID[id].rail}
                {on && <i key={index} className={cn("tab-bar", playing && "run")} style={{ "--t": `${PERIOD}ms` } as CSSProperties} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
