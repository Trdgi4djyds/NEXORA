'use strict';
// Kits de développement (SDK) : vérification de leur présence et instructions d'installation.
const { spawn, execFile } = require('child_process');

const IS_WIN = process.platform === 'win32';

/*
 * steps : étapes affichées à l'utilisateur, dans l'ordre.
 *   { text, cmd? (commande à copier), url? (lien à ouvrir), label? (texte du lien) }
 */
const SDKS = {
  node: {
    label: 'Node.js',
    why: 'Node.js installe les dépendances et lance le serveur de développement des projets JavaScript (React, Next.js, Vue, Angular, Svelte, Expo…).',
    check: ['node --version'],
    url: 'https://nodejs.org/fr/download',
    steps: {
      win: [
        { text: 'Installe la version LTS de Node.js avec winget, dans PowerShell ou le Terminal :', cmd: 'winget install OpenJS.NodeJS.LTS' },
        { text: 'Ou télécharge l\'installateur Windows (.msi) et suis les étapes en gardant les options par défaut.', url: 'https://nodejs.org/fr/download', label: 'Télécharger Node.js' },
        { text: 'Vérifie l\'installation dans un nouveau terminal :', cmd: 'node --version' },
      ],
      mac: [
        { text: 'Installe Node.js avec Homebrew :', cmd: 'brew install node' },
        { text: 'Ou télécharge l\'installateur macOS (.pkg).', url: 'https://nodejs.org/fr/download', label: 'Télécharger Node.js' },
      ],
      linux: [
        { text: 'Installe Node.js depuis le site officiel ou le gestionnaire de paquets de ta distribution.', url: 'https://nodejs.org/fr/download', label: 'Télécharger Node.js' },
      ],
    },
  },
  yarn: {
    label: 'Yarn',
    why: 'Ce projet contient un fichier yarn.lock : ses dépendances se gèrent avec Yarn.',
    check: ['yarn --version'],
    url: 'https://yarnpkg.com/getting-started/install',
    steps: {
      all: [
        { text: 'Yarn est fourni avec Node.js via Corepack. Active-le dans un terminal (en administrateur sous Windows) :', cmd: 'corepack enable' },
        { text: 'Ou installe Yarn globalement avec npm :', cmd: 'npm install -g yarn' },
      ],
    },
  },
  pnpm: {
    label: 'pnpm',
    why: 'Ce projet contient un fichier pnpm-lock.yaml : ses dépendances se gèrent avec pnpm.',
    check: ['pnpm --version'],
    url: 'https://pnpm.io/fr/installation',
    steps: {
      all: [
        { text: 'Active pnpm via Corepack (fourni avec Node.js) :', cmd: 'corepack enable pnpm' },
        { text: 'Ou installe pnpm globalement avec npm :', cmd: 'npm install -g pnpm' },
      ],
    },
  },
  bun: {
    label: 'Bun',
    why: 'Ce projet contient un fichier bun.lock : ses dépendances se gèrent avec Bun.',
    check: ['bun --version'],
    url: 'https://bun.sh/docs/installation',
    steps: {
      win: [{ text: 'Installe Bun dans PowerShell :', cmd: 'powershell -c "irm bun.sh/install.ps1 | iex"' }],
      mac: [{ text: 'Installe Bun dans le Terminal :', cmd: 'curl -fsSL https://bun.sh/install | bash' }],
      linux: [{ text: 'Installe Bun dans le terminal :', cmd: 'curl -fsSL https://bun.sh/install | bash' }],
    },
  },
  flutter: {
    label: 'Flutter',
    why: 'Flutter compile l\'application pour le web et la sert localement, avec rechargement à chaque modification du code.',
    check: ['flutter --version'],
    url: 'https://docs.flutter.dev/install/manual',
    steps: {
      win: [
        { text: 'Installe Git pour Windows, nécessaire à Flutter :', cmd: 'winget install Git.Git' },
        { text: 'Télécharge le SDK Flutter pour Windows (fichier flutter_windows_…-stable.zip), version stable.', url: 'https://docs.flutter.dev/install/archive', label: 'Archive des SDK Flutter' },
        { text: 'Crée le dossier %USERPROFILE%\\develop puis décompresse le fichier dedans, par exemple dans PowerShell :', cmd: 'Expand-Archive -Path "$env:USERPROFILE\\Downloads\\flutter_windows_VERSION-stable.zip" -DestinationPath "$env:USERPROFILE\\develop"' },
        { text: 'Ajoute Flutter au PATH : touche Windows, tape « variables d\'environnement », ouvre « Modifier les variables d\'environnement pour votre compte », sélectionne Path, Modifier, Nouveau, puis colle :', cmd: '%USERPROFILE%\\develop\\flutter\\bin' },
        { text: 'Ferme les terminaux ouverts, puis vérifie dans un nouveau terminal :', cmd: 'flutter doctor' },
      ],
      mac: [
        { text: 'Télécharge le SDK Flutter pour macOS et décompresse-le dans ~/develop, puis ajoute ~/develop/flutter/bin au PATH.', url: 'https://docs.flutter.dev/install/manual', label: 'Guide d\'installation' },
        { text: 'Vérifie l\'installation :', cmd: 'flutter doctor' },
      ],
      linux: [
        { text: 'Télécharge le SDK Flutter pour Linux et décompresse-le dans ~/develop, puis ajoute ~/develop/flutter/bin au PATH.', url: 'https://docs.flutter.dev/install/manual', label: 'Guide d\'installation' },
        { text: 'Vérifie l\'installation :', cmd: 'flutter doctor' },
      ],
    },
  },
  deno: {
    label: 'Deno',
    why: 'Ce projet contient un fichier deno.json : il se lance avec Deno.',
    check: ['deno --version'],
    url: 'https://docs.deno.com/runtime/getting_started/installation/',
    steps: {
      win: [{ text: 'Installe Deno :', cmd: 'winget install DenoLand.Deno' }],
      mac: [{ text: 'Installe Deno :', cmd: 'brew install deno' }],
      linux: [{ text: 'Installe Deno :', cmd: 'curl -fsSL https://deno.land/install.sh | sh' }],
    },
  },
  php: {
    label: 'PHP',
    why: 'PHP exécute le site (Laravel, Symfony, WordPress ou PHP simple) avec son serveur intégré.',
    check: ['php --version'],
    url: 'https://www.php.net/downloads',
    steps: {
      win: [
        { text: 'Installe PHP avec winget :', cmd: 'winget install PHP.PHP.8.4' },
        { text: 'Ferme et rouvre les terminaux, puis vérifie :', cmd: 'php --version' },
      ],
      mac: [{ text: 'Installe PHP avec Homebrew :', cmd: 'brew install php' }],
      linux: [{ text: 'Installe PHP avec le gestionnaire de paquets de ta distribution.', url: 'https://www.php.net/downloads', label: 'Téléchargements PHP' }],
    },
  },
  composer: {
    label: 'Composer',
    why: 'Composer installe les dépendances PHP du projet (dossier vendor).',
    check: ['composer --version'],
    url: 'https://getcomposer.org/download/',
    steps: {
      win: [{ text: 'Télécharge et lance Composer-Setup.exe, en gardant les options par défaut.', url: 'https://getcomposer.org/download/', label: 'Télécharger Composer' }],
      mac: [{ text: 'Installe Composer avec Homebrew :', cmd: 'brew install composer' }],
      linux: [{ text: 'Installe Composer en suivant le guide officiel.', url: 'https://getcomposer.org/download/', label: 'Télécharger Composer' }],
    },
  },
  python: {
    label: 'Python',
    why: 'Python lance le site (Django, Flask, FastAPI ou Streamlit) et installe ses dépendances dans un environnement virtuel.',
    check: IS_WIN ? ['py -3 --version', 'python --version'] : ['python3 --version', 'python --version'],
    url: 'https://www.python.org/downloads/',
    steps: {
      win: [
        { text: 'Installe Python avec winget :', cmd: 'winget install Python.Python.3.13' },
        { text: 'Ou télécharge l\'installateur et coche « Add python.exe to PATH » au premier écran.', url: 'https://www.python.org/downloads/', label: 'Télécharger Python' },
      ],
      mac: [{ text: 'Installe Python avec Homebrew :', cmd: 'brew install python' }],
      linux: [{ text: 'Installe python3 et python3-venv avec le gestionnaire de paquets de ta distribution.' }],
    },
  },
  ruby: {
    label: 'Ruby',
    why: 'Ruby lance le site (Ruby on Rails ou Jekyll) et Bundler installe ses dépendances.',
    check: ['ruby --version'],
    url: 'https://rubyinstaller.org/downloads/',
    steps: {
      win: [
        { text: 'Télécharge Ruby+Devkit (version recommandée) et lance l\'installateur. À la fin, laisse cocher « ridk install ».', url: 'https://rubyinstaller.org/downloads/', label: 'Télécharger Ruby' },
        { text: 'Installe ensuite Bundler :', cmd: 'gem install bundler' },
      ],
      mac: [{ text: 'Installe Ruby avec Homebrew, puis Bundler :', cmd: 'brew install ruby && gem install bundler' }],
      linux: [{ text: 'Installe Ruby avec le gestionnaire de paquets de ta distribution, puis Bundler :', cmd: 'gem install bundler' }],
    },
  },
  bundler: {
    label: 'Bundler',
    why: 'Bundler installe les dépendances Ruby du projet (Gemfile).',
    check: ['bundle --version'],
    url: 'https://bundler.io/',
    steps: { all: [{ text: 'Installe Bundler :', cmd: 'gem install bundler' }] },
  },
  hugo: {
    label: 'Hugo',
    why: 'Hugo génère et sert le site statique avec rechargement automatique.',
    check: ['hugo version'],
    url: 'https://gohugo.io/installation/',
    steps: {
      win: [{ text: 'Installe Hugo (édition étendue) :', cmd: 'winget install Hugo.Hugo.Extended' }],
      mac: [{ text: 'Installe Hugo :', cmd: 'brew install hugo' }],
      linux: [{ text: 'Installe Hugo en suivant le guide officiel.', url: 'https://gohugo.io/installation/', label: 'Installer Hugo' }],
    },
  },
  dotnet: {
    label: 'SDK .NET',
    why: 'Le SDK .NET compile et lance l\'application ASP.NET ou Blazor.',
    check: ['dotnet --version'],
    url: 'https://dotnet.microsoft.com/fr-fr/download',
    steps: {
      win: [{ text: 'Installe le SDK .NET :', cmd: 'winget install Microsoft.DotNet.SDK.9' }],
      mac: [{ text: 'Télécharge le SDK .NET pour macOS.', url: 'https://dotnet.microsoft.com/fr-fr/download', label: 'Télécharger .NET' }],
      linux: [{ text: 'Installe le SDK .NET en suivant le guide officiel.', url: 'https://dotnet.microsoft.com/fr-fr/download', label: 'Télécharger .NET' }],
    },
  },
  go: {
    label: 'Go',
    why: 'Go compile et lance le serveur web du projet.',
    check: ['go version'],
    url: 'https://go.dev/dl/',
    steps: {
      win: [{ text: 'Installe Go :', cmd: 'winget install GoLang.Go' }],
      mac: [{ text: 'Installe Go :', cmd: 'brew install go' }],
      linux: [{ text: 'Installe Go en suivant le guide officiel.', url: 'https://go.dev/dl/', label: 'Télécharger Go' }],
    },
  },
  // NEXORA #016 : Flutter a besoin de Git pour se mettre à jour et récupérer ses paquets.
  git: {
    label: 'Git',
    why: 'Flutter et de nombreux gestionnaires de paquets utilisent Git pour récupérer leur code et leurs dépendances.',
    check: ['git --version'],
    url: 'https://git-scm.com/downloads',
    steps: {
      win: [{ text: 'Installe Git pour Windows :', cmd: 'winget install Git.Git' }],
      mac: [{ text: 'Installe Git avec les outils de développement d\'Apple :', cmd: 'xcode-select --install' }],
      linux: [{ text: 'Installe Git avec le gestionnaire de paquets de ta distribution.', url: 'https://git-scm.com/downloads', label: 'Télécharger Git' }],
    },
  },
};

