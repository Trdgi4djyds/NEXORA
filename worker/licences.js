// Routes des licences et des abonnements du Worker de NEXORA (NEXORA #076).
//   POST /license/check   contrôle obligatoire du logiciel : relaie nx_license_check (session de l'utilisateur,
//                         adresse IP vue par Cloudflare) puis SIGNE la réponse (Ed25519). Le logiciel refuse
//                         toute réponse non signée par la clé de NEXORA : il ne s'ouvre pas sans ce contrôle.
//   GET  /license/config  ce qui est réglé (signature, paiements), sans jamais renvoyer un secret.
//   POST /pay/checkout    page de paiement de l'abonnement Pro (mensuel ou annuel) dans le navigateur.
//   POST /pay/portal      espace de gestion de l'abonnement (moyen de paiement, factures, résiliation).
//   POST /pay/webhook     événements du prestataire (signature vérifiée) → nx_billing_apply.
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
// base, déjà utilisé par la deuxième région), STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTH,
// STRIPE_PRICE_YEAR. Prestataire : Stripe ; un autre (Mobile Money) s'ajouterait ici avec ses propres routes.
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
  if (!env.NX_LICENSE_SIGNING_KEY) return json(503, { error: "not_configured", message: "Le serveur de licences de NEXORA n’est pas encore configuré. Réessaie dans quelques minutes." })
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
  const body = !token ? { ok: false, reason: "auth", message: "Connecte-toi à ton compte NEXORA pour ouvrir le logiciel." }
    : r.status === 401 || (r.body && /jwt/i.test(String(r.body.message || ""))) ? { ok: false, reason: "auth", message: "Ta session NEXORA a expiré : reconnecte-toi." }
    : !r.ok ? { ok: false, reason: "server", message: "Le serveur de licences n’a pas pu vérifier ta licence. Réessaie dans un instant." }
    : r.body
  const { publication } = await latestPublication()
  const payload = { ...body, publication, nonce: args.p_nonce, device: args.p_device, signed_at: new Date().toISOString(), country: req.cf && req.cf.country ? req.cf.country : "" }
  return json(200, await signPayload(env, payload))
}

// ---------- Stripe ----------
async function stripe(env, method, path, form) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
    body: form ? new URLSearchParams(form).toString() : undefined,
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((body.error && body.error.message) || `Stripe ${r.status}`)
  return body
}
const payReady = (env) => Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_MONTH)
async function customerOf(token, uid) {
  const r = await fetch(`${SUPA}/rest/v1/nx_billing?select=customer_id&user_id=eq.${uid}`, { headers: { apikey: setup.publicKey, authorization: `Bearer ${token}` } })
  const rows = await r.json().catch(() => [])
  return Array.isArray(rows) && rows[0] && rows[0].customer_id ? rows[0].customer_id : null
}
async function checkout(req, env) {
  if (!payReady(env)) return json(503, { error: "not_configured", message: "Le paiement en ligne arrive très bientôt. En attendant, écris à l’assistance depuis Mon compte → Support." })
  const token = bearer(req)
  const user = await userOf(token)
  if (!user) return json(401, { error: "auth", message: "Connecte-toi d’abord à ton compte NEXORA." })
  const a = await req.json().catch(() => ({}))
  const year = a.period === "year" && env.STRIPE_PRICE_YEAR
  const customer = await customerOf(token, user.id)
  const form = {
    mode: "subscription", "line_items[0][price]": year ? env.STRIPE_PRICE_YEAR : env.STRIPE_PRICE_MONTH, "line_items[0][quantity]": "1",
    client_reference_id: user.id, "metadata[nexora_user]": user.id, "subscription_data[metadata][nexora_user]": user.id,
    allow_promotion_codes: "true", locale: "fr",
    success_url: `${SITE}/site/#/licence?paiement=ok`, cancel_url: `${SITE}/site/#/licence?paiement=annule`,
  }
  if (customer) form.customer = customer; else form.customer_email = user.email
  const s = await stripe(env, "POST", "checkout/sessions", form)
  return json(200, { url: s.url })
}
async function portal(req, env) {
  if (!payReady(env)) return json(503, { error: "not_configured", message: "La gestion de l’abonnement en ligne arrive très bientôt." })
  const token = bearer(req)
  const user = await userOf(token)
  if (!user) return json(401, { error: "auth", message: "Connecte-toi d’abord à ton compte NEXORA." })
  const customer = await customerOf(token, user.id)
  if (!customer) return json(404, { error: "no_customer", message: "Aucun abonnement payé pour ce compte." })
  const s = await stripe(env, "POST", "billing_portal/sessions", { customer, return_url: `${SITE}/site/#/licence`, locale: "fr" })
  return json(200, { url: s.url })
}

