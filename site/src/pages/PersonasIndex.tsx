import { StepCards, Watermark, WordStrip } from "../components/Blocks"
import { CtaBand } from "../components/CtaBand"
import { PersonaCard } from "../components/Personas"
import { NeonIcon } from "../components/Neon"
import { PageHero, SectionHead } from "../components/SectionHead"
import { PERSONAS, personaHref, personasForSpace } from "../data/personas"
import { SPACES, spaceHref } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"

/**
 * NEXORA #117 : « Pour qui ? ». Les 9 profils en cartes (promesse, situation type, espaces du parcours), puis les
 * besoins qui reviennent, espace par espace, avec les profils qui en ont besoin ; enfin comment démarrer.
 */
export function PersonasIndex() {
  return (
    <>
      <PageHero>
        <div className="grid items-end gap-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
          <SectionHead
            as="h1"
            align="left"
            eyebrow="Pour qui ?"
            title={["Neuf profils,", "un même atelier."]}
            lead="Étudiant, développeur junior, codeur passionné, vibe codeur, entrepreneur, créateur de MVP, designer, freelance ou commerçant : chacun arrive avec un besoin précis. Choisissez le vôtre pour voir ce qui vous freine aujourd’hui et ce que NEXORA change concrètement."
            className="mb-0 md:mb-0"
          />
          {/* Accès direct aux 9 profils (ordinateur seulement : les cartes suivent juste dessous). */}
          <Reveal className="grid grid-cols-3 gap-2.5 max-lg:hidden" delay={160}>
            {PERSONAS.map((p) => (
              <a key={p.slug} href={personaHref(p)} className="pq-mini">
                <NeonIcon name={p.icon} size={28} />
                <span>{p.short}</span>
              </a>
            ))}
          </Reveal>
        </div>
      </PageHero>
      <WordStrip words={PERSONAS.map((p) => p.name)} />
      <section className="section light relative overflow-hidden" data-capture="profils">
        <Watermark icon="nxUsers" className="wm-tr" size={480} />
        <div className="wrap-wide relative">
          <ul className="pq-grid">
            {PERSONAS.map((p, i) => (
              <Reveal as="li" key={p.slug} delay={(i % 3) * 70}>
                <PersonaCard persona={p} index={i} />
              </Reveal>
            ))}
          </ul>
        </div>
      </section>
      <section className="section relative overflow-hidden" data-capture="besoins">
        <Watermark icon="target" className="wm-bl" size={460} />
        <div className="wrap relative">
          <SectionHead
            eyebrow="les besoins qui reviennent"
            title={["Un besoin,", "un espace pour y répondre."]}
            lead="Les mêmes besoins reviennent d’un profil à l’autre. Chaque espace de NEXORA en règle un, et tous travaillent sur le même projet."
          />
          <ol className="pq-path">
            {SPACES.map((s, i) => {
              const who = personasForSpace(s.id)
              return (
                <Reveal as="li" className="pq-step" key={s.id} delay={(i % 3) * 60}>
                  <span className="pq-step-n">{String(i + 1).padStart(2, "0")}</span>
                  <div className="pq-step-body">
                    <div>
                      <span className="pq-step-space">
                        <Icon name={s.icon} size={14} /> {s.name}
                      </span>
                      <b className="pq-step-title">{s.need}</b>
                    </div>
                    <div>
                      <p className="pq-step-text">
                        <b className="font-medium text-foreground">{s.card}.</b> {s.tagline}
                      </p>
                      {who.length > 0 && (
                        <p className="mt-3 flex flex-wrap gap-1.5">
                          {who.map((p) => (
                            <a key={p.slug} href={personaHref(p)} className="pq-chip transition hover:text-foreground">
                              {p.short}
                            </a>
                          ))}
                        </p>
                      )}
                    </div>
                    <a className="orb line" href={spaceHref(s)} aria-label={`Découvrir ${s.name}`}>
                      <Icon name="nxArrowUpRight" size={16} stroke={2} />
                    </a>
                  </div>
                </Reveal>
              )
            })}
          </ol>
        </div>
      </section>
      <StepCards
        className="lime"
        eyebrow="Pour commencer"
        title={["Trois étapes,", "quel que soit votre profil."]}
        steps={[
          { icon: "download", title: "Installez NEXORA", text: "Le lanceur installe NEXORA sur Windows 10 ou 11 et vérifie chaque fichier." },
          { icon: "target", title: "Choisissez un objectif", text: "App Android, logiciel Windows, test sur tous les écrans… l’Accueil ouvre le bon espace." },
          { icon: "folder", title: "Ouvrez votre projet", text: "Un site, un dossier de code ou un modèle : tous les espaces travaillent dessus." },
        ]}
      />
      <CtaBand bright title="Trouvez votre parcours, puis lancez-vous." text="Installez NEXORA, choisissez un objectif sur l’Accueil et ouvrez votre projet : chaque espace reprend là où le précédent s’est arrêté." />
    </>
  )
}
