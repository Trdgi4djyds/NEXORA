// Routes des licences et des abonnements du Worker de NEXORA (NEXORA #076).
//   POST /license/check   contrôle obligatoire du logiciel : relaie nx_license_check (session de l'utilisateur,
//                         adresse IP vue par Cloudflare) puis SIGNE la réponse (Ed25519). Le logiciel refuse
//                         toute réponse non signée par la clé de NEXORA : il ne s'ouvre pas sans ce contrôle.
//   GET  /license/config  ce qui est réglé (signature, paiements), sans jamais renvoyer un secret.
//   POST /pay/checkout    NEXORA #107 : paiement de Pro (un mois ou un an) par SasPay, Mobile Money ou carte : session de
//                         checkout hébergé gardée dans la base, adresse de paiement renvoyée au site. #090 : code ou lien
//                         d'un parrain (champ ref) rattaché au compte (nx_referral_attach), remise du parrainage déduite
//                         du montant demandé.
//   POST /pay/confirm     retour du client : paiement retrouvé puis vérifié auprès de SasPay → nx_pay_apply.
//   POST /pay/webhook     événements SasPay (signature et horodatage vérifiés sur le corps brut) → nx_pay_apply.
//   GET  /security/manifest  NEXORA #077 : déclaration de publication SIGNÉE par le service de sécurité, valable
//                         24 h (comme le « timestamp » de TUF) : dernière publication du dépôt officiel (manifeste
//                         vérifié avec la clé de publication, empreinte SHA-256, numéro de manifeste) et versions
//                         autorisées (politique du back office). Le lanceur refuse un manifeste GitHub qui ne
//                         correspond pas à cette déclaration, une déclaration expirée ou non signée.
//   POST /security/report    anomalies relevées par le lanceur (fichier modifié, signature invalide…) → journal.
//   POST /security/publication  NEXORA #084 : manifeste signé envoyé par l'Action de publication ; vérifié avec la clé
//                         de publication puis gardé dans la base (nx_release_seen) : la déclaration ne dépend plus
//                         de la disponibilité de GitHub pour les adresses de Cloudflare.
// Variables du Worker (Cloudflare → Workers & Pages → nexora → Settings → Variables and Secrets), jamais dans
// le dépôt : NX_LICENSE_SIGNING_KEY (clé privée Ed25519, PKCS8 en base64), NX_PROBE_SECRET (secret partagé avec la
// base, déjà utilisé par la deuxième région), SASPAY_API_KEY (clé secrète SasPay), SASPAY_WEBHOOK_SECRET (secret de
// signature du webhook, affiché une seule fois par le tableau de bord SasPay). Prestataire unique : SasPay (#107).
import setup from "../supabase/nexora.json"

const SUPA = `https://${setup.projectRef}.supabase.co`
const SITE = setup.siteUrl.replace(/\/+$/, "")
export const isLicenceRoute = (p) => p === "/license/check" || p === "/license/config" || p.startsWith("/pay/") || p.startsWith("/security/")
// Dépôt officiel des publications et clé publique de publication (identique à RELEASE_KEY de src/license.js).
export const RELEASE_REPO = "Trdgi4djyds/NEXORA-portable"
export const RELEASE_PUBLIC_KEY = "MCowBQYDK2VwAyEAuylEQNJveeY4JGMR7lmlzN/tsqE/DWeWntYU7n1OxNc="
const STATEMENT_TTL = 24 * 3600 * 1000

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } })
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const bearer = (req) => (/^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "") || [])[1] || ""

let keyCache = null
async function signingKey(env) {
  if (!env.NX_LICENSE_SIGNING_KEY) return null
  if (!keyCache || keyCache.src !== env.NX_LICENSE_SIGNING_KEY) {
    const key = await crypto.subtle.importKey("pkcs8", unb64(env.NX_LICENSE_SIGNING_KEY.trim()), { name: "Ed25519" }, false, ["sign"])
    keyCache = { src: env.NX_LICENSE_SIGNING_KEY, key }
  }
  return keyCache.key
}
export async function signPayload(env, payload) {
  const key = await signingKey(env)
  const text = JSON.stringify(payload)
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(text))
  return { payload: text, sig: b64(sig) }
}

