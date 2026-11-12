// NEXORA #048 : briques communes des onglets de l'espace Sécurité (gravité, qui doit agir, risque expliqué en
// clair, constats avec « Accepter le risque », progression des analyses, note sur 100).
import { api, call, esc, icon, toast, sheet, closeSheet, ago, dateTime } from '../../supervision/util.js';
import { card, kpi, btn, iconBtn } from '../../supervision/ui.js';
import { settings } from '../core.js';

export { api, call, esc, icon, toast, sheet, closeSheet, ago, dateTime, card, kpi, btn, iconBtn, settings };

export const SEV = {
  critical: { label: 'Critique', tone: 'bad', color: '#ff3b30', rank: 4 },
  high: { label: 'Élevé', tone: 'bad', color: '#ff6b00', rank: 3 },
  medium: { label: 'Moyen', tone: 'warn', color: '#ff9f0a', rank: 2 },
  low: { label: 'Faible', tone: 'warn', color: '#d4a106', rank: 1 },
  info: { label: 'Info', tone: '', color: '#8e8e93', rank: 0 },
};

export const WHO = {
  toi: 'Vous (code ou réglages du site)',
  hebergeur: 'Votre hébergeur',
  dns: 'Chez votre hébergeur DNS',
  registraire: 'Chez votre registraire',
  messagerie: 'Votre service d’e-mail',
};

// Catégorie → qui agit et risque concret, quand le constat ne le précise pas.
const CAT = {
  Transport: ['hebergeur', 'Les échanges avec vos visiteurs (mots de passe, formulaires) peuvent être lus ou modifiés en route.'],
  'En-têtes': ['vous', 'Votre site est plus exposé aux scripts injectés, à l’affichage dans un faux site et aux fuites d’informations.'],
  Cookies: ['vous', 'Les sessions de vos visiteurs peuvent être volées.'],
  Contenu: ['vous', 'Une ressource externe modifiée peut prendre la main sur votre page.'],
  'Fichiers exposés': ['vous', 'Des fichiers internes (mots de passe, code source) sont lisibles par n’importe qui.'],
  Divulgation: ['hebergeur', 'Les robots savent exactement quelles failles essayer.'],
  Configuration: ['hebergeur', 'Des fonctions de diagnostic du serveur sont ouvertes au public.'],
  'Bonnes pratiques': ['vous', 'Rien d’urgent, mais c’est un plus pour la confiance et le référencement.'],
  Messagerie: ['messagerie', 'Des e-mails frauduleux peuvent être envoyés à votre nom à vos clients.'],
  DNS: ['dns', 'Votre domaine peut être détourné plus facilement.'],
  Domaine: ['registraire', 'Votre site et vos e-mails peuvent s’arrêter du jour au lendemain.'],
  'Sous-domaines': ['dns', 'Quelqu’un peut publier des pages sous votre nom.'],
  Pages: ['vous', 'Des visiteurs connectés peuvent être piégés ou leurs données exposées.'],
  'Diagnostic exposé': ['vous', 'Des informations internes de votre application sont accessibles à tous.'],
  Secrets: ['vous', 'Une clé volée permet d’agir à votre place, et parfois de vous facturer.'],
  'Dépendances': ['vous', 'Les failles publiées sont exploitées automatiquement par des robots.'],
  Fenêtres: ['vous', 'Une page piégée pourrait agir sur l’ordinateur de vos utilisateurs.'],
  Navigation: ['vous', 'Votre logiciel peut être détourné vers un site malveillant.'],
  Construction: ['vous', 'Votre logiciel est plus facile à modifier ou inspire moins confiance.'],
  Electron: ['vous', 'Les failles corrigées depuis dans Chromium restent ouvertes.'],
  'Mises à jour': ['vous', 'Une fausse mise à jour pourrait être installée.'],
  Réseau: ['vous', 'Les données de l’application peuvent être lues sur un Wi-Fi public.'],
  Données: ['vous', 'Les données de l’application peuvent être copiées.'],
  Permissions: ['vous', 'Les utilisateurs et le Play Store se méfient des applications trop gourmandes.'],
  Composants: ['vous', 'D’autres applications du téléphone peuvent l’utiliser.'],
  Signature: ['vous', 'Le Play Store refuse l’application, ou une fausse mise à jour devient possible.'],
};
export const whoOf = (f) => f.who || (CAT[f.cat] || ['vous'])[0];
export const riskOf = (f) => (CAT[f.cat] || [null, ''])[1];

