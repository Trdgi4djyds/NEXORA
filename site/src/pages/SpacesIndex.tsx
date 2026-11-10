import { NumberRows, StepCards, Watermark, WordStrip } from "../components/Blocks"
import { CtaBand } from "../components/CtaBand"
import { PageHero, SectionHead } from "../components/SectionHead"
import { SpaceBento } from "../components/SpaceBento"
import { SPACES } from "../data/spaces"
import { DEVICE_COUNT } from "../lib/product"

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
      <WordStrip words={SPACES.map((sp) => sp.name)} />
      <section className="section light relative overflow-hidden" data-capture="espaces">
        <Watermark icon="grid" className="wm-tr" size={500} />
        <div className="wrap relative">
          <SpaceBento />
        </div>
      </section>
      <StepCards
        className="lime"
        eyebrow="Comment ça marche"
        title={["Quatre étapes,", "du site à la publication."]}
        steps={[
          { icon: "download", title: "Télécharge NEXORA", text: "Le lanceur installe NEXORA et vérifie chaque fichier." },
          { icon: "key", title: "Crée ta licence", text: "Gratuite, liée à ton compte, vérifiée à chaque démarrage." },
          { icon: "folder", title: "Ouvre un projet", text: "Un site, un dossier de code ou un projet existant : tous les espaces s’y alignent." },
          { icon: "rocket", title: "Publie partout", text: "Mise en ligne, application Android ou logiciel Windows installable." },
        ]}
      />
      <NumberRows
        eyebrow="En chiffres"
        title={["NEXORA,", "en quatre chiffres."]}
        icon="cube"
        rows={[
          { value: String(SPACES.length), label: "espaces", text: "Un par métier : tester, inspecter, coder, publier, présenter, créer, sécuriser." },
          { value: String(DEVICE_COUNT), label: "modèles d’appareils", text: "Téléphones, pliables, tablettes, ordinateurs, téléviseurs, montres et voitures." },
          { value: "2", label: "applications offertes", text: "Android ou Windows, avec l’offre Gratuite, sans limite de durée." },
          { value: "24 h", label: "d’essai Pro", text: "Ton premier jour, tout NEXORA est ouvert." },
        ]}
      />
      <CtaBand bright />
    </>
  )
}
