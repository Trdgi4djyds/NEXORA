import { useState } from "react"
import { PERSONAS } from "../data/content"
import { SPACE_BY_ID, spaceHref } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { SectionHead } from "./SectionHead"

/**
 * « Pour qui ? » (#069) : liste éditoriale au lieu de cartes à photo. Au survol, la ligne s'éclaire à la couleur
 * de son espace et la photo apparaît près du pointeur (`data-light`, `lib/glow.ts`) ; sans souris, pas de photo.
 */
export function Personas() {
  const [active, setActive] = useState<number | null>(null)
  return (
    <section className="section personas" data-capture="pour-qui">
      <div className="container">
        <SectionHead
          index="06"
          eyebrow="Pour qui ?"
          title={["Quatre façons", "de travailler avec NEXORA."]}
          lead="Freelance, agence, commerce ou salle de classe : chacun y trouve l’espace qui lui fait gagner le plus de temps."
        />
        <div className={`pq-wrap${active === null ? "" : " has-on"}`} data-light onMouseLeave={() => setActive(null)}>
          <ul className="pq">
            {PERSONAS.map((p, i) => (
              <Reveal as="li" key={p.title} delay={i * 70} data-space={p.space} className={`pq-row${active === i ? " on" : ""}`} onMouseEnter={() => setActive(i)}>
                <a className="pq-link" href={spaceHref(SPACE_BY_ID[p.space])}>
                  <span className="pq-n">{String(i + 1).padStart(2, "0")}</span>
                  <span className="pq-title">{p.title}</span>
                  <span className="pq-text">{p.text}</span>
                  <span className="pq-go">
                    {p.link} <Icon name="nxArrowRight" size={15} stroke={2} />
                  </span>
                </a>
              </Reveal>
            ))}
          </ul>
          <span className="pq-float" aria-hidden="true">
            {PERSONAS.map((p, i) => (
              <img key={p.title} src={p.photo} alt="" className={active === i ? "on" : ""} loading="lazy" width={960} height={720} />
            ))}
          </span>
        </div>
      </div>
    </section>
  )
}
