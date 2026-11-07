import type { CSSProperties } from "react"
import { SPACES, spaceHref } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { APP_VERSION } from "../lib/product"
import { useRemote } from "../lib/remote"
import { Brand } from "./Brand"

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
        <nav className="ftr-col" aria-label="Produit">
          <h2>Produit</h2>
          <a href="#/espaces">Tous les espaces</a>
          <a href="#/tarifs">Tarifs</a>
          <a href="#/tarifs/comparatif">Comparer les offres</a>
          <a href="#/nouveautes">Nouveautés</a>
          <a href="#/telecharger">Télécharger</a>
        </nav>
        <nav className="ftr-col" aria-label="NEXORA web">
          <h2>NEXORA web</h2>
          <a href="../">Ouvrir NEXORA web</a>
          <a href="#/telecharger">Configuration requise</a>
          {supportEmail && <a href={`mailto:${supportEmail}`}>Contacter l’équipe</a>}
        </nav>
      </div>
      <Reveal className="container wide ftr-word" aria-hidden="true">
        <span className="ftr-spectrum">
          {SPACES.map((s, i) => (
            <i key={s.id} data-space={s.id} style={{ "--i": i } as CSSProperties} />
          ))}
        </span>
        <span className="ftr-letters">
          {"NEXORA".split("").map((c, i) => (
            <span key={i} style={{ "--i": i } as CSSProperties}>
              {c}
            </span>
          ))}
        </span>
      </Reveal>
      <div className="container wide ftr-bottom">
        <span>© {new Date().getFullYear()} NEXORA. Tous droits réservés.</span>
        <span className="muted">Interface en français · Photos : Unsplash</span>
      </div>
    </footer>
  )
}
