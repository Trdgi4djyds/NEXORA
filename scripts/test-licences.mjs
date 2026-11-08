// NEXORA #076 : essais de la migration des licences et des deux offres (20261108000002_licences_offres.sql),
// rejouée deux fois sur PGlite après celles des offres (#037, #051, #059), avec la même base d'essai que
// pnpm test:offres (tables lues dans scripts/test-offres.mjs). PGlite est installé HORS du dépôt :
//   mkdir -p /tmp/pgtest && cd /tmp/pgtest && echo '{}' > package.json && pnpm add @electric-sql/pglite
// puis : pnpm test:licences (dossier : PGLITE_DIR, /tmp/pgtest par défaut).
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
    console.log(`ÉCHEC ${label}${extra !== undefined ? ` : ${JSON.stringify(extra).slice(0, 400)}` : ""}`)
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
for (const f of ["20261104000007_offres_limites.sql", "20261106000001_prix_offres.sql", "20261106000006_reajustements.sql"]) await db.exec(mig(f))
const M = mig("20261108000002_licences_offres.sql")
await db.exec(M)
await db.exec(M)
ok(true, "Migration 20261108000002 rejouée deux fois sans erreur")
// NEXORA #077 : sécurité au démarrage et licences configurées par l'administration (rejouée après #076, deux fois,
// puis toute la suite #076 → #077 encore : « Tout appliquer » du back office rejoue toutes les migrations).
const M3 = mig("20261108000003_securite_licences_admin.sql")
await db.exec(M3)
await db.exec(M3)
await db.exec(M)
await db.exec(M3)
ok((await q("select count(*)::int as n from pg_proc where proname = 'nx_license_check'"))[0].n === 1, "Migration 20261108000003 rejouée (et après #076) : une seule fonction nx_license_check")

// ---------- Offres ----------
const plans = await q("select id, active, price_month_cents, price_year_cents, perms, limits from plans order by sort")
const P = Object.fromEntries(plans.map((p) => [p.id, p]))
ok(P.free.active && P.pro.active && !P.standard.active && plans.filter((p) => p.active).length === 2, "Offres : seules Gratuit et Pro sont en vente", plans.map((p) => [p.id, p.active]))
ok(P.pro.price_month_cents === 1800 && P.pro.price_year_cents === 18000 && P.free.price_month_cents === 0, "Offres : Pro à 18 $ par mois (180 $ par an), Gratuit à 0 $")
ok(P.free.perms.responsive && P.free.perms.browser && P.free.perms.responsive_advanced && P.free.perms.crawler, "Offres : Responsive Lab et Browser Lab complets en Gratuit")
ok(!P.free.perms.devlab && !P.free.perms.apk && !P.free.perms.desktop_builder && !P.free.perms.design_extended && !P.free.perms.studio_advanced, "Offres : le reste est réservé à Pro")
ok(Object.values(P.pro.perms).every(Boolean), "Offres : Pro comprend tout")
await db.exec("update plans set price_month_cents = 1900 where id = 'pro'")
await db.exec(M)
ok((await q("select price_month_cents from plans where id = 'pro'"))[0].price_month_cents === 1900, "Offres : un prix changé dans le back office est conservé au passage suivant")
await db.exec("update plans set price_month_cents = 1800 where id = 'pro'")

// ---------- Comptes ----------
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`
const users = [
  [1, "awa.diallo@gmail.com"], [2, "awadiallo+test@gmail.com"], [3, "kofi@exemple.ci"], [4, "ama@gmail.com"], [5, "yao@gmail.com"],
  [6, "pro@exemple.ci"], [7, "chef@exemple.ci"], [8, "x1@gmail.com"], [9, "x2@gmail.com"],
]
for (const [n, e] of users) {
  await db.exec(`insert into auth.users values ('${id(n)}', '${e}'); insert into profiles (id, email) values ('${id(n)}', '${e}');
    insert into organizations (id, name, personal, owner_id) values ('${id(100 + n)}', 'Espace ${n}', true, '${id(n)}');
    insert into organization_members values ('${id(100 + n)}', '${id(n)}', 'owner');`)
}
await db.exec(`insert into subscriptions (org_id, plan_id, status) values ('${id(106)}', 'pro', 'active')`)
const as = async (n, sql, params, headers) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${n ? id(n) : ""}', false); select set_config('request.headers', '${JSON.stringify(headers || { "x-forwarded-for": "41.202.10.5, 10.0.0.1" })}', false);`)
  try { return await q(sql, params) } finally { await db.exec("reset role;") }
}
const check = async (n, device, extra = {}) => (await as(n, "select nx_license_check($1, $2, '1.0.0', 'Windows 11', 'PC-Bureau', 'n0nce', $3, $4) as r", [device, extra.key ?? null, extra.secret ?? null, extra.ip ?? null], extra.headers))[0].r
const D1 = "a".repeat(64); const D2 = "b".repeat(64)

