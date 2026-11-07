// Informations publiques lues sur le serveur de NEXORA avec la clé publique, comme l'application : offres et
// prix (modifiables depuis l'administration), lien de téléchargement de la version Windows, adresse du support,
// maintenance annoncée. Sans réponse, le site garde le catalogue livré avec NEXORA (nx/offres/catalog.js).
import { useEffect, useState } from "react"
import { projectRef, publicKey } from "../../../supabase/nexora.json"
import { FALLBACK, PLAN_ORDER, limitText, money } from "../../../nexora/app/renderer/nx/offres/catalog.js"

export { limitText, money }

export type PlanId = "free" | "standard" | "pro"
export type Plan = {
  id: PlanId
  name: string
  description: string
  price_month_cents: number
  price_year_cents: number
  currency: string
  badge: string
  features: string[]
  limits: Record<string, number>
  perms: Record<string, boolean>
}
export type Remote = {
  ready: boolean
  plans: Plan[]
  downloadUrl: string
  supportEmail: string
  maintenance: string
}

const FB = FALLBACK as unknown as Record<PlanId, Plan>
const ORDER = PLAN_ORDER as PlanId[]
const BASE = `https://${projectRef}.supabase.co/rest/v1/`

export const INITIAL: Remote = {
  ready: false,
  plans: ORDER.map((id) => FB[id]),
  downloadUrl: "",
  supportEmail: "",
  maintenance: "",
}

type Row = Record<string, unknown>
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const cents = (v: unknown, fb: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fb)
const record = <T,>(v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, T>) : {})

async function rest(path: string): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(BASE + path, {
      headers: { apikey: publicKey, Authorization: `Bearer ${publicKey}` },
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    window.clearTimeout(timer)
  }
}

function mergePlans(rows: unknown): Plan[] {
  const list = (Array.isArray(rows) ? rows : []) as Row[]
  const plans = ORDER.filter((id) => list.some((r) => r.id === id)).map((id) => {
    const fb = FB[id]
    const row = list.find((r) => r.id === id) as Row
    const features = Array.isArray(row.features) ? row.features.map(String).filter(Boolean) : []
    return {
      ...fb,
      name: text(row.name) || fb.name,
      description: text(row.description) || fb.description,
      price_month_cents: cents(row.price_month_cents, fb.price_month_cents),
      price_year_cents: cents(row.price_year_cents, fb.price_year_cents),
      currency: text(row.currency) || fb.currency,
      badge: typeof row.badge === "string" ? row.badge : fb.badge,
      features: features.length ? features : fb.features,
      limits: { ...fb.limits, ...record<number>(row.limits) },
      perms: { ...fb.perms, ...record<boolean>(row.perms) },
    }
  })
  return plans.length ? plans : INITIAL.plans
}

async function fetchAll(): Promise<Remote> {
  const [plans, config] = await Promise.allSettled([
    rest(
      "plans?select=id,name,description,price_month_cents,price_year_cents,currency,badge,features,limits,perms&active=eq.true&order=sort",
    ),
    rest("app_config?select=key,value&key=in.(desktop_download_url,support_email,maintenance)"),
  ])
  const cfg: Record<string, unknown> = {}
  if (config.status === "fulfilled" && Array.isArray(config.value))
    for (const row of config.value as Row[]) cfg[String(row.key)] = row.value
  const url = text(cfg.desktop_download_url)
  const mail = text(cfg.support_email)
  const maintenance = record<unknown>(cfg.maintenance)
  return {
    ready: true,
    plans: plans.status === "fulfilled" ? mergePlans(plans.value) : INITIAL.plans,
    downloadUrl: /^https:\/\/\S+$/.test(url) ? url : "",
    supportEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) ? mail : "",
    maintenance: maintenance.enabled === true ? text(maintenance.message) || "NEXORA est en maintenance." : "",
  }
}

let pending: Promise<Remote> | null = null
let cached: Remote | null = null
export function loadRemote() {
  pending ??= fetchAll().then((r) => (cached = r))
  return pending
}

export function useRemote(): Remote {
  const [state, setState] = useState<Remote>(cached ?? INITIAL)
  useEffect(() => {
    let alive = true
    loadRemote().then((r) => alive && setState(r))
    return () => {
      alive = false
    }
  }, [])
  return state
}

/** Mois offerts par le paiement annuel (2 pour 120 $ au lieu de 12 × 12 $). */
export function monthsOffered(plan: Plan) {
  if (!plan.price_month_cents || !plan.price_year_cents) return 0
  return Math.max(0, Math.round(12 - plan.price_year_cents / plan.price_month_cents))
}
