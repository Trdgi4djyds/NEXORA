import { useState, type FormEvent } from "react"
import { useRefresh } from "../App"
import { Icon } from "../icons"
import { must, sb, type Json, type Row } from "../supabase"
import { fmtMoney, LIMIT_LABEL, Loaded, Modal, Switch, useAction, useLoad } from "../ui"

type Plan = Row<"plans">

export function Plans() {
  const refresh = useRefresh()
  const [tick, setTick] = useState(0)
  const [adding, setAdding] = useState(false)
  const q = useLoad(async () => must(await sb.from("plans").select("*").order("sort")) as Plan[], [refresh, tick])
  const reload = () => setTick((n) => n + 1)
  return (
    <>
      <div className="toolbar">
        <p className="muted grow" style={{ margin: 0 }}>Les limites s’appliquent à chaque espace. Laisse -1 pour une limite illimitée.</p>
        <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Nouvelle offre</button>
      </div>
      <Loaded q={q}>
        {(plans) => (
          <div className="cols">
            {plans.map((p) => <PlanCard key={`${p.id}-${p.updated_at}`} plan={p} onSaved={reload} />)}
          </div>
        )}
      </Loaded>
      {adding && <NewPlan sort={(q.data?.length || 0) + 1} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload() }} />}
    </>
  )
}

function PlanCard({ plan, onSaved }: { plan: Plan; onSaved: () => void }) {
  const act = useAction()
  const [p, setP] = useState(plan)
  const [limits, setLimits] = useState<Record<string, number>>((plan.limits as Record<string, number>) || {})
  const [features, setFeatures] = useState(((plan.features as string[]) || []).join("\n"))
  const [newKey, setNewKey] = useState("")
  const dirty = JSON.stringify({ ...p, limits, features }) !== JSON.stringify({ ...plan, limits: plan.limits || {}, features: ((plan.features as string[]) || []).join("\n") })

  async function save(e: FormEvent) {
    e.preventDefault()
    const ok = await act.run(async () => must(await sb.from("plans").update({
      name: p.name, description: p.description, price_month_cents: Number(p.price_month_cents) || 0, price_year_cents: Number(p.price_year_cents) || 0,
      currency: p.currency, sort: Number(p.sort) || 0, active: p.active, limits: limits as Json,
      features: features.split("\n").map((s) => s.trim()).filter(Boolean),
    }).eq("id", plan.id)), `Offre « ${p.name} » enregistrée.`)
    if (ok) onSaved()
  }

  return (
    <form className="card form" onSubmit={save}>
      <div className="card-head">
        <Icon name="star" size={16} />
        <h3 className="grow">{p.name} <code className="muted">{plan.id}</code></h3>
        <label className="check">Proposée <Switch checked={p.active} onChange={(v) => setP({ ...p, active: v })} label="Offre proposée" /></label>
      </div>
      <div className="grid2">
        <label className="field"><span>Nom</span><input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
        <label className="field"><span>Ordre</span><input className="input" type="number" value={p.sort} onChange={(e) => setP({ ...p, sort: Number(e.target.value) })} /></label>
      </div>
      <label className="field"><span>Description</span><input className="input" value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} /></label>
      <div className="grid3">
        <label className="field"><span>Prix mensuel (centimes)</span><input className="input" type="number" min={0} value={p.price_month_cents} onChange={(e) => setP({ ...p, price_month_cents: Number(e.target.value) })} /><small>{fmtMoney(p.price_month_cents, p.currency)} / mois</small></label>
        <label className="field"><span>Prix annuel (centimes)</span><input className="input" type="number" min={0} value={p.price_year_cents} onChange={(e) => setP({ ...p, price_year_cents: Number(e.target.value) })} /><small>{fmtMoney(p.price_year_cents, p.currency)} / an</small></label>
        <label className="field"><span>Devise</span><input className="input" value={p.currency} maxLength={3} onChange={(e) => setP({ ...p, currency: e.target.value.toUpperCase() })} /></label>
      </div>
      <div className="field">
        <span>Limites</span>
        <div className="limits">
          {Object.entries(limits).map(([k, v]) => (
            <label key={k} className="field">
              <small>{LIMIT_LABEL[k] || k}</small>
              <div className="row">
                <input className="input sm grow" type="number" min={-1} value={v} onChange={(e) => setLimits({ ...limits, [k]: Number(e.target.value) })} />
                <button type="button" className="icon-btn" title="Retirer cette limite" onClick={() => { const { [k]: _, ...rest } = limits; setLimits(rest) }}><Icon name="close" size={12} /></button>
              </div>
            </label>
          ))}
          <div className="field">
            <small>Ajouter une limite</small>
            <div className="row">
              <input className="input sm grow" placeholder="cle_limite" pattern="[a-z0-9_]+" value={newKey} onChange={(e) => setNewKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} />
              <button type="button" className="icon-btn" title="Ajouter" disabled={!newKey || newKey in limits} onClick={() => { setLimits({ ...limits, [newKey]: -1 }); setNewKey("") }}><Icon name="plus" size={13} /></button>
            </div>
          </div>
        </div>
      </div>
      <label className="field"><span>Avantages affichés (un par ligne)</span><textarea className="input" rows={4} value={features} onChange={(e) => setFeatures(e.target.value)} /></label>
      <div className="actions">
        {dirty && <small className="muted grow">Modifications non enregistrées</small>}
        <button className="btn primary" disabled={act.busy || !dirty}>Enregistrer</button>
      </div>
    </form>
  )
}

function NewPlan({ sort, onClose, onDone }: { sort: number; onClose: () => void; onDone: () => void }) {
  const act = useAction()
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    const ok = await act.run(async () => must(await sb.from("plans").insert({
      id: f.id, name: f.name, description: f.description, price_month_cents: Number(f.price) || 0, price_year_cents: (Number(f.price) || 0) * 10,
      currency: "EUR", sort, active: false, limits: { projects: -1, designs: -1, members: -1, monitors: -1, storage_mb: -1, scans_per_day: -1 }, features: [],
    })), "Offre créée (pas encore proposée).")
    if (ok) onDone()
  }
  return (
    <Modal title="Nouvelle offre" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="grid2">
          <label className="field"><span>Identifiant</span><input className="input" name="id" required pattern="[a-z0-9_]+" placeholder="business" /><small>Minuscules, chiffres et _ ; non modifiable.</small></label>
          <label className="field"><span>Nom</span><input className="input" name="name" required /></label>
        </div>
        <label className="field"><span>Description</span><input className="input" name="description" /></label>
        <label className="field"><span>Prix mensuel (centimes)</span><input className="input" type="number" min={0} name="price" defaultValue={0} /><small>Le prix annuel proposé vaut 10 mois ; modifiable ensuite.</small></label>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" disabled={act.busy}>Créer</button>
        </div>
      </form>
    </Modal>
  )
}
