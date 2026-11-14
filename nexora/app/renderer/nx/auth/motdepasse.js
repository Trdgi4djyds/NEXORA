// NEXORA #120 : règles communes des mots de passe et des adresses e-mail : inscription, nouveau mot de passe (lien
// « Mot de passe oublié »), Mon compte → Sécurité et changement d'adresse. Un mot de passe trop court, trop faible,
// trop courant ou qui reprend l'adresse ou le nom est refusé avec un message clair, avant tout envoi au serveur.

// Robustesse de 0 à 4 (jauge des formulaires) : 0 = moins de 8 caractères, 1 = faible (refusé).
export function score(pw) {
  if (!pw || pw.length < 8) return 0;
  let s = 1;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  else if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s += 0.5;
  return Math.min(4, Math.floor(s));
}

// Mots de passe parmi les plus utilisés (listes publiques de fuites), en minuscules.
const COMMON = new Set([
  '12345678', '123456789', '1234567890', '123123123', '11111111', '00000000', '12341234', '87654321', '11223344',
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'motdepasse', 'motdepasse1', 'motdepasse123',
  'azertyui', 'azertyuiop', 'azerty123', 'azerty1234', 'qwertyui', 'qwertyuiop', 'qwerty123', 'qwerty1234',
  'abcdefgh', 'abcd1234', 'abc12345', 'abcdef123', 'iloveyou', 'jetaime1', 'jetaime123', 'soleil123', 'bonjour1',
  'bonjour123', 'admin123', 'administrator', 'welcome1', 'welcome123', 'letmein1', 'sunshine', 'princess',
  'football', 'baseball', 'superman', 'trustno1', 'dragon123', 'monkey123', 'master123', 'changeme', 'nexora123',
  'nexoradevs', 'loulou123', 'chocolat', 'doudou123', 'marseille', 'liverpool', 'starwars', 'pokemon1',
]);

export function emailProblem(email) {
  const e = String(email || '').trim();
  if (!e) return 'Indiquez votre adresse e-mail.';
  // Une partie avant @, un domaine avec au moins un point et une extension de 2 lettres ou plus, sans espace.
  if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[a-z]{2,}$/i.test(e) || /\.\./.test(e)) return 'Adresse e-mail invalide : vérifiez-la (exemple : vous@exemple.com).';
  return '';
}

export function passwordProblem(pw, { email = '', name = '' } = {}) {
  const p = String(pw || '');
  if (p.length < 8) return 'Mot de passe trop court : 8 caractères minimum.';
  if (p.length > 72) return 'Mot de passe trop long : 72 caractères au plus.';
  const low = p.toLowerCase();
  if (COMMON.has(low) || new Set(low).size < 4 || /^(?:0123456789|123456789|abcdefghij)/.test(low)) return 'Mot de passe trop facile à deviner : choisissez-en un autre.';
  const local = String(email || '').trim().toLowerCase().split('@')[0];
  if (local.length >= 4 && low.includes(local)) return 'Le mot de passe ne doit pas reprendre votre adresse e-mail.';
  const first = String(name || '').trim().toLowerCase().split(/\s+/)[0] || '';
  if (first.length >= 4 && low.includes(first)) return 'Le mot de passe ne doit pas reprendre votre nom.';
  if (score(p) < 2) return 'Mot de passe trop faible : mélangez majuscules, minuscules, chiffres ou symboles, ou allongez-le (12 caractères ou plus).';
  return '';
}
