// NEXORA #037 : onglet « Offre et usage » de la fenêtre Mon compte (crochet globalThis.__nxOffres.panel dans
// chunk-EOM7FQDL.js). Ton offre, ton usage (quotas comptés par le serveur), essais des applications, trois
// cartes d'offre (mensuel ou annuel) et tableau comparatif. Les boutons « Passer à… » gardent l'attribut
// data-plan-ask : la demande part au support comme avant (chunk-EOM7FQDL.js).
// NEXORA #087 : applications Android et Windows de l'offre Gratuite (2 au total, supprimées comprises), constructions
// comptées par application, chiffres clés des cartes (planKeys) et adresse de contact.
// NEXORA #090 : parrainage (NEXORA REFERRAL) : carte « Un parrain t'a invité ? » (code promo du parrain, rattachement
// définitif) ou « Parrainage actif », et prix de Pro avec la remise (prix sans remise barré).
import { ico, esc, toast } from '../core.js';
import { cloud, status, plans, appTrials, referral, attachReferral, missing } from './status.js';
import { COMPARE, CONTACT_EMAIL, METERS, PLAN_LOOK, PLAN_ORDER, REFERRAL, discounted, limitText, money, count, percent, normPlan, planKeys } from './catalog.js';
import { period, fullDate, card as subCard, start as startCountdown, onClick as countdownClick } from './countdown.js';

const longDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '');

function meter([key, label, unit, scope, icon], s) {
  const per = Number((s.limits || {}).builds_per_app_month);
  // NEXORA #087 : constructions limitées par application : la limite affichée est celle d'une application.
  if (key === 'builds_month' && per > 0 && !s.admin) {
    const used = Number((s.usage || {})[key] || 0);
    return `<div class="nxo-meter"><div class="nxo-meter-top"><span class="nxo-meter-ic">${ico(icon, 13)}</span><span class="nxo-meter-lb">${esc(label)}</span></div>
      <div class="nxo-meter-val"><b>${count(used)}</b><span>· ${count(per)} par application</span></div><i class="nxo-bar"><em style="width:0%"></em></i></div>`;
  }
  const lim = Number((scope === 'org' ? s.org_limits || s.limits : s.limits)[key]);
  const used = Number((s.usage || {})[key] || 0);
  const off = lim === 0, unl = !(lim >= 0) || s.admin;
  const pct = off || unl ? 0 : Math.min(100, (used / Math.max(1, lim)) * 100);
  const tone = off ? 'off' : pct >= 100 ? 'full' : pct >= 80 ? 'hot' : '';
  const value = off ? `<b>${ico('lock', 11)} Non inclus</b>` : `<b>${count(used)}${unit ? ` ${unit}` : ''}</b><span>/ ${unl ? 'illimité' : limitText(lim, unit)}</span>`;
  return `<div class="nxo-meter ${tone}"><div class="nxo-meter-top"><span class="nxo-meter-ic">${ico(icon, 13)}</span><span class="nxo-meter-lb">${esc(label)}</span></div>
    <div class="nxo-meter-val">${value}</div><i class="nxo-bar"><em style="width:${pct.toFixed(1)}%"></em></i></div>`;
}

