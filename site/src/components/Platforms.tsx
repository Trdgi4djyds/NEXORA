import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { HOSTS } from "../data/stack"
import { SITE_DESKTOP } from "../lib/devices"
import { Icon } from "../lib/icons"
import { Reveal, useInView, useMedia, usePageVisible, useReducedMotion } from "../lib/motion"
import { cn } from "../lib/utils"
import { CITIES, Globe, type GlobeArc, type GlobeMarker } from "./Globe"
import { Logo } from "./Logo"
import { Browser, Device, Window } from "./Screen"
import { SectionHead } from "./SectionHead"

const PERIOD = 5600

const PLATFORMS: { id: string; icon: string; logos: string[]; title: string; text: string; points: string[] }[] = [
  {
    id: "web",
    icon: "globe",
    logos: ["cloudflare", "vercel", "netlify", "github"],
    title: "Sur le web",
    text: "Partage ton projet par une adresse publique, puis mets-le en ligne chez les principaux hébergeurs, contrôlé sur trois appareils avant chaque publication.",
    points: ["Partage en ligne (Pro)", "Cloudflare, Vercel, Netlify, GitHub Pages (Pro)", "Contrôles avant mise en ligne"],
  },
  {
    id: "android",
    icon: "android",
    logos: ["android", "googleplay"],
    title: "Sur Android",
    text: "Le même site devient une application signée, sur téléphone, pliable et tablette, avec ses notifications push et une fiche prête pour le Play Store.",
    points: ["APK et AAB signés", "Notifications push", "Tests fermés et Play Store"],
  },
  {
    id: "windows",
    icon: "display",
    logos: ["windows", "electron"],
    title: "Sur Windows",
    text: "Et le même site devient un logiciel installable, avec mises à jour automatiques et distribution par winget ou le Microsoft Store.",
    points: ["Installateur, portable, ZIP et MSI", "Mises à jour automatiques", "winget et Microsoft Store"],
  },
]

// Publication : depuis ton PC vers le monde entier (décoratif).
const MARKERS: GlobeMarker[] = [CITIES.cotonou, CITIES.paris, CITIES.newyork, CITIES.saopaulo, CITIES.johannesburg, CITIES.mumbai, CITIES.tokyo, CITIES.sydney, CITIES.montreal].map((at) => ({ at }))
const ARCS: GlobeArc[] = [
  { from: CITIES.cotonou, to: CITIES.paris },
  { from: CITIES.cotonou, to: CITIES.newyork },
  { from: CITIES.cotonou, to: CITIES.saopaulo },
  { from: CITIES.cotonou, to: CITIES.johannesburg },
  { from: CITIES.cotonou, to: CITIES.mumbai },
  { from: CITIES.paris, to: CITIES.tokyo },
  { from: CITIES.newyork, to: CITIES.montreal },
  { from: CITIES.mumbai, to: CITIES.sydney },
]

function Chip({ logo, children, className = "" }: { logo: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn("chip-glass absolute", className)}>
      <Logo name={logo} size={18} />
      {children}
    </span>
  )
}

/** Bureau Windows 11 sur la Surface : fond d'écran, fenêtre du logiciel créé par le Desktop Builder, barre des tâches. */
function WindowsDesktop() {
  return (
    <span className="absolute inset-0 overflow-hidden bg-[#0b0712]">
      <i className="absolute top-[-30%] left-[15%] h-[90%] w-[70%] rounded-full bg-primary opacity-25 blur-[60px]" />
      <i className="absolute right-[-10%] bottom-[-20%] h-[70%] w-[50%] rounded-full bg-brand-blue opacity-20 blur-[50px]" />
      <span className="absolute inset-x-[7%] top-[7%] bottom-[16%]">
        <Window title="Mon site" icon={null} compact className="h-full">
          <img src={SITE_DESKTOP} alt="Ce site devenu un logiciel Windows" className="block w-full" loading="lazy" />
        </Window>
      </span>
      <span className="absolute inset-x-0 bottom-0 flex h-[9%] items-center justify-center gap-[1.4%] border-t border-white/10 bg-[#0e0d12]/90 backdrop-blur" aria-hidden="true">
        <Logo name="windows" size={14} />
        <i className="grid size-[3.2%] min-h-3 min-w-3 place-items-center rounded-[3px] bg-primary text-[7px] font-bold not-italic text-primary-foreground">N</i>
      </span>
    </span>
  )
}

/**
 * « Un projet, trois plateformes » (#086) : globe animé en fond (arcs de publication depuis ton PC), et pour chaque
 * plateforme une scène de face : ce site dans un navigateur, sur trois vrais téléphones Android, puis en logiciel sur
 * une Surface Pro X. Logos officiels des hébergeurs et plateformes. Avance automatique avec barre de progression.
 */
