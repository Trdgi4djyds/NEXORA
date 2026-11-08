// Composants et utilitaires partagés du back office.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import { errText } from "./supabase"
import { Icon } from "./icons"
// NEXORA #033 : illustrations de fond des cartes, même générateur que l'application.
import { attach as attachIllustration } from "../../nexora/app/renderer/nx/cards/illu.js"
// NEXORA #037 : objet illustré choisi d'après le libellé de la carte, sinon d'après son icône.
import { objectFor } from "../../nexora/app/renderer/nx/cards/objects.js"

/* ---------------------------------------------------------------- Formats */

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" })
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
})
export const fmtDate = (v?: string | null) => (v ? dateFmt.format(new Date(v)) : "—")
export const fmtDateTime = (v?: string | null) => (v ? dateTimeFmt.format(new Date(v)) : "—")
export function fmtAgo(v?: string | null) {
  if (!v) return "—"
  const s = (Date.now() - new Date(v).getTime()) / 1000
  if (s < 0) return fmtDateTime(v)
  if (s < 60) return "à l’instant"
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`
  if (s < 86400 * 30) return `il y a ${Math.floor(s / 86400)} j`
  return fmtDate(v)
}
export const fmtNum = (n?: number | null) => (n == null ? "—" : new Intl.NumberFormat("fr-FR").format(n))
/** Nombre décimal à la française (virgule). */
export const fmtDec = (n: number, digits = 1) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
export function fmtBytes(n?: number | null) {
  if (n == null) return "—"
  if (n < 1024) return `${n} o`
  if (n < 1048576) return `${fmtDec(n / 1024)} Ko`
  if (n < 1073741824) return `${fmtDec(n / 1048576)} Mo`
  return `${fmtDec(n / 1073741824, 2)} Go`
}
/** « 1 design », « 3 designs ». */
export const plural = (n: number, one: string, many = `${one}s`) => `${fmtNum(n)} ${n > 1 ? many : one}`
export function fmtMoney(cents?: number | null, currency = "EUR") {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(
    (cents || 0) / 100,
  )
}
export const STATUS_LABEL: Record<string, string> = {
  open: "Ouvert",
  pending: "En attente",
  resolved: "Résolu",
  closed: "Fermé",
}
export const PRIORITY_LABEL: Record<string, string> = {
  low: "Basse",
  normal: "Normale",
  high: "Haute",
  urgent: "Urgente",
}
export const ROLE_LABEL: Record<string, string> = {
  user: "Utilisateur",
  admin: "Admin",
  superadmin: "Super-admin",
  owner: "Propriétaire",
  editor: "Éditeur",
  viewer: "Lecteur",
}
export const LIMIT_LABEL: Record<string, string> = {
  projects: "Projets",
  designs: "Documents NEX-DESIGN",
  members: "Membres par espace",
  monitors: "Sites surveillés",
  storage_mb: "Stockage (Mo)",
  scans_per_day: "Audits de sécurité par jour",
  scans: "Audits",
  exports: "Exports",
  ai_requests: "Requêtes IA",
  // NEXORA #037
  apps: "Applications",
  // NEXORA #087
  apps_lifetime: "Applications comptées à vie (1 = oui, supprimées comprises)",
  builds_per_app_month: "Constructions par application et par mois",
  app_trial_days: "Jours d’essai par application",
  ai_requests_month: "Requêtes IA par mois",
  crawls_per_day: "Crawls par jour",
  builds_month: "Constructions par mois",
  push_month: "Envois push par mois",
}
export const INVITE_LABEL: Record<string, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  expired: "Expirée",
  revoked: "Annulée",
  declined: "Refusée",
}
export const SUB_LABEL: Record<string, string> = {
  active: "Active",
  trialing: "Essai",
  past_due: "Impayée",
  canceled: "Résiliée",
}

/* ---------------------------------------------------------------- Données */

/** Charge des données asynchrones ; `reload()` relance la même requête. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  const seq = useRef(0)
  const run = useCallback(() => {
    const id = ++seq.current
    setState((s) => ({ ...s, loading: true, error: undefined }))
    fn().then(
      (data) => id === seq.current && setState({ data, loading: false }),
      (e) => id === seq.current && setState({ error: errText(e), loading: false }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(run, [run])
  return { ...state, reload: run }
}

/* ---------------------------------------------------------------- Notifications et confirmations */

type Toast = { id: number; text: string; kind: "ok" | "bad" | "info" }
type Confirm = {
  title: string
  body?: ReactNode
  confirm?: string
  danger?: boolean
  resolve: (ok: boolean) => void
}
type UiApi = {
  toast: (text: string, kind?: Toast["kind"]) => void
  fail: (e: unknown) => void
  confirm: (o: Omit<Confirm, "resolve">) => Promise<boolean>
}
const UiCtx = createContext<UiApi>(null as unknown as UiApi)
export const useUi = () => useContext(UiCtx)

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [ask, setAsk] = useState<Confirm | null>(null)
  const toast = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-3), { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "bad" ? 10000 : 4500)
  }, [])
  const api = useRef<UiApi>({
    toast,
    fail: (e) => toast(errText(e), "bad"),
    confirm: (o) => new Promise((resolve) => setAsk({ ...o, resolve })),
  }).current
  const close = (ok: boolean) => {
    ask?.resolve(ok)
    setAsk(null)
  }
  return (
    <UiCtx.Provider value={api}>
      {children}
      {ask && (
        <Modal title={ask.title} onClose={() => close(false)}>
          {ask.body && <p>{ask.body}</p>}
          <div className="actions">
            <button className="btn" onClick={() => close(false)}>
              Annuler
            </button>
            <button
              className={`btn ${ask.danger ? "danger solid" : "primary"}`}
              autoFocus
              onClick={() => close(true)}
            >
              {ask.confirm || "Confirmer"}
            </button>
          </div>
        </Modal>
      )}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <Icon name={t.kind === "bad" ? "error" : t.kind === "ok" ? "check" : "info"} size={15} />
            {t.text}
          </div>
        ))}
      </div>
    </UiCtx.Provider>
  )
}

/** Exécute une action avec retour visuel (notification de succès ou d'erreur). */
export function useAction() {
  const ui = useUi()
  const [busy, setBusy] = useState(false)
  const run = useCallback(
    async (fn: () => Promise<unknown>, ok?: string) => {
      setBusy(true)
      try {
        await fn()
        if (ok) ui.toast(ok)
        return true
      } catch (e) {
        ui.fail(e)
        return false
      } finally {
        setBusy(false)
      }
    },
    [ui],
  )
  return { busy, run }
}

/* ---------------------------------------------------------------- Composants */

export function Loading() {
  return (
    <div className="loading" aria-busy="true">
      <span className="spinner" />
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="alert row">
      <span className="grow">{error}</span>
      {onRetry && (
        <button className="btn sm" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  )
}

/** Affiche le chargement, l'erreur ou le contenu d'un useLoad. */
export function Loaded<T>({
  q,
  children,
}: {
  q: { data?: T; error?: string; loading: boolean; reload: () => void }
  children: (data: T) => ReactNode
}) {
  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />
  if (q.data === undefined) return <Loading />
  return <>{children(q.data)}</>
}

const KPI_TONES = { good: "menthe", warn: "orange", bad: "corail" } as const

/* NEXORA #040 : couleurs des cartes (tuile d'icône pastel), stables d'après le libellé. */
export const HUES = ["mint", "lav", "sky", "peach", "lime", "rose"] as const
export function hueOf(seed: string) {
  let h = 0
  for (const c of seed) h = (h * 33 + c.charCodeAt(0)) >>> 0
  return HUES[h % HUES.length]
}

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

/** Sépare « 56,00 $US » en préfixe, nombre (décimales comprises) et unité. */
function splitNum(s: string) {
  const m = s.match(/^(\D*?)(\d[\d\s\u00a0\u202f]*(?:,\d+)?)(.*)$/)
  if (!m) return null
  const raw = m[2].replace(/[\s\u00a0\u202f]+$/, "")
  const num = Number(raw.replace(/[\s\u00a0\u202f]/g, "").replace(",", "."))
  if (!Number.isFinite(num)) return null
  return { pre: m[1], num, dec: (raw.split(",")[1] || "").length, suf: m[2].slice(raw.length) + m[3] }
}

/** NEXORA #040 : chiffre qui monte jusqu'à sa valeur à l'affichage ; unité en plus léger. */
export function CountUp({ value }: { value: ReactNode }) {
  const parts = typeof value === "string" ? splitNum(value) : null
  const [k, setK] = useState(1)
  useEffect(() => {
    if (!parts || reducedMotion()) return setK(1)
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 900)
      setK(1 - Math.pow(1 - t, 3))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    setK(0)
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeof value === "string" ? value : null])
  if (!parts) return <>{value}</>
  const shown =
    k >= 1
      ? (value as string).slice(parts.pre.length, (value as string).length - parts.suf.length)
      : new Intl.NumberFormat("fr-FR", { minimumFractionDigits: parts.dec, maximumFractionDigits: parts.dec }).format(parts.num * k)
  return (
    <>
      {parts.pre}
      {shown}
      {parts.suf && <i className="unit">{parts.suf}</i>}
    </>
  )
}

export function Kpi({
  label,
  value,
  hint,
  tone = "",
  icon,
  object,
  onClick,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: "" | "good" | "warn" | "bad"
  icon?: string
  /** NEXORA #037 : objet illustré imposé (sinon choisi d'après le libellé et l'icône). */
  object?: string
  onClick?: () => void
}) {
  // Illustration de fond (NEXORA #033) : motif et teinte tirés au hasard à chaque ouverture du back
  // office, différents d'une carte à l'autre ; teinte imposée pour les états (bon, attention, alerte).
  const host = useRef<HTMLElement | null>(null)
  const layer = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    if (!host.current || !layer.current) return
    return attachIllustration(host.current, { key: `kpi:${label}`, tone: tone ? KPI_TONES[tone] : undefined, object: object || objectFor(label, icon), layout: "badge", layer: layer.current })
  }, [label, tone, icon, object])
  const inner = (
    <>
      <span className="nxi" aria-hidden="true" ref={layer} />
      <small>
        {icon && (
          <i className="kpi-ic">
            <Icon name={icon} size={15} />
          </i>
        )}
        {label}
      </small>
      <b>
        <CountUp value={value} />
      </b>
      {hint && <span>{hint}</span>}
    </>
  )
  const hue = hueOf(label)
  return onClick ? (
    <button className={`kpi ${tone}`} data-hue={hue} onClick={onClick} ref={(el) => { host.current = el }}>
      {inner}
    </button>
  ) : (
    <div className={`kpi ${tone}`} data-hue={hue} ref={(el) => { host.current = el }}>{inner}</div>
  )
}

/* ---------------------------------------------------------------- Anneaux et donuts (NEXORA #040) */

/** Carte à anneau de progression : valeur au centre, titre et explication à droite. */
export function RingCard({
  value,
  max,
  center,
  title,
  sub,
  hue = "mint",
  soft,
  onClick,
}: {
  value: number
  max: number
  center?: ReactNode
  title: ReactNode
  sub?: ReactNode
  hue?: (typeof HUES)[number]
  /** Fond teinté de la couleur de la carte (sinon blanc en clair, noir en sombre). */
  soft?: boolean
  onClick?: () => void
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const C = 2 * Math.PI * 23
  const body = (
    <>
      <span className="ring">
        <svg viewBox="0 0 56 56" aria-hidden="true">
          <circle className="ring-track" cx="28" cy="28" r="23" />
          <circle className="ring-val" cx="28" cy="28" r="23" strokeDasharray={`${pct * C} ${C}`} />
        </svg>
        <b>{center ?? `${Math.round(pct * 100)}`}</b>
      </span>
      <span className="ring-text">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </span>
      {onClick && (
        <i className="go-chip" aria-hidden="true">
          <Icon name="chevronRight" size={14} />
        </i>
      )}
    </>
  )
  const cls = `ring-card${soft ? " soft" : ""}`
  return onClick ? (
    <button className={cls} data-hue={hue} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={cls} data-hue={hue}>
      {body}
    </div>
  )
}

/** Répartition en donut avec légende (valeur et part de chaque élément). */
export function Donut({
  data,
  labels,
  colors = {},
  caption = "au total",
}: {
  data: Record<string, number>
  labels: Record<string, string>
  colors?: Record<string, string>
  caption?: string
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  const total = entries.reduce((s, [, n]) => s + n, 0)
  if (!entries.length || !total) return <Empty>Aucune donnée pour l’instant.</Empty>
  const R = 40
  const C = 2 * Math.PI * R
  const gap = entries.length > 1 ? 2.5 : 0
  const fallback = ["#1f9d6b", "#7b61ff", "#f0783c", "#2f7fe0", "#e0b100", "#e0457b"]
  let acc = 0
  return (
    <div className="donut">
      <div className="donut-chart">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="donut-track" cx="50" cy="50" r={R} />
          {entries.map(([k, n], i) => {
            const len = (n / total) * C
            const seg = (
              <circle
                key={k}
                cx="50"
                cy="50"
                r={R}
                stroke={colors[k] || fallback[i % fallback.length]}
                strokeDasharray={`${Math.max(0, len - gap)} ${C}`}
                strokeDashoffset={-acc}
                style={{ animationDelay: `${i * 90}ms` }}
              />
            )
            acc += len
            return seg
          })}
        </svg>
        <div className="donut-center">
          <b>{fmtNum(total)}</b>
          <small>{caption}</small>
        </div>
      </div>
      <ul className="donut-legend">
        {entries.map(([k, n], i) => (
          <li key={k}>
            <i style={{ background: colors[k] || fallback[i % fallback.length] }} />
            <span className="grow ellipsis">{labels[k] || k}</span>
            <b>{fmtNum(n)}</b>
            <small>{Math.round((n / total) * 100)} %</small>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Table({
  head,
  children,
  empty = "Aucune donnée.",
  count,
}: {
  head: ReactNode[]
  children: ReactNode[]
  empty?: string
  count?: number
}) {
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children.length ? (
            children
          ) : (
            <tr>
              <td colSpan={head.length} className="empty">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {count != null && children.length > 0 && (
        <div className="pager" style={{ padding: "8px 12px", borderTop: "1px solid var(--sep)" }}>
          {fmtNum(count)} élément(s)
        </div>
      )}
    </div>
  )
}

export function Tag({ tone = "", children }: { tone?: string; children: ReactNode }) {
  return <span className={`tag ${tone}`}>{children}</span>
}

function hue(seed?: string | null) {
  let h = 0
  for (const c of String(seed || "x")) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}
/** Avatar : même rendu que l'application (photo, sinon initiales sur une teinte stable). */
export function Avatar({
  p,
  size = 28,
}: {
  p?: { id?: string | null; full_name?: string | null; email?: string | null; avatar_url?: string | null } | null
  size?: number
}) {
  if (p?.avatar_url)
    return <img className="av" src={p.avatar_url} alt="" style={{ width: size, height: size }} />
  const initials = String(p?.full_name || p?.email || "?")
    .trim()
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("")
  return (
    <span
      className="av"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4), ["--h" as string]: hue(p?.id || p?.email) }}
    >
      {initials}
    </span>
  )
}

export function UserCell({
  p,
  sub,
}: {
  p?: { id?: string | null; full_name?: string | null; email?: string | null; avatar_url?: string | null } | null
  sub?: ReactNode
}) {
  return (
    <div className="user">
      <Avatar p={p} />
      <div>
        <b className="ellipsis">{p?.full_name || "—"}</b>
        <small className="ellipsis">{sub ?? p?.email ?? ""}</small>
      </div>
    </div>
  )
}

export function SearchBox({
  value,
  onSearch,
  placeholder = "Rechercher…",
}: {
  value: string
  onSearch: (q: string) => void
  placeholder?: string
}) {
  const [q, setQ] = useState(value)
  useEffect(() => setQ(value), [value])
  // Recherche à la frappe, avec un court délai.
  useEffect(() => {
    if (q === value) return
    const t = setTimeout(() => onSearch(q.trim()), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])
  return (
    <form
      className="search"
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        onSearch(q.trim())
      }}
    >
      <Icon name="search" size={14} />
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
    </form>
  )
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}) {
  return (
    <div className="seg" role="tablist">
      {options.map(([v, label]) => (
        <button key={v} className={v === value ? "on" : ""} onClick={() => onChange(v)} role="tab">
          {label}
        </button>
      ))}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <label className="switch" title={label}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <i />
    </label>
  )
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", k)
    return () => document.removeEventListener("keydown", k)
  }, [onClose])
}

export function Drawer({
  title,
  sub,
  onClose,
  actions,
  children,
}: {
  title: ReactNode
  sub?: ReactNode
  onClose: () => void
  actions?: ReactNode
  children: ReactNode
}) {
  useEscape(onClose)
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-head">
          <div className="grow" style={{ minWidth: 0 }}>
            <h2 className="ellipsis">{title}</h2>
            {sub && <div className="muted small">{sub}</div>}
          </div>
          {actions}
          <button className="icon-btn" onClick={onClose} title="Fermer">
            <Icon name="close" size={15} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  )
}

export function Modal({
  title,
  onClose,
  children,
  width,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  width?: number
}) {
  useEscape(onClose)
  return (
    <div className="modal-wrap">
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        <div className="row">
          <h2 className="grow">{title}</h2>
          <button className="icon-btn" onClick={onClose} title="Fermer">
            <Icon name="close" size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Empty({ icon = "info", children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="empty-state">
      <Icon name={icon} size={22} />
      <div>{children}</div>
    </div>
  )
}

export function Bar({ value, max }: { value: number; max: number }) {
  const pct = max <= 0 ? (max < 0 ? 0 : 100) : Math.min(100, (value / max) * 100)
  return (
    <div className={`bar ${pct >= 100 ? "bad" : pct >= 80 ? "warn" : ""}`}>
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}

export function JsonView({ value }: { value: unknown }) {
  return <pre className="json">{JSON.stringify(value, null, 2)}</pre>
}

/** Téléchargement CSV des lignes affichées. */
export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const cell = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = "\ufeff" + [cols.join(";"), ...rows.map((r) => cols.map((c) => cell(r[c])).join(";"))].join("\n")
  const a = document.createElement("a")
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
