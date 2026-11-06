// NEXORA #052 : santé des dépendances : paquets obsolètes, failles connues, licences, mise à jour en un clic.
import { api, esc, ico, root, call, noProject, head, btn, iconBtn, pill, spinner, ago, toast, confirmSheet, settings, saveSettings } from './ui.js';

const SEV = { critical: ['Critique', 'bad'], high: ['Haute', 'bad'], moderate: ['Moyenne', 'warn'], low: ['Faible', ''], info: ['Info', ''] };

export function mount(el, ctx) {
  const st = { r: null, busy: false, tab: 'vuln', working: '', log: '' };
  const render = () => {
    if (!root()) { el.innerHTML = noProject(); return; }
    const r = st.r;
    const s = r && r.summary;
    ctx.setBadge('deps', s ? s.critical + s.high : 0);
    el.innerHTML = `${head('Dépendances', r ? `Analyse ${ago(r.at)} · gestionnaire ${esc(r.pm)}` : 'Paquets obsolètes, failles connues et licences des dépendances du projet.', `${r && r.vulnerabilities.length ? btn('Corriger les failles', 'data-act="fix"', 'wrench') : ''}${btn(st.busy ? 'Analyse…' : r ? 'Analyser de nouveau' : 'Analyser', `data-act="scan" ${st.busy ? 'disabled' : ''}`, 'refreshCw', 'primary')}`)}
      ${st.busy && !r ? spinner('Analyse des dépendances (le registre des paquets est interrogé)…') : ''}
      ${!r && !st.busy ? `<div class="nxd-empty">${ico('layers', 26)}<b>Pas encore analysé</b><p>NEXORA demande au registre des paquets les versions récentes et les failles connues, et lit les licences installées.</p></div>` : ''}
      ${r ? `<div class="nxd-cards">
        <div class="nxd-card ${s.critical + s.high ? 'bad' : 'ok'}"><small>Failles critiques ou hautes</small><b>${s.critical + s.high}</b><span>${s.moderate} moyenne(s), ${s.low} faible(s)</span></div>
        <div class="nxd-card ${s.outdated ? 'warn' : 'ok'}"><small>Paquets obsolètes</small><b>${s.outdated}</b><span>dont ${s.major} version(s) majeure(s)</span></div>
        <div class="nxd-card ${s.copyleft ? 'warn' : 'ok'}"><small>Licences à vérifier</small><b>${s.copyleft}</b><span>copyleft (GPL, AGPL…)</span></div></div>
        ${r.auditSkipped ? `<p class="nxd-muted">${ico('info', 12)} ${esc(r.auditSkipped)}</p>` : ''}
        <div class="seg nxd-seg nxd-subtabs">${[['vuln', `Failles (${r.vulnerabilities.length})`], ['outdated', `Obsolètes (${r.outdated.length})`], ['lic', `Licences (${r.licenses.length})`]].map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
        <div class="nxd-table">${st.tab === 'vuln' ? (r.vulnerabilities.length ? r.vulnerabilities.map((v) => `<div class="nxd-tr">${pill((SEV[v.severity] || [v.severity])[0], (SEV[v.severity] || [])[1])}<b>${esc(v.name)}</b><span class="nxd-grow">${esc(v.title)}${v.range ? ` <small>(${esc(v.range)})</small>` : ''}</span>${v.fix ? pill(`correctif : ${v.fix}`, 'ok') : pill('pas de correctif')}${v.url ? iconBtn('external', 'Détail de la faille', `data-url="${esc(v.url)}"`) : ''}</div>`).join('') : `<p class="nxd-muted">${ico('pass', 13)} Aucune faille connue.</p>`)
          : st.tab === 'outdated' ? (r.outdated.length ? r.outdated.map((o) => `<div class="nxd-tr"><b>${esc(o.name)}</b>${o.dev ? pill('développement') : ''}<span class="nxd-grow"><code>${esc(o.current)}</code> → <code>${esc(o.latest)}</code>${o.major ? ' ' + pill('majeure : à tester', 'warn') : ''}</span>${btn(st.working === o.name ? 'Mise à jour…' : 'Mettre à jour', `data-up="${esc(o.name)}" data-dev="${o.dev ? 1 : ''}" ${st.working ? 'disabled' : ''}`, 'download')}</div>`).join('') : `<p class="nxd-muted">${ico('pass', 13)} Tout est à jour.</p>`)
          : r.licenses.map((l) => `<div class="nxd-tr"><b>${esc(l.name)}</b><small>${esc(l.version)}</small><span class="nxd-grow">${esc(l.license)}</span>${l.risk === 'copyleft' ? pill('copyleft : conditions de partage', 'warn') : l.risk === 'unknown' ? pill('licence inconnue', 'warn') : l.risk === 'missing' ? pill('non installé') : pill('permissive', 'ok')}</div>`).join('')}</div>` : ''}
      ${st.log ? `<details class="nxd-details"><summary>Journal de la dernière action</summary><pre class="nxd-console">${esc(st.log.slice(-20000))}</pre></details>` : ''}`;
  };
  const scan = async () => {
    if (st.busy) return;
    st.busy = true; render();
    try {
      st.r = await call('devx:deps');
      // Résumé gardé pour l'espace Sécurité et le prochain lancement.
      settings.nxDevDeps = { ...(settings.nxDevDeps || {}), [root()]: { at: st.r.at, ...st.r.summary } };
      saveSettings();
    } catch { /* message affiché */ }
    st.busy = false; render();
  };
  api.on('devx:deps', (m) => { if (!el.isConnected) return; if (m.type === 'log') st.log += m.text; });
  el.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-act="scan"]')) return scan();
    const tab = t.closest('[data-tab]');
    if (tab) { st.tab = tab.dataset.tab; render(); return; }
    const u = t.closest('[data-url]');
    if (u) { window.open(u.dataset.url, '_blank'); return; }
    const up = t.closest('[data-up]');
    if (up) {
      const o = st.r.outdated.find((x) => x.name === up.dataset.up);
      if (o && o.major && !await confirmSheet({ icon: 'warn', title: `Passer ${o.name} en version ${o.latest} ?`, sub: 'C’est une version majeure : elle peut casser le projet. Lance les tests après la mise à jour.', go: 'Mettre à jour' })) return;
      st.working = up.dataset.up; st.log = ''; render();
      try { await call('devx:deps-update', { name: up.dataset.up, dev: Boolean(up.dataset.dev) }); toast(`${up.dataset.up} est à jour.`); st.working = ''; await scan(); } catch { st.working = ''; render(); }
      return;
    }
    if (t.closest('[data-act="fix"]') && await confirmSheet({ icon: 'wrench', title: 'Corriger les failles automatiquement ?', sub: 'Le gestionnaire de paquets passe aux versions corrigées compatibles. Lance les tests ensuite.', go: 'Corriger' })) {
      st.log = ''; st.busy = true; render();
      try { const r = await call('devx:deps-fix'); toast(r.ok ? 'Corrections appliquées.' : 'Certaines failles demandent une mise à jour majeure : voir le journal.'); } catch { /* message affiché */ }
      st.busy = false; await scan();
    }
  });
  render();
  return { show: () => render() };
}
