import type { CSSProperties } from "react"
import { STORY } from "../data/content"
import { SPACE_BY_ID } from "../data/spaces"
import { Icon } from "../lib/icons"

/**
 * NEXORA #093 : bandeau de mots géants qui glissent avec le défilement (deux rangées en sens contraire). Aucun écouteur
 * propre : la section porte `data-depth` et reçoit --sp de lib/depth.ts (0 à l'entrée dans la fenêtre, 1 à la sortie),
 * dont le CSS tire le décalage. Les verbes du récit, chacun suivi de la pastille de son espace. Décoratif ; immobile avec
 * « Réduire les animations ».
 */
export function KineticBand() {
  const steps = [...STORY, ...STORY]
  return (
    <section className="kinetic relative overflow-hidden py-14 md:py-20" data-depth aria-hidden="true">
      {[0, 1].map((r) => (
        <div key={r} className={r ? "kin-row kin-rev mt-3 md:mt-5" : "kin-row"}>
          {steps.map((s, i) => {
            const sp = SPACE_BY_ID[s.space]
            return (
              <span key={i} className="kin-item" data-space={s.space}>
                <span className={r ? "kin-word kin-outline" : "kin-word"}>{r ? sp.name : s.verb}</span>
                <span className="kin-dot" style={{ "--ki": i % 7 } as CSSProperties}>
                  <Icon name={sp.icon} size={28} stroke={2} />
                </span>
              </span>
            )
          })}
        </div>
      ))}
    </section>
  )
}
