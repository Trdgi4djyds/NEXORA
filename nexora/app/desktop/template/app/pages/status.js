'use strict';
/* Page d'état : hors connexion (reconnexion automatique), connexion non sécurisée, affichage arrêté.
 * Paramètres de l'adresse : k (type), u (page à rouvrir), lang (fr ou en), n (nom), c (couleur), bg (fond). */
(() => {
  const q = new URLSearchParams(location.search);
  const kind = q.get('k') || 'offline';
  const target = q.get('u') || '';
  const lang = q.get('lang') === 'en' ? 'en' : 'fr';
  const name = q.get('n') || '';
  const HEX = /^#[0-9a-f]{3,8}$/i;
  if (HEX.test(q.get('c') || '')) document.documentElement.style.setProperty('--accent', q.get('c'));
  const TEXT = {
    fr: {
      offline: ['Pas de connexion', 'Vérifie ta connexion à Internet. La page se rouvrira toute seule dès que le réseau reviendra.'],
      cert: ['Connexion non sécurisée', 'Le certificat de sécurité du site n’est pas valide : la page a été bloquée pour te protéger. Réessaie plus tard ou préviens l’éditeur du logiciel.'],
      crash: ['L’affichage s’est arrêté', 'La page a rencontré un problème à plusieurs reprises. Recharge-la pour reprendre.'],
      retry: 'Réessayer', reload: 'Recharger', auto: (s) => `Nouvel essai dans ${s} s…`, trying: 'Connexion en cours…', waiting: 'En attente du réseau…',
    },
    en: {
      offline: ['No connection', 'Check your Internet connection. The page will reopen on its own as soon as the network is back.'],
      cert: ['Connection not secure', 'The site’s security certificate is not valid, so the page was blocked to protect you. Try again later or contact the publisher.'],
      crash: ['The page stopped working', 'The page ran into a problem several times. Reload it to continue.'],
      retry: 'Try again', reload: 'Reload', auto: (s) => `Retrying in ${s} s…`, trying: 'Connecting…', waiting: 'Waiting for the network…',
    },
  }[lang];
  const [title, text] = TEXT[kind] || TEXT.offline;
  document.documentElement.lang = lang;
  document.title = name ? `${title} · ${name}` : title;
  document.getElementById('app').textContent = name;
  document.getElementById('title').textContent = title;
  document.getElementById('text').textContent = text;
  const btn = document.getElementById('retry');
  const hint = document.getElementById('hint');
  btn.textContent = kind === 'crash' ? TEXT.reload : TEXT.retry;
  // Seules les adresses web sont rouvertes (jamais un autre protocole passé dans l'adresse de la page).
  const safeTarget = /^(https?:|app:\/\/local\/)/i.test(target) ? target : '';
  const go = () => {
    if (!safeTarget) { history.back(); return; }
    hint.textContent = TEXT.trying;
    location.replace(safeTarget);
  };
  btn.addEventListener('click', go);
  btn.focus();
  if (kind !== 'offline' || !safeTarget) return;
  // Hors connexion : nouvel essai dès que le système signale le retour du réseau ; réseau présent mais site
  // injoignable : nouvel essai toutes les 15 s.
  let left = 15;
  const tick = () => {
    if (!navigator.onLine) { hint.textContent = TEXT.waiting; left = 15; return; }
    left -= 1;
    hint.textContent = TEXT.auto(Math.max(0, left));
    if (left <= 0) go();
  };
  window.addEventListener('online', go);
  hint.textContent = navigator.onLine ? TEXT.auto(left) : TEXT.waiting;
  setInterval(tick, 1000);
})();