function stepsFor(id, platform = process.platform) {
  const sdk = SDKS[id];
  if (!sdk) return [];
  const s = sdk.steps;
  return s.all || (platform === 'win32' ? s.win : platform === 'darwin' ? s.mac : s.linux) || s.win || [];
}

// NEXORA #016 : outils installés par NEXORA, toujours placés avant ceux du système (une ancienne
// version installée sur le PC ne doit pas passer devant la version que NEXORA vient d'installer).
let preferred = [];
function setPreferred(dirs) { preferred = (dirs || []).slice(); }

// Sous Windows, une installation faite pendant que NEXORA tourne n'apparaît pas dans son PATH :
// on relit le PATH du système et de l'utilisateur dans le registre.
let lastRefresh = 0;
function refreshPath() {
  if (!IS_WIN || Date.now() - lastRefresh < 4000) return Promise.resolve();
  lastRefresh = Date.now();
  const ps = "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')";
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 8000 }, (err, stdout) => {
      if (!err && stdout) {
        const current = (process.env.Path || process.env.PATH || '').split(';');
        const fresh = stdout.trim().split(';').map((p) => p.replace(/%([^%]+)%/g, (_m, v) => process.env[v] || `%${v}%`));
        const merged = [...new Set([...preferred, ...fresh, ...current].filter(Boolean))].join(';');
        process.env.Path = merged;
        process.env.PATH = merged;
      }
      resolve();
    });
  });
}

