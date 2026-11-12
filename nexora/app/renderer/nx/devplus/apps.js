// NEXORA #052 : du code à l'application : le projet ouvert devient une app Android (App Builder) ou un logiciel
// Windows (Desktop Builder), s'affiche sur les appareils (Responsive Lab) ou passe à l'audit (Browser Lab).
import { esc, ico, root, projectName, menu, toast, state, head } from './ui.js';

const go = (mode) => { const b = document.querySelector(`#modeSeg button[data-mode="${mode}"]`); if (b) b.click(); return Boolean(b); };
const until = async (test, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = test(); if (v) return v; await new Promise((r) => setTimeout(r, 80)); } return null; };

export async function toAndroid() {
  const dir = root();
  if (!dir) return;
  go('android');
  const a = await until(() => state.android && state.android.useDir && state.android);
  if (!a) { toast('Ouvrez l’App Builder une première fois, puis réessayez.'); return; }
  a.act_app_new();
  a.set('source.kind', 'project', { rerender: true });
  try { await a.useDir(dir); toast(`« ${projectName()} » est la source de votre nouvelle application. Vérifiez l’identité, puis construisez l’APK.`); } catch (e) { toast(String(e.message || e), { kind: 'bad' }); }
}
export async function toDesktop() {
  const dir = root();
  if (!dir) return;
  go('desktop');
  const d = await until(() => state.desktop && state.desktop.newApp && state.desktop);
  if (!d) { toast('Ouvrez le Desktop Builder une première fois, puis réessayez.'); return; }
  const an = state.devLab && state.devLab.analysis;
  const electron = Boolean(an && /electron/i.test(`${an.kind} ${an.label}`));
  // Le dossier est celui du projet ouvert : pas de fenêtre de choix.
  const pick = d.pickSource;
  d.pickSource = async function pickProject() { d.pickSource = pick; this.applyAnalysis(await window.vitrine.invoke('desktop:analyze', { dir })); };
  d.newApp();
  const sheetEl = await until(() => document.querySelector(`[data-kind="${electron ? 'electron' : 'folder'}"]`));
  if (sheetEl) {
    sheetEl.click();
    const name = sheetEl.closest('.sheet, [role="dialog"], .sheet-wrap') && sheetEl.closest('.sheet, [role="dialog"], .sheet-wrap').querySelector('[data-name]');
    if (name) name.value = d.freeName(projectName().replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase()));
  }
  setTimeout(() => { if (d.pickSource !== pick && !document.querySelector('[data-kind]')) d.pickSource = pick; }, 60000);
}
export async function showOnDevices(url) {
  if (!url) { toast('Lancez d’abord le projet (Scripts ou Lancer) pour avoir son adresse.'); return; }
  go('preview');
  const input = await until(() => document.getElementById('addressInput'));
  if (!input) return;
  input.value = url;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
}
export async function auditInBrowser(url) {
  if (!url) { toast('Lancez d’abord le projet pour avoir son adresse.'); return; }
  go('browser');
  const b = await until(() => state.browserLab && state.browserLab.navigate && state.browserLab);
  if (b) b.navigate(url);
}

const ACTIONS = (ctx) => [
  { id: 'android', icon: 'android', label: 'Créer l’app Android', sub: 'App Builder, avec ce projet comme source', run: toAndroid },
  { id: 'desktop', icon: 'display', label: 'Créer le logiciel Windows', sub: 'Desktop Builder : installateur, version portable', run: toDesktop },
  { id: 'devices', icon: 'phone', label: 'Afficher sur les appareils', sub: 'Responsive Lab, avec l’adresse du serveur lancé', run: () => showOnDevices(ctx.url()) },
  { id: 'browser', icon: 'audit', label: 'Auditer dans le Browser Lab', sub: 'Inspection, réseau, console, audit', run: () => auditInBrowser(ctx.url()) },
];
export async function appsMenu(anchor, ctx) {
  const list = ACTIONS(ctx);
  const id = await menu(anchor, 'Vers une app', list.map(({ id, icon, label, sub }) => ({ id, icon, label, sub })), { width: 300, align: 'end' });
  const a = list.find((x) => x.id === id);
  if (a) a.run();
}

export function mount(el, ctx) {
  const render = () => {
    el.innerHTML = `${head('Vers une app', root() ? `Le projet <b>${esc(projectName())}</b> passez dans les autres espaces de NEXORA sans être reconfiguré.` : 'Ouvrez un projet pour l’envoyer vers les autres espaces.')}
      <div class="nxd-tiles">${ACTIONS(ctx).map((a) => `<button class="nxd-tile" data-go="${a.id}" ${root() ? '' : 'disabled'}><span class="nxd-tile-ic">${ico(a.icon, 20)}</span><b>${esc(a.label)}</b><small>${esc(a.sub)}</small></button>`).join('')}</div>
      <p class="nxd-muted">${ico('info', 12)} ${ctx.url() ? `Adresse utilisée : ${esc(ctx.url())}` : 'Pour les appareils et le Browser Lab, lancez d’abord le projet (onglet Scripts ou bouton « Lancer »).'}</p>`;
  };
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) { const a = ACTIONS(ctx).find((x) => x.id === b.dataset.go); if (a) a.run(); } });
  ctx.bus.addEventListener('url', () => { if (el.isConnected) render(); });
  render();
  return { show: () => render() };
}
