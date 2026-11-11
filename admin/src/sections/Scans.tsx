import { go, useRefresh, type SectionProps } from "../App"
import { must, sb, type Row } from "../supabase"
import { Drawer, Empty, fmtDateTime, JsonView, Loaded, Table, Tag, useLoad } from "../ui"

type Scan = Row<"security_scans"> & { organizations: { name: string } | null }
type Finding = { sev?: string; title?: string; name?: string; id?: string; detail?: string; desc?: string; message?: string; fix?: string }
const SEV: Record<string, [string, string]> = {
  critical: ["Critique", "bad"],
  high: ["Élevée", "bad"],
  medium: ["Moyenne", "warn"],
  low: ["Faible", ""],
  info: ["Info", "info"],
}
const gradeTone = (g?: string | null) => (!g ? "" : /^A/.test(g) ? "ok" : /^[BC]/.test(g) ? "warn" : "bad")

export function Scans({ param }: SectionProps) {
  const refresh = useRefresh()
  const q = useLoad(async () => must(await sb.from("security_scans").select("id, url, score, grade, created_at, findings, headers, org_id, organizations(name)").order("created_at", { ascending: false }).limit(200)) as unknown as Scan[], [refresh])
  return (
    <Loaded q={q}>
      {(rows) => (
        <>
          <Table head={["Site", "Note", "Constats graves", "Constats", "Espace", "Date"]} count={rows.length} empty="Aucun audit pour l’instant.">
            {rows.map((s) => {
              const f = (Array.isArray(s.findings) ? s.findings : []) as Finding[]
              const grave = f.filter((x) => x.sev === "critical" || x.sev === "high").length
              return (
                <tr key={s.id} className="click" onClick={() => go("scans", s.id)}>
                  <td><b>{s.url}</b></td>
                  <td><Tag tone={gradeTone(s.grade)}>{s.grade || "?"}</Tag> <span className="muted">{s.score ?? "—"}/100</span></td>
                  <td>{grave ? <Tag tone="bad">{grave}</Tag> : <span className="muted">0</span>}</td>
                  <td>{f.length}</td>
                  <td>{s.organizations?.name || "—"}</td>
                  <td className="nowrap">{fmtDateTime(s.created_at)}</td>
                </tr>
              )
            })}
          </Table>
          {param && <ScanDrawer s={rows.find((r) => r.id === param)} />}
        </>
      )}
    </Loaded>
  )
}

function ScanDrawer({ s }: { s?: Scan }) {
  const close = () => go("scans")
  if (!s) return <Drawer title="Audit" onClose={close}><Empty>Cet audit n’existe plus.</Empty></Drawer>
  const f = ((Array.isArray(s.findings) ? s.findings : []) as Finding[]).sort((a, b) => Object.keys(SEV).indexOf(a.sev || "info") - Object.keys(SEV).indexOf(b.sev || "info"))
  return (
    <Drawer title={s.url} sub={`${s.organizations?.name || ""} · ${fmtDateTime(s.created_at)}`} onClose={close}>
      <div className="row">
        <Tag tone={gradeTone(s.grade)}>Note {s.grade || "?"}</Tag>
        <span className="muted">{s.score ?? "—"}/100</span>
      </div>
      <section>
        <h4>Constats ({f.length})</h4>
        {f.length ? (
          <div className="list">
            {f.map((x, i) => {
              const [label, tone] = SEV[x.sev || "info"] || [x.sev || "—", ""]
              return (
                <div key={i} style={{ alignItems: "flex-start" }}>
                  <Tag tone={tone}>{label}</Tag>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b>{x.title || x.name || x.id}</b>
                    {(x.detail || x.desc || x.message) && <div className="muted small">{x.detail || x.desc || x.message}</div>}
                    {x.fix && <div className="small">Correction : {x.fix}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        ) : <p className="muted small">Aucun constat.</p>}
      </section>
      <section>
        <h4>En-têtes HTTP</h4>
        <JsonView value={s.headers} />
      </section>
    </Drawer>
  )
}
