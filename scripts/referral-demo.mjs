// NEXORA #090 : données de démonstration de NEXORA REFERRAL (parrainage), pour les captures seulement : section
// Parrainage du back office, espace des parrains (/referral/), carte de parrainage de NEXORA et du site. Mêmes formes
// que les fonctions de la migration 20261108000007_parrainage.sql. Personnes fictives, aucune donnée réelle.
// État réglable par les scripts de capture : demoReferral.state = « actif » (par défaut), « code » (code du mois à
// saisir), « nonparrain » ; NX_DEMO_PARRAIN=oui : le compte de démonstration de NEXORA est filleul (code KOFI25).
const now = Date.now()
const DAY = 86400000
const ago = (days) => new Date(now - days * DAY).toISOString()
const hex = (n, len) => ((n * 2654435761) >>> 0).toString(16).padStart(8, "0").repeat(8).slice(0, len)
const uid = (n) => `${hex(n + 900, 8)}-${hex(n + 907, 4)}-4${hex(n + 903, 3)}-a${hex(n + 905, 3)}-${hex(n + 911, 12)}`
const mask = (e) => `${e.split("@")[0].slice(0, 2)}•••@${e.split("@")[1]}`
const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)) }
const monthEnd = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString() }

export const demoReferral = { state: "actif" }
const RULES = { enabled: true, discount_pct: 30, commission_pct: 25, min_payout_cents: 2000, hold_days: 30, max_codes: 20, cookie_days: 90,
  methods: ["paypal", "bank", "mobile_money"], list_month_cents: 2500, list_year_cents: 25000, month_cents: 1750, year_cents: 17500 }
// Commission d'un paiement : 25 % de ce que paie le filleul (remise de 30 % déduite).
const COMM = (paid) => (paid * RULES.commission_pct) / 100
const PAYOUT = 20000

const partners = [
  { n: 1, name: "Kofi Mensah", email: "kofi.mensah@exemple.ci", status: "active", since: 262, code: "H7KM-4QZP", unlocked: true, payout: ["mobile_money", "+225 07 48 12 33 90 · Orange Money"], note: "Chaîne YouTube tech (42 k abonnés)", payers: 64, yearly: 9, signed: 7, stopped: 3, codes: [["KOFI25", "Chaîne YouTube", true], ["KOFI-WHATSAPP", "Groupe WhatsApp des développeurs", true], ["KOFI-ECOLE", "Atelier à l’école de code", false]] },
  { n: 2, name: "Ibrahim Touré", email: "ibrahim.toure@exemple.ml", status: "active", since: 190, code: "P2WD-7HNR", unlocked: true, payout: ["bank", "ML13 0001 2345 6789 · Ibrahim Touré"], note: "Agence web à Bamako", payers: 44, yearly: 9, signed: 4, stopped: 1, codes: [["IBRA-AGENCE", "Clients de l’agence", true]], open: 15000 },
  { n: 3, name: "Ama Kouassi", email: "ama.kouassi@exemple.ci", status: "active", since: 118, code: "R3TN-8XWD", unlocked: false, payout: ["", ""], note: "Formatrice", payers: 7, yearly: 1, signed: 3, stopped: 0, codes: [["AMA-TECH", "Formation en ligne", true]] },
  { n: 4, name: "Yao N’Guessan", email: "yao.nguessan@exemple.ci", status: "invited", since: 2, code: "C9PF-2MJV", unlocked: false, payout: ["", ""], note: "Rencontré au salon du numérique", payers: 0, yearly: 0, signed: 0, stopped: 0, codes: [] },
  { n: 5, name: "Fatou Diop", email: "fatou.diop@exemple.sn", status: "suspended", since: 160, code: "", unlocked: false, payout: ["paypal", "fatou.diop@exemple.sn"], note: "Suspendue : codes publiés sur un site de bons plans", payers: 3, yearly: 0, signed: 2, stopped: 3, codes: [["FATOU30", "Instagram", false]] },
]
const FIRST = ["Awa", "Ibrahim", "Mariam", "Serge", "Aïcha", "Olivier", "Fatim", "Koffi", "Nadia", "Paul", "Salif", "Grâce", "Moussa", "Léa", "Adama", "Esther", "Didier", "Kadi", "Hugo", "Rokia", "Yves", "Sarah", "Lamine", "Inès"]
const LAST = ["traore", "kone", "bamba", "yao", "diallo", "nguessan", "sow", "adje", "toure", "kouame", "cisse", "ekra", "sylla", "martin", "camara", "kassi", "zadi", "fofana", "bernard", "keita"]
const DOMAINS = ["gmail.com", "exemple.ci", "yahoo.fr", "exemple.fr", "outlook.com"]

