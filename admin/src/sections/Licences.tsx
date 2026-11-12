// NEXORA #076 : licences de NEXORA Devs Toolbox (migration 20261108000002_licences_offres.sql).
// Licences par compte (révocation), appareils (adresse IP, comptes liés, blocage), journal des contrôles de licence
// (refus compris), sessions et journaux envoyés par le logiciel. Lecture réservée aux administrateurs (RLS) ;
// seules les colonnes status (licence) et blocked (appareil) sont modifiables, et le journal d'audit les garde.
// NEXORA #077 : l'administration donne et configure les licences (offre imposée avec ou sans date de fin, essai,
// ordinateurs, note, nouvelle clé, ordinateur retiré : fonctions nx_admin_*) et règle les politiques (comptes par
// ordinateur, essai, intervalle des contrôles, versions autorisées), avec l'état du service de sécurité.
import { useEffect, useState, type FormEvent } from "react"
import { go, useRefresh } from "../App"
import { Icon } from "../icons"
import { must, sb } from "../supabase"
import { downloadCsv, Drawer, fmtAgo, fmtDate, fmtDateTime, fmtNum, JsonView, Kpi, Loaded, Modal, plural, SearchBox, Seg, Switch, Table, Tag, useAction, useLoad, useUi, UserCell } from "../ui"

type Profile = { id: string; full_name: string | null; email: string | null; avatar_url: string | null }
type Licence = {
  id: string; key: string; user_id: string; status: string; source: string; trial_ends_at: string | null; created_at: string; activated_at: string | null; last_check_at: string | null
  plan_override?: string | null; override_until?: string | null; max_devices?: number | null; note?: string; granted_at?: string | null
}
type LicensePolicy = { free_accounts_per_device: number; gmail_per_device: number; trial_hours: number; free_devices: number; pro_devices: number; check_minutes: number }
type ReleasePolicy = { min_version: string; min_manifest_version: number; block_outdated: boolean; channel: string }
const POLICY_DEFAULT: LicensePolicy = { free_accounts_per_device: 3, gmail_per_device: 3, trial_hours: 24, free_devices: 3, pro_devices: 5, check_minutes: 10 }
const RELEASE_DEFAULT: ReleasePolicy = { min_version: "1.2.0", min_manifest_version: 0, block_outdated: true, channel: "stable" }
type Device = { id: string; device_hash: string; name: string; os: string; app_version: string; first_ip: string | null; last_ip: string | null; blocked: boolean; first_seen: string; last_seen: string }
type Account = { device_id: string; user_id: string; email: string; is_gmail: boolean; last_ip: string | null; last_seen: string }
type Check = { id: number; user_id: string | null; device_id: string | null; ok: boolean; reason: string; plan: string; ip: string | null; app_version: string; created_at: string }
type Session = { id: string; user_id: string; device_id: string | null; ip: string | null; app_version: string; started_at: string; last_seen: string; ended_at: string | null }
type Log = { id: number; session_id: string | null; user_id: string | null; level: string; event: string; detail: unknown; ip: string | null; created_at: string }

type Tab = "licences" | "devices" | "checks" | "sessions" | "settings"

const REASON: Record<string, string> = {
  "": "Accepté",
  auth: "Sans connexion",
  device_accounts: "Trop de comptes sur le PC",
  device_gmail: "Trop d’adresses Gmail",
  key_mismatch: "Clé d’un autre compte",
  revoked: "Licence révoquée",
  device_blocked: "PC bloqué",
  device_limit: "Trop d’ordinateurs",
  integrity: "Installation modifiée",
  outdated: "Version non autorisée",
  modified: "Fichier modifié (lanceur)",
  manifest: "Manifeste refusé (lanceur)",
  server: "Service indisponible (lanceur)",
}
const grantedOn = (l: Licence) => Boolean(l.plan_override && (!l.override_until || new Date(l.override_until).getTime() > Date.now()))
function offerOf(l: Licence) {
  if (grantedOn(l)) return `${l.plan_override === "pro" ? "Pro" : "Gratuit"} attribué${l.override_until ? ` jusqu’au ${fmtDate(l.override_until)}` : ", sans fin"}`
  return "Selon l’abonnement"
}

