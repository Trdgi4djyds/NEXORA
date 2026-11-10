import { SPACES, SPACE_BY_ID } from "../data/spaces"
import { CountUp, Reveal } from "../lib/motion"
import { DEVICE_COUNT } from "../lib/product"
import { Icon } from "../lib/icons"
import { RENDUS } from "../lib/rendus"
import { cn } from "../lib/utils"
import { Words } from "./SectionHead"

type Cell = { value: number; label: string; tone: "white" | "dark" | "photo" } | null

// Chiffres relevés dans NEXORA (catalogue des appareils, outils installés, modèles du Dev Lab, espaces du rail,
// plateformes de publication). Sur ordinateur, damier de 4 × 2 comme la référence (cases vides comprises).
const CELLS: Cell[] = [
  { value: DEVICE_COUNT, label: "modèles d’appareils pour tester ton site", tone: "white" },
  null,
  { value: 15, label: "outils installés pour toi, depuis leurs sources officielles", tone: "dark" },
  null,
  null,
  { value: SPACES.length, label: "espaces réunis dans une seule application", tone: "photo" },
  { value: SPACE_BY_ID.dev.details?.items.length ?? 15, label: "modèles de projet prêts à lancer", tone: "dark" },
  { value: 3, label: "plateformes de publication : web, Android, Windows", tone: "white" },
]

/**
 * #099 (« Horizon ») : « à propos » de la référence : repère à gauche, grand texte fin en deux tons, puis damier de
 * chiffres vérifiés (tuiles blanches à l'encre, tuiles noires, une tuile illustrée). Remplace les cartes de Stats.
 * #100 : mot sélectionné à la manière d'un outil de design, tuile illustrée par le rendu 3D d'un iPad Pro.
 */
export function About() {
  return (
    <section className="section light" id="a-propos" data-capture="a-propos">
      <div className="wrap-wide">
        <Reveal className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-10">
          <span className="eyebrow h-fit lg:mt-3">à propos</span>
          <p className="title-2 words max-w-[26ch] !text-[clamp(28px,3.1vw,46px)] !leading-[1.5]">
            {/* #100 : mot sélectionné comme dans NEX-DESIGN (poignées, taille, couleur, curseur de l'agent IA). */}
            Pensé pour{" "}
            <span className="sel-box">
              construire
              <i className="h tl" /><i className="h tr" /><i className="h bl" /><i className="h br" /><i className="h tc" />
              <span className="sel-size" aria-hidden="true">576 × 203</span>
              <span className="sel-color" aria-hidden="true"><i />4898F7<em>100 %</em></span>
              <span className="sel-agent" aria-hidden="true"><Icon name="sparkle" size={12} stroke={2} />Agent IA</span>
            </span>
            , porté par l’exigence —{" "}
            <span className="tone">
              <Words text="NEXORA réunit tout ce qu’il faut pour concevoir, coder, tester, sécuriser et publier tes sites, tes applications Android et tes logiciels Windows." from={2} />
            </span>
          </p>
        </Reveal>
        <div className="mt-16 grid grid-cols-2 gap-px md:mt-24 lg:grid-cols-4">
          {CELLS.map((c, i) =>
            c ? (
              <Reveal key={i} delay={(i % 4) * 80} className={cn("checker", c.tone === "white" && "lime", c.tone === "dark" && "checker-dark", c.tone === "photo" && "checker-photo")}>
                {c.tone === "photo" && <img src={RENDUS.ipadPro.src} alt="" loading="lazy" width={RENDUS.ipadPro.w} height={RENDUS.ipadPro.h} aria-hidden="true" />}
                <b className="display relative block text-[clamp(38px,3.6vw,54px)] leading-none font-normal tracking-[-0.03em] tabular-nums">
                  <CountUp value={c.value} />
                </b>
                <span className="relative mt-3 block max-w-[22ch] text-[13.5px] leading-snug opacity-75">{c.label}</span>
              </Reveal>
            ) : (
              <span key={i} className="hidden lg:block" aria-hidden="true" />
            ),
          )}
        </div>
      </div>
    </section>
  )
}