const P = partners.map((p) => ({
  id: uid(p.n), email: p.email, name: p.name, user_id: p.status === "invited" ? null : uid(p.n + 50), status: p.status,
  invite_token: p.status === "invited" ? hex(p.n * 7 + 3, 64) : null, invite_created_at: ago(p.since), note: p.note,
  payout_method: p.payout[0], payout_details: p.payout[1], unlocked_month: p.unlocked ? monthStart().toISOString().slice(0, 10) : null,
  failed_attempts: 0, locked_until: null, created_by: null, created_at: ago(p.since), activated_at: p.status === "invited" ? null : ago(p.since - 1),
  last_seen_at: p.status === "invited" ? null : ago(p.n === 1 ? 0.02 : p.n), _src: p,
}))

// Filleuls et paiements : un paiement par mois (ou par an) depuis l'arrivée de chaque filleul payant.
const referrals = []
const commissions = []
let cid = 1
let k = 0
for (const p of P) {
  const s = p._src
  const total = s.payers + s.signed + s.stopped
  const codes = s.codes.filter((c) => c[2]).map((c) => c[0])
  for (let i = 0; i < total; i += 1) {
    k += 1
    const email = `${FIRST[k % FIRST.length].toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}.${LAST[(k * 7) % LAST.length]}${k > 20 ? k : ""}@${DOMAINS[k % DOMAINS.length]}`
    const since = Math.max(3, Math.round(s.since - 4 - ((i * 37) % Math.max(10, s.since - 8))))
    const kind = i < s.payers - s.yearly ? "month" : i < s.payers ? "year" : i < s.payers + s.signed ? "signed" : "stopped"
    const user = uid(1000 + k)
    const code = codes.length ? codes[i % codes.length] : s.codes[0] ? s.codes[0][0] : ""
    referrals.push({ user_id: user, email, partner_id: p.id, partner: p.name, code, source: i % 3 === 0 ? "code" : "link", since: ago(since), kind })
    if (kind === "signed") continue
    const months = kind === "year" ? 1 : kind === "stopped" ? Math.min(2, Math.floor(since / 30)) : Math.floor(since / 30) + 1
    for (let m = 0; m < months; m += 1) {
      const at = since - m * (kind === "year" ? 365 : 30)
      if (at < 0) break
      const paid = kind === "year" ? RULES.year_cents : RULES.month_cents
      commissions.push({ id: cid++, partner_id: p.id, user_id: user, source: m % 5 === 4 ? "manual" : "saspay", source_ref: `demo:${cid}`, period: kind === "year" ? "year" : "month",
        paid_cents: paid, list_cents: kind === "year" ? 25000 : 2500, rate: RULES.commission_pct, amount_cents: COMM(paid), currency: "usd",
        status: p._src.n === 1 && k % 17 === 0 && m === 0 ? "canceled" : "valid", available_at: ago(at - 30), note: p._src.n === 1 && k % 17 === 0 && m === 0 ? "Remboursé" : "", created_at: ago(at), canceled_at: null })
    }
  }
}
const valid = (c) => c.status === "valid"
const sum = (list, f) => list.reduce((t, x) => t + Number(f(x)), 0)
function balanceOf(pid, payouts) {
  const c = commissions.filter((x) => x.partner_id === pid && valid(x))
  const matured = sum(c.filter((x) => Date.parse(x.available_at) <= now), (x) => x.amount_cents)
  const o = payouts.filter((x) => x.partner_id === pid)
  const reserved = sum(o.filter((x) => ["requested", "approved"].includes(x.status)), (x) => x.amount_cents)
  const paid = sum(o.filter((x) => x.status === "paid"), (x) => x.amount_cents)
  return { earned_cents: sum(c, (x) => x.amount_cents), pending_cents: sum(c.filter((x) => Date.parse(x.available_at) > now), (x) => x.amount_cents), matured_cents: matured,
    reserved_cents: reserved, paid_cents: paid, available_cents: Math.max(0, matured - reserved - paid) }
}
// Retraits : versés tant que le disponible dépassait le minimum, puis une demande ouverte (Ibrahim).
const payouts = []
let po = 1
for (const p of P) {
  let b = balanceOf(p.id, payouts)
  let at = 75
  while (b.available_cents - PAYOUT >= (p._src.n === 1 ? PAYOUT : RULES.min_payout_cents) && at > 5) {
    payouts.push({ id: uid(5000 + po), partner_id: p.id, amount_cents: PAYOUT, method: p.payout_method || "paypal", details: p.payout_details || p.email, status: "paid",
      reference: `${p.payout_method === "bank" ? "VIR" : "MM"}-${String(202600 + po)}`, admin_note: "Versé, merci pour ton travail !", requested_at: ago(at + 2), processed_at: ago(at), processed_by: null })
    po += 1
    at -= 34
    b = balanceOf(p.id, payouts)
  }
  if (p._src.open) payouts.push({ id: uid(5000 + po++), partner_id: p.id, amount_cents: p._src.open, method: p.payout_method, details: p.payout_details, status: "requested", reference: "", admin_note: "", requested_at: ago(0.3), processed_at: null, processed_by: null })
}
payouts.push({ id: uid(5000 + po++), partner_id: P[4].id, amount_cents: 5000, method: "paypal", details: "fatou.diop@exemple.sn", status: "rejected", reference: "", admin_note: "Commissions sur des abonnements remboursés", requested_at: ago(40), processed_at: ago(38), processed_by: null })
payouts.sort((a, b) => Date.parse(b.requested_at) - Date.parse(a.requested_at))