async function profilesOf(ids: (string | null)[]): Promise<Map<string, Profile>> {
  const list = [...new Set(ids.filter(Boolean))] as string[]
  if (!list.length) return new Map()
  const rows = must(await sb.from("profiles").select("id, full_name, email, avatar_url").in("id", list.slice(0, 300))) as Profile[]
  return new Map(rows.map((p) => [p.id, p]))
}

const trialOn = (l: Licence) => Boolean(l.trial_ends_at && new Date(l.trial_ends_at).getTime() > Date.now())

export function Licences({ param }: { param?: string }) {
  const refresh = useRefresh()
  const [tab, setTab] = useState<Tab>(param === "appareils" ? "devices" : param === "controles" ? "checks" : param === "sessions" ? "sessions" : param === "reglages" ? "settings" : "licences")
  const [q, setQ] = useState("")
  return (
    <>
      <div className="toolbar">
        <Seg value={tab} onChange={setTab} options={[["licences", "Licences"], ["devices", "Appareils"], ["checks", "Contrôles"], ["sessions", "Sessions et journaux"], ["settings", "Réglages et sécurité"]]} />
        <span className="grow" />
        {tab !== "sessions" && tab !== "settings" && <SearchBox value={q} onSearch={setQ} placeholder={tab === "devices" ? "Appareil, IP ou e-mail…" : "Clé, e-mail ou IP…"} />}
      </div>
      {tab === "licences" && <LicencesTab q={q} refresh={refresh} />}
      {tab === "devices" && <DevicesTab q={q} refresh={refresh} />}
      {tab === "checks" && <ChecksTab q={q} refresh={refresh} />}
      {tab === "sessions" && <SessionsTab refresh={refresh} />}
      {tab === "settings" && <SettingsTab refresh={refresh} />}
    </>
  )
}

