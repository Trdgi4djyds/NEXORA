import { useState, type ReactNode } from "react"
import { go, useRefresh, type SectionProps } from "../App"
import { Icon } from "../icons"
import { must, sb } from "../supabase"
import { fmtAgo, fmtBytes, fmtDate, Loaded, SearchBox, Table, Tag, useAction, useLoad, useUi } from "../ui"

type Any = Record<string, any>
type TabDef = {
  id: string
  label: string
  table: string
  select: string
  order: string
  search?: string
  head: string[]
  row: (r: Any) => ReactNode[]
  name: (r: Any) => string
}

const org = (r: Any) => (
  <button className="link-btn" onClick={() => go("orgs", r.org_id)}>{r.organizations?.name || "—"}</button>
)

const TABS: TabDef[] = [
  {
    id: "projects", label: "Projets", table: "projects", order: "created_at", search: "name",
    select: "id, name, url, kind, archived, pinned, created_at, updated_at, org_id, organizations(name)",
    head: ["Nom", "Type", "Adresse", "Espace", "Créé"],
    name: (r) => r.name,
    row: (r) => [
      <div className="row"><b>{r.name}</b>{r.archived && <Tag>archivé</Tag>}{r.pinned && <Tag tone="info">épinglé</Tag>}</div>,
      r.kind === "folder" ? "Dossier" : r.kind === "site" ? "Site" : r.kind,
      r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.url}</a> : "—",
      org(r),
      fmtDate(r.created_at),
    ],
  },
  {
    id: "designs", label: "Documents NEX-DESIGN", table: "design_documents", order: "updated_at", search: "name",
    select: "id, name, pages_count, size_bytes, thumb, version, updated_at, deleted_at, org_id, organizations(name)",
    head: ["", "Nom", "Pages", "Taille", "Version", "Espace", "Modifié"],
    name: (r) => r.name,
    row: (r) => [
      r.thumb ? <img className="thumb" src={r.thumb} alt="" /> : <span className="thumb" />,
      <div className="row"><b>{r.name}</b>{r.deleted_at && <Tag tone="bad">supprimé</Tag>}</div>,
      r.pages_count, fmtBytes(r.size_bytes), `v${r.version}`, org(r), fmtAgo(r.updated_at),
    ],
  },
  {
    id: "studio", label: "Studio 3D & Motion", table: "studio_items", order: "updated_at", search: "name",
    select: "id, name, kind, thumb, version, updated_at, org_id, organizations(name)",
    head: ["", "Nom", "Type", "Version", "Espace", "Modifié"],
    name: (r) => r.name,
    row: (r) => [
      r.thumb ? <img className="thumb" src={r.thumb} alt="" /> : <span className="thumb" />,
      <b>{r.name}</b>, r.kind, `v${r.version}`, org(r), fmtAgo(r.updated_at),
    ],
  },
  {
    id: "boards", label: "Planches", table: "device_boards", order: "updated_at", search: "name",
    select: "id, name, devices, updated_at, org_id, organizations(name)",
    head: ["Nom", "Appareils", "Espace", "Modifiée"],
    name: (r) => r.name,
    row: (r) => [<b>{r.name}</b>, Array.isArray(r.devices) ? r.devices.length : "—", org(r), fmtAgo(r.updated_at)],
  },
  {
    id: "shares", label: "Liens de partage", table: "share_links", order: "created_at",
    select: "id, target_type, target_id, token, expires_at, created_at, org_id, organizations(name)",
    head: ["Élément partagé", "Lien", "Espace", "Expire", "Créé"],
    name: (r) => `le lien ${r.token.slice(0, 8)}…`,
    row: (r) => {
      const expired = r.expires_at && new Date(r.expires_at).getTime() < Date.now()
      return [
        <span>{r.target_type} <code className="muted">{String(r.target_id).slice(0, 8)}</code></span>,
        <code>{r.token.slice(0, 10)}…</code>,
        org(r),
        r.expires_at ? <Tag tone={expired ? "bad" : ""}>{expired ? "expiré" : fmtDate(r.expires_at)}</Tag> : "Jamais",
        fmtAgo(r.created_at),
      ]
    },
  },
  {
    id: "comments", label: "Commentaires", table: "comments", order: "created_at", search: "body",
    select: "id, body, target_type, resolved, created_at, org_id, organizations(name), profiles(full_name)",
    head: ["Commentaire", "Auteur", "Sur", "État", "Espace", "Date"],
    name: () => "ce commentaire",
    row: (r) => [
      <span className="ellipsis" style={{ display: "block", maxWidth: 360 }}>{r.body}</span>,
      r.profiles?.full_name || "—", r.target_type,
      <Tag tone={r.resolved ? "ok" : "warn"}>{r.resolved ? "résolu" : "ouvert"}</Tag>,
      org(r), fmtAgo(r.created_at),
    ],
  },
]

export function Content({ param }: SectionProps) {
  const tab = TABS.find((t) => t.id === param) || TABS[0]
  return (
    <>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab.id ? "on" : ""} onClick={() => go("content", t.id)} role="tab">
            {t.label}
          </button>
        ))}
      </div>
      <ContentTab key={tab.id} tab={tab} />
    </>
  )
}

function ContentTab({ tab }: { tab: TabDef }) {
  const refresh = useRefresh()
  const ui = useUi()
  const act = useAction()
  const [search, setSearch] = useState("")
  const [tick, setTick] = useState(0)
  const q = useLoad(async () => {
    let r = sb.from(tab.table).select(tab.select, { count: "exact" }).order(tab.order, { ascending: false }).limit(200)
    if (search && tab.search) r = r.ilike(tab.search, `%${search}%`)
    const res = await r
    return { rows: must(res) as unknown as Any[], count: res.count ?? 0 }
  }, [tab.id, search, refresh, tick])

  async function remove(r: Any) {
    if (!(await ui.confirm({ title: "Supprimer définitivement ?", body: `Supprimer ${tab.name(r)} pour tous les membres de l’espace. Cette action est irréversible.`, confirm: "Supprimer", danger: true }))) return
    if (await act.run(async () => must(await sb.from(tab.table).delete().eq("id", r.id)), "Élément supprimé.")) setTick((n) => n + 1)
  }

  return (
    <>
      {tab.search && (
        <div className="toolbar">
          <SearchBox value={search} onSearch={setSearch} />
        </div>
      )}
      <Loaded q={q}>
        {({ rows, count }) => (
          <>
            <Table head={[...tab.head, ""]} empty={search ? "Aucun résultat." : "Rien pour l’instant."}>
              {rows.map((r) => (
                <tr key={r.id}>
                  {tab.row(r).map((c, i) => <td key={i}>{c}</td>)}
                  <td className="act">
                    <button className="icon-btn danger" title="Supprimer" disabled={act.busy} onClick={() => remove(r)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
            <div className="pager">{count > rows.length ? `${rows.length} affichés sur ${count}` : `${count} élément(s)`}</div>
          </>
        )}
      </Loaded>
    </>
  )
}
