import { About } from "../components/About"
import { AiSection } from "../components/AiSection"
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
import { Showcase } from "../components/Showcase"
import { SpaceRow } from "../components/SpaceRow"
import { SpaceBento } from "../components/SpaceBento"
import { Story } from "../components/Story"
import { Trust } from "../components/Trust"
import { FAQ } from "../data/content"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { RELEASES, WEB_URL } from "../lib/product"
import { useRemote } from "../lib/remote"

/**
 * Accueil. #099 (« Horizon ») ; #101 : hero en outil de design, cartes de verre des espaces. Ordre : hero, rangée de logos,
 * vitrine des espaces, à propos et damier de chiffres, grille des espaces en cartes « projet », méthode (photo et
 * étapes dépliables), puis les sections propres à NEXORA ; noir et gris très sombre (.light) en alternance.
 */
export function Home() {
  const latest = RELEASES[0]
  const { supportEmail } = useRemote()
  const arrow = <Icon name="nxArrowUpRight" size={13} stroke={2} />
  return (
    <>
      <Hero />
      <Marquee />
      {/* #101 : cartes de verre inclinées des 9 espaces (référence de l'utilisateur). */}
      <SpaceRow />
      <Showcase />
      <About />
      <section className="section" id="espaces" data-capture="espaces">
        <div className="wrap-wide">
          <SectionHead
            eyebrow="nos espaces"
            title={["Construit pour créer,", "livré avec précision."]}
            lead="Un projet réunit votre site ou votre code, ses applications, ses visuels et sa surveillance. Ouvrez-le : tous les espaces s’alignent dessus."
          >
            <a className="link-arrow" href="/espaces">
              Voir les 9 espaces {arrow}
            </a>
          </SectionHead>
          <SpaceBento />
        </div>
      </section>
      <Story />
      {/* #086 : vitrine du Responsive Lab, vrais cadres d'appareils qui affichent ce site. */}
      <section className="section relative overflow-hidden" id="appareils" data-capture="appareils">
        <div className="wrap relative">
          <SectionHead
            eyebrow="responsive lab"
            title={["Votre site sur", "tous les écrans."]}
            lead="Téléphones, pliables, tablettes, ordinateurs, téléviseurs, montres et écrans de voiture : le Responsive Lab affiche votre site dans le cadre de chaque modèle, côte à côte. Ici, c’est ce site que vous voyez."
          >
            <a className="link-arrow" href="/espaces/responsive">
              Découvrir le Responsive Lab {arrow}
            </a>
          </SectionHead>
          <DeviceWall />
        </div>
        <div className="relative mt-14">
          <DeviceGallery />
        </div>
      </section>
      <Platforms />
      <AiSection />
      <Personas />
      <Trust />
      <section className="section light" id="tarifs" data-capture="tarifs">
        <div className="wrap relative">
          <SectionHead
            align="center"
            eyebrow="tarifs"
            title={["Gratuit pour commencer,", "sans limite de durée."]}
            lead="Responsive Lab et Browser Lab restent gratuits, avec 2 applications Android ou Windows. Pro ouvre tout NEXORA : Dev Lab, jusqu’à 50 applications, Studio et NEX-DESIGN complets. Votre premier jour, tout est ouvert."
          />
          <PricingCards />
          <Reveal className="mt-10 flex justify-center">
            <a className="link-arrow" href="/tarifs/comparatif">
              Comparer toutes les fonctions {arrow}
            </a>
          </Reveal>
        </div>
      </section>
      {latest && (
        <section className="section" data-capture="nouveautes">
          <div className="wrap">
            <SectionHead eyebrow={`nouveautés ${latest[0]}`} title={[`${latest[1].title} :`, "ce qui change."]} lead={latest[1].intro} />
            <NewsCards items={latest[1].items} limit={6} />
            <Reveal className="mt-10 flex justify-center">
              <a className="link-arrow" href="/nouveautes">
                Toutes les versions de NEXORA {arrow}
              </a>
            </Reveal>
          </div>
        </section>
      )}
      <section className="section pt-0" id="faq" data-capture="faq">
        <div className="wrap grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          {/* Un moyen de joindre l'équipe sous le titre (mêmes adresses que le pied de page). */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <SectionHead align="left" eyebrow="questions fréquentes" title={["Ce qu’on nous", "demande le plus."]} className="mb-8 md:mb-8" />
            <Reveal className="hud p-6" delay={120}>
              <b className="text-[16px] font-semibold">Une autre question ?</b>
              <p className="mt-2 text-[14px] text-muted-foreground">Écrivez-nous depuis NEXORA (Mon compte → Support) ou à {supportEmail}.</p>
              <a className="link-arrow mt-4" href={supportEmail ? `mailto:${supportEmail}` : WEB_URL}>
                Écrire à l’équipe {arrow}
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
