import { NumberRows, Watermark, WordStrip } from "../components/Blocks"
import { CtaBand } from "../components/CtaBand"
import { Faq } from "../components/Faq"
import { CompareTable, PricingCards } from "../components/Pricing"
import { PageHero, SectionHead } from "../components/SectionHead"
import { PRICING_FAQ } from "../data/content"
import { money, monthsOffered, useRemote } from "../lib/remote"

// #117 : questions sur les offres, présentes seulement ici (data/content.ts, PRICING_FAQ).
const BILLING_FAQ = PRICING_FAQ

export function Pricing() {
  return (
    <>
      <PageHero>
        <SectionHead
          as="h1"
          align="center"
          eyebrow="Tarifs"
          title={["Une offre pour chaque projet,", "gratuite pour commencer."]}
          lead="Gardez l’offre Gratuite aussi longtemps que vous voulez : Responsive Lab et Browser Lab complets, et 2 applications Android ou Windows. Pro ouvre tout NEXORA, et votre premier jour est un essai complet de 24 h."
          className="max-w-4xl"
        />
        <PricingCards />
      </PageHero>
      <WordStrip words={["Gratuit pour commencer", "24 h d’essai Pro complet", "2 applications offertes", "Sans engagement", "Au mois ou à l’année", "Une licence par compte"]} />
      <PricingNumbers />
      <section className="section lime relative overflow-hidden" id="comparatif" data-capture="comparatif">
        <Watermark icon="grid" className="wm-tr" size={480} />
        <div className="wrap relative">
          <SectionHead eyebrow="Comparatif" title={["Toutes les fonctions,", "offre par offre."]} lead="Chaque limite et chaque fonction, telles que l’application les applique." />
          <CompareTable />
        </div>
      </section>
      <section className="section relative overflow-hidden" data-capture="questions">
        <Watermark icon="chat" className="wm-bl" size={420} />
        <div className="wrap relative grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <SectionHead align="left" eyebrow="Questions sur les offres" title={["Bon à savoir", "avant de choisir."]} />
          <Faq items={BILLING_FAQ} idPrefix="faq-tarifs" />
        </div>
      </section>
      <CtaBand bright />
    </>
  )
}

/** #105 : les offres en chiffres (prix lus sur le serveur, catalogue de repli sinon), en rangées géantes. */
function PricingNumbers() {
  const { plans } = useRemote()
  const free = plans.find((p) => p.id === "free")
  const pro = plans.find((p) => p.id === "pro") || plans[plans.length - 1]
  const offered = pro ? monthsOffered(pro) : 0
  return (
    <NumberRows
      eyebrow="Les offres en chiffres"
      title={["Ce que vous payez,", "rien de plus."]}
      icon="key"
      rows={[
        { value: money(free?.price_month_cents ?? 0), label: "Gratuit", text: free?.description || "Gratuit, sans limite de durée." },
        ...(pro ? [{ value: money(pro.price_month_cents), label: "Pro, par mois", text: pro.description }] : []),
        ...(pro && pro.price_year_cents ? [{ value: money(pro.price_year_cents), label: "Pro, par an", text: offered ? `${offered} mois offerts par rapport au paiement mensuel.` : "Payé une fois pour toute l’année." }] : []),
        { value: "24 h", label: "d’essai complet", text: "Votre premier jour, tout Pro est ouvert, sans carte bancaire." },
      ]}
    />
  )
}
