import { PERSONAS, personaHref, type Persona } from "../data/personas"
import { SPACE_BY_ID } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { NeonIcon } from "./Neon"
import { SectionHead } from "./SectionHead"

/** #117 : carte d'un profil : icône néon, nom, promesse, situation type, espaces du parcours et lien vers sa page. */
export function PersonaCard({ persona, index, quote = true }: { persona: Persona; index: number; quote?: boolean }) {
  const spaces = [...new Set(persona.steps.map((s) => s.space))]
  return (
    <a className="pq-card" href={personaHref(persona)}>
      <span className="pq-card-top">
        <NeonIcon name={persona.icon} size={34} />
        <span className="pq-num">{String(index + 1).padStart(2, "0")}</span>
      </span>
      <b className="pq-name">{persona.name}</b>
      <span className="pq-tag">{persona.tagline}</span>
      {quote && <span className="pq-say">« {persona.quote} »</span>}
      <span className="pq-chips">
        {spaces.map((id) => (
          <span key={id} className="pq-chip">
            <Icon name={SPACE_BY_ID[id].icon} size={12} />
            {SPACE_BY_ID[id].name}
          </span>
        ))}
      </span>
      <span className="pq-go">
        Voir le parcours <Icon name="nxArrowRight" size={14} stroke={2} />
      </span>
    </a>
  )
}

/** « Pour qui ? » de l'accueil (#117) : les 9 profils, chacun relié à sa page et à son parcours. */
export function Personas() {
  return (
    <section className="section light" id="pour-qui" data-capture="pour-qui">
      <div className="wrap-wide">
        <SectionHead
          eyebrow="pour qui ?"
          title={["Votre point de départ,", "votre parcours."]}
          lead="Étudiant, développeur junior, vibe codeur, designer ou commerçant : chacun arrive avec un besoin précis. Choisissez votre profil pour voir ce qui vous freine aujourd’hui et ce que NEXORA change concrètement."
        >
          <a className="link-arrow" href="/pour-qui">
            Tous les profils <Icon name="nxArrowUpRight" size={13} stroke={2} />
          </a>
        </SectionHead>
        <ul className="pq-grid">
          {PERSONAS.map((p, i) => (
            <Reveal as="li" key={p.slug} delay={(i % 3) * 70}>
              <PersonaCard persona={p} index={i} quote={false} />
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}
