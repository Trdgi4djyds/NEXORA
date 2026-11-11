// NEXORA #090 : NEXORA REFERRAL, programme de parrainage lié à l'abonnement Pro (migration 20261108000007_parrainage.sql).
// Les parrains sont créés ici seulement : adresse e-mail, nom, puis un lien d'invitation et un code d'accès qui change
// chaque mois, à leur transmettre (de préférence par deux canaux différents). Le parrain ouvre le lien (/referral/), se
// connecte avec son adresse e-mail et saisit le code. Onglets : bilan (encaissé, remises, commissions, part de NEXORA),
// parrains, codes du mois, filleuls (paiement reçu hors ligne, rattachement), commissions, retraits, réglages.
// Toutes les actions passent par les fonctions nx_admin_* (droits vérifiés par la base) ; lectures réservées aux
// administrateurs (RLS).
import { useMemo, useState, type FormEvent, type ReactNode } from "react"
import { useRefresh } from "../App"
import { Icon } from "../icons"
import { must, NEXORA_WEB_URL, sb } from "../supabase"
import { downloadCsv, Drawer, Empty, fmtAgo, fmtDate, fmtDateTime, fmtNum, Kpi, Loaded, Modal, plural, SearchBox, Seg, Switch, Table, Tag, useAction, useLoad, useUi } from "../ui"
import { REFERRAL, discounted, money, percent } from "../../../nexora/app/renderer/nx/offres/catalog.js"

type Balance = { earned_cents: number; pending_cents: number; matured_cents: number; reserved_cents: number; paid_cents: number; available_cents: number }
type Recurring = { payers: number; commission_cents: number; gross_cents: number }
type Partner = {
  id: string; email: string; name: string; user_id: string | null; status: "invited" | "active" | "suspended"; invite_token: string | null; note: string
  payout_method: string; payout_details: string; failed_attempts: number; locked_until: string | null; created_at: string; activated_at: string | null; last_seen_at: string | null
  month_code: string; month_code_used_at: string | null; unlocked: boolean; codes: number; referrals: number; recurring: Recurring; balance: Balance
}
type Referral = { user_id: string; email: string; partner_id: string; partner: string; code: string; source: string; since: string; active: boolean; billing: string | null; period: string | null; payments: number; paid_cents: number; commission_cents: number }
type Commission = { id: number; partner_id: string; user_id: string | null; source: string; period: string; paid_cents: number; list_cents: number; rate: number; amount_cents: number; status: string; available_at: string; note: string; created_at: string }
type Payout = { id: string; partner_id: string; amount_cents: number; method: string; details: string; status: string; reference: string; admin_note: string; requested_at: string; processed_at: string | null }
type Rules = { enabled: boolean; discount_pct: number; commission_pct: number; min_payout_cents: number; hold_days: number; max_codes: number; cookie_days: number; methods: string[]; month_cents: number; year_cents: number; list_month_cents: number; list_year_cents: number }
type Overview = {
  partners: { invited: number; active: number; suspended: number }; referrals: number; referrals_month: number; gross_cents: number; list_cents: number; discount_cents: number
  commission_cents: number; net_cents: number; payments: number; paid_out_cents: number; open_payouts: { count: number; amount_cents: number }; recurring: Recurring
  series: { month: string; gross_cents: number; commission_cents: number }[]; rules: Rules
}
type Tab = "overview" | "partners" | "codes" | "referrals" | "commissions" | "payouts" | "settings"

const usd = (cents: number | string | null | undefined) => money(Number(cents) || 0) as string
/** Total ou estimation, arrondi au centime ; disponible arrondi au centime inférieur (le millième : une commission). */
const usdTotal = (cents: number | string | null | undefined) => money(Math.round(Number(cents) || 0)) as string
/** Taux à la française (25 %, 2,5 %). */
const pct = (v: number | string | null | undefined) => percent(Number(v) || 0) as string
const usdFloor = (cents: number | string | null | undefined) => money(Math.floor(Number(cents) || 0)) as string
const METHOD: Record<string, string> = { paypal: "PayPal", bank: "Virement bancaire", mobile_money: "Mobile Money" }
const PARTNER_STATE: Record<string, [string, string]> = { invited: ["Invité", "warn"], active: ["Actif", "ok"], suspended: ["Suspendu", "bad"] }
const PAYOUT_STATE: Record<string, [string, string]> = { requested: ["Demandé", "warn"], approved: ["Approuvé", "info"], paid: ["Versé", "ok"], rejected: ["Refusé", "bad"], canceled: ["Annulé par le parrain", ""] }
const SOURCE: Record<string, string> = { link: "Lien", code: "Code promo", admin: "Rattaché par l’équipe" }
const PORTAL = `${NEXORA_WEB_URL}referral/`
const inviteLink = (token: string) => `${PORTAL}#/invitation/${token}`
const monthName = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" })
/** Dernier jour du mois en cours (UTC) : jour de fin de validité des codes du mois. */
const endOfMonth = () => {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 1000).toISOString()
}

async function copy(text: string, ui: ReturnType<typeof useUi>, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    ui.toast(`${what} copié.`)
  } catch {
    ui.toast("Copie impossible : sélectionne le texte puis copie-le.", "bad")
  }
}

