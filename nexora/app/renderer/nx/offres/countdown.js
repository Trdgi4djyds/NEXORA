// NEXORA #040 : abonnement payé, calendrier et minuteur de la période en cours (onglet « Offre et usage »).
//  - période : fin lue dans l'abonnement de l'espace (subscriptions.current_period_end, cloud.org.periodEnd) ;
//    l'abonnement ne garde pas son début : plus de 32 jours restants => période annuelle, sinon mensuelle ;
//  - anneau du temps restant (cadran à 60 graduations), minuteur jours / heures / minutes / secondes mis à jour
//    chaque seconde tant que la carte est affichée ;
//  - calendrier du mois (période surlignée, aujourd'hui, échéance), navigation entre les mois de la période ;
//  - rappel avant l'échéance (1, 3 ou 7 jours, ou jamais), gardé sur ce PC, et fichier .ics pour l'agenda.
import { ico, esc, toast, api } from '../core.js';

const DAY = 86400000;
const REMIND_KEY = 'nexora-offre-rappel';
const SEEN_KEY = 'nexora-offre-rappel-vu';
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const WEEK = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const pad = (n) => String(Math.max(0, n)).padStart(2, '0');
export const fullDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

// Période de l'abonnement de l'espace ; null sans date de fin (offre Gratuite, abonnement réglé à la main).
export function period(org) {
  if (!org || !org.periodEnd) return null;
  const end = new Date(org.periodEnd);
  if (Number.isNaN(end.getTime())) return null;
  const annual = end.getTime() - Date.now() > 32 * DAY;
  const start = new Date(end);
  if (annual) start.setFullYear(start.getFullYear() - 1); else start.setMonth(start.getMonth() - 1);
  return { start, end, annual, trial: org.subStatus === 'trialing', orgId: org.id };
}

function split(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}
// Jours restants affichés : jours entiers commencés (comme les essais des applications).
export const daysLeft = (p) => Math.max(0, Math.ceil((p.end.getTime() - Date.now()) / DAY));

// ------------------------------------------------------------------ cadran
const R = 74, C = 2 * Math.PI * R;
function dial() {
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * 2 * Math.PI - Math.PI / 2, big = i % 5 === 0;
    const r1 = big ? 84 : 86, r2 = 91;
    return `<line x1="${(100 + r1 * Math.cos(a)).toFixed(2)}" y1="${(100 + r1 * Math.sin(a)).toFixed(2)}" x2="${(100 + r2 * Math.cos(a)).toFixed(2)}" y2="${(100 + r2 * Math.sin(a)).toFixed(2)}" class="${big ? 'big' : ''}"/>`;
  }).join('');
  return `<svg class="nxo-dial" viewBox="0 0 200 200" aria-hidden="true">
    <defs><linearGradient id="nxoDialGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--nxo-c2, #ff4f9a)"/><stop offset="1" stop-color="var(--nxo-c, #3d7bff)"/></linearGradient></defs>
    <g class="nxo-dial-ticks">${ticks}</g>
    <circle class="nxo-dial-track" cx="100" cy="100" r="${R}"/>
    <circle class="nxo-dial-arc" data-nxo-arc cx="100" cy="100" r="${R}" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}" transform="rotate(-90 100 100)"/>
    <circle class="nxo-dial-dot" data-nxo-dot cx="100" cy="${100 - R}" r="5.5"/>
  </svg>`;
}

