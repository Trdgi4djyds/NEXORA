// NEXORA #076 : compte NEXORA dans le site vitrine (page « Ma licence »), sans dépendance ajoutée : l'API
// d'authentification de Supabase et les fonctions de la base sont appelées directement, avec la clé publique.
// La session (jetons d'accès et de renouvellement) est gardée dans le stockage local du navigateur.
import { projectRef, publicKey } from "../../../supabase/nexora.json"
import { BASE } from "../router"

const AUTH = `https://${projectRef}.supabase.co/auth/v1/`
const REST = `https://${projectRef}.supabase.co/rest/v1/`
const KEY = "nexora-site-session"

export type Session = { access_token: string; refresh_token: string; expires_at: number; email: string; user_id: string }
export type Device = { id?: string; name: string; os: string; app_version: string; last_seen: string; last_ip: string; released?: boolean }
export type Licence = {
  key: string
  status: "active" | "revoked" | string
  created_at: string
  activated_at: string | null
  plan: "free" | "pro" | string
  plan_name: string
  paid_plan: string
  trial: boolean
  trial_ends_at: string | null
  granted?: boolean
  granted_until?: string | null
  max_devices?: number
  billing: null | { status: string; period: string; current_period_end: string | null; cancel_at_period_end: boolean; provider: string }
  devices: Device[]
  server_time: string
}
export type Verify = { valid: boolean; reason?: string; status?: string; plan?: string; plan_name?: string; created_at?: string; activated?: boolean; holder?: string }

function message(body: unknown, status: number): string {
  const b = (body || {}) as Record<string, unknown>
  const raw = String(b.msg || b.error_description || b.message || b.error || `HTTP ${status}`)
  if (/invalid login credentials/i.test(raw)) return "Adresse e-mail ou mot de passe incorrect."
  if (/email not confirmed/i.test(raw)) return "Confirmez d’abord votre adresse : ouvrez le lien reçu par e-mail."
  if (/already registered|already exists/i.test(raw)) return "Un compte existe déjà avec cette adresse : connectez-vous."
  if (/password should be at least/i.test(raw)) return "Le mot de passe doit contenir au moins 8 caractères."
  if (/rate limit|too many/i.test(raw)) return "Trop d’essais rapprochés : patientez une minute, puis réessayez."
  if (/connexion requise|jwt/i.test(raw)) return "Votre session a expiré : reconnectez-vous."
  if (status === 404 || /PGRST202|could not find the function/i.test(raw)) return "Le service des licences est en cours de mise en service : réessayez un peu plus tard."
  return raw
}

async function call(url: string, init: RequestInit & { token?: string } = {}) {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 12000)
  try {
    const res = await fetch(url, {
      ...init,
      headers: { apikey: publicKey, Authorization: `Bearer ${init.token || publicKey}`, "Content-Type": "application/json", ...(init.headers || {}) },
      signal: ctrl.signal,
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) throw new Error(message(body, res.status))
    return body
  } catch (e) {
    if (e instanceof DOMException || (e instanceof TypeError && /fetch/i.test(e.message))) throw new Error("Serveurs de NEXORA injoignables : vérifiez votre connexion, puis réessayez.")
    throw e
  } finally {
    window.clearTimeout(timer)
  }
}

function store(b: Record<string, unknown>): Session {
  const user = (b.user || {}) as Record<string, unknown>
  const s: Session = {
    access_token: String(b.access_token),
    refresh_token: String(b.refresh_token),
    expires_at: Math.floor(Date.now() / 1000) + Number(b.expires_in || 3600),
    email: String(user.email || ""),
    user_id: String(user.id || ""),
  }
  localStorage.setItem(KEY, JSON.stringify(s))
  return s
}

export function savedSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null") as Session | null
    return s && s.access_token && s.refresh_token ? s : null
  } catch {
    return null
  }
}

/** Session valide (renouvelée si elle expire dans moins d'une minute), sinon null. */
export async function session(): Promise<Session | null> {
  const s = savedSession()
  if (!s) return null
  if (s.expires_at - 60 > Date.now() / 1000) return s
  try {
    return store(await call(`${AUTH}token?grant_type=refresh_token`, { method: "POST", body: JSON.stringify({ refresh_token: s.refresh_token }) }))
  } catch {
    localStorage.removeItem(KEY)
    return null
  }
}

export async function signIn(email: string, password: string) {
  return store(await call(`${AUTH}token?grant_type=password`, { method: "POST", body: JSON.stringify({ email, password }) }))
}

/** Inscription : la session arrive tout de suite si la confirmation par e-mail est coupée, sinon après le lien. */
export async function signUp(email: string, password: string): Promise<Session | null> {
  const redirect = `${location.origin}${BASE}/licence`
  const b = await call(`${AUTH}signup?redirect_to=${encodeURIComponent(redirect)}`, { method: "POST", body: JSON.stringify({ email, password }) })
  return b && b.access_token ? store(b) : null
}

export async function recover(email: string) {
  const redirect = `${location.origin}${BASE}/licence`
  await call(`${AUTH}recover?redirect_to=${encodeURIComponent(redirect)}`, { method: "POST", body: JSON.stringify({ email }) })
}

export async function signOut() {
  const s = savedSession()
  localStorage.removeItem(KEY)
  if (s) await call(`${AUTH}logout`, { method: "POST", token: s.access_token }).catch(() => null)
}

