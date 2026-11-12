// NEXORA #090 : essais de NEXORA REFERRAL (migration 20261108000007_parrainage.sql), rejouée deux fois sur PGlite après
// toute la chaîne des offres et des licences (même base d'essai que pnpm test:offres et pnpm test:licences), puis le
// paiement du Worker (remise du parrainage) avec un faux SasPay (#107). PGlite est installé HORS du dépôt :
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

// ---------- #107 : paiement unique par SasPay ----------
const MS = mig("20261111000001_paiement_saspay.sql")
await db.exec(MS)
await db.exec(MS)
ok(true, "Migration 20261111000001 (SasPay) rejouée deux fois sans erreur")
{
  const R = (n) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n.repeat(12)}`
  let refusedPay = false
  try { await q("select nx_pay_session_open('faux', 'cs_0', $1, $2, 'month', 1750) as r", [R("0"), id(5)]) } catch { refusedPay = true }
  ok(refusedPay, "SasPay : aucune session sans le secret du Worker")
  await q("select nx_pay_session_open('secret-du-worker', 'cs_1', $1, $2, 'month', 1750, 'usd', 'KOFI-WHATSAPP', 'https://pay.saspay.me/checkout/x') as r", [R("1"), id(5)])
  const found = (await q("select nx_pay_session_find('secret-du-worker', $1) as r", [R("1")]))[0].r
  ok(found.id === "cs_1" && found.status === "pending" && found.user_id === id(5) && found.amount_cents === 1750, "SasPay : session gardée et retrouvée par la référence de retour", found)
  const pend = (await q("select nx_pay_sessions_pending('secret-du-worker', 'tx_1') as r"))[0].r
  ok(pend.known === false && pend.sessions.some((x) => x.id === "cs_1"), "SasPay : session en attente proposée au webhook", pend)
  const ap = (await q("select nx_pay_apply('secret-du-worker', 'cs_1', 'tx_1', '17.50', '17.94', 'USD') as r"))[0].r
  const days = (Date.parse(ap.period_end) - Date.now()) / 86400000
  ok(ap.ok && ap.active && ap.commission === true && days > 27.9 && days < 31.1, "SasPay : paiement vérifié : Pro ouvert pour un mois, commission du parrain", ap)
  const cs = (await q("select * from nx_commissions where source_ref = 'saspay:tx_1'"))[0]
  ok(cs && cs.source === "saspay" && Number(cs.amount_cents) === 437.5 && cs.paid_cents === 1750 && cs.period === "month", "SasPay : commission de 25 % des 17,50 $ payés (4,375 $)", cs)
  const bill = (await q(`select provider, status, period, cancel_at_period_end from nx_billing where user_id = '${id(5)}'`))[0]
  ok(bill.provider === "saspay" && bill.status === "active" && bill.period === "month" && bill.cancel_at_period_end === true, "SasPay : paiement unique, sans renouvellement automatique (relance « prolonge »)", bill)
  const sess = (await q("select status, transaction_id, net_amount, charged from nx_pay_sessions where id = 'cs_1'"))[0]
  ok(sess.status === "paid" && sess.transaction_id === "tx_1" && sess.net_amount === "17.50" && sess.charged === "17.94", "SasPay : montant net et montant débité gardés pour la comptabilité", sess)
  const dup = (await q("select nx_pay_apply('secret-du-worker', 'cs_1', 'tx_1') as r"))[0].r
  ok(dup.ok && dup.duplicate && (await q("select count(*)::int as n from nx_commissions where source_ref like 'saspay:%'"))[0].n === 1, "SasPay : un paiement reçu deux fois (retour et webhook) ne compte qu'une fois", dup)
  ok((await q("select nx_pay_sessions_pending('secret-du-worker', 'tx_1') as r"))[0].r.known === true, "SasPay : transaction déjà appliquée reconnue par le webhook")
  await q("select nx_pay_session_open('secret-du-worker', 'cs_2', $1, $2, 'year', 17500) as r", [R("2"), id(5)])
  const ap2 = (await q("select nx_pay_apply('secret-du-worker', 'cs_2', 'tx_2') as r"))[0].r
  const expect = new Date(ap.period_end)
  expect.setUTCFullYear(expect.getUTCFullYear() + 1)
  ok(ap2.ok && Math.abs(Date.parse(ap2.period_end) - expect.getTime()) < 2 * 86400000 && ap2.period === "year", "SasPay : prolongation d'un an ajoutée à la fin de la période déjà payée", [ap.period_end, ap2.period_end])
  await q("select nx_pay_session_open('secret-du-worker', 'cs_3', $1, $2, 'month', 1750) as r", [R("3"), id(5)])
  const reused = (await q("select nx_pay_apply('secret-du-worker', 'cs_3', 'tx_1') as r"))[0].r
  ok(reused.ok === false && reused.reason === "transaction_used", "SasPay : une transaction ne paie qu'une session", reused)
  ok((await q("select nx_pay_session_fail('secret-du-worker', 'cs_3', 'tx_3') as r"))[0].r === true && (await q("select nx_pay_session_find('secret-du-worker', $1) as r", [R("3")]))[0].r.status === "failed",
    "SasPay : paiement échoué : session close, rien d'activé")
  let direct = false
  try { await db.exec(`set role authenticated; insert into nx_pay_sessions (id, ref, user_id, amount_cents) values ('x', '${R("4")}', '${id(5)}', 1)`) } catch { direct = true } finally { await db.exec("reset role") }
  ok(direct, "SasPay : aucune écriture directe dans les sessions de paiement")
}

// ---------- Worker : paiement SasPay (#107), remise du parrainage ----------
{
  const src = fs.readFileSync(path.join(ROOT, "worker/licences.js"), "utf8")
    .replace(/^import setup from .*$/m, `const setup = ${fs.readFileSync(path.join(ROOT, "supabase/nexora.json"), "utf8")}`)
  const W = await import(`data:text/javascript,${encodeURIComponent(src)}`)
  const crypto = await import("node:crypto")
  const env = { SASPAY_API_KEY: "sk_test_essai", NX_PROBE_SECRET: "secret-du-worker", SASPAY_WEBHOOK_SECRET: "whsec_essai" }
  const API = "https://api.saspay.me/api/v1"
  const calls = []
  const PRICES = { discount_pct: 30, month_cents: 1750, year_cents: 17500, list_month_cents: 2500, list_year_cents: 25000 }
  let mine = { referred: true, code: "KOFI25", ...PRICES }
  let attach = { ok: true }
  let fail = null
  let txOf9 = null
  let verify = { id: "tx_9", status: "SUCCESS", net_amount: "17.50", debited_amount: "17.94", currency: "USD" }
  let sess = { id: "cs_9", user_id: id(3), period: "month", status: "pending" }
  let pending = { known: false, sessions: [{ id: "cs_8" }, { id: "cs_9" }] }
  const realFetch = globalThis.fetch
  globalThis.fetch = async (u, o = {}) => {
    u = String(u)
    calls.push({ u, o })
    const j = (b, st = 200) => new Response(JSON.stringify(b), { status: st })
    const env200 = (data, st = 200) => j({ success: true, data, code: st }, st)
    if (u.endsWith("/auth/v1/user")) return j({ id: id(3), email: "client.awa@gmail.com", user_metadata: { full_name: "Awa Kouassi" } })
    if (u.endsWith("/rpc/nx_referral_attach")) return j(attach)
    if (u.endsWith("/rpc/nx_referral_mine")) return j(mine)
    if (u.endsWith("/rpc/nx_pay_session_open")) return j({ ok: true })
    if (u.endsWith("/rpc/nx_pay_session_find")) return j(sess)
    if (u.endsWith("/rpc/nx_pay_sessions_pending")) return j(pending)
    if (u.endsWith("/rpc/nx_pay_apply")) return j({ ok: true, period: "month", period_end: "2026-12-11T00:00:00Z" })
    if (u.endsWith("/rpc/nx_pay_session_fail")) return j(true)
    if (u.startsWith(API) && fail) return j({ success: false, error: { message: "Clé API invalide sk_test_essai", code: fail.code }, code: fail.status }, fail.status)
    if (u === `${API}/checkout-sessions/` && o.method === "POST") return env200({ id: "cs_9", checkout_url: "https://pay.saspay.me/checkout/abc", status: "PENDING" }, 201)
    if (u === `${API}/checkout-sessions/cs_9/status/`) return env200({ id: "cs_9", status: txOf9 ? "PAID" : "PENDING", transaction_id: txOf9 })
    if (u === `${API}/checkout-sessions/cs_8/status/`) return env200({ id: "cs_8", status: "PAID", transaction_id: "tx_autre" })
    if (u === `${API}/payments/tx_9/verify/`) return env200(verify)
    return j({}, 404)
  }
  const post = (route, body, headers = {}) => W.handleLicences(new Request(`https://x${route}`, { method: "POST", headers: { authorization: "Bearer jeton", "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }), env)
  const last = (end) => calls.filter((c) => c.u.endsWith(end)).at(-1)
  try {
    ok(W.decimal(1750) === "17.50" && W.decimal(25000) === "250.00" && W.decimal(5) === "0.05", "Worker : montants en chaînes décimales (17.50), jamais de flottants")
    const r1 = await post("/pay/checkout", { period: "month", ref: "kofi25", ref_source: "link" })
    const b1 = await r1.json()
    const sentAttach = JSON.parse(last("/rpc/nx_referral_attach").o.body)
    const created = last("/checkout-sessions/")
    const body1 = JSON.parse(created.o.body)
    const ref1 = (/[?&]ref=([0-9a-f-]{36})$/.exec(body1.return_url) || [])[1]
    ok(r1.status === 200 && b1.url === "https://pay.saspay.me/checkout/abc" && sentAttach.p_code === "kofi25" && sentAttach.p_source === "link", "Worker : code du lien rattaché, adresse de la page de paiement renvoyée", b1)
    ok(body1.amount === "17.50" && body1.currency === "USD" && body1.customer_email === "client.awa@gmail.com" && body1.customer_name === "Awa Kouassi" && ref1 && /\/licence\?paiement=retour&ref=/.test(body1.return_url),
      "Worker : session de checkout SasPay au prix remisé du filleul (17,50 $), retour sur Ma licence", body1)
    ok(created.o.headers.authorization === "Bearer sk_test_essai" && !JSON.stringify(b1).includes("sk_test"), "Worker : clé SasPay envoyée seulement à SasPay, jamais au navigateur")
    const opened = JSON.parse(last("/rpc/nx_pay_session_open").o.body)
    ok(opened.p_id === "cs_9" && opened.p_ref === ref1 && opened.p_amount === 1750 && opened.p_period === "month" && opened.p_referral === "KOFI25" && opened.p_secret === "secret-du-worker",
      "Worker : session gardée dans la base (compte, période, montant, parrain)", opened)
    mine = { referred: false, ...PRICES }
    await post("/pay/checkout", { period: "year" })
    ok(JSON.parse(last("/checkout-sessions/").o.body).amount === "250.00", "Worker : sans parrain, prix normal (250 $ pour un an)")
    attach = { ok: false, reason: "self" }
    const r4 = await post("/pay/checkout", { period: "month", ref: "KOFI25" })
    const b4 = await r4.json()
    ok(r4.status === 400 && /propre code/.test(b4.message), "Worker : code refusé expliqué (son propre code)", b4)
    attach = { ok: true }
    fail = { status: 429, code: "rate_limited" }
    const r5 = await post("/pay/checkout", { period: "month" })
    ok(r5.status === 503 && r5.headers.get("retry-after") === "60", "Worker : 429 de SasPay : appels espacés (réessayer dans une minute)")
    fail = { status: 401, code: "authentication_failed" }
    const r6 = await post("/pay/checkout", { period: "month" })
    const b6 = await r6.json()
    ok(r6.status === 503 && b6.error === "not_configured" && !JSON.stringify(b6).includes("sk_test"), "Worker : 401 de SasPay : paiement indisponible, sans détail de la clé", b6)
    fail = { status: 422, code: "currency_country_mismatch" }
    ok((await post("/pay/checkout", { period: "month" })).status === 422, "Worker : 422 de SasPay : demande refusée expliquée")
    fail = null
    ok((await W.handleLicences(new Request("https://x/pay/checkout", { method: "POST", body: "{}" }), {})).status === 503, "Worker : sans clé SasPay, paiement fermé (503)")
    // Retour du client : statut réel, vérifié.
    calls.length = 0
    const c1 = await (await post("/pay/confirm", { ref: ref1 })).json()
    ok(c1.status === "pending" && !calls.some((c) => c.u.endsWith("/rpc/nx_pay_apply")), "Retour : sans transaction, paiement en attente, rien d'activé", c1)
    txOf9 = "tx_9"
    verify = { ...verify, status: "PENDING" }
    const c2 = await (await post("/pay/confirm", { ref: ref1 })).json()
    ok(c2.status === "pending" && !calls.some((c) => c.u.endsWith("/rpc/nx_pay_apply")), "Retour : paiement PENDING : rien d'activé (seul SUCCESS ouvre Pro)", c2)
    verify = { ...verify, status: "SUCCESS" }
    const c3 = await (await post("/pay/confirm", { ref: ref1 })).json()
    const applied = JSON.parse(last("/rpc/nx_pay_apply").o.body)
    ok(c3.status === "paid" && applied.p_id === "cs_9" && applied.p_transaction === "tx_9" && applied.p_net === "17.50" && applied.p_charged === "17.94" && calls.some((c) => c.u === `${API}/payments/tx_9/verify/`),
      "Retour : paiement vérifié (GET /payments/{id}/verify/ = SUCCESS) puis appliqué", applied)
    verify = { ...verify, status: "FAILED" }
    const c4 = await (await post("/pay/confirm", { ref: ref1 })).json()
    ok(c4.status === "failed" && JSON.parse(last("/rpc/nx_pay_session_fail").o.body).p_id === "cs_9", "Retour : paiement FAILED : session close, rien d'activé", c4)
    sess = { ...sess, user_id: id(4) }
    ok((await post("/pay/confirm", { ref: ref1 })).status === 404, "Retour : le paiement d'un autre compte reste introuvable")
    sess = { ...sess, user_id: id(3) }
    ok((await post("/pay/confirm", { ref: "pas-une-reference" })).status === 400, "Retour : référence mal formée refusée")
    // Webhook signé.
    verify = { ...verify, status: "SUCCESS" }
    const raw = JSON.stringify({ event: "transaction.success", data: { id: "tx_9", status: "SUCCESS", amount: "17.50", charged: "17.94", net_amount: "17.50", currency: "USD" } })
    const t = Math.floor(Date.now() / 1000)
    const sign = (ts, body = raw) => crypto.createHmac("sha256", "whsec_essai").update(`${ts}.${body}`).digest("hex")
    const hook = (ts, sig, body = raw) => post("/pay/webhook", body, { "x-webhook-signature": sig, "x-webhook-timestamp": String(ts), "x-webhook-event": "transaction.success" })
    ok((await hook(t, "0".repeat(64))).status === 400, "Webhook : signature fausse refusée")
    ok((await hook(t - 600, sign(t - 600))).status === 400, "Webhook : horodatage de plus de 300 secondes refusé (rejeu)")
    ok((await hook(t, sign(t), raw.replace("17.94", "1.00"))).status === 400, "Webhook : corps modifié refusé (signature sur le corps brut)")
    calls.length = 0
    const w1 = await hook(t, sign(t))
    const bw1 = await w1.json()
    ok(w1.status === 200 && bw1.status === "paid" && calls.some((c) => c.u === `${API}/checkout-sessions/cs_8/status/`) && JSON.parse(last("/rpc/nx_pay_apply").o.body).p_transaction === "tx_9",
      "Webhook : transaction rattachée à sa session (statut de la session), vérifiée puis appliquée", bw1)
    pending = { known: true, sessions: [] }
    calls.length = 0
    const w2 = await (await hook(t, sign(t))).json()
    ok(w2.duplicate && !calls.some((c) => c.u.startsWith(API)), "Webhook : événement reçu deux fois traité une seule fois", w2)
    const test = JSON.stringify({ event: "webhook.test", data: {} })
    ok((await (await hook(t, sign(t, test), test)).json()).test === true, "Webhook : événement de test du tableau de bord accepté")
    ok(await W.saspaySignatureOk("whsec_essai", sign(t).toUpperCase(), String(t), raw) && !(await W.saspaySignatureOk("", sign(t), String(t), raw)), "Webhook : signature hexadécimale vérifiée, secret obligatoire")
  } finally { globalThis.fetch = realFetch }
}

