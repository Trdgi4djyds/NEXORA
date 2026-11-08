import type { CSSProperties } from "react"
import { SPACES } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { MainButton, SecondButton } from "./Download"
import { Screen } from "./Screen"
import { Words } from "./SectionHead"

/**
 * NEXORA #074 : anneau 3D des neuf espaces, vraies captures de NEXORA disposées en cercle et qui tournent
 * lentement (pause au survol, immobile avec « Réduire les animations ») ; l'anneau s'incline au défilement
 * (`data-depth`). Décoratif : les espaces restent accessibles par la navigation.
 */
function SpaceRing() {
  return (
    <div className="ring-wrap" aria-hidden="true" data-depth>
      <div className="ring" style={{ "--n": SPACES.length } as CSSProperties}>
        {SPACES.map((s, i) => (
          <span key={s.id} className="ring-card" data-space={s.id} style={{ "--i": i } as CSSProperties}>
            <Screen space={s.id} />
            <b>
              <Icon name={s.icon} size={13} /> {s.rail}
            </b>
          </span>
        ))}
      </div>
      <i className="ring-floor" />
    </div>
  )
}

/** Appel final (#069) : grille qui s'éclaire autour du pointeur (`data-light`), titre mot à mot ; anneau 3D (#074). */
export function CtaBand({
  title = "Ouvre ton premier projet aujourd’hui.",
  text = "NEXORA est gratuit, sans limite de durée. Tu passes à Pro le jour où tu publies.",
}: {
  title?: string
  text?: string
}) {
  return (
    <section className="section cta-sec" data-capture="appel" data-light>
      <i className="grid-bg" aria-hidden="true" />
      <i className="grid-lit" aria-hidden="true" />
      <i className="torch" aria-hidden="true" />
      <div className="container">
        <SpaceRing />
        <Reveal className="cta">
          <h2 className="h-2 words">
            <Words text={title} />
          </h2>
          <p>{text}</p>
          <div className="btn-stack center" data-glow>
            <MainButton size="lg" />
            <SecondButton size="lg" />
          </div>
        </Reveal>
      </div>
    </section>
  )
}
