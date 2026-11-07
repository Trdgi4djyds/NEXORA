import { SPACES, spaceHref } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import type { NoteItem } from "../lib/product"

/** Cartes des nouveautés d'une version (nx/version/notes.js), chacune reliée à son espace. */
export function NewsCards({ items, limit }: { items: NoteItem[]; limit?: number }) {
  const list = typeof limit === "number" ? items.slice(0, limit) : items
  return (
    <div className="news-grid">
      {list.map((it, i) => {
        const space = SPACES.find((s) => s.id === it.space)
        const body = (
          <>
            <span className="sp-ic">
              <Icon name={it.icon} size={19} />
            </span>
            <span className="news-title">{it.title}</span>
            <span className="news-text">{it.text}</span>
            {space && (
              <span className="link-arrow">
                {space.name} <Icon name="nxArrowRight" size={15} stroke={2} />
              </span>
            )}
          </>
        )
        return space ? (
          <Reveal as="a" href={spaceHref(space)} key={it.title} className="news-card" data-space={space.id} delay={(i % 3) * 80}>
            {body}
          </Reveal>
        ) : (
          <Reveal key={it.title} className="news-card" data-space="home" delay={(i % 3) * 80}>
            {body}
          </Reveal>
        )
      })}
    </div>
  )
}
