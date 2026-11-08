import { CtaBand } from "../components/CtaBand"
import { Faq } from "../components/Faq"
import { CompareTable, PricingCards } from "../components/Pricing"
import { PageHero, SectionHead } from "../components/SectionHead"
import { FAQ } from "../data/content"

const BILLING_FAQ = FAQ.filter((f) => /gratuit|offre|IA/.test(f.q))

export function Pricing() {
  return (
    <>
      <PageHero>
        <SectionHead
          as="h1"
          align="center"
          eyebrow="Tarifs"
          title={["Une offre pour chaque projet,", "gratuite pour commencer."]}
          lead="Garde l’offre Gratuite aussi longtemps que tu veux : Responsive Lab et Browser Lab complets, et 2 applications Android ou Windows. Pro ouvre tout NEXORA, et ton premier jour est un essai complet de 24 h."
          className="max-w-4xl"
        />
        <PricingCards />
      </PageHero>
      <section className="section light" id="comparatif" data-capture="comparatif">
        <div className="wrap">
          <SectionHead eyebrow="Comparatif" title={["Toutes les fonctions,", "offre par offre."]} lead="Chaque limite et chaque fonction, telles que l’application les applique." />
          <CompareTable />
        </div>
      </section>
      <section className="section">
        <div className="wrap grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <SectionHead align="left" eyebrow="Questions sur les offres" title={["Bon à savoir", "avant de choisir."]} />
          <Faq items={BILLING_FAQ} idPrefix="faq-tarifs" />
        </div>
      </section>
      <CtaBand />
    </>
  )
}