function trialRows(t, s) {
  if (!t || t.unavailable || !t.apps) return '';
  // NEXORA #087 : limite à vie : les applications supprimées restent comptées, donc affichées.
  const lifetime = !!t.lifetime && !s.admin;
  const list = Object.values(t.apps).filter((a) => !a.deleted || lifetime).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const free = Number(t.trial_days) > 0 && !s.admin;
  if (!list.length && !free && !lifetime) return '';
  const per = Number(t.builds_limit);
  const tag = (a) => (a.deleted ? `<span class="nxo-tag">${ico('trash', 11)}Supprimée · comptée</span>`
    : a.status === 'trial' ? `<span class="nxo-tag ok">${ico('clock', 11)}Essai · encore ${a.days_left} j</span>`
    : a.status === 'expired' ? `<span class="nxo-tag bad">${ico('lock', 11)}Essai terminé</span>`
    : a.status === 'plan' ? `<span class="nxo-tag bad">${ico('lock', 11)}Verrouillée</span>`
    : per > 0 ? `<span class="nxo-tag${Number(a.builds_month) >= per ? ' bad' : ''}">${ico('wrench', 11)}${count(a.builds_month || 0)} / ${count(per)} constructions ce mois-ci</span>`
    : `<span class="nxo-tag">${ico('check', 11)}Active</span>`);
  // NEXORA #040 : minuteur de l'essai (mis à jour chaque seconde par countdown.js).
  const until = (a) => {
    if (a.status !== 'trial' || !a.trial_ends_at) return '';
    const end = new Date(a.trial_ends_at).getTime(), begin = a.created_at ? new Date(a.created_at).getTime() : end - (Number(t.trial_days) || 7) * 86400000;
    return `<div class="nxo-trial-cd" data-nxo-until="${end}" data-from="${begin}"><i class="nxo-bar"><em style="width:0%"></em></i><small>${ico('clock', 11)}<span>…</span></small></div>`;
  };
  const intro = lifetime
    ? `Offre Gratuite : <b>${t.used} sur ${t.limit}</b> applications utilisées, Android ou Windows, applications supprimées comprises. Une application compte dès sa première construction, puis dispose de <b>${count(per > 0 ? per : 5)} constructions par mois</b>.`
    : free ? `Offre Gratuite : <b>${t.used} sur ${t.limit}</b> applications d’essai utilisées. Chaque application créée depuis l’adresse d’un site accessible reste utilisable <b>${t.trial_days} jours</b>, puis elle est verrouillée.`
    : 'Ton offre n’a pas de limite par application : tes applications restent actives.';
  return `<section class="nxc-card nxo-trials">
    <div class="nxc-card-head"><span class="nxc-card-ic">${ico('android', 15)}</span><div><h3>Tes applications</h3>
    <p>${intro}</p></div></div>
    ${list.length ? `<div class="nxo-trial-list">${list.map((a) => `<div class="nxo-trial"><b>${esc(a.name || 'Application')}</b><small>${a.platform === 'windows' ? 'Logiciel Windows' : 'Application Android'} · ${a.source_kind === 'url' ? 'adresse web' : 'dossier ou code'} · créée le ${esc(longDate(a.created_at))}${a.trial_ends_at ? ` · fin d’essai le ${esc(longDate(a.trial_ends_at))}` : ''}</small>${tag(a)}${until(a)}</div>`).join('')}</div>` : '<p class="nx-muted small">Aucune application construite pour l’instant.</p>'}
  </section>`;
}

