import { useState } from "react"
import { Icon } from "../lib/icons"
import { APP_VERSION, RELEASES } from "../lib/product"
import { useRemote } from "../lib/remote"

const KEY = "nexora-site-annonce"

/** Bandeau du haut : maintenance annoncée par NEXORA, sinon les nouveautés de la dernière version. */
export function Announcement({ home = false }: { home?: boolean }) {
  const { maintenance } = useRemote()
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === APP_VERSION
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
  const note = RELEASES.find(([v]) => v === APP_VERSION)?.[1]
  // #072 : sur l'accueil, la pastille du hero annonce déjà la version : pas de second bandeau identique.
  if (hidden || home || !note) return null
  const [first, second] = note.items
  const hide = () => {
    try {
      localStorage.setItem(KEY, APP_VERSION)
    } catch {
      /* stockage indisponible */
    }
    setHidden(true)
  }
  return (
    <div className="annonce">
      <div className="container wide annonce-in">
        <a className="annonce-link" href="#/nouveautes">
          <span className="annonce-tag">Nouveau</span>
          <span className="annonce-text">
            NEXORA {APP_VERSION} : {first?.title}
            {second ? `, ${second.title.charAt(0).toLowerCase()}${second.title.slice(1)}` : ""} et plus encore
          </span>
          <span className="annonce-go">
            Voir les nouveautés <Icon name="nxArrowRight" size={14} stroke={2} />
          </span>
        </a>
        <button type="button" className="annonce-x" onClick={hide} aria-label="Masquer l’annonce">
          <Icon name="close" size={15} />
        </button>
      </div>
    </div>
  )
}
