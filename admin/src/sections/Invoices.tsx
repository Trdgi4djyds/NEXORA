// Factures (#031) : brouillon, émission numérotée (NX-AAAA-0001), PDF aux couleurs de NEXORA avec aperçu en
// direct, envoi par e-mail avec le PDF en pièce jointe (Brevo), suivi du paiement, réglages de l'émetteur.
// Les totaux sont recalculés par la base ; une facture émise ne se modifie plus (elle s'annule).
import { useEffect, useMemo, useState } from "react"
import { go, useRefresh, type SectionProps } from "../App"
import { Icon } from "../icons"
import { must, NEXORA_WEB_URL, sb, type Json, type Row } from "../supabase"
import { Avatar, Empty, fmtDate, Kpi, Modal, SearchBox, Seg, useAction, useLoad, useUi, Loaded } from "../ui"
import setup from "../../../supabase/nexora.json"
import logo from "../../../nexora/app/renderer/logo.png"
import { EmailFrame } from "../emails/frame"
import { hello, waitBrevo } from "../emails/send"
import { invoiceEmail } from "../emails/templates"
import { invoiceFile, longDate, money, totals, type InvoiceDoc, type InvoiceLine, type Issuer, type Party } from "../invoices/format"
import { errMsg, OutcomeBanner, type Outcome } from "./SupabaseSetup"

type Invoice = Row<"invoices">
type Person = Pick<Row<"profiles">, "id" | "email" | "full_name" | "company">
type Org = Pick<Row<"organizations">, "id" | "name" | "personal" | "owner_id">
type Plan = Pick<Row<"plans">, "id" | "name" | "price_month_cents" | "price_year_cents" | "currency">

const STATUS: Record<string, [string, string]> = {
  brouillon: ["Brouillon", ""],
  emise: ["Émise", "info"],
  envoyee: ["Envoyée", "info"],
  payee: ["Payée", "ok"],
  annulee: ["Annulée", "bad"],
}
const CURRENCIES: [string, string][] = [["EUR", "Euro (€)"], ["XOF", "Franc CFA (F CFA)"], ["USD", "Dollar US ($)"]]
const DEFAULT_ISSUER: Issuer = {
  name: "NEXORA", address: "", email: "", phone: "", website: NEXORA_WEB_URL, tax_id: "",
  vat_note: "TVA non applicable", currency: "EUR", tax_rate: 0, due_days: 30, prefix: "NX", payment: "", footer: "Merci de votre confiance.",
}
const MIGRATION = "20261104000006_emails_factures.sql"
const missing = (e: unknown) => /does not exist|schema cache|PGRST20[25]|42P01|42883/.test(errMsg(e))
const today = () => new Date().toISOString().slice(0, 10)
const monthYear = () => new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date())

async function loadIssuer(): Promise<Issuer> {
  const { data, error } = await sb.from("nx_private_config").select("value").eq("key", "invoice_issuer").maybeSingle()
  if (error) throw error
  return { ...DEFAULT_ISSUER, ...((data?.value as Issuer | null) || {}) }
}

type Draft = Pick<Invoice, "customer" | "lines" | "currency" | "tax_rate" | "due_at" | "notes" | "user_id" | "org_id">
const draftOf = (i: Invoice): Draft => ({ customer: i.customer, lines: i.lines, currency: i.currency, tax_rate: Number(i.tax_rate), due_at: i.due_at, notes: i.notes, user_id: i.user_id, org_id: i.org_id })

function docOf(inv: Invoice, d: Draft, issuer: Issuer): InvoiceDoc {
  return {
    number: inv.number, status: inv.status, issuedAt: inv.issued_at, dueAt: d.due_at, paidAt: inv.paid_at,
    currency: d.currency, taxRate: Number(d.tax_rate) || 0, lines: (d.lines as InvoiceLine[]) || [],
    customer: (d.customer as Party) || {}, issuer: inv.number && inv.issuer ? { ...DEFAULT_ISSUER, ...(inv.issuer as Issuer) } : issuer, notes: d.notes || "",
  }
}
async function makePdf(doc: InvoiceDoc) {
  const m = await import("../invoices/pdf")
  const bytes = await m.invoicePdf(doc, logo)
  return { bytes, base64: () => m.toBase64(bytes) }
}
function download(bytes: Uint8Array, name: string) {
  const a = document.createElement("a")
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
/** Montants regroupés par devise : « 124,80 € · 190 000 F CFA ». */
function sums(list: Invoice[]) {
  const by = new Map<string, number>()
  for (const i of list) by.set(i.currency, (by.get(i.currency) || 0) + Number(i.total_cents))
  return by.size ? [...by].map(([c, v]) => money(v, c)).join(" · ") : money(0)
}

export function Invoices({ param }: SectionProps) {
  return param ? <InvoiceEditor id={param} /> : <InvoiceList />
}

function MissingBanner() {
  return (
    <div className="banner"><Icon name="warn" size={16} />
      <span className="grow">Les factures demandent la migration <code>{MIGRATION}</code> : back office → Supabase → Migrations du dépôt → « Tout appliquer ».</span>
      <button className="btn sm" onClick={() => go("supabase")}>Ouvrir Supabase</button>
    </div>
  )
}

/* ---------------------------------------------------------------- Liste */

type Filter = "all" | "draft" | "due" | "paid" | "void"
type Sort = "recent" | "old" | "due" | "amount" | "client"
const SORTS: [Sort, string][] = [
  ["recent", "Plus récentes d’abord"],
  ["old", "Plus anciennes d’abord"],
  ["due", "Échéance la plus proche"],
  ["amount", "Montant décroissant"],
  ["client", "Client (A → Z)"],
]
const isOpen = (i: Invoice) => i.status === "emise" || i.status === "envoyee"
const dateOf = (i: Invoice) => i.issued_at || i.created_at.slice(0, 10)
const days = (d: string) => Math.round((Date.parse(d) - Date.parse(today())) / 86400000)
const monthOf = (d: string) => {
  const m = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(d))
  return m.charAt(0).toUpperCase() + m.slice(1)
}
const nameOf = (i: Invoice) => (i.customer as Party).name || "Client à indiquer"