export function grade(score) {
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 65 ? 'C' : score >= 50 ? 'D' : score >= 30 ? 'E' : 'F';
}
export const toneOf = (score) => (score == null ? '' : score >= 85 ? 'good' : score >= 60 ? 'warn' : 'bad');

export function ring(score, size = 'm') {
  const c = score == null ? 'var(--text-3)' : score >= 85 ? 'var(--ok-dot)' : score >= 60 ? 'var(--warn-dot)' : 'var(--bad-dot)';
  return `<div class="nxs-ring ${size}" style="--p:${score == null ? 0 : score};--c:${c}"><span>${score == null ? '—' : score}${score == null ? '' : '<small>/100</small>'}</span></div>`;
}

export function sevChip(sev) {
  const s = SEV[sev] || SEV.info;
  return `<span class="nxs-sev" style="--c:${s.color}">${esc(s.label)}</span>`;
}

export function counts(c = {}) {
  const order = ['critical', 'high', 'medium', 'low'];
  const parts = order.filter((k) => c[k]).map((k) => `<span class="nxs-count" style="--c:${SEV[k].color}">${c[k]} ${esc(SEV[k].label.toLowerCase())}</span>`);
  return parts.length ? parts.join('') : `<span class="nxs-count ok">${icon('check', 11)}Aucun problème</span>`;
}

// Un constat : gravité, titre, détail, risque concret, correction, qui doit agir, et « Accepter le risque ».
export function findingHtml(f, { target, accepted } = {}) {
  const acc = accepted && accepted.find((a) => a.key === f.key);
  const who = whoOf(f);
  const risk = riskOf(f);
  return `<div class="nxs-find ${f.sev} ${acc ? 'accepted' : ''}" data-key="${esc(f.key || '')}">
    <div class="nxs-find-h">${sevChip(f.sev)}<b>${esc(f.title)}</b>${acc ? `<span class="sup-chip">${icon('check', 11)}Risque accepté${acc.until ? ` jusqu’au ${esc(new Date(acc.until).toLocaleDateString('fr-FR'))}` : ''}</span>` : ''}</div>
    ${f.detail ? `<p>${esc(f.detail)}</p>` : ''}
    <div class="nxs-find-g">
      ${risk && f.sev !== 'info' ? `<div><small>Ce que ça risque</small><span>${esc(risk)}</span></div>` : ''}
      <div><small>Qui doit agir</small><span>${esc(WHO[who] || WHO.toi)}</span></div>
    </div>
    ${f.fix ? `<div class="sec-fix">${icon('wrench', 13)}<span><b>Correction :</b> ${esc(f.fix)}</span></div>` : ''}
    ${acc && acc.reason ? `<p class="nxs-acc-why">${icon('info', 12)} ${esc(acc.reason)}</p>` : ''}
    ${f.sev !== 'info' && target ? `<div class="nxs-find-a">${acc ? btn('Ne plus accepter', `data-nxs-unaccept="${esc(f.key)}"`, { ic: 'close' }) : btn('Accepter le risque', `data-nxs-accept="${esc(f.key)}"`, { ic: 'check' })}${f.url ? btn('Détail de la faille', `data-external="${esc(f.url)}"`, { ic: 'external' }) : ''}</div>` : ''}
  </div>`;
}

