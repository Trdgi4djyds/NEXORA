import { PERSONAS } from "../data/content"
import { SPACE_BY_ID, spaceHref } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { SectionHead } from "./SectionHead"

export function Personas() {
  return (
    <section className="section personas" data-capture="pour-qui">
      <div className="container">
        <SectionHead
          eyebrow="Pour qui ?"
          title={["Pensé pour celles et ceux", "qui créent pour le web."]}
          lead="Freelance, agence, commerce ou salle de classe : NEXORA s’adapte à ta façon de travailler."
        />
        <div className="persona-grid">
          {PERSONAS.map((p, i) => (
            <Reveal as="a" href={spaceHref(SPACE_BY_ID[p.space])} className="persona" key={p.title} delay={i * 90} data-space={p.space}>
              <span className="persona-photo">
                <img src={p.photo} alt={p.alt} loading="lazy" width={960} height={720} />
              </span>
              <span className="persona-body">
                <span className="persona-title">{p.title}</span>
                <span className="persona-text">{p.text}</span>
                <span className="link-arrow">
                  {p.link} <Icon name="nxArrowRight" size={15} stroke={2} />
                </span>
              </span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