const codesRows = P.flatMap((p) => p._src.codes.map(([code, label, active], i) => ({ id: uid(3000 + p._src.n * 10 + i), partner_id: p.id, code, label, active, created_at: ago(p._src.since - 2 - i * 9) })))
const active = (r) => r.kind === "month" || r.kind === "year"
function recurringOf(pid) {
  const list = referrals.filter((r) => (!pid || r.partner_id === pid) && active(r))
  return { payers: list.length, commission_cents: sum(list, (r) => (r.kind === "year" ? COMM(RULES.year_cents) / 12 : COMM(RULES.month_cents))),
    gross_cents: sum(list, (r) => (r.kind === "year" ? RULES.year_cents / 12 : RULES.month_cents)) }
}
function series(pid, gross) {
  const m0 = monthStart()
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth() - 11 + i, 1))
    const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    const c = commissions.filter((x) => valid(x) && (!pid || x.partner_id === pid) && Date.parse(x.created_at) >= d.getTime() && Date.parse(x.created_at) < e.getTime())
    const month = d.toISOString().slice(0, 7)
    return gross ? { month, gross_cents: sum(c, (x) => x.paid_cents), commission_cents: sum(c, (x) => x.amount_cents) } : { month, amount_cents: sum(c, (x) => x.amount_cents) }
  })
}
const strip = ({ _src, ...p }) => p // eslint-disable-line no-unused-vars
const kofi = P[0]

function me() {
  if (demoReferral.state === "nonparrain") return { partner: false, auth: true, email: "camille.laurent@exemple.fr", invited: false }
  return { partner: true, auth: true, id: kofi.id, name: kofi.name, email: kofi.email, status: "active", needs_code: demoReferral.state === "code",
    month: monthStart().toISOString().slice(0, 10), code_expires_at: monthEnd(), locked_until: null, payout_method: kofi.payout_method, payout_details: kofi.payout_details, activated_at: kofi.activated_at }
}

export const referralTables = {
  nx_partners: P.map(strip),
  nx_commissions: [...commissions].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
  nx_payouts: payouts,
  nx_referral_codes: codesRows,
}

