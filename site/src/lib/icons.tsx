// Icônes du site : celles de l'interface NEXORA (même module que l'application et le back office, icônes Lucide
// depuis NEXORA #045), plus « menu », dessinée comme l'icône Lucide du même nom (licence ISC, voir
// nexora/app/renderer/nx/icons/LICENCE.md).
import { a as NEXORA_ICONS } from "../../../nexora/app/renderer/dist/chunks/chunk-S4I2LXHS.js"

const EXTRA: Record<string, string> = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
}
const PATHS = { ...(NEXORA_ICONS as Record<string, string>), ...EXTRA }

export function Icon({
  name,
  size = 18,
  stroke = 1.8,
  className = "",
}: {
  name: string
  size?: number
  stroke?: number
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
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: PATHS[name] || "" }}
    />
  )
}
