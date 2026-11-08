import { Screen } from "../components/Screen"
import { CtaBand } from "../components/CtaBand"
import { MainButton } from "../components/Download"
import { SectionHead } from "../components/SectionHead"
import { PLAN_LABEL, SPACES, spaceHref, type Feature, type Space } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { APP_VERSION, DEVICE_CATEGORIES, DEVICE_LIST } from "../lib/product"
import type { PlanId } from "../lib/remote"

const GLYPH: Record<string, string> = { phone: "phone", fold: "fold", tablet: "tablet", laptop: "laptop", display: "display", watch: "watch", tv: "tv", xr: "xr", gamepad: "gamepad", car: "car", kiosk: "kiosk" }

/** Catalogue des appareils du Responsive Lab, tiré des sources de NEXORA. */
function DeviceCatalog() {
  const names = DEVICE_LIST.map((d) => d.name)
  const half = Math.ceil(names.length / 2)
  return (
    <section className="section tight" data-capture="appareils">
      <div className="container">
        <SectionHead
          eyebrow="Le catalogue"
          title={[`${DEVICE_LIST.length} appareils,`, `${DEVICE_CATEGORIES.length} familles.`]}
          lead="Des téléphones les plus vendus aux écrans de voiture : chaque modèle avec sa taille d’écran et sa densité réelles."
        />
        <div className="dev-cats" data-glow>
          {DEVICE_CATEGORIES.map((c, i) => (
            <Reveal className="dev-cat glow" key={c.id} delay={(i % 5) * 50}>
              <span className="dev-cat-ic" style={{ color: c.color }}>
                <Icon name={GLYPH[c.glyph] ?? "phone"} size={20} />
              </span>
              <span>
                <b>{c.label}</b>
                <small>
                  {c.count} modèle{c.count > 1 ? "s" : ""}
                </small>
              </span>
            </Reveal>
          ))}
        </div>
      </div>
      {[names.slice(0, half), names.slice(half)].map((row, r) => (
        <div className={`marquee devices${r ? " rev" : ""}`} key={r} aria-hidden="true">
          <ul className="marquee-track slow">
            {[...row, ...row].map((n, i) => (
              <li key={i} className="chip">
                {n}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

/** Ce que chaque offre apporte dans cet espace (#076 : Gratuit et Pro). */
function PlanSplit({ space }: { space: Space }) {
  const cols: { id: PlanId; title: string; lead: string; items: Feature[] }[] = [
    {
      id: "free",
      title: "Gratuit",
      lead: space.plan === "free" ? "Pour découvrir et créer" : "Ouvert pendant ton essai de 24 h, puis réservé à Pro",
      items: space.plan === "free" ? space.features.filter((f) => !f.plan) : [],
    },
    {
      id: "pro",
      title: "Pro",
      lead: space.plan !== "free" ? "Tout l’espace :" : space.features.some((f) => f.plan === "pro") ? "Tout le Gratuit, plus :" : "Le même espace, avec des limites plus larges :",
      items: space.plan === "free" ? space.features.filter((f) => f.plan === "pro") : space.features,
    },
  ]
  return (
    <div className="split" data-glow>
      {cols.map((c, i) => (
        <Reveal className={`split-col glow${c.id === "pro" ? " featured" : ""}`} key={c.id} delay={i * 80}>
          <span className={`plan-tag ${c.id}`}>{c.title}</span>
          <p className="split-lead">{c.lead}</p>
          <ul>
            {c.items.length ? (
              c.items.map((f) => (
                <li key={f.title}>
                  <Icon name="check" size={14} stroke={2.6} />
                  {f.title}
                </li>
              ))
            ) : (
              <li className="muted">
                {/* #072 : un espace gratuit sans fonction Pro n'est pas « à ouvrir » : il est déjà inclus. */}
                {c.id === "pro"
                  ? "Des limites plus larges : projets, membres et constructions."
                  : space.plan === "free"
                    ? "Cet espace est déjà complet avec l’offre Gratuite."
                    : "Passe à Pro pour garder cet espace après ton essai."}
              </li>
            )}
          </ul>
        </Reveal>
      ))}
    </div>
  )
}

export function SpacePage({ space }: { space: Space }) {
  const idx = SPACES.indexOf(space)
  const prev = SPACES[(idx + SPACES.length - 1) % SPACES.length]
  const next = SPACES[(idx + 1) % SPACES.length]
  return (
    <div className="space-page" data-space={space.id}>
      <section className="sp-hero" data-capture="haut" data-light>
        <i className="grid-bg" aria-hidden="true" />
        <i className="grid-lit" aria-hidden="true" />
        <i className="torch" aria-hidden="true" />
        <div className="container">
          <a href="#/espaces" className="crumb rise">
            <Icon name="chevronLeft" size={15} stroke={2} /> Tous les espaces
          </a>
          <div className="sp-hero-grid">
            <div className="rise" style={{ animationDelay: "80ms" }}>
              <span className="sp-name">
                <span className="sp-ic lg solid">
                  <Icon name={space.icon} size={26} />
                </span>
                <span className="eyebrow">{space.name}</span>
              </span>
              <h1 className="h-1">
                {space.h1[0]} <span className="tone-space">{space.h1[1]}</span>
              </h1>
            </div>
            <div className="sp-hero-side rise" style={{ animationDelay: "180ms" }}>
              <p className="lead">{space.lead}</p>
              <div className="btn-stack">
                <MainButton />
                <a className="btn btn-ghost" href="#/tarifs">
                  Voir les tarifs
                </a>
              </div>
              <span className={`plan-note ${space.plan}`}>{space.planNote}</span>
            </div>
          </div>
        </div>
        <div className="container wide rise" style={{ animationDelay: "260ms" }}>
          <div className="sp-show" data-capture="apercu" data-tilt data-depth>
            <div className="frame">
              <Screen space={space.id} eager />
              <i className="glare" aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      <section className="section tight" data-capture="fonctions">
        <div className="container">
          <SectionHead eyebrow="Ce que tu peux faire" title={[space.name, "en détail."]} lead={`${space.features.length} fonctions livrées dans NEXORA ${APP_VERSION}, avec l’offre qui les ouvre.`} />
          <ol className="feat-list" data-glow>
            {space.features.map((f, i) => (
              <Reveal as="li" className="feat glow" key={f.title} delay={(i % 2) * 70}>
                <span className="feat-n">{String(i + 1).padStart(2, "0")}</span>
                <span className="feat-b">
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </span>
                {f.plan ? <span className={`plan-tag ${f.plan}`}>{PLAN_LABEL[f.plan]}</span> : space.trial && <span className="plan-tag trial">{space.trial.tag}</span>}
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {space.id === "preview" && <DeviceCatalog />}

      {space.details && (
        <section className="section tight">
          <div className="container">
            <Reveal className="details">
              <h2 className="h-3">{space.details.title}</h2>
              <ul>
                {space.details.items.map((d) => (
                  <li className="chip" key={d}>
                    <i className="dot" />
                    {d}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>
      )}

      <section className="section tight" data-capture="offres">
        <div className="container">
          <SectionHead eyebrow="Dans tes offres" title={["Ce qui est inclus,", "offre par offre."]}>
            <a className="link-arrow" href="#/tarifs/comparatif">
              Voir le comparatif complet <Icon name="nxArrowRight" size={15} stroke={2} />
            </a>
          </SectionHead>
          <PlanSplit space={space} />
        </div>
      </section>

      <section className="section tight">
        <div className="container sp-nav" data-glow>
          {[prev, next].map((s, i) => (
            <a key={s.id} href={spaceHref(s)} className={`sp-nav-card glow${i ? " next" : ""}`} data-space={s.id}>
              <small>{i ? "Espace suivant" : "Espace précédent"}</small>
              <span className="sp-nav-row">
                <span className="sp-ic">
                  <Icon name={s.icon} size={19} />
                </span>
                <b>{s.name}</b>
                <span className="round-go">
                  <Icon name={i ? "nxArrowRight" : "back"} size={16} stroke={2} />
                </span>
              </span>
              <span className="muted">{s.subtitle}</span>
            </a>
          ))}
        </div>
      </section>
      <CtaBand />
    </div>
  )
}
