// NEXORA #090 : essais de NEXORA REFERRAL (migration 20261108000007_parrainage.sql), rejouée deux fois sur PGlite après
// toute la chaîne des offres et des licences (même base d'essai que pnpm test:offres et pnpm test:licences), puis le
// paiement du Worker (remise du parrainage) avec un faux Stripe. PGlite est installé HORS du dépôt :
//   mkdir -p /tmp/pgtest && cd /tmp/pgtest && echo '{}' > package.json && pnpm add @electric-sql/pglite@0.3
// puis : pnpm test:parrainage (dossier : PGLITE_DIR, /tmp/pgtest par défaut).
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import { ROOT } from "../preview/server.mjs"

let count = 0
let fails = 0
function ok(cond, label, extra) {
  count += 1
  if (cond) console.log(`OK   ${label}`)
  else {
    fails += 1
    console.log(`ÉCHEC ${label}${extra !== undefined ? ` : ${JSON.stringify(extra).slice(0, 500)}` : ""}`)
  }
}

const dir = process.env.PGLITE_DIR || "/tmp/pgtest"
let PGlite
try {
  ;({ PGlite } = await import(pathToFileURL(createRequire(path.join(dir, "package.json")).resolve("@electric-sql/pglite")).href))
} catch {
  console.log(`PGlite introuvable dans ${dir} : voir l’en-tête du script.`)
  process.exit(1)
}
const offres = fs.readFileSync(path.join(ROOT, "scripts/test-offres.mjs"), "utf8")
const setup = /async function sql\(\)[\s\S]*?await ex\(`([\s\S]*?)\n`\)/.exec(offres)[1]
const mig = (f) => fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8")

const db = new PGlite()
const q = async (t, p) => (await db.query(t, p)).rows
await db.exec(setup)
await db.exec(`
alter table profiles add column if not exists last_seen_at timestamptz;
create table if not exists app_config (key text primary key, value jsonb, description text not null default '', updated_at timestamptz default now(), updated_by uuid);
create schema if not exists vault;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
insert into vault.decrypted_secrets values ('nx_probe_secret', 'secret-du-worker');
create table mails (to_addr text, subject text, body text);
create or replace function nx_brevo_send(p_to text, p_to_name text, p_subject text, p_text text, p_kicker text default 'Supervision') returns bigint language sql as $$ insert into mails values (p_to, p_subject, p_text); select 42::bigint $$;
`)
const chain = ["20261104000007_offres_limites.sql", "20261106000001_prix_offres.sql", "20261106000006_reajustements.sql", "20261108000002_licences_offres.sql",
  "20261108000003_securite_licences_admin.sql", "20261108000004_acces_administrateurs.sql", "20261108000005_publication_connue.sql", "20261108000006_offre_gratuite_applications.sql"]
for (const f of chain) await db.exec(mig(f))
const M = mig("20261108000007_parrainage.sql")
await db.exec(M)
await db.exec(M)
ok(true, "Migration 20261108000007 rejouée deux fois sans erreur, après toute la chaîne des offres et des licences")
// « Tout appliquer » du back office rejoue toutes les migrations dans l'ordre.
for (const f of chain) await db.exec(mig(f))
await db.exec(M)

// ---------- Offre Pro et réglages ----------
const pro = (await q("select price_month_cents, price_year_cents from plans where id = 'pro'"))[0]
ok(pro.price_month_cents === 2500 && pro.price_year_cents === 25000, "Offre Pro : 25 $ par mois, 250 $ par an (après la chaîne complète, rejouée)", pro)
await db.exec("update plans set price_month_cents = 2600 where id = 'pro'")
await db.exec(M)
ok((await q("select price_month_cents from plans where id = 'pro'"))[0].price_month_cents === 2600, "Offre Pro : un prix changé dans le back office est conservé au passage suivant")
await db.exec("update plans set price_month_cents = 2500 where id = 'pro'")
const prices = (await q("select nx_referral_prices() as r"))[0].r
ok(prices.discount_pct === 30 && prices.commission_pct === 25 && prices.month_cents === 1750 && prices.year_cents === 17500 && prices.list_month_cents === 2500,
  "Parrainage : 30 % de remise (17,50 $ par mois, 175 $ par an), 25 % de commission", prices)
const cfg = (await q("select nx_referral_cfg() as r"))[0].r
ok(cfg.min_payout_cents === 2000 && cfg.hold_days === 30 && cfg.methods.length === 3, "Parrainage : retrait à partir de 20 $, gains disponibles après 30 jours", cfg)

