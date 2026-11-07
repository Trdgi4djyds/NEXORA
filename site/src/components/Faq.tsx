import { useState } from "react"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"

/** Questions fréquentes en accordéon (une réponse ouverte à la fois). */
export function Faq({ items, idPrefix = "faq" }: { items: { q: string; a: string }[]; idPrefix?: string }) {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="faq">
      {items.map((it, i) => {
        const on = open === i
        return (
          <Reveal className={`faq-item${on ? " open" : ""}`} key={it.q} delay={Math.min(i, 5) * 50}>
            <h3>
              <button type="button" id={`${idPrefix}-q-${i}`} aria-expanded={on} aria-controls={`${idPrefix}-a-${i}`} onClick={() => setOpen(on ? null : i)}>
                <span>{it.q}</span>
                <span className="faq-ic">
                  <Icon name="plus" size={18} stroke={2} />
                </span>
              </button>
            </h3>
            <div className="faq-a" id={`${idPrefix}-a-${i}`} role="region" aria-labelledby={`${idPrefix}-q-${i}`} aria-hidden={!on}>
              <div>
                <p>{it.a}</p>
              </div>
            </div>
          </Reveal>
        )
      })}
    </div>
  )
}
