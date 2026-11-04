// NEXORA #037 : onglet « Offre et usage » de la fenêtre Mon compte (crochet globalThis.__nxOffres.panel dans
// chunk-EOM7FQDL.js). Ton offre, ton usage (quotas comptés par le serveur), essais des applications, trois
// cartes d'offre (mensuel ou annuel) et tableau comparatif. Les boutons « Passer à… » gardent l'attribut
// data-plan-ask : la demande part au support comme avant (chunk-EOM7FQDL.js).
import { ico, esc } from '../core.js';
import { cloud, status, plans, appTrials } from './status.js';
import { COMPARE, METERS, PLAN_LOOK, PLAN_ORDER, limitText, money, count, normPlan } from './catalog.js';

const longDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '');

function meter([key, label, unit, scope, icon], s) {
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
  const list = Object.values(t.apps).filter((a) => !a.deleted).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const free = Number(t.trial_days) > 0 && !s.admin;
  if (!list.length && !free) return '';
  const tag = (a) => (a.status === 'trial' ? `<span class="nxo-tag ok">${ico('clock', 11)}Essai · encore ${a.days_left} j</span>`
    : a.status === 'expired' ? `<span class="nxo-tag bad">${ico('lock', 11)}Essai terminé</span>`
    : a.status === 'plan' ? `<span class="nxo-tag bad">${ico('lock', 11)}Verrouillée</span>`
    : `<span class="nxo-tag">${ico('check', 11)}Active</span>`);
  return `<section class="nxc-card nxo-trials">
    <div class="nxc-card-head"><span class="nxc-card-ic">${ico('android', 15)}</span><div><h3>Applications de l’App Builder</h3>
    <p>${free ? `Offre Gratuite : <b>${t.used} sur ${t.limit}</b> applications d’essai utilisées. Chaque application créée depuis l’adresse d’un site accessible reste utilisable <b>${t.trial_days} jours</b>, puis elle est verrouillée.` : 'Ton offre n’a pas de limite d’essai : tes applications restent actives.'}</p></div></div>
    ${list.length ? `<div class="nxo-trial-list">${list.map((a) => `<div class="nxo-trial"><b>${esc(a.name || 'Application')}</b><small>${a.source_kind === 'url' ? 'Adresse web' : 'Dossier ou code'} · créée le ${esc(longDate(a.created_at))}${a.trial_ends_at ? ` · fin d’essai le ${esc(longDate(a.trial_ends_at))}` : ''}</small>${tag(a)}</div>`).join('')}</div>` : '<p class="nx-muted small">Aucune application créée pour l’instant.</p>'}
  </section>`;
}

