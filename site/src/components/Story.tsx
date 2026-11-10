import { useState } from "react"
import { STORY } from "../data/content"
import { SPACE_BY_ID, spaceHref } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { RENDUS } from "../lib/rendus"
import { cn } from "../lib/utils"
import { Words } from "./SectionHead"

/**
 * Récit « De l'idée à la publication ». #099 (« Horizon ») : section « services » de la référence : en-tête en deux
 * tons et chapeau à droite, rendu 3D d'un Studio Display sur NEX-DESIGN (#100) à gauche, étapes dépliables à droite (une
 * seule ouverte : texte, points, lien vers l'espace). Remplace la frise et la fenêtre collante de « Signal ».
 */
export function Story() {
  const [open, setOpen] = useState(0)
  return (
    <section className="section light" id="parcours" data-capture="parcours">
      <div className="wrap-wide">
        <Reveal className="grid items-end gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16">
          <div>
            <span className="eyebrow">de l’idée à la publication</span>
            <h2 className="title-2 words mt-6 max-w-[18ch]">
              <Words text="Chaque étape a son espace," /> <span className="tone"><Words text="sans changer d’outil." from={5} /></span>
            </h2>
          </div>
          <p className="lead max-w-[46ch] text-[15px]! lg:justify-self-end">
            Conçois, code, teste, sécurise, publie et présente : chaque espace reprend ton projet là où le précédent s’est arrêté, sur ton PC.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-10 lg:mt-20 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-16">
          <Reveal className="relative flex min-h-[340px] items-center justify-center overflow-hidden rounded-md border border-foreground/[0.08] bg-[#0b0914] p-6 lg:min-h-0">
            <i className="aurora" aria-hidden="true" />
            <img src={RENDUS.studioDisplay.src} alt={RENDUS.studioDisplay.alt} loading="lazy" width={RENDUS.studioDisplay.w} height={RENDUS.studioDisplay.h} className="relative z-[1] w-[88%] max-w-[560px] drop-shadow-[0_30px_40px_rgb(0_0_0/0.55)]" />
            <span className="absolute right-5 bottom-5 left-5 z-[2] flex items-end justify-between gap-4 text-white">
              <span className="max-w-[28ch] text-[15px] leading-snug">Tout tourne sur ton ordinateur : tes fichiers ne quittent pas ton PC.</span>
              <a href="/espaces" className="orb" aria-label="Voir les 9 espaces">
                <Icon name="nxArrowUpRight" size={18} stroke={2} />
              </a>
            </span>
          </Reveal>
          <ol className="border-t border-foreground/12">
            {STORY.map((s, i) => {
              const sp = SPACE_BY_ID[s.space]
              const on = i === open
              return (
                <li key={s.space} className="border-b border-foreground/12">
                  <button type="button" className="flex w-full items-center gap-5 py-5 text-left" aria-expanded={on} aria-controls={`etape-${s.space}`} onClick={() => setOpen(on ? -1 : i)}>
                    <span className="w-7 shrink-0 text-[13px] text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex-1">
                      <span className="block text-[13px] text-muted-foreground">
                        {s.verb} · {sp.name}
                      </span>
                      <span className="mt-0.5 block text-[clamp(19px,1.6vw,23px)] leading-snug font-medium">{s.title}</span>
                    </span>
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-full border border-foreground/25 transition duration-300", on && "rotate-45 border-foreground bg-foreground text-background")} aria-hidden="true">
                      <Icon name="plus" size={16} stroke={1.8} />
                    </span>
                  </button>
                  <div id={`etape-${s.space}`} className={cn("grid transition-[grid-template-rows] duration-500 ease-out", on ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                    <div className="overflow-hidden">
                      <div className="pb-6 pl-12">
                        <p className="max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground">{s.text}</p>
                        <ul className="mt-4 flex flex-wrap gap-2">
                          {s.points.map((p) => (
                            <li key={p} className="rounded-full border border-foreground/15 px-3 py-1 text-[13px] text-foreground/85">
                              {p}
                            </li>
                          ))}
                        </ul>
                        <a className="link-arrow mt-5 text-[14px]" href={spaceHref(sp)} tabIndex={on ? undefined : -1}>
                          Découvrir {sp.name} <Icon name="nxArrowRight" size={13} stroke={2} />
                        </a>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}
