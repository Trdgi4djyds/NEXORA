import heroPhoto from "../assets/photos/horizon-hero.webp"
import { Icon } from "../lib/icons"
import { CountUp } from "../lib/motion"
import { APP_VERSION, DEVICE_COUNT } from "../lib/product"
import { MainButton, SecondButton } from "./Download"

/**
 * Hero. #099 (« Horizon ») : photo plein cadre (bâtiment courbe aux lignes de lumière, Unsplash) qui passe sous
 * l'en-tête, titre fin en bas à gauche, boutons blancs, et carte en verre dépoli qui déborde sur la section suivante
 * avec un chiffre vérifié (catalogue des appareils du Responsive Lab). Sur téléphone, la carte suit le texte.
 */
export function Hero() {
  return (
    <section className="hero" data-capture="haut">
      <div className="hero-photo flex flex-col justify-end">
        <img src={heroPhoto} alt="" width={2400} height={1600} fetchPriority="high" decoding="async" aria-hidden="true" />
        <div className="wrap-wide relative z-[1] pt-36 pb-14 lg:pt-44 lg:pb-32">
          <div className="max-w-[760px]">
            <span className="eyebrow rise border-white/50 text-white">NEXORA Devs Toolbox</span>
            <h1 className="title-xl rise mt-6 text-white" style={{ animationDelay: "120ms" }}>
              L’atelier complet du web, installé sur ton PC
            </h1>
            <p className="rise mt-6 max-w-[560px] text-[17px] leading-relaxed text-white/75" style={{ animationDelay: "240ms" }}>
              Design, code, tests sur {DEVICE_COUNT} modèles d’appareils, sécurité et publication sur le web, Android et Windows, dans une seule application.
            </p>
            <div className="rise mt-9 flex flex-wrap gap-3" style={{ animationDelay: "340ms" }}>
              <MainButton size="lg" />
              <SecondButton size="lg" className="border-white/30 bg-white/[0.08] text-white hover:bg-white hover:text-black" />
            </div>
            <p className="rise mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-white/60" style={{ animationDelay: "420ms" }}>
              <span className="inline-flex items-center gap-2">
                <i className="dot live bg-white" /> Version {APP_VERSION}
              </span>
              <span>Windows 10 et 11</span>
              <span>Licence gratuite, sans limite de durée</span>
            </p>
          </div>
          <a href="/espaces/responsive" className="hero-card glass rise group mt-12 flex flex-col p-6 lg:mt-0 lg:min-h-[300px]" style={{ animationDelay: "560ms" }}>
            <span className="eyebrow border-white/45 text-white">modèles d’appareils</span>
            <b className="display mt-8 block text-[64px] leading-none font-normal tracking-[-0.03em] tabular-nums">
              <CountUp value={DEVICE_COUNT} duration={1200} delay={700} />
            </b>
            <span className="mt-6 block text-[17px] font-medium">Ton site sur tous les écrans</span>
            <span className="mt-1.5 block max-w-[30ch] text-[13.5px] leading-snug text-white/70">Téléphones, pliables, tablettes, ordinateurs, téléviseurs et montres, côte à côte dans le Responsive Lab.</span>
            <span className="orb mt-6 self-end lg:mt-auto" aria-hidden="true">
              <Icon name="nxArrowUpRight" size={18} stroke={2} />
            </span>
          </a>
        </div>
      </div>
    </section>
  )
}
