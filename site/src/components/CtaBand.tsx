import { Reveal } from "../lib/motion"
import { SCREENS } from "../lib/screens"
import { MainButton, SecondButton } from "./Download"
import { Device } from "./Screen"
import { Words } from "./SectionHead"

/**
 * Appel final. #101 : composition de l'image de référence de l'utilisateur (nom de la marque en lettres géantes derrière,
 * halo ; titre, texte et boutons à gauche). #103 : un vrai MacBook Pro 16 pouces (cadre photographique « Devices » de
 * Meta, lib/devices.ts) à la place de l'écran dessiné en CSS, de face, avec la vraie Accueil de NEXORA à l'écran.
 */
export function CtaBand({
  title = "Ouvre ton premier projet aujourd’hui.",
  text = "NEXORA est gratuit, sans limite de durée, avec 2 applications offertes. Passe à Pro quand tu veux aller plus loin.",
}: {
  title?: string
  text?: string
}) {
  return (
    <section className="cta-x relative overflow-hidden" data-capture="appel">
      <i className="cta-glow" aria-hidden="true" />
      <span className="cta-word" aria-hidden="true">
        NEXORA
      </span>
      <div className="wrap-wide relative grid items-center gap-14 py-24 md:py-32 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
        <Reveal className="max-w-[560px]">
          <span className="eyebrow">commencer</span>
          <h2 className="title-1 words mt-6">
            <Words text={title} />
          </h2>
          <p className="mt-6 text-[16px] leading-relaxed text-muted-foreground">{text}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <MainButton size="lg" />
            <SecondButton size="lg" />
          </div>
        </Reveal>
        <Reveal delay={120} className="cta-mac">
          <Device kind="macbook" screen={SCREENS.home} alt="L’Accueil de NEXORA sur un MacBook Pro 16 pouces" />
          <i className="cta-mac-floor" aria-hidden="true" />
        </Reveal>
      </div>
    </section>
  )
}
