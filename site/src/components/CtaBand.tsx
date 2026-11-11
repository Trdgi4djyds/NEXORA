import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { SCREENS } from "../lib/screens"
import { Watermark } from "./Blocks"
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
  bright = false,
}: {
  title?: string
  text?: string
  /** #105 : pages intérieures seulement : bloc plein blanc (référence de l'utilisateur), l'accueil garde la version sombre. */
  bright?: boolean
}) {
  if (bright) return <CtaBright title={title} text={text} />
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

const CTA_LINKS: [string, string][] = [
  ["Les espaces", "/espaces"],
  ["Tarifs", "/tarifs"],
  ["Télécharger", "/telecharger"],
  ["Ma licence", "/licence"],
  ["Nouveautés", "/nouveautes"],
  ["Comparatif", "/tarifs/comparatif"],
]

/**
 * #105 : appel final des pages intérieures, d'après les références de l'utilisateur (bloc plein de couleur à grand titre,
 * liens rangés en colonnes, nom de la marque en lettres géantes en bas) ; ici en blanc et encre (direction « Horizon »),
 * avec un pictogramme informatique en filigrane.
 */
function CtaBright({ title, text }: { title: string; text: string }) {
  return (
    <section className="cta-bright lime relative overflow-hidden" data-capture="appel">
      <Watermark icon="code" className="wm-tr" size={460} />
      <div className="wrap relative pt-24 md:pt-32">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:items-end">
          <Reveal>
            <span className="eyebrow">commencer</span>
            <h2 className="cta-bright-title mt-6">
              <Words text={title} />
            </h2>
            <p className="mt-6 max-w-[52ch] text-[16px] leading-relaxed text-muted-foreground">{text}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <MainButton size="lg" />
              <SecondButton size="lg" />
            </div>
          </Reveal>
          <Reveal delay={100}>
            <ul className="cta-bright-links">
              {CTA_LINKS.map(([label, href]) => (
                <li key={href}>
                  <a href={href}>
                    {label}
                    <Icon name="nxArrowUpRight" size={15} stroke={2} />
                  </a>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
        <span className="cta-bright-word" aria-hidden="true">
          NEXORA
        </span>
      </div>
    </section>
  )
}
