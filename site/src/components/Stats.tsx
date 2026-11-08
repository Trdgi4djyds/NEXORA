import { SPACE_BY_ID } from "../data/spaces"
import { CountUp, Reveal } from "../lib/motion"

// Chiffres relevés dans NEXORA, chacun avec sa source.
const ITEMS: [number, string, string][] = [
  [15, "outils installés pour toi", "Node.js, Python, PHP, Go, Flutter, Git…"],
  [SPACE_BY_ID.dev.details?.items.length ?? 15, "modèles de projet prêts à lancer", "React, Vue, Next.js, Astro, Flutter, PHP…"],
  [SPACE_BY_ID.android.details?.items.length ?? 9, "contrôles avant le Play Store", "Signature, fichier AAB, fiche, règles…"],
  [3, "plateformes de publication", "Web · Android · Windows"],
]

export function Stats() {
  return (
    <section className="section-tight light pt-0" aria-label="NEXORA en chiffres" data-capture="chiffres">
      <div className="wrap grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5" data-glow>
        {ITEMS.map(([value, label, source], i) => (
          <Reveal className="glow hud p-7" key={label} delay={i * 90}>
            <span className="flex items-start justify-between gap-3">
              <b className="display block text-[clamp(64px,7vw,104px)] leading-[0.85] font-bold tracking-[-0.05em] tabular-nums">
                <CountUp value={value} />
              </b>
              <i className="stat-mark mt-2 size-3 rounded-[3px] bg-lime ring-1 ring-black/10" aria-hidden="true" />
            </span>
            <span className="mt-4 block text-[15px] font-medium">{label}</span>
            <small className="mt-1 block text-[13px] text-muted-foreground">{source}</small>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