// ---------- Comptes ----------
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`
const users = [[1, "admin@nexora.test", "superadmin"], [2, "kofi.partenaire@exemple.ci", "user"], [3, "client.awa@gmail.com", "user"], [4, "intrus@exemple.ci", "user"],
  [5, "client.yao@gmail.com", "user"], [6, "deja.pro@exemple.ci", "user"], [7, "ama.partenaire@exemple.ci", "user"], [8, "client.annuel@gmail.com", "user"]]
for (const [n, e, role] of users) {
  await db.exec(`insert into auth.users values ('${id(n)}', '${e}'); insert into profiles (id, email, app_role) values ('${id(n)}', '${e}', '${role}');
    insert into organizations (id, name, personal, owner_id) values ('${id(100 + n)}', 'Espace ${n}', true, '${id(n)}');
    insert into organization_members values ('${id(100 + n)}', '${id(n)}', 'owner');`)
}
await db.exec(`insert into subscriptions (org_id, plan_id, status) values ('${id(106)}', 'pro', 'active')`)
const as = async (n, sql, params) => {
  await db.exec(n === null ? "set role anon; select set_config('request.jwt.claim.sub', '', false);" : `set role authenticated; select set_config('request.jwt.claim.sub', '${id(n)}', false);`)
  try { return await q(sql, params) } finally { await db.exec("reset role;") }
}
const one = async (n, sql, params) => (await as(n, sql, params))[0].r
const fails_ = async (n, sql, params) => { try { await as(n, sql, params); return "" } catch (e) { return String(e.message) } }

// ---------- Parrain créé par le back office ----------
const refused = await fails_(4, "select nx_admin_partner_create('x@y.ci', 'X') as r")
ok(/administrateurs/.test(refused), "Back office : seul un administrateur crée un parrain", refused)
const created = await one(1, "select nx_admin_partner_create($1, $2, $3) as r", ["Kofi.Partenaire@exemple.ci", "Kofi Mensah", "Influenceur tech"])
const token = created.invite_token
ok(/^[0-9a-f]{64}$/.test(token) && /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/.test(created.code) && created.partner.status === "invited" && created.partner.email === "kofi.partenaire@exemple.ci",
  "Back office : parrain invité, lien d'invitation (64 caractères) et code d'accès du mois (XXXX-XXXX)", created)
ok(/existe déjà/.test(await fails_(1, "select nx_admin_partner_create('KOFI.partenaire@exemple.ci', 'Autre') as r")), "Back office : une adresse ne sert qu'à un parrain")
const info = await one(null, "select nx_partner_invite_info($1) as r", [token])
ok(info.valid && info.email === "ko•••@exemple.ci" && info.name === "Kofi" && info.expires_at, "Lien d'invitation : adresse masquée, prénom, fin du mois", info)
ok((await one(null, "select nx_partner_invite_info($1) as r", ["0".repeat(64)])).valid === false, "Lien d'invitation : jeton inconnu refusé")
ok(/permission denied/i.test(await fails_(null, "select * from nx_partners")) && (await as(4, "select * from nx_partners")).length === 0 && (await as(1, "select * from nx_partners")).length === 1,
  "Tables : aucun accès anonyme, rien pour un compte ordinaire, tout pour l'administrateur")
ok(/permission denied/i.test(await fails_(4, "insert into nx_commissions (partner_id, source_ref, paid_cents, rate, amount_cents, available_at) values (gen_random_uuid(), 'x', 1, 1, 1, now())")),
  "Tables : aucune écriture directe (commissions)")

// ---------- Activation : lien + adresse e-mail + code du mois ----------
const wrongMail = await one(4, "select nx_partner_activate($1, $2) as r", [token, created.code])
ok(wrongMail.ok === false && wrongMail.reason === "email" && wrongMail.expected === "ko•••@exemple.ci", "Activation : un autre compte que l'adresse invitée est refusé", wrongMail)
const wrongCode = await one(2, "select nx_partner_activate($1, $2) as r", [token, "AAAA-AAAA"])
ok(wrongCode.ok === false && wrongCode.reason === "code" && wrongCode.left === 4, "Activation : code faux refusé (4 essais restants)", wrongCode)
const act = await one(2, "select nx_partner_activate($1, $2) as r", [token, created.code.toLowerCase().replace("-", " ")])
ok(act.ok && act.partner && act.status === "active" && act.needs_code === false, "Activation : bon code (casse et séparateur indifférents) → parrain actif, espace ouvert", act)
ok((await one(null, "select nx_partner_invite_info($1) as r", [token])).valid === false && (await one(2, "select nx_partner_activate($1, $2) as r", [token, created.code])).reason === "invite",
  "Activation : le lien d'invitation ne sert qu'une fois")
const used = (await as(1, "select used_at from nx_partner_access_codes"))[0]
ok(used && used.used_at, "Back office : le code du mois apparaît comme utilisé")

// ---------- Code d'accès mensuel ----------
await db.exec(`update nx_partners set unlocked_month = (nx_month_start() - interval '1 month')::date where user_id = '${id(2)}'`)
const me1 = await one(2, "select nx_partner_me() as r")
const gated = await fails_(2, "select nx_partner_dashboard() as r")
ok(me1.needs_code === true && /code d’accès du mois/.test(gated), "Nouveau mois : le code du mois est redemandé avant d'ouvrir l'espace", [me1.needs_code, gated])
const regen = await one(1, "select nx_admin_partner_code($1, true) as r", [created.partner.id])
ok(regen.code !== created.code, "Back office : nouveau code du mois (l'ancien ne marche plus)", regen)
ok((await one(2, "select nx_partner_unlock($1) as r", [created.code])).ok === false, "Code d'accès : l'ancien code est refusé")
for (let i = 0; i < 4; i++) await one(2, "select nx_partner_unlock('ZZZZ-ZZZZ') as r")
const locked = await one(2, "select nx_partner_unlock($1) as r", [regen.code])
ok(locked.ok === false && locked.reason === "locked" && locked.until, "Code d'accès : 5 codes faux bloquent la saisie 30 minutes (même le bon code)", locked)
await one(1, "select nx_admin_partner_update($1, null, null, null, true) as r", [created.partner.id])
const unlocked = await one(2, "select nx_partner_unlock($1) as r", [regen.code])
ok(unlocked.ok && unlocked.needs_code === false, "Code d'accès : débloqué par le back office, puis bon code accepté", unlocked)

// ---------- Codes promo et liens ----------
const code = await one(2, "select nx_partner_code_create('kofi25', 'Chaîne YouTube') as r")
ok(code.code === "KOFI25" && code.active, "Codes promo : création (mis en majuscules)", code)
ok(/déjà pris/.test(await fails_(2, "select nx_partner_code_create('Kofi25') as r")), "Codes promo : un code n'existe qu'une fois (casse indifférente)")
ok(/réservé/.test(await fails_(2, "select nx_partner_code_create('nexora') as r")) && /3 à 24 caractères/.test(await fails_(2, "select nx_partner_code_create('a b') as r")),
  "Codes promo : codes réservés et formats invalides refusés")
const code2 = await one(2, "select nx_partner_code_create('KOFI-WHATSAPP', 'Groupe WhatsApp') as r")
const res = await one(null, "select nx_referral_resolve('kofi25') as r")
ok(res.valid && res.code === "KOFI25" && res.partner === "Kofi" && res.month_cents === 1750 && res.discount_pct === 30, "Site : code promo reconnu sans compte, prix avec la remise", res)
ok(/réservé aux parrains/.test(await fails_(3, "select nx_partner_codes() as r")), "Espace des parrains : fermé à un compte qui n'est pas parrain")

// ---------- Filleuls ----------
const self = await one(2, "select nx_referral_attach('KOFI25') as r")
ok(self.ok === false && self.reason === "self", "Filleuls : un parrain ne peut pas utiliser son propre code", self)
const proUser = await one(6, "select nx_referral_attach('KOFI25') as r")
ok(proUser.ok === false && proUser.reason === "customer", "Filleuls : un client déjà Pro ne peut pas devenir filleul", proUser)
const att = await one(3, "select nx_referral_attach('kofi25', 'link') as r")
ok(att.ok && att.referred && att.code === "KOFI25" && att.month_cents === 1750 && att.source === "link", "Filleuls : lien du parrain rattaché au compte, prix avec la remise", att)
const att2 = await one(3, "select nx_referral_attach('KOFI-WHATSAPP') as r")
ok(att2.ok && att2.already && att2.code === "KOFI25", "Filleuls : un seul parrain par compte, définitif", att2)
const mine5 = await one(5, "select nx_referral_mine() as r")
ok(mine5.referred === false && mine5.eligible === true && (await one(6, "select nx_referral_mine() as r")).eligible === false && (await one(null, "select nx_referral_mine() as r")).eligible === false,
  "Filleuls : sans code, aucun parrain ; code encore possible sauf pour un client payant ou sans compte", mine5)
await one(5, "select nx_referral_attach('KOFI-WHATSAPP') as r")
await one(8, "select nx_referral_attach('KOFI25') as r")

// ---------- Commissions sur les paiements ----------
const apply = (args) => q(`select nx_billing_apply('secret-du-worker', 'stripe', $1, $2, $3, $4, $5, $6, $7, $8, 'usd', $9, false) as r`, args)
await apply(["evt_co1", id(3), "active", "month", null, "cus_3", "sub_3", 1750, "checkout.session.completed"])
ok((await q("select count(*)::int as n from nx_commissions"))[0].n === 0, "Commissions : aucune sur la fin du paiement (checkout), seulement sur la facture payée")
const paid = (await apply(["evt_in1", null, "active", null, "2026-12-08T00:00:00Z", "cus_3", "sub_3", 1750, "invoice.paid"]))[0].r
const c1 = (await q("select * from nx_commissions"))[0]
ok(paid.commission === true && Number(c1.amount_cents) === 437.5 && c1.paid_cents === 1750 && c1.list_cents === 2500 && Number(c1.rate) === 25 && c1.period === "month",
  "Commissions : 25 % des 17,50 $ payés = 4,375 $ (prix sans remise gardé : 25 $ ; 13,125 $ en caisse)", c1)
ok(Math.abs(Date.parse(c1.available_at) - Date.now() - 30 * 86400000) < 120000, "Commissions : disponibles 30 jours après le paiement", c1.available_at)
await apply(["evt_in1", null, "active", null, null, "cus_3", "sub_3", 1750, "invoice.paid"])
ok((await q("select count(*)::int as n from nx_commissions"))[0].n === 1, "Commissions : un événement reçu deux fois ne compte qu'une fois")
await apply(["evt_in_x", id(4), "active", "month", null, "cus_4", "sub_4", 2500, "invoice.paid"])
ok((await q(`select count(*)::int as n from nx_commissions where user_id = '${id(4)}'`))[0].n === 0, "Commissions : aucune pour un client sans parrain")
await apply(["evt_sub8", id(8), "active", "year", "2027-11-08T00:00:00Z", "cus_8", "sub_8", 0, "customer.subscription.created"])
await apply(["evt_in8", null, "active", null, null, "cus_8", "sub_8", 17500, "invoice.paid"])
const c8 = (await q(`select * from nx_commissions where user_id = '${id(8)}'`))[0]
const b8 = (await q(`select period from nx_billing where user_id = '${id(8)}'`))[0]
ok(c8 && Number(c8.amount_cents) === 4375 && c8.period === "year" && c8.list_cents === 25000 && b8.period === "year", "Commissions : abonnement annuel, 25 % de 175 $ = 43,75 $, période annuelle gardée", [c8, b8])

// ---------- Tableau de bord du parrain ----------
const dash = await one(2, "select nx_partner_dashboard() as r")
ok(Number(dash.balance.earned_cents) === 4812.5 && Number(dash.balance.pending_cents) === 4812.5 && Number(dash.balance.available_cents) === 0,
  "Tableau de bord : 48,125 $ gagnés, en attente (délai de 30 jours), rien de disponible", dash.balance)
ok(dash.recurring.payers === 2 && Math.abs(Number(dash.recurring.commission_cents) - (437.5 + 4375 / 12)) < 0.01 && dash.referrals === 3,
  "Tableau de bord : revenus récurrents mensuels (4,375 $ + 43,75 $ / 12), 2 filleuls payants sur 3", dash.recurring)
ok(dash.series.length === 12 && Number(dash.series[11].amount_cents) === 4812.5 && dash.rules.min_payout_cents === 2000 && dash.rules.commission_pct === 25, "Tableau de bord : gains des 12 derniers mois et règles du programme", dash.series[11])
const refs = await one(2, "select nx_partner_referrals() as r")
ok(refs.length === 3 && refs.every((r) => /•••@/.test(r.who)) && refs.find((r) => r.code === "KOFI25" && r.active && Number(r.earned_cents) === 437.5),
  "Filleuls vus par le parrain : adresses masquées, état et gains par filleul", refs)
const hist = await one(2, "select nx_partner_commissions() as r")
ok(hist.total === 2 && hist.rows[0].state === "pending" && /•••@/.test(hist.rows[0].who), "Historique des gains : une ligne par paiement, en attente", hist)
const codes = await one(2, "select nx_partner_codes() as r")
ok(codes.length === 2 && codes.find((c) => c.code === "KOFI25").referrals === 2 && codes.find((c) => c.code === "KOFI-WHATSAPP").referrals === 1, "Codes promo : filleuls et gains par code", codes)

// ---------- Retraits ----------
ok(/minimum est de 20 \$/.test(await fails_(2, "select nx_partner_payout_request(1000, 'paypal', 'kofi@paypal.me') as r")), "Retraits : minimum de 20 $")
ok(/supérieur à tes gains disponibles \(0 \$\)/.test(await fails_(2, "select nx_partner_payout_request(2000, 'paypal', 'kofi@paypal.me') as r")), "Retraits : pas plus que le disponible")
await one(1, "select nx_admin_referral_payment($1, 250000, 'year', 'Virement Mobile Money reçu') as r", [id(5)])
await db.exec("update nx_commissions set available_at = now() - interval '1 day'")
ok(/moyen de versement/.test(await fails_(2, "select nx_partner_payout_request(5000, 'cheque', 'x') as r")), "Retraits : moyen de versement proposé seulement")
const po = await one(2, "select nx_partner_payout_request(5000, 'mobile_money', '+225 07 00 00 00 00') as r")
ok(po.status === "requested" && Number(po.amount_cents) === 5000, "Retraits : demande de 50 $ acceptée (gains disponibles : 673,125 $)", po)
ok(/déjà en cours/.test(await fails_(2, "select nx_partner_payout_request(2000, 'mobile_money', '+225 07') as r")), "Retraits : une seule demande ouverte à la fois")
const bal1 = (await one(2, "select nx_partner_dashboard() as r")).balance
ok(Number(bal1.reserved_cents) === 5000 && Number(bal1.available_cents) === 67312.5 - 5000, "Retraits : le montant demandé est réservé", bal1)
ok(/référence du versement/.test(await fails_(1, "select nx_admin_payout_update($1, 'paid') as r", [po.id])), "Back office : référence obligatoire pour marquer un retrait versé")
const done = await one(1, "select nx_admin_payout_update($1, 'paid', 'MM-2026-1108-42') as r", [po.id])
ok(done.status === "paid" && done.reference === "MM-2026-1108-42", "Back office : retrait versé", done)
ok(/déjà traité/.test(await fails_(1, "select nx_admin_payout_update($1, 'rejected') as r", [po.id])), "Back office : un retrait versé ne change plus")
const bal2 = (await one(2, "select nx_partner_dashboard() as r")).balance
ok(Number(bal2.paid_cents) === 5000 && Number(bal2.available_cents) === 62312.5, "Retraits : versé déduit du disponible", bal2)
const cman = (await q(`select id from nx_commissions where user_id = '${id(5)}'`))[0]
await one(1, "select nx_admin_commission_cancel($1, 'Remboursé') as r", [cman.id])
const bal3 = (await one(2, "select nx_partner_dashboard() as r")).balance
ok(Number(bal3.earned_cents) === 4812.5 && Number(bal3.available_cents) === 0, "Back office : commission annulée (remboursement) retirée des soldes", bal3)

// ---------- Un autre parrain ne voit rien ----------
const p2 = await one(1, "select nx_admin_partner_create('ama.partenaire@exemple.ci', 'Ama Kouassi') as r")
await one(7, "select nx_partner_activate($1, $2) as r", [p2.invite_token, p2.code])
const d2 = await one(7, "select nx_partner_dashboard() as r")
ok(d2.referrals === 0 && Number(d2.balance.earned_cents) === 0 && (await one(7, "select nx_partner_referrals() as r")).length === 0, "Isolation : un autre parrain ne voit ni les filleuls ni les gains de Kofi")

// ---------- Suspension, réglages, bilan ----------
await one(1, "select nx_admin_partner_update($1, 'suspended') as r", [created.partner.id])
ok((await one(null, "select nx_referral_resolve('KOFI25') as r")).valid === false && /suspendu/.test(await fails_(2, "select nx_partner_dashboard() as r")),
  "Suspension : codes du parrain inactifs, espace fermé")
await apply(["evt_in2", null, "active", null, null, "cus_3", "sub_3", 1750, "invoice.paid"])
ok((await q(`select count(*)::int as n from nx_commissions where source_ref = 'stripe:evt_in2'`))[0].n === 0, "Suspension : aucune commission pendant la suspension")
await one(1, "select nx_admin_partner_update($1, 'active') as r", [created.partner.id])
ok(/de 0 à 90/.test(await fails_(1, "select nx_admin_referral_settings('{\"discount_pct\": 95}') as r")) && /moyen de versement/i.test(await fails_(1, "select nx_admin_referral_settings('{\"methods\": [\"cheque\"]}') as r")),
  "Réglages : valeurs hors limites refusées")
await one(1, "select nx_admin_referral_settings('{\"discount_pct\": 20, \"min_payout_cents\": 20000, \"intrus\": 1}') as r")
const res20 = await one(null, "select nx_referral_resolve('KOFI25') as r")
const cfg20 = (await q("select value from app_config where key = 'referral'"))[0].value
ok(res20.month_cents === 2000 && cfg20.min_payout_cents === 20000 && !("intrus" in cfg20), "Réglages : remise de 20 % appliquée aux prix, clés inconnues ignorées", [res20.month_cents, cfg20])
await one(1, "select nx_admin_referral_settings('{\"discount_pct\": 30, \"min_payout_cents\": 2000}') as r")
ok(/administrateurs/.test(await fails_(2, "select nx_admin_referral_overview() as r")), "Bilan : réservé aux administrateurs")
const ov = await one(1, "select nx_admin_referral_overview() as r")
ok(Number(ov.gross_cents) === 19250 && Number(ov.commission_cents) === 4812.5 && Number(ov.net_cents) === 19250 - 4812.5 && Number(ov.discount_cents) === 27500 - 19250 && Number(ov.paid_out_cents) === 5000 && ov.partners.active === 2 && ov.rules.commission_pct === 25,
  "Bilan : encaissé auprès des filleuls, remises, commissions, part de NEXORA, versé", ov)
const plist = await one(1, "select nx_admin_partners() as r")
ok(plist.length === 2 && plist.every((p) => /^[2-9A-Z]{4}-[2-9A-Z]{4}$/.test(p.month_code)), "Back office : parrains avec le code du mois de chacun", plist.map((p) => p.month_code))
const aref = await one(1, "select nx_admin_referrals() as r")
ok(aref.length === 3 && aref.some((r) => r.email === "client.awa@gmail.com" && r.partner === "Kofi Mensah"), "Back office : filleuls avec adresse complète et parrain", aref.length)
ok(/déjà un parrain/.test(await fails_(1, "select nx_admin_referral_assign('client.awa@gmail.com', 'KOFI25') as r")), "Back office : rattachement manuel refusé si le compte a déjà un parrain")

// ---------- Relance avant renouvellement : prix réel ----------
await db.exec(`update nx_billing set current_period_end = now() + interval '6 days 12 hours', reminded_for = null, cancel_at_period_end = false, status = 'active', period = 'month' where user_id in ('${id(3)}', '${id(4)}')`)
await q("select nx_billing_remind()")
const mails = await q("select to_addr, body from mails order by to_addr")
const mAwa = mails.find((m) => m.to_addr === "client.awa@gmail.com")
const mIntrus = mails.find((m) => m.to_addr === "intrus@exemple.ci")
ok(mAwa && /17,50 \$ pour un mois, remise du parrainage comprise/.test(mAwa.body) && mIntrus && /\(25 \$ pour un mois\)/.test(mIntrus.body), "Relance : 17,50 $ pour un filleul, 25 $ sans parrain", mails.map((m) => m.body.slice(60, 200)))

// ---------- Worker : paiement avec la remise du parrainage ----------
{
  const src = fs.readFileSync(path.join(ROOT, "worker/licences.js"), "utf8")
    .replace(/^import setup from .*$/m, `const setup = ${fs.readFileSync(path.join(ROOT, "supabase/nexora.json"), "utf8")}`)
  const W = await import(`data:text/javascript,${encodeURIComponent(src)}`)
  const env = { STRIPE_SECRET_KEY: "sk_test", STRIPE_PRICE_MONTH: "price_m", STRIPE_PRICE_YEAR: "price_y", NX_PROBE_SECRET: "secret-du-worker" }
  const calls = []
  let coupon = false
  let mine = { referred: true, code: "KOFI25", discount_pct: 30 }
  let attach = { ok: true }
  const realFetch = globalThis.fetch
  globalThis.fetch = async (u, o = {}) => {
    u = String(u)
    calls.push({ u, o })
    const j = (b, s = 200) => new Response(JSON.stringify(b), { status: s })
    if (u.endsWith("/auth/v1/user")) return j({ id: id(3), email: "client.awa@gmail.com" })
    if (u.endsWith("/rpc/nx_referral_attach")) return j(attach)
    if (u.endsWith("/rpc/nx_referral_mine")) return j(mine)
    if (u.includes("/rest/v1/nx_billing")) return j([])
    if (u === "https://api.stripe.com/v1/coupons/nexora-parrainage-30") return coupon ? j({ id: "nexora-parrainage-30" }) : j({ error: { message: "No such coupon: 'nexora-parrainage-30'" } }, 404)
    if (u === "https://api.stripe.com/v1/coupons") { coupon = true; return j({ id: "nexora-parrainage-30" }) }
    if (u === "https://api.stripe.com/v1/checkout/sessions") return j({ url: "https://checkout.stripe.test/s" })
    return j({}, 404)
  }
  try {
    const pay = (body) => W.handleLicences(new Request("https://x/pay/checkout", { method: "POST", headers: { authorization: "Bearer jeton", "content-type": "application/json" }, body: JSON.stringify(body) }), env)
    const r1 = await pay({ period: "month", ref: "kofi25", ref_source: "link" })
    const sentAttach = JSON.parse(calls.find((c) => c.u.endsWith("/rpc/nx_referral_attach")).o.body)
    const created = calls.find((c) => c.u === "https://api.stripe.com/v1/coupons")
    const session = new URLSearchParams(calls.filter((c) => c.u.endsWith("/checkout/sessions")).at(-1).o.body)
    ok(r1.status === 200 && sentAttach.p_code === "kofi25" && sentAttach.p_source === "link", "Worker : code du lien rattaché au compte avant le paiement", sentAttach)
    ok(created && new URLSearchParams(created.o.body).get("percent_off") === "30" && new URLSearchParams(created.o.body).get("duration") === "forever",
      "Worker : coupon Stripe de 30 % créé une fois, sur toute la durée de l'abonnement")
    ok(session.get("discounts[0][coupon]") === "nexora-parrainage-30" && !session.has("allow_promotion_codes") && session.get("subscription_data[metadata][nexora_referral]") === "KOFI25" && session.get("line_items[0][price]") === "price_m",
      "Worker : paiement mensuel avec la remise du parrainage (sans codes promo Stripe)", Object.fromEntries(session))
    calls.length = 0
    await pay({ period: "year" })
    ok(!calls.some((c) => c.u === "https://api.stripe.com/v1/coupons") && new URLSearchParams(calls.at(-1).o.body).get("discounts[0][coupon]") === "nexora-parrainage-30",
      "Worker : filleul déjà rattaché : remise sans recréer le coupon")
    mine = { referred: false, discount_pct: 30 }
    calls.length = 0
    await pay({ period: "month" })
    const plain = new URLSearchParams(calls.at(-1).o.body)
    ok(plain.get("allow_promotion_codes") === "true" && !plain.has("discounts[0][coupon]"), "Worker : sans parrain, prix normal (codes promo Stripe permis)")
    attach = { ok: false, reason: "self" }
    const r4 = await pay({ period: "month", ref: "KOFI25" })
    const b4 = await r4.json()
    ok(r4.status === 400 && /propre code/.test(b4.message), "Worker : code refusé expliqué (son propre code)", b4)
    const ev = await W.eventToBilling(env, { type: "invoice.paid", data: { object: { customer: "cus_8", subscription: "sub_8", amount_paid: 17500, currency: "usd",
      lines: { data: [{ period: { start: 1762560000, end: 1794096000 } }] } } } })
    ok(ev.period === "year" && ev.amount === 17500, "Worker : facture annuelle reconnue (durée de la période) pour la commission", ev)
  } finally { globalThis.fetch = realFetch }
}

console.log(`\n${count} vérifications, ${fails ? `${fails} échec(s)` : "aucun échec"}.`)
process.exit(fails ? 1 : 0)