export function Referral({ param }: { param?: string }) {
  const refresh = useRefresh()
  const initial: Tab = (["partners", "codes", "referrals", "commissions", "payouts", "settings"] as Tab[]).find((t) => t === param) || "overview"
  const [tab, setTab] = useState<Tab>(initial)
  const [q, setQ] = useState("")
  const searchable = tab === "partners" || tab === "referrals" || tab === "commissions" || tab === "payouts"
  return (
    <>
      <div className="toolbar">
        <Seg
          value={tab}
          onChange={(t) => {
            setTab(t)
            history.replaceState(null, "", `#/referral${t === "overview" ? "" : `/${t}`}`)
          }}
          options={[["overview", "Bilan"], ["partners", "Parrains"], ["codes", "Codes du mois"], ["referrals", "Filleuls"], ["commissions", "Commissions"], ["payouts", "Retraits"], ["settings", "Réglages"]]}
        />
        <span className="grow" />
        {searchable && <SearchBox value={q} onSearch={setQ} placeholder={tab === "partners" ? "Nom ou e-mail…" : "Parrain, client ou code…"} />}
      </div>
      {tab === "overview" && <OverviewTab refresh={refresh} go={setTab} />}
      {tab === "partners" && <PartnersTab q={q} refresh={refresh} />}
      {tab === "codes" && <CodesTab refresh={refresh} />}
      {tab === "referrals" && <ReferralsTab q={q} refresh={refresh} />}
      {tab === "commissions" && <CommissionsTab q={q} refresh={refresh} />}
      {tab === "payouts" && <PayoutsTab q={q} refresh={refresh} />}
      {tab === "settings" && <SettingsTab refresh={refresh} />}
    </>
  )
}

/* ---------------------------------------------------------------- Bilan */

