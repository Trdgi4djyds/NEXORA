import { useEffect, useRef, useState } from "react"
import { SPACE_BY_ID, type SpaceId } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { CHAPTERS, CLIPS, chapterAt, progressIn, seekTime, type Chapter } from "../lib/videos"
import { ClipVideo, useAutoVideo, VideoToggle } from "./ClipVideo"
import { SectionHead } from "./SectionHead"

const KORA_PAGES: Record<string, string> = { accueil: "Accueil", produit: "Fiche produit", commande: "Commande" }

const TRACKS: { icon: string; device: string; app: string; list: Chapter[]; name: (id: string) => string; space?: boolean }[] = [
  {
    icon: "laptop",
    device: "Surface Laptop 15, Windows 11",
    app: "NEXORA",
    list: CHAPTERS.nexora,
    name: (id) => SPACE_BY_ID[id as SpaceId]?.name ?? id,
    space: true,
  },
  {
    icon: "phone",
    device: "iPhone 18 Pro",
    app: "Kora, site de démonstration",
    list: CHAPTERS.koraMobile,
    name: (id) => KORA_PAGES[id] ?? id,
  },
]

/**
 * NEXORA #070 « En situation » : NEXORA sur un Surface Laptop 15 (Windows 11) et le site de démonstration Kora
 * sur un iPhone 18 Pro, rendus image par image par le moteur des Maquettes de NEXORA à partir de vraies captures,
 * avec les changements d'espace et de page. Sous la vidéo, chaque appareil suit son chapitre en cours ; un clic,
 * un toucher ou Entrée sur un chapitre y amène la vidéo (en pause, l'image change sans mouvement).
 */
export function Showcase() {
  const video = useRef<HTMLVideoElement>(null)
  const { running, wanted, toggle } = useAutoVideo(video)
  const [now, setNow] = useState<number[]>(() => TRACKS.map(() => 0))
  const bars = useRef<(HTMLElement | null)[][]>(TRACKS.map(() => []))

  useEffect(() => {
    const v = video.current
    if (!v) return
    let raf = 0
    const sync = () => {
      const t = v.currentTime
      const idx = TRACKS.map((tr) => chapterAt(tr.list, t))
      setNow((prev) => (prev.every((p, k) => p === idx[k]) ? prev : idx))
      TRACKS.forEach((tr, k) => bars.current[k][idx[k]]?.style.setProperty("--p", progressIn(tr.list, idx[k], t).toFixed(3)))
    }
    const loop = () => {
      sync()
      raf = requestAnimationFrame(loop)
    }
    if (running) raf = requestAnimationFrame(loop)
    sync()
    v.addEventListener("seeked", sync)
    return () => {
      cancelAnimationFrame(raf)
      v.removeEventListener("seeked", sync)
    }
  }, [running])

  const go = (k: number, i: number) => {
    const v = video.current
    if (!v) return
    v.preload = "auto"
    v.currentTime = seekTime(TRACKS[k].list, i)
  }

  return (
    <section className="section showcase" id="appareils" data-capture="appareils">
      <div className="container">
        <SectionHead
          index="01"
          eyebrow="En situation"
          title={["Tes projets,", "sur de vrais appareils."]}
          lead="NEXORA sur un PC Windows, ton site sur le téléphone de tes clients. Chaque écran est une vraie capture, et chaque changement d’espace ou de page se voit dans l’appareil, comme à l’usage."
        />
      </div>
      <div className="container wide">
        <Reveal className="sc-stage" delay={80}>
          <figure className="sc-figure">
            <div className="sc-media">
              <ClipVideo
                clip={CLIPS.appareils}
                videoRef={video}
                label="NEXORA sur un Surface Laptop sous Windows 11 passe du Dev Lab au Responsive Lab, à Sécurité, au Studio 3D & Motion, à NEX-DESIGN et à l’Accueil ; à côté, le site de démonstration Kora sur un iPhone passe de l’accueil à une fiche produit, puis à la commande."
              />
            </div>
            <figcaption className="sc-cap">
              <VideoToggle playing={wanted} onToggle={toggle} className="sc-toggle" />
              <span>
                Vraies captures de NEXORA et du site de démonstration Kora, enchaînées avec leurs transitions, puis placées dans un Surface Laptop 15 et un iPhone 18 Pro par le moteur des Maquettes de NEXORA (Studio 3D & Motion), image par image. Bureau Windows 11 de l’aperçu du Desktop Builder.
              </span>
            </figcaption>
          </figure>
        </Reveal>
        <div className="sc-tracks">
          {TRACKS.map((tr, k) => (
            <Reveal key={tr.icon} className="sc-track" delay={140 + k * 90} role="group" aria-label={`${tr.device} : ${tr.app}`}>
              <p className="sc-track-h">
                <Icon name={tr.icon} size={16} />
                <span className="sc-dev">{tr.device}</span>
                <span className="sc-app">{tr.app}</span>
              </p>
              <div className="sc-chips">
                {tr.list.map(([id], i) => (
                  <button
                    key={id}
                    type="button"
                    className="sc-chip"
                    data-space={tr.space ? id : undefined}
                    aria-current={now[k] === i ? "step" : undefined}
                    aria-label={`Montrer : ${tr.name(id)}`}
                    onClick={() => go(k, i)}
                  >
                    <span className="sc-chip-t">{tr.name(id)}</span>
                    <i
                      className="sc-bar"
                      aria-hidden="true"
                      ref={(el) => {
                        bars.current[k][i] = el
                      }}
                    >
                      <i />
                    </i>
                  </button>
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