// Signature Stripe : en-tête « t=…,v1=… », HMAC SHA-256 de « t.corps » avec le secret du webhook, 5 minutes au plus.
export async function stripeSignatureOk(secret, header, raw, now = Date.now()) {
  const parts = Object.fromEntries(String(header || "").split(",").map((x) => x.split("=")).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), v.trim()]))
  const sigs = String(header || "").split(",").filter((x) => x.trim().startsWith("v1=")).map((x) => x.trim().slice(3))
  if (!parts.t || !sigs.length || Math.abs(now / 1000 - Number(parts.t)) > 300) return false
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parts.t}.${raw}`))
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")
  return sigs.some((s) => s.length === hex.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0)
}
const iso = (t) => (t ? new Date(Number(t) * 1000).toISOString() : null)
function fromSubscription(sub) {
  const item = sub.items && sub.items.data && sub.items.data[0]
  return {
    status: sub.status, customer: sub.customer, subscription: sub.id, cancel: Boolean(sub.cancel_at_period_end),
    end: iso(sub.current_period_end || (item && item.current_period_end)),
    period: item && item.price && item.price.recurring && item.price.recurring.interval === "year" ? "year" : "month",
    user: (sub.metadata && sub.metadata.nexora_user) || null,
  }
}
export async function eventToBilling(env, ev) {
  const o = ev.data && ev.data.object ? ev.data.object : {}
  if (ev.type === "checkout.session.completed") {
    const sub = o.subscription ? fromSubscription(await stripe(env, "GET", `subscriptions/${o.subscription}`)) : {}
    return { ...sub, user: o.client_reference_id || sub.user || null, customer: o.customer, subscription: o.subscription, status: sub.status || "active", amount: o.amount_total || 0, currency: o.currency || "usd" }
  }
  if (/^customer\.subscription\.(created|updated|deleted)$/.test(ev.type)) {
    const s = fromSubscription(o)
    return { ...s, status: ev.type.endsWith("deleted") ? "canceled" : s.status, amount: 0, currency: "usd" }
  }
  if (ev.type === "invoice.paid" || ev.type === "invoice.payment_failed") {
    const line = o.lines && o.lines.data && o.lines.data[0]
    return {
      status: ev.type === "invoice.paid" ? "active" : "past_due", customer: o.customer, subscription: o.subscription || (o.parent && o.parent.subscription_details && o.parent.subscription_details.subscription) || null,
      end: iso(line && line.period && line.period.end), period: null, cancel: false, user: null, amount: o.amount_paid || 0, currency: o.currency || "usd",
    }
  }
  return null
}
async function webhook(req, env) {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.NX_PROBE_SECRET) return json(503, { error: "not_configured" })
  const raw = await req.text()
  if (!(await stripeSignatureOk(env.STRIPE_WEBHOOK_SECRET, req.headers.get("stripe-signature"), raw))) return json(400, { error: "signature" })
  const ev = JSON.parse(raw)
  const b = await eventToBilling(env, ev)
  if (!b) return json(200, { ignored: ev.type })
  const r = await rpc("nx_billing_apply", {
    p_secret: env.NX_PROBE_SECRET, p_provider: "stripe", p_event_id: ev.id, p_user: b.user, p_status: b.status, p_period: b.period || "month",
    p_period_end: b.end, p_customer: b.customer || null, p_subscription: b.subscription || null, p_amount: b.amount || 0, p_currency: b.currency || "usd",
    p_kind: ev.type, p_cancel_at_end: Boolean(b.cancel),
  })
  // 500 : le prestataire renverra l'événement plus tard.
  return json(r.ok ? 200 : 500, r.body || {})
}

export async function handleLicences(req, env) {
  const p = new URL(req.url).pathname
  try {
    if (p === "/license/config") return json(200, { signing: Boolean(env.NX_LICENSE_SIGNING_KEY), payments: payReady(env), webhook: Boolean(env.STRIPE_WEBHOOK_SECRET), relay: Boolean(env.NX_PROBE_SECRET), yearly: Boolean(env.STRIPE_PRICE_YEAR) })
    if (p === "/security/manifest") return await securityManifest(env)
    if (req.method !== "POST") return json(405, { error: "method" })
    if (p === "/security/report") return await securityReport(req, env)
    if (p === "/security/publication" && req.method === "POST") return await securityPublication(req, env)
    if (p === "/license/check") return await licenseCheck(req, env)
    if (p === "/pay/checkout") return await checkout(req, env)
    if (p === "/pay/portal") return await portal(req, env)
    if (p === "/pay/webhook") return await webhook(req, env)
  } catch (e) {
    return json(500, { error: "server", message: String((e && e.message) || e).slice(0, 200) })
  }
  return json(404, { error: "not_found" })
}
