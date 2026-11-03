import { useState } from "react"
import { go, useRefresh } from "../App"
import { Icon } from "../icons"
import { must, sb, type Row } from "../supabase"
import { fmtAgo, fmtDate, INVITE_LABEL, Loaded, ROLE_LABEL, Seg, Table, Tag, useAction, useLoad, useUi } from "../ui"

type Invite = Row<"invitations"> & { organizations: { name: string } | null; profiles: { full_name: string } | null }

export function Invitations() {
  const refresh = useRefresh()
  const ui = useUi()
  const act = useAction()
  const [status, setStatus] = useState<"pending" | "all">("pending")
  const [tick, setTick] = useState(0)
  const q = useLoad(async () => {
    let r = sb.from("invitations").select("*, organizations(name), profiles(full_name)").order("created_at", { ascending: false }).limit(300)
    if (status === "pending") r = r.eq("status", "pending")
    return must(await r) as unknown as Invite[]
  }, [status, refresh, tick])

  async function remove(i: Invite) {
    if (!(await ui.confirm({ title: "Annuler cette invitation ?", body: `Le lien envoyé à ${i.email} ne fonctionnera plus.`, confirm: "Annuler l’invitation", danger: true }))) return
    if (await act.run(async () => must(await sb.from("invitations").delete().eq("id", i.id)), "Invitation annulée.")) setTick((n) => n + 1)
  }

  return (
    <>
      <div className="toolbar">
        <Seg value={status} onChange={setStatus} options={[["pending", "En attente"], ["all", "Toutes"]]} />
      </div>
      <Loaded q={q}>
        {(rows) => (
          <Table head={["Adresse invitée", "Espace", "Rôle", "Invitée par", "Statut", "Envoyée", "Expire", ""]} count={rows.length} empty="Aucune invitation.">
            {rows.map((i) => {
              const expired = new Date(i.expires_at).getTime() < Date.now()
              return (
                <tr key={i.id}>
                  <td><b>{i.email}</b></td>
                  <td><button className="link-btn" onClick={() => go("orgs", i.org_id)}>{i.organizations?.name || "—"}</button></td>
                  <td>{ROLE_LABEL[i.role] || i.role}</td>
                  <td>{i.profiles?.full_name || "—"}</td>
                  <td><Tag tone={i.status === "accepted" ? "ok" : i.status === "pending" ? (expired ? "bad" : "warn") : ""}>{i.status === "pending" && expired ? "Expirée" : INVITE_LABEL[i.status] || i.status}</Tag></td>
                  <td className="nowrap">{fmtAgo(i.created_at)}</td>
                  <td className="nowrap">{fmtDate(i.expires_at)}</td>
                  <td className="act">
                    {i.status === "pending" && (
                      <button className="icon-btn danger" title="Annuler l’invitation" disabled={act.busy} onClick={() => remove(i)}>
                        <Icon name="trash" size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </Table>
        )}
      </Loaded>
    </>
  )
}
