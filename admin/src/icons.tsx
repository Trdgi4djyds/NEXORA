// Icônes du back office : celles de l'interface NEXORA (même module que l'application, pour garder
// exactement les mêmes pictogrammes).
import { a as NEXORA_ICONS } from "../../nexora/app/renderer/dist/chunks/chunk-S4I2LXHS.js"

const PATHS = NEXORA_ICONS as Record<string, string>

export type IconName = string

export function Icon({
  name,
  size = 16,
  className = "",
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      className={`ico ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] || "" }}
    />
  )
}
