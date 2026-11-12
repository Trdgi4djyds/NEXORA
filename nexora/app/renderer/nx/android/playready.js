// NEXORA #056 : calculs sans navigateur de l'assistant « Prêt pour le Play Store » et des tests fermés
// (adresses des testeurs, calendrier des 14 jours, liens d'invitation, liste CSV, réponses pour l'accès à la
// production). Essayé par scripts/test-appbuilder.mjs.

// Comptes développeur personnels créés après le 13 novembre 2023 : Google exige un test fermé avec au moins
// 12 testeurs inscrits sans interruption pendant 14 jours avant de pouvoir demander l'accès à la production.
export const REQUIRED = { testers: 12, days: 14 };
export const ACCOUNTS = {
  personal: 'Personnel, créé après le 13 novembre 2023',
  older: 'Personnel, plus ancien',
  org: 'Organisation (entreprise, association)',
};
const DAY = 86400000;

export const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/;

/* Adresses collées en vrac (une par ligne, séparées par des virgules ou des points-virgules, « Nom <a@b.fr> »). */
export function parseEmails(text) {
  const ok = []; const bad = []; const seen = new Set();
  for (const raw of String(text || '').split(/[\s,;]+/)) {
    const v = raw.replace(/^[<("']+|[>)"'.]+$/g, '').trim().toLowerCase();
    if (!v) continue;
    if (!v.includes('@')) continue; // mots d'un nom (« Awa Koné <awa@…> »)
    if (!EMAIL_RE.test(v)) { bad.push(v); continue; }
    if (seen.has(v)) continue;
    seen.add(v); ok.push(v);
  }
  return { ok, bad };
}

/* Ajoute des testeurs à la liste existante, sans doublon. */
export function mergeTesters(list, emails, at = Date.now()) {
  const out = Array.isArray(list) ? list.slice() : [];
  const have = new Set(out.map((t) => t.email));
  let added = 0; let dupes = 0;
  for (const e of emails) {
    if (have.has(e)) { dupes++; continue; }
    have.add(e); out.push({ email: e, at }); added++;
  }
  return { list: out, added, dupes };
}

const startOf = (v) => {
  if (!v) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? new Date(`${v}T00:00:00`) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
export const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* État du test fermé : exigence applicable, jour en cours, jours restants, testeurs inscrits. */
export function closedTest(t = {}, now = Date.now()) {
  const applies = (t.account || 'personal') === 'personal';
  const listed = Array.isArray(t.list) ? t.list.length : 0;
  const optedIn = Math.max(0, Math.floor(Number(t.optedIn) || 0));
  const start = startOf(t.startedAt);
  const today = startOf(now);
  const elapsed = start ? Math.max(0, Math.round((today - start) / DAY)) : 0;
  const end = start ? new Date(start.getTime() + REQUIRED.days * DAY) : null;
  const daysLeft = start ? Math.max(0, REQUIRED.days - elapsed) : REQUIRED.days;
  const testersOk = optedIn >= REQUIRED.testers;
  const daysOk = !!start && elapsed >= REQUIRED.days;
  let state = 'todo';
  if (!applies) state = 'na';
  else if (daysOk && testersOk) state = 'ready';
  else if (start) state = 'running';
  return {
    applies, listed, optedIn, testersOk, daysOk, state,
    started: !!start, startDate: start, endDate: end, day: start ? Math.min(elapsed, REQUIRED.days) : 0, daysLeft,
    future: !!start && start > today,
    pct: applies ? Math.round(100 * Math.min(1, (start ? Math.min(elapsed, REQUIRED.days) / REQUIRED.days : 0) * 0.5 + Math.min(optedIn, REQUIRED.testers) / REQUIRED.testers * 0.5)) : 100,
  };
}

export const optInUrl = (appId) => `https://play.google.com/apps/testing/${appId}`;
export const storeUrl = (appId) => `https://play.google.com/store/apps/details?id=${appId}`;

export function inviteText({ appName = 'mon application', appId = '' } = {}) {
  return `Bonjour,

Je prépare la sortie de « ${appName} » sur Google Play et j'ai besoin de votre aide pendant 14 jours.

1. Ouvrez ce lien avec le compte Google de votre téléphone Android et appuyez sur « Devenir testeur » :
${optInUrl(appId)}
2. Installe l'application depuis Google Play :
${storeUrl(appId)}
3. Gardez-la installée au moins 14 jours et ouvrez-la de temps en temps. Vos remarques sont les bienvenues.

Merci beaucoup !`;
}

/* Liste à importer dans la Play Console (Tests › Test fermé › Testeurs › Créer une liste d'adresses e-mail). */
export const testersCsv = (list) => (list || []).map((t) => t.email).join('\n') + ((list || []).length ? '\n' : '');

export function mailto(list, subject, body) {
  const bcc = (list || []).map((t) => t.email).join(',');
  return `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/* Brouillon des réponses au questionnaire « Demander l'accès à la production » de la Play Console. Les
 * questions ci-dessous reprennent les thèmes habituels (test, testeurs, retours, préparation, public). */
export function productionAnswers({ appName = '', test, feedback = [], audience = '' } = {}) {
  const fixed = feedback.filter((f) => f.done);
  const notes = feedback.slice(0, 8).map((f) => `- ${f.text}${f.done ? ' (corrigé)' : ''}`).join('\n');
  const s = test || {};
  // Tant que le test n'a pas eu lieu, des repères entre crochets restent à compléter.
  const who = s.optedIn ? `${s.optedIn} personnes` : '[nombre de testeurs] personnes';
  const days = s.day ? `${s.day} jours` : '[durée] jours';
  const app = appName ? `« ${appName} »` : 'l’application';
  const site = appName ? `de « ${appName} »` : 'de l’entreprise';
  return [
    ['Comment avez-vous recruté les testeurs ?', `J'ai invité ${who} de mon entourage et de mes premiers clients par e-mail, avec le lien d'inscription au test fermé.`],
    ['Comment les testeurs ont-ils utilisé l’application ?', `Le test a duré ${days}. Les testeurs ont installé ${app} depuis Google Play et ont utilisé ses principales fonctions dans des conditions réelles.`],
    ['Quels retours avez-vous reçus ?', feedback.length ? `${feedback.length} retour(s), dont :\n${notes}` : 'Aucun retour bloquant n’a été signalé.'],
    ['Qu’avez-vous changé après le test ?', fixed.length ? `${fixed.length} point(s) corrigé(s) : ${fixed.slice(0, 5).map((f) => f.text).join(' ; ')}.` : 'Corrections mineures d’affichage ; aucun problème de stabilité constaté.'],
    ['Comment savez-vous que l’application est prête ?', 'Les testeurs ont pu réaliser les parcours principaux sans blocage, aucun plantage n’est relevé et la fiche, la politique de confidentialité et la déclaration de sécurité des données sont complètes.'],
    ['À qui s’adresse l’application ?', audience || `Aux clients et visiteurs qui utilisent déjà le site ${site} et veulent y accéder plus vite depuis leur téléphone.`],
  ];
}

/* Numéro de version : chaque envoi sur Google Play exige un numéro plus grand que le précédent. */
export function versionCheck(cfg) {
  const last = cfg && cfg.lastStore && Number(cfg.lastStore.versionCode);
  const cur = Number(cfg && cfg.versionCode) || 0;
  if (!last) return { ok: true, cur, last: null };
  return { ok: cur > last, cur, last };
}

/* Identifiants refusés par Google Play (exemples, préfixes réservés). */
export function idProblem(appId) {
  const id = String(appId || '').toLowerCase();
  if (!id) return 'Identifiant manquant.';
  if (/^(com|org|net)\.example(\.|$)/.test(id) || id.startsWith('com.android.') || id.startsWith('android.')) return 'Google Play refuse les identifiants d’exemple (com.example…) et ceux réservés à Android.';
  return '';
}
