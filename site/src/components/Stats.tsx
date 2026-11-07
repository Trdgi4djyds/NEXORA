import { Icon } from "../lib/icons"
import { CountUp, Reveal } from "../lib/motion"
import { DEVICE_COUNT } from "../lib/product"

const ITEMS: [number, string, string, string][] = [
  [9, "espaces de travail", "home", "grid"],
  [DEVICE_COUNT, "appareils réels à l’écran", "preview", "phone"],
  [15, "outils installés pour toi", "dev", "wrench"],
  [3, "plateformes : web, Android, Windows", "android", "rocket"],
]

export function Stats() {
  return (
    <section className="stats" aria-label="NEXORA en chiffres" data-capture="chiffres">
      <div className="container stats-grid">
        {ITEMS.map(([value, label, space, icon], i) => (
          <Reveal className="stat" key={label} delay={i * 90} data-space={space}>
            <span className="sp-ic solid stat-ic">
              <Icon name={icon} size={18} />
            </span>
            <b>
              <CountUp value={value} />
            </b>
            <span>{label}</span>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
