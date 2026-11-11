// NEXORA #048 : onglet « Domaine & e-mail » : usurpation d'e-mails (SPF, DMARC, DKIM), DNS (CAA, DNSSEC),
// expiration et verrou du nom de domaine, sous-domaines orphelins (prise de contrôle possible), security.txt.
import { call, esc, icon, toast, btn, card, ago, ring, counts, compareHtml, historyHtml, findingsHtml, bindAccept, progressHtml, followJob, hostOf, currentProject } from './common.js';
import { auditReportHtml, saveReport } from './report.js';

const state = { report: null, host: '' };

function tile(label, ok, value, tip = '') {
  const tone = ok === true ? 'good' : ok === false ? 'bad' : ok === 'warn' ? 'warn' : '';
  return `<div class="nxs-tile ${tone}"${tip ? ` data-tip="${esc(tip)}"` : ''}><small>${esc(label)}</small><b>${icon(ok === true ? 'check' : ok === false ? 'warn' : ok === 'warn' ? 'info' : 'minus', 13)}${esc(value)}</b></div>`;
}

function tiles(rec) {
  if (rec.platform) return `<div class="nxs-tiles">${tile('Hébergement', 'warn', `Sous-domaine de ${rec.platform}`)}${tile('security.txt', rec.securityTxt ? true : 'warn', rec.securityTxt ? 'Présent' : 'Absent')}</div>`;
  const dm = rec.dmarc || '';
  const p = (/;\s*p=(\w+)/i.exec(`;${dm}`) || [])[1] || '';
  const exp = rec.expiry;
  return `<div class="nxs-tiles">
    ${tile('SPF', rec.spf ? (/[-~]all/.test(rec.spf) ? true : 'warn') : false, rec.spf ? (/-all/.test(rec.spf) ? 'Strict (-all)' : /~all/.test(rec.spf) ? 'Souple (~all)' : 'Incomplet') : 'Absent', rec.spf)}
    ${tile('DMARC', dm ? (/reject/i.test(p) ? true : 'warn') : false, dm ? `p=${p || '?'}` : 'Absent', dm)}
    ${tile('DKIM', rec.dkim && rec.dkim.length ? true : rec.mx && rec.mx.length ? 'warn' : null, rec.dkim && rec.dkim.length ? rec.dkim.slice(0, 3).join(', ') : 'Non trouvé')}
    ${tile('Messagerie (MX)', rec.mx && rec.mx.length ? true : null, rec.mx && rec.mx.length ? `${rec.mx.length} serveur(s)` : 'Aucune')}
    ${tile('DNSSEC', rec.dnssec ? true : 'warn', rec.dnssec ? 'Activé' : 'Non activé')}
    ${tile('CAA', rec.caa && rec.caa.length ? true : 'warn', rec.caa && rec.caa.length ? `${rec.caa.length} autorité(s)` : 'Aucun')}
    ${tile('Expiration', exp && exp.days != null ? (exp.days > 60 ? true : exp.days > 30 ? 'warn' : false) : null, exp && exp.days != null ? `${exp.days} jours` : 'Non publiée', exp && exp.registrar ? `Registraire : ${exp.registrar}` : '')}
    ${tile('Sous-domaines', (rec.subdomains || []).some((s) => s.state !== 'ok') ? false : true, `${(rec.subdomains || []).length} trouvé(s)`, `${rec.subChecked || 0} noms vérifiés${rec.ctOk ? ', dont ceux des journaux de certificats' : ''}`)}
  </div>`;
}

export async function render(inst, host) {
  host.innerHTML = `<div class="nxs">
    <form class="sec-bar nxs-bar" data-dom-form><span class="sec-ico">${icon('globe', 15)}</span><input class="input" data-dom placeholder="ton-domaine.com" spellcheck="false" value="${esc(state.host || hostOf(inst.siteUrl()) || '')}"><button class="btn primary">${icon('search', 14)}<span>Analyser le domaine</span></button></form>
    <div data-dom-out></div>
  </div>`;
  const out = host.querySelector('[data-dom-out]');
  host.querySelector('[data-dom-form]').onsubmit = (ev) => { ev.preventDefault(); run(host, out); };
  if (!state.report) {
    try {
      const h = state.host || hostOf(inst.siteUrl());
      const last = await call('sec:latest', { kind: 'domain' });
      if (last && (!h || last.host === h || last.domain === h.replace(/^www\./, '') || h.endsWith(last.domain))) state.report = last;
    } catch { /* aperçu */ }
  }
  if (state.report) draw(out); else empty(out);
}

