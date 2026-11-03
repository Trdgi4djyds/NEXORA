import { useState } from "react"
import { go, useRefresh } from "../App"
import { Icon } from "../icons"
import { must, sb, type Row } from "../supabase"
import { downloadCsv, fmtDateTime, JsonView, Loaded, Table, Tag, useLoad } from "../ui"

const PAGE = 100
const ACTION_TONE: Record<string, string> = { insert: "ok", update: "info", delete: "bad" }
const ACTION_LABEL: Record<string, string> = { insert: "Création", update: "Modification", delete: "Suppression" }

export function Audit() {
  const refresh = useRefresh()
  const [entity, setEntity] = useState("")
  const [action, setAction] = useState("")
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<number | null>(null)
  const q = useLoad(async () => {
    let r = sb.from("audit_logs").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
    if (entity) r = r.eq("entity", entity)
    if (action) r = r.eq("action", action)
    const res = await r
    const logs = must(res) as Row<"audit_logs">[]
    const ids = [...new Set(logs.map((l) => l.actor_id).filter(Boolean))] as string[]
    const people = ids.length ? (must(await sb.from("profiles").select("id, full_name, email").in("id", ids)) as Row<"profiles">[]) : []
    return { logs, count: res.count ?? logs.length, names: new Map(people.map((p) => [p.id, p.full_name || p.email || p.id])) }
  }, [entity, action, page, refresh])

  return (
    <>
      <div className="toolbar">
        <select className="input" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(0) }}>
          <option value="">Tous les objets</option>
          {["profiles", "organizations", "organization_members", "subscriptions", "projects", "design_documents", "studio_items", "monitors", "support_tickets", "announcements", "plans", "feature_flags", "app_config", "invitations"].map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select className="input" value={action} onChange={(e) => { setAction(e.target.value); setPage(0) }}>
          <option value="">Toutes les actions</option>
          {["insert", "update", "delete"].map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
        </select>
        <span className="grow" />
        <button className="btn" disabled={!q.data?.logs.length} onClick={() => downloadCsv("journal-audit", (q.data?.logs || []).map((l) => ({ ...l, actor: l.actor_id ? q.data?.names.get(l.actor_id) : "système" })))}>
          <Icon name="download" size={14} /> Exporter
        </button>
      </div>
      <Loaded q={q}>
        {({ logs, count, names }) => (
          <>
            <Table head={["Date", "Auteur", "Action", "Objet", "Détails"]} empty="Aucune entrée.">
              {logs.flatMap((l) => {
                const meta = Object.entries((l.meta as Record<string, unknown>) || {})
                const rows = [
                  <tr key={l.id} className="click" onClick={() => setOpen(open === l.id ? null : l.id)}>
                    <td className="nowrap">{fmtDateTime(l.created_at)}</td>
                    <td>{l.actor_id ? <button className="link-btn" onClick={(e) => { e.stopPropagation(); go("users", l.actor_id!) }}>{names.get(l.actor_id) || l.actor_id.slice(0, 8)}</button> : <span className="muted">système</span>}</td>
                    <td><Tag tone={ACTION_TONE[l.action]}>{ACTION_LABEL[l.action] || l.action}</Tag></td>
                    <td><code>{l.entity}</code></td>
                    <td className="muted small ellipsis" style={{ maxWidth: 420 }}>{meta.map(([k, v]) => `${k} : ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ")}</td>
                  </tr>,
                ]
                if (open === l.id) rows.push(<tr key={`${l.id}-d`}><td colSpan={5}><JsonView value={l} /></td></tr>)
                return rows
              })}
            </Table>
            <div className="pager">
              <span>{count} entrée(s) · page {page + 1} sur {Math.max(1, Math.ceil(count / PAGE))}</span>
              <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</button>
              <button className="btn sm" disabled={(page + 1) * PAGE >= count} onClick={() => setPage(page + 1)}>Suivant</button>
            </div>
          </>
        )}
      </Loaded>
    </>
  )
}
