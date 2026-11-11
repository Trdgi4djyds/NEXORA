import { useState, type FormEvent } from "react"
import { useRefresh } from "../App"
import { useMe } from "../auth"
import { Icon } from "../icons"
import { must, sb, type Row } from "../supabase"
import { fmtAgo, Loaded, Switch, Table, useAction, useLoad } from "../ui"

export function Flags() {
  const refresh = useRefresh()
  const me = useMe()
  const act = useAction()
  const [tick, setTick] = useState(0)
  const q = useLoad(async () => {
    const [f, p] = await Promise.all([sb.from("feature_flags").select("*").order("key"), sb.from("plans").select("id, name").order("sort")])
    return { flags: must(f) as Row<"feature_flags">[], plans: must(p) as { id: string; name: string }[] }
  }, [refresh, tick])
  const reload = () => setTick((n) => n + 1)
  const save = async (key: string, patch: Partial<Row<"feature_flags">>, ok = "Enregistré.") => {
    if (await act.run(async () => must(await sb.from("feature_flags").update({ ...patch, updated_by: me.profile.id }).eq("key", key)), ok)) reload()
  }
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>
    if (await act.run(async () => must(await sb.from("feature_flags").insert({ key: f.key, description: f.description, enabled: false, rollout: 100, plans: [], updated_by: me.profile.id })), "Fonctionnalité ajoutée (désactivée).")) {
      form.reset()
      reload()
    }
  }

  return (
    <>
      <p className="muted" style={{ margin: 0 }}>
        Les changements arrivent en direct dans NEXORA. « Déploiement » limite la fonctionnalité à un pourcentage des comptes ; « Offres » la réserve à certaines offres (aucune cochée : toutes).
      </p>
      <Loaded q={q}>
        {({ flags, plans }) => (
          <Table head={["Fonctionnalité", "Active", "Déploiement", "Offres", "Modifiée"]} empty="Aucune fonctionnalité.">
            {flags.map((f) => (
              <tr key={f.key}>
                <td><code>{f.key}</code><div className="muted small">{f.description}</div></td>
                <td><Switch checked={f.enabled} disabled={act.busy} label={`Activer ${f.key}`} onChange={(v) => save(f.key, { enabled: v }, v ? "Fonctionnalité activée." : "Fonctionnalité désactivée.")} /></td>
                <td>
                  <div className="row">
                    <input type="range" min={0} max={100} step={5} defaultValue={f.rollout} style={{ width: 110, accentColor: "var(--accent)" }}
                      onPointerUp={(e) => Number(e.currentTarget.value) !== f.rollout && save(f.key, { rollout: Number(e.currentTarget.value) })}
                      onKeyUp={(e) => Number(e.currentTarget.value) !== f.rollout && save(f.key, { rollout: Number(e.currentTarget.value) })}
                      onChange={(e) => (e.currentTarget.nextElementSibling!.textContent = `${e.currentTarget.value} %`)} />
                    <span className="small" style={{ width: 40 }}>{f.rollout} %</span>
                  </div>
                </td>
                <td>
                  <div className="row wrap" style={{ gap: 10 }}>
                    {plans.map((p) => (
                      <label key={p.id} className="check">
                        <input type="checkbox" checked={f.plans.includes(p.id)} disabled={act.busy}
                          onChange={(e) => save(f.key, { plans: e.target.checked ? [...f.plans, p.id] : f.plans.filter((x) => x !== p.id) })} />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </td>
                <td className="nowrap muted">{fmtAgo(f.updated_at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Loaded>
      <form className="card row wrap" onSubmit={add}>
        <Icon name="plus" size={15} />
        <input className="input" name="key" required pattern="[a-z0-9_]+" placeholder="cle_fonctionnalite" style={{ width: 200 }} />
        <input className="input grow" name="description" required placeholder="Description" />
        <button className="btn" disabled={act.busy}>Ajouter</button>
      </form>
    </>
  )
}
