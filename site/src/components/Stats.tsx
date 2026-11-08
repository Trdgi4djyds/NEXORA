import { CountUp, Reveal } from "../lib/motion"
import { SPACE_BY_ID } from "../data/spaces"

// Chiffres relevés dans NEXORA, chacun avec sa source (#069 : plus de pastille d'icône). #072 : « 9 espaces » et
// « 181 appareils » répétaient le hero et la section 01 ; à leur place, deux chiffres que le site ne donnait pas.
const ITEMS: [number, string, string, string][] = [
  [15, "outils installés pour toi", "Node.js, Python, PHP, Go, Flutter, Git…", "dev"],
  [SPACE_BY_ID.dev.details?.items.length ?? 15, "modèles de projet prêts à lancer", "React, Vue, Next.js, Astro, Flutter, PHP…", "browser"],
  [SPACE_BY_ID.android.details?.items.length ?? 9, "contrôles avant le Play Store", "Signature, fichier AAB, fiche, règles…", "android"],
  [3, "plateformes de publication", "Web · Android · Windows", "desktop"],
]

export function Stats() {
  return (
    <section className="stats" aria-label="NEXORA en chiffres" data-capture="chiffres">
      <div className="container stats-grid" data-glow>
        {ITEMS.map(([value, label, source, space], i) => (
          <Reveal className="stat glow" key={label} delay={i * 90} data-space={space}>
            <b>
              <CountUp value={value} />
            </b>
            <span className="stat-l">{label}</span>
            <small className="stat-s">{source}</small>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
