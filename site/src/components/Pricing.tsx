import { useState, type ReactNode } from "react"
import { COMPARE } from "../../../nexora/app/renderer/nx/offres/catalog.js"
import { Icon } from "../lib/icons"
import { Reveal, useTween } from "../lib/motion"
import { discounted, limitText, money, percent, monthsOffered, usePayments, useRemote, type Plan, type PlanId } from "../lib/remote"
import { useParrain, type Parrain } from "../lib/referral"
import { cn } from "../lib/utils"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group"

type Row = { label: string; perm?: string; limit?: string; unit?: string; note?: Partial<Record<PlanId, string>>; text?: Partial<Record<PlanId, string>> }

/*
 * NEXORA #072 (audit) : le site n'affiche que ce qui existe. Le catalogue partagé avec l'application et les offres
 * du serveur promettent encore une « communauté » (aucune n'existe : l'assistance passe par l'adresse e-mail de l'équipe)
 * et un « accès en avant-première » (permission `early_access` vérifiée nulle part). Le badge du serveur « Le plus
 * choisi » affirme une popularité qu'aucun chiffre ne soutient : le site dit « Recommandé ».
 */
const GROUPS = (COMPARE as unknown as [string, Row[]][]).map(([group, rows]) => [
  group,
  rows
    .filter((r) => r.perm !== "early_access")
    .map((r) => (r.label === "Assistance" ? { ...r, text: { free: "Depuis NEXORA", pro: "Prioritaire" } } : r)),
]) as [string, Row[]][]
const honestFeature = (f: string) => f.replace(/\s+et accès en avant-première aux nouveautés/i, "").replace(/^Accès en avant-première aux nouveautés$/i, "")
const honestBadge = (b: string) => (/choisi|populaire|vendu|préféré/i.test(b) ? "Recommandé" : b)

const LOOK: Record<PlanId, string> = { free: "nxSend", pro: "nxCrown" }

function PlanCard({ plan, annual, ready, start, parrain, referralPct }: { plan: Plan; annual: boolean; ready: boolean; start: string; parrain: Parrain | null; referralPct: number }) {
  const featured = plan.id === "pro"
  const free = !plan.price_month_cents
  // NEXORA #090 : lien d'un parrain gardé par le site : prix avec la remise (à chaque paiement), prix normal barré.
  const refOn = featured && !free && !!parrain
  const pct = refOn && parrain ? parrain.discount_pct : referralPct
  const listPerMonth = annual && plan.price_year_cents ? Math.round(plan.price_year_cents / 12) : plan.price_month_cents
  const perMonth = refOn ? discounted(listPerMonth, pct) : listPerMonth
  const yearPrice = refOn ? discounted(plan.price_year_cents, pct) : plan.price_year_cents
  const offered = monthsOffered(plan)
  const shown = useTween(perMonth)
  return (
    <article className={cn("glow relative flex h-full flex-col overflow-hidden p-6 sm:p-8", featured ? "panel-hi" : "panel")} data-plan={plan.id}>
      {/* #089 : passe à la ligne sur téléphone (nom et ruban « Toutes les options » ne tenaient pas sur 360 px). */}
      <div className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
        <span className="flex items-center gap-3">
          <span className={cn("sp-ic", featured && "solid")}>
            <Icon name={LOOK[plan.id] ?? "nxCrown"} size={19} />
          </span>
          <h3 className="display text-[30px] leading-none font-medium tracking-[-0.04em]">{plan.name}</h3>
        </span>
        {plan.badge && <Badge variant={featured ? "solid" : "default"}>{honestBadge(plan.badge)}</Badge>}
      </div>
      <p className="relative mt-4 min-h-[48px] text-[14.5px] text-muted-foreground">{plan.description}</p>
      <div className={cn("relative mt-6 flex items-baseline gap-2 transition-opacity", !ready && "opacity-40")} aria-live="polite">
        <b className={cn("display text-[clamp(60px,6vw,84px)] leading-[0.85] font-normal tracking-[-0.03em] tabular-nums", featured && "text-primary")}>{money(Math.round(shown))}</b>
        <span className="text-muted-foreground">/ mois</span>
        {refOn && <s className="ml-1 text-[17px] text-muted-foreground/80 tabular-nums">{money(listPerMonth)}</s>}
      </div>
      <p className="relative mt-2 text-[13px] text-muted-foreground">
        {free
          ? "Sans carte bancaire, sans limite de durée"
          : annual
            ? `${money(yearPrice)} facturés une fois par an`
            : `ou ${money(yearPrice)} par an${offered ? `, soit ${offered} mois offerts` : ""}`}
      </p>
      {featured && !free && pct > 0 && (
        <p className={cn("relative mt-3 flex items-center gap-2 text-[13px]", refOn ? "font-medium text-primary" : "text-muted-foreground")}>
          <Icon name="gift" size={15} className={refOn ? "" : "text-primary"} />
          {refOn && parrain ? `Code ${parrain.code}${parrain.partner ? ` de ${parrain.partner}` : ""} : −${percent(pct)} % à chaque paiement` : `−${percent(pct)} % à chaque paiement avec le code d’un parrain`}
        </p>
      )}
      <Button asChild size="lg" variant={featured ? "default" : "outline"} className="relative mt-7 w-full">
        {/* #076 : paiement dans le navigateur, page « Ma licence ». */}
        <a href={free ? start : "/licence?offre=pro"}>
          {free ? "Commencer gratuitement" : `Passer à ${plan.name}`}
          <Icon name="nxArrowRight" size={16} stroke={2} />
        </a>
      </Button>
      <ul className="relative mt-8 flex flex-col gap-3 border-t border-foreground/[0.1] pt-7">
        {plan.features.map(honestFeature).filter(Boolean).map((f) => (
          <li key={f} className="flex items-start gap-3 text-[14.5px] text-foreground/85">
            <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", featured ? "bg-primary text-primary-foreground" : "bg-foreground text-background")}>
              <Icon name="check" size={12} stroke={3} />
            </span>
            {f}
          </li>
        ))}
      </ul>
    </article>
  )
}