function runVersion(cmd, cwd) {
  return new Promise((resolve) => {
    const p = spawn(cmd, {
      shell: true, windowsHide: true, cwd: cwd || undefined, env: process.env,
    });
    let out = '';
    const timer = setTimeout(() => { try { p.kill(); } catch { /* ignore */ } resolve(null); }, 20000);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('error', () => { clearTimeout(timer); resolve(null); });
    p.on('exit', (code) => {
      clearTimeout(timer);
      const line = out.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !/^warning/i.test(l)) || '';
      if (code !== 0 || /not found|n'est pas reconnu|introuvable|was not found|Microsoft Store/i.test(out)) resolve(null);
      else resolve(line.slice(0, 120));
    });
  });
}

const cache = new Map();
async function checkSdk(id, { fresh = false } = {}) {
  const sdk = SDKS[id];
  if (!sdk) return { id, ok: true };
  if (!fresh && cache.has(id) && Date.now() - cache.get(id).at < 30000) return cache.get(id).res;
  await refreshPath();
  let res = null;
  for (const cmd of sdk.check) {
    // eslint-disable-next-line no-await-in-loop
    const version = await runVersion(cmd);
    if (version) { res = { id, ok: true, version, command: cmd.split(' ')[0] === 'py' ? 'py -3' : cmd.split(' ')[0] }; break; }
  }
  if (!res) res = { id, ok: false };
  cache.set(id, { at: Date.now(), res });
  return res;
}

async function checkSdks(ids, opts) {
  const out = {};
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    out[id] = await checkSdk(id, opts);
  }
  return out;
}

function describe(id, platform) {
  const sdk = SDKS[id];
  if (!sdk) return null;
  return {
    id, label: sdk.label, why: sdk.why, url: sdk.url, steps: stepsFor(id, typeof platform === 'string' ? platform : undefined),
  };
}

module.exports = {
  SDKS, checkSdk, checkSdks, describe, refreshPath, setPreferred,
};
