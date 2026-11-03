/* Messages affichés à l'utilisateur : on garde l'utile, on retire les détails internes (noms des outils
 * employés en coulisse, versions, commandes, chemins de travail temporaires). Le détail technique complet
 * est conservé dans un journal local pour l'assistance. */
const fs = require('fs');
const path = require('path');
const os = require('os');

const RULES = [
  [/\s*\((?:d8|r8|aapt2?|zipalign|apksigner|jarsigner|bundletool|adb|zxing|workbox|gradle|javac|keytool)[^)]*\)/gi, ''],
  [/firebase messaging\s*v?\d[\w.-]*/gi, 'le kit de notifications'],
  [/\bfirebase messaging\b/gi, 'le kit de notifications'],
  [/\baapt2?\b/gi, 'la compilation des ressources'],
  [/\b[dr]8\b/gi, 'la compilation du code'],
  [/\b(apksigner|jarsigner)\b/gi, 'la signature'],
  [/\bzipalign\b/gi, 'l’optimisation du fichier'],
  [/\bkeytool\b/gi, 'la création de la clé'],
  [/\bbundletool\b/gi, 'l’outil Play Store'],
  [/\badb\b/g, 'la connexion au téléphone'],
  [/\b(open)?jdk\b|\bjava\s?\d+\b|\btemurin\b/gi, 'le moteur de compilation'],
  [/\bcloudflared\b/gi, 'le module de partage'],
  [/\bgradle\b/gi, ''],
  [/\b(?:build-tools|platform-tools)\b(?:\s+[\d.]+)?/gi, 'les outils Android'],
  [/(?:[A-Za-z]:\\|\/)(?:tmp|Temp|AppData\\Local\\Temp)[^\s'"«»)]*(?:vitrine|nexora)-[^\s'"«»)]*/g, 'un dossier temporaire'],
  [/\s{2,}/g, ' '],
];

function plain(text) {
  let s = String(text == null ? '' : text);
  for (const [re, by] of RULES) s = s.replace(re, by);
  s = s.trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function logDir() {
  try {
    // eslint-disable-next-line global-require
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'journaux');
  } catch { return path.join(os.tmpdir(), 'nexora-journaux'); }
}

/* Détail technique enregistré localement ; renvoie le chemin du fichier. */
function techLog(kind, text) {
  try {
    const dir = logDir();
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, `${kind}-${new Date().toISOString().slice(0, 10)}.txt`);
    fs.appendFileSync(f, `\n[${new Date().toISOString()}]\n${text}\n`);
    return f;
  } catch { return ''; }
}

module.exports = { plain, techLog, logDir };
