// NEXORA #037 : offres Gratuit, Standard et Pro. Panneaux de tarifs (aperçu fidèle à l'application, modifiable
// en direct), limites et fonctions incluses lues par le serveur (migration 20261104000007_offres_limites.sql),
// tableau comparatif, abonnés par offre et essais des applications de l'offre Gratuite.
import { useMemo, useState, type FormEvent } from "react"
import { go, useRefresh } from "../App"
import { Icon } from "../icons"
import { must, sb, type Json, type Row } from "../supabase"
import { fmtDate, fmtMoney, fmtNum, Kpi, LIMIT_LABEL, Loaded, Modal, Switch, Tag, useAction, useLoad } from "../ui"
import { COMPARE as COMPARE_JS, FALLBACK, limitText } from "../../../nexora/app/renderer/nx/offres/catalog.js"

type Plan = Row<"plans">
type Limits = Record<string, number>
type Perms = Record<string, boolean>
type Trial = Row<"nx_app_trials"> & { profiles: { full_name: string; email: string | null } | null }
type CompareRow = { label: string; perm?: string; limit?: string; unit?: string; text?: Record<string, string>; note?: Record<string, string> }
const COMPARE = COMPARE_JS as unknown as [string, CompareRow[]][]

// Limites connues, dans l'ordre d'affichage.
// NEXORA #087 : apps_lifetime (1 : applications comptées à vie, supprimées comprises) et builds_per_app_month.
const LIMIT_KEYS = ["projects", "designs", "members", "monitors", "storage_mb", "apps", "apps_lifetime", "builds_per_app_month", "app_trial_days", "ai_requests_month", "builds_month", "scans_per_day", "crawls_per_day", "push_month"]
// Fonctions incluses, par groupe (libellés du tableau comparatif de l'application).
const PERM_GROUPS: [string, [string, string][]][] = COMPARE.map(([group, rows]): [string, [string, string][]] => [
  group,
  rows.filter((r) => r.perm).map((r): [string, string] => [r.perm as string, r.label]),
]).filter(([, rows]) => rows.length > 0)
const EXTRA_PERMS: [string, string][] = [["design_extended", "NEX-DESIGN étendu"], ["design_full", "NEX-DESIGN complet"], ["inapp", "Messages in-app"], ["notifications_advanced", "Notifications avancées"], ["projects_management", "Gestion de projets"], ["standard_support", "Assistance standard"], ["priority_support", "Support prioritaire"], ["multiscreen", "Prévisualisation multi-écrans"]]

