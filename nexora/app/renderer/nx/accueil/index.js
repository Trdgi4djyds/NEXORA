// NEXORA #059 : démarrage par objectif sur l'Accueil. Carte « Par quoi commencer ? » posée sous la carte
// « Bonjour » : chaque tuile ouvre l'espace qui répond à l'objectif (attribut data-h-space, déjà géré par l'Accueil
// compilé, home-*.js). Masquable (réglage nxGoalsHidden) ; la carte reste alors une ligne discrète pour la rouvrir.
// L'Accueil redessine son contenu : la carte est remise après chaque rendu.
import { settings, saveSettings, esc, ico } from '../core.js';

const GOALS = [
  { space: 'android', icon: 'android', title: 'Transformer mon site en app Android', text: 'APK, PWA, notifications et Play Store.' },
  { space: 'desktop', icon: 'display', title: 'Créer un logiciel Windows', text: 'Installateur, version portable et mises à jour.' },
  { space: 'preview', icon: 'multi', title: 'Tester mon site sur tous les écrans', text: 'Téléphones, tablettes et ordinateurs réels.' },
  { space: 'dev', icon: 'code', title: 'Coder mon projet', text: 'Éditeur, terminal, Git et aperçu.', tag: 'Gratuit' },
  { space: 'browser', icon: 'audit', title: 'Inspecter et auditer un site', text: 'Réseau, console, performances et tests.' },
  { space: 'security', icon: 'shield', title: 'Sécuriser et surveiller', text: 'Audits, alertes et page de statut.' },
  { space: 'design', icon: 'palette', title: 'Créer des visuels', text: 'Maquettes, réseaux sociaux et impression.' },
  { space: 'studio', icon: 'film', title: 'Présenter en 3D et en vidéo', text: 'Mises en scène, animations et rendus.' },
];

function css() {
  if (document.querySelector('link[data-nx-accueil]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.dataset.nxAccueil = '';
  l.href = new URL('./accueil.css', import.meta.url).href;
  document.head.appendChild(l);
}

function html() {
  const v = window.__nxVersion;
  const notes = v && v.hasNotes() ? `<button type="button" class="nxg-link" data-nxg="notes">${ico('sparkle', 13)}<span>Nouveautés ${esc(v.currentVersion())}</span></button>` : '';
  if (settings.nxGoalsHidden) {
    return `<section class="nxg nxg-min" aria-label="Par quoi commencer ?"><button type="button" class="nxg-link" data-nxg="show">${ico('target', 13)}<span>Par quoi commencer ?</span></button>${notes}</section>`;
  }
  return `<section class="nxg" aria-labelledby="nxg-title">
    <div class="nxg-head">
      <div><small class="nxg-kicker">Par quoi commencer ?</small><h2 id="nxg-title">Que veux-tu faire aujourd’hui ?</h2></div>
      <span class="grow"></span>${notes}
      <button type="button" class="nxg-link" data-nxg="hide" title="Masquer cette carte">${ico('eyeOff', 13)}<span>Masquer</span></button>
    </div>
    <div class="nxg-grid">${GOALS.map((g) => `<button type="button" class="nxg-tile" data-h-space="${g.space}" data-space="${g.space}">
        <span class="nxg-ic">${ico(g.icon, 18)}</span>
        <span class="nxg-txt"><b>${esc(g.title)}</b><small>${esc(g.text)}</small></span>
        ${g.tag ? `<span class="nxg-tag">${esc(g.tag)}</span>` : ''}
      </button>`).join('')}</div>
  </section>`;
}

function place() {
  const hm = document.querySelector('#home .hm');
  if (!hm) return;
  const cur = hm.querySelector(':scope > .nxg');
  const want = html();
  if (cur && cur.__html === want) return;
  if (cur) cur.remove();
  const hero = hm.querySelector(':scope > .hm-hero');
  if (hero) hero.insertAdjacentHTML('afterend', want); else hm.insertAdjacentHTML('afterbegin', want);
  const el = hm.querySelector(':scope > .nxg');
  el.__html = want;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nxg]');
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.nxg === 'notes') { window.__nxVersion?.openNotes(); return; }
    settings.nxGoalsHidden = b.dataset.nxg === 'hide';
    saveSettings();
    place();
  });
}

export function install() {
  css();
  const home = document.getElementById('home');
  if (!home) return;
  place();
  let t = 0;
  new MutationObserver(() => { cancelAnimationFrame(t); t = requestAnimationFrame(place); }).observe(home, { childList: true, subtree: true });
  // Les nouveautés sont connues après le chargement de nx/version : on met le lien à jour.
  setTimeout(place, 2500);
}
