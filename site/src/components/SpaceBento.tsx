import type { CSSProperties, ReactNode } from "react"
import { SPACE_FACTS } from "../data/content"
import { SPACES, spaceHref, type SpaceId } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { cn } from "../lib/utils"
import { CITIES, Globe, type GlobeArc, type GlobeMarker } from "./Globe"
import { TileArt } from "./TileArt"
import { Device, Screen } from "./Screen"
import { Badge } from "./ui/badge"

// Ordre et forme des cartes (grille de 3 colonnes, 4 rangées pleines). #093 : plus aucune carte sur deux rangées
// (l'App Builder, haut de deux rangées, restait vide au milieu sur ordinateur) ; les cartes larges « row » posent le
// texte à gauche et l'image à droite.
type Shape = "wide" | "row" | ""
const LAYOUT: [SpaceId, Shape][] = [
  ["preview", "wide"],
  ["dev", ""],
  ["android", "row"],
  ["desktop", ""],
  ["browser", ""],
  ["studio", ""],
  ["design", ""],
  ["security", ""],
  ["home", "row"],
]

// Supervision : un serveur surveille des sites partout (décoratif).
const SEC_MARKERS: GlobeMarker[] = [CITIES.francfort, CITIES.cotonou, CITIES.newyork, CITIES.saopaulo, CITIES.singapour, CITIES.paris].map((at) => ({ at }))
const SEC_ARCS: GlobeArc[] = [
  { from: CITIES.francfort, to: CITIES.cotonou },
  { from: CITIES.francfort, to: CITIES.newyork },
  { from: CITIES.francfort, to: CITIES.singapour },
  { from: CITIES.francfort, to: CITIES.saopaulo },
]

/**
 * App Builder (#093, #094) : trois téléphones immobiles (#094 : plus aucun balancement), fondus vers le bas ;
 * notification push qui arrive et repart ; formats qui s'allument.
 */
function AppScene() {
  return (
    <span className="app-scene absolute inset-0 block">
      <span className="fade-b absolute inset-x-0 bottom-0 top-[30%] block">
        <span className="absolute bottom-[-7%] left-[2%] block w-[33%]">
          <Device kind="pixel" />
        </span>
        <span className="absolute bottom-[-3%] left-[30%] z-[2] block w-[38%]">
          <Device kind="iphone" />
        </span>
        <span className="absolute bottom-[-9%] left-[64%] block w-[33%]">
          <Device kind="galaxy" />
        </span>
      </span>
      {/* Notification de démonstration (site fictif « Kora », comme dans les écrans des appareils). */}
      <span className="push-toast absolute top-[7%] left-1/2 z-[3] flex w-[min(320px,78%)] items-center gap-3 rounded-2xl bg-white/95 p-3 text-left text-[#111] shadow-[0_20px_40px_-18px_rgb(0_0_0/0.55)]">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#1f8f52] text-white">
          <Icon name="bell" size={16} />
        </span>
        <span className="min-w-0 leading-tight">
          <b className="block text-[13px] font-semibold">Kora · maintenant</b>
          <span className="block truncate text-[12.5px] text-[#444]">Ta commande est prête à retirer.</span>
        </span>
      </span>
      <span className="absolute top-[26%] right-[5%] z-[3] hidden flex-col items-end gap-2 xl:flex">
        {["APK signé", "AAB", "PWA"].map((t, i) => (
          <span key={t} className="fmt-chip pill" style={{ "--fi": i } as CSSProperties}>
            <Icon name="check" size={13} stroke={2.6} /> {t}
          </span>
        ))}
      </span>
    </span>
  )
}

/** Capture recadrée qui s'efface en transparence vers le bas. */
function ShotArt({ id, className = "", shotClass = "" }: { id: SpaceId; className?: string; shotClass?: string }) {
  return (
    <span className={cn("relative block h-[260px] overflow-hidden", className)}>
      <span className="fade-b absolute inset-0 block pt-10 pl-7">
        <span className={cn("shot-crop block overflow-hidden rounded-tl-2xl ring-1 ring-white/25", shotClass)}>
          <Screen space={id} />
        </span>
      </span>
    </span>
  )
}

