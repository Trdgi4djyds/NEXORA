import { PERSONAS } from "../data/content"
import { SPACE_BY_ID, spaceHref } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { SectionHead } from "./SectionHead"

/** « Pour qui ? » : quatre cartes à photo (noir et blanc, en couleur au survol). */
export function Personas() {
  return (
    <section className="section" data-capture="pour-qui">
      <div className="wrap">
        <SectionHead
          index="06"
          eyebrow="Pour qui ?"
          title={["Quatre façons", "de travailler avec NEXORA."]}
          lead="Freelance, agence, commerce ou salle de classe : chacun y trouve l’espace qui lui fait gagner le plus de temps."
        />
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4" data-glow>
          {PERSONAS.map((p, i) => (
            <Reveal as="li" key={p.title} delay={i * 80}>
              <a className="glow lift surface group flex h-full flex-col overflow-hidden" href={spaceHref(SPACE_BY_ID[p.space])}>
                <span className="relative block aspect-[4/3] overflow-hidden">
                  <img src={p.photo} alt={p.alt} loading="lazy" width={960} height={720} className="h-full w-full object-cover grayscale transition duration-700 group-hover:scale-105 group-hover:grayscale-0" />
                  <span className="absolute inset-0 bg-black/30 transition group-hover:bg-transparent" />
                  <span className="absolute top-3 left-3 rounded-full bg-lime px-2.5 py-1 font-mono text-[11.5px] font-medium tabular-nums text-ink">{String(i + 1).padStart(2, "0")}</span>
                </span>
                <span className="flex flex-1 flex-col p-6">
                  <b className="display text-[24px] leading-tight font-bold tracking-[-0.03em]">{p.title}</b>
                  <span className="mt-2 flex-1 text-[14px] leading-relaxed text-muted-foreground">{p.text}</span>
                  <span className="link-arrow mt-5 text-[14px]">
                    {p.link} <Icon name="nxArrowRight" size={15} stroke={2} />
                  </span>
                </span>
              </a>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}