function LicencesTab({ q, refresh }: { q: string; refresh: number }) {
  const ui = useUi()
  const act = useAction()
  const [granting, setGranting] = useState(false)
  const [managed, setManaged] = useState<Licence | null>(null)
  const data = useLoad(async () => {
    const [lic, checks] = await Promise.all([
      sb.from("nx_licenses").select("*").order("created_at", { ascending: false }).limit(500),
      sb.from("nx_license_checks").select("ok", { count: "exact", head: false }).eq("ok", false).gte("created_at", new Date(Date.now() - 86400000).toISOString()).limit(1),
    ])
    const rows = must(lic) as Licence[]
    return { rows, people: await profilesOf(rows.map((r) => r.user_id)), refused: checks.count || 0 }
  }, [refresh])

  async function toggle(l: Licence, p?: Profile) {
    const revoke = l.status === "active"
    const ok = await ui.confirm({
      title: revoke ? "Révoquer cette licence ?" : "Réactiver cette licence ?",
      body: revoke
        ? `${p?.email || "Ce compte"} ne pourra plus ouvrir NEXORA Devs Toolbox : le logiciel se verrouille au prochain contrôle (10 minutes au plus).`
        : `${p?.email || "Ce compte"} pourra de nouveau ouvrir NEXORA Devs Toolbox.`,
      confirm: revoke ? "Révoquer" : "Réactiver",
      danger: revoke,
    })
    if (!ok) return
    if (await act.run(async () => must(await sb.from("nx_licenses").update({ status: revoke ? "revoked" : "active" }).eq("id", l.id).select("id")), revoke ? "Licence révoquée." : "Licence réactivée.")) data.reload()
  }

  return (
    <Loaded q={data}>
      {({ rows, people, refused }) => {
        const s = q.toLowerCase()
        const shown = s ? rows.filter((l) => l.key.toLowerCase().includes(s) || (people.get(l.user_id)?.email || "").toLowerCase().includes(s)) : rows
        return (
          <>
            <div className="kpis">
              <Kpi icon="key" label="Licences" value={fmtNum(rows.length)} hint={`${fmtNum(rows.filter((l) => l.activated_at).length)} activée(s) dans le logiciel`} />
              <Kpi icon="pass" label="Actives" value={fmtNum(rows.filter((l) => l.status === "active").length)} />
              <Kpi icon="clock" label="Essais en cours" value={fmtNum(rows.filter(trialOn).length)} hint="Premier jour : Pro complet" />
              <Kpi icon="lock" label="Refus (24 h)" value={fmtNum(refused)} tone={refused ? "warn" : undefined} />
            </div>
            <div className="toolbar">
              <span className="muted small">{plural(shown.length, "licence")} · {plural(rows.filter(grantedOn).length, "licence attribuée", "licences attribuées")}</span>
              <span className="grow" />
              <button className="btn primary" onClick={() => setGranting(true)}>
                <Icon name="plus" size={14} /> Attribuer une licence
              </button>
              <button className="btn" disabled={!shown.length} onClick={() => downloadCsv("licences", shown.map((l) => ({ ...l, email: people.get(l.user_id)?.email || "" })))}>
                <Icon name="download" size={14} /> Exporter
              </button>
            </div>
            <Table head={["Utilisateur", "Clé", "Statut", "Offre", "Essai", ""]} count={shown.length} empty="Aucune licence.">
              {shown.map((l) => {
                const p = people.get(l.user_id)
                return (
                  <tr key={l.id}>
                    <td className="click" onClick={() => go("users", l.user_id)}><UserCell p={p} /></td>
                    <td><code className="nowrap">{l.key}</code></td>
                    <td className="nowrap">{l.status === "active" ? <Tag tone="ok">Active</Tag> : <Tag tone="bad">Révoquée</Tag>}<div className="muted small">{l.last_check_at ? `contrôle ${fmtAgo(l.last_check_at)}` : "jamais utilisée"}</div></td>
                    <td className="nowrap">{grantedOn(l) ? <Tag tone={l.plan_override === "pro" ? "info" : "warn"}>{offerOf(l)}</Tag> : <span className="muted small">{offerOf(l)}</span>}{l.note ? <div className="muted small ellipsis" style={{ maxWidth: 220 }}>{l.note}</div> : null}</td>
                    <td className="nowrap">{trialOn(l) ? <Tag tone="info">Jusqu’au {fmtDateTime(l.trial_ends_at)}</Tag> : l.trial_ends_at ? <span className="muted">Terminé</span> : "—"}</td>
                    <td className="nowrap">
                      <button className="btn sm" onClick={() => setManaged(l)}>Gérer</button>{" "}
                      <button className={`btn sm${l.status === "active" ? " danger" : ""}`} disabled={act.busy} onClick={() => toggle(l, p)}>
                        {l.status === "active" ? "Révoquer" : "Réactiver"}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </Table>
            {granting && <GrantModal onClose={() => setGranting(false)} onDone={() => { setGranting(false); data.reload() }} />}
            {managed && <ManageDrawer lic={managed} person={people.get(managed.user_id)} onClose={() => setManaged(null)} onChanged={(l) => { if (l) setManaged(l); data.reload() }} />}
          </>
        )
      }}
    </Loaded>
  )
}

const DURATIONS: [string, string][] = [["30", "30 jours"], ["90", "3 mois"], ["365", "1 an"], ["0", "Sans date de fin"], ["custom", "Autre durée…"]]

function GrantModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const act = useAction()
  const [plan, setPlan] = useState<"pro" | "free" | "auto">("pro")
  const [dur, setDur] = useState("30")
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    const days = plan === "auto" ? null : dur === "custom" ? Number(f.days) || 0 : Number(dur)
    const ok = await act.run(async () => must(await sb.rpc("nx_admin_license_grant", {
      p_email: f.email.trim(), p_plan: plan, p_days: days || null, p_note: f.note || "", p_max_devices: f.max ? Number(f.max) : null,
    })), plan === "auto" ? "Licence remise sur l’abonnement." : "Licence attribuée : NEXORA l’applique au prochain contrôle (10 minutes au plus).")
    if (ok) onDone()
  }
  return (
    <Modal title="Attribuer une licence" onClose={onClose} width={560}>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>Adresse e-mail du compte NEXORA</span><input className="input" name="email" type="email" required placeholder="prenom@exemple.com" autoFocus /><small>Le compte doit exister (inscription dans NEXORA ou sur le site, page « Ma licence »). Sa clé est créée si besoin.</small></label>
        <div className="field"><span>Offre</span><Seg value={plan} onChange={setPlan} options={[["pro", "Pro offert"], ["free", "Gratuit imposé"], ["auto", "Automatique (abonnement)"]]} /><small>{plan === "pro" ? "Tout NEXORA, sans paiement." : plan === "free" ? "Offre Gratuite même avec un abonnement payé (suspension)." : "Retirez l’offre attribuée : l’abonnement et l’essai s’appliquent."}</small></div>
        {plan !== "auto" && (
          <div className="grid2">
            <label className="field"><span>Durée</span><select className="input" value={dur} onChange={(e) => setDur(e.target.value)}>{DURATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            {dur === "custom" ? <label className="field"><span>Nombre de jours</span><input className="input" name="days" type="number" min={1} max={3650} defaultValue={14} required /></label> : <span />}
          </div>
        )}
        <label className="field"><span>Ordinateurs au plus</span><input className="input" name="max" type="number" min={1} max={100} placeholder="Selon les réglages" /><small>Vide : la règle générale (onglet « Réglages et sécurité »).</small></label>
        <label className="field"><span>Note (visible ici seulement)</span><input className="input" name="note" maxLength={500} placeholder="Partenariat, bourse, support…" /></label>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" disabled={act.busy}>{plan === "auto" ? "Appliquer" : "Attribuer"}</button>
        </div>
      </form>
    </Modal>
  )
}

const toLocal = (iso?: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "")
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : "")

function ManageDrawer({ lic, person, onClose, onChanged }: { lic: Licence; person?: Profile; onClose: () => void; onChanged: (l?: Licence) => void }) {
  const ui = useUi()
  const act = useAction()
  const [plan, setPlan] = useState(lic.plan_override || "auto")
  const [until, setUntil] = useState(toLocal(lic.override_until))
  const [trial, setTrial] = useState(toLocal(lic.trial_ends_at))
  const [max, setMax] = useState(lic.max_devices ? String(lic.max_devices) : "")
  const [note, setNote] = useState(lic.note || "")
  const devices = useLoad(async () => {
    const acc = must(await sb.from("nx_device_accounts").select("device_id, email, last_ip, last_seen, released").eq("user_id", lic.user_id).order("last_seen", { ascending: false })) as (Account & { released?: boolean })[]
    const devs = acc.length ? (must(await sb.from("nx_devices").select("id, name, os, app_version, blocked").in("id", acc.map((a) => a.device_id))) as Device[]) : []
    return acc.map((a) => ({ ...a, device: devs.find((d) => d.id === a.device_id) }))
  }, [lic.id])
  async function save() {
    const patch = { plan_override: plan === "auto" ? "" : plan, override_until: plan === "auto" ? "" : fromLocal(until), trial_ends_at: fromLocal(trial), max_devices: max, note }
    const ok = await act.run(async () => {
      const r = must(await sb.rpc("nx_admin_license_update", { p_id: lic.id, p_patch: patch })) as unknown as Licence
      onChanged(r)
    }, "Licence enregistrée : appliquée au prochain contrôle du logiciel.")
    void ok
  }
  async function rekey() {
    if (!(await ui.confirm({ title: "Créer une nouvelle clé ?", body: "L’ancienne clé est aussitôt refusée. La licence reste liée au même compte ; la nouvelle clé s’affiche sur la page « Ma licence » du site.", confirm: "Nouvelle clé", danger: true }))) return
    await act.run(async () => { const k = must(await sb.rpc("nx_admin_license_rekey", { p_id: lic.id })) as unknown as string; onChanged({ ...lic, key: k }) }, "Nouvelle clé créée.")
  }
  async function unlink(deviceId: string, name: string) {
    if (!(await ui.confirm({ title: `Retirer « ${name} » de cette licence ?`, body: "Le compte devra repasser le contrôle sur cet ordinateur ; la limite des comptes gratuits de l’ordinateur est remise à zéro pour ce compte.", confirm: "Retirer" }))) return
    if (await act.run(async () => must(await sb.rpc("nx_admin_device_unlink", { p_device: deviceId, p_user: lic.user_id })), "Ordinateur retiré.")) devices.reload()
  }
  return (
    <Drawer title={person?.email || "Licence"} sub={<code>{lic.key}</code>} onClose={onClose}
      actions={<button className="btn sm" disabled={act.busy} onClick={rekey}><Icon name="key" size={13} /> Nouvelle clé</button>}>
      <div className="form">
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {lic.status === "active" ? <Tag tone="ok">Active</Tag> : <Tag tone="bad">Révoquée</Tag>}
          <Tag>{offerOf(lic)}</Tag>
          {lic.granted_at && <span className="muted small">Modifiée le {fmtDateTime(lic.granted_at)}</span>}
        </div>
        <div className="field"><span>Offre attribuée</span><Seg value={plan} onChange={setPlan} options={[["pro", "Pro offert"], ["free", "Gratuit imposé"], ["auto", "Automatique"]]} /></div>
        {plan !== "auto" && <label className="field"><span>Jusqu’au</span><input className="input" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} /><small>Vide : sans date de fin.</small></label>}
        <label className="field"><span>Fin de l’essai complet</span><input className="input" type="datetime-local" value={trial} onChange={(e) => setTrial(e.target.value)} /><small>Avancez ou prolongez l’essai Pro (premier jour par défaut).</small></label>
        <label className="field"><span>Ordinateurs au plus</span><input className="input" type="number" min={1} max={100} value={max} onChange={(e) => setMax(e.target.value)} placeholder="Selon les réglages" /></label>
        <label className="field"><span>Note</span><textarea className="input" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="actions"><button className="btn primary" disabled={act.busy} onClick={save}>Enregistrer</button></div>
        <h3 className="section-title">Ordinateurs de cette licence</h3>
        <Loaded q={devices}>
          {(rows) => rows.length ? (
            <Table head={["Ordinateur", "Adresse IP", "Vu", ""]} count={rows.length}>
              {rows.map((r) => (
                <tr key={r.device_id}>
                  <td><b>{r.device?.name || "PC"}</b><div className="muted small">{r.device?.os} {r.released ? "· libéré par l’utilisateur" : ""}{r.device?.blocked ? " · bloqué" : ""}</div></td>
                  <td><code>{r.last_ip || "—"}</code></td>
                  <td className="nowrap">{fmtAgo(r.last_seen)}</td>
                  <td><button className="btn sm" disabled={act.busy} onClick={() => unlink(r.device_id, r.device?.name || "PC")}>Retirer</button></td>
                </tr>
              ))}
            </Table>
          ) : <p className="muted small">Aucun ordinateur : la licence n’a pas encore été utilisée dans NEXORA.</p>}
        </Loaded>
      </div>
    </Drawer>
  )
}

function SettingsTab({ refresh }: { refresh: number }) {
  const act = useAction()
  const data = useLoad(async () => {
    const rows = must(await sb.from("app_config").select("key, value").in("key", ["license_policy", "release_policy"])) as { key: string; value: unknown }[]
    const get = <T,>(k: string, d: T) => ({ ...d, ...((rows.find((r) => r.key === k)?.value as Partial<T>) || {}) })
    return { lic: get<LicensePolicy>("license_policy", POLICY_DEFAULT), rel: get<ReleasePolicy>("release_policy", RELEASE_DEFAULT) }
  }, [refresh])
  const [service, setService] = useState<{ state: "wait" | "ok" | "off"; text: string; latest?: string }>({ state: "wait", text: "Lecture du service de sécurité…" })
  useEffect(() => {
    let on = true
    fetch("/security/manifest", { headers: { accept: "application/json" } })
      .then(async (r) => {
        const j = await r.json().catch(() => null)
        if (!on) return
        if (r.status === 503) setService({ state: "off", text: "Service de sécurité sans clé de signature : NEXORA reste verrouillé tant que NX_LICENSE_SIGNING_KEY n’est pas posée sur Cloudflare." })
        else if (!r.ok || !j || !j.payload) setService({ state: "off", text: "Service de sécurité injoignable depuis cette page (aperçu ou Worker non publié)." })
        else {
          const d = JSON.parse(j.payload)
          setService(d.latest ? { state: "ok", text: `Publication autorisée : NEXORA ${d.latest.version} (manifeste n° ${d.latest.manifest_version}), déclaration signée valable jusqu’au ${fmtDateTime(d.expires_at)}.`, latest: d.latest.version }
            : { state: "off", text: `Aucune publication autorisée (${d.status === "no_release" ? "aucune version publiée sur le dépôt officiel" : d.status === "signature" ? "manifeste du dépôt mal signé" : d.status}).` })
        }
      })
      .catch(() => on && setService({ state: "off", text: "Service de sécurité injoignable depuis cette page (aperçu ou Worker non publié)." }))
    return () => { on = false }
  }, [refresh])
  return (
    <Loaded q={data}>
      {({ lic, rel }) => <SettingsForms lic={lic} rel={rel} service={service} busy={act.busy} save={(k, v, msg) => act.run(async () => must(await sb.rpc("nx_admin_policy_set", { p_key: k, p_value: v })), msg).then((ok) => { if (ok) data.reload() })} />}
    </Loaded>
  )
}

function SettingsForms({ lic, rel, service, busy, save }: {
  lic: LicensePolicy; rel: ReleasePolicy; service: { state: string; text: string }; busy: boolean
  save: (k: string, v: unknown, msg: string) => void
}) {
  const [l, setL] = useState(lic)
  const [r, setR] = useState(rel)
  const num = (k: keyof LicensePolicy) => (e: { target: { value: string } }) => setL({ ...l, [k]: Number(e.target.value) })
  return (
    <div className="stack">
      <section className="card">
        <div className="card-head"><Icon name="shield" size={16} /><h3 className="grow">Service de sécurité</h3>{service.state === "ok" ? <Tag tone="ok">Opérationnel</Tag> : service.state === "wait" ? <Tag>…</Tag> : <Tag tone="warn">À configurer</Tag>}</div>
        <p className="muted small" style={{ margin: 0 }}>{service.text}</p>
        <p className="muted small">À chaque ouverture, NEXORA Devs Toolbox lit cette déclaration signée, vérifie le manifeste du dépôt officiel et l’empreinte de chaque fichier ; NEXORA refait le contrôle et la licence est validée par le serveur. Refus : « Connexion perdue » (réseau), « Échec du contrôle d’intégrité — Installation non authentifiée » (fichiers), « Version non autorisée ».</p>
      </section>
      <section className="card">
        <div className="card-head"><Icon name="key" size={16} /><h3 className="grow">Licences</h3></div>
        <div className="grid2">
          <label className="field"><span>Comptes gratuits par ordinateur</span><input className="input" type="number" min={1} max={50} value={l.free_accounts_per_device} onChange={num("free_accounts_per_device")} /></label>
          <label className="field"><span>Adresses Gmail par ordinateur (offre Gratuite)</span><input className="input" type="number" min={1} max={50} value={l.gmail_per_device} onChange={num("gmail_per_device")} /><small>Alias (points, +étiquette) comptés comme une seule adresse.</small></label>
          <label className="field"><span>Essai complet (heures)</span><input className="input" type="number" min={0} max={2160} value={l.trial_hours} onChange={num("trial_hours")} /><small>Une fois par compte et par ordinateur ; 0 : aucun essai.</small></label>
          <label className="field"><span>Contrôle de licence toutes les (minutes)</span><input className="input" type="number" min={2} max={120} value={l.check_minutes} onChange={num("check_minutes")} /></label>
          <label className="field"><span>Ordinateurs par licence Gratuite</span><input className="input" type="number" min={1} max={100} value={l.free_devices} onChange={num("free_devices")} /></label>
          <label className="field"><span>Ordinateurs par licence Pro</span><input className="input" type="number" min={1} max={100} value={l.pro_devices} onChange={num("pro_devices")} /></label>
        </div>
        <div className="actions"><button className="btn primary" disabled={busy} onClick={() => save("license_policy", l, "Réglages des licences enregistrés : appliqués au prochain contrôle.")}>Enregistrer</button></div>
      </section>
      <section className="card">
        <div className="card-head"><Icon name="download" size={16} /><h3 className="grow">Versions autorisées</h3></div>
        <div className="grid2">
          <label className="field"><span>Version minimale de NEXORA</span><input className="input" value={r.min_version} onChange={(e) => setR({ ...r, min_version: e.target.value.trim() })} placeholder="1.2.0" /><small>Plus ancienne : ouverture refusée, mise à jour par le lanceur.</small></label>
          <label className="field"><span>Numéro de manifeste minimal</span><input className="input" type="number" min={0} value={r.min_manifest_version} onChange={(e) => setR({ ...r, min_manifest_version: Number(e.target.value) })} /><small>Refusez les publications plus anciennes (retours en arrière). 0 : aucun minimum.</small></label>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Switch checked={r.block_outdated} onChange={(v: boolean) => setR({ ...r, block_outdated: v })} label="Refuser les versions obsolètes" />
          <span>Refuser les versions obsolètes</span>
        </div>
        <div className="actions"><button className="btn primary" disabled={busy} onClick={() => save("release_policy", r, "Versions autorisées enregistrées.")}>Enregistrer</button></div>
      </section>
    </div>
  )
}

function DevicesTab({ q, refresh }: { q: string; refresh: number }) {
  const ui = useUi()
  const act = useAction()
  const data = useLoad(async () => {
    const devices = must(await sb.from("nx_devices").select("*").order("last_seen", { ascending: false }).limit(500)) as Device[]
    const accounts = devices.length ? (must(await sb.from("nx_device_accounts").select("device_id, user_id, email, is_gmail, last_ip, last_seen").in("device_id", devices.map((d) => d.id).slice(0, 500))) as Account[]) : []
    const by = new Map<string, Account[]>()
    for (const a of accounts) by.set(a.device_id, [...(by.get(a.device_id) || []), a])
    return { devices, by }
  }, [refresh])

  async function toggle(d: Device) {
    const block = !d.blocked
    const ok = await ui.confirm({
      title: block ? `Bloquer « ${d.name || "ce PC"} » ?` : `Débloquer « ${d.name || "ce PC"} » ?`,
      body: block ? "Aucun compte ne pourra plus ouvrir NEXORA Devs Toolbox sur ce PC, même avec une offre payée." : "Les comptes liés à ce PC pourront de nouveau ouvrir NEXORA Devs Toolbox.",
      confirm: block ? "Bloquer" : "Débloquer",
      danger: block,
    })
    if (!ok) return
    if (await act.run(async () => must(await sb.from("nx_devices").update({ blocked: block }).eq("id", d.id).select("id")), block ? "Appareil bloqué." : "Appareil débloqué.")) data.reload()
  }

  return (
    <Loaded q={data}>
      {({ devices, by }) => {
        const s = q.toLowerCase()
        const shown = s
          ? devices.filter((d) => [d.name, d.os, d.last_ip, d.first_ip, ...(by.get(d.id) || []).map((a) => a.email)].some((v) => String(v || "").toLowerCase().includes(s)))
          : devices
        const full = devices.filter((d) => (by.get(d.id) || []).length >= 3).length
        return (
          <>
            <div className="kpis">
              <Kpi icon="laptop" label="Appareils" value={fmtNum(devices.length)} hint={`${fmtNum(devices.filter((d) => Date.now() - new Date(d.last_seen).getTime() < 7 * 86400000).length)} vus cette semaine`} />
              <Kpi icon="group" label="PC à 3 comptes" value={fmtNum(full)} hint="Limite des comptes gratuits atteinte" tone={full ? "warn" : undefined} />
              <Kpi icon="lock" label="Bloqués" value={fmtNum(devices.filter((d) => d.blocked).length)} />
            </div>
            <Table head={["Appareil", "Comptes", "Version", "Adresse IP", "Vu", "Premier accès", ""]} count={shown.length} empty="Aucun appareil.">
              {shown.map((d) => {
                const acc = by.get(d.id) || []
                return (
                  <tr key={d.id}>
                    <td><b>{d.name || "PC"}</b><div className="muted small">{d.os}</div></td>
                    <td>
                      {acc.length ? acc.map((a) => (
                        <div key={a.user_id} className="small nowrap"><button className="link" onClick={() => go("users", a.user_id)}>{a.email || a.user_id.slice(0, 8)}</button>{a.is_gmail ? <span className="muted"> · Gmail</span> : null}</div>
                      )) : "—"}
                    </td>
                    <td>{d.app_version || "—"}</td>
                    <td className="nowrap"><code>{d.last_ip || "—"}</code>{d.first_ip && d.first_ip !== d.last_ip ? <div className="muted small">1re : {d.first_ip}</div> : null}</td>
                    <td className="nowrap">{fmtAgo(d.last_seen)}</td>
                    <td className="nowrap">{fmtDate(d.first_seen)}</td>
                    <td className="nowrap">
                      {d.blocked && <Tag tone="bad">Bloqué</Tag>}{" "}
                      <button className={`btn sm${d.blocked ? "" : " danger"}`} disabled={act.busy} onClick={() => toggle(d)}>{d.blocked ? "Débloquer" : "Bloquer"}</button>
                    </td>
                  </tr>
                )
              })}
            </Table>
          </>
        )
      }}
    </Loaded>
  )
}

function ChecksTab({ q, refresh }: { q: string; refresh: number }) {
  const [only, setOnly] = useState<"all" | "refused">("all")
  const data = useLoad(async () => {
    let r = sb.from("nx_license_checks").select("*").order("created_at", { ascending: false }).limit(400)
    if (only === "refused") r = r.eq("ok", false)
    const rows = must(await r) as Check[]
    return { rows, people: await profilesOf(rows.map((c) => c.user_id)) }
  }, [refresh, only])
  return (
    <>
      <div className="toolbar"><Seg value={only} onChange={setOnly} options={[["all", "Tous les contrôles"], ["refused", "Refus seulement"]]} /></div>
      <Loaded q={data}>
        {({ rows, people }) => {
          const s = q.toLowerCase()
          const shown = s ? rows.filter((c) => (c.ip || "").includes(s) || (people.get(c.user_id || "")?.email || "").toLowerCase().includes(s)) : rows
          return (
            <Table head={["Date", "Utilisateur", "Résultat", "Offre", "Adresse IP", "Version"]} count={shown.length} empty="Aucun contrôle de licence.">
              {shown.map((c) => (
                <tr key={c.id}>
                  <td className="nowrap">{fmtDateTime(c.created_at)}</td>
                  <td>{c.user_id ? <UserCell p={people.get(c.user_id)} /> : <span className="muted">Sans compte</span>}</td>
                  <td>{c.ok ? <Tag tone="ok">Accepté</Tag> : <Tag tone="bad">{REASON[c.reason] || c.reason || "Refusé"}</Tag>}</td>
                  <td>{c.plan === "pro" ? "Pro" : c.plan === "free" ? "Gratuit" : c.plan || "—"}</td>
                  <td><code>{c.ip || "—"}</code></td>
                  <td>{c.app_version || "—"}</td>
                </tr>
              ))}
            </Table>
          )
        }}
      </Loaded>
    </>
  )
}

function SessionsTab({ refresh }: { refresh: number }) {
  const [open, setOpen] = useState<string | null>(null)
  const data = useLoad(async () => {
    const sessions = must(await sb.from("nx_sessions").select("*").order("started_at", { ascending: false }).limit(200)) as Session[]
    return { sessions, people: await profilesOf(sessions.map((s) => s.user_id)) }
  }, [refresh])
  const logs = useLoad(async () => {
    let r = sb.from("nx_client_logs").select("*").order("created_at", { ascending: false }).limit(300)
    if (open) r = r.eq("session_id", open)
    return must(await r) as Log[]
  }, [refresh, open])
  const minutes = (s: Session) => Math.max(1, Math.round((new Date(s.ended_at || s.last_seen).getTime() - new Date(s.started_at).getTime()) / 60000))
  return (
    <>
      <Loaded q={data}>
        {({ sessions, people }) => (
          <Table head={["Début", "Utilisateur", "Durée", "État", "Adresse IP", "Version"]} count={sessions.length} empty="Aucune session.">
            {sessions.map((s) => (
              <tr key={s.id} className={`click${open === s.id ? " on" : ""}`} onClick={() => setOpen(open === s.id ? null : s.id)}>
                <td className="nowrap">{fmtDateTime(s.started_at)}</td>
                <td><UserCell p={people.get(s.user_id)} /></td>
                <td className="nowrap">{minutes(s)} min</td>
                <td>{s.ended_at ? <Tag>Fermée</Tag> : Date.now() - new Date(s.last_seen).getTime() < 11 * 60000 ? <Tag tone="ok">En cours</Tag> : <Tag tone="warn">Sans nouvelles</Tag>}</td>
                <td><code>{s.ip || "—"}</code></td>
                <td>{s.app_version || "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Loaded>
      <h3 className="section-title">{open ? "Journal de la session choisie" : "Derniers journaux envoyés par le logiciel"}</h3>
      <Loaded q={logs}>
        {(rows) => (
          <Table head={["Date", "Niveau", "Événement", "Détail", "Adresse IP"]} count={rows.length} empty="Aucun journal.">
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="nowrap">{fmtDateTime(l.created_at)}</td>
                <td><Tag tone={l.level === "error" ? "bad" : l.level === "warn" ? "warn" : ""}>{l.level}</Tag></td>
                <td><b>{l.event}</b></td>
                <td><JsonView value={l.detail} /></td>
                <td><code>{l.ip || "—"}</code></td>
              </tr>
            ))}
          </Table>
        )}
      </Loaded>
    </>
  )
}
