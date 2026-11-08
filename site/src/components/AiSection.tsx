import { AI_PROVIDERS, AI_USES } from "../data/content"
import { SPACE_BY_ID } from "../data/spaces"
import { Reveal } from "../lib/motion"
import { Screen } from "./Screen"
import { SectionHead } from "./SectionHead"

/**
 * Assistant IA : fournisseurs, usages par espace et la vraie capture du Dev Lab.
 * #069 : usages en lignes éclairées par le pointeur, capture inclinée qui suit la souris avec son reflet.
 */
export function AiSection() {
  return (
    <section className="section ai-sec" data-space="home" data-capture="ia">
      <div className="container">
        <SectionHead
          index="04"
          eyebrow="Assistant IA"
          title={["Ton IA, ta clé,", "sans limite."]}
          lead="Branche ton propre compte Claude, GPT, Gemini ou Mistral, ou fais tourner Ollama sur ton PC. NEXORA ne compte pas tes requêtes et ne facture rien pour l’IA."
        />
        <div className="ai-grid">
          <div className="ai-copy">
            <Reveal as="p" className="ai-providers">
              {AI_PROVIDERS.map((p) => (
                <span key={p}>{p}</span>
              ))}
            </Reveal>
            <ul className="ai-uses" data-glow>
              {AI_USES.map((u, i) => (
                <Reveal as="li" className="glow" key={u.title} data-space={u.space} delay={80 + i * 70}>
                  <span className="ai-k">
                    <i className="dot" /> {SPACE_BY_ID[u.space].name}
                  </span>
                  <span className="ai-t">{u.text}</span>
                </Reveal>
              ))}
            </ul>
          </div>
          <Reveal className="ai-visual" delay={120}>
            <div className="tilt-wrap" data-tilt>
              <div className="frame tilt">
                <Screen space="dev" />
                <i className="glare" aria-hidden="true" />
              </div>
            </div>
            <p className="ai-caption">Le Dev Lab, où l’assistant propose ses changements fichier par fichier.</p>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
