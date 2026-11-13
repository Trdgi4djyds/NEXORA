import { useState } from "react"
import { SPACE_FACTS } from "../data/content"
import { SPACES, spaceHref } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { NeonIcon } from "./Neon"
import { Words } from "./SectionHead"

/**
 * #102 : index des 9 espaces. À gauche, une scène de verre présente l'espace survolé ou sélectionné au clavier (icône
 * néon, besoin auquel il répond (#117, à la place de l'offre), fait vérifié) ; à droite, la liste numérotée des espaces, un lien par espace avec un seul nom
 * (le #101 lisait « AccueilAccueil » : pilule et nom répétés). Sur téléphone, la liste seule, avec la phrase de chaque
 * espace sous son nom.
 */
export function SpaceRow() {
  const [active, setActive] = useState(0)
  const s = SPACES[active]
  const [value, label] = SPACE_FACTS[s.id]
  return (
    <section className="section relative overflow-hidden" aria-labelledby="space-row-title" data-capture="espaces-cartes">
      <Reveal className="wrap-wide flex flex-wrap items-end justify-between gap-6">
        <div>
          <span className="eyebrow">9 espaces</span>
          <h2 className="title-2 words mt-5 max-w-[18ch]" id="space-row-title">
            <Words text="Un besoin précis," /> <span className="tone"><Words text="un espace pour y répondre." from={3} /></span>
          </h2>
        </div>
        <p className="max-w-[40ch] text-[15px] leading-relaxed text-muted-foreground">Voir votre site sur tous les écrans, comprendre une erreur, coder sans rien installer, publier une app, rester en ligne : chaque espace règle un besoin, tous sur le même projet.</p>
      </Reveal>
      <div className="wrap-wide mt-14 grid gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-16">
        <Reveal className="sx-stage max-lg:hidden" aria-hidden="true">
          <i className="sx-rings" />
          <div key={s.id} className="sx-swap">
            <span className="sx-num">
              {String(active + 1).padStart(2, "0")}
              <small> / 09</small>
            </span>
            <div className="sx-icon">
              <NeonIcon name={s.icon} size={120} />
            </div>
            <div className="sx-foot">
              <span className="sx-plan">{s.subtitle}</span>
              <b className="sx-name">{s.name}</b>
              <span className="sx-sub">{s.need}</span>
              <span className="sx-fact">
                <b>{value}</b> {label}
              </span>
            </div>
          </div>
        </Reveal>
        <Reveal delay={80}>
          <ol className="sx-list">
            {SPACES.map((sp, i) => (
              <li key={sp.id}>
                <a href={spaceHref(sp)} className="sx-row" data-on={i === active ? "" : undefined} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)}>
                  <span className="sx-i">{String(i + 1).padStart(2, "0")}</span>
                  <span className="sx-ic">
                    <NeonIcon name={sp.icon} size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="sx-t">{sp.name}</b>
                    <span className="sx-d">{sp.card}</span>
                  </span>
                  <span className="sx-go" aria-hidden="true">
                    <Icon name="nxArrowUpRight" size={15} stroke={2} />
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  )
}