/**
 * Retour d'un lien reçu par e-mail (confirmation d'inscription) : Supabase ajoute les jetons après le #.
 * Ils sont lus, gardés comme une session, puis retirés de l'adresse.
 */
export function sessionFromLink(): boolean {
  const h = location.hash
  const i = h.indexOf("access_token=")
  if (i < 0) return false
  const q = new URLSearchParams(h.slice(h.lastIndexOf("#") + 1).replace(/^[^?]*\?/, ""))
  const p = q.get("access_token") ? q : new URLSearchParams(h.slice(i))
  const access = p.get("access_token")
  const refresh = p.get("refresh_token")
  if (!access || !refresh) return false
  let user: Record<string, unknown> = {}
  try {
    const claims = JSON.parse(atob(access.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
    user = { id: claims.sub, email: claims.email }
  } catch {
    return false
  }
  store({ access_token: access, refresh_token: refresh, expires_in: Number(p.get("expires_in") || 3600), user })
  history.replaceState(null, "", `${location.pathname}${location.search}`)
  return true
}

export async function myLicence(s: Session): Promise<Licence> {
  return call(`${REST}rpc/nx_license_mine`, { method: "POST", token: s.access_token, body: JSON.stringify({ p_source: "site" }) })
}

/** NEXORA #077 : libère un ordinateur de la licence (limite d'ordinateurs). */
export async function releaseDevice(s: Session, device: string) {
  return call(`${REST}rpc/nx_license_device_release`, { method: "POST", token: s.access_token, body: JSON.stringify({ p_device: device }) })
}

export async function verifyKey(key: string): Promise<Verify> {
  return call(`${REST}rpc/nx_license_verify`, { method: "POST", body: JSON.stringify({ p_key: key }) })
}

/** NEXORA #090 : parrainage du compte et prix de Pro qui s'appliquent (nx_referral_mine). */
export type ReferralMine = {
  referred: boolean
  eligible?: boolean
  code?: string
  partner?: string
  source?: string
  discount_pct: number
  month_cents: number
  year_cents: number
  list_month_cents: number
  list_year_cents: number
  ok?: boolean
  reason?: "unknown" | "self" | "customer"
}
export async function referralMine(s: Session): Promise<ReferralMine> {
  return call(`${REST}rpc/nx_referral_mine`, { method: "POST", token: s.access_token, body: "{}" })
}
/** Rattache le code d'un parrain au compte (avant un premier abonnement Pro ; définitif). */
export async function referralAttach(s: Session, code: string, source: "link" | "code"): Promise<ReferralMine> {
  return call(`${REST}rpc/nx_referral_attach`, { method: "POST", token: s.access_token, body: JSON.stringify({ p_code: code, p_source: source }) })
}

async function payCall<T>(route: string, s: Session, body: unknown): Promise<{ res: Response; b: T | null }> {
  let res: Response
  try {
    res = await fetch(route, {
      method: "POST",
      headers: { Authorization: `Bearer ${s.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error("Le service de paiement est injoignable : réessayez dans un instant.")
  }
  return { res, b: (await res.json().catch(() => null)) as T | null }
}

/** Paiement de Pro (Worker de NEXORA, même adresse que le site ; #107 : SasPay, Mobile Money ou carte) : adresse de
 *  la page de paiement, pour un mois ou un an. #090 : code d'un parrain (ref) rattaché par le Worker avant le
 *  paiement, remise déduite du montant. */
export async function pay(s: Session, period: "month" | "year" = "month", ref?: { code: string; source: "link" | "code" }): Promise<string> {
  const { res, b } = await payCall<Record<string, string>>("/pay/checkout", s, { period, ...(ref ? { ref: ref.code, ref_source: ref.source } : {}) })
  if (!b) throw new Error("Le paiement en ligne arrive très bientôt.")
  if (res.ok && b.url) return b.url
  if (b.message) throw new Error(b.message)
  throw new Error(res.status === 404 ? "Le paiement en ligne arrive très bientôt." : `Paiement indisponible (HTTP ${res.status}).`)
}

export type PayStatus = { status: "paid" | "pending" | "failed" | "error"; period?: string | null; period_end?: string | null }
/** NEXORA #107 : retour de la page de paiement : statut réel, vérifié par le Worker auprès du prestataire. */
export async function confirmPayment(s: Session, ref: string): Promise<PayStatus> {
  const { res, b } = await payCall<PayStatus & { message?: string }>("/pay/confirm", s, { ref })
  if (res.ok && b && b.status) return b
  throw new Error((b && b.message) || `Vérification du paiement indisponible (HTTP ${res.status}).`)
}

/**
 * NEXORA #087 : le paiement en ligne est-il ouvert ? (Worker de NEXORA, /license/config ; faux sans réponse, par
 * exemple dans l'aperçu). Tant qu'il ne l'est pas, l'équipe active Pro sur demande (adresse de contact, Support).
 */
let payments: Promise<boolean> | null = null
export function paymentsOpen(): Promise<boolean> {
  payments ??= fetch("/license/config", { headers: { Accept: "application/json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => Boolean(j && (j as { payments?: boolean }).payments))
    .catch(() => false)
  return payments
}

export const KEY_RE = /^NXDT(-[2-9A-HJKMNP-Z]{4}){4}$/
