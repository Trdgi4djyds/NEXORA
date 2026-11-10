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
 * Hero. #092 (« Signal ») : titre en grotesque serrée très grande, chiffres clés à droite, puis la vraie fenêtre de NEXORA
 * posée sur un bandeau à la couleur de l'espace montré (la couleur change avec l'onglet, data-space), nom et fait vérifié
 * de l'espace dans le bandeau, iPhone qui affiche ce site. Appareils toujours de face (#086), parallaxe légère.
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

  // Chiffres vérifiés : catalogue des appareils, espaces du rail, plateformes de publication (web, Android, Windows).
  const keys: [number, string][] = [
    [DEVICE_COUNT, "modèles d’appareils"],
    [SPACES.length, "espaces dans une application"],
    [3, "plateformes : web, Android, Windows"],
  ]

  return (
    <section className="hero" ref={ref} data-light>
      <Backdrop variant="hero" />

      <div className="wrap-wide relative">
        <a href="/licence" className="rise group inline-flex items-center gap-2.5 rounded-full border border-foreground/12 bg-foreground/[0.04] py-1 pr-3.5 pl-1 text-[13px] text-foreground transition hover:border-primary/60">
          <Badge variant="solid">Nouveau</Badge>
          {/* #087 : version courte sur téléphone (la pastille passait sur trois lignes). */}
          <span className="text-muted-foreground sm:hidden">NEXORA Devs Toolbox · 2 applications gratuites</span>
          <span className="hidden text-muted-foreground sm:inline">NEXORA Devs Toolbox · Responsive Lab, Browser Lab et 2 applications gratuits</span>
          <Icon name="nxArrowRight" size={13} stroke={2.2} className="text-primary transition-transform group-hover:translate-x-0.5" />
        </a>
        {/* Trois lignes tenues sur ordinateur (« PC. » restait seul), retour à la ligne naturel sur téléphone. */}
        <h1 className="title-xl words go mt-8">
          {words("L’atelier complet", 0)} <br className="hidden md:block" />
          {words("du web,", 2)} <span className="tone-neon">{words("installé", 4)}</span> <br className="hidden md:block" />
          <span className="tone-neon">{words("sur ton PC.", 5)}</span>
        </h1>
        <div className="mt-10 grid items-end gap-10 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
          <div className="rise" style={{ animationDelay: "380ms" }}>
            <p className="lead max-w-[560px]">
              Design, code, tests sur {DEVICE_COUNT} modèles d’appareils, sécurité et publication sur le web, Android et Windows, dans une seule application.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <MainButton size="lg" />
              <SecondButton size="lg" />
            </div>
            <p className="mt-6 inline-flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[12px] text-muted-foreground uppercase">
              <span className="inline-flex items-center gap-2">
                <i className="dot live" /> Version {APP_VERSION}
              </span>
              <span>Windows 10 et 11</span>
              <span>Licence gratuite, sans limite de durée</span>
            </p>
          </div>
          <dl className="rise grid grid-cols-3 gap-0 border-t border-foreground/12 lg:w-[520px]" style={{ animationDelay: "480ms" }}>
            {keys.map(([value, label], i) => (
              <div key={label} className={cn("pt-5 pr-4", i > 0 && "border-l border-foreground/12 pl-4 sm:pl-6")}>
                <dt className="sr-only">{label}</dt>
                <dd>
                  <b className="display block text-[clamp(34px,4.4vw,60px)] leading-none font-bold tracking-[-0.05em] tabular-nums">
                    <CountUp value={value} duration={1100} delay={700 + i * 120} />
                  </b>
                  <span className="mt-2 block text-[13px] leading-snug text-muted-foreground">{label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div
        className="hero-visual rise wrap-wide mt-16 md:mt-24"
        style={{ animationDelay: "650ms" }}
        data-tilt
        data-depth
        data-capture="apercu"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <div className="stage relative" data-space={space}>
          <i className="stage-band" aria-hidden="true" />
          <div className="relative grid items-end gap-8 lg:grid-cols-[minmax(0,0.3fr)_minmax(0,0.7fr)]">
            <div key={space} className={cn("stage-copy order-2 px-6 pb-8 lg:order-1 lg:px-10 lg:pb-12", first.current ? "" : "kpi-swap")} aria-live="polite">
              <span className="sp-ic solid">
                <Icon name={SPACE_BY_ID[space].icon} size={19} />
              </span>
              <b className="display mt-5 block text-[clamp(34px,3.6vw,56px)] leading-[0.92] font-bold tracking-[-0.04em]">{SPACE_BY_ID[space].name}</b>
              <span className="mt-3 block max-w-[30ch] text-[15px] leading-snug opacity-85">{SPACE_BY_ID[space].card}</span>
              <span className="pill mt-6">
                <b>
                  <Fact value={SPACE_FACTS[space][0]} delay={first.current ? 900 : 150} />
                </b>
                {SPACE_FACTS[space][1]}
              </span>
            </div>
            <div className="order-1 px-3 pt-0 sm:px-6 lg:order-2 lg:pr-10 lg:pl-0">
              <div className="par relative" style={{ "--k": "4px", "--ky": "-10px" } as CSSProperties}>
                <Window title={`NEXORA — ${SPACE_BY_ID[space].name}`}>
                  <Screens spaces={order} current={space} eager />
                </Window>
              </div>
            </div>
          </div>
          {/* #094 : téléphone immobile (ni flottement ni parallaxe). */}
          <div className="absolute right-[2%] bottom-[-6%] hidden w-[11%] md:block">
            <Device kind="iphone" eager />
          </div>
        </div>
      </div>

      <div className="wrap-wide relative mt-14 md:mt-16">
        <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] md:flex-wrap md:justify-center" role="tablist" aria-label="Espaces montrés dans l’aperçu" ref={tabs}>
          {order.map((id, i) => {
            const on = i === index
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                data-space={id}
                className={cn(
                  "relative inline-flex h-10 shrink-0 items-center gap-2 overflow-hidden rounded-full border px-4 text-[13.5px] font-medium transition-all",
                  on ? "border-transparent bg-u text-u-ink" : "border-foreground/12 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
                onClick={() => setIndex(i)}
              >
                <i className={cn("size-2 rounded-full", on ? "bg-u-ink" : "bg-u")} aria-hidden="true" />
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