// Médaillon de chaque offre (comme dans l'application, NEXORA #038) : pas d'illustration d'objet sur les tarifs.
const MEDAL: Record<string, string> = { free: "sparkle", pro: "star" }
// Montants : en dollars, « 10 $ » plutôt que « 10,00 $US » ; autres devises : format habituel.
const amount = (cents: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format((Number(cents) || 0) / 100)
const price = (cents: number, currency: string) => (currency === "USD" ? `${amount(cents)} $` : fmtMoney(cents, currency))

export function Plans() {
  const refresh = useRefresh()
  const [tick, setTick] = useState(0)
  const [adding, setAdding] = useState(false)
  const q = useLoad(async () => {
    const [plans, subs, trials] = await Promise.all([
      sb.from("plans").select("*").order("sort"),
      sb.from("subscriptions").select("plan_id, status, org_id"),
      sb.from("nx_app_trials").select("*, profiles(full_name, email)").order("created_at", { ascending: false }).limit(60),
    ])
    return {
      plans: must(plans) as Plan[],
      subs: (subs.error ? [] : subs.data) as Pick<Row<"subscriptions">, "plan_id" | "status" | "org_id">[],
      trials: trials.error ? null : (trials.data as unknown as Trial[]),
    }
  }, [refresh, tick])
  const reload = () => setTick((n) => n + 1)
  return (
    <>
      <div className="toolbar">
        <p className="muted grow" style={{ margin: 0 }}>Gratuit et Pro (#076 : l’ancienne offre Standard est passée à Pro). Les limites (-1 : illimité) et les fonctions incluses sont vérifiées par les serveurs NEXORA à chaque création et à chaque fonction réservée.</p>
        <button className="btn" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Nouvelle offre</button>
      </div>
      <Loaded q={q}>
        {({ plans, subs, trials }) => {
          const migrated = plans.some((p) => p.id === "pro" && p.active) && plans.every((p) => p.perms !== undefined)
          const live = plans.filter((p) => p.active)
          const old = plans.filter((p) => !p.active)
          const active = subs.filter((s) => ["active", "trialing", "past_due"].includes(s.status))
          const countOf = (id: string) => active.filter((s) => (s.plan_id === "team" || s.plan_id === "enterprise" || s.plan_id === "standard" ? "pro" : s.plan_id) === id).length
          const orgs = new Set(subs.map((s) => s.org_id)).size
          const mrr = active.reduce((t, s) => t + (plans.find((p) => p.id === s.plan_id)?.price_month_cents || 0), 0)
          return (
            <div className="stack po">
              {!migrated && (
                <div className="banner">
                  <Icon name="warn" size={16} />
                  <span className="grow">Les offres du #037 ne sont pas encore sur Supabase : applique les migrations <code>20261104000007_offres_limites.sql</code> à <code>20261108000002_licences_offres.sql</code> (section Supabase → Tout appliquer). Les panneaux ci-dessous montrent les offres prévues.</span>
                  <button className="btn sm" onClick={() => go("supabase")}>Ouvrir Supabase</button>
                </div>
              )}
              <div className="kpis">
                <Kpi label="Espaces Gratuit" object="team" value={fmtNum(Math.max(0, orgs - countOf("pro")))} hint="sans abonnement payant" />
                <Kpi label="Espaces Pro" object="star" value={fmtNum(countOf("pro"))} hint={`${price((live.find((p) => p.id === "pro") || FALLBACK.pro).price_month_cents, "USD")} par mois`} />
                <Kpi label="Revenu mensuel" object="coins" value={price(mrr, "USD")} hint="abonnements actifs" />
              </div>
              <div className="po-grid">
                {(migrated ? live : (["free", "pro"] as const).map((id) => ({ ...FALLBACK[id], created_at: "", updated_at: "", active: true }) as unknown as Plan)).map((p) => (
                  <PlanPanel key={`${p.id}-${p.updated_at}`} plan={p} subscribers={countOf(p.id)} editable={migrated} onSaved={reload} />
                ))}
              </div>
              <Compare plans={migrated ? live : (["free", "pro"] as const).map((id) => FALLBACK[id] as unknown as Plan)} />
              <Trials rows={trials} onChanged={reload} />
              {old.length > 0 && (
                <section className="card">
                  <div className="card-head"><Icon name="layers" size={16} /><h3 className="grow">Anciennes offres, retirées de la vente</h3></div>
                  <p className="muted small" style={{ marginTop: 0 }}>Gardées pour l’historique des abonnements ; les espaces abonnés sont passés à Pro (migration du #037).</p>
                  <div className="po-old">
                    {old.map((p) => <PlanPanel key={`${p.id}-${p.updated_at}`} plan={p} subscribers={0} editable={migrated} onSaved={reload} compact />)}
                  </div>
                </section>
              )}
            </div>
          )
        }}
      </Loaded>
      {adding && <NewPlan sort={(q.data?.plans.length || 0) + 1} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload() }} />}
    </>
  )
}

/** Panneau de tarif : aperçu (comme dans l'application) et éditeur dépliable. */
function PlanPanel({ plan, subscribers, editable, onSaved, compact = false }: { plan: Plan; subscribers: number; editable: boolean; onSaved: () => void; compact?: boolean }) {
  const act = useAction()
  const [open, setOpen] = useState(false)
  const [p, setP] = useState(plan)
  const [limits, setLimits] = useState<Limits>((plan.limits as Limits) || {})
  const [perms, setPerms] = useState<Perms>((plan.perms as Perms) || {})
  const [features, setFeatures] = useState(((plan.features as string[]) || []).join("\n"))
  const [newKey, setNewKey] = useState("")
  const initial = useMemo(() => JSON.stringify({ ...plan, limits: plan.limits || {}, perms: plan.perms || {}, features: ((plan.features as string[]) || []).join("\n") }), [plan])
  const dirty = JSON.stringify({ ...p, limits, perms, features }) !== initial
  const id = p.id === "team" || p.id === "enterprise" ? "pro" : p.id
  const feats = features.split("\n").map((s) => s.trim()).filter(Boolean)
  const keys = [...LIMIT_KEYS.filter((k) => k in limits), ...Object.keys(limits).filter((k) => !LIMIT_KEYS.includes(k))]

  async function save(e: FormEvent) {
    e.preventDefault()
    const ok = await act.run(async () => must(await sb.from("plans").update({
      name: p.name, description: p.description, badge: p.badge || "", price_month_cents: Number(p.price_month_cents) || 0, price_year_cents: Number(p.price_year_cents) || 0,
      currency: p.currency, sort: Number(p.sort) || 0, active: p.active, limits: limits as Json, perms: perms as Json, features: feats,
    }).eq("id", plan.id)), `Offre « ${p.name} » enregistrée.`)
    if (ok) onSaved()
  }

  return (
    <article className={`po-plan po-${id}${compact ? " compact" : ""}${p.active ? "" : " off"}`}>
      <div className="po-top">
        <span className="po-medal"><Icon name={MEDAL[id] || "star"} size={17} /></span>
        <div className="po-name"><div className="row"><b>{p.name}</b><code>{plan.id}</code></div>{p.badge ? <span className="po-ribbon">{p.badge}</span> : null}</div>
      </div>
      <div className="po-body">
        <div className="po-price"><b>{amount(p.price_month_cents)}</b><span>{p.currency === "USD" ? "$" : p.currency} / mois</span></div>
        <small className="muted">{p.price_year_cents ? `${price(p.price_year_cents, p.currency)} par an` : "Gratuit, pour toujours"} · {subscribers} espace{subscribers > 1 ? "s" : ""} abonné{subscribers > 1 ? "s" : ""}</small>
        <p className="po-desc">{p.description}</p>
        <div className="po-keys">
          {["projects", "apps", "builds_month"].filter((k) => k in limits && Number(limits[k]) !== 0).map((k) => <span key={k}>{limitText(limits[k])} {(LIMIT_LABEL[k] || k).toLowerCase()}{k === "apps" && Number(limits.apps_lifetime) > 0 ? " au total" : ""}</span>)}
          {Number(limits.builds_per_app_month) > 0 && <span>{limits.builds_per_app_month} constructions par application et par mois</span>}
          {Number(limits.app_trial_days) > 0 && <span>essai de {limits.app_trial_days} j par application</span>}
        </div>
        {!compact && <ul className="po-feats">{feats.map((f) => <li key={f}><Icon name="check" size={11} />{f}</li>)}</ul>}
        <div className="row">
          <Tag tone={p.active ? "ok" : ""}>{p.active ? "Proposée" : "Retirée"}</Tag>
          <span className="grow" />
          <button className="btn sm" disabled={!editable} title={editable ? undefined : "Applique d’abord la migration des offres"} onClick={() => setOpen(!open)}>
            <Icon name={open ? "close" : "pencil"} size={12} /> {open ? "Fermer" : "Modifier"}
          </button>
        </div>
      </div>
      {open && (
        <form className="po-edit form" onSubmit={save}>
          <div className="grid2">
            <label className="field"><span>Nom</span><input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
            <label className="field"><span>Ruban</span><input className="input" value={p.badge || ""} placeholder="Le plus choisi" onChange={(e) => setP({ ...p, badge: e.target.value })} /></label>
          </div>
          <label className="field"><span>Description</span><input className="input" value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} /></label>
          <div className="grid2">
            <label className="field"><span>Prix mensuel (centimes)</span><input className="input" type="number" min={0} value={p.price_month_cents} onChange={(e) => setP({ ...p, price_month_cents: Number(e.target.value) })} /><small>{price(p.price_month_cents, p.currency)} / mois</small></label>
            <label className="field"><span>Prix annuel (centimes)</span><input className="input" type="number" min={0} value={p.price_year_cents} onChange={(e) => setP({ ...p, price_year_cents: Number(e.target.value) })} /><small>{price(p.price_year_cents, p.currency)} / an</small></label>
          </div>
          <div className="grid2">
            <label className="field"><span>Devise</span><input className="input" value={p.currency} maxLength={3} onChange={(e) => setP({ ...p, currency: e.target.value.toUpperCase() })} /></label>
            <label className="field"><span>Ordre</span><input className="input" type="number" value={p.sort} onChange={(e) => setP({ ...p, sort: Number(e.target.value) })} /></label>
          </div>
          <label className="check">Proposée aux clients <Switch checked={p.active} onChange={(v) => setP({ ...p, active: v })} label="Offre proposée" /></label>
          <div className="field">
            <span>Limites</span>
            <div className="limits">
              {keys.map((k) => (
                <label key={k} className="field">
                  <small>{LIMIT_LABEL[k] || k}</small>
                  <div className="row">
                    <input className="input sm grow" type="number" min={-1} value={limits[k]} onChange={(e) => setLimits({ ...limits, [k]: Number(e.target.value) })} />
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
          <div className="field">
            <span>Fonctions incluses</span>
            <div className="po-perms">
              {[...PERM_GROUPS, ["Autres", EXTRA_PERMS] as [string, [string, string][]]].map(([group, rows]) => (
                <div key={group} className="po-perm-group">
                  <small>{group}</small>
                  {rows.map(([k, label]) => (
                    <label key={k} className="po-perm"><span className="grow">{label}</span><Switch checked={!!perms[k]} onChange={(v) => setPerms({ ...perms, [k]: v })} label={label} /></label>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <label className="field"><span>Avantages affichés (un par ligne)</span><textarea className="input" rows={5} value={features} onChange={(e) => setFeatures(e.target.value)} /></label>
          <div className="actions">
            {dirty && <small className="muted grow">Modifications non enregistrées</small>}
            <button className="btn primary" disabled={act.busy || !dirty}>Enregistrer</button>
          </div>
        </form>
      )}
    </article>
  )
}

/** Tableau comparatif (mêmes lignes que dans l'application). */
function Compare({ plans }: { plans: Plan[] }) {
  const cell = (row: CompareRow, p: Plan) => {
    const id = p.id === "team" || p.id === "enterprise" ? "pro" : p.id
    if (row.text) return row.text[id] || "—"
    if (row.perm) return (p.perms as Perms | undefined)?.[row.perm] ? <span className="po-yes"><Icon name="check" size={11} /></span> : <span className="muted">—</span>
    const v = (p.limits as Limits)[row.limit as string]
    return Number(v) === 0 ? <span className="muted">—</span> : limitText(v, row.unit)
  }
  return (
    <section className="card">
      <div className="card-head"><Icon name="layers" size={16} /><h3 className="grow">Comparer les offres</h3></div>
      <div className="po-table-wrap">
        <table className="po-table">
          <thead><tr><th />{plans.map((p) => <th key={p.id} className={p.id === "pro" ? "hl" : ""}>{p.name}<small>{p.price_month_cents ? `${price(p.price_month_cents, p.currency)} / mois` : "Gratuit"}</small></th>)}</tr></thead>
          <tbody>
            {COMPARE.map(([group, rows]) => [
              <tr key={group} className="po-grp"><th colSpan={plans.length + 1}>{group}</th></tr>,
              ...rows.map((r) => <tr key={`${group}-${r.label}`}><th>{r.label}</th>{plans.map((p) => <td key={p.id} className={p.id === "pro" ? "hl" : ""}>{cell(r, p)}</td>)}</tr>),
            ])}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** Applications des comptes (nx_app_trials) ; NEXORA #087 : offre Gratuite à 2 applications au total, Android ou
 * Windows, applications supprimées comprises (elles restent comptées). Prolongation : seulement l'ancienne offre à essai. */
function Trials({ rows, onChanged }: { rows: Trial[] | null; onChanged: () => void }) {
  const act = useAction()
  const now = Date.now()
  return (
    <section className="card">
      <div className="card-head"><Icon name="clock" size={16} /><h3 className="grow">Applications des comptes</h3><small className="muted">offre Gratuite : 2 applications au total par compte, Android ou Windows, supprimées comprises ; 5 constructions par application et par mois</small></div>
      {rows === null ? <p className="muted small">La table <code>nx_app_trials</code> arrive avec la migration des offres.</p>
        : !rows.length ? <p className="muted small">Aucune application enregistrée pour l’instant.</p> : (
          <div className="po-trials">
            {rows.map((t) => {
              const ends = t.trial_ends_at ? new Date(t.trial_ends_at).getTime() : null
              const status = t.deleted_at ? ["Supprimée · comptée", ""] : ends == null ? ["Active", "ok"] : ends > now ? [`Essai · encore ${Math.ceil((ends - now) / 86400000)} j`, "info"] : ["Essai terminé", "bad"]
              return (
                <div key={t.id} className="po-trial">
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b>{t.name || "Application"}</b>
                    <small className="muted">{t.profiles?.full_name || t.profiles?.email || t.user_id} · {t.platform === "windows" ? "Windows" : "Android"} · {t.source_kind === "url" ? t.source_url || "adresse web" : "dossier ou code"} · créée le {fmtDate(t.created_at)} en offre {t.plan_at_creation}</small>
                  </div>
                  <Tag tone={status[1]}>{status[0]}</Tag>
                  {ends != null && !t.deleted_at && (
                    <button className="btn sm" disabled={act.busy} onClick={async () => { if (await act.run(async () => must(await sb.rpc("nx_app_trial_extend", { p_id: t.id, p_days: 7 })), "Essai prolongé de 7 jours.")) onChanged() }}>Prolonger de 7 jours</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
    </section>
  )
}

function NewPlan({ sort, onClose, onDone }: { sort: number; onClose: () => void; onDone: () => void }) {
  const act = useAction()
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    const ok = await act.run(async () => must(await sb.from("plans").insert({
      id: f.id, name: f.name, description: f.description, price_month_cents: Number(f.price) || 0, price_year_cents: (Number(f.price) || 0) * 10,
      currency: "USD", sort, active: false, limits: { ...FALLBACK.pro.limits }, perms: { ...FALLBACK.free.perms }, features: [],
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
        <label className="field"><span>Prix mensuel (centimes de dollar)</span><input className="input" type="number" min={0} name="price" defaultValue={0} /><small>Le prix annuel proposé vaut 10 mois ; limites de Standard et fonctions du Gratuit au départ, modifiables ensuite.</small></label>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" disabled={act.busy}>Créer</button>
        </div>
      </form>
    </Modal>
  )
}
