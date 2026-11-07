import { AiSection } from "../components/AiSection"
import { CtaBand } from "../components/CtaBand"
import { Faq } from "../components/Faq"
import { Hero } from "../components/Hero"
import { Marquee } from "../components/Marquee"
import { NewsCards } from "../components/NewsCards"
import { Personas } from "../components/Personas"
import { Platforms } from "../components/Platforms"
import { PricingCards } from "../components/Pricing"
import { SectionHead } from "../components/SectionHead"
import { SpaceBento } from "../components/SpaceBento"
import { Stats } from "../components/Stats"
import { Story } from "../components/Story"
import { Trust } from "../components/Trust"
import { FAQ } from "../data/content"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { APP_VERSION, RELEASES } from "../lib/product"

export function Home() {
  const latest = RELEASES[0]
  return (
    <>
      <Hero />
      <Marquee />
      <section className="section" id="espaces" data-capture="espaces">
        <div className="container">
          <SectionHead
            eyebrow="9 espaces, 1 application"
            title={["Tout pour aller de l’idée", "à la mise en ligne."]}
            lead="Chaque espace fait un métier. Ensemble, ils partagent tes projets : ouvre un projet, et tous les espaces s’alignent dessus."
          />
          <SpaceBento />
        </div>
      </section>
      <Story />
      <Platforms />
      <AiSection />
      <Stats />
      <Personas />
      <Trust />
      <section className="section alt" id="tarifs" data-capture="tarifs">
        <div className="container">
          <SectionHead
            eyebrow="Tarifs"
            title={["Commence gratuitement,", "accélère quand tu veux."]}
            lead="L’offre Gratuite n’a pas de limite de durée. Standard débloque la publication, Pro donne toute la puissance de NEXORA."
          />
          <PricingCards />
          <Reveal className="center-row">
            <a className="link-arrow" href="#/tarifs/comparatif">
              Comparer toutes les fonctions <Icon name="nxArrowRight" size={15} stroke={2} />
            </a>
          </Reveal>
        </div>
      </section>
      {latest && (
        <section className="section" data-capture="nouveautes">
          <div className="container">
            <SectionHead eyebrow={`Nouveautés ${latest[0]}`} title={[`${latest[1].title} :`, "ce qui change."]} lead={latest[1].intro} />
            <NewsCards items={latest[1].items} limit={6} />
            <Reveal className="center-row">
              <a className="link-arrow" href="#/nouveautes">
                Toutes les nouveautés de la version {APP_VERSION} <Icon name="nxArrowRight" size={15} stroke={2} />
              </a>
            </Reveal>
          </div>
        </section>
      )}
      <section className="section alt" id="faq" data-capture="faq">
        <div className="container narrow">
          <SectionHead eyebrow="Questions fréquentes" title={["Tu te poses", "des questions ?"]} />
          <Faq items={FAQ} />
        </div>
      </section>
      <CtaBand />
    </>
  )
}
