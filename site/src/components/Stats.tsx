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
    <section className="section-tight pt-0" aria-label="NEXORA en chiffres" data-capture="chiffres">
      <div className="wrap grid gap-6 sm:grid-cols-2 lg:grid-cols-4" data-glow>
        {ITEMS.map(([value, label, source], i) => (
          <Reveal className="glow hud rounded-[4px] p-6" key={label} delay={i * 90}>
            <b className="block text-[clamp(44px,5vw,64px)] leading-none font-semibold tracking-[-0.04em] text-primary tabular-nums [text-shadow:0_0_30px_rgb(var(--neon)/0.4)]">
              <CountUp value={value} />
            </b>
            <span className="mt-4 block text-[15px] font-medium">{label}</span>
            <small className="mt-1 block text-[13px] text-muted-foreground">{source}</small>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
