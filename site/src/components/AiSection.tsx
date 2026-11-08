import type { CSSProperties } from "react"
import { AI_USES } from "../data/content"
import { SPACE_BY_ID } from "../data/spaces"
import { AI } from "../data/stack"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { Circuit } from "./Backdrop"
import { Logo } from "./Logo"
import { Screen, Window } from "./Screen"
import { SectionHead } from "./SectionHead"

/** Assistant IA (#086) : panneau à liseré rose, logos officiels des fournisseurs, usages par espace, vraie capture du Dev Lab. */
export function AiSection() {
  return (
    <section className="section light" data-capture="ia">
      <div className="wrap">
        <div className="panel-hi relative overflow-hidden rounded-[36px] px-6 py-12 md:px-14 md:py-16">
          <Circuit seed={31} count={12} className="opacity-70" />
          <i className="halo top-[-200px] right-[-120px] h-[420px] w-[520px] opacity-[0.12]" aria-hidden="true" />
          <div className="relative">
            <SectionHead
              index="05"
              eyebrow="Assistant IA"
              title={["Ton IA, ta clé,", "sans limite."]}
              lead="Branche ton propre compte Claude, GPT, Gemini ou Mistral, ou fais tourner Ollama sur ton PC. NEXORA ne compte pas tes requêtes et ne facture rien pour l’IA."
              className="mb-10 md:mb-12"
            />
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div>
                <Reveal className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                  {AI.map((p) => (
                    <span key={p.name} className="surface flex flex-col items-center gap-2.5 px-2 py-4 text-[12.5px] font-medium text-foreground/85">
                      <Logo name={p.logo} size={30} />
                      {p.name}
                    </span>
                  ))}
                </Reveal>
                <ul className="mt-8 flex flex-col gap-3" data-glow>
                  {AI_USES.map((u, i) => (
                    <Reveal as="li" className="glow surface flex items-start gap-4 p-4" key={u.title} delay={80 + i * 70}>
                      <span className="sp-ic sm mt-0.5">
                        <Icon name={SPACE_BY_ID[u.space].icon} size={15} />
                      </span>
                      <span>
                        <b className="block text-[14.5px] font-semibold">{SPACE_BY_ID[u.space].name}</b>
                        <span className="text-[14px] text-muted-foreground">{u.text}</span>
                      </span>
                    </Reveal>
                  ))}
                </ul>
              </div>
              <Reveal delay={120}>
                <div className="par" data-tilt style={{ "--k": "6px" } as CSSProperties}>
                  <Window title="NEXORA — Dev Lab">
                    <Screen space="dev" />
                  </Window>
                </div>
                <p className="mt-5 text-center text-[13px] text-muted-foreground">Le Dev Lab, où l’assistant propose ses changements fichier par fichier.</p>
              </Reveal>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
