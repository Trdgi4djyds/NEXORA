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
export function WebButton({ size = "md", variant = "ghost", label = "Essayer dans le navigateur" }: { size?: "sm" | "md" | "lg"; variant?: "ghost" | "outline-white"; label?: string }) {
  return (
    <a className={`btn btn-${variant} glow${size === "md" ? "" : ` btn-${size}`}`} href={WEB_URL}>
      <span>{label}</span>
      <Icon name="nxArrowRight" size={size === "sm" ? 15 : 17} stroke={2} className="ico-go" />
    </a>
  )
}
