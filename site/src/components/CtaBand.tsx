import photo from "../assets/photos/horizon-crepuscule.webp"
import { Reveal } from "../lib/motion"
import { MainButton, SecondButton } from "./Download"
import { Words } from "./SectionHead"

/**
 * Appel final. #099 (« Horizon ») : grande photo de montagnes au crépuscule (Unsplash) dans un cadre aux coins
 * légèrement arrondis, voile sombre, titre fin et boutons blancs. Remplace l'aplat citron vert et le globe de « Signal ».
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
          <img src={photo} alt="" loading="lazy" width={2000} height={1125} aria-hidden="true" />
          <Reveal className="relative z-[1] flex min-h-[460px] flex-col justify-end gap-10 p-7 md:min-h-[520px] md:p-12 lg:flex-row lg:items-end lg:justify-between">
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
        </div>
      </div>
    </section>
  )
}