function OverviewTab({ refresh, go }: { refresh: number; go: (t: Tab) => void }) {
  const data = useLoad(async () => must(await sb.rpc("nx_admin_referral_overview")) as Overview, [refresh])
  return (
    <Loaded q={data}>
      {(o) => (
        <>
          <div className="kpis">
            <Kpi icon="pdf" label="Encaissé auprès des filleuls" value={usd(o.gross_cents)} hint={`${plural(o.payments, "paiement")} · remises accordées ${usd(o.discount_cents)}`} />
            <Kpi icon="gift" label="Commissions des parrains" value={usdTotal(o.commission_cents)} hint={`${usdTotal(o.paid_out_cents)} déjà versés`} />
            <Kpi icon="star" label="Part de NEXORA" value={usdTotal(o.net_cents)} hint="Encaissé moins les commissions" tone="good" />
            <Kpi icon="sync" label="Revenus récurrents mensuels" value={usdTotal(o.recurring.gross_cents)} hint={`${plural(o.recurring.payers, "filleul payant", "filleuls payants")} · ${usdTotal(o.recurring.commission_cents)} de commissions par mois`} />
          </div>
          <div className="cols-2-1">
            <div className="card">
              <div className="card-head">
                <h3 className="grow">Douze derniers mois</h3>
                <span className="rf-legend"><i className="rf-sw gross" /> Encaissé <i className="rf-sw comm" /> Commissions</span>
              </div>
              <Bars series={o.series.map((s) => ({ label: s.month, a: Number(s.gross_cents), b: Number(s.commission_cents) }))} />
            </div>
            <div className="stack">
              <div className="card">
                <div className="card-head"><h3>Programme</h3></div>
                <dl className="kv rf-kv">
                  <dt>Pro sans parrain</dt><dd>{usd(o.rules.list_month_cents)} par mois · {usd(o.rules.list_year_cents)} par an</dd>
                  <dt>Avec un parrain</dt><dd>−{pct(o.rules.discount_pct)} % : {usd(o.rules.month_cents)} par mois · {usd(o.rules.year_cents)} par an</dd>
                  <dt>Commission</dt><dd>{pct(o.rules.commission_pct)} % de ce que paie le filleul ({usd((o.rules.month_cents * o.rules.commission_pct) / 100)} par mois)</dd>
                  <dt>En caisse</dt><dd>{usd(o.rules.month_cents - (o.rules.month_cents * o.rules.commission_pct) / 100)} par mois et par filleul mensuel</dd>
                  <dt>Retrait</dt><dd>À partir de {usd(o.rules.min_payout_cents)}, gains disponibles après {plural(o.rules.hold_days, "jour")}</dd>
                  <dt>État</dt><dd>{o.rules.enabled ? <Tag tone="ok">Ouvert aux nouveaux filleuls</Tag> : <Tag tone="warn">Fermé aux nouveaux filleuls</Tag>}</dd>
                </dl>
              </div>
              <button className="card rf-cta" onClick={() => go("payouts")}>
                <span className="grow">
                  <b>{o.open_payouts.count ? `${plural(o.open_payouts.count, "retrait")} à traiter` : "Aucun retrait en attente"}</b>
                  <small className="muted">{o.open_payouts.count ? `${usd(o.open_payouts.amount_cents)} demandés` : "Les demandes des parrains arrivent ici."}</small>
                </span>
                <Icon name="chevronRight" size={16} />
              </button>
              <button className="card rf-cta" onClick={() => go("partners")}>
                <span className="grow">
                  <b>{plural(o.partners.active, "parrain actif", "parrains actifs")}</b>
                  <small className="muted">{plural(o.partners.invited, "invitation en attente", "invitations en attente")} · {plural(o.referrals, "filleul")} ({fmtNum(o.referrals_month)} ce mois-ci)</small>
                </span>
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </Loaded>
  )
}

function Bars({ series }: { series: { label: string; a: number; b: number }[] }) {
  const max = Math.max(1, ...series.map((s) => s.a))
  if (!series.some((s) => s.a > 0)) return <Empty icon="sync">Aucun paiement de filleul pour l’instant.</Empty>
  return (
    <div className="rf-bars" role="img" aria-label="Encaissé et commissions par mois">
      {series.map((s) => {
        const [y, m] = s.label.split("-").map(Number)
        const name = new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(new Date(Date.UTC(y, m - 1, 15)))
        return (
          <div className="rf-bar" key={s.label} title={`${name} ${y} : ${usd(s.a)} encaissés, ${usd(s.b)} de commissions`}>
            <div className="rf-bar-track">
              <i className="gross" style={{ height: `${(s.a / max) * 100}%` }} />
              <i className="comm" style={{ height: `${(s.b / max) * 100}%` }} />
            </div>
            <small>{name.replace(".", "")}</small>
          </div>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------- Parrains */

function usePartners(refresh: number) {
  return useLoad(async () => must(await sb.rpc("nx_admin_partners")) as Partner[], [refresh])
}

function PartnersTab({ q, refresh }: { q: string; refresh: number }) {
  const data = usePartners(refresh)
  const [inviting, setInviting] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  return (
    <Loaded q={data}>
      {(rows) => {
        const s = q.toLowerCase()
        const shown = s ? rows.filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(s)) : rows
        const current = rows.find((p) => p.id === open) || null
        return (
          <>
            <div className="toolbar">
              <span className="muted small">{plural(shown.length, "parrain")} · inscription uniquement depuis le back office</span>
              <span className="grow" />
              <button className="btn primary" onClick={() => setInviting(true)}>
                <Icon name="plus" size={14} /> Inviter un parrain
              </button>
            </div>
            <Table head={["Parrain", "État", "Code du mois", "Filleuls", "Revenus récurrents", "Disponible", ""]} count={shown.length} empty="Aucun parrain : invite le premier.">
              {shown.map((p) => (
                <tr key={p.id}>
                  <td className="click" onClick={() => setOpen(p.id)}>
                    <b className="ellipsis" style={{ display: "block", maxWidth: 240 }}>{p.name}</b>
                    <small className="muted">{p.email}</small>
                  </td>
                  <td className="nowrap">
                    <Tag tone={PARTNER_STATE[p.status][1]}>{PARTNER_STATE[p.status][0]}</Tag>
                    <div className="muted small">{p.status === "invited" ? `invité ${fmtAgo(p.created_at)}` : p.last_seen_at ? `vu ${fmtAgo(p.last_seen_at)}` : "jamais connecté"}</div>
                  </td>
                  <td className="nowrap">
                    {p.status === "suspended" ? "—" : <><code>{p.month_code}</code><div className="muted small">{p.unlocked ? "saisi ce mois-ci" : "pas encore saisi"}</div></>}
                  </td>
                  <td>{fmtNum(p.referrals)}<div className="muted small">{plural(p.recurring.payers, "payant")}</div></td>
                  <td className="nowrap">{usdTotal(p.recurring.commission_cents)}<div className="muted small">par mois</div></td>
                  <td className="nowrap">{usdFloor(p.balance.available_cents)}<div className="muted small">{usdTotal(p.balance.pending_cents)} en attente</div></td>
                  <td className="nowrap"><button className="btn sm" onClick={() => setOpen(p.id)}>Gérer</button></td>
                </tr>
              ))}
            </Table>
            {inviting && <InviteModal onClose={() => setInviting(false)} onDone={() => data.reload()} />}
            {current && <PartnerDrawer p={current} onClose={() => setOpen(null)} onChanged={() => data.reload()} />}
          </>
        )
      }}
    </Loaded>
  )
}

type Created = { invite_token: string; code: string; month: string; expires_at: string; partner: { name: string; email: string } }

function InviteModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const act = useAction()
  const [created, setCreated] = useState<Created | null>(null)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    let out: Created | null = null
    const ok = await act.run(async () => {
      out = must(await sb.rpc("nx_admin_partner_create", { p_email: f.email.trim(), p_name: f.name.trim(), p_note: f.note || "" })) as Created
    }, "Parrain invité.")
    if (ok && out) {
      setCreated(out)
      onDone()
    }
  }
  if (created) {
    return (
      <Modal title={`Invitation de ${created.partner.name}`} onClose={onClose} width={620}>
        <p className="muted">Transmets ces deux informations à {created.partner.email}, de préférence par deux canaux différents (le lien par e-mail, le code par SMS ou WhatsApp). Le parrain ouvre le lien, se connecte avec son adresse e-mail, puis saisit le code.</p>
        <Secret label="Lien d’invitation" value={inviteLink(created.invite_token)} hint="Valable jusqu’à son utilisation ; tu peux en créer un nouveau tant que le parrain n’a pas activé son accès." />
        <Secret label={`Code d’accès de ${monthName.format(new Date(created.month))}`} value={created.code} code hint={`Valable jusqu’au ${fmtDate(endOfMonth())} : un nouveau code est demandé chaque mois (onglet « Codes du mois »).`} />
        <div className="actions">
          <a className="btn" href={`mailto:${created.partner.email}?subject=${encodeURIComponent("Ton accès à NEXORA REFERRAL")}&body=${encodeURIComponent(`Bonjour ${created.partner.name.split(" ")[0]},\n\nTu es invité au programme de parrainage NEXORA REFERRAL. Ouvre ce lien, puis connecte-toi avec cette adresse e-mail :\n${inviteLink(created.invite_token)}\n\nTon code d’accès t’est envoyé séparément.\n\nL’équipe NEXORA`)}`}>
            <Icon name="mail" size={14} /> Préparer l’e-mail (lien seulement)
          </a>
          <button className="btn primary" onClick={onClose}>Terminé</button>
        </div>
      </Modal>
    )
  }
  return (
    <Modal title="Inviter un parrain" onClose={onClose} width={560}>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>Adresse e-mail du parrain</span><input className="input" name="email" type="email" required placeholder="prenom@exemple.com" autoFocus /><small>Il se connectera avec cette adresse : un compte NEXORA est créé à sa première connexion s’il n’en a pas.</small></label>
        <label className="field"><span>Nom</span><input className="input" name="name" required minLength={2} maxLength={80} placeholder="Prénom Nom" /><small>Son prénom apparaît sur le site quand un client utilise son code.</small></label>
        <label className="field"><span>Note (visible ici seulement)</span><input className="input" name="note" maxLength={500} placeholder="Influenceur, partenaire, école…" /></label>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" disabled={act.busy}>Créer l’invitation</button>
        </div>
      </form>
    </Modal>
  )
}

function Secret({ label, value, hint, code }: { label: string; value: string; hint?: ReactNode; code?: boolean }) {
  const ui = useUi()
  return (
    <div className="field">
      <span>{label}</span>
      <div className="rf-secret">
        <input className={`input${code ? " rf-code" : ""}`} readOnly value={value} onFocus={(e) => e.currentTarget.select()} aria-label={label} />
        <button type="button" className="btn" onClick={() => copy(value, ui, label)}>
          <Icon name="copy" size={14} /> Copier
        </button>
      </div>
      {hint && <small>{hint}</small>}
    </div>
  )
}

function PartnerDrawer({ p, onClose, onChanged }: { p: Partner; onClose: () => void; onChanged: () => void }) {
  const ui = useUi()
  const act = useAction()
  const [token, setToken] = useState(p.invite_token)
  const [code, setCode] = useState(p.month_code)
  const [note, setNote] = useState(p.note)
  const locked = Boolean(p.locked_until && new Date(p.locked_until).getTime() > Date.now())

  async function newLink() {
    if (!(await ui.confirm({ title: "Créer un nouveau lien d’invitation ?", body: "L’ancien lien ne fonctionnera plus.", confirm: "Nouveau lien" }))) return
    await act.run(async () => setToken((must(await sb.rpc("nx_admin_partner_invite_reset", { p_partner: p.id })) as { invite_token: string }).invite_token), "Nouveau lien créé.")
  }
  async function newCode() {
    if (!(await ui.confirm({ title: "Créer un nouveau code du mois ?", body: `${p.name} devra saisir le nouveau code à sa prochaine visite ; l’ancien ne marche plus. À faire si le code a pu être vu par quelqu’un d’autre.`, confirm: "Nouveau code" }))) return
    if (await act.run(async () => setCode((must(await sb.rpc("nx_admin_partner_code", { p_partner: p.id, p_regenerate: true })) as { code: string }).code), "Nouveau code créé.")) onChanged()
  }
  async function update(args: Record<string, unknown>, ok: string) {
    if (await act.run(async () => must(await sb.rpc("nx_admin_partner_update", { p_partner: p.id, ...args })), ok)) onChanged()
  }
  async function toggle() {
    const suspend = p.status !== "suspended"
    if (!(await ui.confirm({
      title: suspend ? `Suspendre ${p.name} ?` : `Réactiver ${p.name} ?`,
      body: suspend ? "Ses codes promo cessent de fonctionner, son espace se ferme et aucune commission n’est créée pendant la suspension. Ses filleuls gardent leur remise." : "Ses codes promo et son espace fonctionnent de nouveau.",
      confirm: suspend ? "Suspendre" : "Réactiver",
      danger: suspend,
    }))) return
    await update({ p_status: suspend ? "suspended" : "active" }, suspend ? "Parrain suspendu." : "Parrain réactivé.")
  }

  return (
    <Drawer title={p.name} sub={`${p.email} · ${PARTNER_STATE[p.status][0].toLowerCase()} depuis le ${fmtDate(p.activated_at || p.created_at)}`} onClose={onClose}
      actions={<button className={`btn sm${p.status === "suspended" ? "" : " danger"}`} disabled={act.busy} onClick={toggle}>{p.status === "suspended" ? "Réactiver" : "Suspendre"}</button>}>
      <div className="stack">
        <div className="kpis rf-kpis-3">
          <Kpi icon="gift" label="Gagné" value={usdTotal(p.balance.earned_cents)} hint={`${usdTotal(p.balance.pending_cents)} en attente`} />
          <Kpi icon="star" label="Disponible" value={usdFloor(p.balance.available_cents)} hint={`${usdTotal(p.balance.paid_cents)} versés`} />
          <Kpi icon="sync" label="Récurrent" value={usdTotal(p.recurring.commission_cents)} hint={`par mois · ${plural(p.recurring.payers, "filleul payant", "filleuls payants")}`} />
        </div>
        {p.status === "invited" && token && (
          <Secret label="Lien d’invitation" value={inviteLink(token)} hint={<>Pas encore utilisé. <button type="button" className="link-btn" onClick={newLink} disabled={act.busy}>Créer un nouveau lien</button></>} />
        )}
        {p.status !== "suspended" && (
          <Secret label={`Code d’accès de ${monthName.format(new Date())}`} value={code} code
            hint={<>{p.unlocked ? "Déjà saisi ce mois-ci." : "Pas encore saisi ce mois-ci."} Valable jusqu’au {fmtDate(endOfMonth())}. <button type="button" className="link-btn" onClick={newCode} disabled={act.busy}>Nouveau code</button></>} />
        )}
        {locked && (
          <div className="alert row">
            <span className="grow">Saisie du code bloquée jusqu’à {fmtDateTime(p.locked_until)} après 5 codes faux.</span>
            <button className="btn sm" disabled={act.busy} onClick={() => update({ p_unlock: true }, "Saisie du code débloquée.")}>Débloquer</button>
          </div>
        )}
        <dl className="kv">
          <dt>Codes promo</dt><dd>{plural(p.codes, "code")} créé(s) par le parrain</dd>
          <dt>Filleuls</dt><dd>{plural(p.referrals, "filleul")}, dont {plural(p.recurring.payers, "payant")}</dd>
          <dt>Versement</dt><dd>{p.payout_method ? `${METHOD[p.payout_method] || p.payout_method} · ${p.payout_details}` : "Pas encore renseigné"}</dd>
          <dt>Invité le</dt><dd>{fmtDateTime(p.created_at)}</dd>
          <dt>Dernière visite</dt><dd>{p.last_seen_at ? fmtDateTime(p.last_seen_at) : "—"}</dd>
        </dl>
        <label className="field">
          <span>Note (visible ici seulement)</span>
          <textarea className="input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="actions">
          <a className="btn" href={PORTAL} target="_blank" rel="noreferrer"><Icon name="external" size={14} /> Espace des parrains</a>
          <button className="btn primary" disabled={act.busy || note === p.note} onClick={() => update({ p_note: note }, "Note enregistrée.")}>Enregistrer la note</button>
        </div>
      </div>
    </Drawer>
  )
}

/* ---------------------------------------------------------------- Codes du mois */

function CodesTab({ refresh }: { refresh: number }) {
  const ui = useUi()
  const data = usePartners(refresh)
  return (
    <Loaded q={data}>
      {(rows) => {
        const live = rows.filter((p) => p.status !== "suspended")
        return (
          <>
            <div className="toolbar">
              <span className="muted small">
                Codes de {monthName.format(new Date())}, valables jusqu’au {fmtDate(endOfMonth())}. Un nouveau code est créé le 1ᵉʳ de chaque mois : transmets-le à chaque parrain.
              </span>
              <span className="grow" />
              <button className="btn" disabled={!live.length} onClick={() => downloadCsv(`codes-parrains-${new Date().toISOString().slice(0, 7)}`, live.map((p) => ({ nom: p.name, email: p.email, code: p.month_code, saisi: p.unlocked ? "oui" : "non" })))}>
                <Icon name="download" size={14} /> Exporter
              </button>
            </div>
            <Table head={["Parrain", "Code du mois", "État", ""]} count={live.length} empty="Aucun parrain actif ou invité.">
              {live.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.name}</b><div className="muted small">{p.email}</div></td>
                  <td><code className="rf-code-cell">{p.month_code}</code></td>
                  <td className="nowrap">{p.unlocked ? <Tag tone="ok">Saisi{p.month_code_used_at ? ` le ${fmtDate(p.month_code_used_at)}` : ""}</Tag> : <Tag tone="warn">À transmettre</Tag>}</td>
                  <td className="nowrap"><button className="btn sm" onClick={() => copy(p.month_code, ui, `Code de ${p.name}`)}><Icon name="copy" size={13} /> Copier</button></td>
                </tr>
              ))}
            </Table>
          </>
        )
      }}
    </Loaded>
  )
}

/* ---------------------------------------------------------------- Filleuls */

function ReferralsTab({ q, refresh }: { q: string; refresh: number }) {
  const data = useLoad(async () => must(await sb.rpc("nx_admin_referrals", { p_limit: 1000 })) as Referral[], [refresh])
  const [paying, setPaying] = useState<Referral | null>(null)
  const [assigning, setAssigning] = useState(false)
  return (
    <Loaded q={data}>
      {(rows) => {
        const s = q.toLowerCase()
        const shown = s ? rows.filter((r) => `${r.email} ${r.partner} ${r.code}`.toLowerCase().includes(s)) : rows
        return (
          <>
            <div className="toolbar">
              <span className="muted small">{plural(shown.length, "filleul")} · {plural(rows.filter((r) => r.active).length, "payant")}</span>
              <span className="grow" />
              <button className="btn" onClick={() => setAssigning(true)}><Icon name="link" size={14} /> Rattacher un compte</button>
              <button className="btn" disabled={!shown.length} onClick={() => downloadCsv("filleuls", shown)}><Icon name="download" size={14} /> Exporter</button>
            </div>
            <Table head={["Client", "Parrain", "Arrivé par", "Abonnement", "Encaissé", "Commission", ""]} count={shown.length} empty="Aucun filleul pour l’instant.">
              {shown.map((r) => (
                <tr key={r.user_id}>
                  <td><b className="ellipsis" style={{ display: "block", maxWidth: 240 }}>{r.email}</b><small className="muted">depuis le {fmtDate(r.since)}</small></td>
                  <td>{r.partner}<div className="muted small"><code>{r.code}</code></div></td>
                  <td className="nowrap">{SOURCE[r.source] || r.source}</td>
                  <td className="nowrap">{r.active ? <Tag tone="ok">Payant{r.period === "year" ? " · annuel" : r.period === "month" ? " · mensuel" : ""}</Tag> : r.payments ? <Tag tone="bad">Arrêté</Tag> : <Tag>Pas encore abonné</Tag>}</td>
                  <td className="nowrap">{usd(r.paid_cents)}<div className="muted small">{plural(r.payments, "paiement")}</div></td>
                  <td className="nowrap">{usd(r.commission_cents)}</td>
                  <td className="nowrap"><button className="btn sm" onClick={() => setPaying(r)}>Paiement reçu</button></td>
                </tr>
              ))}
            </Table>
            {paying && <PaymentModal r={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); data.reload() }} />}
            {assigning && <AssignModal onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); data.reload() }} />}
          </>
        )
      }}
    </Loaded>
  )
}

