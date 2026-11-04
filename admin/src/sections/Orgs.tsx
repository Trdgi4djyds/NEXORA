import { useState } from "react"
import { go, useRefresh, type SectionProps } from "../App"
import { Icon } from "../icons"
import { must, sb, type FnReturn, type Row } from "../supabase"
import {
  Bar, downloadCsv, Drawer, Empty, fmtAgo, fmtDate, fmtNum, JsonView, Kpi, Loaded, ROLE_LABEL, SearchBox, Seg, SUB_LABEL,
  Table, Tag, useAction, useLoad, UserCell, plural, LIMIT_LABEL, INVITE_LABEL,
} from "../ui"

type Org = FnReturn<"admin_orgs">[number]
const SUB_STATUSES = ["active", "trialing", "past_due", "canceled"]

export function Orgs({ param }: SectionProps) {
  const refresh = useRefresh()
  const [search, setSearch] = useState("")
  const [kind, setKind] = useState<"all" | "teams" | "personal" | "paid">("all")
  const [tick, setTick] = useState(0)
  const act = useAction()
  const q = useLoad(async () => {
    const [orgs, plans] = await Promise.all([sb.rpc("admin_orgs", { search }), sb.from("plans").select("id, name, price_month_cents").order("sort")])
    return { orgs: (must(orgs) as Org[]) || [], plans: must(plans) as Pick<Row<"plans">, "id" | "name" | "price_month_cents">[] }
  }, [search, refresh, tick])
  const reload = () => setTick((n) => n + 1)

  async function setPlan(org: string, plan: string, status: string) {
    if (await act.run(async () => must(await sb.rpc("admin_set_plan", { org, plan, sub_status: status })), "Abonnement mis à jour.")) reload()
  }

  return (
    <>
      <div className="toolbar">
        <SearchBox value={search} onSearch={setSearch} placeholder="Nom de l’espace ou e-mail du propriétaire…" />
        <Seg value={kind} onChange={setKind} options={[["all", "Tous"], ["teams", "Équipes"], ["personal", "Personnels"], ["paid", "Payants"]]} />
        <span className="grow" />
        <button className="btn" disabled={!q.data?.orgs.length} onClick={() => downloadCsv("espaces", q.data?.orgs || [])}>
          <Icon name="download" size={14} /> Exporter
        </button>
      </div>
      <Loaded q={q}>
        {({ orgs, plans }) => {
          const paid = new Set(plans.filter((p) => p.price_month_cents > 0).map((p) => p.id))
          const rows = orgs.filter((o) => kind === "all" || (kind === "teams" ? !o.personal : kind === "personal" ? o.personal : paid.has(o.plan_id)))
          // NEXORA #037 : cartes des équipes et des espaces, illustrées comme dans l'application.
          const teams = orgs.filter((o) => !o.personal)
          return (
            <>
            <div className="kpis" style={{ marginBottom: 14 }}>
              <Kpi label="Équipes" object="team" value={fmtNum(teams.length)} hint={plural(teams.reduce((t, o) => t + o.members, 0), "membre")} onClick={() => setKind("teams")} />
              <Kpi label="Espaces personnels" object="folder" value={fmtNum(orgs.length - teams.length)} hint="un par compte" onClick={() => setKind("personal")} />
              <Kpi label="Espaces payants" object="star" value={fmtNum(orgs.filter((o) => paid.has(o.plan_id)).length)} hint="Standard et Pro" onClick={() => setKind("paid")} />
              <Kpi label="Projets" object="folder" value={fmtNum(orgs.reduce((t, o) => t + o.projects, 0))} hint={plural(orgs.reduce((t, o) => t + o.designs, 0), "document NEX-DESIGN", "documents NEX-DESIGN")} />
            </div>
            <Table head={["Espace", "Propriétaire", "Offre", "Statut", "Membres", "Contenus", "Créé"]} count={rows.length} empty="Aucun espace.">
              {rows.map((o) => (
                <tr key={o.id} className="click" onClick={(e) => !(e.target as HTMLElement).closest("select") && go("orgs", o.id)}>
                  <td>
                    <div className="row">
                      <Icon name={o.personal ? "user" : "group"} size={15} />
                      <b>{o.name}</b>
                      {o.personal && <small className="muted">personnel</small>}
                    </div>
                  </td>
                  <td>{o.owner_email || "—"}</td>
                  <td>
                    <select className="input sm" value={o.plan_id} disabled={act.busy} onChange={(e) => setPlan(o.id, e.target.value, "active")}>
                      {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="input sm" value={o.sub_status} disabled={act.busy} onChange={(e) => setPlan(o.id, o.plan_id, e.target.value)}>
                      {SUB_STATUSES.map((s) => <option key={s} value={s}>{SUB_LABEL[s]}</option>)}
                    </select>
                  </td>
                  <td className="num">{o.members}</td>
                  <td className="muted nowrap">{plural(o.projects, "projet")} · {plural(o.designs, "design")}</td>
                  <td className="nowrap">{fmtDate(o.created_at)}</td>
                </tr>
              ))}
            </Table>
            </>
          )
        }}
      </Loaded>
      {param && <OrgDrawer id={param} key={`${param}-${tick}`} plans={q.data?.plans || []} onChanged={reload} />}
    </>
  )
}

function OrgDrawer({ id, plans, onChanged }: { id: string; plans: { id: string; name: string }[]; onChanged: () => void }) {
  const refresh = useRefresh()
  const act = useAction()
  const q = useLoad(async () => {
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const [org, members, sub, quota, invites, usage] = await Promise.all([
      sb.from("organizations").select("*").eq("id", id).maybeSingle(),
      sb.from("organization_members").select("role, created_at, user_id, profiles(id, full_name, email, avatar_url)").eq("org_id", id),
      sb.from("subscriptions").select("*").eq("org_id", id).maybeSingle(),
      // NEXORA #037 : limites de l'offre de l'espace et usage, lus par nx_plan_status ; org_quota en repli.
      orgQuota(id),
      sb.from("invitations").select("*").eq("org_id", id).order("created_at", { ascending: false }),
      sb.from("usage_daily").select("*").eq("org_id", id).gte("day", since),
    ])
    return {
      org: must(org) as Row<"organizations"> | null,
      members: must(members) as unknown as (Row<"organization_members"> & { profiles: Row<"profiles"> | null })[],
      sub: must(sub) as Row<"subscriptions"> | null,
      quota: quota.error ? null : (quota.data as unknown),
      invites: must(invites) as Row<"invitations">[],
      usage: must(usage) as Row<"usage_daily">[],
    }
  }, [id, refresh])
  const [periodEnd, setPeriodEnd] = useState<string | null>(null)

  return (
    <Drawer title={q.data?.org?.name || "Espace"} sub={q.data?.org?.personal ? "Espace personnel" : "Équipe"} onClose={() => go("orgs")}>
      <Loaded q={q}>
        {({ org, members, sub, quota, invites, usage }) =>
          !org ? <Empty>Cet espace n’existe plus.</Empty> : (
            <>
              <section>
                <h4>Abonnement</h4>
                <dl className="kv">
                  <dt>Offre</dt><dd>{plans.find((p) => p.id === sub?.plan_id)?.name || sub?.plan_id || "Gratuit"}</dd>
                  <dt>Statut</dt><dd><Tag tone={sub?.status === "active" ? "ok" : sub?.status === "past_due" ? "bad" : ""}>{SUB_LABEL[sub?.status || "active"] || sub?.status}</Tag></dd>
                  <dt>Places</dt><dd>{sub?.seats ?? 1}</dd>
                  <dt>Fournisseur</dt><dd>{sub?.provider || "manual"}{sub?.provider_ref ? ` · ${sub.provider_ref}` : ""}</dd>
                  <dt>Fin de période</dt>
                  <dd>
                    <div className="row">
                      <input className="input sm" type="date" value={periodEnd ?? (sub?.current_period_end || "").slice(0, 10)} onChange={(e) => setPeriodEnd(e.target.value)} />
                      {periodEnd !== null && sub && (
                        <button className="btn sm primary" disabled={act.busy} onClick={async () => {
                          const ok = await act.run(async () => must(await sb.rpc("admin_set_plan", { org: id, plan: sub.plan_id, sub_status: sub.status, period_end: periodEnd ? new Date(periodEnd).toISOString() : undefined })), "Fin de période enregistrée.")
                          if (ok) { setPeriodEnd(null); onChanged() }
                        }}>Enregistrer</button>
                      )}
                    </div>
                  </dd>
                  <dt>Créé le</dt><dd>{fmtDate(org.created_at)}</dd>
                  <dt>Identifiant</dt><dd><code>{org.id}</code></dd>
                </dl>
              </section>
              {quota != null && (
                <section>
                  <h4>Utilisation des limites</h4>
                  <Quota value={quota} />
                </section>
              )}
              <section>
                <h4>Membres ({members.length})</h4>
                <div className="list">
                  {members.map((m) => (
                    <button key={m.user_id} className="li" onClick={() => go("users", m.user_id)}>
                      <div className="grow" style={{ minWidth: 0 }}><UserCell p={m.profiles} /></div>
                      <Tag tone={m.role === "owner" ? "info" : ""}>{ROLE_LABEL[m.role] || m.role}</Tag>
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <h4>Invitations ({invites.length})</h4>
                {invites.length ? (
                  <div className="list">
                    {invites.map((i) => (
                      <div key={i.id}>
                        <Icon name="mail" size={14} />
                        <span className="grow ellipsis">{i.email}</span>
                        <Tag>{ROLE_LABEL[i.role] || i.role}</Tag>
                        <Tag tone={i.status === "pending" ? "warn" : i.status === "accepted" ? "ok" : ""}>{INVITE_LABEL[i.status] || i.status}</Tag>
                        <small className="muted nowrap">{fmtAgo(i.created_at)}</small>
                      </div>
                    ))}
                  </div>
                ) : <p className="muted small">Aucune invitation.</p>}
              </section>
              <section>
                <h4>Utilisation (30 jours)</h4>
                <Usage rows={usage} />
              </section>
            </>
          )
        }
      </Loaded>
    </Drawer>
  )
}

async function orgQuota(id: string): Promise<{ data: unknown; error: unknown }> {
  const r = await sb.rpc("nx_plan_status", { p_org: id })
  if (!r.error) return { data: planQuota(r.data), error: null }
  const q = await sb.rpc("org_quota", { org: id })
  return { data: q.data, error: q.error }
}

// Réponse de nx_plan_status → { clé: { used, limit } } pour les données de l'espace.
function planQuota(v: unknown) {
  const s = (v || {}) as { org_limits?: Record<string, number>; usage?: Record<string, number> }
  const out: Record<string, { used: number; limit: number }> = {}
  for (const k of ["projects", "designs", "members", "monitors", "storage_mb"]) out[k] = { used: Number(s.usage?.[k] || 0), limit: Number(s.org_limits?.[k] ?? -1) }
  return out
}

/** Limites de l'offre : { clé: { used, limit } } ou forme libre (affichée en JSON). */
function Quota({ value }: { value: unknown }) {
  const v = value as Record<string, unknown>
  const rows = v && typeof v === "object" ? Object.entries(v).filter(([, x]) => x && typeof x === "object" && "used" in (x as object)) : []
  if (!rows.length) return <JsonView value={value} />
  return (
    <div className="stack" style={{ gap: 10 }}>
      {rows.map(([k, x]) => {
        const { used, limit } = x as { used: number; limit: number }
        return (
          <div key={k}>
            <div className="row small"><span className="grow">{LIMIT_LABEL[k] || k}</span><b>{fmtNum(used)}</b><span className="muted">/ {limit < 0 ? "illimité" : fmtNum(limit)}</span></div>
            <div style={{ marginTop: 5 }}><Bar value={used} max={limit} /></div>
          </div>
        )
      })}
    </div>
  )
}

export function Usage({ rows }: { rows: Row<"usage_daily">[] }) {
  if (!rows.length) return <p className="muted small">Aucune utilisation enregistrée.</p>
  const totals = new Map<string, number>()
  for (const r of rows) totals.set(r.metric, (totals.get(r.metric) || 0) + Number(r.value))
  return (
    <dl className="kv">
      {[...totals].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}><dt>{LIMIT_LABEL[k] || k}</dt><dd>{fmtNum(v)}</dd></div>
      ))}
    </dl>
  )
}
