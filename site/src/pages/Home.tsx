import { AiSection } from "../components/AiSection"
import { Backdrop } from "../components/Backdrop"
import { CtaBand } from "../components/CtaBand"
import { DeviceGallery, DeviceWall } from "../components/DeviceWall"
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
import { DEVICE_COUNT, RELEASES, WEB_URL } from "../lib/product"
import { useRemote } from "../lib/remote"

export function Home() {
  const latest = RELEASES[0]
  const { supportEmail } = useRemote()
  return (
    <>
      <Hero />
      <Marquee />
      <section className="section" id="espaces" data-capture="espaces">
        <div className="wrap">
          <SectionHead
            index="01"
            eyebrow="9 espaces, 1 application"
            title={["Neuf espaces,", "un seul projet ouvert."]}
            lead="Un projet réunit ton site ou ton code, ses applications, ses visuels et sa surveillance. Ouvre-le : tous les espaces s’alignent dessus."
          />
          <SpaceBento />
        </div>
      </section>
      {/* #086 : vitrine du Responsive Lab, vrais cadres d'appareils qui affichent ce site. */}
      <section className="section relative overflow-hidden" id="appareils" data-capture="appareils" data-light>
        <Backdrop variant="soft" />
        <div className="wrap relative">
          <SectionHead
            index="02"
            eyebrow={`Responsive Lab · ${DEVICE_COUNT} modèles`}
            title={["Ton site sur", "tous les écrans."]}
            lead="Téléphones, pliables, tablettes, ordinateurs, téléviseurs, montres et écrans de voiture : le Responsive Lab affiche ton site dans le cadre de chaque modèle, côte à côte. Ici, c’est ce site que tu vois."
          >
            <a className="link-arrow" href="#/espaces/responsive">
              Découvrir le Responsive Lab <Icon name="nxArrowRight" size={15} stroke={2} />
            </a>
          </SectionHead>
          <DeviceWall />
        </div>
        <div className="relative mt-14">
          <DeviceGallery />
        </div>
      </section>
      <Story />
      <Platforms />
      <AiSection />
      <Stats />
      <Personas />
      <Trust />
      <section className="section border-y border-white/[0.06] bg-[#08070b]" id="tarifs" data-capture="tarifs">
        <i className="grid-bg opacity-70" aria-hidden="true" />
        <div className="wrap relative">
          <SectionHead
            index="08"
            align="center"
            eyebrow="Tarifs"
            title={["Gratuit pour commencer,", "sans limite de durée."]}
            lead="Responsive Lab et Browser Lab restent gratuits, avec 2 applications Android ou Windows. Pro ouvre tout NEXORA : Dev Lab, jusqu’à 50 applications, Studio et NEX-DESIGN complets. Ton premier jour, tout est ouvert."
          />
          <PricingCards />
          <Reveal className="mt-10 flex justify-center">
            <a className="link-arrow" href="#/tarifs/comparatif">
              Comparer toutes les fonctions <Icon name="nxArrowRight" size={15} stroke={2} />
            </a>
          </Reveal>
        </div>
      </section>
      {latest && (
        <section className="section" data-capture="nouveautes">
          <div className="wrap">
            <SectionHead index="09" eyebrow={`Nouveautés ${latest[0]}`} title={[`${latest[1].title} :`, "ce qui change."]} lead={latest[1].intro} />
            <NewsCards items={latest[1].items} limit={6} />
            <Reveal className="mt-10 flex justify-center">
              <a className="link-arrow" href="#/nouveautes">
                Toutes les versions de NEXORA <Icon name="nxArrowRight" size={15} stroke={2} />
              </a>
            </Reveal>
          </div>
        </section>
      )}
      <section className="section pt-0" id="faq" data-capture="faq">
        <div className="wrap grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          {/* Un moyen de joindre l'équipe sous le titre (mêmes adresses que le pied de page). */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <SectionHead index="10" align="left" eyebrow="Questions fréquentes" title={["Ce qu’on nous", "demande le plus."]} className="mb-8 md:mb-8" />
            <Reveal className="hud rounded-[4px] p-6" delay={120}>
              <b className="text-[16px] font-semibold">Une autre question ?</b>
              <p className="mt-2 text-[14px] text-muted-foreground">Écris-nous depuis NEXORA (Mon compte → Support) ou à {supportEmail}.</p>
              <a className="link-arrow mt-4" href={supportEmail ? `mailto:${supportEmail}` : WEB_URL}>
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
