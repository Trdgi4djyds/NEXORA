import { useState } from "react"
import { go, useRefresh } from "../App"
import { Icon } from "../icons"
import { must, sb, type FnReturn, type Row } from "../supabase"
import { Donut, Empty, fmtAgo, fmtBytes, fmtMoney, fmtNum, Kpi, Loaded, RingCard, Seg, Tag, useLoad, UserCell, PRIORITY_LABEL, STATUS_LABEL } from "../ui"

type Stats = {
  users: number
  users_new_30d: number
  users_active_7d: number
  users_suspended: number
  teams: number
  organizations: number
  mrr_cents: number
  paid_orgs: number
  projects: number
  designs: number
  studio_items: number
  storage_mb: number
  tickets_open: number
  monitors: number
  monitors_down: number
  plans?: Record<string, number>
  devices?: Record<string, number>
}
type Point = FnReturn<"admin_timeseries">[number]

// NEXORA #040 : couleurs des courbes accordées aux teintes du back office.
const SERIES: [keyof Point, string, string][] = [
  ["signups", "Inscriptions", "#1f9d6b"],
  ["projects", "Projets", "#2f7fe0"],
  ["designs", "Designs", "#7b61ff"],
  ["scans", "Audits", "#e0457b"],
  ["tickets", "Tickets", "#f0783c"],
]
const PLAN_COLORS = { free: "#2f7fe0", standard: "#7b61ff", pro: "#e0a400", team: "#94a3b8", enterprise: "#64748b" }
const DEVICE_COLORS = { windows: "#2f7fe0", web: "#1f9d6b" }

