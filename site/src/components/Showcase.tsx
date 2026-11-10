import { useEffect, useRef, useState } from "react"
import { SPACE_FACTS } from "../data/content"
import { SPACES, spaceHref } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal, useInView, usePageVisible, useReducedMotion } from "../lib/motion"
import { GlassTile } from "./Neon"
import { Screens } from "./Screen"
import { Words } from "./SectionHead"

const PERIOD = 6000

/**
 * #099 (« Horizon ») : vitrine des espaces, reprise du carrousel de la référence (« new showcase ») : texte à gauche,
 * à droite une carte sombre posée sur une feuille blanche inclinée, avec la vraie capture de l'espace, son nom et
 * un rond blanc qui ouvre sa page ; flèches précédent et suivant, défilement seul toutes les 6 s quand la section est
 * visible (arrêté au survol, page cachée ou « Réduire les animations »).
 */
export function Showcase() {
  const order = SPACES
  const [index, setIndex] = useState(order.findIndex((s) => s.id === "preview"))
  const [hover, setHover] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const visible = useInView(ref, { margin: "-120px 0px" })
  const page = usePageVisible()
  const reduced = useReducedMotion()
  const playing = visible && page && !reduced && !hover
  useEffect(() => {
    if (!playing) return
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % order.length), PERIOD)
    return () => window.clearTimeout(id)
  }, [playing, index, order.length])

  const go = (step: number) => setIndex((i) => (i + step + order.length) % order.length)
  const s = order[index]
  const [value, caption] = SPACE_FACTS[s.id]
  return (
    <section className="section" ref={ref} id="vitrine" data-capture="vitrine">
      <div className="wrap-wide grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-20">
        <div className="flex h-full flex-col">
          <Reveal>
            <span className="eyebrow">9 espaces, 1 application</span>
            <h2 className="title-2 words mt-6 max-w-[16ch]">
              <Words text="Un projet ouvert," /> <span className="tone"><Words text="neuf espaces qui s’alignent dessus." from={3} /></span>
            </h2>
          </Reveal>
          <div className="mt-12 flex flex-wrap items-end justify-between gap-8 lg:mt-auto lg:pt-24">
            <p className="max-w-[30ch] text-[14px] leading-relaxed text-muted-foreground">
              Conçois, code, teste, sécurise et publie sans changer d’outil : chaque espace reprend là où le précédent s’est arrêté.
            </p>
            <div className="flex items-center gap-3">
              <span className="mr-2 text-[13px] text-muted-foreground tabular-nums" aria-live="polite">
                {String(index + 1).padStart(2, "0")} / {String(order.length).padStart(2, "0")}
              </span>
              <button type="button" className="orb line" onClick={() => go(-1)} aria-label="Espace précédent">
                <Icon name="nxArrowRight" size={17} stroke={1.8} className="rotate-180" />
              </button>
              <button type="button" className="orb line" onClick={() => go(1)} aria-label="Espace suivant">
                <Icon name="nxArrowRight" size={17} stroke={1.8} />
              </button>
            </div>
          </div>
        </div>
        <Reveal delay={120} className="relative mx-auto w-full max-w-[640px] py-6">
          <div className="stack-sheet" aria-hidden="true" />
          {/* #101 : tuile de verre à icône néon de l'espace montré, qui déborde de la carte. */}
          <GlassTile key={s.id} space={s.id} size="lg" label={false} className="glass-sticker" />
          <a href={spaceHref(s)} className="stack-card group flex flex-col p-5 sm:p-6" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            <span className="flex flex-wrap items-center justify-between gap-3">
              <span className="eyebrow border-white/45 text-white">{s.rail}</span>
              <span className="text-[13px] text-white/65">
                <b className="font-semibold text-white">{value}</b> {caption}
              </span>
            </span>
            <span className="stack-shot mt-5" aria-hidden="true">
              <Screens spaces={order.map((o) => o.id)} current={s.id} />
            </span>
            <span className="mt-6 flex items-end justify-between gap-4">
              <span key={s.id} className="kpi-swap">
                <b className="display block text-[clamp(26px,2.4vw,34px)] leading-tight font-normal text-white">{s.name}</b>
                <span className="mt-1 block max-w-[34ch] text-[14px] leading-snug text-white/65">{s.card}</span>
              </span>
              <span className="orb" aria-hidden="true">
                <Icon name="nxArrowUpRight" size={18} stroke={2} />
              </span>
            </span>
          </a>
        </Reveal>
      </div>
    </section>
  )
}