function sortList(list: Invoice[], sort: Sort) {
  const byNum = (a: Invoice, b: Invoice) => (a.number || "").localeCompare(b.number || "", "fr", { numeric: true })
  const out = [...list]
  if (sort === "recent") out.sort((a, b) => Number(Boolean(a.number)) - Number(Boolean(b.number)) || dateOf(b).localeCompare(dateOf(a)) || byNum(b, a) || b.created_at.localeCompare(a.created_at))
  if (sort === "old") out.sort((a, b) => Number(!a.number) - Number(!b.number) || dateOf(a).localeCompare(dateOf(b)) || byNum(a, b))
  if (sort === "due") out.sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || (isOpen(a) ? String(a.due_at).localeCompare(String(b.due_at)) : dateOf(b).localeCompare(dateOf(a))))
  if (sort === "amount") out.sort((a, b) => Number(b.total_cents) - Number(a.total_cents))
  if (sort === "client") out.sort((a, b) => nameOf(a).localeCompare(nameOf(b), "fr") || byNum(a, b))
  return out
}

/** Regroupement : brouillons, puis un groupe par mois d'émission (tri par date seulement). */
function groupList(list: Invoice[], sort: Sort) {
  if (sort !== "recent" && sort !== "old") return [{ key: "all", title: "", list }]
  const groups: { key: string; title: string; list: Invoice[] }[] = []
  for (const i of list) {
    const key = i.number ? dateOf(i).slice(0, 7) : "draft"
    let g = groups.find((x) => x.key === key)
    if (!g) groups.push((g = { key, title: i.number ? monthOf(dateOf(i)) : "Brouillons", list: [] }))
    g.list.push(i)
  }
  return groups
}

/** Numérotation : par année, du premier au dernier numéro, avec les éventuels trous. */
function numbering(list: Invoice[]) {
  const years = new Map<string, number[]>()
  let prefix = "NX"
  for (const i of list) {
    const m = /^(.*)-(\d{4})-(\d+)$/.exec(i.number || "")
    if (!m) continue
    prefix = m[1]
    years.set(m[2], [...(years.get(m[2]) || []), Number(m[3])])
  }
  return [...years].sort().map(([year, nums]) => {
    nums.sort((a, b) => a - b)
    const gaps: number[] = []
    for (let n = nums[0]; n <= nums[nums.length - 1]; n++) if (!nums.includes(n)) gaps.push(n)
    const f = (n: number) => `${prefix}-${year}-${String(n).padStart(4, "0")}`
    return { year, from: f(nums[0]), to: f(nums[nums.length - 1]), count: nums.length, gaps: gaps.map(f) }
  })
}

function StatusPill({ status }: { status: string }) {
  return <span className={`inv-pill ${status}`}><i />{STATUS[status]?.[0] || status}</span>
}

function DueInfo({ i }: { i: Invoice }) {
  if (i.status === "payee") return <span className="inv-due ok">Payée le {fmtDate(i.paid_at)}</span>
  if (i.status === "annulee") return <span className="inv-due muted">Annulée</span>
  if (!i.number) return <span className="inv-due muted">Pas encore émise</span>
  if (!i.due_at) return <span className="inv-due muted">Sans échéance</span>
  const n = days(i.due_at)
  if (n < 0) return <span className="inv-due bad" title={`Échéance : ${fmtDate(i.due_at)}`}>En retard de {-n} j</span>
  if (n === 0) return <span className="inv-due warn">Échéance aujourd’hui</span>
  return <span className={`inv-due ${n <= 7 ? "warn" : ""}`} title={`Échéance : ${fmtDate(i.due_at)}`}>Échéance dans {n} j</span>
}

