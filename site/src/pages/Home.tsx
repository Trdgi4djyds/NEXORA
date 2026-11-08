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
import { RELEASES } from "../lib/product"

export function Home() {
  const latest = RELEASES[0]
  return (
    <>
      <Hero />
      <Marquee />
      <section className="section" id="espaces" data-capture="espaces">
        <div className="container">
          <SectionHead
            index="01"
            eyebrow="9 espaces, 1 application"
            title={["Neuf espaces,", "un seul projet ouvert."]}
            lead="Un projet réunit ton site ou ton code, ses applications, ses visuels et sa surveillance. Ouvre-le : tous les espaces s’alignent dessus."
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
            index="07"
            eyebrow="Tarifs"
            title={["Gratuit pour commencer,", "sans limite de durée."]}
            lead="Standard débloque la publication sur Android et Windows, Pro donne toute la puissance de NEXORA. Tu changes d’offre quand tu veux."
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
            <SectionHead index="08" eyebrow={`Nouveautés ${latest[0]}`} title={[`${latest[1].title} :`, "ce qui change."]} lead={latest[1].intro} />
            <NewsCards items={latest[1].items} limit={6} />
            <Reveal className="center-row">
              <a className="link-arrow" href="#/nouveautes">
                Toutes les versions de NEXORA <Icon name="nxArrowRight" size={15} stroke={2} />
              </a>
            </Reveal>
          </div>
        </section>
      )}
      <section className="section alt" id="faq" data-capture="faq">
        <div className="container faq-wrap">
          <SectionHead index="09" align="left" eyebrow="Questions fréquentes" title={["Ce qu’on nous", "demande le plus."]} />
          <Faq items={FAQ} />
        </div>
      </section>
      <CtaBand />
    </>
  )
}