// ------------------------------------------------------------------ calendrier
const monthKey = (d) => d.getFullYear() * 12 + d.getMonth();
export function calendar(p, key) {
  const first = monthKey(p.start), last = monthKey(p.end);
  const k = Math.min(last, Math.max(first, key ?? monthKey(new Date())));
  const y = Math.floor(k / 12), m = k % 12;
  const start = dayStart(p.start).getTime(), end = dayStart(p.end).getTime(), today = dayStart(new Date()).getTime();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="nxo-day out"></span>');
  for (let d = 1; d <= n; d++) {
    const t = new Date(y, m, d).getTime(), col = (lead + d - 1) % 7;
    const cls = ['nxo-day'];
    if (t >= start && t <= end) cls.push('in', t < today ? 'past' : 'left');
    if (t === start) cls.push('start');
    if (t === end) cls.push('end');
    if (t === today) cls.push('today');
    if (col === 0 || d === 1) cls.push('row-a');
    if (col === 6 || d === n) cls.push('row-z');
    const tip = t === end ? `Échéance · ${fullDate(t)}` : t === today ? 'Aujourd’hui' : t === start ? 'Début de la période' : '';
    cells.push(`<span class="${cls.join(' ')}"${tip ? ` title="${esc(tip)}"` : ''}><b>${d}</b></span>`);
  }
  return `<div class="nxo-cal-head">
      <b>${MONTHS[m]} ${y}</b>
      <div class="nxo-cal-nav">
        <button type="button" class="nxo-round sm" data-nxo-cal="${k - 1}" ${k <= first ? 'disabled' : ''} title="Mois précédent" aria-label="Mois précédent">${ico('chevronLeft', 13)}</button>
        <button type="button" class="nxo-round sm" data-nxo-cal="${k + 1}" ${k >= last ? 'disabled' : ''} title="Mois suivant" aria-label="Mois suivant">${ico('chevronRight', 13)}</button>
      </div>
    </div>
    <div class="nxo-cal-grid">${WEEK.map((w) => `<i>${w}</i>`).join('')}${cells.join('')}</div>`;
}

// ------------------------------------------------------------------ rappel
export const remindDays = () => {
  const v = Number(localStorage.getItem(REMIND_KEY));
  return [0, 1, 3, 7].includes(v) && localStorage.getItem(REMIND_KEY) !== null ? v : 3;
};
function remindSeg() {
  const cur = remindDays();
  return `<div class="nxo-seg sm" role="radiogroup" aria-label="Me prévenir avant l’échéance">${[[1, '1 jour'], [3, '3 jours'], [7, '7 jours'], [0, 'Jamais']].map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === cur}" class="${v === cur ? 'on' : ''}" data-nxo-remind="${v}">${l}</button>`).join('')}</div>`;
}

// Notification au démarrage ou au changement d'offre : une fois par jour quand l'échéance approche.
export function remind(p, planName) {
  const n = remindDays();
  if (!p || !n) return;
  const left = p.end.getTime() - Date.now();
  if (left <= 0 || left > n * DAY) return;
  const seen = `${ymd(p.end)}|${ymd(new Date())}`;
  if (localStorage.getItem(SEEN_KEY) === seen) return;
  localStorage.setItem(SEEN_KEY, seen);
  const d = daysLeft(p);
  toast(`Votre offre ${planName} arrive à échéance ${d <= 1 ? 'demain' : `dans ${d} jours`}, le ${fullDate(p.end)}.`, { action: 'Voir', onAction: () => import('./upsell.js').then((m) => m.openAccount('plan')) });
}

// ------------------------------------------------------------------ agenda (.ics)
function ics(p, planName) {
  const n = remindDays() || 1;
  const next = new Date(dayStart(p.end).getTime() + DAY);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const text = `Votre offre NEXORA ${planName} arrive à échéance le ${fullDate(p.end)}.`;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NEXORA//Offre//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:nexora-offre-${p.orgId || 'compte'}-${ymd(p.end)}@nexora`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(p.end)}`, `DTEND;VALUE=DATE:${ymd(next)}`, `SUMMARY:Échéance de l’offre NEXORA ${planName}`, `DESCRIPTION:${text}`,
    'BEGIN:VALARM', `TRIGGER:-P${n}D`, 'ACTION:DISPLAY', `DESCRIPTION:${text}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}
