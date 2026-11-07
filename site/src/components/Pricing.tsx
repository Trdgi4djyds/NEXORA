import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { COMPARE } from "../../../nexora/app/renderer/nx/offres/catalog.js"
import { Icon } from "../lib/icons"
import { Reveal, useTween } from "../lib/motion"
import { limitText, money, monthsOffered, useRemote, type Plan, type PlanId } from "../lib/remote"

type Row = { label: string; perm?: string; limit?: string; unit?: string; note?: Partial<Record<PlanId, string>>; text?: Partial<Record<PlanId, string>> }
const GROUPS = COMPARE as unknown as [string, Row[]][]

const LOOK: Record<PlanId, { icon: string; space: string }> = {
  free: { icon: "nxSend", space: "browser" },
  standard: { icon: "bolt", space: "home" },
  pro: { icon: "nxCrown", space: "desktop" },
}

function PlanCard({ plan, annual, ready, start }: { plan: Plan; annual: boolean; ready: boolean; start: string }) {
  const featured = plan.id === "standard"
  const free = !plan.price_month_cents
  const perMonth = annual && plan.price_year_cents ? Math.round(plan.price_year_cents / 12) : plan.price_month_cents
  const offered = monthsOffered(plan)
  const look = LOOK[plan.id] ?? LOOK.pro
  const shown = useTween(perMonth)
  return (
    <article className={`plan${featured ? " featured" : ""}`} data-plan={plan.id}>
      {plan.badge && <span className="plan-badge">{plan.badge}</span>}
      <div className="plan-top">
        <span className="sp-ic" data-space={look.space}>
          <Icon name={look.icon} size={19} />
        </span>
        <h3>{plan.name}</h3>
      </div>
      <p className="plan-desc">{plan.description}</p>
      <div className={`plan-price${ready ? "" : " loading"}`} aria-live="polite">
        <b>{money(Math.round(shown))}</b>
        <span>/ mois</span>
      </div>
      <p className="plan-bill">
        {free
          ? "Sans carte bancaire, sans limite de durée"
          : annual
            ? `${money(plan.price_year_cents)} facturés une fois par an`
            : `ou ${money(plan.price_year_cents)} par an${offered ? `, soit ${offered} mois offerts` : ""}`}
      </p>
      <a className={`btn ${featured ? "btn-primary" : "btn-ghost"} plan-cta`} href={free ? start : "../"}>
        {free ? "Commencer gratuitement" : `Choisir ${plan.name}`}
        <Icon name="nxArrowRight" size={16} stroke={2} className="ico-go" />
      </a>
      <ul className="plan-feats">
        {plan.features.map((f) => (
          <li key={f}>
            <span className="plan-check">
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
  const { plans, ready, downloadUrl } = useRemote()
  const [annual, setAnnual] = useState(false)
  const offered = Math.max(0, ...plans.map(monthsOffered))
  const group = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const measure = () => {
      const btn = group.current?.querySelector<HTMLElement>('button[aria-pressed="true"]')
      if (btn) setPill({ left: btn.offsetLeft, width: btn.offsetWidth })
    }
    measure()
    window.addEventListener("resize", measure)
    document.fonts?.ready.then(measure)
    return () => window.removeEventListener("resize", measure)
  }, [annual, offered])
  return (
    <div className="pricing">
      <Reveal className="billing" role="group" aria-label="Période de facturation">
        <div className="billing-in" ref={group}>
          {pill && <i className="billing-pill" style={{ transform: `translateX(${pill.left}px)`, width: pill.width }} aria-hidden="true" />}
        <button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}>
          Mensuel
        </button>
        <button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}>
          Annuel
          {offered > 0 && <span className="billing-save">{offered} mois offerts</span>}
        </button>
        </div>
      </Reveal>
      <div className="plans">
        {plans.map((p, i) => (
          <Reveal key={p.id} delay={i * 90} className="plan-wrap">
            <PlanCard plan={p} annual={annual} ready={ready} start={downloadUrl || "#/telecharger"} />
          </Reveal>
        ))}
      </div>
      <p className="plans-note">
        <Icon name="chat" size={15} /> Change d’offre à tout moment depuis NEXORA (Mon compte, puis Offre et usage) : ta demande est
        traitée par l’équipe NEXORA et ta nouvelle offre est activée sous 24 h. Prix en dollars américains.
      </p>
    </div>
  )
}

function cell(row: Row, plan: Plan): ReactNode {
  if (row.perm) {
    return plan.perms[row.perm] ? (
      <span className="cmp-yes">
        <Icon name="check" size={14} stroke={2.6} />
        <span className="sr-only">Inclus</span>
      </span>
    ) : (
      <span className="cmp-no">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Non inclus</span>
      </span>
    )
  }
  if (row.limit) {
    const note = row.note?.[plan.id]
    return (
      <span className="cmp-val">
        {limitText(plan.limits[row.limit], row.unit)}
        {note && <small>{note}</small>}
      </span>
    )
  }
  return <span className="cmp-val">{row.text?.[plan.id] ?? "—"}</span>
}

/** Tableau comparatif complet (catalogue des offres de NEXORA, limites et fonctions lues sur le serveur). */
export function CompareTable() {
  const { plans } = useRemote()
  return (
    <div className="cmp-wrap">
      <table className="cmp">
        <thead>
          <tr>
            <th scope="col">Fonctions</th>
            {plans.map((p) => (
              <th scope="col" key={p.id} className={p.id === "standard" ? "featured" : ""}>
                <b>{p.name}</b>
                <span>{p.price_month_cents ? `${money(p.price_month_cents)} / mois` : "0 $, sans limite de durée"}</span>
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
                  <td key={p.id} className={p.id === "standard" ? "featured" : ""}>
                    {cell(row, p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}
