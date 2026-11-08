import { SPACES, spaceHref } from "../data/spaces"
import { Icon } from "../lib/icons"
import { APP_VERSION, WEB_URL } from "../lib/product"
import { useRemote } from "../lib/remote"
import { Brand } from "./Brand"
import { scrollToId } from "../router"
import type { MouseEvent } from "react"

/** « Questions fréquentes » : la FAQ de l'accueil, atteinte depuis n'importe quelle page. */
function goFaq(e: MouseEvent<HTMLAnchorElement>) {
  e.preventDefault()
  if (location.hash === "" || location.hash === "#/") scrollToId("faq")
  else {
    location.hash = "#/"
    window.setTimeout(() => scrollToId("faq"), 120)
  }
}

export function Footer() {
  const { supportEmail } = useRemote()
  return (
    <footer className="ftr" data-capture="pied">
      <div className="container wide ftr-grid">
        <div className="ftr-brand">
          <a href="#/" aria-label="NEXORA, accueil du site">
            <Brand size={36} />
          </a>
          <p>L’atelier tout-en-un pour concevoir, coder, tester, sécuriser et publier sur le web, sur Android et sur Windows.</p>
          <div className="ftr-chips">
            <span className="chip">
              <Icon name="display" size={15} /> Windows 10 et 11
            </span>
            <span className="chip">
              <Icon name="sparkle" size={15} /> Version {APP_VERSION}
            </span>
          </div>
        </div>
        <nav className="ftr-col" aria-label="Espaces">
          <h2>Espaces</h2>
          {SPACES.map((s) => (
            <a key={s.id} href={spaceHref(s)}>
              {s.name}
            </a>
          ))}
        </nav>
        {/* #072 : chaque lien rangé sous sa rubrique, et un moyen de joindre l'équipe même sans adresse du support. */}
        <nav className="ftr-col" aria-label="Produit">
          <h2>Produit</h2>
          <a href="#/espaces">Tous les espaces</a>
          <a href="#/tarifs">Tarifs</a>
          <a href="#/tarifs/comparatif">Comparer les offres</a>
          <a href="#/nouveautes">Nouveautés</a>
        </nav>
        <nav className="ftr-col" aria-label="Commencer">
          <h2>Commencer</h2>
          <a href={WEB_URL}>Ouvrir NEXORA web</a>
          <a href="#/telecharger">Version Windows et configuration</a>
        </nav>
        <div className="ftr-col">
          <h2>Aide</h2>
          <a href="#/" onClick={(e) => goFaq(e)}>
            Questions fréquentes
          </a>
          {supportEmail ? (
            <a href={`mailto:${supportEmail}`}>Écrire à l’équipe</a>
          ) : (
            <a href={WEB_URL}>Écrire à l’équipe</a>
          )}
          <span className="ftr-hint">Dans NEXORA : Mon compte → Support</span>
        </div>
      </div>
      <div className="container wide ftr-bottom">
        <span>© {new Date().getFullYear()} NEXORA. Tous droits réservés.</span>
        <span className="muted">Interface en français · Photos : Unsplash</span>
      </div>
    </footer>
  )
}
