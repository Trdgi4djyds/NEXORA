import { useEffect, useRef, useState, type FormEvent } from "react"
import { go, useRefresh, useShell, type SectionProps } from "../App"
import { useMe } from "../auth"
import { Icon } from "../icons"
import { must, sb, type Row, type TicketPriority, type TicketStatus } from "../supabase"
import {
  Avatar, Empty, fmtAgo, fmtDateTime, Loaded, PRIORITY_LABEL, SearchBox, Seg, STATUS_LABEL, Table, Tag, useAction, useLoad,
  UserCell,
} from "../ui"

type Person = Pick<Row<"profiles">, "id" | "full_name" | "email" | "avatar_url">
type Ticket = Row<"support_tickets"> & { profiles: Person | null; assignee: { full_name: string } | null }
type Message = Row<"ticket_messages"> & { profiles: Person | null }
const STATUSES: TicketStatus[] = ["open", "pending", "resolved", "closed"]
const PRIORITIES: TicketPriority[] = ["low", "normal", "high", "urgent"]
const statusTone = (s: string) => (s === "open" ? "warn" : s === "pending" ? "info" : s === "resolved" ? "ok" : "")
const prioTone = (p: string) => (p === "urgent" || p === "high" ? "bad" : "")
const TICKET_SELECT = "*, profiles!support_tickets_user_id_fkey(id, full_name, email, avatar_url), assignee:profiles!support_tickets_assigned_to_fkey(full_name)"

export function Support({ param }: SectionProps) {
  return param ? <TicketView id={param} /> : <TicketList />
}