function Visual({ id }: { id: SpaceId }): ReactNode {
  if (id === "android") return <AppScene />
  if (id === "preview")
    return (
      <span className="fade-b flex items-end justify-center gap-[3.5%] px-7 pt-4 pb-8">
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
      <span className="relative flex h-[260px] items-center justify-center pb-6">
        <span className="fade-b block aspect-square h-full">
          <Globe markers={SEC_MARKERS} arcs={SEC_ARCS} density={9000} start={-0.2} />
        </span>
      </span>
    )
  if (id === "home")
    return <ShotArt id={id} className="lg:absolute lg:inset-x-0 lg:top-[16%] lg:bottom-0 lg:h-auto" shotClass="lg:w-[150%] lg:translate-y-[24%]" />
  return <ShotArt id={id} />
}

/**
 * Grille des espaces. #095 : illustration de fond plein dans chaque carte (rubans, TileArt), lumière fluo, images
 * fondues en transparence, appareils immobiles (#094). #092 (« Signal ») : chaque carte est un aplat à la couleur de son espace (data-space), titre en
 * grotesque serrée, fait vérifié dans une pastille à l'encre de la carte ; vraie capture recadrée, vrais appareils
 * (Responsive Lab, App Builder) ou globe animé (Sécurité, dessiné à l'encre de la carte).
 */
export function SpaceBento() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5" data-glow>
      {LAYOUT.map(([id, shape], i) => {
        const s = SPACES.find((x) => x.id === id)!
        const [value, caption] = SPACE_FACTS[id]
        return (
          <Reveal
            as="a"
            key={id}
            href={spaceHref(s)}
            data-space={id}
            className={cn("glow lift tile group flex flex-col", shape && "lg:col-span-2", shape === "row" && "lg:min-h-[400px] lg:flex-row")}
            delay={(i % 3) * 90}
          >
            <TileArt space={id} />
            <i className="tile-fluo" aria-hidden="true" />
            <span className={cn("relative z-[1] flex flex-col gap-3 p-7 pb-6 md:p-8", shape === "row" && "lg:w-[46%] lg:shrink-0 lg:pr-4")}>
              <span className="flex items-center justify-between gap-3">
                {/* #089 : sur téléphone, le nom reste d'un seul tenant et la pastille passe à la ligne. */}
                <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="sp-ic sm">
                    <Icon name={s.icon} size={15} />
                  </span>
                  <span className="font-mono text-[12px] font-medium tracking-[0.06em] whitespace-nowrap uppercase">{s.name}</span>
                  {(id === "preview" || id === "browser") && <Badge>Gratuit</Badge>}
                  {/* #087 : 2 applications gratuites, App Builder et Desktop Builder confondus. */}
                  {(id === "android" || id === "desktop") && <Badge>2 apps gratuites</Badge>}
                  {s.plan === "pro" && <Badge>Pro</Badge>}
                </span>
                <span className="go-ring" aria-hidden="true">
                  <Icon name="nxArrowUpRight" size={15} stroke={2} />
                </span>
              </span>
              <span className={cn("display mt-4 text-[clamp(30px,2.9vw,42px)] leading-[0.95] font-bold tracking-[-0.035em]", shape === "row" && "lg:mt-auto")}>{s.card}</span>
              <span className="max-w-[44ch] text-[15px] leading-relaxed text-muted-foreground">{s.tagline}</span>
              <span className="pill mt-2">
                <b className="whitespace-nowrap">{value}</b> {caption}
              </span>
            </span>
            <span className={cn("tile-visual relative mt-auto flex-1", id === "android" && "min-h-[300px] overflow-hidden lg:mt-0", id === "home" && "lg:mt-0")} aria-hidden="true">
              <Visual id={id} />
            </span>
          </Reveal>
        )
      })}
    </div>
  )
}
