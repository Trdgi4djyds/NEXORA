import { TRUST } from "../data/content"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
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
            <Reveal as="li" className="glow flex gap-5 rounded-[22px] border border-white/[0.08] bg-card p-7" key={t.title} delay={i * 70}>
              <span className="sp-ic">
                <Icon name={ICONS[t.label] ?? "check"} size={19} />
              </span>
              <span className="flex-1">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t.label}</span>
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-primary">
                    <i className="dot" /> Par défaut
                  </span>
                </span>
                <b className="mt-2 block text-[17px] font-semibold">{t.title}</b>
                <span className="mt-1.5 block text-[14.5px] leading-relaxed text-muted-foreground">{t.text}</span>
              </span>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}
