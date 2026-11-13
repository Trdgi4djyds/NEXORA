import { NumberRows, StepCards, Watermark, WordStrip } from "../components/Blocks"
import { CtaBand } from "../components/CtaBand"
import { PageHero, SectionHead } from "../components/SectionHead"
import { SpaceBento } from "../components/SpaceBento"
import { PERSONAS } from "../data/personas"
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
          lead="Chaque espace de NEXORA règle un besoin précis : voir votre site sur tous les écrans, comprendre une erreur, coder sans rien installer, publier sur Android et Windows, présenter en 3D, créer vos visuels, rester en ligne. Tous travaillent sur le même projet."
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
          { icon: "download", title: "Téléchargez NEXORA", text: "Le lanceur installe NEXORA et vérifie chaque fichier." },
          { icon: "key", title: "Connectez-vous", text: "Votre licence est liée à votre compte et vérifiée à chaque démarrage." },
          { icon: "folder", title: "Ouvrez un projet", text: "Un site, un dossier de code ou un projet existant : tous les espaces s’y alignent." },
          { icon: "rocket", title: "Publiez partout", text: "Mise en ligne, application Android ou logiciel Windows installable." },
        ]}
      />
      <NumberRows
        eyebrow="En chiffres"
        title={["NEXORA,", "en quatre chiffres."]}
        icon="cube"
        rows={[
          { value: String(SPACES.length), label: "espaces", text: "Un par besoin : tester, inspecter, coder, publier, présenter, créer, sécuriser." },
          { value: String(DEVICE_COUNT), label: "modèles d’appareils", text: "Téléphones, pliables, tablettes, ordinateurs, téléviseurs, montres et voitures." },
          { value: "3", label: "plateformes", text: "Un même site publié sur le web, en application Android et en logiciel Windows." },
          { value: String(PERSONAS.length), label: "profils", text: "Des étudiants aux commerçants, chacun avec son parcours dans NEXORA." },
        ]}
      />
      <CtaBand bright />
    </>
  )
}