// Liste de constats regroupés par catégorie.
export function findingsHtml(report, accepted) {
  const groups = new Map();
  for (const f of report.findings || []) { if (!groups.has(f.cat)) groups.set(f.cat, []); groups.get(f.cat).push(f); }
  if (!groups.size) return `<p class="sup-none">${icon('pass', 14)} Aucun problème trouvé.</p>`;
  return [...groups].map(([cat, list]) => `<div class="nxs-cat"><h4>${esc(cat)} <small>${list.length}</small></h4>${list.map((f) => findingHtml(f, { target: report.target, accepted })).join('')}</div>`).join('');
}

// Fenêtre « Accepter le risque » : raison et durée.
export function acceptSheet(f) {
  const owner = 'nxs-accept';
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const el = sheet(owner, `<form class="sup-form" autocomplete="off">
      <div class="sheet-head"><span class="sheet-icon">${icon('check', 22)}</span><div><h2>Accepter ce risque</h2><p>${esc(f.title)}</p></div></div>
      <div class="sheet-body sup-form-body">
        <label class="field"><span>Pourquoi ? (gardé dans l’historique)</span><input class="input" name="reason" maxlength="300" placeholder="Ex. : géré par l’hébergeur, prévu au prochain lot…" data-autofocus></label>
        <label class="field"><span>Pendant</span><select class="input" name="days"><option value="30">30 jours</option><option value="90" selected>90 jours</option><option value="180">6 mois</option><option value="0">Sans limite</option></select></label>
        <p class="sup-note">Le constat reste visible, marqué « Risque accepté », et ne compte plus dans les tâches à faire. À la fin de la durée, il redevient actif.</p>
      </div>
      <div class="sheet-foot"><span class="grow"></span><button type="button" class="btn" data-c="no">Annuler</button><button type="submit" class="btn primary">Accepter</button></div>
    </form>`, { onClose: () => finish(null) });
    el.onclick = (ev) => { if (ev.target.closest('[data-c="no"]')) { closeSheet(owner); finish(null); } };
    el.querySelector('form').onsubmit = (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      finish({ reason: String(fd.get('reason') || '').trim(), days: Number(fd.get('days')) });
      closeSheet(owner);
    };
  });
}

// Branche les boutons « Accepter / Ne plus accepter » d'une zone ; `reload` redessine ensuite.
export function bindAccept(root, report, reload) {
  for (const b of root.querySelectorAll('[data-nxs-accept]')) b.onclick = async () => {
    const f = (report.findings || []).find((x) => x.key === b.dataset.nxsAccept);
    if (!f) return;
    const r = await acceptSheet(f);
    if (!r) return;
    try {
      await call('sec:accept', { target: report.target, key: f.key, title: f.title, reason: r.reason, days: r.days });
      toast('Risque accepté.');
      reload();
    } catch (err) { toast(err.message, { kind: 'bad' }); }
  };
  for (const b of root.querySelectorAll('[data-nxs-unaccept]')) b.onclick = async () => {
    try {
      await call('sec:accept-remove', { target: report.target, key: b.dataset.nxsUnaccept });
      toast('Le constat redevient actif.');
      reload();
    } catch (err) { toast(err.message, { kind: 'bad' }); }
  };
}

// Progression d'une analyse longue (évènements « sec:job » du processus principal).
export function progressHtml(label = 'Analyse en cours…') {
  return `<div class="sec-prog nxs-prog"><div class="spinner"></div><b data-nxs-step>${esc(label)}</b><div class="st-prog"><i data-nxs-bar></i></div></div>`;
}
export function followJob(root, job) {
  return api.on('sec:job', (p) => {
    if (p.job !== job) return;
    const s = root.querySelector('[data-nxs-step]');
    if (s && p.label) s.textContent = p.label;
    const b = root.querySelector('[data-nxs-bar]');
    if (b) b.style.width = `${Math.round((p.progress || 0) * 100)}%`;
  });
}

