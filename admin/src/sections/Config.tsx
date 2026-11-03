import { useState, type FormEvent } from "react"
import { useRefresh } from "../App"
import { useMe } from "../auth"
import { Icon } from "../icons"
import { must, sb, type Json, type Row } from "../supabase"
import { fmtAgo, Loaded, Switch, useAction, useLoad, useUi } from "../ui"

type Conf = Row<"app_config">

export function Config() {
  const refresh = useRefresh()
  const me = useMe()
  const act = useAction()
  const [tick, setTick] = useState(0)
  const q = useLoad(async () => {
    const [c, p] = await Promise.all([sb.from("app_config").select("*").order("key"), sb.from("plans").select("id, name").order("sort")])
    return { conf: must(c) as Conf[], plans: must(p) as { id: string; name: string }[] }
  }, [refresh, tick])
  const reload = () => setTick((n) => n + 1)
  const save = async (key: string, value: Json, ok = "Configuration enregistrée.") => {
    if (await act.run(async () => must(await sb.from("app_config").update({ value, updated_by: me.profile.id }).eq("key", key)), ok)) reload()
  }
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>
    let value: Json
    try { value = JSON.parse(f.value) } catch { value = f.value }
    if (await act.run(async () => must(await sb.from("app_config").insert({ key: f.key, value, description: f.description || "", updated_by: me.profile.id })), "Réglage ajouté.")) {
      form.reset()
      reload()
    }
  }
  const ro = !me.isSuper

  return (
    <>
      {ro && <div className="banner info"><Icon name="lock" size={16} /><span>Lecture seule : seuls les super-administrateurs modifient la configuration.</span></div>}
      <Loaded q={q}>
        {({ conf, plans }) => {
          const byKey = Object.fromEntries(conf.map((c) => [c.key, c]))
          const m = (byKey.maintenance?.value || {}) as { enabled?: boolean; message?: string }
          const others = conf.filter((c) => !["maintenance", "signups_enabled", "default_plan"].includes(c.key))
          return (
            <>
              <div className="cols">
                {byKey.signups_enabled && (
                  <div className="card stack">
                    <div className="card-head"><Icon name="user" size={16} /><h3 className="grow">Inscriptions</h3><Switch checked={byKey.signups_enabled.value === true} disabled={ro || act.busy} label="Inscriptions ouvertes" onChange={(v) => save("signups_enabled", v, v ? "Inscriptions ouvertes." : "Inscriptions fermées.")} /></div>
                    <p className="muted small" style={{ margin: 0 }}>{byKey.signups_enabled.value === true ? "Tout le monde peut créer un compte NEXORA." : "Les nouvelles inscriptions sont refusées ; les comptes existants fonctionnent."}</p>
                  </div>
                )}
                {byKey.maintenance && <Maintenance value={m} ro={ro || act.busy} onSave={(v) => save("maintenance", v, v.enabled ? "Mode maintenance activé." : "Mode maintenance enregistré.")} />}
                {byKey.default_plan && (
                  <div className="card stack">
                    <div className="card-head"><Icon name="star" size={16} /><h3>Offre par défaut</h3></div>
                    <select className="input" value={String(byKey.default_plan.value)} disabled={ro || act.busy} onChange={(e) => save("default_plan", e.target.value)}>
                      {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <p className="muted small" style={{ margin: 0 }}>Attribuée à chaque nouvel espace.</p>
                  </div>
                )}
              </div>
              <h3>Autres réglages</h3>
              <div className="stack">
                {others.map((c) => <JsonSetting key={`${c.key}-${c.updated_at}`} c={c} ro={ro} onSave={(v) => save(c.key, v)} />)}
              </div>
              {!ro && (
                <form className="card row wrap" onSubmit={add}>
                  <Icon name="plus" size={15} />
                  <input className="input" name="key" required pattern="[a-z0-9_]+" placeholder="nouvelle_cle" style={{ width: 180 }} />
                  <input className="input" name="value" required placeholder='Valeur JSON, par ex. "texte", 10, true' style={{ width: 240 }} />
                  <input className="input grow" name="description" placeholder="Description" />
                  <button className="btn" disabled={act.busy}>Ajouter</button>
                </form>
              )}
            </>
          )
        }}
      </Loaded>
    </>
  )
}

function Maintenance({ value, ro, onSave }: { value: { enabled?: boolean; message?: string }; ro: boolean; onSave: (v: { enabled: boolean; message: string }) => void }) {
  const [msg, setMsg] = useState(value.message || "")
  return (
    <div className="card stack">
      <div className="card-head"><Icon name="warn" size={16} /><h3 className="grow">Mode maintenance</h3><Switch checked={!!value.enabled} disabled={ro} label="Mode maintenance" onChange={(v) => onSave({ enabled: v, message: msg })} /></div>
      <textarea className="input" rows={2} value={msg} disabled={ro} onChange={(e) => setMsg(e.target.value)} />
      {msg !== (value.message || "") && <div className="actions"><button className="btn sm primary" onClick={() => onSave({ enabled: !!value.enabled, message: msg })}>Enregistrer le message</button></div>}
    </div>
  )
}

function JsonSetting({ c, ro, onSave }: { c: Conf; ro: boolean; onSave: (v: Json) => void }) {
  const ui = useUi()
  const initial = JSON.stringify(c.value, null, 2)
  const [text, setText] = useState(initial)
  const long = initial.length > 60
  return (
    <div className="card form">
      <div className="row">
        <code className="grow"><b>{c.key}</b></code>
        <small className="muted">modifié {fmtAgo(c.updated_at)}</small>
      </div>
      {c.description && <p className="muted small" style={{ margin: 0 }}>{c.description}</p>}
      {typeof c.value === "boolean" ? (
        <Switch checked={c.value} disabled={ro} label={c.key} onChange={(v) => onSave(v)} />
      ) : (
        <>
          <textarea className="input code" rows={long ? Math.min(10, initial.split("\n").length) : 1} value={text} disabled={ro} onChange={(e) => setText(e.target.value)} />
          {text !== initial && (
            <div className="actions">
              <button className="btn sm" onClick={() => setText(initial)}>Annuler</button>
              <button className="btn sm primary" onClick={() => { try { onSave(JSON.parse(text)) } catch { ui.toast("JSON invalide.", "bad") } }}>Enregistrer</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
