// NEXORA #090 : lien ou code promo d'un parrain (NEXORA REFERRAL). Un lien de parrainage mène au site avec
// « ?parrain=CODE » (avant ou après le #) : le code est vérifié sur le serveur (nx_referral_resolve, sans compte), puis
// gardé dans le navigateur le temps réglé dans le back office (90 jours par défaut). Les cartes des offres montrent alors
// le prix avec la remise, et la page « Ma licence » rattache le code au compte avant le paiement.
import { useEffect, useState } from "react"
import { projectRef, publicKey } from "../../../supabase/nexora.json"
import { REFERRAL } from "../../../nexora/app/renderer/nx/offres/catalog.js"

const KEY = "nexora-site-parrain"
export const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9-]{2,23}$/

export type Parrain = {
  code: string
  partner: string
  discount_pct: number
  month_cents: number
  year_cents: number
  list_month_cents: number
  list_year_cents: number
  at: number
  days: number
}

/** Code d'un parrain vérifié sur le serveur (null s'il n'existe pas, s'il est désactivé ou si le serveur ne répond pas). */
export async function resolveCode(code: string): Promise<Omit<Parrain, "at" | "days"> | null> {
  if (!CODE_RE.test(code.trim())) return null
  try {
    const res = await fetch(`https://${projectRef}.supabase.co/rest/v1/rpc/nx_referral_resolve`, {
      method: "POST",
      headers: { apikey: publicKey, Authorization: `Bearer ${publicKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_code: code.trim() }),
    })
    const b = res.ok ? ((await res.json()) as Record<string, unknown>) : null
    if (!b || b.valid !== true) return null
    return {
      code: String(b.code), partner: String(b.partner || ""), discount_pct: Number(b.discount_pct) || REFERRAL.discount_pct,
      month_cents: Number(b.month_cents), year_cents: Number(b.year_cents), list_month_cents: Number(b.list_month_cents), list_year_cents: Number(b.list_year_cents),
    }
  } catch {
    return null
  }
}

const listeners = new Set<(p: Parrain | null) => void>()
function emit(p: Parrain | null) {
  for (const fn of listeners) fn(p)
}

export function savedParrain(): Parrain | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "null") as Parrain | null
    if (!p || !p.code || Date.now() - Number(p.at) > (Number(p.days) || REFERRAL.cookie_days) * 86400000) return null
    return p
  } catch {
    return null
  }
}
export function saveParrain(p: Omit<Parrain, "at" | "days">, days = REFERRAL.cookie_days) {
  const v: Parrain = { ...p, at: Date.now(), days }
  try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* stockage refusé : la remise reste valable pour la page */ }
  emit(v)
  return v
}
export function forgetParrain() {
  try { localStorage.removeItem(KEY) } catch { /* sans effet */ }
  emit(null)
}

/** Lien d'un parrain dans l'adresse : retiré de l'adresse tout de suite (pas de partage involontaire), vérifié, puis
 *  gardé le nombre de jours réglé dans le back office (days). */
export async function captureFromUrl(days: () => Promise<number> = async () => REFERRAL.cookie_days) {
  const fromSearch = new URLSearchParams(location.search).get("parrain")
  const hashQuery = location.hash.includes("?") ? new URLSearchParams(location.hash.slice(location.hash.indexOf("?") + 1)).get("parrain") : null
  const code = (fromSearch || hashQuery || "").trim()
  if (!code) return
  const clean = new URL(location.href)
  clean.searchParams.delete("parrain")
  if (hashQuery) {
    const [route, q] = clean.hash.split("?")
    const params = new URLSearchParams(q)
    params.delete("parrain")
    clean.hash = params.toString() ? `${route}?${params}` : route
  }
  history.replaceState(history.state, "", clean.pathname + clean.search + clean.hash)
  const [p, d] = await Promise.all([resolveCode(code), days().catch(() => REFERRAL.cookie_days)])
  if (p) saveParrain(p, d)
}

export function useParrain(): Parrain | null {
  const [p, setP] = useState<Parrain | null>(savedParrain)
  useEffect(() => {
    listeners.add(setP)
    return () => { listeners.delete(setP) }
  }, [])
  return p
}