function PaymentModal({ r, onClose, onDone }: { r: Referral; onClose: () => void; onDone: () => void }) {
  const act = useAction()
  const [period, setPeriod] = useState<"month" | "year">(r.period === "year" ? "year" : "month")
  const rules = useLoad(async () => must(await sb.rpc("nx_admin_referral_overview")) as Overview, [])
  const r0 = rules.data?.rules
  const suggested = r0 ? (period === "year" ? r0.year_cents : r0.month_cents) : discounted(period === "year" ? 25000 : 2500)
  const [amount, setAmount] = useState<string>("")
  const value = amount === "" ? suggested / 100 : Number(amount.replace(",", "."))
  const pct = r0 ? r0.commission_pct : REFERRAL.commission_pct
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    const cents = Math.round(value * 100)
    if (await act.run(async () => must(await sb.rpc("nx_admin_referral_payment", { p_user: r.user_id, p_paid_cents: cents, p_period: period, p_note: f.note || "" })), "Paiement enregistré : commission créée.")) onDone()
  }
  return (
    <Modal title="Paiement reçu d’un filleul" onClose={onClose} width={540}>
      <form className="form" onSubmit={submit}>
        <p className="muted">Pour un abonnement Pro payé hors ligne par {r.email} (Mobile Money, virement…). Les paiements par carte sont comptés automatiquement.</p>
        <div className="field"><span>Période payée</span><Seg value={period} onChange={setPeriod} options={[["month", "Un mois"], ["year", "Un an"]]} /></div>
        <label className="field"><span>Montant payé, remise déduite ($)</span><input className="input" inputMode="decimal" value={amount === "" ? String(suggested / 100).replace(".", ",") : amount} onChange={(e) => setAmount(e.target.value)} required /><small>Commission de {r.partner} : {usd(Math.round(value * 100) * pct / 100)} ({pct} %).</small></label>
        <label className="field"><span>Note</span><input className="input" name="note" maxLength={300} placeholder="Référence du paiement" /></label>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" disabled={act.busy || !(value > 0)}>Enregistrer</button>
        </div>
      </form>
    </Modal>
  )
}

function AssignModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const act = useAction()
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    if (await act.run(async () => must(await sb.rpc("nx_admin_referral_assign", { p_email: f.email.trim(), p_code: f.code.trim() })), "Compte rattaché au parrain.")) onDone()
  }
  return (
    <Modal title="Rattacher un compte à un parrain" onClose={onClose} width={520}>
      <form className="form" onSubmit={submit}>
        <p className="muted">Pour un client venu par un parrain sans avoir saisi son code. Définitif : un compte n’a qu’un parrain.</p>
        <label className="field"><span>Adresse e-mail du compte NEXORA</span><input className="input" name="email" type="email" required autoFocus /></label>
        <label className="field"><span>Code promo du parrain</span><input className="input rf-code" name="code" required maxLength={24} /></label>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" disabled={act.busy}>Rattacher</button>
        </div>
      </form>
    </Modal>
  )
}

/* ---------------------------------------------------------------- Commissions */

function CommissionsTab({ q, refresh }: { q: string; refresh: number }) {
  const ui = useUi()
  const act = useAction()
  const data = useLoad(async () => {
    // Adresses des filleuls : nx_admin_referrals (fonction du back office), pas la table des profils.
    const [c, p, r] = await Promise.all([
      sb.from("nx_commissions").select("*").order("created_at", { ascending: false }).limit(1000),
      sb.from("nx_partners").select("id, name, email"),
      sb.rpc("nx_admin_referrals", { p_limit: 2000 }),
    ])
    const rows = must(c) as Commission[]
    const people = must(r) as Referral[]
    return { rows, partners: new Map((must(p) as { id: string; name: string }[]).map((x) => [x.id, x.name])), emails: new Map(people.map((x) => [x.user_id, x.email])) }
  }, [refresh])
  async function cancel(c: Commission) {
    if (!(await ui.confirm({ title: "Annuler cette commission ?", body: `${usd(c.amount_cents)} sortent des gains du parrain (paiement remboursé, erreur, fraude).`, confirm: "Annuler la commission", danger: true }))) return
    if (await act.run(async () => must(await sb.rpc("nx_admin_commission_cancel", { p_id: c.id, p_note: "Annulée par l’équipe" })), "Commission annulée.")) data.reload()
  }
  return (
    <Loaded q={data}>
      {({ rows, partners, emails }) => {
        const s = q.toLowerCase()
        const shown = s ? rows.filter((c) => `${partners.get(c.partner_id) || ""} ${emails.get(c.user_id || "") || ""}`.toLowerCase().includes(s)) : rows
        const now = Date.now()
        return (
          <>
            <div className="toolbar">
              <span className="muted small">{plural(shown.length, "commission")} · {usdTotal(shown.filter((c) => c.status === "valid").reduce((t, c) => t + Number(c.amount_cents), 0))}</span>
              <span className="grow" />
              <button className="btn" disabled={!shown.length} onClick={() => downloadCsv("commissions", shown.map((c) => ({ ...c, parrain: partners.get(c.partner_id) || "", filleul: emails.get(c.user_id || "") || "" })))}><Icon name="download" size={14} /> Exporter</button>
            </div>
            <Table head={["Date", "Parrain", "Filleul", "Payé", "Commission", "État", ""]} count={shown.length} empty="Aucune commission pour l’instant.">
              {shown.map((c) => (
                <tr key={c.id}>
                  <td className="nowrap">{fmtDate(c.created_at)}<div className="muted small">{c.source === "manual" ? "hors ligne" : "carte"}</div></td>
                  <td>{partners.get(c.partner_id) || "—"}</td>
                  <td className="ellipsis" style={{ maxWidth: 220 }}>{emails.get(c.user_id || "") || "Compte supprimé"}</td>
                  <td className="nowrap">{usd(c.paid_cents)}<div className="muted small">{c.period === "year" ? "un an" : "un mois"}{c.list_cents > c.paid_cents ? ` · au lieu de ${usd(c.list_cents)}` : ""}</div></td>
                  <td className="nowrap"><b>{usd(c.amount_cents)}</b><div className="muted small">{pct(c.rate)} %</div></td>
                  <td className="nowrap">{c.status === "canceled" ? <Tag tone="bad">Annulée</Tag> : new Date(c.available_at).getTime() > now ? <Tag tone="warn">Disponible le {fmtDate(c.available_at)}</Tag> : <Tag tone="ok">Disponible</Tag>}</td>
                  <td className="nowrap">{c.status === "valid" && <button className="btn sm danger" disabled={act.busy} onClick={() => cancel(c)}>Annuler</button>}</td>
                </tr>
              ))}
            </Table>
          </>
        )
      }}
    </Loaded>
  )
}