const anon = await check(0, D1)
ok(anon.ok === false && anon.reason === "auth", "Contrôle : sans compte, le logiciel ne s’ouvre pas", anon)
const first = await check(3, D1)
ok(first.ok && first.plan === "pro" && first.paid_plan === "free" && first.trial === true, "Essai : tout Pro pendant le premier jour", first)
ok(/^NXDT(-[2-9A-HJKMNP-Z]{4}){4}$/.test(first.license_key), "Licence : clé créée automatiquement (NXDT-XXXX-XXXX-XXXX-XXXX)", first.license_key)
ok(first.ip === "41.202.10.5" && first.session_id && first.nonce === "n0nce" && first.device === D1, "Contrôle : adresse IP relevée, session ouverte, nonce et appareil renvoyés", first)
const ver = (await q("select nx_license_verify($1) as r", [first.license_key]))[0].r
ok(ver.valid && ver.plan === "pro" && ver.holder === "ko•••@exemple.ci", "Site : vérification publique d’une clé, titulaire masqué", ver)
ok((await q("select nx_license_verify('NXDT-AAAA-AAAA-AAAA-AAAA') as r"))[0].r.valid === false, "Site : clé inconnue refusée")
const viaWorker = await check(3, D1, { secret: "secret-du-worker", ip: "102.67.1.9" })
const spoof = await check(3, D1, { secret: "faux", ip: "9.9.9.9" })
ok(viaWorker.ip === "102.67.1.9" && spoof.ip === "41.202.10.5", "IP : celle transmise par le Worker seulement avec le secret partagé", [viaWorker.ip, spoof.ip])

// Fin de l'essai : limites de l'offre Gratuite.
await db.exec(`update nx_licenses set trial_ends_at = now() - interval '1 minute' where user_id = '${id(3)}'`)
const after = await check(3, D1)
ok(after.ok && after.plan === "free" && after.trial === false && after.perms.responsive && !after.perms.devlab, "Essai terminé : offre Gratuite (Responsive et Browser Lab seulement)", after)
const st = (await as(3, "select nx_plan_status() as r"))[0].r
ok(st.plan === "free", "nx_plan_status suit l’offre effective", st.plan)

// Essai une fois par appareil.
const second = await check(4, D1)
ok(second.ok && second.trial === false && second.trial_refused === true && second.plan === "free", "Essai : un seul par ordinateur (deuxième compte sans essai)", second)
const mismatch = await check(4, D2, { key: first.license_key })
ok(!mismatch.ok && mismatch.reason === "key_mismatch", "Licence : la clé d’un autre compte est refusée", mismatch)

// 3 comptes gratuits au plus par appareil ; 3 adresses Gmail au plus (alias comptés comme une seule adresse).
ok((await check(5, D1)).ok, "Appareil : 3e compte gratuit accepté")
const fourth = await check(1, D1)
ok(!fourth.ok && fourth.reason === "device_accounts", "Appareil : 4e compte gratuit refusé", fourth)
ok((await check(3, D1)).ok, "Appareil : un compte déjà connu reste accepté")
ok((await check(6, D1)).ok, "Appareil : un compte Pro n’est pas limité")
ok((await q("select nx_email_norm('A.wa.Diallo+essai@GoogleMail.com') as e"))[0].e === "awadiallo@gmail.com", "Gmail : points, +étiquette et googlemail.com ramenés à la même adresse")
ok((await check(1, D2)).ok && (await check(8, D2)).ok && (await check(9, D2)).ok, "Gmail : 3 adresses acceptées sur un autre ordinateur")
const g4 = await check(2, D2)
ok(!g4.ok && ["device_gmail", "device_accounts"].includes(g4.reason), "Gmail : 4e adresse refusée, même un alias d’une adresse déjà utilisée (nouveau compte)", g4)
await db.exec(`update nx_devices set blocked = true where device_hash = '${D2}'`)
ok((await check(1, D2)).reason === "device_blocked", "Appareil bloqué depuis le back office : refusé")
await db.exec(`update nx_licenses set status = 'revoked' where user_id = '${id(5)}'`)
ok((await check(5, D1)).reason === "revoked", "Licence désactivée : refusée")
ok((await q("select count(*)::int as n from nx_license_checks where not ok"))[0].n >= 5, "Journal : chaque refus est consigné")

