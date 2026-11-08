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
import { RELEASES, WEB_URL } from "../lib/product"
import { useRemote } from "../lib/remote"

export function Home() {
  const latest = RELEASES[0]
  const { supportEmail } = useRemote()
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
            align="center"
            eyebrow="Tarifs"
            title={["Gratuit pour commencer,", "sans limite de durée."]}
            lead="Responsive Lab et Browser Lab restent gratuits. Pro ouvre tout NEXORA : Dev Lab, applications Android et logiciels Windows. Ton premier jour, tout est ouvert."
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
          {/* #084 : un moyen de joindre l'équipe sous le titre (mêmes adresses que le pied de page). */}
          <div className="faq-side">
            <SectionHead index="09" align="left" eyebrow="Questions fréquentes" title={["Ce qu’on nous", "demande le plus."]} />
            <Reveal className="faq-help" delay={120}>
              <b>Une autre question ?</b>
              <p>Écris-nous depuis NEXORA (Mon compte → Support) ou par ce lien.</p>
              <a className="link-arrow" href={supportEmail ? `mailto:${supportEmail}` : WEB_URL}>
                Écrire à l’équipe <Icon name="nxArrowRight" size={15} stroke={2} />
              </a>
            </Reveal>
          </div>
          <Faq items={FAQ} />
        </div>
      </section>
      <CtaBand />
    </>
  )
}
