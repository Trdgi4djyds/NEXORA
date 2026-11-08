import { SPACES, spaceHref } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import type { NoteItem } from "../lib/product"

/**
 * Nouveautés d'une version (nx/version/notes.js), chacune reliée à son espace. #069 : journal des changements en
 * lignes (espace, titre, texte) au lieu de cartes à icône ; lignes éclairées à la couleur de l'espace au survol.
 */
export function NewsCards({ items, limit }: { items: NoteItem[]; limit?: number }) {
  const list = typeof limit === "number" ? items.slice(0, limit) : items
  return (
    <ul className="news" data-glow>
      {list.map((it, i) => {
        const space = SPACES.find((s) => s.id === it.space)
        const body = (
          <>
            <span className="news-k">
              <i className="dot" /> {space ? space.name : "NEXORA"}
            </span>
            <span className="news-v">
              <b>{it.title}</b>
              <span>{it.text}</span>
            </span>
            <span className="news-go" aria-hidden="true">
              {space && <Icon name="nxArrowUpRight" size={16} stroke={2} />}
            </span>
          </>
        )
        return (
          <Reveal as="li" key={it.title} className="news-row glow" data-space={space?.id ?? "home"} delay={(i % 4) * 60}>
            {space ? (
              <a className="news-a" href={spaceHref(space)}>
                {body}
              </a>
            ) : (
              <div className="news-a">{body}</div>
            )}
          </Reveal>
        )
      })}
    </ul>
  )
}