export function Overview() {
  const refresh = useRefresh()
  const [days, setDays] = useState<"7" | "30" | "90">("30")
  const stats = useLoad(async () => must(await sb.rpc("admin_stats")) as unknown as Stats, [refresh])
  const series = useLoad(
    async () => (must(await sb.rpc("admin_timeseries", { days: Number(days) })) as Point[]) || [],
    [refresh, days],
  )
  const recent = useLoad(async () => {
    const [users, tickets, down, config] = await Promise.all([
      sb.from("profiles").select("id, full_name, email, avatar_url, created_at").order("created_at", { ascending: false }).limit(6),
      sb
        .from("support_tickets")
        .select("id, subject, priority, status, updated_at, profiles!support_tickets_user_id_fkey(full_name, email)")
        .in("status", ["open", "pending"])
        .order("updated_at", { ascending: false })
        .limit(6),
      sb.from("monitors").select("id, name, url, last_status, last_error, last_checked_at").eq("active", true).neq("last_status", "up").limit(6),
      sb.from("app_config").select("key, value").in("key", ["maintenance", "signups_enabled"]),
    ])
    return {
      users: must(users) as Row<"profiles">[],
      tickets: must(tickets) as unknown as (Row<"support_tickets"> & { profiles: Row<"profiles"> | null })[],
      down: must(down) as Row<"monitors">[],
      config: Object.fromEntries((must(config) as Row<"app_config">[]).map((c) => [c.key, c.value])) as Record<string, any>,
    }
  }, [refresh])

  return (
    <>
      {recent.data?.config.maintenance?.enabled && (
        <div className="banner">
          <Icon name="warn" size={16} />
          <span className="grow">Mode maintenance actif : {recent.data.config.maintenance.message}</span>
          <button className="btn sm" onClick={() => go("config")}>Configuration</button>
        </div>
      )}
      {recent.data && recent.data.config.signups_enabled === false && (
        <div className="banner info">
          <Icon name="info" size={16} />
          <span className="grow">Les inscriptions sont fermées.</span>
        </div>
      )}
      <Loaded q={stats}>
        {(a) => (
          <div className="kpis">
            <Kpi icon="user" label="Utilisateurs" value={fmtNum(a.users)} hint={`+${fmtNum(a.users_new_30d)} sur 30 jours`} onClick={() => go("users")} />
            <Kpi icon="pass" label="Actifs (7 j)" value={fmtNum(a.users_active_7d)} hint={a.users ? `${Math.round((a.users_active_7d / a.users) * 100)} % des comptes` : undefined} />
            <Kpi icon="group" label="Équipes" value={fmtNum(a.teams)} hint={`${fmtNum(a.organizations)} espaces au total`} onClick={() => go("orgs")} />
            {/* NEXORA #037 : offres en dollars ; #076 : Gratuit et Pro (18 $), Standard passée à Pro. */}
            <Kpi icon="star" label="Revenu mensuel" value={fmtMoney(a.mrr_cents, "USD")} hint={`${fmtNum(a.paid_orgs)} espace(s) payant(s)`} tone="good" />
            <Kpi icon="folder" label="Projets" value={fmtNum(a.projects)} onClick={() => go("content")} />
            <Kpi icon="palette" label="Designs" value={fmtNum(a.designs)} hint={`${fmtNum(a.studio_items)} créations Studio`} onClick={() => go("content", "designs")} />
            <Kpi icon="cloud" label="Stockage" value={fmtBytes((a.storage_mb || 0) * 1048576)} onClick={() => go("files")} />
            <Kpi icon="chat" label="Tickets ouverts" value={fmtNum(a.tickets_open)} tone={a.tickets_open ? "warn" : ""} onClick={() => go("support")} />
            <Kpi icon="sync" label="Sites en panne" value={fmtNum(a.monitors_down)} hint={`${fmtNum(a.monitors)} surveillés`} tone={a.monitors_down ? "bad" : ""} onClick={() => go("monitors")} />
            <Kpi icon="lock" label="Comptes suspendus" value={fmtNum(a.users_suspended)} tone={a.users_suspended ? "warn" : ""} />
          </div>
        )}
      </Loaded>

      <div className="ov-main">
        <div className="card">
          <div className="card-head">
            <h3 className="grow">Activité</h3>
            <Seg value={days} onChange={setDays} options={[["7", "7 jours"], ["30", "30 jours"], ["90", "90 jours"]]} />
          </div>
          <Loaded q={series}>{(pts) => <Chart points={pts} />}</Loaded>
        </div>
        {/* NEXORA #040 : anneaux de progression et répartitions en donut. */}
        <div className="ov-side">
          {stats.data && (
            <>
              <RingCard
                hue="mint"
                value={stats.data.users_active_7d}
                max={stats.data.users}
                title="Comptes actifs cette semaine"
                sub={`${fmtNum(stats.data.users_active_7d)} sur ${fmtNum(stats.data.users)} comptes`}
                onClick={() => go("users")}
              />
              <RingCard
                soft
                hue={stats.data.monitors_down ? "peach" : "sky"}
                value={stats.data.monitors - stats.data.monitors_down}
                max={stats.data.monitors}
                center={stats.data.monitors ? undefined : "—"}
                title="Sites en ligne"
                sub={stats.data.monitors ? `${fmtNum(stats.data.monitors_down)} en panne sur ${fmtNum(stats.data.monitors)}` : "Aucun site surveillé"}
                onClick={() => go("monitors")}
              />
              <div className="card">
                <div className="card-head">
                  <h3 className="grow">Offres</h3>
                  <button className="btn sm ghost" onClick={() => go("plans")}>Gérer</button>
                </div>
                <Donut data={stats.data.plans || {}} colors={PLAN_COLORS} caption="espaces" labels={{ free: "Gratuit", standard: "Standard (ancienne)", pro: "Pro", team: "Équipe (ancienne)", enterprise: "Entreprise (ancienne)" }} />
              </div>
            </>
          )}
        </div>
      </div>

      <Loaded q={recent}>
        {(r) => (
          <div className="cols ov-lists">
            <div className="card">
              <div className="card-head">
                <h3 className="grow">Appareils (30 jours)</h3>
                <button className="btn sm ghost" onClick={() => go("devices")}>Voir</button>
              </div>
              {stats.data && <Donut data={stats.data.devices || {}} colors={DEVICE_COLORS} caption="appareils" labels={{ web: "Web", windows: "Windows" }} />}
            </div>
            <div className="card">
              <div className="card-head">
                <h3 className="grow">Dernières inscriptions</h3>
                <button className="btn sm ghost" onClick={() => go("users")}>Tous</button>
              </div>
              <div className="list">
                {r.users.map((u) => (
                  <button key={u.id} className="li" onClick={() => go("users", u.id)}>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <UserCell p={u} />
                    </div>
                    <small className="muted nowrap">{fmtAgo(u.created_at)}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-head">
                <h3 className="grow">Tickets à traiter</h3>
                <button className="btn sm ghost" onClick={() => go("support")}>Tous</button>
              </div>
              {r.tickets.length ? (
                <div className="list">
                  {r.tickets.map((t) => (
                    <button key={t.id} className="li" onClick={() => go("support", t.id)}>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <b className="ellipsis" style={{ display: "block" }}>{t.subject}</b>
                        <small className="muted">{t.profiles?.full_name || t.profiles?.email} · {fmtAgo(t.updated_at)}</small>
                      </div>
                      <Tag tone={t.priority === "urgent" || t.priority === "high" ? "bad" : ""}>{PRIORITY_LABEL[t.priority]}</Tag>
                      <Tag tone={t.status === "open" ? "warn" : ""}>{STATUS_LABEL[t.status]}</Tag>
                    </button>
                  ))}
                </div>
              ) : (
                <Empty icon="check">Aucun ticket en attente.</Empty>
              )}
            </div>
            <div className="card">
              <div className="card-head">
                <h3 className="grow">Sites à surveiller</h3>
                <button className="btn sm ghost" onClick={() => go("monitors")}>Tous</button>
              </div>
              {r.down.length ? (
                <div className="list">
                  {r.down.map((m) => (
                    <button key={m.id} className="li" onClick={() => go("monitors", m.id)}>
                      <span className={`dot ${m.last_status}`} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <b className="ellipsis" style={{ display: "block" }}>{m.name || m.url}</b>
                        <small className="muted ellipsis" style={{ display: "block" }}>{m.last_error || m.url}</small>
                      </div>
                      <small className="muted nowrap">{fmtAgo(m.last_checked_at)}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <Empty icon="pass">Tous les sites surveillés répondent.</Empty>
              )}
            </div>
          </div>
        )}
      </Loaded>
    </>
  )
}

function Chart({ points }: { points: Point[] }) {
  const [hidden, setHidden] = useState<string[]>([])
  const [hover, setHover] = useState<number | null>(null)
  if (!points.length) return <Empty>Aucune activité sur la période.</Empty>
  const shown = SERIES.filter(([k]) => !hidden.includes(k))
  const W = 1080, H = 250, L = 34, R = 10, T = 12, B = 26
  const max = Math.max(1, ...points.flatMap((p) => shown.map(([k]) => Number(p[k]) || 0)))
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, points.length - 1)
  const y = (v: number) => H - B - ((H - T - B) * v) / max
  const step = Math.ceil(points.length / 8)
  const ticks = [0, Math.round(max / 2), max]
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-l" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        {/* NEXORA #040 : courbes lissées, aire légère sous la première série affichée, tracé animé. */}
        {shown[0] && (
          <path
            className="chart-area"
            fill={shown[0][2]}
            d={`${smooth(points.map((p, i) => [x(i), y(Number(p[shown[0][0]]) || 0)]))} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`}
          />
        )}
        {shown.map(([k, , color]) => (
          <path
            key={k}
            className="chart-line"
            pathLength={1}
            fill="none"
            stroke={color}
            strokeWidth={2.6}
            strokeLinejoin="round"
            strokeLinecap="round"
            d={smooth(points.map((p, i) => [x(i), y(Number(p[k]) || 0)]))}
          />
        ))}
        {points.map((p, i) =>
          i % step === 0 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle">
              {new Date(p.day).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
            </text>
          ) : null,
        )}
        {points.map((_, i) => (
          <rect key={i} x={x(i) - (W - L - R) / points.length / 2} y={T} width={(W - L - R) / points.length} height={H - T - B} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {hover != null && (
          <g className="tip">
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--sep-strong)" />
            {shown.map(([k, , color]) => (
              <circle key={k} cx={x(hover)} cy={y(Number(points[hover][k]) || 0)} r={4.5} fill={color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      <div className="legend">
        {SERIES.map(([k, label, color]) => (
          <button key={k} className={hidden.includes(k) ? "off" : ""} onClick={() => setHidden((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k]))}>
            <i style={{ background: color }} />
            {label}
            {hover != null && <b>{Number(points[hover][k]) || 0}</b>}
          </button>
        ))}
        {hover != null && (
          <span className="muted small" style={{ alignSelf: "center", marginLeft: "auto" }}>
            {new Date(points[hover].day).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </span>
        )}
      </div>
    </div>
  )
}

/** Courbe lissée (Catmull-Rom convertie en Bézier) qui ne dépasse pas les valeurs voisines. */
function smooth(pts: number[][]) {
  if (!pts.length) return ""
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
    const t = 0.18
    const c1y = Math.min(Math.max(p1[1] + (p2[1] - p0[1]) * t, Math.min(p1[1], p2[1])), Math.max(p1[1], p2[1]))
    const c2y = Math.min(Math.max(p2[1] - (p3[1] - p1[1]) * t, Math.min(p1[1], p2[1])), Math.max(p1[1], p2[1]))
    d += ` C${p1[0] + (p2[0] - p0[0]) * t},${c1y} ${p2[0] - (p3[0] - p1[0]) * t},${c2y} ${p2[0]},${p2[1]}`
  }
  return d
}
