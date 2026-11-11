import { useState } from "react"
import { go, useRefresh } from "../App"
import { Icon } from "../icons"
import { must, sb, type Row } from "../supabase"
import { downloadCsv, fmtAgo, fmtDate, fmtNum, Kpi, Loaded, Seg, Table, Tag, useLoad, UserCell } from "../ui"

type Device = Row<"devices"> & { profiles: Pick<Row<"profiles">, "id" | "full_name" | "email" | "avatar_url"> | null }

export function Devices() {
  const refresh = useRefresh()
  const [platform, setPlatform] = useState<"all" | "windows" | "web">("all")
  const [period, setPeriod] = useState<"7" | "30" | "all">("30")
  const q = useLoad(async () => {
    let r = sb.from("devices").select("*, profiles(id, full_name, email, avatar_url)").order("last_seen_at", { ascending: false }).limit(500)
    if (platform !== "all") r = r.eq("platform", platform)
    if (period !== "all") r = r.gte("last_seen_at", new Date(Date.now() - Number(period) * 86400000).toISOString())
    return must(await r) as unknown as Device[]
  }, [platform, period, refresh])

  return (
    <>
      <div className="toolbar">
        <Seg value={platform} onChange={setPlatform} options={[["all", "Toutes plateformes"], ["windows", "Windows"], ["web", "Web"]]} />
        <Seg value={period} onChange={setPeriod} options={[["7", "7 jours"], ["30", "30 jours"], ["all", "Tout"]]} />
        <span className="grow" />
        <button className="btn" disabled={!q.data?.length} onClick={() => downloadCsv("appareils", (q.data || []).map(({ profiles, ...d }) => ({ ...d, email: profiles?.email })))}>
          <Icon name="download" size={14} /> Exporter
        </button>
      </div>
      <Loaded q={q}>
        {(rows) => {
          const versions = new Map<string, number>()
          for (const d of rows) versions.set(d.app_version || "inconnue", (versions.get(d.app_version || "inconnue") || 0) + 1)
          const users = new Set(rows.map((d) => d.user_id)).size
          return (
            <>
              <div className="kpis">
                <Kpi icon="laptop" label="Appareils" value={fmtNum(rows.length)} hint={`${fmtNum(users)} utilisateur(s)`} />
                <Kpi icon="display" label="Windows" value={fmtNum(rows.filter((d) => d.platform === "windows").length)} />
                <Kpi icon="globe" label="Web" value={fmtNum(rows.filter((d) => d.platform === "web").length)} />
                <Kpi icon="download" label="Versions" value={fmtNum(versions.size)} hint={[...versions].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v, n]) => `${v} (${n})`).join(" · ")} />
              </div>
              <Table head={["Utilisateur", "Appareil", "Plateforme", "Version", "Vu", "Premier accès"]} count={rows.length} empty="Aucun appareil sur la période.">
                {rows.map((d) => (
                  <tr key={d.id} className="click" onClick={() => go("users", d.user_id)}>
                    <td><UserCell p={d.profiles} /></td>
                    <td>{d.name}</td>
                    <td><Tag tone={d.platform === "windows" ? "info" : ""}>{d.platform === "web" ? "Web" : "Windows"}</Tag></td>
                    <td>{d.app_version || "—"}</td>
                    <td className="nowrap">{fmtAgo(d.last_seen_at)}</td>
                    <td className="nowrap">{fmtDate(d.created_at)}</td>
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