// NEXORA #040 : cartes de tarifs (en-tête en dégradé doux, gros prix, bouton plein, avantages cochés).
function planCard(p, s, ref) {
  const id = normPlan(p.id), look = PLAN_LOOK[id] || PLAN_LOOK.standard;
  const cur = id === s.plan, rank = PLAN_ORDER.indexOf(id), mine = PLAN_ORDER.indexOf(s.plan);
  // NEXORA #090 : filleul d'un parrain : prix de Pro avec la remise, prix sans remise barré.
  const refOn = id === 'pro' && !!(ref && ref.referred) && p.price_month_cents > 0;
  const pct = refOn ? Number(ref.discount_pct) || REFERRAL.discount_pct : 0;
  const listM = p.price_month_cents, listY = p.price_year_cents;
  const m = refOn ? discounted(listM, pct) : listM, y = refOn ? discounted(listY, pct) : listY;
  const perMonthYear = y ? Math.round(y / 12) : 0;
  const lim = p.limits || {};
  const rec = id === 'standard';
  const keys = planKeys(lim);
  if (lim.app_trial_days > 0) keys[1] += ` · essai ${lim.app_trial_days} j`;
  const cta = cur ? `<span class="nxo-btn current">${ico('check', 13)}Ton offre actuelle</span>`
    : !cloud.user ? `<button type="button" class="nxo-btn ${rec ? 'primary' : 'soft'}" data-nxo-login>Se connecter pour choisir</button>`
    : rank > mine ? `<button type="button" class="nxo-btn primary" data-plan-ask="${esc(p.id)}">Passer à ${esc(p.name)}${ico('nxArrowRight', 14)}</button>`
    : `<button type="button" class="nxo-btn soft" data-plan-ask="${esc(p.id)}">Revenir à ${esc(p.name)}</button>`;
  const amt = (c) => esc(money(c).replace(' $', ''));
  const billM = m ? 'facturé chaque mois' : 'pour toujours';
  const billY = y ? `${esc(money(y))} une fois par an` : 'pour toujours';
  return `<div class="nxo-plan-wrap nxo-${esc(id)}${rec ? ' rec' : ''}">
    ${rec ? `<div class="nxo-rec">${ico('bolt', 13)}${esc(p.badge || 'Le plus choisi')}</div>` : ''}
    <article class="nxo-plan nxo-${esc(id)}${cur ? ' on' : ''}" data-nxo-plan="${esc(id)}">
      <div class="nxo-plan-head">
        <div class="nxo-plan-name">
          <span class="nxo-medal nxo-${esc(id)} sm">${ico(look.icon, 14)}</span>
          <b class="nxo-name">${esc(p.name)}</b>
          <span class="grow"></span>
          ${cur ? `<span class="nxo-pill ink">${ico('check', 10)}Ton offre</span>` : p.badge && !rec ? `<span class="nxo-pill">${esc(p.badge)}</span>` : ''}
        </div>
        <div class="nxo-price${refOn ? ' ref' : ''}">
          <span class="nxo-amt" data-m="${amt(m)}" data-y="${amt(perMonthYear)}">${amt(m)}</span><span class="nxo-cur">$</span>
          <span class="nxo-per"><b>par mois</b><small class="nxo-bill" data-m="${billM}" data-y="${billY}">${billM}</small></span>
        </div>
        ${refOn ? `<div class="nxo-ref-price"><s class="nxo-was" data-m="${esc(money(listM))}" data-y="${esc(money(Math.round(listY / 12)))}">${esc(money(listM))}</s><span class="nxo-pill nxo-ref-pill">${ico('gift', 11)}−${esc(percent(pct))} % parrainage</span></div>` : ''}
        <p class="nxo-plan-desc">${esc(p.description || '')}</p>
        ${cta}
      </div>
      <div class="nxo-plan-body">
        <div class="nxo-keys">${keys.map((k) => `<span>${esc(k)}</span>`).join('')}</div>
        <ul class="nxo-feats">${(p.features || []).map((f) => `<li>${ico('nxCheckCircle', 16)}<span>${esc(f)}</span></li>`).join('')}</ul>
        <button type="button" class="nxo-more" data-nxo-scroll="#nxoCompare">Besoin de plus de détails ?</button>
      </div>
    </article>
  </div>`;
}

// NEXORA #090 : code promo d'un parrain (compte sans abonnement payé), ou parrainage déjà actif.
const REF_REFUSED = {
  unknown: 'Ce code n’existe pas ou n’est plus actif : vérifie-le auprès de ton parrain.',
  self: 'Tu ne peux pas utiliser ton propre code de parrainage.',
  customer: 'Le parrainage s’applique à un premier abonnement Pro.',
};
function referralCard(ref) {
  if (!cloud.user || !ref) return '';
  const pct = Number(ref.discount_pct) || REFERRAL.discount_pct;
  const head = (title, text) => `<div class="nxc-card-head"><span class="nxc-card-ic">${ico('gift', 15)}</span><div><h3>${title}</h3><p>${text}</p></div></div>`;
  if (ref.referred) {
    return `<section class="nxc-card nxo-ref on">${head('Parrainage actif', `Code <b>${esc(ref.code)}</b>${ref.partner ? ` de ${esc(ref.partner)}` : ''} : ${esc(percent(pct))} % de remise sur chaque paiement Pro, soit <b>${esc(money(ref.month_cents))}</b> par mois ou <b>${esc(money(ref.year_cents))}</b> par an, tant que ton abonnement continue.`)}</section>`;
  }
  if (!ref.eligible) return '';
  return `<section class="nxc-card nxo-ref">${head('Un parrain t’a invité ?', `Saisis son code promo : ${esc(percent(pct))} % de remise sur chaque paiement Pro (${esc(money(ref.month_cents))} par mois au lieu de ${esc(money(ref.list_month_cents))}), tant que ton abonnement continue. Un seul parrain par compte.`)}
    <div class="nxo-ref-form"><input class="nxo-ref-input" data-nxo-ref-input maxlength="24" placeholder="Code promo du parrain" autocomplete="off" spellcheck="false" aria-label="Code promo du parrain"><button type="button" class="nxo-btn primary small" data-nxo-ref-apply>Appliquer</button></div>
    <p class="nxo-ref-msg" role="alert" hidden></p></section>`;
}
async function applyReferral(btn) {
  const box = btn.closest('.nxo-ref');
  const input = box && box.querySelector('[data-nxo-ref-input]');
  const msg = box && box.querySelector('.nxo-ref-msg');
  if (!input || !msg) return;
  const show = (text) => { msg.hidden = false; msg.textContent = text; };
  const code = input.value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{2,23}$/.test(code)) { show('Un code promo compte de 3 à 24 lettres, chiffres ou tirets.'); input.focus(); return; }
  btn.disabled = true;
  try {
    const r = await attachReferral(code);
    if (!r || r.ok === false) { show(REF_REFUSED[r && r.reason] || REF_REFUSED.unknown); return; }
    const root = btn.closest('.nxo');
    if (root) root.outerHTML = await panel();
    toast(`Code ${r.code || code.toUpperCase()} appliqué : ${percent(r.discount_pct || REFERRAL.discount_pct)} % de remise sur Pro.`);
  } catch (e) {
    show(missing(e) ? 'Le parrainage arrive très bientôt sur ton compte : réessaie plus tard.' : (e && e.message) || 'Le code n’a pas pu être appliqué.');
  } finally { btn.disabled = false; }
}
// Entrée dans le champ du code : comme « Appliquer ».
export function onKey(e) {
  if (e.key !== 'Enter' || !e.target || !e.target.matches || !e.target.matches('[data-nxo-ref-input]')) return false;
  e.preventDefault();
  const b = e.target.closest('.nxo-ref').querySelector('[data-nxo-ref-apply]');
  if (b && !b.disabled) applyReferral(b);
  return true;
}

