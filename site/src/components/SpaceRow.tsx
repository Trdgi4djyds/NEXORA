import type { CSSProperties } from "react"
import { SPACES, spaceHref } from "../data/spaces"
import { Reveal } from "../lib/motion"
import { cn } from "../lib/utils"
import { NeonIcon } from "./Neon"
import { Words } from "./SectionHead"

/**
 * #101 : bandeau des espaces, d'après l'image de référence de l'utilisateur (cartes de verre inclinées en
 * perspective qui se chevauchent, objet lumineux au centre, nom en pilule à cheval sur le bord, alternativement en
 * haut et en bas). Ici, chaque carte porte l'icône néon de l'espace et ouvre sa page. Défile de côté sur téléphone.
 */
export function SpaceRow() {
  return (
    <section className="section-tight relative overflow-hidden" aria-labelledby="space-row-title" data-capture="espaces-cartes">
      <Reveal className="wrap-wide flex flex-wrap items-end justify-between gap-6">
        <div>
          <span className="eyebrow">9 espaces</span>
          <h2 className="title-2 words mt-5 max-w-[18ch]" id="space-row-title">
            <Words text="Tout ce qu’il faut," /> <span className="tone"><Words text="rangé par métier." from={4} /></span>
          </h2>
        </div>
        <p className="max-w-[40ch] text-[15px] leading-relaxed text-muted-foreground">Design, code, tests, applications, 3D, sécurité et supervision : un espace par métier, tous ouverts sur le même projet.</p>
      </Reveal>
      <div className="sr-track" role="list">
        {SPACES.map((s, i) => (
          <a key={s.id} href={spaceHref(s)} className={cn("sr-card", i % 2 ? "down" : "up")} role="listitem" style={{ "--i": i } as CSSProperties}>
            <i className="sr-light" aria-hidden="true" />
            <NeonIcon name={s.icon} size={92} />
            <span className="sr-pill">{s.rail}</span>
            <span className="sr-name">{s.name}</span>
          </a>
        ))}
      </div>
    </section>
  )
}
