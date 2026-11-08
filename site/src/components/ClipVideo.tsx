import { useEffect, useState, type RefObject } from "react"
import { Icon } from "../lib/icons"
import { useInView, usePageVisible, useReducedMotion } from "../lib/motion"
import type { Clip } from "../lib/videos"

/**
 * NEXORA #070 : lecture automatique d'une maquette animée, seulement à l'écran et onglet affiché. Avec
 * « Réduire les animations », rien ne bouge : l'image d'attente reste, et le bouton permet de lancer la vidéo
 * si on le souhaite. Une pause demandée par le visiteur est gardée.
 */
export function useAutoVideo(video: RefObject<HTMLVideoElement | null>, { active = true }: { active?: boolean } = {}) {
  const reduced = useReducedMotion()
  const page = usePageVisible()
  const inView = useInView(video, { margin: "80px 0px" })
  const [choice, setChoice] = useState<"auto" | "play" | "pause">("auto")
  const wanted = choice === "play" || (choice === "auto" && !reduced)
  const running = active && page && inView && wanted

  useEffect(() => {
    const v = video.current
    if (!v) return
    if (!running) {
      v.pause()
      return
    }
    v.muted = true
    // Lecture refusée (économiseur de données, réglage du navigateur) : l'image d'attente reste affichée.
    v.play()?.catch(() => setChoice("pause"))
    return () => v.pause()
  }, [running, video])

  const toggle = () => {
    const v = video.current
    if (wanted) {
      setChoice("pause")
      v?.pause()
      return
    }
    setChoice("play")
    // Lancée dans le geste lui-même : acceptée même là où la lecture automatique est bloquée.
    if (v && active) {
      v.muted = true
      v.play()?.catch(() => setChoice("pause"))
    }
  }
  return { running, wanted, reduced, toggle }
}

/** Vidéo muette en boucle d'une maquette ; chargée seulement quand elle est lue (`preload="none"`). */
export function ClipVideo({
  clip,
  label,
  videoRef,
  className = "",
}: {
  clip: Clip
  label: string
  videoRef: RefObject<HTMLVideoElement | null>
  className?: string
}) {
  return (
    <video
      ref={videoRef}
      className={`clip ${className}`}
      src={clip.src}
      poster={clip.poster}
      width={clip.width}
      height={clip.height}
      muted
      loop
      playsInline
      preload="none"
      disablePictureInPicture
      aria-label={label}
    />
  )
}

/** Bouton lecture / pause (au clavier, au toucher et à la souris) : obligatoire pour tout mouvement de plus de 5 s. */
export function VideoToggle({ playing, onToggle, className = "" }: { playing: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      className={`vid-toggle ${className}`}
      onClick={onToggle}
      aria-label={playing ? "Mettre l’animation en pause" : "Lire l’animation"}
    >
      <Icon name={playing ? "pause" : "play"} size={13} stroke={2.2} />
      <span aria-hidden="true">{playing ? "Pause" : "Lire"}</span>
    </button>
  )
}