/** Réponse d'une fonction du parrainage, ou undefined si ce n'en est pas une. */
export function referralRpc(name, args = {}) {
  const m0 = monthStart().toISOString().slice(0, 10)
  switch (name) {
    // ---- clients (NEXORA, site vitrine)
    case "nx_referral_mine":
      return process.env.NX_DEMO_PARRAIN === "oui"
        ? { referred: true, code: "KOFI25", partner: "Kofi", source: "link", since: ago(3), ...RULES }
        : { referred: false, eligible: true, ...RULES }
    case "nx_referral_attach": {
      const code = String(args.p_code || "").toUpperCase()
      const c = codesRows.find((x) => x.code === code && x.active)
      return c ? { ok: true, already: false, referred: true, code, partner: P.find((p) => p.id === c.partner_id).name.split(" ")[0], source: args.p_source || "code", ...RULES } : { ok: false, reason: "unknown" }
    }
    case "nx_referral_resolve": {
      const code = String(args.p_code || "").toUpperCase()
      const c = codesRows.find((x) => x.code === code && x.active)
      return c ? { valid: true, code, partner: P.find((p) => p.id === c.partner_id).name.split(" ")[0], ...RULES } : { valid: false }
    }
    // ---- espace des parrains
    case "nx_partner_invite_info": return { valid: true, email: mask(P[3].email), name: "Yao", expires_at: monthEnd() }
    case "nx_partner_me": return me()
    case "nx_partner_activate":
    case "nx_partner_unlock": demoReferral.state = "actif"; return { ok: true, ...me() }
    case "nx_partner_dashboard": {
      const open = payouts.find((o) => o.partner_id === kofi.id && ["requested", "approved"].includes(o.status)) || null
      return { balance: balanceOf(kofi.id, payouts), recurring: recurringOf(kofi.id), referrals: referrals.filter((r) => r.partner_id === kofi.id).length,
        referrals_month: referrals.filter((r) => r.partner_id === kofi.id && Date.parse(r.since) >= monthStart().getTime()).length,
        month_cents: sum(commissions.filter((x) => valid(x) && x.partner_id === kofi.id && Date.parse(x.created_at) >= monthStart().getTime()), (x) => x.amount_cents),
        codes: codesRows.filter((c) => c.partner_id === kofi.id && c.active).length, series: series(kofi.id, false), rules: RULES, open_payout: open }
    }
    case "nx_partner_codes":
      return codesRows.filter((c) => c.partner_id === kofi.id).map((c) => {
        const rs = referrals.filter((r) => r.partner_id === kofi.id && r.code === c.code)
        return { ...c, referrals: rs.length, payers: rs.filter(active).length, earned_cents: sum(commissions.filter((x) => valid(x) && rs.some((r) => r.user_id === x.user_id)), (x) => x.amount_cents) }
      })
    case "nx_partner_code_create": return { id: uid(3999), partner_id: kofi.id, code: String(args.p_code || "").toUpperCase(), label: args.p_label || "", active: true, created_at: ago(0) }
    case "nx_partner_code_update": return { ok: true }
    case "nx_partner_referrals":
      return referrals.filter((r) => r.partner_id === kofi.id).sort((a, b) => Date.parse(b.since) - Date.parse(a.since)).map((r) => {
        const c = commissions.filter((x) => x.user_id === r.user_id && valid(x)).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        return { who: mask(r.email), since: r.since, code: r.code, source: r.source, active: active(r), period: r.kind === "year" ? "year" : r.kind === "signed" ? null : "month",
          payments: c.length, earned_cents: sum(c, (x) => x.amount_cents), last_payment_at: c[0] ? c[0].created_at : null,
          renews_at: active(r) && c[0] ? new Date(Date.parse(c[0].created_at) + (r.kind === "year" ? 365 : 30) * DAY).toISOString() : null }
      })
    case "nx_partner_commissions": {
      const all = commissions.filter((x) => x.partner_id === kofi.id).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      const off = Number(args.p_offset) || 0
      const lim = Number(args.p_limit) || 100
      return { total: all.length, rows: all.slice(off, off + lim).map((c) => ({ id: c.id, at: c.created_at, who: mask(referrals.find((r) => r.user_id === c.user_id).email), period: c.period,
        paid_cents: c.paid_cents, list_cents: c.list_cents, rate: c.rate, amount_cents: c.amount_cents, currency: "usd",
        state: c.status === "canceled" ? "canceled" : Date.parse(c.available_at) > now ? "pending" : "available", available_at: c.available_at, note: c.note })) }
    }
    case "nx_partner_payouts": return payouts.filter((o) => o.partner_id === kofi.id).map((o) => ({ ...o, note: o.admin_note }))
    case "nx_partner_payout_request": return { id: uid(5999), partner_id: kofi.id, amount_cents: args.p_amount_cents, method: args.p_method, details: args.p_details, status: "requested", requested_at: ago(0) }
    case "nx_partner_payout_cancel":
    case "nx_partner_profile_set": return me()
    // ---- back office
    case "nx_admin_referral_overview": {
      const c = commissions.filter(valid)
      const gross = sum(c, (x) => x.paid_cents)
      const comm = sum(c, (x) => x.amount_cents)
      const open = payouts.filter((o) => ["requested", "approved"].includes(o.status))
      return { partners: { invited: P.filter((p) => p.status === "invited").length, active: P.filter((p) => p.status === "active").length, suspended: P.filter((p) => p.status === "suspended").length },
        referrals: referrals.length, referrals_month: referrals.filter((r) => Date.parse(r.since) >= monthStart().getTime()).length,
        gross_cents: gross, list_cents: sum(c, (x) => x.list_cents), discount_cents: sum(c, (x) => x.list_cents) - gross, commission_cents: comm, net_cents: gross - comm, payments: c.length,
        paid_out_cents: sum(payouts.filter((o) => o.status === "paid"), (o) => o.amount_cents), open_payouts: { count: open.length, amount_cents: sum(open, (o) => o.amount_cents) },
        recurring: recurringOf(null), series: series(null, true), rules: RULES }
    }
    case "nx_admin_partners":
      return P.map((p) => ({ ...strip(p), month_code: p.status === "suspended" ? "" : p._src.code, month_code_used_at: p._src.unlocked ? ago(new Date().getUTCDate() - 1) : null,
        unlocked: p._src.unlocked, codes: p._src.codes.length, referrals: referrals.filter((r) => r.partner_id === p.id).length, recurring: recurringOf(p.id), balance: balanceOf(p.id, payouts) }))
    case "nx_admin_referrals":
      return referrals.sort((a, b) => Date.parse(b.since) - Date.parse(a.since)).map((r) => {
        const c = commissions.filter((x) => x.user_id === r.user_id && valid(x))
        return { user_id: r.user_id, email: r.email, partner_id: r.partner_id, partner: r.partner, code: r.code, source: r.source, since: r.since, active: active(r),
          billing: active(r) ? "active" : r.kind === "stopped" ? "canceled" : null, period: r.kind === "year" ? "year" : r.kind === "signed" ? null : "month",
          payments: c.length, paid_cents: sum(c, (x) => x.paid_cents), commission_cents: sum(c, (x) => x.amount_cents) }
      })
    case "nx_admin_partner_create":
      return { partner: { id: uid(4999), email: String(args.p_email || "").toLowerCase(), name: args.p_name, status: "invited" }, invite_token: hex(4242, 64), code: "W4KT-9BNE", month: m0, expires_at: monthEnd() }
    case "nx_admin_partner_code": return { code: args.p_regenerate ? "N6QA-3RZE" : (P.find((p) => p.id === args.p_partner) || kofi)._src.code, month: m0, used_at: null, expires_at: monthEnd() }
    case "nx_admin_partner_invite_reset": return { invite_token: hex(4343, 64) }
    case "nx_admin_partner_update":
    case "nx_admin_payout_update":
    case "nx_admin_commission_cancel":
    case "nx_admin_referral_payment":
    case "nx_admin_referral_assign": return { ok: true }
    case "nx_admin_referral_settings": return { ...RULES, ...(args.p_value || {}) }
    default: return undefined
  }
}

/** Session de supabase-js (clé nexora-referral-auth) du parrain de démonstration. */
export function demoPartnerSession() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url")
  const exp = Math.floor(now / 1000) + 86400
  const user = { id: kofi.user_id, email: kofi.email, aud: "authenticated", role: "authenticated", app_metadata: { provider: "email" }, user_metadata: {}, created_at: kofi.created_at }
  return { access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user.id, exp, role: "authenticated", aud: "authenticated", email: user.email })}.demo`,
    refresh_token: "demo", token_type: "bearer", expires_in: 86400, expires_at: exp, user }
}
export const demoInviteToken = P[3].invite_token
