import { PageHero } from "../components/SectionHead"
import { Button } from "../components/ui/button"
import { Icon } from "../lib/icons"

export function NotFound() {
  return (
    <PageHero className="min-h-[70vh] text-center">
      <p className="text-[clamp(96px,18vw,200px)] leading-none font-bold tracking-[-0.06em] text-transparent [-webkit-text-stroke:1.5px_var(--primary)]" aria-hidden="true">
        404
      </p>
      <span className="eyebrow mt-6">Page introuvable</span>
      <h1 className="title-1 mt-4">
        Cette page <span className="tone">n’existe pas.</span>
      </h1>
      <p className="lead mx-auto mt-5 max-w-xl">Le lien est peut-être ancien. Repartez de l’accueil ou découvrez les espaces de NEXORA.</p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <a href="/">
            <Icon name="home" size={17} /> Retour à l’accueil
          </a>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href="/espaces">Les 9 espaces</a>
        </Button>
      </div>
    </PageHero>
  )
}
