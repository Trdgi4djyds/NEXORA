import cartes from "../assets/realisations/cartes.webp"
import dessous from "../assets/realisations/dessous.webp"
import facade from "../assets/realisations/facade.webp"
import mosaique from "../assets/realisations/mosaique.webp"
import planche from "../assets/realisations/planche.webp"
import rochers from "../assets/realisations/rochers.webp"
import studioDessous from "../assets/realisations/studio-dessous.webp"
import studioDiagonale from "../assets/realisations/studio-diagonale.webp"
import studioRochers from "../assets/realisations/studio-rochers.webp"
import studioTablette from "../assets/realisations/studio-tablette.webp"
import tablette from "../assets/realisations/tablette.webp"
import { Reveal } from "../lib/motion"
import { cn } from "../lib/utils"
import { SectionHead } from "./SectionHead"

type Shot = { src: string; title: string; meta: string; alt: string; w: number; h: number; wide?: boolean }

/**
 * #118 : vrais rendus exportés par NEXORA (aucune maquette refaite pour le site) : les modèles « photo » de NEX-DESIGN
 * appliqués avec des kits de marque fictifs, et les mises en scène réalistes du Studio. Images produites par
 * `node scripts/modeles-design.mjs site studio`.
 */
const DESIGN: Shot[] = [
  { src: planche, title: "Planche de marque", meta: "1920 × 1080 · marque fictive « Altura »", alt: "Planche de marque sombre : photo d’objectif, pastilles de mots-clés, logo sur aplat vert anis, ordinateur portable en 3D, paysage de montagne et typographie", w: 1600, h: 900, wide: true },
  { src: mosaique, title: "Mosaïque d’appli", meta: "1080 × 1080 · « Lumi »", alt: "Mosaïque de cartes sombres : assistant vocal, portrait souriant, téléphone en 3D, anneau chromé et palette de couleurs", w: 1600, h: 1600 },
  { src: cartes, title: "Cartes de services", meta: "1080 × 1080 · « Viora »", alt: "Cartes arrondies sombres et orange avec boutons ronds à flèche, spirale et anneau en 3D qui débordent", w: 1600, h: 1600 },
  { src: dessous, title: "Tableau de bord en contre-plongée", meta: "1080 × 1080 · « Daxo »", alt: "Ordinateur portable vu de dessous, en gros plan, affichant un tableau de bord clair", w: 1600, h: 1600 },
  { src: facade, title: "Affiche sur façade", meta: "1080 × 1350 · « Avela »", alt: "Panneau publicitaire sur un mur de pierre traversé d’ombres de feuillage, avec deux téléphones inclinés", w: 1280, h: 1600 },
  { src: rochers, title: "Lancement produit", meta: "1080 × 1350 · « Pixa »", alt: "Ordinateur portable incliné entre des roches noires sur un dégradé orange", w: 1280, h: 1600 },
  { src: tablette, title: "Appli sur tablette", meta: "1080 × 1350 · « Orya »", alt: "Tablette inclinée affichant un tableau de bord sombre sur un fond gris", w: 1280, h: 1600 },
]
const STUDIO: Shot[] = [
  { src: studioRochers, title: "Ordinateur entre les roches", meta: "Rendu 1600 × 1000", alt: "Rendu 3D d’un ordinateur portable posé entre des roches, fond orange", w: 1600, h: 1000 },
  { src: studioDessous, title: "Ordinateur vu de dessous", meta: "Rendu 1600 × 1000", alt: "Rendu 3D d’un ordinateur portable vu en contre-plongée sur fond gris clair", w: 1600, h: 1000 },
  { src: studioDiagonale, title: "Téléphones en diagonale", meta: "Rendu 1600 × 1000", alt: "Rendu 3D de deux téléphones inclinés en diagonale avec leur ombre", w: 1600, h: 1000 },
  { src: studioTablette, title: "Tablette inclinée", meta: "Rendu 1600 × 1000", alt: "Rendu 3D d’une tablette en paysage, inclinée, affichant un tableau de bord sombre", w: 1600, h: 1000 },
]

export function Realisations({ space }: { space: "design" | "studio" }) {
  const design = space === "design"
  const shots = design ? DESIGN : STUDIO
  return (
    <section className="section-tight relative overflow-hidden" data-capture="realisations">
      <div className="wrap">
        <SectionHead
          eyebrow={design ? "Réalisé dans NEX-DESIGN" : "Réalisé dans le Studio"}
          title={design ? ["Des visuels prêts", "à publier."] : ["Des mises en scène", "comme en studio photo."]}
          lead={
            design
              ? "Chaque image est exportée telle quelle depuis NEX-DESIGN avec un modèle « photo » : photos remplaçables, appareils réalistes en 3D, une seule couleur d’accent tirée de votre kit de marque. Les marques sont fictives."
              : "Rendus tirés des mises en scène réalistes du Studio, en un clic : appareils à taille réelle, roches, fond et lumière de studio photo. L’écran montre votre page, ou un écran d’exemple aux couleurs de votre marque."
          }
        />
        <ul className={cn("rz-grid", design ? "rz-design" : "rz-studio")}>
          {shots.map((s, i) => (
            <Reveal as="li" key={s.title} className={cn("rz-item", s.wide && "rz-wide")} delay={(i % 3) * 70}>
              <figure>
                <span className="rz-frame">
                  <img src={s.src} alt={s.alt} width={s.w} height={s.h} loading="lazy" decoding="async" />
                </span>
                <figcaption>
                  <b>{s.title}</b>
                  <span>{s.meta}</span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}
