import { SPACE_FACTS } from "../data/content"
import { SPACES, spaceHref } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { GlassTile } from "./Neon"
import { Screen } from "./Screen"

/**
 * Grille des espaces. #099 (« Horizon ») : cartes « projet » de la référence : nom et offre en tête, vraie capture
 * de NEXORA (thème sombre) avec son repère « /tag » et un rond blanc à flèche, puis deux lignes de méta-données
 * (ce que vous y faites, un fait vérifié). Remplace les aplats colorés de « Signal » (#092 à #095). #101 : tuile de verre à icône néon.
 * #117 : numéro de l'espace dans le coin (au lieu de l'offre), lignes « Le besoin » et « La réponse ».
 */
export function SpaceBento() {
  return (
    <div className="grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
      {SPACES.map((s, i) => {
        const [value, caption] = SPACE_FACTS[s.id]
        return (
          <Reveal as="a" key={s.id} href={spaceHref(s)} data-space={s.id} className="proj group flex flex-col" delay={(i % 3) * 90}>
            <span className="flex items-baseline justify-between gap-3 border-t border-foreground/15 pt-3 text-[14px]">
              <b className="font-medium">{s.name}</b>
              <span className="text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
            </span>
            <span className="proj-shot mt-3" aria-hidden="true">
              <Screen space={s.id} />
              {/* #101 : tuile de verre à icône néon, posée sur la capture. */}
              <GlassTile space={s.id} size="sm" label={false} className="absolute top-3 left-3 z-[1]" />
              <span className="eyebrow absolute right-4 top-4 z-[1] border-white/50 bg-black/30 text-white backdrop-blur-md">{s.rail}</span>
              <span className="orb sm absolute right-4 bottom-4 z-[1]">
                <Icon name="nxArrowUpRight" size={15} stroke={2} />
              </span>
            </span>
            <dl className="mt-4 grid grid-cols-[110px_1fr] gap-x-4 gap-y-1.5 text-[13.5px] leading-snug">
              <dt className="text-muted-foreground">Le besoin</dt>
              <dd>{s.need}</dd>
              <dt className="text-muted-foreground">La réponse</dt>
              <dd>{s.card}</dd>
              <dt className="text-muted-foreground">Repère</dt>
              <dd>
                <b className="font-semibold">{value}</b> {caption}
              </dd>
            </dl>
          </Reveal>
        )
      })}
    </div>
  )
}
