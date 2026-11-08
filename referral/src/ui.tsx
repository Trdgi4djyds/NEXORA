// NEXORA #090 : petits composants de l'espace des parrains (icônes de NEXORA, montants, copie, notifications).
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react"
import { a as NEXORA_ICONS } from "../../nexora/app/renderer/dist/chunks/chunk-S4I2LXHS.js"
import { REFERRAL as RULES, money, percent } from "../../nexora/app/renderer/nx/offres/catalog.js"
import logo from "../../nexora/app/renderer/logo.png"

const PATHS = NEXORA_ICONS as Record<string, string>

export function Icon({ name, size = 16, className = "" }: { name: string; size?: number; className?: string }) {
  return (
    <svg className={`ico ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: PATHS[name] || "" }} />
  )
}

/** Taux à la française : 25 ; 2,5. */
export const pct = (v: number | string | null | undefined) => percent(Number(v) || 0) as string
/** Règles par défaut du programme (avant connexion ; le serveur les remplace ensuite). */
export const DEFAULT_RULES = RULES as { discount_pct: number; commission_pct: number; min_payout_cents: number; hold_days: number; cookie_days: number }
/** Montant en dollars : 25 $, 17,50 $, 4,375 $ (le millième des commissions est gardé). */
export const usd = (cents: number | string | null | undefined) => money(Number(cents) || 0) as string
/** Total ou estimation, arrondi au centime (le millième ne sert qu'à la commission d'un paiement). */
export const usdTotal = (cents: number | string | null | undefined) => money(Math.round(Number(cents) || 0)) as string
/** Disponible : arrondi au centime inférieur (montant réellement retirable). */
export const usdFloor = (cents: number | string | null | undefined) => money(Math.floor(Number(cents) || 0)) as string
/** Dernier jour de validité d'un code qui expire au début du mois suivant (« 30 novembre »). */
export const lastDay = (expires?: string | null) => (expires ? longFmt.format(new Date(Date.parse(expires) - 1000)) : "—")
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" })
const longFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" })
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" })
export const fmtDate = (v?: string | null) => (v ? dateFmt.format(new Date(v)) : "—")
export const fmtLong = (v?: string | null) => (v ? longFmt.format(new Date(v)) : "—")
export const fmtTime = (v?: string | null) => (v ? timeFmt.format(new Date(v)) : "")
export const plural = (n: number, one: string, many = `${one}s`) => `${new Intl.NumberFormat("fr-FR").format(n)} ${n > 1 ? many : one}`
export const METHOD: Record<string, string> = { paypal: "PayPal", bank: "Virement bancaire", mobile_money: "Mobile Money" }
export const METHOD_HINT: Record<string, string> = { paypal: "Adresse e-mail PayPal", bank: "IBAN et nom du titulaire", mobile_money: "Numéro Mobile Money et opérateur" }

type Toast = { id: number; text: string; bad?: boolean }
const ToastCtx = createContext<(text: string, bad?: boolean) => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastHost({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([])
  const seq = useRef(0)
  const push = useCallback((text: string, bad = false) => {
    const id = ++seq.current
    setList((l) => [...l.slice(-2), { id, text, bad }])
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), bad ? 8000 : 3500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={`toast${t.bad ? " bad" : ""}`}>
            <Icon name={t.bad ? "error" : "check"} size={15} />
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function CopyButton({ value, label, small }: { value: string; label: string; small?: boolean }) {
  const toast = useToast()
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={`btn ghost${small ? " sm" : ""}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setDone(true)
          toast(`${label} copié.`)
          setTimeout(() => setDone(false), 1600)
        } catch {
          toast("Copie impossible : sélectionne le texte, puis copie-le.", true)
        }
      }}
    >
      <Icon name={done ? "check" : "copy"} size={small ? 13 : 15} />
      {done ? "Copié" : "Copier"}
    </button>
  )
}

export function Spinner() {
  return <span className="spinner" aria-label="Chargement" />
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-ic"><Icon name={icon} size={20} /></span>
      <b>{title}</b>
      {children && <p>{children}</p>}
    </div>
  )
}

export function Brand() {
  return (
    <a className="brand" href="#/" aria-label="NEXORA REFERRAL, accueil">
      <img src={logo} alt="" width={30} height={30} />
      <span><b>NEXORA</b><small>REFERRAL</small></span>
    </a>
  )
}
