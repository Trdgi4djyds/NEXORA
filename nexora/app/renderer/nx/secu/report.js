// NEXORA #048 : rapports partageables (HTML autonome, imprimable, ou PDF par le processus principal) : audits
// de sécurité avec, pour chaque problème, « ce que ça risque » et « qui doit agir », et rapport mensuel de la
// supervision (disponibilité, objectifs, incidents). Aucune ressource externe : le fichier s'ouvre partout.
import { SEV, WHO, whoOf, riskOf, grade, call, toast } from './common.js';

const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (t) => new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const CSS = `*{box-sizing:border-box}body{margin:0;font:13px/1.5 "Inter","Segoe UI",system-ui,sans-serif;color:#1d1d1f;background:#fff}
.wrap{max-width:960px;margin:0 auto;padding:36px 32px 48px}header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:2px solid #1d1d1f;padding-bottom:18px;margin-bottom:22px}
.brand{font-weight:800;letter-spacing:.08em;font-size:12px;color:#6e6e73}h1{font-size:24px;margin:4px 0 2px;letter-spacing:-.02em}.sub{color:#6e6e73}
.score{text-align:center;min-width:120px;border:2px solid currentColor;border-radius:16px;padding:10px 14px}.score b{display:block;font-size:34px;line-height:1.1}.score span{font-size:12px;font-weight:600}
.good{color:#1f9d55}.warn{color:#b45309}.bad{color:#d92d20}.muted{color:#6e6e73}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:0 0 22px}.kpi{border:1px solid #e5e5ea;border-radius:12px;padding:10px 12px}.kpi small{display:block;color:#6e6e73;font-size:11px}.kpi b{font-size:18px}
h2{font-size:15px;margin:26px 0 10px;letter-spacing:-.01em}table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:#6e6e73;border-bottom:1px solid #d2d2d7;padding:6px 8px}
td{border-bottom:1px solid #ececf0;padding:8px;vertical-align:top}tr{page-break-inside:avoid}.sev{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:99px;color:#fff;white-space:nowrap}
.t{font-weight:650}.d{color:#3a3a3c;margin-top:2px}.fix{color:#1d1d1f}.note{border:1px solid #e5e5ea;background:#f7f7f9;border-radius:10px;padding:10px 12px;color:#3a3a3c}
footer{margin-top:30px;color:#8e8e93;font-size:11px;border-top:1px solid #e5e5ea;padding-top:10px}@media print{.wrap{padding:0}a{color:inherit}}`;