/* ---------------------------------------------------------------- Retraits */

function PayoutsTab({ q, refresh }: { q: string; refresh: number }) {
  const data = useLoad(async () => {
    const [o, p] = await Promise.all([sb.from("nx_payouts").select("*").order("requested_at", { ascending: false }).limit(500), sb.from("nx_partners").select("id, name, email")])
    return { rows: must(o) as Payout[], partners: new Map((must(p) as { id: string; name: string; email: string }[]).map((x) => [x.id, x])) }
  }, [refresh])
  const [acting, setActing] = useState<{ p: Payout; to: "approved" | "paid" | "rejected" } | null>(null)
  return (
    <Loaded q={data}>
      {({ rows, partners }) => {
        const s = q.toLowerCase()
        const shown = s ? rows.filter((o) => `${partners.get(o.partner_id)?.name || ""} ${partners.get(o.partner_id)?.email || ""}`.toLowerCase().includes(s)) : rows
        const open = shown.filter((o) => o.status === "requested" || o.status === "approved")
        return (
          <>
            <div className="toolbar">
              <span className="muted small">{plural(open.length, "retrait")} à traiter · {usd(open.reduce((t, o) => t + Number(o.amount_cents), 0))}</span>
            </div>
            <Table head={["Demandé le", "Parrain", "Montant", "Versement", "État", ""]} count={shown.length} empty="Aucune demande de retrait.">
              {shown.map((o) => {
                const p = partners.get(o.partner_id)
                return (
                  <tr key={o.id}>
                    <td className="nowrap">{fmtDate(o.requested_at)}<div className="muted small">{o.processed_at ? `traité le ${fmtDate(o.processed_at)}` : fmtAgo(o.requested_at)}</div></td>
                    <td><b>{p?.name || "—"}</b><div className="muted small">{p?.email}</div></td>
                    <td className="nowrap"><b>{usd(o.amount_cents)}</b></td>
                    <td>{METHOD[o.method] || o.method}<div className="muted small ellipsis" style={{ maxWidth: 240 }}>{o.details}</div></td>
                    <td className="nowrap"><Tag tone={PAYOUT_STATE[o.status]?.[1] || ""}>{PAYOUT_STATE[o.status]?.[0] || o.status}</Tag>{o.reference ? <div className="muted small">réf. {o.reference}</div> : null}</td>
                    <td className="nowrap">
                      {o.status === "requested" && <button className="btn sm" onClick={() => setActing({ p: o, to: "approved" })}>Approuver</button>}{" "}
                      {(o.status === "requested" || o.status === "approved") && <button className="btn sm primary" onClick={() => setActing({ p: o, to: "paid" })}>Marquer versé</button>}{" "}
                      {(o.status === "requested" || o.status === "approved") && <button className="btn sm danger" onClick={() => setActing({ p: o, to: "rejected" })}>Refuser</button>}
                    </td>
                  </tr>
                )
              })}
            </Table>
            {acting && <PayoutModal o={acting.p} to={acting.to} name={partners.get(acting.p.partner_id)?.name || ""} onClose={() => setActing(null)} onDone={() => { setActing(null); data.reload() }} />}
          </>
        )
      }}
    </Loaded>
  )
}

