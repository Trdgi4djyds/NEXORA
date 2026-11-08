import type { ReactNode } from "react"
import { SPACE_FACTS } from "../data/content"
import { SPACES, spaceHref, type SpaceId } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { cn } from "../lib/utils"
import { CITIES, Globe, type GlobeArc, type GlobeMarker } from "./Globe"
import { Device, Screen } from "./Screen"
import { Badge } from "./ui/badge"

// Ordre et taille des cartes (grille de 3 colonnes, 12 cases pleines) : les espaces phares en grand.
const LAYOUT: [SpaceId, string][] = [
  ["preview", "lg:col-span-2"],
  ["dev", ""],
  ["android", "lg:row-span-2"],
  ["desktop", ""],
  ["browser", ""],
  ["studio", ""],
  ["design", ""],
  ["security", ""],
  ["home", "lg:col-span-2"],
]

// Supervision : un serveur surveille des sites partout (décoratif).
const SEC_MARKERS: GlobeMarker[] = [CITIES.francfort, CITIES.cotonou, CITIES.newyork, CITIES.saopaulo, CITIES.singapour, CITIES.paris].map((at) => ({ at }))
const SEC_ARCS: GlobeArc[] = [
  { from: CITIES.francfort, to: CITIES.cotonou },
  { from: CITIES.francfort, to: CITIES.newyork },
  { from: CITIES.francfort, to: CITIES.singapour },
  { from: CITIES.francfort, to: CITIES.saopaulo },
]

function Visual({ id }: { id: SpaceId }): ReactNode {
  if (id === "android")
    return (
      <span className="flex h-full items-end justify-center gap-[8%] px-8 pt-2 pb-8">
        <span className="shot-crop block w-[44%] max-w-[170px]">
          <Device kind="galaxy" />
        </span>
        <span className="shot-crop block w-[42%] max-w-[162px]">
          <Device kind="iphone" />
        </span>
      </span>
    )
  if (id === "preview")
    return (
      <span className="flex items-end justify-center gap-[3.5%] px-7 pt-4 pb-8">
        <span className="w-[50%] max-w-[380px]">
          <Device kind="macbook" />
        </span>
        <span className="w-[16%] max-w-[122px]">
          <Device kind="ipad" />
        </span>
        <span className="w-[8%] max-w-[60px]">
          <Device kind="galaxy" />
        </span>
        <span className="w-[7.8%] max-w-[58px]">
          <Device kind="iphone" />
        </span>
      </span>
    )
  if (id === "security")
    return (
      <span className="flex h-full items-center justify-center pb-8">
        <span className="block aspect-square w-[74%] max-w-[260px]">
          <Globe markers={SEC_MARKERS} arcs={SEC_ARCS} density={9000} start={-0.2} />
        </span>
      </span>
    )
  return (
    <span className="block pl-7">
      <span className="shot-crop block overflow-hidden rounded-tl-xl border-t border-l border-white/10 shadow-[0_-20px_60px_-20px_rgb(0_0_0/0.8)]">
        <Screen space={id} />
      </span>
    </span>
  )
}

/**
 * Grille des espaces : vraie capture recadrée, ou vrais appareils (Responsive Lab, App Builder) entièrement dans leur
 * carte, ou globe animé (Sécurité) ; un fait vérifié par carte. Bordure lumineuse rose qui suit le pointeur.
 */
export function SpaceBento() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-glow>
      {LAYOUT.map(([id, size], i) => {
        const s = SPACES.find((x) => x.id === id)!
        const [value, caption] = SPACE_FACTS[id]
        return (
          <Reveal as="a" key={id} href={spaceHref(s)} className={cn("glow lift surface group flex min-h-[420px] flex-col overflow-hidden", size)} delay={(i % 3) * 90}>
            <span className="flex flex-col gap-3 p-8 pb-6">
              <span className="flex items-center justify-between gap-3">
                {/* #089 : sur téléphone, le nom reste d'un seul tenant (« App / Builder » se cassait) et la pastille passe à la ligne. */}
                <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="sp-ic sm">
                    <Icon name={s.icon} size={15} />
                  </span>
                  <span className="text-[13px] font-medium whitespace-nowrap text-muted-foreground">{s.name}</span>
                  {(id === "preview" || id === "browser") && <Badge>Gratuit</Badge>}
                  {/* #087 : 2 applications gratuites, App Builder et Desktop Builder confondus. */}
                  {(id === "android" || id === "desktop") && <Badge>2 apps gratuites</Badge>}
                  {s.plan === "pro" && <Badge variant="outline">Pro</Badge>}
                </span>
                <span className="go-ring" aria-hidden="true">
                  <Icon name="nxArrowUpRight" size={15} stroke={2} />
                </span>
              </span>
              <span className="title-3 mt-2 text-foreground">{s.card}</span>
              <span className="max-w-[46ch] text-[14.5px] leading-relaxed text-muted-foreground">{s.tagline}</span>
              <span className="mt-1 inline-flex w-fit items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-[12.5px] text-muted-foreground">
                <b className="font-semibold whitespace-nowrap text-primary">{value}</b> {caption}
              </span>
            </span>
            <span className="relative mt-auto flex-1" aria-hidden="true">
              <Visual id={id} />
            </span>
          </Reveal>
        )
      })}
    </div>
  )
}
