import { CtaBand } from "../components/CtaBand"
import { PageHero, SectionHead } from "../components/SectionHead"
import { SpaceBento } from "../components/SpaceBento"

export function SpacesIndex() {
  return (
    <>
      <PageHero>
        <SectionHead
          as="h1"
          align="left"
          eyebrow="Les espaces"
          title={["Neuf espaces,", "une seule application."]}
          lead="Chaque espace de NEXORA fait un métier : tester, inspecter, coder, publier sur Android et Windows, présenter en 3D, créer des visuels, sécuriser. Tous partagent tes projets."
          className="mb-0 md:mb-0"
        />
      </PageHero>
      <section className="pb-24">
        <div className="wrap">
          <SpaceBento />
        </div>
      </section>
      <CtaBand />
    </>
  )
}