function cell(row, p) {
  const id = normPlan(p.id);
  if (row.text) return `<span class="nxo-txt">${esc(row.text[id] || '—')}</span>`;
  if (row.perm) return p.perms && p.perms[row.perm] ? `<span class="nxo-yes" title="Inclus">${ico('check', 13)}</span>` : '<span class="nxo-no" title="Non inclus">—</span>';
  const v = (p.limits || {})[row.limit];
  const t = Number(v) === 0 ? '<span class="nxo-no">—</span>' : `<span class="nxo-txt">${esc(limitText(v, row.unit))}</span>`;
  return row.note && row.note[id] ? `${t}<small>${esc(row.note[id])}</small>` : t;
}
function compare(list, s) {
  const cols = list.map((p) => `<th class="${normPlan(p.id) === 'standard' ? 'hl' : ''}${normPlan(p.id) === s.plan ? ' mine' : ''}"><b>${esc(p.name)}</b><small>${p.price_month_cents ? `${esc(money(p.price_month_cents))} / mois` : 'Gratuit'}</small></th>`).join('');
  const body = COMPARE.map(([group, rows]) => `<tr class="nxo-grp"><th colspan="${list.length + 1}">${esc(group)}</th></tr>${rows.map((r) => `<tr><th>${esc(r.label)}</th>${list.map((p) => `<td class="${normPlan(p.id) === 'standard' ? 'hl' : ''}">${cell(r, p)}</td>`).join('')}</tr>`).join('')}`).join('');
  return `<section class="nxc-card nxo-compare" id="nxoCompare"><div class="nxc-card-head"><span class="nxc-card-ic">${ico('layers', 15)}</span><div><h3>Comparer les offres</h3><p>Tout ce que comprend chaque offre, limite par limite.</p></div></div>
    <div class="nxo-table-wrap"><table class="nxo-table"><thead><tr><th></th>${cols}</tr></thead><tbody>${body}</tbody></table></div></section>`;
}

