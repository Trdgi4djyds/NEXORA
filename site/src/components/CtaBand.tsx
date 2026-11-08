import { Reveal } from "../lib/motion"
import { Backdrop } from "./Backdrop"
import { MainButton, SecondButton } from "./Download"
import { CITIES, Globe, type GlobeArc, type GlobeMarker } from "./Globe"
import { Words } from "./SectionHead"

const MARKERS: GlobeMarker[] = [CITIES.cotonou, CITIES.abidjan, CITIES.dakar, CITIES.lagos, CITIES.paris, CITIES.montreal, CITIES.saopaulo, CITIES.johannesburg].map((at) => ({ at }))
const ARCS: GlobeArc[] = [
  { from: CITIES.cotonou, to: CITIES.paris },
  { from: CITIES.abidjan, to: CITIES.montreal },
  { from: CITIES.dakar, to: CITIES.saopaulo },
  { from: CITIES.lagos, to: CITIES.johannesburg },
]

/**
 * Appel final (#086) : un globe animé se lève derrière le titre, sur un sol quadrillé qui défile ; décor de halos et de
 * circuit. (L'anneau 3D des espaces du #074 est retiré : des captures plates vues de biais paraissaient mal orientées.)
 */
export function CtaBand({
  title = "Ouvre ton premier projet aujourd’hui.",
  text = "NEXORA est gratuit, sans limite de durée, avec 2 applications offertes. Passe à Pro quand tu veux aller plus loin.",
}: {
  title?: string
  text?: string
}) {
  return (
    <section className="relative overflow-hidden border-t border-white/[0.06] pt-24 md:pt-32" data-capture="appel" data-light>
      <Backdrop variant="cta" />
      <div className="floor" aria-hidden="true">
        <i />
      </div>
      <div className="wrap relative">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 className="title-2 words">
            <Words text={title} />
          </h2>
          <p className="lead mx-auto mt-5 max-w-xl">{text}</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <MainButton size="lg" />
            <SecondButton size="lg" />
          </div>
        </Reveal>
      </div>
      <div className="relative left-1/2 mt-14 h-[clamp(220px,30vw,380px)] w-[min(900px,120vw)] -translate-x-1/2 overflow-hidden" aria-hidden="true">
        <div className="absolute top-0 left-1/2 aspect-square w-full -translate-x-1/2">
          <Globe markers={MARKERS} arcs={ARCS} tilt={-0.18} start={-0.35} density={20000} />
        </div>
      </div>
    </section>
  )
}