/** Cartes des offres (prix lus sur le serveur, comme l'application), mensuel ou annuel. */
export function PricingCards() {
  const { plans, ready, downloadUrl, supportEmail, referral } = useRemote()
  const parrain = useParrain()
  const payments = usePayments()
  const [annual, setAnnual] = useState(false)
  const offered = Math.max(0, ...plans.map(monthsOffered))
  return (
    <div>
      <Reveal className="mb-12 flex justify-center">
        <ToggleGroup type="single" value={annual ? "year" : "month"} onValueChange={(v) => v && setAnnual(v === "year")} aria-label="Période de facturation">
          <ToggleGroupItem value="month">Mensuel</ToggleGroupItem>
          <ToggleGroupItem value="year" className="group">
            Annuel
            {offered > 0 && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary group-data-[state=on]:bg-primary-foreground/15 group-data-[state=on]:text-primary-foreground">{offered} mois offerts</span>}
          </ToggleGroupItem>
        </ToggleGroup>
      </Reveal>
      {/* Offres centrées selon leur nombre (deux offres sur 900 px). */}
      <div className={cn("mx-auto grid gap-8 md:grid-cols-2", plans.length > 2 ? "max-w-6xl lg:grid-cols-3" : "max-w-[940px]")} data-glow>
        {plans.map((p, i) => (
          <Reveal key={p.id} delay={i * 90}>
            <PlanCard plan={p} annual={annual} ready={ready} start={downloadUrl || "/telecharger"} parrain={referral.enabled ? parrain : null} referralPct={referral.enabled ? referral.discount_pct : 0} />
          </Reveal>
        ))}
      </div>
      <p className="mx-auto mt-10 flex max-w-[940px] items-start gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
        <Icon name="info" size={15} className="mt-0.5 shrink-0 text-primary" />
        {/* #087 (A-056) : tant que le paiement en ligne n'est pas ouvert (Worker, /license/config), l'équipe active Pro sur demande. */}
        {payments ? (
          <span>Paiement sécurisé dans votre navigateur, depuis la page Ma licence : NEXORA passe en Pro au contrôle de licence suivant. Prix en dollars américains.</span>
        ) : (
          <span>
            Pour passer à Pro, écrivez à{" "}
            <a className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:text-primary" href={`mailto:${supportEmail}?subject=${encodeURIComponent("Passage à l’offre Pro")}`}>
              {supportEmail}
            </a>{" "}
            : l’équipe NEXORA active votre offre, en général sous 24 h. Prix en dollars américains.
          </span>
        )}
      </p>
    </div>
  )
}

function cell(row: Row, plan: Plan): ReactNode {
  if (row.perm) {
    return plan.perms[row.perm] ? (
      <span className="inline-grid size-6 place-items-center rounded-full bg-primary/15 text-primary">
        <Icon name="check" size={14} stroke={2.6} />
        <span className="sr-only">Inclus</span>
      </span>
    ) : (
      <span className="text-muted-foreground/60">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Non inclus</span>
      </span>
    )
  }
  if (row.limit) {
    const note = row.note?.[plan.id]
    return (
      <span className="inline-flex flex-col items-center">
        {limitText(plan.limits[row.limit], row.unit)}
        {note && <small className="text-[12px] text-muted-foreground">{note}</small>}
      </span>
    )
  }
  return <span>{row.text?.[plan.id] ?? "—"}</span>
}

/**
 * Tableau comparatif complet (catalogue des offres de NEXORA, limites et fonctions lues sur le serveur).
 * #089 : sur téléphone, liste par groupe (la fonction sur une ligne, puis les valeurs de chaque offre côte à côte) :
 * le tableau, large d'au moins 560 px, obligeait à le faire défiler de côté et faisait glisser toute la page.
 */
export function CompareTable() {
  const { plans } = useRemote()
  return (
    <>
      <CompareList plans={plans} />
      <div className="panel hidden overflow-x-clip px-2 pb-2 md:block">
        <table className="cmp min-w-[560px]">
          <thead>
            <tr>
              <th scope="col" className="text-[13px] font-medium text-muted-foreground">
                Fonctions
              </th>
              {plans.map((p) => (
                <th scope="col" key={p.id} className={p.id === "pro" ? "featured" : ""}>
                  <b className="display block text-[22px] font-medium tracking-[-0.03em]">{p.name}</b>
                  <span className="block text-[12.5px] font-normal text-muted-foreground">{p.price_month_cents ? `${money(p.price_month_cents)} / mois` : "0 $, sans limite de durée"}</span>
                </th>
              ))}
            </tr>
          </thead>
          {GROUPS.map(([group, rows]) => (
            <tbody key={group}>
              <tr className="cmp-group">
                <th colSpan={plans.length + 1} scope="colgroup">
                  {group}
                </th>
              </tr>
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  {plans.map((p) => (
                    <td key={p.id} className={p.id === "pro" ? "featured" : ""}>
                      {cell(row, p)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </>
  )
}

/** #089 : comparatif sur téléphone (sous 768 px) : une carte par groupe, les deux offres côte à côte sous chaque fonction. */
function CompareList({ plans }: { plans: Plan[] }) {
  return (
    <div className="flex flex-col gap-4 md:hidden">
      <div className="grid grid-cols-2 gap-2">
        {plans.map((p) => (
          <div key={p.id} className={cn("rounded-xl border px-4 py-3", p.id === "pro" ? "border-primary/40 bg-primary/[0.06]" : "border-foreground/[0.08] bg-foreground/[0.02]")}>
            <b className={cn("block text-[16px] font-semibold", p.id === "pro" && "text-primary")}>{p.name}</b>
            <span className="block text-[12px] text-muted-foreground">{p.price_month_cents ? `${money(p.price_month_cents)} / mois` : "0 $, sans limite de durée"}</span>
          </div>
        ))}
      </div>
      {GROUPS.map(([group, rows]) => (
        <section key={group} className="panel overflow-hidden" aria-label={group}>
          <h3 className="px-5 pt-5 pb-3 text-[13px] font-medium">{group}</h3>
          <ul>
            {rows.map((row) => (
              <li key={row.label} className="border-t border-foreground/[0.06] px-5 py-3.5">
                <p className="cmp-label text-[14px] leading-snug">{row.label}</p>
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  {plans.map((p) => (
                    <div key={p.id} className={cn("flex min-h-10 items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13px]", p.id === "pro" ? "bg-primary/[0.07]" : "bg-foreground/[0.03]")}>
                      <span className="text-[11.5px] text-muted-foreground">{p.name}</span>
                      <span className="text-right leading-tight">{cell(row, p)}</span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