export function Platforms() {
  const [active, setActive] = useState(0)
  const [hover, setHover] = useState(false)
  const [round, setRound] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { margin: "-60px 0px" })
  const page = usePageVisible()
  const reduced = useReducedMotion()
  const narrow = useMedia("(max-width: 959px)")
  const playing = !reduced && !narrow && visible && page && !hover

  useEffect(() => {
    if (!playing) return
    const id = window.setTimeout(() => setActive((a) => (a + 1) % PLATFORMS.length), PERIOD)
    return () => window.clearTimeout(id)
  }, [playing, active, round])

  const pick = (i: number) => {
    setActive(i)
    setRound((r) => r + 1)
  }
  const scene = (i: number) =>
    cn("absolute inset-0 transition-[opacity,transform] duration-700 ease-[cubic-bezier(.2,.7,.2,1)]", i === active ? "opacity-100 [transform:none]" : "pointer-events-none translate-y-4 scale-[0.98] opacity-0")
  return (
    <section className="section overflow-hidden" id="plateformes" data-capture="plateformes">
      <div className="wrap">
        <SectionHead
          index="04"
          eyebrow="Un projet, trois plateformes"
          title={["Publie partout,", "sans tout refaire."]}
          lead="Ton site reste la source. NEXORA en tire une adresse web, une application Android et un logiciel Windows, chacun prêt à distribuer."
        />
      </div>
      <div className="wrap-wide">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]" ref={ref} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
          <div className="flex flex-col gap-4" role="tablist" aria-label="Plateformes" data-glow>
            {PLATFORMS.map((p, i) => {
              const on = i === active
              return (
                <Reveal key={p.id} delay={i * 90}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={on}
                    aria-controls="pf-stage"
                    className={cn("glow surface relative w-full overflow-hidden p-5 text-left transition-colors duration-300", on ? "border-primary/60 bg-foreground/[0.04]" : "hover:border-foreground/20")}
                    onClick={() => pick(i)}
                  >
                    <span className="flex items-center gap-4">
                      <span className={cn("sp-ic", on && "solid")}>
                        <Icon name={p.icon} size={19} />
                      </span>
                      <b className="display flex-1 text-[22px] font-bold tracking-[-0.03em]">{p.title}</b>
                      <span className="flex items-center gap-2" aria-hidden="true">
                        {p.logos.map((l) => (
                          <Logo key={l} name={l} size={18} className={cn("transition-opacity", on ? "opacity-100" : "opacity-50")} />
                        ))}
                      </span>
                    </span>
                    <span className={cn("grid transition-[grid-template-rows] duration-500", on ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                      <span className="overflow-hidden">
                        <span className="block pt-4 text-[14.5px] leading-relaxed text-muted-foreground">{p.text}</span>
                        <span className="mt-4 flex flex-col gap-2">
                          {p.points.map((t) => (
                            <span key={t} className="inline-flex items-center gap-2 text-[13.5px] text-foreground/85">
                              <Icon name="check" size={13} stroke={2.6} className="text-primary" />
                              {t}
                            </span>
                          ))}
                        </span>
                      </span>
                    </span>
                    <i className="absolute right-0 bottom-0 left-0 h-[2px] bg-foreground/[0.04]">
                      <i key={`${active}-${round}`} className={cn("pbar", on && playing ? "run" : on ? "full" : "")} style={{ "--t": `${PERIOD}ms` } as CSSProperties} />
                    </i>
                  </button>
                </Reveal>
              )
            })}
          </div>
          <Reveal delay={120}>
            <div className="relative aspect-[16/11]" id="pf-stage" role="tabpanel" aria-label={PLATFORMS[active].title}>
              <div className="absolute top-1/2 left-1/2 aspect-square h-[112%] -translate-x-1/2 -translate-y-1/2 opacity-80">
                <Globe markers={MARKERS} arcs={ARCS} />
              </div>
              <div className={scene(0)}>
                <div className="absolute right-[2%] bottom-[5%] w-[70%]">
                  {/* Domaine réservé aux exemples (RFC 2606). */}
                  <Browser url="monsite.example">
                    <img src={SITE_DESKTOP} alt="Ce site dans un navigateur" width={1440} height={900} loading="lazy" className="block w-full" />
                  </Browser>
                </div>
                <span className="chip-glass absolute top-[8%] left-[2%] flex-col items-start gap-2">
                  <small className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Mise en ligne</small>
                  <span className="flex items-center gap-3">
                    {HOSTS.map((h) => (
                      <Logo key={h.name} name={h.logo} label={h.name} size={20} />
                    ))}
                  </span>
                </span>
              </div>
              <div className={scene(1)}>
                <div className="absolute inset-x-[4%] bottom-[4%] flex items-end justify-center gap-[3%]">
                  <div className="w-[38%]">
                    <Device kind="fold" />
                  </div>
                  <div className="w-[19%]">
                    <Device kind="pixel" />
                  </div>
                  <div className="w-[17.5%]">
                    <Device kind="galaxy" />
                  </div>
                </div>
                <Chip logo="googleplay" className="top-[6%] left-[3%]">
                  APK et AAB signés, prêts pour le Play Store
                </Chip>
              </div>
              <div className={scene(2)}>
                <div className="absolute top-[8%] left-1/2 w-[86%] -translate-x-1/2">
                  <Device kind="surface" screen={<WindowsDesktop />} />
                </div>
                <Chip logo="windows" className="right-[2%] bottom-[6%]">
                  winget · Microsoft Store
                </Chip>
              </div>
            </div>
            <p className="mt-6 text-center text-[13px] text-muted-foreground">Le même site, publié sur le web, sur Android et en logiciel Windows. Globe décoratif.</p>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