function page(title, body) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title><style>${CSS}</style></head><body><div class="wrap">${body}<footer>Rapport généré par NEXORA le ${e(fmtDate(Date.now()))}. Audit en lecture seule : aucune attaque n’a été menée.</footer></div></body></html>`;
}

export const KIND = { site: 'Audit de sécurité du site', pages: 'Audit de sécurité sur plusieurs pages', domain: 'Audit du domaine et de la messagerie', code: 'Audit du code et des dépendances', app: 'Audit de l’application' };

export function auditReportHtml(rep, { accepted = [] } = {}) {
  const tone = rep.score >= 85 ? 'good' : rep.score >= 60 ? 'warn' : 'bad';
  const acc = new Map(accepted.map((a) => [a.key, a]));
  const active = (rep.findings || []).filter((f) => f.sev !== 'info' && !acc.has(f.key));
  const c = rep.counts || {};
  const rows = (rep.findings || []).filter((f) => f.sev !== 'info').map((f) => `<tr>
    <td><span class="sev" style="background:${SEV[f.sev].color}">${e(SEV[f.sev].label)}</span>${acc.has(f.key) ? '<div class="muted" style="margin-top:4px;font-size:11px">Risque accepté</div>' : ''}</td>
    <td><div class="t">${e(f.title)}</div><div class="d">${e(f.detail)}</div></td>
    <td>${e(riskOf(f))}</td><td>${e(WHO[whoOf(f)] || WHO.toi)}</td><td class="fix">${e(f.fix)}</td></tr>`).join('');
  const infos = (rep.findings || []).filter((f) => f.sev === 'info');
  const cmp = rep.compare && rep.compare.prev ? `<p class="note">Depuis l’audit du ${e(fmtDate(rep.compare.prev.at))} : ${rep.compare.added.length} nouveau(x) problème(s), ${rep.compare.fixed.length} corrigé(s), note ${rep.compare.delta >= 0 ? '+' : ''}${rep.compare.delta}.</p>` : '';
  const body = `<header><div><div class="brand">NEXORA · SÉCURITÉ</div><h1>${e(KIND[rep.kind] || 'Audit de sécurité')}</h1><div class="sub">${e(rep.url || rep.host || rep.name || rep.target || '')}<br>${e(fmtDate(rep.at))}</div></div>
    <div class="score ${tone}"><b>${rep.score}</b><span>/100 · note ${grade(rep.score)}</span></div></header>
    <div class="kpis"><div class="kpi"><small>Critiques</small><b class="${c.critical ? 'bad' : ''}">${c.critical || 0}</b></div><div class="kpi"><small>Élevés</small><b class="${c.high ? 'bad' : ''}">${c.high || 0}</b></div><div class="kpi"><small>Moyens</small><b class="${c.medium ? 'warn' : ''}">${c.medium || 0}</b></div><div class="kpi"><small>Faibles</small><b>${c.low || 0}</b></div></div>
    ${cmp}
    <h2>${active.length ? `${active.length} point(s) à corriger` : 'Aucun point à corriger'}</h2>
    ${rows ? `<table><thead><tr><th style="width:80px">Gravité</th><th>Problème</th><th style="width:20%">Ce que ça risque</th><th style="width:14%">Qui doit agir</th><th style="width:24%">Correction</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="note">Aucun problème de sécurité relevé.</p>'}
    ${infos.length ? `<h2>Pour information</h2><table><tbody>${infos.map((f) => `<tr><td><div class="t">${e(f.title)}</div><div class="d">${e(f.detail)}</div></td><td class="fix">${e(f.fix)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${accepted.length ? `<h2>Risques acceptés</h2><table><tbody>${accepted.map((a) => `<tr><td class="t">${e(a.title)}</td><td>${e(a.reason || '—')}</td><td class="muted">${a.until ? `jusqu’au ${e(new Date(a.until).toLocaleDateString('fr-FR'))}` : 'sans limite'}</td></tr>`).join('')}</tbody></table>` : ''}`;
  return page(`${KIND[rep.kind] || 'Audit'} — ${rep.host || rep.name || ''}`, body);
}

const pct = (v) => (v == null ? '—' : `${(Math.floor(v * 100) / 100).toLocaleString('fr-FR')} %`);
const msf = (v) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} s` : `${Math.round(v)} ms`);
const durf = (m) => { const s = Math.round((m || 0) / 1000); if (s < 60) return `${s} s`; const mn = Math.round(s / 60); if (mn < 60) return `${mn} min`; const h = Math.floor(mn / 60); return `${h} h ${String(mn % 60).padStart(2, '0')}`; };
const KINDS = { down: 'Panne', slow: 'Lenteur', cert: 'Certificat', errors: 'Erreurs de page', change: 'Modification', domain: 'Domaine' };

export function monthlyReportHtml(r) {
  const month = new Date(r.from).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const withData = r.sites.filter((s) => s.avail != null);
  const ok = withData.filter((s) => s.met).length;
  const avg = withData.length ? withData.reduce((a, s) => a + s.avail, 0) / withData.length : null;
  const body = `<header><div><div class="brand">NEXORA · SUPERVISION</div><h1>Rapport de disponibilité</h1><div class="sub">${e(month)} · ${r.sites.length} site(s) surveillé(s)</div></div>
    <div class="score ${avg == null ? 'muted' : avg >= 99.9 ? 'good' : avg >= 99 ? 'warn' : 'bad'}"><b>${avg == null ? '—' : (Math.floor(avg * 100) / 100).toLocaleString('fr-FR')}</b><span>% de disponibilité moyenne</span></div></header>
    <div class="kpis"><div class="kpi"><small>Objectifs atteints</small><b>${ok} / ${withData.length}</b></div><div class="kpi"><small>Incidents</small><b>${r.incidents.length}</b></div><div class="kpi"><small>Pannes</small><b>${r.sites.reduce((a, s) => a + (s.down || 0), 0)}</b></div><div class="kpi"><small>Temps hors ligne</small><b>${durf(r.sites.reduce((a, s) => a + (s.downtime || 0), 0))}</b></div></div>
    <h2>Par site</h2><table><thead><tr><th>Site</th><th>Disponibilité</th><th>Objectif</th><th>Temps de réponse (p95)</th><th>Incidents</th><th>Hors ligne</th></tr></thead><tbody>
    ${r.sites.map((s) => `<tr><td><div class="t">${e(s.name)}</div><div class="d">${e(s.url)}</div></td><td class="${s.met == null ? 'muted' : s.met ? 'good' : 'bad'}"><b>${pct(s.avail)}</b></td><td>${e(s.slo.toLocaleString('fr-FR'))} %${s.met == null ? '' : s.met ? ' · atteint' : ' · manqué'}</td><td>${msf(s.p95)}</td><td>${s.incidents}</td><td>${durf(s.downtime)}</td></tr>`).join('')}</tbody></table>
    ${r.incidents.length ? `<h2>Incidents</h2><table><thead><tr><th>Début</th><th>Site</th><th>Type</th><th>Cause</th><th>Durée</th></tr></thead><tbody>${r.incidents.slice(0, 60).map((i) => `<tr><td>${e(fmtDate(i.start))}</td><td>${e(i.siteName)}</td><td>${e(KINDS[i.kind] || i.kind)}</td><td>${e(i.cause)}${i.note ? `<div class="d">${e(i.note)}</div>` : ''}</td><td>${i.end ? durf(i.end - i.start) : 'en cours'}</td></tr>`).join('')}</tbody></table>` : '<p class="note">Aucun incident ce mois-ci.</p>'}
    ${r.marks && r.marks.length ? `<h2>Déploiements</h2><table><tbody>${r.marks.slice(0, 40).map((m) => `<tr><td style="width:200px">${e(fmtDate(m.at))}</td><td>${e(m.label)}</td></tr>`).join('')}</tbody></table>` : ''}`;
  return page(`Rapport de disponibilité — ${month}`, body);
}

// Enregistre un rapport : PDF dans l'application Windows, fichier HTML téléchargé dans le navigateur.
export async function saveReport(html, name, format = 'pdf') {
  try {
    const p = await call('sec:report-save', { html, name, format });
    if (p) toast('Rapport enregistré.', { action: 'Afficher', onAction: () => call('sec:reveal', p) });
    return p;
  } catch (err) {
    if (window.__NEXORA_WEB__ || /uniquement dans l’application/.test(String(err && err.message))) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      a.download = `${name}.html`;
      document.body.append(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      toast('Rapport téléchargé (HTML, à imprimer en PDF depuis le navigateur).');
      return true;
    }
    toast(err.message || String(err), { kind: 'bad' });
    return null;
  }
}
