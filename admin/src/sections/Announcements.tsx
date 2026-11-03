import { useState, type FormEvent } from "react"
import { useRefresh } from "../App"
import { useMe } from "../auth"
import { Icon } from "../icons"
import { must, sb, type Row } from "../supabase"
import { fmtDate, Loaded, Switch, Table, Tag, useAction, useLoad, useUi } from "../ui"

const LEVELS: [string, string, string][] = [["info", "Information", "info"], ["success", "Nouveauté", "ok"], ["warning", "Attention", "warn"], ["critical", "Critique", "bad"]]
const AUDIENCES: [string, string][] = [["all", "Tout le monde"], ["free", "Offre Gratuite"], ["pro", "Offre Pro"], ["team", "Offre Équipe"], ["admins", "Administrateurs"]]
const label = (list: [string, string, ...string[]][], v: string) => list.find((x) => x[0] === v)?.[1] || v

export function Announcements() {
  const refresh = useRefresh()
  const me = useMe()
  const ui = useUi()
  const act = useAction()
  const [tick, setTick] = useState(0)
  const q = useLoad(async () => {
    const [a, r] = await Promise.all([sb.from("announcements").select("*").order("created_at", { ascending: false }), sb.from("announcement_reads").select("announcement_id")])
    const reads = new Map<string, number>()
    for (const x of (r.data || []) as { announcement_id: string }[]) reads.set(x.announcement_id, (reads.get(x.announcement_id) || 0) + 1)
    return { list: must(a) as Row<"announcements">[], reads }
  }, [refresh, tick])
  const reload = () => setTick((n) => n + 1)

  async function publish(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>
    const ok = await act.run(async () => must(await sb.from("announcements").insert({
      title: f.title.trim(), body: f.body.trim(), level: f.level, audience: f.audience,
      starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : undefined,
      ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null, created_by: me.profile.id,
    })), "Annonce publiée.")
    if (ok) { form.reset(); reload() }
  }
  async function broadcast(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>
    if (!(await ui.confirm({ title: "Envoyer ce message ?", body: `« ${f.title} » arrivera dans le centre de notifications de : ${label(AUDIENCES, f.audience).toLowerCase()}.`, confirm: "Envoyer" }))) return
    await act.run(async () => {
      const n = must(await sb.rpc("admin_broadcast", { title: f.title.trim(), body: f.body.trim(), audience: f.audience, link: f.link.trim() || undefined }))
      ui.toast(`Message envoyé à ${n} personne(s).`)
      form.reset()
    })
  }
  async function remove(a: Row<"announcements">) {
    if (!(await ui.confirm({ title: "Supprimer cette annonce ?", body: `« ${a.title} » disparaîtra de NEXORA.`, confirm: "Supprimer", danger: true }))) return
    if (await act.run(async () => must(await sb.from("announcements").delete().eq("id", a.id)), "Annonce supprimée.")) reload()
  }

  return (
    <>
      <div className="cols">
        <form className="card form" onSubmit={publish}>
          <div className="card-head"><Icon name="bell" size={16} /><h3>Nouvelle annonce</h3></div>
          <p className="muted small" style={{ margin: 0 }}>Bandeau affiché en haut de NEXORA, pour le public choisi.</p>
          <div className="grid2">
            <label className="field"><span>Titre</span><input className="input" name="title" required maxLength={120} /></label>
            <label className="field"><span>Niveau</span><select className="input" name="level">{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          </div>
          <label className="field"><span>Message</span><textarea className="input" name="body" rows={2} maxLength={600} /></label>
          <div className="grid3">
            <label className="field"><span>Public</span><select className="input" name="audience">{AUDIENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="field"><span>Début</span><input className="input" type="datetime-local" name="starts_at" /></label>
            <label className="field"><span>Fin (facultatif)</span><input className="input" type="datetime-local" name="ends_at" /></label>
          </div>
          <div className="actions"><button className="btn primary" disabled={act.busy}>Publier l’annonce</button></div>
        </form>
        <form className="card form" onSubmit={broadcast}>
          <div className="card-head"><Icon name="mail" size={16} /><h3>Message direct</h3></div>
          <p className="muted small" style={{ margin: 0 }}>Notification envoyée dans le centre de notifications de chaque personne concernée.</p>
          <label className="field"><span>Titre</span><input className="input" name="title" required maxLength={120} /></label>
          <label className="field"><span>Message</span><textarea className="input" name="body" rows={2} required maxLength={600} /></label>
          <div className="grid2">
            <label className="field"><span>Public</span><select className="input" name="audience">{AUDIENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="field"><span>Lien (facultatif)</span><input className="input" name="link" placeholder="https://…" /></label>
          </div>
          <div className="actions"><button className="btn primary" disabled={act.busy}>Envoyer</button></div>
        </form>
      </div>
      <h3>Annonces publiées</h3>
      <Loaded q={q}>
        {({ list, reads }) => (
          <Table head={["Annonce", "Niveau", "Public", "Période", "Lue", "Active", ""]} empty="Aucune annonce.">
            {list.map((a) => {
              const lv = LEVELS.find((l) => l[0] === a.level)
              const over = a.ends_at && new Date(a.ends_at).getTime() < Date.now()
              return (
                <tr key={a.id}>
                  <td><b>{a.title}</b><div className="muted small ellipsis" style={{ maxWidth: 420 }}>{a.body}</div></td>
                  <td><Tag tone={lv?.[2]}>{lv?.[1] || a.level}</Tag></td>
                  <td>{label(AUDIENCES, a.audience)}</td>
                  <td className="nowrap">{fmtDate(a.starts_at)} → {a.ends_at ? fmtDate(a.ends_at) : "∞"}{over && <> <Tag>terminée</Tag></>}</td>
                  <td className="num">{reads.get(a.id) || 0}</td>
                  <td><Switch checked={a.active} disabled={act.busy} label="Annonce active" onChange={async (v) => { if (await act.run(async () => must(await sb.from("announcements").update({ active: v }).eq("id", a.id)), v ? "Annonce activée." : "Annonce désactivée.")) reload() }} /></td>
                  <td className="act"><button className="icon-btn danger" title="Supprimer" onClick={() => remove(a)}><Icon name="trash" size={14} /></button></td>
                </tr>
              )
            })}
          </Table>
        )}
      </Loaded>
    </>
  )
}
