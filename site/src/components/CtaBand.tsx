import { Reveal } from "../lib/motion"
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
 * Appel final. #092 (« Signal ») : aplat citron vert (ambiance .lime), titre à l'encre en très grand, boutons à l'encre ;
 * le globe animé et le sol quadrillé sont dessinés à l'encre (--neon de l'ambiance).
 */
export function CtaBand({
  title = "Ouvre ton premier projet aujourd’hui.",
  text = "NEXORA est gratuit, sans limite de durée, avec 2 applications offertes. Passe à Pro quand tu veux aller plus loin.",
}: {
  title?: string
  text?: string
}) {
  return (
    <section className="lime relative overflow-hidden pt-24 md:pt-32" data-capture="appel" data-light>
      <div className="floor opacity-60" aria-hidden="true">
        <i />
      </div>
      <div className="wrap-wide relative">
        <Reveal className="grid items-end gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
          <h2 className="title-1 words max-w-[14ch]">
            <Words text={title} />
          </h2>
          <div>
            <p className="lead max-w-md">{text}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <MainButton size="lg" />
              <SecondButton size="lg" />
            </div>
          </div>
        </Reveal>
      </div>
      <div className="relative left-1/2 mt-14 h-[clamp(200px,26vw,340px)] w-[min(900px,120vw)] -translate-x-1/2 overflow-hidden" aria-hidden="true">
        <div className="absolute top-0 left-1/2 aspect-square w-full -translate-x-1/2">
          <Globe markers={MARKERS} arcs={ARCS} tilt={-0.18} start={-0.35} density={20000} />
        </div>
      </div>
    </section>
  )
}