function InvoiceRow({ i }: { i: Invoice }) {
  const c = i.customer as Party
  return (
    <button className={`inv-row s-${i.status}`} onClick={() => go("invoices", i.id)}>
      <Avatar p={{ id: i.user_id || c.email, full_name: c.name, email: c.email }} size={36} />
      <span className="inv-who"><b className="ellipsis">{nameOf(i)}</b><small className="ellipsis">{[c.company && c.company !== c.name ? c.company : "", c.email].filter(Boolean).join(" · ") || "—"}</small></span>
      <span className="inv-num"><b>{i.number || "Brouillon"}</b><small>{i.number ? `Émise le ${fmtDate(i.issued_at)}` : `Créée le ${fmtDate(i.created_at)}`}</small></span>
      <DueInfo i={i} />
      <span className="inv-amt">{money(Number(i.total_cents), i.currency)}</span>
      <StatusPill status={i.status} />
      <Icon name="chevronRight" size={15} className="inv-go" />
    </button>
  )
}

function InvoiceList() {
  const refresh = useRefresh()
  const act = useAction()
  const [filter, setFilter] = useState<Filter>("all")
  const [sort, setSort] = useState<Sort>("recent")
  const [search, setSearch] = useState("")
  const [settings, setSettings] = useState(false)
  const q = useLoad(async () => must(await sb.from("invoices").select("*").order("created_at", { ascending: false }).limit(1000)) as Invoice[], [refresh])

  async function create() {
    await act.run(async () => {
      const issuer = await loadIssuer()
      const row = must(await sb.from("invoices").insert({ currency: issuer.currency || "EUR", tax_rate: Number(issuer.tax_rate) || 0, customer: {}, lines: [] }).select("id").single()) as { id: string }
      go("invoices", row.id)
    })
  }

  if (q.error && missing(q.error)) return <MissingBanner />
  return (
    <>
      <Loaded q={q}>
        {(list) => {
          const issued = list.filter((i) => i.number && i.status !== "annulee")
          const due = issued.filter(isOpen)
          const late = due.filter((i) => i.due_at && i.due_at < today())
          const match: Record<Filter, (i: Invoice) => boolean> = {
            all: () => true, draft: (i) => !i.number, due: isOpen, paid: (i) => i.status === "payee", void: (i) => i.status === "annulee",
          }
          const needle = search.toLowerCase()
          const shown = sortList(list.filter((i) => {
            const c = i.customer as Party
            return match[filter](i) && (!needle || `${i.number || ""} ${c.name || ""} ${c.email || ""} ${c.company || ""}`.toLowerCase().includes(needle))
          }), sort)
          const groups = groupList(shown, sort)
          const seq = numbering(list)
          const label = (f: Filter, l: string): [Filter, string] => [f, `${l} ${list.filter(match[f]).length}`]
          return (
            <>
              <div className="kpis">
                <Kpi icon="pdf" label="Facturé" value={sums(issued)} hint={`${issued.length} facture${issued.length > 1 ? "s" : ""} émise${issued.length > 1 ? "s" : ""}`} />
                <Kpi icon="check" label="Encaissé" value={sums(issued.filter((i) => i.status === "payee"))} tone="good" />
                <Kpi icon="clock" label="À encaisser" value={sums(due)} hint={late.length ? `dont ${late.length} en retard` : "Aucune en retard"} tone={late.length ? "warn" : ""} onClick={() => setFilter("due")} />
                <Kpi icon="pencil" label="Brouillons" value={list.filter((i) => !i.number).length} onClick={() => setFilter("draft")} />
              </div>
              <div className="toolbar">
                <Seg value={filter} options={[label("all", "Toutes"), label("draft", "Brouillons"), label("due", "À encaisser"), label("paid", "Payées"), label("void", "Annulées")]} onChange={setFilter} />
                <span className="grow" />
                <button className="btn" onClick={() => setSettings(true)}><Icon name="wrench" size={14} /> Émetteur et paiement</button>
                <button className="btn primary" disabled={act.busy} onClick={create}><Icon name="plus" size={14} /> Nouvelle facture</button>
              </div>
              <div className="toolbar">
                <SearchBox value={search} onSearch={setSearch} placeholder="Numéro, client, e-mail…" />
                <label className="inv-sort"><span>Trier</span>
                  <select className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Trier les factures">
                    {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <span className="grow" />
                <small className="muted">{shown.length} facture{shown.length > 1 ? "s" : ""} affichée{shown.length > 1 ? "s" : ""}</small>
              </div>
              {seq.length > 0 && (
                <div className="inv-seq">
                  <Icon name={seq.some((y) => y.gaps.length) ? "warn" : "check"} size={14} />
                  {seq.map((y) => (
                    <span key={y.year}>
                      <b>{y.year}</b> : {y.count} facture{y.count > 1 ? "s" : ""} numérotée{y.count > 1 ? "s" : ""}, de {y.from} à {y.to}
                      {y.gaps.length ? <em> · numéros manquants : {y.gaps.join(", ")}</em> : " · numérotation continue"}
                    </span>
                  ))}
                </div>
              )}
              {shown.length === 0 ? (
                <div className="card"><Empty icon="pdf">{list.length ? "Aucune facture pour ce filtre." : "Aucune facture pour l’instant : créez la première avec « Nouvelle facture »."}</Empty></div>
              ) : groups.map((g) => (
                <section key={g.key} className="inv-group">
                  {g.title && (
                    <header>
                      <h3>{g.title}</h3>
                      <span>{g.list.length} {g.key === "draft" ? `brouillon${g.list.length > 1 ? "s" : ""}` : `facture${g.list.length > 1 ? "s" : ""}`}{g.key !== "draft" ? ` · ${sums(g.list.filter((i) => i.status !== "annulee"))}` : ""}</span>
                    </header>
                  )}
                  <div className="inv-list">{g.list.map((i) => <InvoiceRow key={i.id} i={i} />)}</div>
                </section>
              ))}
            </>
          )
        }}
      </Loaded>
      {settings && <IssuerSettings onClose={() => setSettings(false)} />}
    </>
  )
}

/* ---------------------------------------------------------------- Éditeur */

function InvoiceEditor({ id }: { id: string }) {
  const refresh = useRefresh()
  const [tick, setTick] = useState(0)
  // Gardé ici : l'éditeur est recréé après chaque rechargement, le résultat d'un envoi doit rester affiché.
  const [outcome, setOutcome] = useState<Outcome>(null)
  const q = useLoad(async () => {
    const [inv, issuer, people, orgs, plans] = await Promise.all([
      sb.from("invoices").select("*").eq("id", id).single().then(must) as Promise<Invoice>,
      loadIssuer(),
      sb.from("profiles").select("id, email, full_name, company").order("full_name").limit(1000).then(must) as Promise<Person[]>,
      sb.from("organizations").select("id, name, personal, owner_id").order("name").limit(1000).then(must) as Promise<Org[]>,
      sb.from("plans").select("id, name, price_month_cents, price_year_cents, currency").order("sort").then(must) as Promise<Plan[]>,
    ])
    return { inv, issuer, people, orgs, plans }
  }, [id, refresh, tick])
  if (q.error && missing(q.error)) return <MissingBanner />
  return (
    <Loaded q={q}>
      {(d) => <Editor key={`${d.inv.id}-${d.inv.updated_at}`} {...d} outcome={outcome} setOutcome={setOutcome} onReload={() => setTick((n) => n + 1)} />}
    </Loaded>
  )
}

function Editor({ inv, issuer, people, orgs, plans, outcome, setOutcome, onReload }: {
  inv: Invoice; issuer: Issuer; people: Person[]; orgs: Org[]; plans: Plan[]; outcome: Outcome; setOutcome: (o: Outcome) => void; onReload: () => void
}) {
  const ui = useUi()
  const act = useAction()
  const [d, setD] = useState<Draft>(() => draftOf(inv))
  const [pdfUrl, setPdfUrl] = useState("")
  const [pdfError, setPdfError] = useState("")
  const [sending, setSending] = useState(false)
  const locked = Boolean(inv.number)
  const dirty = JSON.stringify(d) !== JSON.stringify(draftOf(inv))
  const customer = (d.customer as Party) || {}
  const lines = (d.lines as InvoiceLine[]) || []
  const t = totals(lines, Number(d.tax_rate) || 0)
  const doc = useMemo(() => docOf(inv, d, issuer), [inv, d, issuer])
  const setCustomer = (patch: Partial<Party>) => setD({ ...d, customer: { ...customer, ...patch } as Json })
  const setLines = (next: InvoiceLine[]) => setD({ ...d, lines: next as unknown as Json })

  // Aperçu PDF en direct (régénéré peu après chaque modification).
  useEffect(() => {
    let url = ""
    const timer = setTimeout(async () => {
      try {
        const { bytes } = await makePdf(doc)
        url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }))
        setPdfUrl(url)
        setPdfError("")
      } catch (e) {
        setPdfError(errMsg(e))
      }
    }, 450)
    return () => { clearTimeout(timer); if (url) setTimeout(() => URL.revokeObjectURL(url), 5000) }
  }, [doc])

  const save = async () => must(await sb.from("invoices").update(d).eq("id", inv.id))

  function pickPerson(pid: string) {
    const p = people.find((x) => x.id === pid)
    if (!p) return setD({ ...d, user_id: null, org_id: null })
    const org = orgs.find((o) => o.personal && o.owner_id === p.id) || null
    setD({ ...d, user_id: p.id, org_id: org?.id || null, customer: { ...customer, name: p.full_name || p.email || "", email: p.email || "", company: p.company || customer.company || "" } as Json })
  }
  function addPlan(v: string) {
    const [pid, period] = v.split("|")
    const p = plans.find((x) => x.id === pid)
    if (!p) return
    const cents = period === "year" ? p.price_year_cents : p.price_month_cents
    const label = period === "year" ? `NEXORA ${p.name} — abonnement annuel` : `NEXORA ${p.name} — abonnement mensuel (${monthYear()})`
    setD({ ...d, currency: lines.length ? d.currency : p.currency || d.currency, lines: [...lines, { label, qty: 1, unit_cents: cents }] as unknown as Json })
  }

  async function issue() {
    if (!customer.name?.trim()) return ui.toast("Indiquez le nom du client.", "bad")
    if (!lines.length) return ui.toast("Ajoutez au moins une ligne.", "bad")
    if (!(await ui.confirm({ title: "Émettre la facture ?", body: <>Elle reçoit le numéro suivant ({issuer.prefix || "NX"}-{new Date().getFullYear()}-…), la date du jour et l’échéance, puis ne peut plus être modifiée. Total : <b>{money(t.total, d.currency)}</b>.</>, confirm: "Émettre" }))) return
    if (await act.run(async () => { if (dirty) await save(); must(await sb.rpc("nx_invoice_issue", { p_id: inv.id })) }, "Facture émise.")) onReload()
  }
  async function setStatus(status: string, ok: string) {
    const patch = status === "payee" ? { status, paid_at: new Date().toISOString() } : { status, paid_at: null }
    if (await act.run(async () => must(await sb.from("invoices").update(patch).eq("id", inv.id)), ok)) onReload()
  }
  async function cancel() {
    if (!(await ui.confirm({ title: `Annuler la facture ${inv.number} ?`, body: "Elle reste dans la liste avec la mention « Annulée » (son numéro n’est pas réutilisé). Créez une nouvelle facture si besoin.", confirm: "Annuler la facture", danger: true }))) return
    await setStatus("annulee", "Facture annulée.")
  }
  async function remove() {
    if (!(await ui.confirm({ title: "Supprimer ce brouillon ?", body: "Il n’a pas encore de numéro : rien n’est perdu dans la numérotation.", confirm: "Supprimer", danger: true }))) return
    if (await act.run(async () => must(await sb.from("invoices").delete().eq("id", inv.id)), "Brouillon supprimé.")) go("invoices")
  }

  const due = d.due_at || ""
  return (
    <>
      <div className="toolbar">
        <button className="btn" onClick={() => go("invoices")}><Icon name="back" size={14} /> Factures</button>
        <h2 className="grow invoice-title">{inv.number ? `Facture ${inv.number}` : "Nouvelle facture"} <StatusPill status={inv.status} /></h2>
        {!locked ? (
          <>
            <button className="btn danger" disabled={act.busy} onClick={remove}><Icon name="trash" size={14} /> Supprimer</button>
            <button className="btn" disabled={act.busy || !dirty} onClick={() => act.run(save, "Brouillon enregistré.").then((ok) => ok && onReload())}>Enregistrer</button>
            <button className="btn primary" disabled={act.busy} onClick={issue}><Icon name="check" size={14} /> Émettre la facture</button>
          </>
        ) : (
          <>
            {inv.status !== "annulee" && <button className="btn danger" disabled={act.busy} onClick={cancel}>Annuler</button>}
            {inv.status === "payee"
              ? <button className="btn" disabled={act.busy} onClick={() => setStatus(inv.sent_at ? "envoyee" : "emise", "Facture marquée comme non payée.")}>Marquer non payée</button>
              : inv.status !== "annulee" && <button className="btn" disabled={act.busy} onClick={() => setStatus("payee", "Facture marquée comme payée.")}><Icon name="check" size={14} /> Marquer payée</button>}
            <button className="btn" disabled={act.busy} onClick={() => act.run(async () => download((await makePdf(doc)).bytes, invoiceFile(inv.number)))}><Icon name="download" size={14} /> PDF</button>
            {inv.status !== "annulee" && <button className="btn primary" onClick={() => setSending(true)}><Icon name="mail" size={14} /> Envoyer par e-mail</button>}
          </>
        )}
      </div>
      <OutcomeBanner outcome={outcome} onClose={() => setOutcome(null)} />
      <Timeline inv={inv} />

      <div className="invoice-layout">
        <div className="stack">
          <fieldset className="card form" disabled={locked}>
            <div className="card-head"><span className="inv-step">1</span><h3 className="grow">Client</h3>{locked && <small className="muted"><Icon name="lock" size={12} /> figé à l’émission</small>}</div>
            {!locked && (
              <label className="field"><span>Compte NEXORA</span>
                <select className="input" value={d.user_id || ""} onChange={(e) => pickPerson(e.target.value)}>
                  <option value="">Saisie libre (sans compte)</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.full_name || "—"} · {p.email}</option>)}
                </select>
                <small>Remplit le nom, la société et l’adresse e-mail ; la facture apparaît dans le compte du client.</small>
              </label>
            )}
            <div className="grid2">
              <label className="field"><span>Nom</span><input className="input" value={customer.name || ""} onChange={(e) => setCustomer({ name: e.target.value })} placeholder="Camille Laurent" /></label>
              <label className="field"><span>Société</span><input className="input" value={customer.company || ""} onChange={(e) => setCustomer({ company: e.target.value })} placeholder="Facultatif" /></label>
              <label className="field"><span>Adresse e-mail</span><input className="input" type="email" value={customer.email || ""} onChange={(e) => setCustomer({ email: e.target.value })} placeholder="client@exemple.fr" /></label>
              <label className="field"><span>N° fiscal (TVA, SIRET, IFU…)</span><input className="input" value={customer.tax_id || ""} onChange={(e) => setCustomer({ tax_id: e.target.value })} placeholder="Facultatif" /></label>
            </div>
            <label className="field"><span>Adresse postale</span><textarea className="input" rows={2} value={customer.address || ""} onChange={(e) => setCustomer({ address: e.target.value })} placeholder={"12 rue des Lilas\n75011 Paris, France"} /></label>
          </fieldset>

          <fieldset className="card form" disabled={locked}>
            <div className="card-head"><span className="inv-step">2</span><h3 className="grow">Lignes</h3>
              {!locked && plans.length > 0 && (
                <select className="input sm" value="" onChange={(e) => addPlan(e.target.value)} aria-label="Ajouter un abonnement">
                  <option value="">Ajouter un abonnement…</option>
                  {plans.filter((p) => p.price_month_cents > 0 || p.price_year_cents > 0).flatMap((p) => [
                    <option key={`${p.id}m`} value={`${p.id}|month`}>{p.name} · mensuel · {money(p.price_month_cents, p.currency)}</option>,
                    <option key={`${p.id}y`} value={`${p.id}|year`}>{p.name} · annuel · {money(p.price_year_cents, p.currency)}</option>,
                  ])}
                </select>
              )}
            </div>
            <div className="inv-lines">
              {lines.map((l, i) => (
                <div className="inv-line" key={i}>
                  <span className="inv-line-n">{String(i + 1).padStart(2, "0")}</span>
                  <input className="input inv-line-desc" value={l.label} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Description de la ligne" aria-label={`Description de la ligne ${i + 1}`} />
                  <label className="inv-mini inv-qty"><span>Qté</span><input className="input" type="number" min={0} step={0.5} value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} aria-label={`Quantité de la ligne ${i + 1}`} /></label>
                  <label className="inv-mini inv-unit"><span>Prix HT</span><input className="input" type="number" min={0} step={0.01} value={(Number(l.unit_cents) || 0) / 100} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unit_cents: Math.round(Number(e.target.value) * 100) } : x)))} aria-label={`Prix unitaire HT de la ligne ${i + 1}`} /></label>
                  <span className="inv-mini inv-line-total"><span>Total HT</span><b>{money(Math.round((Number(l.qty) || 0) * (Number(l.unit_cents) || 0)), d.currency)}</b></span>
                  {!locked ? (
                    <span className="inv-line-act">
                      <button className="icon-btn" title="Monter la ligne" aria-label="Monter la ligne" disabled={i === 0} onClick={() => setLines(move(lines, i, i - 1))}><Icon name="chevronUp" size={13} /></button>
                      <button className="icon-btn" title="Descendre la ligne" aria-label="Descendre la ligne" disabled={i === lines.length - 1} onClick={() => setLines(move(lines, i, i + 1))}><Icon name="chevronDown" size={13} /></button>
                      <button className="icon-btn danger" title="Retirer la ligne" aria-label="Retirer la ligne" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Icon name="close" size={12} /></button>
                    </span>
                  ) : <span />}
                </div>
              ))}
              {!lines.length && <p className="muted small" style={{ margin: "4px 0" }}>Aucune ligne : ajoutez un abonnement ou une ligne libre.</p>}
            </div>
            {!locked && <div><button className="btn sm" onClick={() => setLines([...lines, { label: "", qty: 1, unit_cents: 0 }])}><Icon name="plus" size={13} /> Ajouter une ligne</button></div>}
            <div className="inv-totals">
              <div><span>Sous-total HT</span><b>{money(t.subtotal, d.currency)}</b></div>
              <div><span>{Number(d.tax_rate) > 0 ? `TVA (${d.tax_rate} %)` : issuer.vat_note || "TVA non applicable"}</span><b>{money(t.tax, d.currency)}</b></div>
              <div className="total"><span>{Number(d.tax_rate) > 0 ? "Total TTC" : "Total"}</span><b>{money(t.total, d.currency)}</b></div>
            </div>
          </fieldset>

          <fieldset className="card form" disabled={locked && inv.status === "annulee"}>
            <div className="card-head"><span className="inv-step">3</span><h3 className="grow">Conditions</h3></div>
            <div className="grid3">
              <label className="field"><span>Devise</span><select className="input" disabled={locked} value={d.currency} onChange={(e) => setD({ ...d, currency: e.target.value })}>{CURRENCIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label className="field"><span>TVA (%)</span><input className="input" disabled={locked} type="number" min={0} max={100} step={0.1} value={d.tax_rate} onChange={(e) => setD({ ...d, tax_rate: Number(e.target.value) })} /></label>
              <label className="field"><span>Échéance</span><input className="input" type="date" value={due} onChange={(e) => setD({ ...d, due_at: e.target.value || null })} /><small>{due ? "" : `À l’émission + ${issuer.due_days || 30} jours`}</small></label>
            </div>
            <label className="field"><span>Note sur la facture</span><textarea className="input" rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Facultatif : période couverte, bon de commande…" /></label>
            {locked && dirty && <div className="actions"><button className="btn primary" disabled={act.busy} onClick={() => act.run(save, "Échéance et note enregistrées.").then((ok) => ok && onReload())}>Enregistrer l’échéance et la note</button></div>}
          </fieldset>
        </div>

        <div className="invoice-side">
        <div className="card inv-summary">
          <div>
            <small>{inv.status === "payee" ? "Montant réglé" : "Montant dû"}</small>
            <b>{money(t.total, d.currency)}</b>
          </div>
          <dl>
            <dt>Client</dt><dd className="ellipsis">{customer.name || "À indiquer"}</dd>
            <dt>{inv.status === "payee" ? "Payée le" : "Échéance"}</dt><dd>{inv.status === "payee" ? longDate(inv.paid_at) : due ? longDate(due) : `À l’émission + ${issuer.due_days || 30} j`}</dd>
            <dt>Lignes</dt><dd>{lines.length}</dd>
          </dl>
        </div>
        <div className="card invoice-pdf">
          <div className="card-head"><Icon name="pdf" size={16} /><h3 className="grow">Aperçu du PDF</h3><small className="muted">{invoiceFile(inv.number)}</small></div>
          {pdfError ? <div className="alert">{pdfError}</div> : pdfUrl ? <iframe title="Aperçu du PDF de la facture" src={`${pdfUrl}#toolbar=0&navpanes=0&view=FitH`} /> : <div className="loading" aria-busy="true"><span className="spinner" /></div>}
        </div>
        </div>
      </div>
      {sending && <SendInvoice inv={inv} doc={doc} onClose={() => setSending(false)} onSent={(o) => { setSending(false); setOutcome(o); onReload() }} />}
    </>
  )
}

