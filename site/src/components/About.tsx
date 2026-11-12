import { SPACES, SPACE_BY_ID } from "../data/spaces"
import { CountUp, Reveal } from "../lib/motion"
import { DEVICE_COUNT } from "../lib/product"
import { cn } from "../lib/utils"
import { NeonIcon } from "./Neon"
import { Words } from "./SectionHead"

type Cell = { value: number; label: string; tone: "white" | "dark" | "photo" } | null

// Chiffres relevés dans NEXORA (catalogue des appareils, outils installés, modèles du Dev Lab, espaces du rail,
// plateformes de publication). Sur ordinateur, damier de 4 × 2 comme la référence (cases vides comprises).
const CELLS: Cell[] = [
  { value: DEVICE_COUNT, label: "modèles d’appareils pour tester votre site", tone: "white" },
  null,
  { value: 15, label: "outils installés pour vous, depuis leurs sources officielles", tone: "dark" },
  null,
  null,
  { value: SPACES.length, label: "espaces réunis dans une seule application", tone: "photo" },
  { value: SPACE_BY_ID.dev.details?.items.length ?? 15, label: "modèles de projet prêts à lancer", tone: "dark" },
  { value: 3, label: "plateformes de publication : web, Android, Windows", tone: "white" },
]

/**
 * #099 (« Horizon ») : « à propos » de la référence : repère à gauche, grand texte fin en deux tons, puis damier de
 * chiffres vérifiés (tuiles blanches à l'encre, tuiles noires, une tuile illustrée). Remplace les cartes de Stats.
 * #101 : tuile illustrée par une icône néon (plus de rendu 3D).
 */
export function About() {
  return (
    <section className="section light" id="a-propos" data-capture="a-propos">
      <div className="wrap-wide">
        <Reveal className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-10">
          <span className="eyebrow h-fit lg:mt-3">à propos</span>
          <p className="title-2 words max-w-[26ch] !text-[clamp(28px,3.1vw,46px)] !leading-[1.18]">
            <Words text="Pensé pour construire, porté par l’exigence —" />{" "}
            <span className="tone">
              <Words text="NEXORA réunit tout ce qu’il faut pour concevoir, coder, tester, sécuriser et publier vos sites, vos applications Android et vos logiciels Windows." from={7} />
            </span>
          </p>
        </Reveal>
        <div className="mt-16 grid grid-cols-2 gap-px md:mt-24 lg:grid-cols-4">
          {CELLS.map((c, i) =>
            c ? (
              <Reveal key={i} delay={(i % 4) * 80} className={cn("checker", c.tone === "white" && "lime", c.tone === "dark" && "checker-dark", c.tone === "photo" && "checker-photo")}>
                {c.tone === "photo" && <NeonIcon name="layers" size={84} className="relative mb-5" />}
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
