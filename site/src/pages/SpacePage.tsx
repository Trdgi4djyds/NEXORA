import type { CSSProperties } from "react"
import { MacBook, NumberRows, Watermark, WordStrip } from "../components/Blocks"
import { CtaBand } from "../components/CtaBand"
import { DeviceGallery, DeviceWall } from "../components/DeviceWall"
import { MainButton } from "../components/Download"
import { Device } from "../components/Screen"
import { SectionHead } from "../components/SectionHead"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { SPACE_FACTS } from "../data/content"
import { PLAN_LABEL, SPACES, spaceHref, type Feature, type Space } from "../data/spaces"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { APP_VERSION, DEVICE_CATEGORIES, DEVICE_LIST } from "../lib/product"
import type { PlanId } from "../lib/remote"
import { cn } from "../lib/utils"

/** Catalogue des appareils du Responsive Lab, tiré des sources de NEXORA, avec la vitrine des vrais cadres (#086). */
function DeviceCatalog() {
  const names = DEVICE_LIST.map((d) => d.name)
  const half = Math.ceil(names.length / 2)
  return (
    <section className="section-tight relative overflow-hidden" data-capture="appareils">
      <Watermark icon="tablet" className="wm-tr" size={420} />
      <div className="wrap relative">
        <SectionHead
          eyebrow="Le catalogue"
          title={[`${DEVICE_LIST.length} appareils,`, `${DEVICE_CATEGORIES.length} familles.`]}
          lead="Des téléphones les plus vendus aux écrans de voiture : chaque modèle avec sa taille d’écran et sa densité réelles. Les maquettes ci-dessous affichent ce site."
        />
        <DeviceWall />
      </div>
      <div className="relative mt-12">
        <DeviceGallery />
      </div>
      <div className="mt-10 flex flex-col gap-3" aria-hidden="true">
        {[names.slice(0, half), names.slice(half)].map((row, r) => (
          <div className={`marquee slow${r ? " rev" : ""}`} key={r}>
            <ul className="marquee-track">
              {[...row, ...row].map((n, i) => (
                <li key={i} className="rounded-full border border-foreground/[0.08] px-3.5 py-1.5 text-[13px] whitespace-nowrap text-muted-foreground">
                  {n}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Ce que chaque offre apporte dans cet espace (#076 : Gratuit et Pro ; #087 : limites propres à l'espace). */
function PlanSplit({ space }: { space: Space }) {
  const cols: { id: PlanId; title: string; lead: string; items: Feature[] }[] = [
    {
      id: "free",
      title: "Gratuit",
      lead: space.limits ? space.limits.free : space.plan === "free" ? "Pour découvrir et créer" : "Ouvert pendant ton essai de 24 h, puis réservé à Pro",
      items: space.plan === "free" ? space.features.filter((f) => !f.plan) : [],
    },
    {
      id: "pro",
      title: "Pro",
      lead: space.limits
        ? space.limits.pro
        : space.plan !== "free" ? "Tout l’espace :" : space.features.some((f) => f.plan === "pro") ? "Tout le Gratuit, plus :" : "Le même espace, avec des limites plus larges :",
      items: space.limits
        ? space.limits.perks.map((title) => ({ icon: "check", title, text: "" }))
        : space.plan === "free" ? space.features.filter((f) => f.plan === "pro") : space.features,
    },
  ]
  return (
    <div className="grid gap-6 md:grid-cols-2" data-glow>
      {cols.map((c, i) => (
        <Reveal className={cn("glow has-wm p-8", c.id === "pro" ? "panel-hi" : "panel")} key={c.id} delay={i * 80}>
          <Watermark icon={c.id === "pro" ? "nxCrown" : "nxSend"} className="wm-br" size={200} />
          <Badge variant={c.id === "pro" ? "solid" : "default"}>{c.title}</Badge>
          <p className="mt-4 text-[15px] text-muted-foreground">{c.lead}</p>
          <ul className="mt-5 flex flex-col gap-3">
            {c.items.length ? (
              c.items.map((f) => (
                <li key={f.title} className="flex items-start gap-3 text-[14.5px]">
                  <Icon name="check" size={15} stroke={2.6} className="mt-1 shrink-0 text-primary" />
                  {f.title}
                </li>
              ))
            ) : (
              <li className="text-[14.5px] text-muted-foreground">
                {/* #072 : un espace gratuit sans fonction Pro n'est pas « à ouvrir » : il est déjà inclus. */}
                {c.id === "pro"
                  ? space.limits
                    ? "Les mêmes fonctions, pour toutes tes applications : projets, membres et constructions plus larges."
                    : "Des limites plus larges : projets, membres et constructions."
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
    <div data-space={space.id}>
      {/* #099 : haut de page photographique voilé, sous l'en-tête (comme les autres pages intérieures). */}
      <section className="page-photo relative overflow-hidden pt-36 pb-16 md:pt-44 md:pb-24" data-capture="haut">
        <div className="wrap relative">
          <a href="/espaces" className="rise inline-flex items-center gap-1.5 text-[13.5px] text-muted-foreground transition hover:text-foreground">
            <Icon name="chevronLeft" size={15} stroke={2} /> Tous les espaces
          </a>
          <div className="mt-8 grid items-end gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
            <div className="rise" style={{ animationDelay: "80ms" }}>
              <span className="flex items-center gap-4">
                <span className="sp-ic lg solid">
                  <Icon name={space.icon} size={26} />
                </span>
                <span className="eyebrow">{space.name}</span>
              </span>
              <h1 className="title-1 mt-7">
                {space.h1[0]} <span className="tone-neon">{space.h1[1]}</span>
              </h1>
            </div>
            <div className="rise" style={{ animationDelay: "180ms" }}>
              <p className="lead">{space.lead}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <MainButton />
                <Button asChild variant="outline">
                  <a href="/tarifs">Voir les tarifs</a>
                </Button>
              </div>
              <span className="mt-5 inline-flex items-center gap-2 text-[13px] text-muted-foreground">
                <i className="dot" /> {space.planNote}
              </span>
            </div>
          </div>
        </div>
        <div className="wrap-wide relative mt-14 md:mt-20">
          {/* #086 : scène de face (aucune rotation), parallaxe légère ; vrais appareils pour l'App Builder. */}
          {/* #105 : vrai MacBook Pro 16 pouces (cadre photographique) à la place de la fenêtre dessinée en CSS. */}
          <div className="hero-visual stage relative mx-auto max-w-[1360px]" data-capture="apercu" data-tilt data-depth>
            <div className="par relative mx-auto w-[88%] max-w-[1100px]" style={{ "--k": "4px", "--ky": "-12px" } as CSSProperties}>
              <MacBook space={space.id} eager className="!max-w-none" />
            </div>
            {space.id === "android" && (
              <div className="absolute right-[1%] bottom-[-8%] flex w-[30%] items-end gap-[6%]">
                <div className="w-[47%]">
                  <Device kind="galaxy" eager />
                </div>
                <div className="w-[45%]">
                  <Device kind="iphone" eager />
                </div>
              </div>
            )}
            {space.id === "preview" && (
              <div className="absolute right-[1%] bottom-[-8%] w-[15%]">
                <Device kind="iphone" eager />
              </div>
            )}
          </div>
        </div>
      </section>

      <WordStrip words={space.features.map((f) => f.title)} />

      <section className="section lime relative overflow-hidden" data-capture="fonctions">
        <Watermark icon={space.icon} className="wm-tr" size={520} />
        <div className="wrap relative">
          <SectionHead eyebrow="Ce que tu peux faire" title={[space.name, "en détail."]} lead={`${space.features.length} fonctions livrées dans NEXORA ${APP_VERSION}, avec l’offre qui les ouvre.`} />
          <ol className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" data-glow>
            {space.features.map((f, i) => (
              <Reveal as="li" className="glow surface feat-card flex flex-col p-7" key={f.title} delay={(i % 3) * 70}>
                <Watermark icon={f.icon} className="wm-card" size={140} />
                <span className="flex items-center justify-between gap-3">
                  <span className="sp-ic solid">
                    <Icon name={f.icon} size={18} />
                  </span>
                  {f.plan ? <Badge variant="outline">{PLAN_LABEL[f.plan]}</Badge> : space.trial ? <Badge variant="outline">{space.trial.tag}</Badge> : <span className="text-[12px] font-semibold tabular-nums text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>}
                </span>
                <h3 className="display mt-6 text-[23px] leading-tight font-medium tracking-[-0.03em]">{f.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">{f.text}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <SpaceNumbers space={space} />

      {space.id === "preview" && <DeviceCatalog />}

      {space.details && (
        <section className="section-tight">
          <div className="wrap">
            <Reveal className="hud has-wm p-8 md:p-10">
              <Watermark icon="layers" className="wm-br" size={220} />
              <h2 className="title-3">{space.details.title}</h2>
              <ul className="mt-6 flex flex-wrap gap-2.5">
                {space.details.items.map((d) => (
                  <li className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.02] px-3.5 py-1.5 text-[14px]" key={d}>
                    <i className="dot" />
                    {d}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>
      )}

      <section className="section-tight light" data-capture="offres">
        <div className="wrap">
          <SectionHead eyebrow="Dans tes offres" title={["Ce qui est inclus,", "offre par offre."]}>
            <a className="link-arrow" href="/tarifs/comparatif">
              Voir le comparatif complet <Icon name="nxArrowRight" size={15} stroke={2} />
            </a>
          </SectionHead>
          <PlanSplit space={space} />
        </div>
      </section>

      <section className="section-tight light pt-0">
        <div className="wrap grid gap-6 md:grid-cols-2" data-glow>
          {[prev, next].map((s, i) => (
            <a key={s.id} href={spaceHref(s)} data-space={s.id} className={cn("glow lift tile has-wm flex flex-col gap-3 p-7", i && "md:items-end md:text-right")}>
              <Watermark icon={s.icon} className={i ? "wm-bl" : "wm-br"} size={180} />
              <small className="text-[13px] font-medium text-muted-foreground">{i ? "Espace suivant" : "Espace précédent"}</small>
              <span className={cn("flex items-center gap-3", i && "md:flex-row-reverse")}>
                <span className="sp-ic">
                  <Icon name={s.icon} size={19} />
                </span>
                <b className="display text-[28px] font-medium tracking-[-0.035em]">{s.name}</b>
                <span className="go-ring">
                  <Icon name={i ? "nxArrowRight" : "back"} size={16} stroke={2} />
                </span>
              </span>
              <span className="text-[14px] text-muted-foreground">{s.subtitle}</span>
            </a>
          ))}
        </div>
      </section>
      <CtaBand bright />
    </div>
  )
}

/** #105 : l'espace en chiffres, en rangées géantes (référence « About us in numbers » de l'utilisateur). */
function SpaceNumbers({ space }: { space: Space }) {
  const pro = space.features.filter((f) => f.plan === "pro").length
  const [fact, factLabel] = SPACE_FACTS[space.id]
  return (
    <NumberRows
      eyebrow="En chiffres"
      title={[space.name, "en trois chiffres."]}
      icon="nxiChart"
      rows={[
        {
          value: String(space.features.length),
          label: "fonctions",
          text: (
            <>
              Livrées dans <b>NEXORA {APP_VERSION}</b>
              {pro ? `, dont ${pro} ouvertes par l’offre Pro.` : ", toutes ouvertes avec l’offre Gratuite."}
            </>
          ),
        },
        { value: fact, label: factLabel, text: space.card + "." },
        { value: PLAN_LABEL[space.plan], label: space.plan === "free" ? "pour commencer" : "pour l’ouvrir", text: space.planNote + "." },
      ]}
    />
  )
}