function PayoutModal({ o, to, name, onClose, onDone }: { o: Payout; to: "approved" | "paid" | "rejected"; name: string; onClose: () => void; onDone: () => void }) {
  const act = useAction()
  const title = to === "paid" ? "Marquer le retrait versé" : to === "approved" ? "Approuver le retrait" : "Refuser le retrait"
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    if (await act.run(async () => must(await sb.rpc("nx_admin_payout_update", { p_payout: o.id, p_status: to, p_reference: f.reference || "", p_note: f.note || "" })), to === "paid" ? "Retrait marqué versé." : to === "approved" ? "Retrait approuvé." : "Retrait refusé : le montant revient dans les gains du parrain.")) onDone()
  }
  return (
    <Modal title={title} onClose={onClose} width={520}>
      <form className="form" onSubmit={submit}>
        <dl className="kv">
          <dt>Parrain</dt><dd>{name}</dd>
          <dt>Montant</dt><dd><b>{usd(o.amount_cents)}</b></dd>
          <dt>Versement</dt><dd>{METHOD[o.method] || o.method} · {o.details}</dd>
        </dl>
        {to === "paid" && <label className="field"><span>Référence du versement</span><input className="input" name="reference" required minLength={3} maxLength={120} placeholder="Numéro de transaction" autoFocus /><small>Visible par le parrain dans son espace.</small></label>}
        <label className="field"><span>{to === "rejected" ? "Motif (visible par le parrain)" : "Note (visible par le parrain)"}</span><input className="input" name="note" maxLength={500} required={to === "rejected"} /></label>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button className={`btn ${to === "rejected" ? "danger solid" : "primary"}`} disabled={act.busy}>{to === "paid" ? "Marquer versé" : to === "approved" ? "Approuver" : "Refuser"}</button>
        </div>
      </form>
    </Modal>
  )
}

