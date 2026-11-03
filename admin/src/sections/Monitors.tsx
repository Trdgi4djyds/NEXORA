import { useState } from "react"
import { go, useRefresh, type SectionProps } from "../App"
import { must, sb, type Row } from "../supabase"
import { Drawer, Empty, fmtAgo, fmtDateTime, fmtDec, fmtNum, Kpi, Loaded, Seg, Switch, Table, Tag, useAction, useLoad } from "../ui"

type Monitor = Row<"monitors"> & { organizations: { name: string } | null }
const STATUS: Record<string, string> = { up: "En ligne", down: "En panne", degraded: "Dégradé", unknown: "Inconnu", pending: "En attente" }

export function Monitors({ param }: SectionProps) {
  const refresh = useRefresh()
  const act = useAction()
  const [filter, setFilter] = useState<"all" | "down" | "inactive">("all")
  const [tick, setTick] = useState(0)
  const q = useLoad(async () => must(await sb.from("monitors").select("*, organizations(name)").order("last_status").order("name")) as unknown as Monitor[], [refresh, tick])

  async function toggle(m: Monitor, active: boolean) {
    if (await act.run(async () => must(await sb.from("monitors").update({ active }).eq("id", m.id)), active ? "Surveillance reprise." : "Surveillance en pause.")) setTick((n) => n + 1)
  }

  return (
    <>
      <Loaded q={q}>
        {(all) => {
          const down = all.filter((m) => m.active && m.last_status !== "up" && m.last_status !== "unknown")
          const lat = all.filter((m) => m.last_latency_ms != null)
          const rows = all.filter((m) => filter === "all" || (filter === "down" ? down.includes(m) : !m.active))
          return (
            <>
              <div className="kpis">
                <Kpi icon="sync" label="Sites surveillés" value={fmtNum(all.length)} hint={`${fmtNum(all.filter((m) => m.active).length)} actifs`} />
                <Kpi icon="error" label="Incidents" value={fmtNum(down.length)} hint={down.length ? `${fmtNum(down.filter((m) => m.last_status === "down").length)} en panne · ${fmtNum(down.filter((m) => m.last_status !== "down").length)} dégradé(s)` : "Tous les sites répondent"} tone={down.length ? "bad" : "good"} />
                <Kpi icon="clock" label="Latence moyenne" value={lat.length ? `${Math.round(lat.reduce((s, m) => s + Number(m.last_latency_ms), 0) / lat.length)} ms` : "—"} />
              </div>
              <div className="toolbar">
                <Seg value={filter} onChange={setFilter} options={[["all", "Tous"], ["down", "Incidents"], ["inactive", "En pause"]]} />
              </div>
              <Table head={["", "Site", "Espace", "Fréquence", "Dernière vérification", "Latence", "Active"]} empty="Aucun site surveillé.">
                {rows.map((m) => (
                  <tr key={m.id} className="click" onClick={(e) => !(e.target as HTMLElement).closest(".switch") && go("monitors", m.id)}>
                    <td><span className={`dot ${m.last_status}`} title={STATUS[m.last_status] || m.last_status} /></td>
                    <td>
                      <b>{m.name || m.url}</b>
                      <div className="muted small ellipsis" style={{ maxWidth: 380 }}>{m.url}</div>
                      {m.last_error && <div className="small" style={{ color: "var(--bad)" }}>{m.last_error}</div>}
                    </td>
                    <td>{m.organizations?.name || "—"}</td>
                    <td className="nowrap">{m.interval_minutes} min</td>
                    <td className="nowrap">{fmtAgo(m.last_checked_at)}</td>
                    <td className="num">{m.last_latency_ms != null ? `${m.last_latency_ms} ms` : "—"}</td>
                    <td><Switch checked={m.active} disabled={act.busy} onChange={(v) => toggle(m, v)} label="Surveillance active" /></td>
                  </tr>
                ))}
              </Table>
            </>
          )
        }}
      </Loaded>
      {param && <MonitorDrawer id={param} m={q.data?.find((m) => m.id === param)} />}
    </>
  )
}

function MonitorDrawer({ id, m }: { id: string; m?: Monitor }) {
  const refresh = useRefresh()
  const q = useLoad(async () => must(await sb.from("monitor_checks").select("*").eq("monitor_id", id).order("checked_at", { ascending: false }).limit(200)) as Row<"monitor_checks">[], [id, refresh])
  return (
    <Drawer title={m?.name || m?.url || "Site surveillé"} sub={m?.url} onClose={() => go("monitors")}>
      {m && (
        <dl className="kv">
          <dt>État</dt><dd><Tag tone={m.last_status === "up" ? "ok" : m.last_status === "down" ? "bad" : ""}>{STATUS[m.last_status] || m.last_status}</Tag></dd>
          <dt>Code attendu</dt><dd>{m.expected_status}</dd>
          <dt>Mot-clé attendu</dt><dd>{m.keyword || "—"}</dd>
          <dt>Fréquence</dt><dd>toutes les {m.interval_minutes} min</dd>
          <dt>Espace</dt><dd>{m.organizations?.name || "—"}</dd>
        </dl>
      )}
      <Loaded q={q}>
        {(checks) => {
          if (!checks.length) return <Empty>Aucune vérification enregistrée.</Empty>
          const ok = checks.filter((c) => c.ok).length
          const pts = [...checks].reverse()
          const max = Math.max(1, ...pts.map((c) => c.latency_ms || 0))
          return (
            <>
              <div className="kpis">
                <Kpi label="Disponibilité" value={`${fmtDec((ok / checks.length) * 100)} %`} hint={`${checks.length} vérifications`} tone={ok === checks.length ? "good" : ok / checks.length < 0.95 ? "bad" : "warn"} />
                <Kpi label="Latence max." value={`${max} ms`} />
              </div>
              <section>
                <h4>Latence</h4>
                <svg className="spark" viewBox={`0 0 ${pts.length} 48`} preserveAspectRatio="none">
                  {pts.map((c, i) => (
                    // Vérification en échec : barre pleine hauteur, en rouge atténué.
                    c.ok && c.latency_ms != null
                      ? <rect key={c.id} x={i + 0.1} width={0.8} y={48 - (c.latency_ms / max) * 46} height={(c.latency_ms / max) * 46} fill="var(--ok)" />
                      : <rect key={c.id} x={i + 0.1} width={0.8} y={0} height={48} fill="var(--bad)" opacity={0.45} />
                  ))}
                </svg>
              </section>
              <section>
                <h4>Dernières vérifications</h4>
                <div className="list">
                  {checks.slice(0, 40).map((c) => (
                    <div key={c.id}>
                      <span className={`dot ${c.ok ? "ok" : "bad"}`} />
                      <span className="grow small">{fmtDateTime(c.checked_at)}</span>
                      <small className="muted">{c.status_code ?? "—"}</small>
                      <small className="muted" style={{ width: 64, textAlign: "right" }}>{c.latency_ms != null ? `${c.latency_ms} ms` : "—"}</small>
                      {c.error && <small style={{ color: "var(--bad)" }} className="ellipsis">{c.error}</small>}
                    </div>
                  ))}
                </div>
              </section>
            </>
          )
        }}
      </Loaded>
    </Drawer>
  )
}
