import { WEB_URL } from "../lib/product"
import { Icon } from "../lib/icons"
import { useRemote } from "../lib/remote"

/**
 * Bouton de téléchargement : lien direct vers la version Windows publiée (réglage « lien de téléchargement » de
 * NEXORA, lu sur le serveur) ; tant qu'aucune version n'est publiée, il mène à la page Télécharger.
 */
export function DownloadButton({
  size = "md",
  label = "Télécharger pour Windows",
  variant = "primary",
  className = "",
}: {
  size?: "sm" | "md" | "lg"
  label?: string
  variant?: "primary" | "white" | "ink"
  className?: string
}) {
  const { downloadUrl } = useRemote()
  const cls = `btn btn-${variant}${size === "md" ? "" : ` btn-${size}`}${className ? ` ${className}` : ""}`
  const content = (
    <>
      <Icon name="download" size={size === "sm" ? 16 : 18} stroke={2} />
      <span>{label}</span>
    </>
  )
  return downloadUrl ? (
    <a className={cls} href={downloadUrl} rel="noopener">
      {content}
    </a>
  ) : (
    <a className={cls} href="#/telecharger">
      {content}
    </a>
  )
}

/** Lien vers NEXORA web (même adresse que le site, à la racine). */
export function WebButton({
  size = "md",
  variant = "ghost",
  label = "Essayer dans le navigateur",
  className = "",
}: {
  size?: "sm" | "md" | "lg"
  variant?: "ghost" | "outline-white" | "primary"
  label?: string
  className?: string
}) {
  return (
    <a className={`btn btn-${variant} glow${size === "md" ? "" : ` btn-${size}`}${className ? ` ${className}` : ""}`} href={WEB_URL}>
      <span>{label}</span>
      <Icon name="nxArrowRight" size={size === "sm" ? 15 : 17} stroke={2} className="ico-go" />
    </a>
  )
}

/**
 * NEXORA #072 : le bouton principal suit la réalité. Tant qu'aucune version Windows n'est publiée (réglage
 * `desktop_download_url` vide sur le serveur), « Télécharger pour Windows » ne menait qu'à une page « bientôt
 * disponible » : le bouton principal ouvre alors NEXORA web, et la version Windows passe en second.
 */
export function MainButton({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const { downloadUrl } = useRemote()
  return downloadUrl ? (
    <DownloadButton size={size} label={size === "sm" ? "Télécharger" : "Télécharger pour Windows"} className={className} />
  ) : (
    <WebButton size={size} variant="primary" label={size === "sm" ? "Ouvrir NEXORA web" : "Essayer NEXORA web"} className={className} />
  )
}

/** Second bouton : NEXORA web quand la version Windows est publiée, sinon la page Télécharger (« bientôt »). */
export function SecondButton({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const { downloadUrl } = useRemote()
  if (downloadUrl) return <WebButton size={size} label={size === "sm" ? "Ouvrir NEXORA web" : "Essayer dans le navigateur"} className={className} />
  return (
    <a className={`btn btn-ghost glow${size === "md" ? "" : ` btn-${size}`}${className ? ` ${className}` : ""}`} href="#/telecharger">
      <Icon name="display" size={size === "sm" ? 15 : 17} />
      <span>{size === "sm" ? "Windows" : "Version Windows"}</span>
      <span className="btn-soon">bientôt</span>
    </a>
  )
}