/* ---------------------------------------------------------------- Réglages */

function SettingsTab({ refresh }: { refresh: number }) {
  const data = useLoad(async () => (must(await sb.rpc("nx_admin_referral_overview")) as Overview).rules, [refresh])
  return <Loaded q={data}>{(r) => <SettingsForm initial={r} onSaved={() => data.reload()} />}</Loaded>
}

function SettingsForm({ initial, onSaved }: { initial: Rules; onSaved: () => void }) {
  const act = useAction()
  const [v, setV] = useState({ ...initial, min_payout: initial.min_payout_cents / 100 })
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }))
  const example = useMemo(() => {
    const paid = discounted(initial.list_month_cents, v.discount_pct)
    const comm = (paid * v.commission_pct) / 100
    return { paid, comm, net: paid - comm }
  }, [initial.list_month_cents, v.discount_pct, v.commission_pct])
  async function save(e: FormEvent) {
    e.preventDefault()
    const value = { enabled: v.enabled, discount_pct: Number(v.discount_pct), commission_pct: Number(v.commission_pct), min_payout_cents: Math.round(Number(v.min_payout) * 100), hold_days: Number(v.hold_days), max_codes: Number(v.max_codes), cookie_days: Number(v.cookie_days), methods: v.methods }
    if (await act.run(async () => must(await sb.rpc("nx_admin_referral_settings", { p_value: value })), "Réglages du parrainage enregistrés.")) onSaved()
  }
  const toggleMethod = (m: string, on: boolean) => set("methods", on ? [...new Set([...v.methods, m])] : v.methods.filter((x) => x !== m))
  return (
    <form className="cols-2-1" onSubmit={save}>
      <div className="card form">
        <div className="card-head"><h3 className="grow">Règles du programme</h3><Switch checked={v.enabled} onChange={(on) => set("enabled", on)} label="Programme ouvert aux nouveaux filleuls" /></div>
        <div className="grid2">
          <label className="field"><span>Remise du filleul (%)</span><input className="input" type="number" min={0} max={90} step="0.5" value={v.discount_pct} onChange={(e) => set("discount_pct", Number(e.target.value))} /><small>Sur chaque paiement Pro, tant que l’abonnement continue.</small></label>
          <label className="field"><span>Commission du parrain (%)</span><input className="input" type="number" min={0} max={90} step="0.1" value={v.commission_pct} onChange={(e) => set("commission_pct", Number(e.target.value))} /><small>De ce que paie le filleul, remise déduite.</small></label>
          <label className="field"><span>Retrait minimum ($)</span><input className="input" type="number" min={0} step="1" value={v.min_payout} onChange={(e) => set("min_payout", Number(e.target.value))} /></label>
          <label className="field"><span>Délai avant disponibilité (jours)</span><input className="input" type="number" min={0} max={365} value={v.hold_days} onChange={(e) => set("hold_days", Number(e.target.value))} /><small>Laisse le temps des remboursements.</small></label>
          <label className="field"><span>Codes promo par parrain</span><input className="input" type="number" min={1} max={100} value={v.max_codes} onChange={(e) => set("max_codes", Number(e.target.value))} /></label>
          <label className="field"><span>Lien mémorisé (jours)</span><input className="input" type="number" min={1} max={365} value={v.cookie_days} onChange={(e) => set("cookie_days", Number(e.target.value))} /><small>Durée pendant laquelle le site garde le lien d’un parrain.</small></label>
        </div>
        <div className="field">
          <span>Moyens de versement proposés</span>
          <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
            {Object.entries(METHOD).map(([k, label]) => (
              <label key={k} className="check"><input type="checkbox" checked={v.methods.includes(k)} onChange={(e) => toggleMethod(k, e.target.checked)} /> {label}</label>
            ))}
          </div>
        </div>
        <div className="actions">
          <button className="btn primary" disabled={act.busy || !v.methods.length}>Enregistrer</button>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Exemple : Pro mensuel</h3></div>
        <dl className="kv rf-kv">
          <dt>Prix sans parrain</dt><dd>{usd(initial.list_month_cents)}</dd>
          <dt>Le filleul paie</dt><dd><b>{usd(example.paid)}</b> (−{pct(v.discount_pct)} %)</dd>
          <dt>Le parrain touche</dt><dd><b>{usd(example.comm)}</b> ({pct(v.commission_pct)} %)</dd>
          <dt>NEXORA garde</dt><dd><b>{usd(example.net)}</b></dd>
        </dl>
        <p className="muted small" style={{ marginTop: 12 }}>Le prix de Pro se règle dans la section Offres. La remise est déduite du montant de chaque paiement de Pro (un mois ou un an) : une remise changée s’applique dès le paiement suivant.</p>
      </div>
    </form>
  )
}
