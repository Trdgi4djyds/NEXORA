import { SPACE_BY_ID, type SpaceId } from "../data/spaces"
import { KORA_PIXEL, PIXEL_10_PRO, SCREEN_H, SCREEN_W, SCREENS } from "../lib/screens"

/** Capture réelle d'un espace de NEXORA, dans son thème clair (direction « Prisme », #074). */
export function Screen({ space, eager = false, className = "" }: { space: SpaceId; eager?: boolean; className?: string }) {
  return (
    <img
      className={`shot ${className}`}
      src={SCREENS[space]}
      width={SCREEN_W}
      height={SCREEN_H}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      alt={`Capture de NEXORA : ${SPACE_BY_ID[space].name}`}
    />
  )
}

/** Captures superposées, une seule visible (fondu enchaîné). */
export function Screens({ spaces, current, eager = false }: { spaces: SpaceId[]; current: SpaceId; eager?: boolean }) {
  return (
    <div className="shots">
      {spaces.map((id, i) => (
        <Screen key={id} space={id} eager={eager && i === 0} className={id === current ? "on" : ""} />
      ))}
    </div>
  )
}

/**
 * Vrai Pixel 10 Pro (habillage officiel d'Android Studio, Apache 2.0) avec le site de démonstration Kora :
 * dalle de 1280 × 2856 placée à (59, 60) dans l'habillage de 1410 × 2968, comme dans le Responsive Lab.
 */
export function Pixel({ className = "" }: { className?: string }) {
  return (
    <span className={`pixel ${className}`}>
      <img className="pixel-frame" src={PIXEL_10_PRO} alt="" width={1410} height={2968} loading="lazy" />
      <span className="pixel-screen">
        <img src={KORA_PIXEL} alt="Le site de démonstration Kora sur un Pixel 10 Pro" loading="lazy" />
      </span>
      <i className="pixel-cam" />
    </span>
  )
}