// Comparaison avec l'audit précédent.
export function compareHtml(c) {
  if (!c || !c.prev) return '';
  const d = c.delta || 0;
  const parts = [];
  if (c.added.length) parts.push(`<span class="nxs-cmp bad">${icon('warn', 12)}${c.added.length} nouveau${c.added.length > 1 ? 'x' : ''}</span>`);
  if (c.fixed.length) parts.push(`<span class="nxs-cmp good">${icon('check', 12)}${c.fixed.length} corrigé${c.fixed.length > 1 ? 's' : ''}</span>`);
  parts.push(`<span class="nxs-cmp">${c.still} toujours là</span>`);
  return `<div class="nxs-compare">
    <div class="nxs-cmp-t"><b>Depuis l’audit du ${esc(dateTime(c.prev.at))}</b><span class="${d > 0 ? 'good' : d < 0 ? 'bad' : 'muted'}">${d > 0 ? `note +${d}` : d < 0 ? `note ${d}` : 'note inchangée'} (${c.prev.score} → ${c.prev.score + d})</span></div>
    <div class="nxs-cmp-l">${parts.join('')}</div>
    ${c.added.length ? `<details><summary>Voir les nouveaux problèmes</summary><ul>${c.added.slice(0, 12).map((f) => `<li>${sevChip(f.sev)} ${esc(f.title)}</li>`).join('')}</ul></details>` : ''}
    ${c.fixed.length ? `<details><summary>Voir les problèmes corrigés</summary><ul>${c.fixed.slice(0, 12).map((f) => `<li>${icon('check', 12)} ${esc(f.title)}</li>`).join('')}</ul></details>` : ''}
  </div>`;
}

// Historique d'une cible : note dans le temps, un clic rouvre l'audit.
export function historyHtml(list, currentId) {
  if (!list || list.length < 1) return '';
  const pts = list.slice(0, 20).reverse();
  const w = 220; const h = 40;
  const xs = pts.map((_, i) => (pts.length === 1 ? w / 2 : (i / (pts.length - 1)) * (w - 8) + 4));
  const ys = pts.map((p) => h - 4 - (p.score / 100) * (h - 8));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  return `<div class="nxs-hist">
    <svg viewBox="0 0 ${w} ${h}" class="nxs-hist-svg" aria-hidden="true"><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${pts.map((p, i) => `<circle cx="${xs[i].toFixed(1)}" cy="${ys[i].toFixed(1)}" r="2.6" fill="var(--accent)"/>`).join('')}</svg>
    <div class="nxs-hist-l">${list.slice(0, 10).map((a) => `<button type="button" class="nxs-hist-i ${a.id === currentId ? 'on' : ''}" data-nxs-open="${esc(a.id)}"><b class="${toneOf(a.score)}">${a.score}</b><span>${esc(dateTime(a.at))}${a.scheduled ? ' · programmé' : ''}</span></button>`).join('')}</div>
  </div>`;
}

// Projets NEXORA (dossier, adresse).
export function projects() {
  return (Array.isArray(settings.projects) ? settings.projects : []).map((p) => ({ id: p.id, name: p.name || 'Projet', url: p.url || '', dir: p.dir || '' }));
}
export const currentProject = () => projects().find((p) => p.id === settings.projectCur) || null;
export const hostOf = (u) => { try { return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname; } catch { return ''; } };
export const baseName = (p) => String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop();

export function copyText(text) {
  return call('clipboard:write', String(text)).catch(() => (navigator.clipboard ? navigator.clipboard.writeText(String(text)) : null)).then(() => toast('Copié dans le presse-papiers.'));
}

// Fonction réservée à une offre : le processus principal refuse avec un message clair (fenêtre « offre requise »).
export const isPlanError = (err) => /offre|Standard|Pro\b|quota/i.test(String((err && err.message) || err));
