import { SPACES, spaceHref, type SpaceId } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal, useTilt } from "../lib/motion"
import { Mini } from "./Minis"

// Ordre et taille des cartes (grille de 12 colonnes) : les espaces phares en grand, l'Accueil en bandeau.
const LAYOUT: [SpaceId, string][] = [
  ["preview", "b-7"],
  ["dev", "b-5"],
  ["android", "b-4"],
  ["desktop", "b-4"],
  ["browser", "b-4"],
  ["studio", "b-4"],
  ["design", "b-4"],
  ["security", "b-4"],
  ["home", "b-12"],
]

export function SpaceBento() {
  const tilt = useTilt()
  return (
    <div className="bento">
      {LAYOUT.map(([id, size], i) => {
        const s = SPACES.find((x) => x.id === id)!
        return (
          <Reveal as="a" key={id} href={spaceHref(s)} className={`bento-card ${size} bc-${id}`} data-space={id} delay={(i % 3) * 80} {...tilt}>
            <span className="bento-text">
              <span className="bento-head">
                <span className="sp-ic">
                  <Icon name={s.icon} size={19} />
                </span>
                <span className="bento-kicker">{s.name}</span>
                {id === "dev" && <span className="plan-tag free">Gratuit</span>}
                {s.plan === "standard" && <span className="plan-tag standard">Standard</span>}
              </span>
              <span className="bento-title">{s.card}</span>
              <span className="bento-desc">{s.tagline}</span>
              <span className="link-arrow bento-more">
                Découvrir <Icon name="nxArrowRight" size={15} stroke={2} />
              </span>
            </span>
            <Mini id={id} />
          </Reveal>
        )
      })}
    </div>
  )
}