async function rpc(name, args, token) {
  const r = await fetch(`${SUPA}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: setup.publicKey, authorization: `Bearer ${token || setup.publicKey}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  })
  const body = await r.json().catch(() => null)
  return { status: r.status, ok: r.ok, body }
}
async function userOf(token) {
  if (!token) return null
  const r = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: setup.publicKey, authorization: `Bearer ${token}` } })
  if (!r.ok) return null
  return r.json()
}

// ---------- Publication officielle (déclaration signée) ----------
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
let releaseKeyCache = null
let statementCache = null
async function releaseKey() {
  if (!releaseKeyCache) releaseKeyCache = await crypto.subtle.importKey("spki", unb64(RELEASE_PUBLIC_KEY), { name: "Ed25519" }, false, ["verify"])
  return releaseKeyCache
}
// Dernière publication du dépôt officiel, vérifiée ; gardée 5 minutes. Jamais d'exception : { publication, error }.
// NEXORA #079 : liens directs de téléchargement de github.com au lieu de l'API (api.github.com refuse les appels
// sans jeton venus des adresses partagées de Cloudflare : quota de 60 par heure dépassé, « repository_unreachable »).
// …/releases/latest/download/<fichier> redirige vers …/releases/download/<tag>/<fichier> : le tag est lu dans la
// redirection, puis la signature est prise dans la même publication (pas de mélange si une publication arrive entre-temps).
// NEXORA #084 : une nouvelle tentative si GitHub ne répond pas ; échec gardé une minute seulement (reprise rapide) ;
// repli sur la dernière publication vérifiée gardée dans la base (securityManifest).
const GH_HEADERS = { "user-agent": "NEXORA-Security-Service" }
export async function latestPublication(force = false) {
  if (!force && statementCache && Date.now() - statementCache.at < (statementCache.value.publication ? 5 * 60 * 1000 : 60 * 1000)) return statementCache.value
  let value = await fetchPublication()
  if (value.error === "repository_unreachable") value = await fetchPublication()
  statementCache = { at: Date.now(), value }
  return value
}
async function fetchPublication() {
  let value
  try {
    const latest = `https://github.com/${RELEASE_REPO}/releases/latest/download/nexora.manifest.json`
    const hop = await fetch(latest, { headers: GH_HEADERS, redirect: "manual" })
    const location = hop.status >= 300 && hop.status < 400 ? hop.headers.get("location") || "" : ""
    const tag = decodeURIComponent((/\/releases\/download\/([^/]+)\//.exec(location) || [])[1] || "")
    // 404 : aucune publication, ou publication sans manifeste (indiscernables sans l'API).
    if (hop.status === 404) value = { publication: null, error: "no_release" }
    else if (!location) value = { publication: null, error: "repository_unreachable" }
    else {
      const base = tag ? `https://github.com/${RELEASE_REPO}/releases/download/${encodeURIComponent(tag)}/` : `https://github.com/${RELEASE_REPO}/releases/latest/download/`
      const [mr, sr] = await Promise.all([
        fetch(new URL(location, latest).href, { headers: GH_HEADERS }),
        fetch(`${base}nexora.manifest.sig`, { headers: GH_HEADERS }),
      ])
      if (mr.status === 404 || sr.status === 404) value = { publication: null, error: "no_manifest" }
      else if (!mr.ok || !sr.ok) value = { publication: null, error: "repository_unreachable" }
      else {
        const raw = new Uint8Array(await mr.arrayBuffer())
        const sig = (await sr.text()).trim()
        const good = await crypto.subtle.verify({ name: "Ed25519" }, await releaseKey(), unb64(sig), raw).catch(() => false)
        if (!good) value = { publication: null, error: "signature" }
        else {
          const m = JSON.parse(new TextDecoder().decode(raw))
          value = {
            publication: {
              version: m.version, manifest_version: Number(m.manifest_version) || 0, manifest_sha256: hex(await crypto.subtle.digest("SHA-256", raw)),
              issued_at: m.issued_at || m.published_at || null, expires_at: m.expires_at || null, release: m.release || m.channel || "stable", tag,
            },
            error: "",
          }
        }
      }
    }
  } catch {
    value = { publication: null, error: "repository_unreachable" }
  }
  return value
}
async function securityManifest(env) {
  if (!env.NX_LICENSE_SIGNING_KEY) return json(503, { error: "not_configured", message: "Le service de sécurité de NEXORA n’est pas encore configuré." })
  const [found, pol] = await Promise.all([latestPublication(), rpc("nx_release_policy", {}).catch(() => ({ ok: false, body: null }))])
  const policy = pol && pol.ok && pol.body && typeof pol.body === "object" ? pol.body : {}
  let { publication, error } = found
  const seen = policy.latest_seen && typeof policy.latest_seen === "object" ? policy.latest_seen : null
  if (publication && env.NX_PROBE_SECRET && publication.manifest_version > Number((seen && seen.manifest_version) || 0)) {
    // Nouvelle publication vérifiée : gardée dans la base pour les moments où GitHub ne répond pas.
    await rpc("nx_release_seen", { p_secret: env.NX_PROBE_SECRET, p_publication: publication }).catch(() => null)
  } else if (!publication && error === "repository_unreachable" && seen && /^[0-9a-f]{64}$/.test(String(seen.manifest_sha256 || ""))) {
    const { seen_at: _s, ...last } = seen
    void _s
    publication = { ...last, manifest_version: Number(last.manifest_version) || 0, stale: true }
    error = ""
  }
  const now = Date.now()
  const statement = {
    application: "NEXORA", kind: "release_statement", repository: RELEASE_REPO, status: publication ? "ok" : error,
    issued_at: new Date(now).toISOString(), expires_at: new Date(now + STATEMENT_TTL).toISOString(),
    latest: publication, min_version: policy.min_version || "0.0.0", min_manifest_version: Number(policy.min_manifest_version) || 0,
    block_outdated: policy.block_outdated !== false, channel: policy.channel || "stable",
  }
  return json(200, await signPayload(env, statement))
}
async function securityPublication(req, env) {
  let a
  try { a = await req.json() } catch { return json(400, { error: "bad_request" }) }
  let raw
  try { raw = unb64(String(a.manifest_b64 || "")) } catch { return json(400, { error: "bad_request" }) }
  const good = raw.length > 0 && raw.length < 2 << 20 && await crypto.subtle.verify({ name: "Ed25519" }, await releaseKey(), unb64(String(a.sig || "").trim()), raw).catch(() => false)
  if (!good) return json(403, { error: "signature" })
  let m
  try { m = JSON.parse(new TextDecoder().decode(raw)) } catch { return json(400, { error: "bad_request" }) }
  if (m.expires_at && Date.parse(m.expires_at) < Date.now()) return json(400, { error: "expired" })
  if (!env.NX_PROBE_SECRET) return json(503, { error: "not_configured" })
  const publication = {
    version: m.version, manifest_version: Number(m.manifest_version) || 0, manifest_sha256: hex(await crypto.subtle.digest("SHA-256", raw)),
    issued_at: m.issued_at || m.published_at || null, expires_at: m.expires_at || null, release: m.release || m.channel || "stable", tag: String(a.tag || "").slice(0, 60),
  }
  const r = await rpc("nx_release_seen", { p_secret: env.NX_PROBE_SECRET, p_publication: publication })
  statementCache = null
  return json(r.ok ? 200 : 502, { ok: r.ok, stored: r.body === true, manifest_version: publication.manifest_version })
}
async function securityReport(req, env) {
  let a
  try { a = await req.json() } catch { return json(400, { error: "bad_request" }) }
  if (!env.NX_PROBE_SECRET) return json(202, { ok: false, stored: false })
  const detail = a.detail && typeof a.detail === "object" ? Object.fromEntries(Object.entries(a.detail).slice(0, 12).map(([k, v]) => [String(k).slice(0, 40), String(v).slice(0, 300)])) : {}
  const r = await rpc("nx_security_report", {
    p_secret: env.NX_PROBE_SECRET, p_device: String(a.device || "").slice(0, 128), p_reason: String(a.reason || "security").slice(0, 40),
    p_detail: detail, p_version: String(a.version || "").slice(0, 40), p_ip: req.headers.get("cf-connecting-ip") || null, p_source: a.source === "app" ? "app" : "launcher",
  })
  return json(r.ok ? 200 : 202, { ok: r.ok })
}

// ---------- Contrôle de licence ----------
async function licenseCheck(req, env) {
  if (!env.NX_LICENSE_SIGNING_KEY) return json(503, { error: "not_configured", message: "Le serveur de licences de NEXORA n’est pas encore configuré. Réessayez dans quelques minutes." })
  let a
  try { a = await req.json() } catch { return json(400, { error: "bad_request" }) }
  const token = bearer(req)
  const args = {
    p_device: String(a.device || ""), p_key: a.key ? String(a.key) : null, p_version: String(a.version || ""), p_os: String(a.os || ""),
    p_name: String(a.name || ""), p_nonce: String(a.nonce || ""),
    p_secret: env.NX_PROBE_SECRET || null, p_ip: req.headers.get("cf-connecting-ip") || null,
    // NEXORA #077 : résultat du contrôle d'intégrité du logiciel (consigné, refus si l'installation est modifiée).
    p_integrity: a.integrity && typeof a.integrity === "object"
      ? { ok: a.integrity.ok !== false, reason: String(a.integrity.reason || "").slice(0, 40), file: String(a.integrity.file || "").slice(0, 200), manifest_version: Number(a.integrity.manifest_version) || 0 }
      : null,
  }
  let r
  if (token) {
    r = await rpc("nx_license_check", args, token)
    // Base sans la migration #077 (paramètre p_integrity inconnu) : contrôle sans intégrité côté serveur.
    if (r.status === 404 || (r.body && r.body.code === "PGRST202")) {
      const { p_integrity: _i, ...old } = args
      void _i
      r = await rpc("nx_license_check", old, token)
    }
  }
  // Sans session (ou session expirée) : réponse signée « connexion requise », jamais une réponse non signée.
  const body = !token ? { ok: false, reason: "auth", message: "Connectez-vous à votre compte NEXORA pour ouvrir le logiciel." }
    : r.status === 401 || (r.body && /jwt/i.test(String(r.body.message || ""))) ? { ok: false, reason: "auth", message: "Votre session NEXORA a expiré : reconnectez-vous." }
    : !r.ok ? { ok: false, reason: "server", message: "Le serveur de licences n’a pas pu vérifier votre licence. Réessayez dans un instant." }
    : r.body
  const { publication } = await latestPublication()
  const payload = { ...body, publication, nonce: args.p_nonce, device: args.p_device, signed_at: new Date().toISOString(), country: req.cf && req.cf.country ? req.cf.country : "" }
  return json(200, await signPayload(env, payload))
}

// ---------- SasPay (NEXORA #107, à la place de Stripe) ----------
// Spécification : https://api.saspay.me/api/v1, décrite par /api-reference/openapi.json (aucune route, aucun champ
// hors de cette spécification). Clé lue dans SASPAY_API_KEY (sk_test_… en essai, sk_live_… en production), jamais
// renvoyée ni écrite dans un journal. Montants en chaînes décimales (« 25.00 »).
// Parcours : /pay/checkout ouvre une session de checkout hébergé (POST /checkout-sessions/) et la garde dans la base
// (nx_pay_session_open) ; le client paie sur checkout_url ; au retour, /pay/confirm, et le webhook signé
// « transaction.success », retrouvent la transaction (GET /checkout-sessions/{id}/status/) puis la VÉRIFIENT
// (GET /payments/{id}/verify/) : seul SUCCESS ouvre Pro (nx_pay_apply, une seule fois par transaction).
const SASPAY = "https://api.saspay.me/api/v1"
export class SasPayError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}
async function saspay(env, method, path, body) {
  const headers = { authorization: `Bearer ${env.SASPAY_API_KEY}`, accept: "application/json" }
  if (body) headers["content-type"] = "application/json"
  const r = await fetch(`${SASPAY}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const b = await r.json().catch(() => null)
  if (!r.ok || (b && b.success === false)) {
    const e = b && b.error && typeof b.error === "object" ? b.error : b || {}
    throw new SasPayError(r.status, String(e.code || ""), String(e.message || `SasPay ${r.status}`).slice(0, 200))
  }
  // Enveloppe { success, data, code } ; certaines réponses d'exemple sont données sans enveloppe.
  return b && b.success === true && b.data && typeof b.data === "object" ? b.data : b || {}
}
const payReady = (env) => Boolean(env.SASPAY_API_KEY && env.NX_PROBE_SECRET)
const NOT_READY = "Le paiement en ligne arrive très bientôt. En attendant, écrivez à nexoradevstoolbox@gmail.com : l’équipe NEXORA active votre offre Pro."
export const decimal = (cents) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`
// Erreurs de SasPay traduites pour le client, sans détail interne (clé, compte).
function payError(e) {
  if (!(e instanceof SasPayError)) throw e
  if (e.status === 429) return new Response(JSON.stringify({ error: "busy", message: "Le service de paiement est très sollicité : réessayez dans une minute." }), { status: 503, headers: { "content-type": "application/json", "cache-control": "no-store", "retry-after": "60" } })
  // 401 : clé absente, invalide ou expirée ; 403 : compte suspendu, portée de la clé : à corriger par l'équipe, ne pas réessayer.
  if (e.status === 401 || e.status === 403) return json(503, { error: "not_configured", message: "Le paiement en ligne est momentanément indisponible. Écrivez à nexoradevstoolbox@gmail.com : l’équipe NEXORA active votre offre Pro." })
  if (e.status === 404 || e.status === 410) return json(404, { error: "not_found", message: "Ce paiement est introuvable ou a expiré : relancez un nouveau paiement." })
  if (e.status === 409) return json(409, { error: "conflict", message: "Ce paiement est déjà en cours de traitement : patientez quelques secondes, puis actualisez la page." })
  if (e.status === 400 || e.status === 422) return json(422, { error: "refused", message: "Le service de paiement a refusé la demande. Réessayez, ou écrivez à l’équipe NEXORA si le problème continue." })
  return json(502, { error: "provider", message: "Le service de paiement n’a pas répondu. Réessayez dans un instant." })
}
const REFERRAL_REFUSED = {
  unknown: "Ce code de parrainage n’existe pas ou n’est plus actif.",
  self: "Vous ne pouvez pas utiliser votre propre code de parrainage.",
  customer: "Le parrainage s’applique à un premier abonnement Pro.",
}
async function checkout(req, env) {
  if (!payReady(env)) return json(503, { error: "not_configured", message: NOT_READY })
  const token = bearer(req)
  const user = await userOf(token)
  if (!user) return json(401, { error: "auth", message: "Connectez-vous d’abord à votre compte NEXORA." })
  if (!user.email) return json(400, { error: "email", message: "Ajoutez une adresse e-mail à votre compte NEXORA pour payer en ligne." })
  const a = await req.json().catch(() => ({}))
  const period = a.period === "year" ? "year" : "month"
  // #090 : code ou lien d'un parrain, rattaché au compte avant le paiement (refus expliqué : code inconnu, le sien…).
  const code = typeof a.ref === "string" ? a.ref.trim().slice(0, 24) : ""
  if (code) {
    const att = await rpc("nx_referral_attach", { p_code: code, p_source: a.ref_source === "link" ? "link" : "code" }, token)
    if (att.ok && att.body && att.body.ok === false) return json(400, { error: "referral", message: REFERRAL_REFUSED[att.body.reason] || REFERRAL_REFUSED.unknown })
  }
  // Prix de Pro lu dans la base (offres du back office), remise du parrainage comprise pour un filleul.
  const mine = await rpc("nx_referral_mine", {}, token)
  const m = mine.ok && mine.body && typeof mine.body === "object" ? mine.body : null
  const cents = m ? Number(m.referred ? m[`${period}_cents`] : m[`list_${period}_cents`]) : NaN
  if (!Number.isInteger(cents) || cents <= 0) return json(502, { error: "server", message: "Le prix de Pro n’a pas pu être lu. Réessayez dans un instant." })
  const referral = m.referred ? String(m.code || "") : ""
  const ref = crypto.randomUUID()
  const meta = user.user_metadata || {}
  const name = String(meta.full_name || meta.name || "").trim() || String(user.email).split("@")[0]
  let s
  try {
    s = await saspay(env, "POST", "/checkout-sessions/", {
      amount: decimal(cents), currency: "USD",
      description: `NEXORA Pro, ${period === "year" ? "1 an" : "1 mois"}${referral ? ` (parrainage ${referral})` : ""}`,
      customer_email: user.email, customer_name: name.slice(0, 120),
      return_url: `${SITE}/licence?paiement=retour&ref=${ref}`,
      metadata: { nexora_user: user.id, nexora_ref: ref, period, referral },
    })
  } catch (e) {
    return payError(e)
  }
  if (!s.id || !s.checkout_url) return json(502, { error: "provider", message: "Le service de paiement n’a pas renvoyé de page de paiement. Réessayez dans un instant." })
  const saved = await rpc("nx_pay_session_open", {
    p_secret: env.NX_PROBE_SECRET, p_id: String(s.id), p_ref: ref, p_user: user.id, p_period: period, p_amount: cents, p_currency: "usd",
    p_referral: referral || null, p_url: String(s.checkout_url),
  })
  if (!saved.ok || !saved.body || saved.body.ok === false) {
    // Session impossible à rattacher au compte : annulée plutôt que d'encaisser un paiement sans Pro.
    await saspay(env, "POST", `/checkout-sessions/${encodeURIComponent(s.id)}/cancel/`).catch(() => null)
    return json(502, { error: "server", message: "Le paiement n’a pas pu être préparé. Réessayez dans un instant." })
  }
  return json(200, { url: s.checkout_url, ref })
}

// Transaction d'une session vérifiée auprès de SasPay : SUCCESS → Pro (nx_pay_apply) ; FAILED → session échouée.
async function settleTransaction(env, sess, tx) {
  const v = await saspay(env, "GET", `/payments/${encodeURIComponent(tx)}/verify/`)
  const status = String(v.status || "").toUpperCase()
  if (status === "SUCCESS") {
    const r = await rpc("nx_pay_apply", {
      p_secret: env.NX_PROBE_SECRET, p_id: sess.id, p_transaction: tx,
      // Comptabilité : ce que le payeur a déboursé (debited_amount) et ce qui revient à NEXORA (net_amount).
      p_net: v.net_amount != null ? String(v.net_amount) : null, p_charged: v.debited_amount != null ? String(v.debited_amount) : null,
      p_currency: v.currency ? String(v.currency) : null,
    })
    if (!r.ok || !r.body || r.body.ok === false) return { status: "error", reason: (r.body && r.body.reason) || "server" }
    return { status: "paid", period: r.body.period || sess.period || null, period_end: r.body.period_end || null }
  }
  // Aucun statut CANCELLED n'est documenté sur le paiement : traité, s'il arrive, comme un échec définitif.
  if (status === "FAILED" || status === "CANCELLED") {
    await rpc("nx_pay_session_fail", { p_secret: env.NX_PROBE_SECRET, p_id: sess.id, p_transaction: tx })
    return { status: "failed" }
  }
  return { status: "pending" }
}
async function sessionTransaction(env, id) {
  const st = await saspay(env, "GET", `/checkout-sessions/${encodeURIComponent(id)}/status/`)
  return st.transaction_id ? String(st.transaction_id) : ""
}
// Retour du client sur « Ma licence » : statut réel du paiement (jamais la seule redirection).
async function confirm(req, env) {
  if (!payReady(env)) return json(503, { error: "not_configured", message: NOT_READY })
  const user = await userOf(bearer(req))
  if (!user) return json(401, { error: "auth", message: "Connectez-vous d’abord à votre compte NEXORA." })
  const a = await req.json().catch(() => ({}))
  const ref = String(a.ref || "")
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) return json(400, { error: "bad_request" })
  const f = await rpc("nx_pay_session_find", { p_secret: env.NX_PROBE_SECRET, p_ref: ref })
  const sess = f.ok && f.body && f.body.id ? f.body : null
  if (!sess || sess.user_id !== user.id) return json(404, { error: "not_found", message: "Ce paiement est introuvable pour ce compte." })
  if (sess.status === "paid") return json(200, { status: "paid", period: sess.period, period_end: sess.period_end || null })
  if (sess.status === "failed") return json(200, { status: "failed" })
  try {
    const tx = await sessionTransaction(env, sess.id)
    return json(200, tx ? await settleTransaction(env, sess, tx) : { status: "pending" })
  } catch (e) {
    return payError(e)
  }
}

// Signature SasPay : HMAC SHA-256 hexadécimal (minuscules) de « horodatage.corps brut » avec le secret du webhook ;
// horodatage à 300 secondes au plus de l'horloge du Worker (rejeu). Comparaison en temps constant.
export async function saspaySignatureOk(secret, signature, timestamp, raw, now = Date.now()) {
  const sig = String(signature || "").trim().toLowerCase()
  const ts = String(timestamp || "").trim()
  if (!secret || !/^[0-9a-f]{64}$/.test(sig) || !/^\d{1,12}$/.test(ts) || Math.abs(now / 1000 - Number(ts)) > 300) return false
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const mac = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${raw}`)))
  return [...sig].reduce((d, c, i) => d | (c.charCodeAt(0) ^ mac.charCodeAt(i)), 0) === 0
}
async function webhook(req, env) {
  if (!env.SASPAY_WEBHOOK_SECRET || !payReady(env)) return json(503, { error: "not_configured" })
  const raw = await req.text()
  if (!(await saspaySignatureOk(env.SASPAY_WEBHOOK_SECRET, req.headers.get("x-webhook-signature"), req.headers.get("x-webhook-timestamp"), raw))) return json(400, { error: "signature" })
  let ev
  try { ev = JSON.parse(raw) } catch { return json(400, { error: "bad_request" }) }
  const type = String((ev && ev.event) || req.headers.get("x-webhook-event") || "")
  if (type === "webhook.test") return json(200, { ok: true, test: true })
  if (!/^transaction\.(success|failed|cancelled)$/.test(type)) return json(200, { ignored: type })
  const tx = ev.data && ev.data.id ? String(ev.data.id) : ""
  if (!tx) return json(200, { ignored: "transaction" })
  // L'événement ne porte ni metadata ni session : session en attente dont le statut renvoie cette transaction.
  // Traitement court et idempotent ; en cas d'échec, 5xx pour que SasPay renvoie l'événement.
  const p = await rpc("nx_pay_sessions_pending", { p_secret: env.NX_PROBE_SECRET, p_transaction: tx })
  if (!p.ok || !p.body) return json(500, { error: "server" })
  if (p.body.known) return json(200, { ok: true, duplicate: true })
  try {
    for (const sess of p.body.sessions || []) {
      if ((await sessionTransaction(env, sess.id)) !== tx) continue
      const r = await settleTransaction(env, sess, tx)
      return json(r.status === "error" ? 500 : 200, { ok: r.status !== "error", ...r })
    }
  } catch (e) {
    return json(e instanceof SasPayError && e.status === 429 ? 503 : 502, { error: "provider" })
  }
  return json(200, { ignored: "unknown_transaction" })
}

export async function handleLicences(req, env) {
  const p = new URL(req.url).pathname
  try {
    if (p === "/license/config") return json(200, { signing: Boolean(env.NX_LICENSE_SIGNING_KEY), payments: payReady(env), webhook: Boolean(env.SASPAY_WEBHOOK_SECRET), relay: Boolean(env.NX_PROBE_SECRET), yearly: true, provider: "saspay" })
    if (p === "/security/manifest") return await securityManifest(env)
    if (req.method !== "POST") return json(405, { error: "method" })
    if (p === "/security/report") return await securityReport(req, env)
    if (p === "/security/publication" && req.method === "POST") return await securityPublication(req, env)
    if (p === "/license/check") return await licenseCheck(req, env)
    if (p === "/pay/checkout") return await checkout(req, env)
    if (p === "/pay/confirm") return await confirm(req, env)
    if (p === "/pay/webhook") return await webhook(req, env)
  } catch (e) {
    return json(500, { error: "server", message: String((e && e.message) || e).slice(0, 200) })
  }
  return json(404, { error: "not_found" })
}
