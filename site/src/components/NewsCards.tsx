import { SPACES, spaceHref } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import type { NoteItem } from "../lib/product"

/** Nouveautés d'une version (nx/version/notes.js), chacune reliée à son espace : cartes en grille. */
export function NewsCards({ items, limit }: { items: NoteItem[]; limit?: number }) {
  const list = typeof limit === "number" ? items.slice(0, limit) : items
  return (
    <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" data-glow>
      {list.map((it, i) => {
        const space = SPACES.find((s) => s.id === it.space)
        const body = (
          <>
            <span className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2.5 text-[12.5px] font-medium text-muted-foreground">
                <span className="sp-ic sm" data-space={space?.id}>
                  <Icon name={space?.icon ?? "sparkle"} size={14} />
                </span>
                {space ? space.name : "NEXORA"}
              </span>
              {space && (
                <span className="go-ring size-8" aria-hidden="true">
                  <Icon name="nxArrowUpRight" size={14} stroke={2} />
                </span>
              )}
            </span>
            <b className="display mt-5 block text-[21px] leading-tight font-medium tracking-[-0.025em]">{it.title}</b>
            <span className="mt-2 block text-[14px] leading-relaxed text-muted-foreground">{it.text}</span>
          </>
        )
        const cls = "glow lift flex h-full flex-col surface p-6"
        return (
          <Reveal as="li" key={it.title} delay={(i % 3) * 70}>
            {space ? (
              <a className={cls} href={spaceHref(space)}>
                {body}
              </a>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </Reveal>
        )
      })}
    </ul>
  )
}
