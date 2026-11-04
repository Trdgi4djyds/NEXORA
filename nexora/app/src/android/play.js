'use strict';
/* Publication sur Google Play : envoi de l'AAB sur une piste (test interne, fermé, ouvert ou production)
 * avec les notes de version, par l'API officielle de la Play Console et un compte de service. */
const fs = require('fs');
const { accessToken, parseServiceAccount } = require('./push');

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

function explain(status, j) {
  const msg = (j && j.error && (j.error.message || j.error.status)) || '';
  if (status === 401 || /invalid_grant/i.test(msg)) return 'Clé du compte de service refusée : vérifie le fichier importé.';
  if (status === 403 || /permission/i.test(msg)) return 'Ce compte de service n’a pas accès à l’application dans la Play Console (Utilisateurs et autorisations › Inviter : donne-lui le droit de publier).';
  if (status === 404 || /not found|Package not found/i.test(msg)) return 'Application introuvable dans la Play Console : crée-la d’abord une fois à la main (Play Console › Créer une application) avec cet identifiant, et envoie le premier AAB depuis la Console.';
  if (/version code.*already/i.test(msg) || /APK specifies a version code that has already been used/i.test(msg)) return 'Ce numéro de version a déjà été envoyé : augmente le « Numéro de version » (section Identité) et reconstruis.';
  if (/signature|signing/i.test(msg)) return 'La clé de signature ne correspond pas à celle enregistrée sur Google Play pour cette application.';
  return msg ? `Google Play a refusé l’envoi : ${msg}` : `Google Play a refusé l’envoi (erreur ${status}).`;
}

async function call(fetchImpl, tok, method, url, body, headers = {}) {
  const r = await fetchImpl(url, { method, headers: { authorization: `Bearer ${tok}`, ...(body && !(body instanceof Buffer) ? { 'content-type': 'application/json' } : {}), ...headers }, body: body instanceof Buffer ? body : body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(explain(r.status, j));
  return j;
}

/* Vérifie l'accès (sans rien publier) : ouvre puis abandonne une modification. */
async function check({ serviceAccount, appId }, fetchImpl) {
  const sa = parseServiceAccount(serviceAccount);
  if (!sa.ok) throw new Error(sa.error.replace('Firebase', 'Google Cloud'));
  const tok = await accessToken(sa.json, fetchImpl, SCOPE);
  const edit = await call(fetchImpl, tok, 'POST', `${API}/${encodeURIComponent(appId)}/edits`, {});
  const tracks = await call(fetchImpl, tok, 'GET', `${API}/${encodeURIComponent(appId)}/edits/${edit.id}/tracks`).catch(() => ({ tracks: [] }));
  await call(fetchImpl, tok, 'DELETE', `${API}/${encodeURIComponent(appId)}/edits/${edit.id}`).catch(() => {});
  return { ok: true, email: sa.email, tracks: (tracks.tracks || []).map((t) => ({ track: t.track, releases: (t.releases || []).map((x) => ({ name: x.name, status: x.status, versionCodes: x.versionCodes })) })) };
}

async function publish({
  serviceAccount, appId, aab, track = 'internal', notes = '', status = 'completed', lang = 'fr-FR', rollout,
}, fetchImpl, onStep = () => {}) {
  const sa = parseServiceAccount(serviceAccount);
  if (!sa.ok) throw new Error(sa.error.replace('Firebase', 'Google Cloud'));
  if (!aab || !fs.existsSync(aab)) throw new Error('Construis d’abord l’application au format AAB (case « AAB Play Store »).');
  onStep('Connexion à Google Play', 0.05);
  const tok = await accessToken(sa.json, fetchImpl, SCOPE);
  const id = encodeURIComponent(appId);
  const edit = await call(fetchImpl, tok, 'POST', `${API}/${id}/edits`, {});
  try {
    onStep('Envoi du fichier AAB', 0.2);
    const up = await call(fetchImpl, tok, 'POST', `${UPLOAD}/${id}/edits/${edit.id}/bundles?uploadType=media`, fs.readFileSync(aab), { 'content-type': 'application/octet-stream' });
    onStep('Préparation de la version', 0.75);
    const release = { versionCodes: [String(up.versionCode)], status: rollout && rollout < 1 ? 'inProgress' : status, ...(rollout && rollout < 1 ? { userFraction: rollout } : {}), ...(notes ? { releaseNotes: [{ language: lang, text: String(notes).slice(0, 500) }] } : {}) };
    await call(fetchImpl, tok, 'PUT', `${API}/${id}/edits/${edit.id}/tracks/${track}`, { track, releases: [release] });
    onStep('Validation', 0.9);
    await call(fetchImpl, tok, 'POST', `${API}/${id}/edits/${edit.id}:commit`);
    onStep('Envoyé', 1);
    return { ok: true, versionCode: up.versionCode, track, status: release.status };
  } catch (err) {
    await call(fetchImpl, tok, 'DELETE', `${API}/${id}/edits/${edit.id}`).catch(() => {});
    throw err;
  }
}

// NEXORA #017 : call et explain servent aussi à la fiche Play Store (listing.js).
module.exports = { check, publish, call, explain };