// ---------- #115 : vouvoiement des textes écrits par la base ----------
{
  // Types de la base d'origine absents de la base d'essai (factures, supervision) : tables minimales.
  await db.exec(`create table if not exists public.invoices (id uuid primary key, status text);
create table if not exists public.monitors (id uuid primary key);
create table if not exists public.nx_private_config (key text primary key, value jsonb);
insert into public.nx_private_config values ('invoice_issuer', '{"name":"NEXORA","footer":"Merci de ta confiance."}') on conflict (key) do nothing;`)
  const tutoie = "(?:\\m(?:tu|te|toi|ton|ta|tes)\\M|\\mt[’'])"
  const before = (await q(`select count(*)::int as n from plans where description ~* $1 or features::text ~* $1`, [tutoie]))[0].n
  const MV = mig("20261112000001_vouvoiement.sql")
  // Tables de la base d'origine (supervision, pages de statut…) absentes de la base d'essai : créées vides à la demande.
  const stubs = []
  for (let k = 0; k < 30; k++) {
    try { await db.exec(MV); break } catch (e) {
      const m = /(?:type|relation) "(public\.\w+)" does not exist/.exec(e.message)
      if (!m) throw e
      stubs.push(m[1])
      await db.exec(`create table if not exists ${m[1]} (id uuid primary key)`)
    }
  }
  await db.exec(MV)
  ok(true, "Migration 20261112000001 (vouvoiement) rejouée deux fois sans erreur", stubs.length ? `tables minimales : ${stubs.join(", ")}` : undefined)
  const names = [...MV.matchAll(/create or replace function public\.(\w+)\s*\(/gi)].map((m) => m[1])
  const srcs = await q("select proname, prosrc from pg_proc where proname = any($1)", [names])
  const left = srcs.filter((r) => [...r.prosrc.matchAll(/'((?:[^']|'')*)'/g)].some((m) => new RegExp(tutoie, "i").test(m[1])))
  ok(names.length === 31 && srcs.length >= 31 && !left.length, "Vouvoiement : 31 fonctions redéfinies, plus aucun tutoiement dans leurs textes", left.map((r) => r.proname))
  const uf = srcs.find((r) => r.proname === "nx_use_feature").prosrc
  ok(/Connectez-vous à votre compte NEXORA \(gratuit\)/.test(uf) && /Votre offre actuelle/.test(uf) && !/Connecte-toi/.test(uf), "Vouvoiement : messages des offres (« Connectez-vous à votre compte NEXORA », « Votre offre actuelle »)")
  const after = (await q(`select count(*)::int as n from plans where description ~* $1 or features::text ~* $1`, [tutoie]))[0].n
  ok(before > 0 && after === 0, "Vouvoiement : descriptions et avantages des offres convertis (textes d'origine seulement)", { before, after })
  const foot = (await q("select value->>'footer' as f from nx_private_config where key = 'invoice_issuer'"))[0].f
  ok(foot === "Merci de votre confiance.", "Vouvoiement : pied des factures d'origine remplacé", foot)
  await db.exec("update nx_private_config set value = jsonb_set(value, '{footer}', '\"Merci !\"') where key = 'invoice_issuer'")
  await db.exec(MV)
  ok((await q("select value->>'footer' as f from nx_private_config where key = 'invoice_issuer'"))[0].f === "Merci !", "Vouvoiement : pied de facture personnalisé gardé")
  const pro = (await q("select price_month_cents from plans where id = 'pro'"))[0]
  ok(pro.price_month_cents === 2500, "Vouvoiement : prix des offres inchangés", pro)
}

console.log(`\n${count} vérifications, ${fails ? `${fails} échec(s)` : "aucun échec"}.`)
process.exit(fails ? 1 : 0)
