import { TRUST } from "../data/content"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { SectionHead } from "./SectionHead"

export function Trust() {
  return (
    <section className="section trust" data-space="security" data-capture="confiance">
      <div className="container trust-grid">
        <SectionHead
          align="left"
          eyebrow="Confiance"
          title={["Tes projets restent", "chez toi."]}
          lead="NEXORA travaille sur ton ordinateur : ce qui est sensible est chiffré et chaque projet reste cloisonné."
        />
        <div className="trust-cards">
          {TRUST.map((t, i) => (
            <Reveal className="trust-card" key={t.title} delay={i * 80}>
              <span className="sp-ic">
                <Icon name={t.icon} size={19} />
              </span>
              <h3>{t.title}</h3>
              <p>{t.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
