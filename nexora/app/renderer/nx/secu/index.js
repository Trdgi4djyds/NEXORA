// NEXORA #048 : espace Sécurité réorganisé en six onglets : Vue d'ensemble (centre de fiabilité), Audit du
// site (rendu d'origine enrichi), Domaine & e-mail, Code, Applications, Supervision & alertes (#015).
// Branché sur renderer/dist/chunks/security-PRU3E45U.js par globalThis.__nxSecu (crochets d'une ligne) ;
// sans ce module, l'espace garde ses deux onglets d'origine.
import { esc, icon } from './common.js';
import { enhanceReport, exportReport, enhanceEmpty } from './audit.js';

const TABS = [
  ['fiab', 'Vue d’ensemble', 'grid'],
  ['audit', 'Audit du site', 'shield'],
  ['domaine', 'Domaine & e-mail', 'mail'],
  ['code', 'Code', 'code'],
  ['applis', 'Applications', 'android'],
  ['supervision', 'Supervision & alertes', 'bolt'],
];
const OWN = new Set(['fiab', 'domaine', 'code', 'applis']);
const LOADERS = {
  fiab: () => import('./fiabilite.js'),
  domaine: () => import('./domaine.js'),
  code: () => import('./code.js'),
  applis: () => import('./applis.js'),
};

function css(href, attr) {
  if (document.querySelector(`link[${attr}]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  l.setAttribute(attr, '');
  document.head.append(l);
}

function loadCss() {
  css(new URL('../../supervision/supervision.css', import.meta.url).href, 'data-sup-css');
  css(new URL('./secu.css', import.meta.url).href, 'data-nxs-css');
}

const api = {
  has: (tab) => OWN.has(tab),
  // Barre d'onglets et en-tête, appelés à chaque rendu de l'espace.
  tabs(inst) {
    loadCss();
    const sec = inst.el.querySelector('.sec');
    if (sec) sec.classList.add('sup-wide', 'nxs-space');
    const p = inst.el.querySelector('.sec-head p');
    if (p) p.innerHTML = 'Pour <b>tes propres sites et projets</b> : audits en lecture seule (site, domaine, code, applications), surveillance en continu et alertes. Aucune attaque : NEXORA lit comme un visiteur et t’explique quoi corriger, et qui doit le faire.';
    const bar = inst.el.querySelector('.sec-tabs');
    if (bar) {
      bar.classList.add('nxs-tabs');
      bar.setAttribute('role', 'tablist');
      bar.innerHTML = TABS.map(([id, label, ic]) => `<button data-sec-tab="${id}" role="tab" aria-selected="${inst.tab === id}" class="${inst.tab === id ? 'on' : ''}">${icon(ic, 14)}<span>${esc(label)}</span></button>`).join('');
    }
  },
  async render(inst) {
    const host = inst.el.querySelector('.sec-body');
    if (!host) return;
    const tab = inst.tab;
    try {
      const m = await LOADERS[tab]();
      if (inst.tab !== tab) return;
      await m.render(inst, host);
    } catch (err) {
      console.error('[NEXORA #048] sécurité', err);
      host.innerHTML = `<div class="sec-empty">${icon('warn', 30)}<b>Impossible d’afficher cet onglet</b><p>${esc(err && err.message ? err.message : String(err))}</p></div>`;
    }
  },
  resume(inst) { if (OWN.has(inst.tab)) api.render(inst); },
  report(inst) { loadCss(); enhanceReport(inst).catch((err) => console.error('[NEXORA #048] rapport', err)); },
  empty(inst) { loadCss(); enhanceEmpty(inst).catch(() => {}); },
  exportReport,
};

export function install() {
  globalThis.__nxSecu = api;
  loadCss();
}
