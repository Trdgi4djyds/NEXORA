// NEXORA #090 : client Supabase de l'espace des parrains : même projet et même clé publique (anon) que NEXORA, session
// gardée sous sa propre clé (« nexora-referral-auth »), jamais partagée avec le back office ni NEXORA web. Tout passe
// par les fonctions nx_partner_* de la base (migration 20261108000007), qui vérifient le code d'accès du mois.
import { createClient } from "@supabase/supabase-js"
import { projectRef, publicKey } from "../../supabase/nexora.json"

export const sb = createClient(`https://${projectRef}.supabase.co`, publicKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce", storageKey: "nexora-referral-auth" },
  global: { headers: { "x-client-info": "nexora-referral" } },
})

/** Message d'erreur en français (mêmes formulations que NEXORA). */
export function errText(error: unknown): string {
  const e = error as { message?: string; error_description?: string; msg?: string } | null
  const m = String((e && (e.message || e.error_description || e.msg)) || error || "")
  if (/signups? not allowed|not allowed for otp|user not found/i.test(m)) return "Cette adresse n’a pas d’accès parrain : l’accès se fait sur invitation de l’équipe NEXORA."
  if (/rate limit|too many|for security purposes/i.test(m)) return "Trop de demandes rapprochées : patientez une minute, puis réessayez."
  if (/Failed to fetch|NetworkError|network|load failed/i.test(m)) return "Serveurs de NEXORA injoignables : vérifiez votre connexion, puis réessayez."
  if (/JWT expired|invalid jwt/i.test(m)) return "Votre session a expiré : reconnectez-vous."
  if (/PGRST202|could not find the function/i.test(m)) return "L’espace des parrains est en cours de mise en service : réessayez un peu plus tard."
  if (/permission denied|row-level security/i.test(m)) return "Vous n’avez pas accès à cette action."
  return m.replace(/^Error:\s*/, "") || "Une erreur est survenue."
}

export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb.rpc(name, args)
  if (error) throw new Error(errText(error))
  return data as T
}

export type Me = {
  partner: boolean
  auth: boolean
  email?: string
  invited?: boolean
  id?: string
  name?: string
  status?: "invited" | "active" | "suspended"
  needs_code?: boolean
  month?: string
  code_expires_at?: string
  locked_until?: string | null
  payout_method?: string
  payout_details?: string
  activated_at?: string
}
export type CodeResult = Me & { ok: boolean; reason?: "code" | "locked" | "email" | "invite" | "already" | "partner" | "suspended"; until?: string; left?: number; expected?: string }
export type Balance = { earned_cents: number; pending_cents: number; matured_cents: number; reserved_cents: number; paid_cents: number; available_cents: number }
export type Rules = {
  discount_pct: number; commission_pct: number; list_month_cents: number; list_year_cents: number; month_cents: number; year_cents: number
  min_payout_cents: number; hold_days: number; methods: string[]; max_codes: number; cookie_days: number
}
export type Payout = { id: string; amount_cents: number; method: string; details: string; status: string; reference?: string; note?: string; admin_note?: string; requested_at: string; processed_at?: string | null }
export type Dashboard = {
  balance: Balance
  recurring: { payers: number; commission_cents: number; gross_cents: number }
  referrals: number
  referrals_month: number
  month_cents: number
  codes: number
  series: { month: string; amount_cents: number }[]
  rules: Rules
  open_payout: Payout | null
}
export type Code = { id: string; code: string; label: string; active: boolean; created_at: string; referrals: number; payers: number; earned_cents: number }
export type Filleul = { who: string; since: string; code: string; source: string; active: boolean; period: string | null; payments: number; earned_cents: number; last_payment_at: string | null; renews_at: string | null }
export type Gain = { id: number; at: string; who: string; period: string; paid_cents: number; list_cents: number; rate: number; amount_cents: number; state: "pending" | "available" | "canceled"; available_at: string; note: string }
