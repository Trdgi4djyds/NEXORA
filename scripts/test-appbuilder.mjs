// NEXORA #056 : essais de l'App Builder sans navigateur : calculs de renderer/nx/android/playready.js
// (adresses des testeurs, calendrier du test fermé de 14 jours, liens et message d'invitation, liste CSV,
// courriel groupé, réponses pour l'accès à la production, numéro de version, identifiants refusés).
// Lancement : pnpm test:appbuilder.
import * as P from "../nexora/app/renderer/nx/android/playready.js"

let count = 0
let fails = 0
function ok(cond, label, detail) {
  count += 1
  if (!cond) fails += 1
  console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}${!cond && detail !== undefined ? ` → ${JSON.stringify(detail).slice(0, 300)}` : ""}`)
}
const DAY = 86400000
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime()

// ---------- Adresses ----------
const e = P.parseEmails("Awa Koné <Awa.Kone@Gmail.com>, marc@gmail.com; marc@gmail.com\nfaux@ x@y lea@exemple.fr\t\"zoe@mail.fr\".")
ok(JSON.stringify(e.ok) === JSON.stringify(["awa.kone@gmail.com", "marc@gmail.com", "lea@exemple.fr", "zoe@mail.fr"]), "Adresses : nom et chevrons, minuscules, doublons, guillemets", e.ok)
ok(JSON.stringify(e.bad) === JSON.stringify(["faux@", "x@y"]), "Adresses : invalides signalées", e.bad)
ok(P.parseEmails("").ok.length === 0 && P.parseEmails(null).ok.length === 0, "Adresses : texte vide")
const m = P.mergeTesters([{ email: "marc@gmail.com", at: 1 }], e.ok, 5)
ok(m.list.length === 4 && m.added === 3 && m.dupes === 1 && m.list[0].at === 1 && m.list[3].at === 5, "Testeurs : ajout sans doublon, ordre et date gardés", m)

// ---------- Test fermé ----------
const now = at(2026, 11, 20)
let s = P.closedTest({ account: "personal" }, now)
ok(s.applies && s.state === "todo" && !s.started && s.daysLeft === 14 && s.pct === 0, "Test fermé : pas commencé", s)
s = P.closedTest({ account: "personal", startedAt: "2026-11-15", optedIn: 8 }, now)
ok(s.state === "running" && s.day === 5 && s.daysLeft === 9 && !s.testersOk && P.isoDay(s.endDate) === "2026-11-29", "Test fermé : jour 5, 9 jours restants, fin le 29", { day: s.day, left: s.daysLeft, end: s.endDate })
ok(s.pct === Math.round(100 * ((5 / 14) * 0.5 + (8 / 12) * 0.5)), "Test fermé : progression (moitié durée, moitié testeurs)", s.pct)
s = P.closedTest({ account: "personal", startedAt: "2026-11-06", optedIn: 12 }, now)
ok(s.state === "ready" && s.daysOk && s.testersOk && s.day === 14 && s.daysLeft === 0 && s.pct === 100, "Test fermé : 14 jours et 12 testeurs → terminé", s)
s = P.closedTest({ account: "personal", startedAt: "2026-11-01", optedIn: 11 }, now)
ok(s.state === "running" && s.daysOk && !s.testersOk, "Test fermé : durée atteinte mais 11 testeurs → pas terminé")
s = P.closedTest({ account: "personal", startedAt: "2026-11-25", optedIn: 12 }, now)
ok(s.future && s.day === 0 && s.state === "running", "Test fermé : date de début dans le futur")
ok(P.closedTest({ account: "org" }, now).state === "na" && P.closedTest({ account: "older" }, now).pct === 100, "Test fermé : non exigé (organisation, compte ancien)")
s = P.closedTest({ account: "personal", startedAt: "2026-03-20", optedIn: 12 }, at(2026, 4, 3, 1))
ok(s.day === 14 && s.state === "ready", "Test fermé : changement d'heure de printemps sans jour perdu", s.day)
ok(P.closedTest({ startedAt: "pas une date", optedIn: "abc" }, now).started === false, "Test fermé : valeurs illisibles ignorées")
ok(P.closedTest({ account: "personal", startedAt: now - 3 * DAY, optedIn: 2 }, now).day === 3, "Test fermé : date en millisecondes acceptée")

// ---------- Invitation ----------
ok(P.optInUrl("fr.ex.app") === "https://play.google.com/apps/testing/fr.ex.app" && P.storeUrl("fr.ex.app") === "https://play.google.com/store/apps/details?id=fr.ex.app", "Liens d'inscription et de la page Google Play")
const inv = P.inviteText({ appName: "Boutique Awa", appId: "fr.ex.app" })
ok(inv.includes("« Boutique Awa »") && inv.includes(P.optInUrl("fr.ex.app")) && inv.includes("14 jours"), "Message d'invitation complet")
ok(P.testersCsv(m.list) === "marc@gmail.com\nawa.kone@gmail.com\nlea@exemple.fr\nzoe@mail.fr\n" && P.testersCsv([]) === "", "Liste CSV pour la Play Console")
const mail = P.mailto(m.list.slice(0, 2), "Teste « Boutique »", "Bonjour & merci")
ok(mail.startsWith("mailto:?bcc=marc%40gmail.com%2Cawa.kone%40gmail.com&subject=") && mail.includes("Bonjour%20%26%20merci"), "Courriel groupé en copie cachée, texte encodé", mail)

// ---------- Production ----------
const st = P.closedTest({ account: "personal", startedAt: "2026-11-06", optedIn: 13 }, now)
const qa = P.productionAnswers({ appName: "Boutique Awa", test: st, feedback: [{ text: "Bouton caché", done: true }, { text: "Lent au démarrage", done: false }], audience: "Les clients du marché" })
ok(qa.length === 6 && qa.every(([q, a]) => q && a), "Réponses : 6 questions remplies")
ok(qa[0][1].includes("13 personnes") && qa[1][1].includes("14 jours") && qa[2][1].includes("2 retour(s)") && qa[2][1].includes("Bouton caché (corrigé)") && qa[3][1].includes("1 point(s) corrigé(s) : Bouton caché") && qa[5][1] === "Les clients du marché", "Réponses : testeurs, durée, retours, corrections, public", qa)
const empty = P.productionAnswers({})
ok(empty.length === 6 && empty[0][1].includes("[nombre de testeurs]") && empty[1][1].includes("[durée] jours") && empty[1][1].includes("installé l’application") && !empty.some(([, a]) => /« »|\b0 (jours|personnes)/.test(a)), "Réponses : sans données, repères à compléter", empty)

// ---------- Version et identifiant ----------
ok(P.versionCheck({ versionCode: 1 }).ok && P.versionCheck({ versionCode: 4, lastStore: { versionCode: 3 } }).ok, "Version : premier envoi, numéro plus grand")
ok(!P.versionCheck({ versionCode: 3, lastStore: { versionCode: 3 } }).ok && !P.versionCheck({ versionCode: 2, lastStore: { versionCode: "3" } }).ok, "Version : numéro déjà envoyé ou plus petit refusé")
ok(P.idProblem("com.example.app") && P.idProblem("org.example") && P.idProblem("com.android.test") && P.idProblem(""), "Identifiants refusés (exemple, Android, vide)")
ok(!P.idProblem("fr.boutique.awa") && !P.idProblem("com.examples.shop"), "Identifiants acceptés")

console.log(`\n${count} vérifications, ${fails ? `${fails} échec(s)` : "aucun échec"}.`)
process.exit(fails ? 1 : 0)
