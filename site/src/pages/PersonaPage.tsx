import { MacBook, SplitPanel, Watermark, WordStrip } from "../components/Blocks"
import { CtaBand } from "../components/CtaBand"
import { MainButton } from "../components/Download"
import { NeonIcon } from "../components/Neon"
import { PageHero, SectionHead } from "../components/SectionHead"
import { Shifts } from "../components/Shifts"
import { Button } from "../components/ui/button"
import { PERSONAS, personaHref, type Persona } from "../data/personas"
import { SPACE_BY_ID, spaceHref } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"

/**
 * NEXORA #117 : page d'un profil. Haut de page (promesse, situation type), « Sans NEXORA → Avec NEXORA », parcours
 * étape par étape relié aux espaces, l'espace principal sur un vrai MacBook, puis les autres profils.
 */
export function PersonaPage({ persona }: { persona: Persona }) {
  const main = SPACE_BY_ID[persona.steps[0].space]
  const others = PERSONAS.filter((p) => p.slug !== persona.slug)
  return (
    <>
      <PageHero>
        <a href="/pour-qui" className="rise inline-flex items-center gap-1.5 text-[13.5px] text-muted-foreground transition hover:text-foreground">
          <Icon name="chevronLeft" size={15} stroke={2} /> Tous les profils
        </a>
        <div className="mt-8 grid items-end gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="rise" style={{ animationDelay: "80ms" }}>
            <span className="flex items-center gap-4">
              <NeonIcon name={persona.icon} size={40} />
              <span className="eyebrow">{persona.name}</span>
            </span>
            <h1 className="title-1 mt-7">
              {persona.h1[0]} <span className="tone-neon">{persona.h1[1]}</span>
            </h1>
            <p className="lead mt-6 max-w-[60ch]">{persona.lead}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <MainButton />
              <Button asChild variant="outline">
                <a href="#parcours">Voir le parcours</a>
              </Button>
            </div>
          </div>
          <Reveal className="pq-quote" delay={160}>
            <q>{persona.quote}</q>
            <small>Situation type · {persona.name}</small>
          </Reveal>
        </div>
      </PageHero>
      <WordStrip words={persona.steps.map((s) => s.title)} />
      <section className="section light relative overflow-hidden" data-capture="freins">
        <Watermark icon={persona.icon} className="wm-tr" size={460} />
        <div className="wrap relative">
          <SectionHead eyebrow="ce qui change" title={["Ce qui vous freine,", "ce que NEXORA change."]} lead={persona.tagline} />
          <Shifts items={persona.shifts} />
        </div>
      </section>
      <section className="section relative overflow-hidden" id="parcours" data-capture="parcours">
        <Watermark icon="nxNodes" className="wm-bl" size={460} />
        <div className="wrap relative">
          <SectionHead eyebrow="votre parcours" title={[`${persona.steps.length} étapes,`, "un seul projet."]} lead="Chaque étape a son espace dans NEXORA, et chaque espace reprend votre projet là où le précédent s’est arrêté." />
          <ol className="pq-path">
            {persona.steps.map((st, i) => {
              const sp = SPACE_BY_ID[st.space]
              return (
                <Reveal as="li" className="pq-step" key={`${st.space}-${i}`} delay={i * 70}>
                  <span className="pq-step-n">{String(i + 1).padStart(2, "0")}</span>
                  <div className="pq-step-body">
                    <div>
                      <span className="pq-step-space">
                        <Icon name={sp.icon} size={14} /> {sp.name}
                      </span>
                      <b className="pq-step-title">{st.title}</b>
                    </div>
                    <p className="pq-step-text">{st.text}</p>
                    <a className="orb line" href={spaceHref(sp)} aria-label={`Découvrir ${sp.name}`}>
                      <Icon name="nxArrowUpRight" size={16} stroke={2} />
                    </a>
                  </div>
                </Reveal>
              )
            })}
          </ol>
        </div>
      </section>
      <SplitPanel
        media={<MacBook space={main.id} />}
        eyebrow={`votre premier espace · ${main.name}`}
        title={main.h1}
        text={main.lead}
        action={
          <a className="link-arrow text-white" href={spaceHref(main)}>
            Découvrir {main.name} <Icon name="nxArrowRight" size={14} stroke={2} />
          </a>
        }
        icon={main.icon}
      />
      <section className="section-tight light" data-capture="autres-profils">
        <div className="wrap">
          <SectionHead eyebrow="autres profils" title={["Vous vous reconnaissez", "aussi ailleurs ?"]} className="mb-8 md:mb-10" />
          <ul className="flex flex-wrap gap-2.5">
            {others.map((p) => (
              <li key={p.slug}>
                <a href={personaHref(p)} className="inline-flex items-center gap-2.5 rounded-full border border-foreground/15 px-4 py-2 text-[14px] transition hover:border-foreground/45">
                  <Icon name={p.icon} size={15} />
                  {p.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <CtaBand bright title={persona.h1.join(" ")} text={persona.tagline} />
    </>
  )
}
