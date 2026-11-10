import { WEB_URL } from "../lib/product"
import { Icon } from "../lib/icons"
import { useRemote } from "../lib/remote"
import { Button } from "./ui/button"

type Size = "sm" | "default" | "lg"
const sz = (size: "sm" | "md" | "lg"): Size => (size === "md" ? "default" : size)

/**
 * Bouton de téléchargement : lien direct vers la version Windows publiée (réglage « lien de téléchargement » de
 * NEXORA, lu sur le serveur) ; tant qu'aucune version n'est publiée, il mène à la page Télécharger.
 * #085 : bouton shadcn/ui plein (#088 : rose du logo).
 */
export function DownloadButton({
  size = "md",
  label = "Télécharger pour Windows",
  variant = "default",
  className = "",
}: {
  size?: "sm" | "md" | "lg"
  label?: string
  variant?: "default" | "outline"
  className?: string
}) {
  const { downloadUrl } = useRemote()
  return (
    <Button asChild size={sz(size)} variant={variant} className={className}>
      <a href={downloadUrl || "/telecharger"} rel={downloadUrl ? "noopener" : undefined}>
        <Icon name="download" size={size === "sm" ? 15 : 17} stroke={2} />
        <span>{label}</span>
      </a>
    </Button>
  )
}

/** Lien vers NEXORA web (même adresse que le site, à la racine). */
export function WebButton({ size = "md", label = "Essayer dans le navigateur", className = "" }: { size?: "sm" | "md" | "lg"; label?: string; className?: string }) {
  return (
    <Button asChild size={sz(size)} variant="outline" className={className}>
      <a href={WEB_URL}>
        <span>{label}</span>
        <Icon name="nxArrowRight" size={size === "sm" ? 15 : 17} stroke={2} />
      </a>
    </Button>
  )
}

/**
 * NEXORA #076 : NEXORA Devs Toolbox est un logiciel Windows uniquement. Le bouton principal télécharge le lanceur
 * (lien direct dès que `desktop_download_url` est renseigné, sinon page Télécharger) ; le second ouvre « Ma licence ».
 */
export function MainButton({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  return <DownloadButton size={size} label={size === "sm" ? "Télécharger" : "Télécharger pour Windows"} className={className} />
}

/** Second bouton : la page « Ma licence » (compte, clé gratuite, abonnement). */
export function SecondButton({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <Button asChild size={sz(size)} variant="outline" className={className}>
      <a href="/licence">
        <Icon name="key" size={size === "sm" ? 15 : 17} />
        <span>{size === "sm" ? "Ma licence" : "Obtenir ma licence gratuite"}</span>
      </a>
    </Button>
  )
}