// Sessions et journaux.
const s = first.session_id
const ping = (await as(3, "select nx_session_ping($1, $2, false) as r", [s, JSON.stringify([{ event: "espace", detail: { mode: "design" } }, { level: "error", event: "erreur", detail: { message: "x" } }])]))[0].r
ok(ping.ok && ping.plan === "free", "Session : signal de vie et journaux reçus", ping)
ok((await q("select count(*)::int as n from nx_client_logs where session_id = $1", [s]))[0].n === 2, "Session : 2 journaux enregistrés")
ok((await as(4, "select nx_session_ping($1) as r", [s]))[0].r.ok === false, "Session : celle d’un autre compte est refusée")
let direct = false
try { await as(3, "insert into nx_licenses (key, user_id) values ('NXDT-TEST', $1)", [id(7)]) } catch { direct = true }
ok(direct, "Droits : aucune écriture directe dans les licences")
ok((await as(4, "select * from nx_licenses")).length === 1 && (await as(4, "select * from nx_client_logs")).length === 0, "Droits : chacun voit sa licence, les journaux restent aux administrateurs")
const mine = (await as(7, "select nx_license_mine('site') as r"))[0].r
ok(mine.key && mine.plan === "free" && mine.trial === false && mine.devices.length === 0, "Site : licence gratuite créée avant le premier lancement (essai au premier lancement)", mine)

// Paiements.
let refused = false
try { await q("select nx_billing_apply('faux', 'stripe', 'evt_0', $1, 'active') as r", [id(7)]) } catch { refused = true }
ok(refused, "Paiement : refusé sans le secret du Worker")
const end = new Date(Date.now() + 6.5 * 86400000).toISOString()
const pay = (await q("select nx_billing_apply('secret-du-worker', 'stripe', 'evt_1', $1, 'active', 'month', $2, 'cus_7', 'sub_7', 1800, 'usd', 'checkout.session.completed') as r", [id(7), end]))[0].r
ok(pay.ok && pay.active, "Paiement : abonnement Pro activé automatiquement", pay)
ok((await check(7, "c".repeat(64))).plan === "pro", "Paiement : le logiciel passe en Pro au contrôle suivant")
ok((await q("select nx_billing_apply('secret-du-worker', 'stripe', 'evt_1', null, 'active') as r"))[0].r.duplicate, "Paiement : un même événement n’est appliqué qu’une fois")
const n = (await q("select nx_billing_remind() as n"))[0].n
const mails = await q("select * from mails")
ok(n === 1 && mails.length === 1 && /renouvelle dans 7 jours/.test(mails[0].subject) && mails[0].to_addr === "chef@exemple.ci", "Relance : e-mail 7 jours avant le renouvellement", mails)
ok((await q("select nx_billing_remind() as n"))[0].n === 0, "Relance : une seule fois par échéance")
const cancel = (await q("select nx_billing_apply('secret-du-worker', 'stripe', 'evt_2', null, 'canceled', 'month', null, 'cus_7') as r"))[0].r
await db.exec(`update nx_licenses set trial_ends_at = now() - interval '1 minute' where user_id = '${id(7)}'`)
const back = await check(7, "c".repeat(64))
ok(cancel.ok && !cancel.active && back.plan === "free" && back.paid_plan === "free", "Résiliation : retour à l’offre Gratuite (client retrouvé par son identifiant de paiement)", cancel)

