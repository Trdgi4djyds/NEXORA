import { useState } from "react"
import { go, useRefresh } from "../App"
import { Icon } from "../icons"
import { must, sb, type Row } from "../supabase"
import { fmtAgo, fmtBytes, fmtNum, Kpi, Loaded, SearchBox, Seg, Table, Tag, useAction, useLoad } from "../ui"

type Asset = Row<"assets"> & { organizations: { name: string } | null }
const BUCKETS: [string, string][] = [["all", "Tous"], ["assets", "Ressources"], ["design-files", "Designs"], ["exports", "Exports"], ["avatars", "Avatars"]]

export function Files() {
  const refresh = useRefresh()
  const act = useAction()
  const [bucket, setBucket] = useState("all")
  const [search, setSearch] = useState("")
  const q = useLoad(async () => {
    let r = sb.from("assets").select("*, organizations(name)").order("created_at", { ascending: false }).limit(300)
    if (bucket !== "all") r = r.eq("bucket", bucket)
    if (search) r = r.ilike("name", `%${search}%`)
    return must(await r) as unknown as Asset[]
  }, [bucket, search, refresh])

  async function open(a: Asset) {
    await act.run(async () => {
      const { data, error } = await sb.storage.from(a.bucket).createSignedUrl(a.path, 120)
      if (error) throw error
      window.open(data.signedUrl, "_blank", "noopener")
    })
  }

  return (
    <>
      <div className="toolbar">
        <Seg value={bucket} onChange={setBucket} options={BUCKETS} />
        <SearchBox value={search} onSearch={setSearch} placeholder="Nom du fichier…" />
      </div>
      <Loaded q={q}>
        {(rows) => {
          const total = rows.reduce((s, a) => s + Number(a.size_bytes || 0), 0)
          const byOrg = new Map<string, number>()
          for (const a of rows) byOrg.set(a.organizations?.name || "—", (byOrg.get(a.organizations?.name || "—") || 0) + Number(a.size_bytes || 0))
          const top = [...byOrg].sort((a, b) => b[1] - a[1])[0]
          return (
            <>
              <div className="kpis">
                <Kpi icon="file" label="Fichiers affichés" value={fmtNum(rows.length)} />
                <Kpi icon="cloud" label="Volume" value={fmtBytes(total)} />
                <Kpi icon="group" label="Espace le plus lourd" value={top ? fmtBytes(top[1]) : "—"} hint={top?.[0]} />
              </div>
              <Table head={["Nom", "Type", "Compartiment", "Taille", "Espace", "Ajouté", ""]} empty="Aucun fichier.">
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td><b className="ellipsis" style={{ display: "block", maxWidth: 320 }}>{a.name}</b><small className="muted">{a.mime || ""}</small></td>
                    <td>{a.kind}</td>
                    <td><Tag>{a.bucket}</Tag></td>
                    <td className="num">{fmtBytes(a.size_bytes)}</td>
                    <td><button className="link-btn" onClick={() => go("orgs", a.org_id)}>{a.organizations?.name || "—"}</button></td>
                    <td className="nowrap">{fmtAgo(a.created_at)}</td>
                    <td className="act">
                      <button className="icon-btn" title="Ouvrir (lien temporaire de 2 minutes)" disabled={act.busy} onClick={() => open(a)}>
                        <Icon name="external" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
            </>
          )
        }}
      </Loaded>
    </>
  )
}
