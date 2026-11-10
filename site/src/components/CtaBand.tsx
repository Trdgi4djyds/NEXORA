import { Reveal } from "../lib/motion"
import { RENDUS } from "../lib/rendus"
import { MainButton, SecondButton } from "./Download"
import { Words } from "./SectionHead"

/**
 * Appel final. #099 (« Horizon ») : grand cadre aux coins légèrement arrondis, titre fin et boutons blancs.
 * #100 : aurore et rendu 3D de deux MacBook Pro face à face sur les vrais écrans de NEXORA (photo retirée).
 */
export function CtaBand({
  title = "Ouvre ton premier projet aujourd’hui.",
  text = "NEXORA est gratuit, sans limite de durée, avec 2 applications offertes. Passe à Pro quand tu veux aller plus loin.",
}: {
  title?: string
  text?: string
}) {
  return (
    <section className="section-tight" data-capture="appel">
      <div className="wrap-wide">
        <div className="cta-photo relative overflow-hidden rounded-md">
          <i className="aurora" aria-hidden="true" />
          <Reveal className="relative z-[1] flex flex-col gap-8 p-7 pb-0 md:p-12 md:pb-0 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-[640px]">
              <span className="eyebrow border-white/50 text-white">commencer</span>
              <h2 className="title-1 words mt-6 text-white">
                <Words text={title} />
              </h2>
            </div>
            <div className="max-w-sm">
              <p className="text-[16px] leading-relaxed text-white/75">{text}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <MainButton size="lg" />
                <SecondButton size="lg" className="border-white/30 bg-white/[0.08] text-white hover:bg-white hover:text-black" />
              </div>
            </div>
          </Reveal>
          <img className="cta-render mt-6 md:mt-2" src={RENDUS.deuxMacbook.src} alt={RENDUS.deuxMacbook.alt} loading="lazy" width={RENDUS.deuxMacbook.w} height={RENDUS.deuxMacbook.h} />
        </div>
      </div>
    </section>
  )
}
