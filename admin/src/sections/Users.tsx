import { useState, type FormEvent } from "react"
import { go, useRefresh, type SectionProps } from "../App"
import { useMe } from "../auth"
import { Icon } from "../icons"
import { callFn, must, sb, type AppRole, type FnReturn, type Row } from "../supabase"
import {
  downloadCsv, Drawer, Empty, fmtAgo, fmtDate, fmtDateTime, Loaded, Modal, ROLE_LABEL, SearchBox, STATUS_LABEL,
  Table, Tag, useAction, useLoad, useUi, UserCell, Avatar, plural,
} from "../ui"

type AdminUser = FnReturn<"admin_users">[number]
type UserAct = "ban" | "unban" | "reset" | "delete"
type AuthInfo = { confirmed_at?: string | null; last_sign_in_at?: string | null; provider?: string; banned_until?: string | null }
const PAGE = 50

export function Users({ param }: SectionProps) {
  const me = useMe()
  const ui = useUi()
  const refresh = useRefresh()
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)
  const [tick, setTick] = useState(0)
  const [creating, setCreating] = useState(false)
  const act = useAction()

  const q = useLoad(async () => {
    const rows = (must(await sb.rpc("admin_users", { search, page, page_size: PAGE })) as AdminUser[]) || []
    let auth: Record<string, AuthInfo> = {}
    try {
      auth = (await callFn<{ users?: Record<string, AuthInfo> }>("admin-users", { action: "auth-info", ids: rows.map((r) => r.id) })).users || {}
    } catch {
      /* informations d'authentification facultatives */
    }
    return { rows, auth }
  }, [search, page, refresh, tick])
  const reload = () => setTick((n) => n + 1)

  async function setRole(u: AdminUser, role: AppRole) {
    if (role === "superadmin" && !(await ui.confirm({ title: "Nommer super-administrateur ?", body: `${u.full_name || u.email} aura tous les droits, y compris la configuration et la suppression de comptes.`, confirm: "Nommer" }))) return reload()
    if (await act.run(async () => must(await sb.rpc("admin_set_role", { target: u.id, new_role: role })), "Rôle enregistré.")) reload()
  }
  async function userAction(u: Pick<AdminUser, "id" | "full_name" | "email" | "status">, action: UserAct) {
    const name = u.full_name || u.email
    const ask = {
      ban: { title: "Suspendre ce compte ?", body: `${name} sera déconnecté de NEXORA et ne pourra plus se connecter.`, confirm: "Suspendre", danger: true },
      unban: null,
      reset: { title: "Réinitialiser le mot de passe ?", body: `Un e-mail de réinitialisation sera envoyé à ${u.email}.`, confirm: "Envoyer" },
      delete: { title: "Supprimer définitivement ?", body: `Le compte de ${name}, son espace personnel et ses contenus seront supprimés. Cette action est irréversible.`, confirm: "Supprimer", danger: true },
    }[action]
    if (ask && !(await ui.confirm(ask))) return
    const done = { ban: "Compte suspendu.", unban: "Compte réactivé.", reset: "E-mail de réinitialisation envoyé.", delete: "Compte supprimé." }[action]
    if (await act.run(() => callFn("admin-users", { action, user_id: u.id }), done)) {
      if (action === "delete" && param === u.id) go("users")
      reload()
    }
  }

  return (
    <>
      <div className="toolbar">
        <SearchBox value={search} onSearch={(s) => { setSearch(s); setPage(0) }} placeholder="Nom ou adresse e-mail…" />
        <span className="grow" />
        <button className="btn" disabled={!q.data?.rows.length} onClick={() => downloadCsv("utilisateurs", (q.data?.rows || []).map(({ total, avatar_url, ...r }) => r))}>
          <Icon name="download" size={14} /> Exporter
        </button>
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={14} /> Créer un compte
        </button>
      </div>
      <Loaded q={q}>
        {({ rows, auth }) => {
          const total = rows[0]?.total ?? 0
          return (
            <>
              <Table head={["Utilisateur", "Rôle", "Statut", "Inscrit", "Dernière activité", "Contenus", ""]} empty={search ? "Aucun utilisateur ne correspond." : "Aucun utilisateur."}>
                {rows.map((u) => {
                  const a = auth[u.id] || {}
                  const self = u.id === me.profile.id
                  return (
                    <tr key={u.id} className="click" onClick={(e) => !(e.target as HTMLElement).closest("select, button") && go("users", u.id)}>
                      <td><UserCell p={u} sub={<>{u.email}{a.confirmed_at === null && <> · <span style={{ color: "var(--warn)" }}>e-mail non confirmé</span></>}</>} /></td>
                      <td>
                        <select className="input sm" value={u.app_role} disabled={self || (u.app_role === "superadmin" && !me.isSuper)} onChange={(e) => setRole(u, e.target.value as AppRole)}>
                          {(["user", "admin", "superadmin"] as AppRole[]).map((r) => (
                            <option key={r} value={r} disabled={r === "superadmin" && !me.isSuper}>{ROLE_LABEL[r]}</option>
                          ))}
                        </select>
                      </td>
                      <td><Tag tone={u.status === "suspended" ? "bad" : "ok"}>{u.status === "suspended" ? "Suspendu" : "Actif"}</Tag></td>
                      <td className="nowrap">{fmtDate(u.created_at)}</td>
                      <td className="nowrap">{fmtAgo(u.last_seen_at || a.last_sign_in_at)}</td>
                      <td className="muted nowrap">{plural(u.projects, "projet")} · {plural(u.designs, "design")} · {plural(u.orgs, "espace")}</td>
                      <td className="act">
                        {!self && (
                          <>
                            <button className="btn sm" disabled={act.busy} onClick={() => userAction(u, u.status === "suspended" ? "unban" : "ban")}>
                              {u.status === "suspended" ? "Réactiver" : "Suspendre"}
                            </button>
                            <button className="icon-btn" title="Envoyer un e-mail de réinitialisation du mot de passe" disabled={act.busy} onClick={() => userAction(u, "reset")}>
                              <Icon name="key" size={14} />
                            </button>
                            {me.isSuper && (
                              <button className="icon-btn danger" title="Supprimer définitivement" disabled={act.busy} onClick={() => userAction(u, "delete")}>
                                <Icon name="trash" size={14} />
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </Table>
              <div className="pager">
                <span>{total} utilisateur(s){total > PAGE && ` · page ${page + 1} sur ${Math.ceil(total / PAGE)}`}</span>
                <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</button>
                <button className="btn sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Suivant</button>
              </div>
            </>
          )
        }}
      </Loaded>
      {creating && <CreateUser onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload() }} />}
      {param && <UserDrawer id={param} key={`${param}-${tick}`} onAction={(a, p) => userAction({ id: p.id, full_name: p.full_name, email: p.email || "", status: p.status }, a)} />}
    </>
  )
}

function CreateUser({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const act = useAction()
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    const ok = await act.run(
      () => callFn("admin-users", { action: "create", email: f.email.trim(), password: f.password, full_name: f.name.trim() }),
      "Compte créé (e-mail déjà confirmé).",
    )
    if (ok) onDone()
  }
  return (
    <Modal title="Créer un compte" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>Nom complet</span><input className="input" name="name" autoFocus /></label>
        <label className="field"><span>Adresse e-mail</span><input className="input" name="email" type="email" required /></label>
        <label className="field"><span>Mot de passe provisoire</span><input className="input" name="password" type="password" minLength={8} required autoComplete="new-password" /><small>8 caractères au moins. Communique-le à la personne : elle pourra le changer dans NEXORA.</small></label>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" disabled={act.busy}>Créer le compte</button>
        </div>
      </form>
    </Modal>
  )
}

function UserDrawer({ id, onAction }: { id: string; onAction: (a: UserAct, p: Row<"profiles">) => void }) {
  const refresh = useRefresh()
  const me = useMe()
  const q = useLoad(async () => {
    const [profile, orgs, devices, tickets, logs, auth] = await Promise.all([
      sb.from("profiles").select("*").eq("id", id).maybeSingle(),
      sb.from("organization_members").select("role, created_at, organizations(id, name, personal, subscriptions(plan_id, status))").eq("user_id", id),
      sb.from("devices").select("*").eq("user_id", id).order("last_seen_at", { ascending: false }),
      sb.from("support_tickets").select("id, subject, status, updated_at").eq("user_id", id).order("updated_at", { ascending: false }).limit(10),
      sb.from("audit_logs").select("*").eq("actor_id", id).order("created_at", { ascending: false }).limit(15),
      callFn<{ users?: Record<string, AuthInfo> }>("admin-users", { action: "auth-info", ids: [id] }).catch(() => ({ users: {} as Record<string, AuthInfo> })),
    ])
    return {
      p: must(profile) as Row<"profiles"> | null,
      orgs: must(orgs) as unknown as { role: string; created_at: string; organizations: (Row<"organizations"> & { subscriptions: { plan_id: string; status: string }[] | { plan_id: string; status: string } | null }) | null }[],
      devices: must(devices) as Row<"devices">[],
      tickets: must(tickets) as Row<"support_tickets">[],
      logs: must(logs) as Row<"audit_logs">[],
      auth: (auth.users || {})[id] || {},
    }
  }, [id, refresh])
  const close = () => go("users")
  return (
    <Drawer title={q.data?.p?.full_name || q.data?.p?.email || "Utilisateur"} sub={q.data?.p?.email} onClose={close}>
      <Loaded q={q}>
        {({ p, orgs, devices, tickets, logs, auth }) =>
          !p ? (
            <Empty>Ce compte n’existe plus.</Empty>
          ) : (
            <>
              <div className="row">
                <Avatar p={p} size={52} />
                <div className="grow">
                  <div className="row wrap">
                    <Tag tone={p.status === "suspended" ? "bad" : "ok"}>{p.status === "suspended" ? "Suspendu" : "Actif"}</Tag>
                    <Tag tone={p.app_role === "user" ? "" : "info"}>{ROLE_LABEL[p.app_role]}</Tag>
                    {auth.confirmed_at === null && <Tag tone="warn">E-mail non confirmé</Tag>}
                  </div>
                </div>
              </div>
              {p.id !== me.profile.id && (
                <div className="row wrap">
                  <button className="btn sm" onClick={() => onAction(p.status === "suspended" ? "unban" : "ban", p)}>{p.status === "suspended" ? "Réactiver" : "Suspendre"}</button>
                  <button className="btn sm" onClick={() => onAction("reset", p)}><Icon name="key" size={13} /> Réinitialiser le mot de passe</button>
                  {me.isSuper && <button className="btn sm danger" onClick={() => onAction("delete", p)}><Icon name="trash" size={13} /> Supprimer</button>}
                </div>
              )}
              <section>
                <h4>Profil</h4>
                <dl className="kv">
                  <dt>Entreprise</dt><dd>{p.company || "—"}</dd>
                  <dt>Poste</dt><dd>{p.job_title || "—"}</dd>
                  <dt>Langue · fuseau</dt><dd>{p.locale} · {p.timezone}</dd>
                  <dt>Inscrit le</dt><dd>{fmtDateTime(p.created_at)}</dd>
                  <dt>Dernière connexion</dt><dd>{fmtDateTime(auth.last_sign_in_at)}</dd>
                  <dt>Dernière activité</dt><dd>{fmtAgo(p.last_seen_at)}</dd>
                  <dt>Prise en main</dt><dd>{p.onboarding_done ? "Terminée" : "Pas terminée"}</dd>
                  <dt>Identifiant</dt><dd><code>{p.id}</code></dd>
                </dl>
              </section>
              <section>
                <h4>Espaces ({orgs.length})</h4>
                <div className="list">
                  {orgs.map((m) => {
                    const o = m.organizations
                    const sub = o && (Array.isArray(o.subscriptions) ? o.subscriptions[0] : o.subscriptions)
                    return o ? (
                      <button key={o.id} className="li" onClick={() => go("orgs", o.id)}>
                        <Icon name={o.personal ? "user" : "group"} size={15} />
                        <span className="grow ellipsis">{o.name}</span>
                        <Tag>{ROLE_LABEL[m.role] || m.role}</Tag>
                        <Tag tone="info">{sub?.plan_id || "free"}</Tag>
                      </button>
                    ) : null
                  })}
                </div>
              </section>
              <section>
                <h4>Appareils ({devices.length})</h4>
                {devices.length ? (
                  <div className="list">
                    {devices.map((d) => (
                      <div key={d.id}>
                        <Icon name={d.platform === "web" ? "globe" : "laptop"} size={15} />
                        <span className="grow ellipsis">{d.name}</span>
                        <small className="muted">{d.app_version ? `v${d.app_version}` : ""}</small>
                        <small className="muted nowrap">{fmtAgo(d.last_seen_at)}</small>
                      </div>
                    ))}
                  </div>
                ) : <p className="muted small">Aucun appareil enregistré.</p>}
              </section>
              <section>
                <h4>Tickets de support ({tickets.length})</h4>
                {tickets.length ? (
                  <div className="list">
                    {tickets.map((t) => (
                      <button key={t.id} className="li" onClick={() => go("support", t.id)}>
                        <span className="grow ellipsis">{t.subject}</span>
                        <Tag tone={t.status === "open" ? "warn" : ""}>{STATUS_LABEL[t.status]}</Tag>
                        <small className="muted nowrap">{fmtAgo(t.updated_at)}</small>
                      </button>
                    ))}
                  </div>
                ) : <p className="muted small">Aucun ticket.</p>}
              </section>
              <section>
                <h4>Activité récente</h4>
                {logs.length ? (
                  <div className="list">
                    {logs.map((l) => (
                      <div key={l.id}>
                        <Tag>{({ insert: "Création", update: "Modification", delete: "Suppression" } as Record<string, string>)[l.action] || l.action}</Tag>
                        <span className="grow ellipsis">{l.entity}</span>
                        <small className="muted nowrap">{fmtDateTime(l.created_at)}</small>
                      </div>
                    ))}
                  </div>
                ) : <p className="muted small">Aucune action enregistrée.</p>}
              </section>
            </>
          )
        }
      </Loaded>
    </Drawer>
  )
}