function TicketList() {
  const refresh = useRefresh()
  const me = useMe()
  const [status, setStatus] = useState<"active" | TicketStatus | "all" | "mine">("active")
  const [search, setSearch] = useState("")
  const q = useLoad(async () => {
    let r = sb.from("support_tickets").select(TICKET_SELECT).order("updated_at", { ascending: false }).limit(300)
    if (status === "active") r = r.in("status", ["open", "pending"])
    else if (status === "mine") r = r.eq("assigned_to", me.profile.id).in("status", ["open", "pending"])
    else if (status !== "all") r = r.eq("status", status)
    if (search) r = r.ilike("subject", `%${search}%`)
    return must(await r) as unknown as Ticket[]
  }, [status, search, refresh])

  return (
    <>
      <div className="toolbar">
        <Seg
          value={status}
          onChange={setStatus}
          options={[["active", "À traiter"], ["mine", "Assignés à moi"], ["open", "Ouverts"], ["pending", "En attente"], ["resolved", "Résolus"], ["closed", "Fermés"], ["all", "Tous"]]}
        />
        <SearchBox value={search} onSearch={setSearch} placeholder="Sujet du ticket…" />
      </div>
      <Loaded q={q}>
        {(rows) => (
          <Table head={["Sujet", "Client", "Catégorie", "Priorité", "Statut", "Assigné à", "Mis à jour"]} count={rows.length} empty="Aucun ticket dans cette vue.">
            {rows.map((t) => (
              <tr key={t.id} className="click" onClick={() => go("support", t.id)}>
                <td><b>{t.subject}</b></td>
                <td><UserCell p={t.profiles} /></td>
                <td>{t.category}</td>
                <td><Tag tone={prioTone(t.priority)}>{PRIORITY_LABEL[t.priority]}</Tag></td>
                <td><Tag tone={statusTone(t.status)}>{STATUS_LABEL[t.status]}</Tag></td>
                <td>{t.assignee?.full_name || <span className="muted">—</span>}</td>
                <td className="nowrap">{fmtAgo(t.updated_at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Loaded>
    </>
  )
}

function TicketView({ id }: { id: string }) {
  const refresh = useRefresh()
  const me = useMe()
  const shell = useShell()
  const act = useAction()
  const [tick, setTick] = useState(0)
  const [body, setBody] = useState("")
  const [internal, setInternal] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const q = useLoad(async () => {
    const [t, m] = await Promise.all([
      sb.from("support_tickets").select(TICKET_SELECT).eq("id", id).maybeSingle(),
      sb.from("ticket_messages").select("*, profiles(id, full_name, email, avatar_url)").eq("ticket_id", id).order("created_at"),
    ])
    return { t: must(t) as unknown as Ticket | null, msgs: must(m) as unknown as Message[] }
  }, [id, refresh, tick])
  const reload = () => setTick((n) => n + 1)

  // Nouveaux messages du client en direct.
  useEffect(() => {
    const ch = sb
      .channel(`admin-ticket:${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${id}` }, reload)
      .subscribe()
    return () => {
      sb.removeChannel(ch)
    }
  }, [id])
  // Accolades : scrollIntoView renvoie une promesse dans les navigateurs récents.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" })
  }, [q.data?.msgs.length])

  async function update(patch: Partial<Row<"support_tickets">>, ok = "Ticket mis à jour.") {
    if (await act.run(async () => must(await sb.from("support_tickets").update(patch).eq("id", id)), ok)) {
      reload()
      if (patch.status) shell.setOpenTickets(Math.max(0, shell.openTickets + (patch.status === "open" ? 1 : q.data?.t?.status === "open" ? -1 : 0)))
    }
  }
  async function send(e: FormEvent, resolve = false) {
    e.preventDefault()
    if (!body.trim()) return
    const ok = await act.run(async () => {
      must(await sb.from("ticket_messages").insert({ ticket_id: id, author_id: me.profile.id, body: body.trim(), internal }))
      if (resolve) must(await sb.from("support_tickets").update({ status: "resolved" }).eq("id", id))
    }, internal ? "Note interne ajoutée." : resolve ? "Réponse envoyée, ticket résolu." : "Réponse envoyée.")
    if (ok) {
      setBody("")
      setInternal(false)
      reload()
    }
  }

  return (
    <>
      <div>
        <button className="btn sm ghost" onClick={() => go("support")}><Icon name="back" size={13} /> Tous les tickets</button>
      </div>
      <Loaded q={q}>
        {({ t, msgs }) =>
          !t ? <Empty>Ce ticket n’existe plus.</Empty> : (
            <div className="cols-2-1">
              <div className="card stack">
                <div>
                  <h2 style={{ fontSize: 18 }}>{t.subject}</h2>
                  <div className="muted small">Ouvert {fmtAgo(t.created_at)} · {t.category}</div>
                </div>
                <div className="thread">
                  {msgs.map((m) => {
                    const staff = m.author_id !== t.user_id
                    return (
                      <div key={m.id} className={`msg${staff ? " staff" : ""}${m.internal ? " internal" : ""}`}>
                        <Avatar p={m.profiles} size={28} />
                        <div className="bubble">
                          <small>{m.profiles?.full_name || "—"} · {fmtDateTime(m.created_at)}{m.internal && " · note interne"}</small>
                          <p>{m.body}</p>
                        </div>
                      </div>
                    )
                  })}
                  {!msgs.length && <Empty>Aucun message.</Empty>}
                  <div ref={end} />
                </div>
                <form className="form" onSubmit={(e) => send(e)}>
                  <textarea className="input" rows={4} required value={body} onChange={(e) => setBody(e.target.value)} placeholder={internal ? "Note visible seulement par l’équipe…" : "Réponse au client…"} />
                  <div className="row wrap">
                    <label className="check"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />Note interne (invisible pour le client)</label>
                    <span className="grow" />
                    {!internal && <button type="button" className="btn" disabled={act.busy || !body.trim()} onClick={(e) => send(e, true)}>Envoyer et résoudre</button>}
                    <button className="btn primary" disabled={act.busy || !body.trim()}>Envoyer</button>
                  </div>
                </form>
              </div>
              <div className="stack">
                <div className="card">
                  <h3>Client</h3>
                  <button className="li" style={{ width: "100%", textAlign: "left" }} onClick={() => go("users", t.user_id)}><UserCell p={t.profiles} /></button>
                </div>
                <div className="card form">
                  <h3 style={{ margin: 0 }}>Traitement</h3>
                  <label className="field"><span>Statut</span>
                    <select className="input" value={t.status} disabled={act.busy} onChange={(e) => update({ status: e.target.value as TicketStatus })}>
                      {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </label>
                  <label className="field"><span>Priorité</span>
                    <select className="input" value={t.priority} disabled={act.busy} onChange={(e) => update({ priority: e.target.value as TicketPriority })}>
                      {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                    </select>
                  </label>
                  <div className="field"><span>Assigné à</span>
                    <div className="row">
                      <span className="grow">{t.assigned_to === me.profile.id ? "Moi" : t.assignee?.full_name || "Personne"}</span>
                      {t.assigned_to === me.profile.id
                        ? <button className="btn sm" disabled={act.busy} onClick={() => update({ assigned_to: null }, "Ticket libéré.")}>Libérer</button>
                        : <button className="btn sm" disabled={act.busy} onClick={() => update({ assigned_to: me.profile.id }, "Ticket assigné à toi.")}>M’assigner</button>}
                    </div>
                  </div>
                  <dl className="kv">
                    <dt>Créé</dt><dd>{fmtDateTime(t.created_at)}</dd>
                    <dt>Mis à jour</dt><dd>{fmtDateTime(t.updated_at)}</dd>
                    {t.closed_at && (<><dt>Fermé</dt><dd>{fmtDateTime(t.closed_at)}</dd></>)}
                  </dl>
                </div>
              </div>
            </div>
          )
        }
      </Loaded>
    </>
  )
}