async function addToAgenda(p, planName) {
  const body = ics(p, planName), name = `Échéance NEXORA ${planName}`;
  const desktop = /Electron/i.test(navigator.userAgent) && !window.__NEXORA_WEB__;
  if (desktop) {
    try {
      const f = await api.invoke('capture:save', { kind: 'document', project: 'Agenda', name, ext: 'ics', data: new TextEncoder().encode(body) });
      if (!f) return;
      await api.invoke('shell:open', f);
      toast('Rappel prêt : votre agenda s’ouvre pour l’ajouter.', { action: 'Afficher', onAction: () => api.invoke('shell:reveal', f) });
    } catch { toast('Impossible de préparer le rappel pour l’agenda.', { kind: 'bad' }); }
    return;
  }
  const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${name}.ics` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Rappel téléchargé : ouvrez le fichier pour l’ajouter à votre agenda.');
}

// ------------------------------------------------------------------ carte
export function card(p, { planName, plan }) {
  const total = Math.max(DAY, p.end - p.start);
  const over = p.end.getTime() <= Date.now();
  const state = over ? '<span class="nxo-tag bad">' + ico('clock', 11) + 'Échéance passée</span>'
    : p.trial ? '<span class="nxo-tag accent">' + ico('clock', 11) + 'Période d’essai</span>'
    : '<span class="nxo-tag ok">' + ico('check', 11) + 'Active</span>';
  const box = (k, l) => `<div class="nxo-tm"><b data-nxo-t="${k}">00</b><small>${l}</small></div>`;
  return `<section class="nxo-sub nxo-${esc(plan)}" data-nxo-sub data-start="${p.start.getTime()}" data-end="${p.end.getTime()}" data-total="${total}" data-plan-name="${esc(planName)}" data-org="${esc(p.orgId || '')}">
    <div class="nxo-sub-head">
      <span class="nxo-sub-ic">${ico('nxCalendar', 16)}</span>
      <div class="grow"><h3>Votre abonnement ${esc(planName)}</h3><p>Période ${p.annual ? 'annuelle' : 'mensuelle'} du ${esc(shortDate(p.start))} au ${esc(fullDate(p.end))}</p></div>
      ${state}
    </div>
    <div class="nxo-sub-grid">
      <div class="nxo-clock">
        <div class="nxo-dial-wrap">${dial()}
          <div class="nxo-dial-mid"><b data-nxo-days>${daysLeft(p)}</b><span data-nxo-days-lb>${daysLeft(p) > 1 ? 'jours restants' : 'jour restant'}</span><small>jusqu’au ${esc(shortDate(p.end))}</small></div>
        </div>
        <div class="nxo-timer" aria-live="off">${box('d', 'jours')}<i>:</i>${box('h', 'heures')}<i>:</i>${box('m', 'min')}<i>:</i>${box('s', 's')}</div>
        <div class="nxo-sub-prog"><i class="nxo-bar"><em data-nxo-prog style="width:0%"></em></i><small data-nxo-prog-lb></small></div>
      </div>
      <div class="nxo-cal" data-nxo-cal-root>${calendar(p)}</div>
    </div>
    <div class="nxo-cal-legend"><span><i class="lg-left"></i>Jours restants</span><span><i class="lg-past"></i>Jours écoulés</span><span><i class="lg-today"></i>Aujourd’hui</span><span><i class="lg-end"></i>Échéance</span></div>
    <div class="nxo-sub-foot">
      <div class="nxo-remind"><span>${ico('bell', 13)} Me prévenir avant l’échéance</span>${remindSeg()}</div>
      <button type="button" class="nxo-link" data-nxo-ics><span class="nxo-round">${ico('nxArrowUpRight', 13)}</span>Ajouter à mon agenda</button>
    </div>
  </section>`;
}

function periodOf(el) {
  return { start: new Date(Number(el.dataset.start)), end: new Date(Number(el.dataset.end)), orgId: el.dataset.org };
}

// Mise à jour du minuteur, de l'anneau et de la jauge (toutes les cartes affichées).
function paint() {
  const cards = document.querySelectorAll('[data-nxo-sub]');
  for (const el of cards) {
    const end = Number(el.dataset.end), total = Number(el.dataset.total), now = Date.now();
    const left = Math.max(0, end - now), t = split(left), frac = Math.min(1, left / total);
    for (const k of ['d', 'h', 'm', 's']) { const b = el.querySelector(`[data-nxo-t="${k}"]`); if (b) b.textContent = k === 'd' ? String(t.d).padStart(2, '0') : pad(t[k]); }
    const days = Math.max(0, Math.ceil(left / DAY));
    const dn = el.querySelector('[data-nxo-days]'); if (dn && dn.textContent !== String(days)) dn.textContent = String(days);
    const dl = el.querySelector('[data-nxo-days-lb]'); if (dl) dl.textContent = left <= 0 ? 'échéance passée' : days > 1 ? 'jours restants' : 'jour restant';
    const arc = el.querySelector('[data-nxo-arc]'); if (arc) arc.setAttribute('stroke-dashoffset', (C * (1 - frac)).toFixed(2));
    const dot = el.querySelector('[data-nxo-dot]');
    if (dot) { const a = frac * 2 * Math.PI - Math.PI / 2; dot.setAttribute('cx', (100 + R * Math.cos(a)).toFixed(2)); dot.setAttribute('cy', (100 + R * Math.sin(a)).toFixed(2)); dot.style.opacity = frac > 0 ? '1' : '0'; }
    const totalDays = Math.max(1, Math.round(total / DAY)), done = Math.min(totalDays, Math.max(1, totalDays - days + (left > 0 ? 1 : 0)));
    const pg = el.querySelector('[data-nxo-prog]'); if (pg) pg.style.width = `${((1 - frac) * 100).toFixed(2)}%`;
    const pl = el.querySelector('[data-nxo-prog-lb]'); if (pl) pl.textContent = left > 0 ? `Jour ${done} sur ${totalDays} · ${Math.round((1 - frac) * 100)} % de la période écoulée` : 'Période terminée';
  }
  // Essais des applications de l'App Builder : temps restant et jauge.
  const trials = document.querySelectorAll('[data-nxo-until]');
  for (const el of trials) {
    const end = Number(el.dataset.nxoUntil), from = Number(el.dataset.from) || end - 7 * DAY, left = Math.max(0, end - Date.now()), t = split(left);
    const em = el.querySelector('em'); if (em) em.style.width = `${Math.min(100, ((Date.now() - from) / Math.max(1, end - from)) * 100).toFixed(2)}%`;
    const sp = el.querySelector('span'); if (sp) sp.textContent = left > 0 ? `${t.d} j ${pad(t.h)} h ${pad(t.m)} min ${pad(t.s)} s avant la fin de l’essai` : 'Essai terminé';
  }
  return cards.length + trials.length;
}

let ticker = 0, since = 0;
// Démarre le minuteur ; il s'arrête seul quand plus aucune carte n'est affichée (onglet ou fenêtre fermés).
export function start() {
  since = Date.now();
  if (ticker) return;
  const tick = () => { if (!paint() && Date.now() - since > 4000) { clearInterval(ticker); ticker = 0; } };
  ticker = setInterval(tick, 1000);
  requestAnimationFrame(tick);
}

export function onClick(e) {
  const nav = e.target.closest('[data-nxo-cal]');
  if (nav) {
    const root = nav.closest('[data-nxo-sub]'), host = root && root.querySelector('[data-nxo-cal-root]');
    if (host) host.innerHTML = calendar(periodOf(root), Number(nav.dataset.nxoCal));
    return true;
  }
  const rem = e.target.closest('[data-nxo-remind]');
  if (rem) {
    const v = Number(rem.dataset.nxoRemind);
    localStorage.setItem(REMIND_KEY, String(v));
    localStorage.removeItem(SEEN_KEY);
    for (const b of rem.parentElement.querySelectorAll('[data-nxo-remind]')) { const on = b === rem; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
    toast(v ? `Vous serez prévenu ${v === 1 ? 'la veille' : `${v} jours avant`} de l’échéance.` : 'Plus de rappel avant l’échéance.');
    return true;
  }
  const add = e.target.closest('[data-nxo-ics]');
  if (add) {
    const root = add.closest('[data-nxo-sub]');
    if (root) addToAgenda(periodOf(root), root.dataset.planName || 'NEXORA');
    return true;
  }
  return false;
}