export async function panel() {
  const [s, list, t, ref] = await Promise.all([status(true), plans(), appTrials(true).catch(() => null), referral().catch(() => null)]);
  const look = PLAN_LOOK[s.plan] || PLAN_LOOK.free;
  const next = list.find((p) => PLAN_ORDER.indexOf(normPlan(p.id)) === PLAN_ORDER.indexOf(s.plan) + 1);
  const org = cloud.org;
  const orgPlan = s.org_plan && normPlan(s.org_plan) !== s.plan ? ` · espace en offre ${esc(s.org_plan_name || s.org_plan)}` : '';
  const cur = list.find((p) => normPlan(p.id) === s.plan) || {};
  const name = s.plan_name || cur.name || 'Gratuit';
  const resets = 'Les compteurs du jour repartent chaque jour, ceux du mois le 1ᵉʳ du mois.';
  // NEXORA #040 : offre payée avec une date d'échéance => calendrier et minuteur de la période.
  const per = s.plan !== 'free' ? period(org) : null;
  if (per) setTimeout(startCountdown, 0);
  else if (t && t.apps && Object.values(t.apps).some((a) => a.status === 'trial')) setTimeout(startCountdown, 0);
  return `<div class="nxo" data-period="month">
    <section class="nxo-now nxo-${esc(s.plan)}">
      <span class="nxo-now-art" aria-hidden="true">${ico(look.icon, 150)}</span>
      <div class="nxo-now-main">
        <small class="nxo-kicker">${ico('star', 12)} Ton offre</small>
        <h3>${esc(name)}<span class="nxo-now-price">${cur.price_month_cents ? `${esc(money(normPlan(cur.id) === 'pro' && ref && ref.referred ? ref.month_cents : cur.price_month_cents))} / mois` : '0 $ / mois'}</span></h3>
        <p>${org ? `${esc(org.name)}${orgPlan}` : 'Compte invité'}${per ? ` · échéance le ${esc(fullDate(per.end))}` : ''}</p>
        ${s.admin ? `<div class="nxo-chips"><span class="nxo-chip">${ico('lock', 12)}Administrateur NEXORA : aucune limite</span></div>` : ''}
      </div>
      <div class="nxo-now-acts">
        ${next && cloud.user ? `<button type="button" class="nxo-btn light" data-plan-ask="${esc(next.id)}">Passer à ${esc(next.name)}${ico('nxArrowRight', 14)}</button>` : ''}
        ${!cloud.user ? '<button type="button" class="nxo-btn light" data-nxo-login>Se connecter</button>' : ''}
        <button type="button" class="nxo-link on-color" data-nxo-scroll="#nxoCompare">Comparer les offres<span class="nxo-round">${ico('nxArrowUpRight', 13)}</span></button>
      </div>
    </section>
    ${per ? subCard(per, { planName: name, plan: s.plan }) : ''}
    <section class="nxc-card nxo-usage">
      <div class="nxc-card-head"><span class="nxc-card-ic">${ico('sync', 15)}</span><div><h3>Ton usage</h3><p>${esc(resets)}</p></div></div>
      <div class="nxo-meters">${METERS.map((m) => meter(m, s)).join('')}</div>
    </section>
    ${trialRows(t, s)}
    <div class="nxo-choose">
      <span class="nxo-eyebrow">${ico('star', 12)}Offres</span>
      <h3>Choisis ton offre</h3>
      <p>Change d’offre à tout moment. Prix en dollars américains, hors taxes locales.</p>
      <div class="nxo-period" role="tablist" aria-label="Période de facturation">
        <button type="button" role="tab" class="on" data-nxo-period="month" aria-selected="true">Mensuel</button>
        <button type="button" role="tab" data-nxo-period="year" aria-selected="false" title="Annuel : 2 mois offerts">Annuel<em>2 mois offerts</em></button>
      </div>
    </div>
    <div class="nxo-plans">${list.map((p) => planCard(p, s, ref)).join('')}</div>
    ${referralCard(ref)}
    ${compare(list, s)}
    <p class="nxo-foot">${ico('chat', 12)} Change d’offre à tout moment : ta demande est traitée par l’équipe NEXORA et ta nouvelle offre est activée sous 24 h${ref && ref.referred ? ', remise du parrainage comprise' : ''}. Une question : ${esc(CONTACT_EMAIL)}.</p>
  </div>`;
}

export function onClick(e) {
  if (countdownClick(e)) return true;
  const per = e.target.closest('[data-nxo-period]');
  if (per) {
    const root = per.closest('.nxo');
    const y = per.dataset.nxoPeriod === 'year';
    root.dataset.period = y ? 'year' : 'month';
    for (const b of root.querySelectorAll('[data-nxo-period]')) { b.classList.toggle('on', b === per); b.setAttribute('aria-selected', String(b === per)); }
    for (const a of root.querySelectorAll('.nxo-amt, .nxo-bill, .nxo-was')) a.textContent = y ? a.dataset.y : a.dataset.m;
    return true;
  }
  const ap = e.target.closest('[data-nxo-ref-apply]');
  if (ap) { if (!ap.disabled) applyReferral(ap); return true; }
  const sc = e.target.closest('[data-nxo-scroll]');
  if (sc) { const t = document.querySelector(sc.dataset.nxoScroll); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return true; }
  return false;
}
