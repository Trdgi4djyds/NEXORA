import { useEffect, useState } from "react"
import { Icon } from "../lib/icons"
import { useRemote } from "../lib/remote"

const KEY = "nexora-site-annonce"
const MARK = "076-toolbox"

/** Bandeau du haut : maintenance annoncée par NEXORA, sinon l’annonce de NEXORA Devs Toolbox (#076). */
export function Announcement({ home = false }: { home?: boolean }) {
  const { maintenance } = useRemote()
  // #096 : masquée ou non selon le stockage du navigateur, lu après l'hydratation de la page pré-générée.
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(KEY) === MARK)
    } catch {
      /* stockage indisponible */
    }
  }, [])
  if (maintenance)
    return (
      <div className="border-b border-amber-400/30 bg-amber-400/10 text-amber-200" role="status">
        <div className="wrap-wide flex items-center gap-2.5 py-2.5 text-sm">
          <Icon name="warn" size={16} />
          <span>{maintenance}</span>
        </div>
      </div>
    )
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
    <div className="relative border-b border-foreground/[0.08] bg-lime text-ink">
      <div className="wrap-wide flex items-center gap-3 py-2">
        <a className="group flex min-w-0 flex-1 items-center justify-center gap-3 text-[13px] text-ink/80" href="/licence">
          <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 text-[12px] font-medium text-lime">Nouveau</span>
          {/* #089 : deux lignes sur téléphone (le texte était coupé après « licence gra… »). */}
          <span className="line-clamp-2 leading-snug sm:line-clamp-none sm:truncate">NEXORA Devs Toolbox : licence gratuite, 2 applications Android ou Windows offertes, 24 h d’essai Pro complet</span>
          <span className="hidden items-center gap-1.5 font-semibold text-ink transition-[gap] group-hover:gap-2.5 sm:inline-flex">
            Obtenir ma licence <Icon name="nxArrowRight" size={14} stroke={2} />
          </span>
        </a>
        <button type="button" className="grid size-7 place-items-center rounded-full text-ink/70 transition hover:bg-ink/10 hover:text-ink" onClick={hide} aria-label="Masquer l’annonce">
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  )
}
