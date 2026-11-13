import type { Shift } from "../data/content"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { cn } from "../lib/utils"

/**
 * NEXORA #117 : « Sans NEXORA → Avec NEXORA ». Une ligne par besoin : à gauche ce qui freine aujourd'hui (barré d'un
 * filet discret), à droite ce que NEXORA change. Sur ordinateur, deux colonnes titrées et une flèche entre les deux ;
 * sur téléphone, chaque ligne s'empile avec ses deux libellés. Suit le thème de la section (clair ou sombre).
 */
export function Shifts({ items, className = "" }: { items: Shift[]; className?: string }) {
  return (
    <div className={cn("shifts", className)}>
      <div className="shifts-head" aria-hidden="true">
        <span>Sans NEXORA</span>
        <i />
        <span>Avec NEXORA</span>
      </div>
      <ol className="shifts-list">
        {items.map((s, i) => (
          <Reveal as="li" key={s.before} className="shifts-row" delay={(i % 5) * 60}>
            <p className="shifts-before">
              <small>Sans NEXORA</small>
              {s.before}
            </p>
            <span className="shifts-arrow" aria-hidden="true">
              <Icon name="nxArrowRight" size={16} stroke={2} />
            </span>
            <p className="shifts-after">
              <small>Avec NEXORA</small>
              <Icon name="check" size={15} stroke={2.6} className="shifts-check" />
              <span>{s.after}</span>
            </p>
          </Reveal>
        ))}
      </ol>
    </div>
  )
}
