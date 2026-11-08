import { TRUST } from "../data/content"
import { Reveal } from "../lib/motion"
import { SectionHead } from "./SectionHead"

/**
 * Confiance (#069) : fiche technique (libellé, garantie, état) au lieu de cartes à icône ; lignes éclairées au survol.
 * #084 : en-tête au-dessus et fiche en deux colonnes (la colonne de gauche restait vide sur toute la hauteur).
 */
export function Trust() {
  return (
    <section className="section trust" data-space="security" data-capture="confiance">
      <div className="container trust-grid">
        <SectionHead
          index="06"
          eyebrow="Confiance"
          title={["Tes projets restent", "chez toi."]}
          lead="NEXORA travaille sur ton ordinateur : ce qui est sensible est chiffré et chaque projet reste cloisonné."
        />
        <ul className="spec" data-glow>
          {TRUST.map((t, i) => (
            <Reveal as="li" className="spec-row glow" key={t.title} delay={i * 70}>
              <span className="spec-k">{t.label}</span>
              <span className="spec-v">
                <b>{t.title}</b>
                <span>{t.text}</span>
              </span>
              <span className="spec-s">
                <i /> Par défaut
              </span>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}