function empty(out) {
  out.innerHTML = `<div class="sec-empty">${icon('mail', 34)}<b>Protège ton nom de domaine et tes e-mails</b>
    <p>Sans SPF ni DMARC, n’importe qui peut envoyer des e-mails « de ta part » à tes clients. NEXORA vérifie aussi la date d’expiration de ton domaine et repère les sous-domaines oubliés qu’un inconnu pourrait reprendre.</p>
    <div class="sec-chips">${['SPF', 'DMARC', 'DKIM', 'DNSSEC', 'CAA', 'Expiration du domaine', 'Sous-domaines orphelins', 'security.txt'].map((s) => `<span>${esc(s)}</span>`).join('')}</div></div>`;
}

async function run(host, out) {
  const input = host.querySelector('[data-dom]');
  const v = String(input.value || '').trim();
  if (!v) { toast('Indique ton nom de domaine.', { kind: 'bad' }); return; }
  state.host = v;
  out.innerHTML = progressHtml('Lecture des enregistrements DNS…');
  const off = followJob(out, 'domain');
  try { state.report = await call('sec:domain', { host: v }); draw(out); } catch (err) { out.innerHTML = `<div class="sec-empty"><b class="bad">${esc(err.message)}</b><p>Vérifie l’orthographe du domaine et ta connexion à Internet.</p></div>`; } finally { off(); }
}

async function draw(out) {
  const r = state.report;
  const input = out.closest('.nxs') && out.closest('.nxs').querySelector('[data-dom]');
  if (input && !input.value) input.value = r.domain;
  let accepted = [];
  let hist = [];
  try { [accepted, hist] = await Promise.all([call('sec:accepted', { target: r.target }), call('sec:history', { kind: 'domain', target: r.target, limit: 20 })]); } catch { /* */ }
  const rec = r.records || {};
  const subs = (rec.subdomains || []);
  out.innerHTML = `
    <div class="sec-summary nxs-sum">${ring(r.score)}<div class="sec-sum-txt"><h2>${esc(r.domain)}<small class="muted"> · ${esc(ago(r.at))}</small></h2><div class="sec-counts">${counts(r.counts)}</div>
      <div class="sec-actions">${btn('Réanalyser', 'data-da="re"', { ic: 'sync' })}${btn('Rapport PDF', 'data-da="pdf"', { ic: 'download' })}${r.id ? btn('SARIF', 'data-da="sarif"', { ic: 'code' }) : ''}</div></div></div>
    ${compareHtml(r.compare) || hist.length > 1 ? `<div class="nxs-row">${compareHtml(r.compare)}${hist.length > 1 ? `<div class="nxs-histcard"><div class="nxs-histcard-h"><b>Note dans le temps</b><small>${hist.length} audits</small></div>${historyHtml(hist, r.id)}</div>` : ''}</div>` : ''}
    ${tiles(rec)}
    <div class="sup-grid g-2-1 g-top">
      ${card('Points à vérifier', findingsHtml(r, accepted), { sub: 'Du plus urgent au moins urgent' })}
      ${card('Sous-domaines', subs.length ? `<div class="nxs-subs">${subs.map((s) => `<div class="nxs-sub ${s.state}"><span class="sup-dot ${s.state === 'ok' ? 'up' : 'down'}"></span><span><b>${esc(s.name)}</b><small>${esc(s.cname)}${s.service ? ` · ${esc(s.service)}` : ''}</small></span><span class="sup-chip ${s.state === 'ok' ? 'good' : 'bad'}">${s.state === 'ok' ? 'Actif' : s.state === 'takeover' ? 'Repris possible' : 'Orphelin'}</span></div>`).join('')}</div>` : `<p class="sup-none">${icon('pass', 14)} ${rec.platform ? 'Sans objet pour un sous-domaine de plateforme.' : 'Aucun alias vers un service externe.'}</p>`, { sub: rec.platform ? '' : `${rec.subChecked || 0} noms vérifiés` })}
    </div>`;
  bindAccept(out, r, () => draw(out));
  for (const b of out.querySelectorAll('[data-nxs-open]')) b.onclick = async () => { state.report = await call('sec:history-get', b.dataset.nxsOpen); draw(out); };
  for (const b of out.querySelectorAll('[data-da]')) b.onclick = async () => {
    if (b.dataset.da === 're') { const host = out.closest('.nxs'); host.querySelector('[data-dom]').value = r.domain; run(host, out); }
    else if (b.dataset.da === 'pdf') saveReport(auditReportHtml(r, { accepted }), `Domaine ${r.domain}`);
    else call('sec:sarif-save', { id: r.id }).then((p) => p && toast('Fichier SARIF enregistré.')).catch((err) => toast(err.message, { kind: 'bad' }));
  };
}

export function reset() { state.report = null; }
export { currentProject };