function planCard(p, s) {
  const id = normPlan(p.id), look = PLAN_LOOK[id] || PLAN_LOOK.standard;
  const cur = id === s.plan, rank = PLAN_ORDER.indexOf(id), mine = PLAN_ORDER.indexOf(s.plan);
  const m = p.price_month_cents, y = p.price_year_cents;
  const perMonthYear = y ? Math.round(y / 12) : 0;
  const lim = p.limits || {};
  const keys = [`${limitText(lim.projects)} projets`, `${limitText(lim.apps)} apps${lim.app_trial_days > 0 ? ` · essai ${lim.app_trial_days} j` : ''}`, `${limitText(lim.ai_requests_month)} IA / mois`];
  const cta = cur ? `<span class="nxo-btn current">${ico('check', 13)}Ton offre actuelle</span>`
    : !cloud.user ? `<button type="button" class="nxo-btn ${id === 'standard' ? 'primary' : ''}" data-nxo-login>Se connecter pour choisir</button>`
    : rank > mine ? `<button type="button" class="nxo-btn ${id === 'standard' || id === 'pro' ? 'primary' : ''}" data-plan-ask="${esc(p.id)}">Passer à ${esc(p.name)}${ico('nxArrowRight', 14)}</button>`
    : `<button type="button" class="nxo-btn ghost" data-plan-ask="${esc(p.id)}">Revenir à ${esc(p.name)}</button>`;
  return `<article class="nxo-plan nxo-${esc(id)}${cur ? ' on' : ''}" data-nxo-plan="${esc(id)}">
    <div class="nxo-plan-top">
      <span class="nxo-medal nxo-${esc(id)}">${ico(look.icon, 18)}</span>
      <div class="nxo-plan-name"><b>${esc(p.name)}</b>${p.badge ? `<span class="nxo-ribbon">${esc(p.badge)}</span>` : ''}</div>
    </div>
    <div class="nxo-price">
      <span class="nxo-amt" data-m="${esc(money(m).replace(' $', ''))}" data-y="${esc(money(perMonthYear).replace(' $', ''))}">${esc(money(m).replace(' $', ''))}</span><span class="nxo-cur">$</span><span class="nxo-per">/ mois</span>
    </div>
    <small class="nxo-bill" data-m="${m ? 'Facturé chaque mois, sans engagement' : 'Gratuit, pour toujours'}" data-y="${y ? `${esc(money(y))} facturés une fois par an` : 'Gratuit, pour toujours'}">${m ? 'Facturé chaque mois, sans engagement' : 'Gratuit, pour toujours'}</small>
    <p class="nxo-plan-desc">${esc(p.description || '')}</p>
    ${cta}
    <div class="nxo-keys">${keys.map((k) => `<span>${esc(k)}</span>`).join('')}</div>
    <ul class="nxo-feats">${(p.features || []).map((f) => `<li>${ico('check', 12)}<span>${esc(f)}</span></li>`).join('')}</ul>
  </article>`;
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
  const [s, list, t] = await Promise.all([status(true), plans(), appTrials(true).catch(() => null)]);
  const look = PLAN_LOOK[s.plan] || PLAN_LOOK.free;
  const next = list.find((p) => PLAN_ORDER.indexOf(normPlan(p.id)) === PLAN_ORDER.indexOf(s.plan) + 1);
  const org = cloud.org;
  const orgPlan = s.org_plan && normPlan(s.org_plan) !== s.plan ? ` · espace en offre ${esc(s.org_plan_name || s.org_plan)}` : '';
  const cur = list.find((p) => normPlan(p.id) === s.plan) || {};
  const resets = 'Les compteurs du jour repartent chaque jour, ceux du mois le 1ᵉʳ du mois.';
  return `<div class="nxo" data-period="month">
    <section class="nxo-now nxo-${esc(s.plan)}">
      <span class="nxo-medal nxo-${esc(s.plan)} lg">${ico(look.icon, 24)}</span>
      <div class="nxo-now-main">
        <small class="nxo-kicker">${ico('star', 12)} Ton offre</small>
        <h3>${esc(s.plan_name || cur.name || 'Gratuit')}<span class="nxo-now-price">${cur.price_month_cents ? `${esc(money(cur.price_month_cents))} / mois` : '0 $ / mois'}</span></h3>
        <p>${org ? `${esc(org.name)}${orgPlan}` : 'Compte invité'}${org && org.periodEnd ? ` · renouvellement le ${esc(longDate(org.periodEnd))}` : ''}</p>
        ${s.admin ? `<div class="nxo-chips"><span class="nxo-chip accent">${ico('lock', 12)}Administrateur NEXORA : aucune limite</span></div>` : ''}
      </div>
      <div class="nxo-now-acts">
        ${next && cloud.user ? `<button type="button" class="nxo-btn primary" data-plan-ask="${esc(next.id)}">Passer à ${esc(next.name)}${ico('nxArrowRight', 14)}</button>` : ''}
        ${!cloud.user ? '<button type="button" class="nxo-btn primary" data-nxo-login>Se connecter</button>' : ''}
        <button type="button" class="nxo-btn ghost" data-nxo-scroll="#nxoCompare">Comparer les offres</button>
      </div>
    </section>
    <section class="nxc-card nxo-usage">
      <div class="nxc-card-head"><span class="nxc-card-ic">${ico('sync', 15)}</span><div><h3>Ton usage</h3><p>${esc(resets)}</p></div></div>
      <div class="nxo-meters">${METERS.map((m) => meter(m, s)).join('')}</div>
    </section>
    ${trialRows(t, s)}
    <div class="nxo-choose">
      <div><h3>Choisis ton offre</h3><p>Change d’offre à tout moment. Prix en dollars américains, hors taxes locales.</p></div>
      <div class="nxo-period" role="tablist" aria-label="Période de facturation">
        <button type="button" role="tab" class="on" data-nxo-period="month" aria-selected="true">Mensuel</button>
        <button type="button" role="tab" data-nxo-period="year" aria-selected="false" title="Annuel : 2 mois offerts">Annuel<em>2 mois offerts</em></button>
      </div>
    </div>
    <div class="nxo-plans">${list.map((p) => planCard(p, s)).join('')}</div>
    ${compare(list, s)}
    <p class="nxo-foot">${ico('chat', 12)} Change d’offre à tout moment : ta demande est traitée par l’équipe NEXORA et ta nouvelle offre est activée sous 24 h.</p>
  </div>`;
}

export function onClick(e) {
  const per = e.target.closest('[data-nxo-period]');
  if (per) {
    const root = per.closest('.nxo');
    const y = per.dataset.nxoPeriod === 'year';
    root.dataset.period = y ? 'year' : 'month';
    for (const b of root.querySelectorAll('[data-nxo-period]')) { b.classList.toggle('on', b === per); b.setAttribute('aria-selected', String(b === per)); }
    for (const a of root.querySelectorAll('.nxo-amt, .nxo-bill')) a.textContent = y ? a.dataset.y : a.dataset.m;
    return true;
  }
  const sc = e.target.closest('[data-nxo-scroll]');
  if (sc) { const t = document.querySelector(sc.dataset.nxoScroll); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return true; }
  return false;
}