/** Déplace une ligne (réordonnancement dans l'éditeur). */
function move<T>(list: T[], from: number, to: number) {
  const out = [...list]
  const [x] = out.splice(from, 1)
  out.splice(to, 0, x)
  return out
}

/** Frise d'avancement : brouillon → émise → envoyée → payée (ou annulée). */
function Timeline({ inv }: { inv: Invoice }) {
  const steps: { label: string; when: string; done: boolean; tone?: string }[] = [
    { label: "Brouillon", when: `Créé le ${fmtDate(inv.created_at)}`, done: true },
    { label: "Émise", when: inv.issued_at ? `${inv.number} · ${fmtDate(inv.issued_at)}` : "Numéro attribué à l’émission", done: Boolean(inv.number) },
    { label: "Envoyée", when: inv.sent_at ? `${fmtDate(inv.sent_at)} · ${inv.sent_to}` : "Par e-mail, PDF joint", done: Boolean(inv.sent_at) },
    inv.status === "annulee"
      ? { label: "Annulée", when: "Numéro conservé, non réutilisé", done: true, tone: "bad" }
      : { label: "Payée", when: inv.paid_at ? fmtDate(inv.paid_at) : inv.due_at ? `Échéance le ${fmtDate(inv.due_at)}` : "En attente du paiement", done: inv.status === "payee", tone: "ok" },
  ]
  const current = steps.reduce((n, st, i) => (st.done ? i : n), 0)
  return (
    <ol className="inv-timeline">
      {steps.map((st, i) => (
        <li key={st.label} className={`${st.done ? "done" : ""} ${i === current ? "current" : ""} ${st.tone || ""}`}>
          <span className="dot">{st.done ? <Icon name={st.tone === "bad" ? "close" : "check"} size={12} /> : i + 1}</span>
          <span><b>{st.label}</b><small>{st.when}</small></span>
        </li>
      ))}
    </ol>
  )
}