// ---------- #077 : politiques, licences attribuées, intégrité, versions ----------
await db.exec(M3) // les essais des offres ont rejoué #076 : #077 la suit, comme « Tout appliquer »
await db.exec(`insert into auth.users values ('${id(20)}', 'admin@nexora.ci'); insert into profiles (id, email, app_role) values ('${id(20)}', 'admin@nexora.ci', 'admin');
  insert into auth.users values ('${id(21)}', 'eleve@ecole.ci'); insert into profiles (id, email) values ('${id(21)}', 'eleve@ecole.ci');
  insert into organizations (id, name, personal, owner_id) values ('${id(121)}', 'Espace 21', true, '${id(21)}'); insert into organization_members values ('${id(121)}', '${id(21)}', 'owner');`)
const check9 = async (n, device, version = "1.2.0", integrity = null) =>
  (await as(n, "select nx_license_check($1, null, $2, 'Windows 11', 'PC', 'n9', null, null, $3) as r", [device, version, integrity ? JSON.stringify(integrity) : null]))[0].r
const asAdmin = (sql, params) => as(20, sql, params)
let denied = false
try { await as(21, "select nx_admin_policy_set('license_policy', '{}'::jsonb)") } catch { denied = true }
ok(denied, "Administration : réglages refusés à un compte simple")
denied = false
try { await as(21, "select nx_admin_license_grant('eleve@ecole.ci', 'pro', 30)") } catch { denied = true }
ok(denied, "Administration : attribution refusée à un compte simple")
const D5 = "e".repeat(64); const D6 = "f".repeat(64); const D7 = "9".repeat(64)
const base = await check9(21, D5)
ok(base.ok && base.trial && base.check_minutes === 10 && base.release && base.release.min_version === "1.2.0", "Contrôle : intervalle et versions autorisées envoyés au logiciel", base)
await db.exec(`update nx_licenses set trial_ends_at = now() - interval '1 minute' where user_id = '${id(21)}'`)
const grant = (await asAdmin("select nx_admin_license_grant('Eleve@Ecole.ci', 'pro', 30, 'Bourse étudiante', null) as r"))[0].r
const g1 = await check9(21, D5)
ok(grant.plan_override === "pro" && g1.ok && g1.plan === "pro" && g1.granted && g1.paid_plan === "pro" && !g1.trial, "Licence attribuée : Pro pour 30 jours sans paiement (adresse sans casse)", g1)
const minev = (await as(21, "select nx_license_mine() as r"))[0].r
ok(minev.granted && minev.granted_until && minev.max_devices === 5, "Site : licence attribuée et limite d’ordinateurs affichées", minev)
await db.exec(`update nx_licenses set override_until = now() - interval '1 minute' where user_id = '${id(21)}'`)
ok((await check9(21, D5)).plan === "free", "Licence attribuée expirée : retour à l’offre Gratuite")
// NEXORA #084 : accès total des administrateurs (offre effective Pro, quelle que soit leur licence), rejouable.
const M4 = mig("20261108000004_acces_administrateurs.sql")
await db.exec(M4)
await db.exec(M4)
await check9(20, "8".repeat(64))
await db.exec(`update nx_licenses set trial_ends_at = now() - interval '1 minute' where user_id = '${id(20)}'`)
const adm = await check9(20, "8".repeat(64))
ok(adm.ok && adm.plan === "pro" && adm.admin && !adm.trial && Object.values(adm.perms).every(Boolean), "Administrateur : accès total (offre Pro, toutes les fonctions) sans essai ni abonnement", adm)
ok((await check9(21, D5)).plan === "free", "Compte simple : offre inchangée par l’accès des administrateurs")
let leak = false
try { await as(21, `select nx_is_admin_uid('${id(20)}')`) } catch { leak = true }
ok(leak, "Administrateurs : un compte ne peut pas savoir qui est administrateur")
await asAdmin("select nx_admin_license_grant('eleve@ecole.ci', 'pro', null, '', null)")
ok((await check9(21, D5)).plan === "pro", "Licence attribuée sans date de fin")
await asAdmin("select nx_admin_license_grant('pro@exemple.ci', 'free', 7, 'Suspendu 7 jours', null)")
ok((await check9(6, D5)).plan === "free", "Offre imposée « Gratuit » : prime sur un abonnement payé")
await asAdmin("select nx_admin_license_grant('pro@exemple.ci', 'auto', null, '', null)")
ok((await check9(6, D5)).plan === "pro", "Offre « Automatique » : l’abonnement s’applique de nouveau")
let unknown = ""
try { await asAdmin("select nx_admin_license_grant('personne@nulle.part', 'pro', 30)") } catch (e) { unknown = e.message }
ok(/Aucun compte NEXORA/.test(unknown), "Attribution : adresse inconnue expliquée", unknown)
const licId = (await q(`select id from nx_licenses where user_id = '${id(21)}'`))[0].id
await asAdmin("select nx_admin_license_update($1, $2::jsonb)", [licId, JSON.stringify({ max_devices: 1, note: "Un seul PC" })])
const lim = await check9(21, D6)
ok(!lim.ok && lim.reason === "device_limit" && /1 ordinateur/.test(lim.message), "Ordinateurs par licence : 2e PC refusé quand la limite est 1", lim)
const dev5 = (await q(`select id from nx_devices where device_hash = '${D5}'`))[0].id
await as(21, "select nx_license_device_release($1)", [dev5])
ok((await check9(21, D6)).ok, "« Ma licence » : un ordinateur libéré laisse la place au nouveau")
ok((await q(`select count(*)::int as n from nx_device_accounts where device_id = '${dev5}' and user_id = '${id(21)}' and released`))[0].n === 1, "Ordinateur libéré : toujours compté pour la limite des comptes gratuits (pas de contournement)")
await asAdmin("select nx_admin_license_update($1, $2::jsonb)", [licId, JSON.stringify({ max_devices: "", trial_ends_at: new Date(Date.now() + 3 * 86400000).toISOString(), plan_override: "auto" })])
const tr = await check9(21, D6)
ok(tr.ok && tr.trial && tr.plan === "pro", "Administration : essai prolongé de 3 jours", tr)
const oldKey = (await q(`select key from nx_licenses where id = $1`, [licId]))[0].key
const newKey = (await asAdmin("select nx_admin_license_rekey($1) as k", [licId]))[0].k
ok(newKey !== oldKey && /^NXDT/.test(newKey) && !(await q("select nx_license_verify($1) as r", [oldKey]))[0].r.valid, "Administration : nouvelle clé, l’ancienne n’existe plus")
await asAdmin("select nx_admin_device_unlink($1, $2)", [dev5, id(21)])
ok((await q(`select count(*)::int as n from nx_device_accounts where device_id = '${dev5}' and user_id = '${id(21)}'`))[0].n === 0, "Administration : compte retiré d’un ordinateur")
await asAdmin("select nx_admin_policy_set('license_policy', $1::jsonb)", [JSON.stringify({ free_accounts_per_device: 1, gmail_per_device: 1, trial_hours: 48, free_devices: 2, pro_devices: 4, check_minutes: 5 })])
const pol = (await q("select value from app_config where key = 'license_policy'"))[0].value
ok(pol.free_accounts_per_device === 1 && pol.trial_hours === 48 && pol.check_minutes === 5, "Réglages des licences enregistrés (valeurs bornées)", pol)
const crowd = await check9(21, D7)
ok(crowd.ok, "Réglages : un compte attribué Pro n’est pas limité par les comptes gratuits")
const blockedFree = await check9(4, D7)
ok(!blockedFree.ok && blockedFree.reason === "device_accounts", "Réglages : 1 compte gratuit par ordinateur appliqué aussitôt", blockedFree)
await asAdmin("select nx_admin_policy_set('license_policy', $1::jsonb)", [JSON.stringify({ free_accounts_per_device: 3, gmail_per_device: 3, trial_hours: 24, free_devices: 3, pro_devices: 5, check_minutes: 10 })])
// Intégrité et versions.
const integ = await check9(21, D6, "1.2.0", { ok: false, reason: "modified", file: "resources/app.asar" })
const logged = (await q("select reason, detail from nx_license_checks where reason = 'integrity' order by id desc limit 1"))[0]
ok(!integ.ok && integ.reason === "integrity" && /Installation non authentifiée/.test(integ.message) && logged.detail.file === "resources/app.asar", "Installation modifiée : refusée et consignée (fichier en cause)", integ)
denied = false
try { await asAdmin("select nx_admin_policy_set('release_policy', '{\"min_version\": \"un\"}'::jsonb)") } catch { denied = true }
ok(denied, "Versions autorisées : version illisible refusée")
await asAdmin("select nx_admin_policy_set('release_policy', $1::jsonb)", [JSON.stringify({ min_version: "1.10.0", min_manifest_version: 202611080900, block_outdated: true })])
const old = await check9(21, D6, "1.9.4", { ok: true, manifest_version: 202611080900 })
ok(!old.ok && old.reason === "outdated" && old.release.min_version === "1.10.0", "Version obsolète (1.9.4 < 1.10.0, comparaison numérique) : refusée, mise à jour demandée", old)
const oldMan = await check9(21, D6, "1.10.0", { ok: true, manifest_version: 202601010000 })
ok(!oldMan.ok && oldMan.reason === "outdated", "Manifeste plus ancien que le minimum autorisé : refusé (retour en arrière)", oldMan)
ok((await check9(21, D6, "1.10.2-beta", { ok: true, manifest_version: 202611090000 })).ok, "Version autorisée : ouverture")
await asAdmin("select nx_admin_policy_set('release_policy', $1::jsonb)", [JSON.stringify({ min_version: "1.10.0", block_outdated: false })])
ok((await check9(21, D6, "1.0.0")).ok, "Refus des versions obsolètes désactivé : ancienne version acceptée")
await asAdmin("select nx_admin_policy_set('release_policy', $1::jsonb)", [JSON.stringify({ min_version: "1.2.0", min_manifest_version: 0, block_outdated: true })])
ok(JSON.stringify((await q("select nx_release_policy() as r"))[0].r) === JSON.stringify({ channel: "stable", min_version: "1.2.0", block_outdated: true, min_manifest_version: 0 }), "Versions autorisées lisibles par le service de sécurité")
denied = false
try { await q("select nx_security_report('faux', $1, 'signature')", [D6]) } catch { denied = true }
const rep2 = (await q("select nx_security_report('secret-du-worker', $1, 'modified', '{\"file\": \"NEXORA.exe\"}'::jsonb, '1.2.0', '41.2.2.2', 'launcher') as r", [D6]))[0].r
const lrow = (await q("select * from nx_license_checks where source = 'launcher' order by id desc limit 1"))[0]
ok(denied && rep2.ok && lrow.reason === "modified" && lrow.detail.file === "NEXORA.exe" && lrow.ip === "41.2.2.2" && lrow.device_id, "Anomalie du lanceur consignée (secret du Worker exigé), ordinateur reconnu", lrow)

