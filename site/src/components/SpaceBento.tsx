import { SPACE_FACTS } from "../data/content"
import { SPACES, spaceHref, type SpaceId } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { Pixel, Screen } from "./Screen"

// Ordre et taille des cartes (grille de 3 colonnes) : les espaces phares en grand, l'Accueil en bandeau.
const LAYOUT: [SpaceId, string][] = [
  ["preview", "w2"],
  ["dev", ""],
  ["android", "tall"],
  ["desktop", ""],
  ["browser", ""],
  ["studio", ""],
  ["design", ""],
  ["security", ""],
  ["home", "w3"],
]

/**
 * Grille des espaces : vraie capture recadrée (Pixel pour l'App Builder) et un fait vérifié par carte.
 * #069 : bordure et reflet à la couleur de l'espace qui suivent la souris (`data-glow`, `lib/glow.ts`).
 */
export function SpaceBento() {
  return (
    <div className="bento" data-glow>
      {LAYOUT.map(([id, size], i) => {
        const s = SPACES.find((x) => x.id === id)!
        const n = String(SPACES.indexOf(s) + 1).padStart(2, "0")
        const [value, caption] = SPACE_FACTS[id]
        return (
          <Reveal as="a" key={id} href={spaceHref(s)} className={`card glow ${size} card-${id}`} data-space={id} delay={(i % 3) * 70}>
            <span className="card-t">
              <span className="label">
                <Icon name={s.icon} size={14} /> {n} · {s.name}
                {id === "dev" && <span className="tag free">Gratuit</span>}
                {s.plan === "standard" && <span className="tag">Standard</span>}
              </span>
              <span className="card-h">{s.card}</span>
              <span className="card-p">{s.tagline}</span>
            </span>
            <span className="card-img" aria-hidden="true">
              {id === "android" ? <Pixel /> : <Screen space={id} />}
            </span>
            <span className="card-fact">
              <b>{value}</b> {caption}
            </span>
            <span className="card-go" aria-hidden="true">
              <Icon name="nxArrowUpRight" size={16} stroke={2} />
            </span>
          </Reveal>
        )
      })}
    </div>
  )
}
