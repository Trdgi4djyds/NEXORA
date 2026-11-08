import { useState } from "react"
import { Icon } from "../lib/icons"
import { useRemote } from "../lib/remote"

const KEY = "nexora-site-annonce"
const MARK = "076-toolbox"

/** Bandeau du haut : maintenance annoncée par NEXORA, sinon l’annonce de NEXORA Devs Toolbox (#076). */
export function Announcement({ home = false }: { home?: boolean }) {
  const { maintenance } = useRemote()
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === MARK
    } catch {
      return false
    }
  })
  if (maintenance)
    return (
      <div className="annonce warn" role="status">
        <div className="container wide annonce-in">
          <Icon name="warn" size={16} />
          <span>{maintenance}</span>
        </div>
      </div>
    )
  // #076 : annonce de NEXORA Devs Toolbox (les nouveautés de la 1.2.0 décrivaient un Dev Lab gratuit, devenu Pro).
  if (hidden || home) return null
  const hide = () => {
    try {
      localStorage.setItem(KEY, MARK)
    } catch {
      /* stockage indisponible */
    }
    setHidden(true)
  }
  return (
    <div className="annonce">
      <div className="container wide annonce-in">
        <a className="annonce-link" href="#/licence">
          <span className="annonce-tag">Nouveau</span>
          <span className="annonce-text">NEXORA Devs Toolbox : licence gratuite, 24 h d’essai Pro complet, Responsive Lab et Browser Lab gratuits</span>
          <span className="annonce-go">
            Obtenir ma licence <Icon name="nxArrowRight" size={14} stroke={2} />
          </span>
        </a>
        <button type="button" className="annonce-x" onClick={hide} aria-label="Masquer l’annonce">
          <Icon name="close" size={15} />
        </button>
      </div>
    </div>
  )
}
