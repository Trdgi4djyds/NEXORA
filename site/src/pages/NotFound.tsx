import { Icon } from "../lib/icons"

export function NotFound() {
  return (
    // #072 : même fond que les autres en-têtes de page (grille éclairée) ; « hero-bg dots » n'avait plus de style.
    <section className="page-hero notfound" data-light>
      <i className="grid-bg" aria-hidden="true" />
      <i className="grid-lit" aria-hidden="true" />
      <i className="torch" aria-hidden="true" />
      <div className="container">
        <span className="eyebrow">Page introuvable</span>
        <h1 className="h-1">
          Cette page <span className="tone">n’existe pas.</span>
        </h1>
        <p className="lead">Le lien est peut-être ancien. Repars de l’accueil ou découvre les espaces de NEXORA.</p>
        <div className="btn-stack center">
          <a className="btn btn-primary" href="#/">
            <Icon name="home" size={17} /> Retour à l’accueil
          </a>
          <a className="btn btn-ghost" href="#/espaces">
            Les 9 espaces
          </a>
        </div>
      </div>
    </section>
  )
}
