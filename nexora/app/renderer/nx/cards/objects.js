// NEXORA #037, refaits au #038, en 3D au #043 ; depuis le #045 : pictogrammes plats (icônes Lucide du dictionnaire de
// l'interface, nx/icons/lucide.js) dessinés en grand au trait, qui s'effacent en transparence (illu.js,
// composeObject). Demande de l'utilisateur : « je veux plus d'icône 3D nulle part, que des flat icônes qui
// s'effacent en transparence ». Chaque objet garde son nom (règles ci-dessous, back office) et désigne une icône.
export const OBJECTS = {
  folder: 'folder', team: 'nxiTeam', plus: 'plus', phone: 'phone', shield: 'shield', pulse: 'nxiPulse',
  slides: 'present', rocket: 'rocket', devices: 'multi', globe: 'globe', code: 'code', cube: 'cube',
  palette: 'palette', monitor: 'display', chart: 'nxiChart', bell: 'bell', receipt: 'nxiInvoice', coins: 'nxiCoins',
  clock: 'clock', pencil: 'pencil', database: 'nxiDatabase', cloud: 'cloud', lock: 'lock', mail: 'mail', star: 'star',
  chat: 'chat', sparkle: 'sparkle', crown: 'nxiCrown', plane: 'nxiPlane',
};

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const RULES = [
  [/(invitation|e-?mail|courriel|message)/, 'mail'],
  [/(dossier|projet|folder)/, 'folder'],
  [/(equipe|membre|utilisateur|personne|team|groupe|espace)/, 'team'],
  [/(nouveau|nouvelle|creer|ajouter)/, 'plus'],
  [/(application|\bapps?\b|android|apk|app builder|installation)/, 'phone'],
  [/(surveill|supervision|disponib|moniteur|uptime|incident|plantage|sans plantage)/, 'pulse'],
  [/(securit|audit|scan|protection|risque)/, 'shield'],
  [/(presentation|diapo|slide)/, 'slides'],
  [/(responsive|appareil|device)/, 'devices'],
  [/(dev lab|code|terminal|\bgit\b|depot)/, 'code'],
  [/(studio|3d|motion|scene|animation)/, 'cube'],
  [/(nex-design|design|planche|maquette|document)/, 'palette'],
  [/(desktop|logiciel|windows|installateur)/, 'monitor'],
  [/(a encaisser|en attente|echeance|en retard)/, 'clock'],
  [/(facture|invoice|recu)/, 'receipt'],
  [/(encaiss|revenu|mrr|chiffre d|paiement|payee?s?\b|montant)/, 'coins'],
  [/(attente|echeance|retard|heure|temps|delai|duree|latence|reponse)/, 'clock'],
  [/(brouillon|draft|redaction)/, 'pencil'],
  [/(stockage|fichier|storage|octet)/, 'database'],
  [/(notification|alerte|rappel|annonce)/, 'bell'],
  [/(offre|abonnement|\bplan\b|\bpro\b|standard)/, 'star'],
  [/(cloud|synchro|serveur)/, 'cloud'],
  [/(support|ticket|aide|discussion)/, 'chat'],
  [/(\bia\b|assistant|intelligence)/, 'sparkle'],
  [/(browser|navigat|\bsite|\bweb\b|page)/, 'globe'],
  [/(bonjour|bonsoir|accueil|bienvenue|demarr)/, 'rocket'],
  [/(cle\b|connexion|mot de passe|session|verrou|suspendu)/, 'lock'],
  [/(statistique|ouverture|graphique|courbe|tendance|actifs)/, 'chart'],
];
// Icônes de NEXORA (composant Kpi du back office) vers objets.
const ICON_OBJECTS = {
  user: 'team', group: 'team', users: 'team', laptop: 'devices', layers: 'folder', folder: 'folder', folderOpen: 'folder',
  pdf: 'receipt', check: 'coins', clock: 'clock', pencil: 'pencil', sync: 'pulse', shield: 'shield', chat: 'chat',
  star: 'star', cloud: 'cloud', bell: 'bell', mail: 'mail', download: 'database', globe: 'globe', code: 'code',
  phone: 'phone', android: 'phone', cube: 'cube', palette: 'palette', image: 'palette', warn: 'shield', lock: 'lock',
  sparkle: 'sparkle', chart: 'chart', grid: 'chart', bolt: 'pulse', wrench: 'code', plus: 'plus', send: 'plane',
};
export const SPACE_OBJECTS = { preview: 'devices', browser: 'globe', dev: 'code', android: 'phone', studio: 'cube', design: 'palette', security: 'shield', desktop: 'monitor' };

export function objectFor(...texts) {
  for (const t of texts) {
    if (!t) continue;
    if (OBJECTS[t]) return t;
    if (ICON_OBJECTS[t]) return ICON_OBJECTS[t];
    const s = norm(t);
    for (const [re, name] of RULES) if (re.test(s)) return name;
  }
  return 'chart';
}
