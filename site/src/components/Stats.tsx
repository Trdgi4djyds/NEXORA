import { CountUp, Reveal } from "../lib/motion"
import { DEVICE_COUNT } from "../lib/product"

// Chiffres relevés dans NEXORA, chacun avec sa source (#069 : plus de pastille d'icône).
const ITEMS: [number, string, string, string][] = [
  [9, "espaces de travail", "Du Responsive Lab au Desktop Builder", "home"],
  [DEVICE_COUNT, "appareils réels à l’écran", "Catalogue du Responsive Lab", "preview"],
  [15, "outils installés pour toi", "Node.js, Python, PHP, Go, Flutter, Git…", "dev"],
  [3, "plateformes de publication", "Web · Android · Windows", "android"],
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