/* ---------------------------------------------------------------- Envoi par e-mail */

function SendInvoice({ inv, doc, onClose, onSent }: { inv: Invoice; doc: InvoiceDoc; onClose: () => void; onSent: (o: Outcome) => void }) {
  const act = useAction()
  const [to, setTo] = useState(doc.customer.email || "")
  const [name, setName] = useState(doc.customer.name || "")
  const [error, setError] = useState("")
  const t = totals(doc.lines, doc.taxRate)
  const mail = useMemo(() => invoiceEmail({
    number: inv.number || "", greeting: hello(name), total: money(t.total, doc.currency), issuedAt: longDate(inv.issued_at), dueAt: longDate(doc.dueAt),
    paid: inv.status === "payee", filename: invoiceFile(inv.number), payment: doc.issuer.payment || "", issuerName: doc.issuer.name || "NEXORA",
  }), [inv, doc, name, t.total])
  const [subject, setSubject] = useState(mail.subject)
  const okTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())

  async function send() {
    setError("")
    await act.run(async () => {
      try {
        const pdf = await makePdf(doc)
        const res = must(await sb.rpc("nx_invoice_send", {
          p_id: inv.id, p_to: to.trim(), p_to_name: name.trim(), p_subject: subject.trim() || mail.subject, p_html: mail.html, p_text: mail.text || "",
          p_pdf_base64: pdf.base64(), p_filename: invoiceFile(inv.number),
        })) as { id: number }
        const b = await waitBrevo(res.id)
        if (!b.ok) throw new Error(b.text)
        onSent({ ok: true, text: `Facture ${inv.number} envoyée à ${to.trim()} avec le PDF en pièce jointe. ${b.text}`, at: Date.now() })
      } catch (e) {
        setError(errMsg(e))
        throw e
      }
    })
  }

  return (
    <Modal title={`Envoyer la facture ${inv.number}`} onClose={onClose} width={860}>
      <div className="invoice-send">
        <div className="form">
          <label className="field"><span>Destinataire</span><input className="input" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@exemple.fr" autoFocus /></label>
          <label className="field"><span>Nom</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span>Objet</span><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <div className="attach"><Icon name="pdf" size={18} /><div><b>{invoiceFile(inv.number)}</b><small className="muted">PDF généré à l’envoi · {money(t.total, doc.currency)}</small></div></div>
          <p className="muted small" style={{ margin: 0 }}>Expéditeur : {setup.email.senderName} &lt;{setup.email.senderEmail}&gt;. Les réponses arrivent à cette adresse.</p>
          {error && <div className="alert">{error}</div>}
          <div className="actions">
            <button className="btn" onClick={onClose}>Fermer</button>
            <button className="btn primary" disabled={act.busy || !okTo} onClick={send}>{act.busy ? <span className="spinner sm" /> : <><Icon name="mail" size={14} /> Envoyer</>}</button>
          </div>
        </div>
        <div className="email-stage small"><EmailFrame html={mail.html} width={520} title="Aperçu de l’e-mail de la facture" /></div>
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------------- Émetteur */

function IssuerSettings({ onClose }: { onClose: () => void }) {
  const act = useAction()
  const q = useLoad(loadIssuer, [])
  return (
    <Modal title="Émetteur et paiement" onClose={onClose} width={720}>
      <Loaded q={q}>
        {(issuer) => <IssuerForm issuer={issuer} busy={act.busy} onCancel={onClose} onSave={async (v) => {
          if (await act.run(async () => must(await sb.from("nx_private_config").upsert({ key: "invoice_issuer", value: v as unknown as Json, updated_at: new Date().toISOString() })), "Émetteur enregistré.")) onClose()
        }} />}
      </Loaded>
    </Modal>
  )
}

function IssuerForm({ issuer, busy, onSave, onCancel }: { issuer: Issuer; busy: boolean; onSave: (v: Issuer) => void; onCancel: () => void }) {
  const [v, setV] = useState(issuer)
  const f = (k: keyof Issuer, label: string, o: { ph?: string; area?: boolean; type?: string; hint?: string } = {}) => (
    <label className="field"><span>{label}</span>
      {o.area
        ? <textarea className="input" rows={2} value={String(v[k] ?? "")} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder={o.ph} />
        : <input className="input" type={o.type || "text"} value={String(v[k] ?? "")} onChange={(e) => setV({ ...v, [k]: o.type === "number" ? Number(e.target.value) : e.target.value })} placeholder={o.ph} />}
      {o.hint && <small>{o.hint}</small>}
    </label>
  )
  return (
    <div className="form">
      <p className="muted small" style={{ margin: 0 }}>Imprimé sur chaque facture et figé à son émission. Lisible par les administrateurs seulement.</p>
      <div className="grid2">
        {f("name", "Nom ou raison sociale", { ph: "NEXORA" })}
        {f("tax_id", "N° fiscal (SIRET, IFU, TVA…)", { ph: "Facultatif" })}
        {f("email", "Adresse e-mail", { type: "email" })}
        {f("phone", "Téléphone", { ph: "+229 …" })}
        {f("website", "Site web")}
        {f("prefix", "Préfixe des numéros", { hint: `Exemple : ${(v.prefix || "NX").replace(/[^A-Za-z0-9]/g, "") || "NX"}-${new Date().getFullYear()}-0001` })}
      </div>
      {f("address", "Adresse", { area: true, ph: "Rue, ville, pays" })}
      <div className="grid3">
        <label className="field"><span>Devise par défaut</span><select className="input" value={v.currency || "EUR"} onChange={(e) => setV({ ...v, currency: e.target.value })}>{CURRENCIES.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></label>
        {f("tax_rate", "TVA par défaut (%)", { type: "number" })}
        {f("due_days", "Délai de paiement (jours)", { type: "number" })}
      </div>
      {f("vat_note", "Mention si TVA à 0 %", { ph: "TVA non applicable, art. 293 B du CGI" })}
      {f("payment", "Modalités de paiement", { area: true, ph: "Virement : IBAN …\nMobile Money : +229 …", hint: "Reprises dans le PDF et dans l’e-mail tant que la facture n’est pas payée." })}
      {f("footer", "Remerciement en pied de page", { ph: "Merci de votre confiance." })}
      <div className="actions">
        <button className="btn" onClick={onCancel}>Annuler</button>
        <button className="btn primary" disabled={busy || !String(v.name || "").trim()} onClick={() => onSave(v)}>Enregistrer</button>
      </div>
    </div>
  )
}
