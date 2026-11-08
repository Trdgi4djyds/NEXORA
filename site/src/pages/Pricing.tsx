import { CtaBand } from "../components/CtaBand"
import { Faq } from "../components/Faq"
import { CompareTable, PricingCards } from "../components/Pricing"
import { SectionHead } from "../components/SectionHead"
import { FAQ } from "../data/content"

const BILLING_FAQ = FAQ.filter((f) => /gratuit|offre|IA/.test(f.q))

export function Pricing() {
  return (
    <>
      <section className="page-hero" data-capture="haut" data-light>
        <i className="grid-bg" aria-hidden="true" />
        <i className="grid-lit" aria-hidden="true" />
        <i className="torch" aria-hidden="true" />
        <div className="container">
          <SectionHead
            as="h1"
            align="left"
            eyebrow="Tarifs"
            title={["Une offre pour chaque projet,", "gratuite pour commencer."]}
            lead="Garde l’offre Gratuite aussi longtemps que tu veux. Standard débloque la publication sur Android et Windows, Pro ouvre tout NEXORA."
          />
          <PricingCards />
        </div>
      </section>
      <section className="section alt" id="comparatif" data-capture="comparatif">
        <div className="container">
          <SectionHead eyebrow="Comparatif" title={["Toutes les fonctions,", "offre par offre."]} lead="Chaque limite et chaque fonction, telles que l’application les applique." />
          <CompareTable />
        </div>
      </section>
      <section className="section">
        <div className="container faq-wrap">
          <SectionHead align="left" eyebrow="Questions sur les offres" title={["Bon à savoir", "avant de choisir."]} />
          <Faq items={BILLING_FAQ} idPrefix="faq-tarifs" />
        </div>
      </section>
      <CtaBand />
    </>
  )
}