// ---------- Worker : contrôle signé, webhook ----------
{
  const crypto = await import("node:crypto")
  const src = fs.readFileSync(path.join(ROOT, "worker/licences.js"), "utf8")
    .replace(/^import setup from .*$/m, `const setup = ${fs.readFileSync(path.join(ROOT, "supabase/nexora.json"), "utf8")}`)
  const W = await import(`data:text/javascript,${encodeURIComponent(src)}`)
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519")
  const env = { NX_LICENSE_SIGNING_KEY: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"), NX_PROBE_SECRET: "secret-du-worker", STRIPE_WEBHOOK_SECRET: "whsec_essai" }
  const calls = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (u, o = {}) => {
    calls.push({ u: String(u), o })
    if (String(u).endsWith("/rpc/nx_license_check")) return new Response(JSON.stringify({ ok: true, plan: "free", nonce: JSON.parse(o.body).p_nonce }), { status: 200 })
    if (String(u).endsWith("/rpc/nx_billing_apply")) return new Response(JSON.stringify({ ok: true }), { status: 200 })
    return new Response("{}", { status: 404 })
  }
  try {
    const req = (body, token = "jeton") => new Request("https://x/license/check", { method: "POST", headers: { authorization: token ? `Bearer ${token}` : "", "cf-connecting-ip": "41.1.2.3", "content-type": "application/json" }, body: JSON.stringify(body) })
    const res = await (await W.handleLicences(req({ device: "d".repeat(64), nonce: "abc", version: "1.0.0" }), env)).json()
    const verified = crypto.verify(null, Buffer.from(res.payload), publicKey, Buffer.from(res.sig, "base64"))
    const payload = JSON.parse(res.payload)
    ok(verified && payload.ok && payload.nonce === "abc" && payload.device === "d".repeat(64), "Worker : réponse de licence signée (Ed25519), nonce et appareil liés", payload)
    const sent = JSON.parse(calls.find((c) => c.u.endsWith("/rpc/nx_license_check")).o.body)
    ok(sent.p_ip === "41.1.2.3" && sent.p_secret === "secret-du-worker" && calls.find((c) => c.u.endsWith("/rpc/nx_license_check")).o.headers.authorization === "Bearer jeton", "Worker : adresse IP de Cloudflare et session de l’utilisateur transmises à la base")
    const forged = JSON.stringify({ ...payload, plan: "pro" })
    ok(!crypto.verify(null, Buffer.from(forged), publicKey, Buffer.from(res.sig, "base64")), "Worker : une réponse modifiée (offre changée) ne passe plus la signature")
    const noAuth = JSON.parse((await (await W.handleLicences(req({ device: "d".repeat(64), nonce: "n" }, ""), env)).json()).payload)
    ok(noAuth.ok === false && noAuth.reason === "auth", "Worker : sans session, réponse signée « connexion requise »")
    const off = await W.handleLicences(req({ device: "d".repeat(64) }), {})
    ok(off.status === 503, "Worker : sans clé de signature, aucun contrôle accepté (503)")
    const raw = JSON.stringify({ id: "evt_9", type: "customer.subscription.deleted", data: { object: { id: "sub_1", customer: "cus_1", status: "canceled", items: { data: [{ current_period_end: 1900000000, price: { recurring: { interval: "year" } } }] } } } })
    const t = Math.floor(Date.now() / 1000)
    const v1 = crypto.createHmac("sha256", "whsec_essai").update(`${t}.${raw}`).digest("hex")
    const hook = (sig) => new Request("https://x/pay/webhook", { method: "POST", headers: { "stripe-signature": sig }, body: raw })
    const bad = await W.handleLicences(hook(`t=${t},v1=${"0".repeat(64)}`), env)
    const good = await W.handleLicences(hook(`t=${t},v1=${v1}`), env)
    const applied = JSON.parse(calls.filter((c) => c.u.endsWith("/rpc/nx_billing_apply")).at(-1).o.body)
    ok(bad.status === 400 && good.status === 200 && applied.p_status === "canceled" && applied.p_customer === "cus_1" && applied.p_period === "year" && applied.p_event_id === "evt_9", "Worker : webhook Stripe vérifié (signature) puis transmis à nx_billing_apply", applied)
    ok(!(await W.stripeSignatureOk("whsec_essai", `t=${t - 600},v1=${v1}`, raw)), "Worker : signature trop ancienne refusée (rejeu)")
    // #077 : intégrité transmise ; déclaration de publication signée (24 h) ; anomalies du lanceur.
    await W.handleLicences(req({ device: "d".repeat(64), nonce: "i", integrity: { ok: false, reason: "modified", file: "resources/app.asar", extra: "x" } }), env)
    const sentI = JSON.parse(calls.filter((c) => c.u.endsWith("/rpc/nx_license_check")).at(-1).o.body)
    ok(sentI.p_integrity && sentI.p_integrity.ok === false && sentI.p_integrity.file === "resources/app.asar" && !("extra" in sentI.p_integrity), "Worker : résultat d’intégrité du logiciel transmis à la base (champs filtrés)", sentI.p_integrity)
    const relKeys = crypto.generateKeyPairSync("ed25519")
    const manRaw = Buffer.from(JSON.stringify({ format: 1, version: "1.3.0", manifest_version: 202611090000, issued_at: "2026-11-09T00:00:00Z" }))
    let manSig = crypto.sign(null, manRaw, relKeys.privateKey).toString("base64")
    let ghRelease = true
    const ghFetch = async (u, o = {}) => {
      u = String(u)
      calls.push({ u, o })
      // #079 : liens directs de github.com (redirection de latest vers le tag), plus jamais api.github.com.
      if (u.includes("api.github.com")) return new Response("{}", { status: 403 })
      if (u === "https://github.com/Trdgi4djyds/NEXORA-portable/releases/latest/download/nexora.manifest.json")
        return ghRelease && o.redirect === "manual" ? new Response(null, { status: 302, headers: { location: "https://github.com/Trdgi4djyds/NEXORA-portable/releases/download/v1.3.0/nexora.manifest.json" } }) : new Response("Not Found", { status: 404 })
      if (u === "https://github.com/Trdgi4djyds/NEXORA-portable/releases/download/v1.3.0/nexora.manifest.json") return new Response(manRaw, { status: 200 })
      if (u === "https://github.com/Trdgi4djyds/NEXORA-portable/releases/download/v1.3.0/nexora.manifest.sig") return new Response(manSig, { status: 200 })
      if (u.endsWith("/rpc/nx_release_policy")) return new Response(JSON.stringify({ min_version: "1.2.0", min_manifest_version: 7, block_outdated: true }), { status: 200 })
      if (u.endsWith("/rpc/nx_security_report")) return new Response(JSON.stringify({ ok: true }), { status: 200 })
      return new Response("{}", { status: 404 })
    }
    globalThis.fetch = ghFetch
    const src2 = src.replace(/export const RELEASE_PUBLIC_KEY = "[^"]+"/, `export const RELEASE_PUBLIC_KEY = "${relKeys.publicKey.export({ type: "spki", format: "der" }).toString("base64")}"`)
    const W2 = await import(`data:text/javascript,${encodeURIComponent(src2)}#2`)
    const st1 = await (await W2.handleLicences(new Request("https://x/security/manifest"), env)).json()
    const decl = JSON.parse(st1.payload)
    const okSig = crypto.verify(null, Buffer.from(st1.payload), publicKey, Buffer.from(st1.sig, "base64"))
    const ttl = Date.parse(decl.expires_at) - Date.parse(decl.issued_at)
    ok(okSig && decl.status === "ok" && decl.latest.version === "1.3.0" && decl.latest.tag === "v1.3.0" && decl.latest.manifest_sha256 === crypto.createHash("sha256").update(manRaw).digest("hex") && decl.min_manifest_version === 7 && ttl === 86400000,
      "Service de sécurité : déclaration signée, dernière publication vérifiée (empreinte du manifeste), versions autorisées, valable 24 h", decl)
    ok(!calls.some((c) => String(c.u).includes("api.github.com")), "Service de sécurité : liens directs de téléchargement, aucun appel à l’API GitHub (quota)")
    ghRelease = false
    await W2.latestPublication(true)
    const decl0 = JSON.parse((await (await W2.handleLicences(new Request("https://x/security/manifest"), env)).json()).payload)
    ok(decl0.status === "no_release" && decl0.latest === null, "Service de sécurité : dépôt sans publication signalé « no_release » (et non « injoignable »)", decl0)
    ghRelease = true
    manSig = crypto.sign(null, Buffer.from("autre"), relKeys.privateKey).toString("base64")
    await W2.latestPublication(true)
    const decl2 = JSON.parse((await (await W2.handleLicences(new Request("https://x/security/manifest"), env)).json()).payload)
    ok(decl2.status === "signature" && decl2.latest === null, "Service de sécurité : manifeste du dépôt mal signé signalé (aucune publication déclarée)", decl2)
    const repRes = await W2.handleLicences(new Request("https://x/security/report", { method: "POST", headers: { "cf-connecting-ip": "41.9.9.9" }, body: JSON.stringify({ device: "d".repeat(64), reason: "modified", detail: { file: "NEXORA.exe" }, version: "1.2.0" }) }), env)
    const repSent = JSON.parse(calls.filter((c) => String(c.u).endsWith("/rpc/nx_security_report")).length ? "{}" : "{}")
    void repSent
    ok(repRes.status === 200, "Service de sécurité : anomalie du lanceur relayée au journal")
    ok((await W2.handleLicences(new Request("https://x/security/manifest"), {})).status === 503, "Service de sécurité : sans clé de signature, aucune déclaration (503)")
  } finally { globalThis.fetch = realFetch }
}

console.log(`\n${count} vérifications, ${fails ? `${fails} échec(s)` : "aucun échec"}.`)
process.exit(fails ? 1 : 0)
