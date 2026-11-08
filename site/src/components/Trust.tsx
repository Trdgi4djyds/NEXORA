import { TRUST } from "../data/content"
import { Reveal } from "../lib/motion"
import { NeonArt } from "./NeonArt"
import { SectionHead } from "./SectionHead"

const ICONS: Record<string, string> = { Fichiers: "folder", Secrets: "key", Sessions: "layers", Outils: "shield" }

/** Confiance : fiche technique en deux colonnes, chaque garantie active par défaut. */
export function Trust() {
  return (
    <section className="section" data-capture="confiance">
      <div className="wrap">
        <SectionHead
          index="07"
          eyebrow="Confiance"
          title={["Tes projets restent", "chez toi."]}
          lead="NEXORA travaille sur ton ordinateur : ce qui est sensible est chiffré et chaque projet reste cloisonné."
        />
        <ul className="grid gap-6 md:grid-cols-2" data-glow>
          {TRUST.map((t, i) => (
            <Reveal as="li" className="glow flex gap-5 rounded-[28px] border border-foreground/[0.08] bg-card p-7" key={t.title} delay={i * 70}>
              {/* #094 : icône en néon (même illustration que les cartes d'espace, à l'échelle de la carte). */}
              <NeonArt icon={ICONS[t.label] ?? "check"} className="-m-3 size-[92px] shrink-0" />
              <span className="flex-1">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[12px] font-medium tracking-[0.06em] text-muted-foreground uppercase">{t.label}</span>
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-primary">
                    <i className="dot" /> Par défaut
                  </span>
                </span>
                <b className="display mt-2 block text-[22px] leading-tight font-bold tracking-[-0.03em]">{t.title}</b>
                <span className="mt-1.5 block text-[14.5px] leading-relaxed text-muted-foreground">{t.text}</span>
              </span>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}
