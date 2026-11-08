import { CtaBand } from "../components/CtaBand"
import { SectionHead } from "../components/SectionHead"
import { SpaceBento } from "../components/SpaceBento"

export function SpacesIndex() {
  return (
    <>
      <section className="page-hero" data-capture="haut" data-light>
        <i className="grid-bg" aria-hidden="true" />
        <i className="grid-lit" aria-hidden="true" />
        <i className="torch" aria-hidden="true" />
        <div className="container">
          <SectionHead
            as="h1"
            align="left"
            eyebrow="Les espaces"
            title={["Neuf espaces,", "une seule application."]}
            lead="Chaque espace de NEXORA fait un métier : tester, inspecter, coder, publier sur Android et Windows, présenter en 3D, créer des visuels, sécuriser. Tous partagent tes projets."
          />
        </div>
      </section>
      <section className="section tight">
        <div className="container">
          <SpaceBento />
        </div>
      </section>
      <CtaBand />
    </>
  )
}
