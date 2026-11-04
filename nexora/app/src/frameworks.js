'use strict';
// Analyse d'un dossier : quel framework, quels SDK, quelles commandes d'installation et de lancement.
const fs = require('fs');
const path = require('path');

const IS_WIN = process.platform === 'win32';

function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

const NODE_TOOLS = [
  // [dépendance, id, libellé, port par défaut]
  ['next', 'next', 'Next.js', 3000],
  ['nuxt', 'nuxt', 'Nuxt', 3000],
  ['@sveltejs/kit', 'sveltekit', 'SvelteKit', 5173],
  ['astro', 'astro', 'Astro', 4321],
  ['gatsby', 'gatsby', 'Gatsby', 8000],
  ['@remix-run/dev', 'remix', 'Remix', 5173],
  ['@react-router/dev', 'react-router', 'React Router', 5173],
  ['@tanstack/react-start', 'tanstack-start', 'TanStack Start', 3000],
  ['@solidjs/start', 'solid-start', 'SolidStart', 3000],
  ['@builder.io/qwik', 'qwik', 'Qwik', 5173],
  ['expo', 'expo', 'Expo (web)', 8081],
  ['react-scripts', 'cra', 'Create React App', 3000],
  ['@angular/cli', 'angular', 'Angular', 4200],
  ['@vue/cli-service', 'vue-cli', 'Vue CLI', 8080],
  ['@docusaurus/core', 'docusaurus', 'Docusaurus', 3000],
  ['vitepress', 'vitepress', 'VitePress', 5173],
  ['@11ty/eleventy', 'eleventy', 'Eleventy', 8080],
  ['ember-cli', 'ember', 'Ember', 4200],
  ['vite', 'vite', 'Vite', 5173],
  ['@rsbuild/core', 'rsbuild', 'Rsbuild', 3000],
  ['@rspack/cli', 'rspack', 'Rspack', 8080],
  ['parcel', 'parcel', 'Parcel', 1234],
  ['webpack-dev-server', 'webpack', 'Webpack', 8080],
  ['@storybook/react', 'storybook', 'Storybook', 6006],
];

const UI_LIBS = [
  ['react', 'React'], ['vue', 'Vue'], ['svelte', 'Svelte'], ['solid-js', 'Solid'], ['preact', 'Preact'], ['lit', 'Lit'], ['@angular/core', 'Angular'],
];

function staticDirsOf(dir) {
  return ['dist', 'build', 'out', 'www', 'public', '_site', 'build/web']
    .filter((d) => fs.existsSync(path.join(dir, d, 'index.html')));
}

function base(dir) {
  return {
    dir,
    name: path.basename(dir),
    kind: 'static',
    id: 'static',
    label: 'Site statique',
    sdks: [],
    minVersions: {},
    pm: null,
    scripts: {},
    script: null,
    install: [],
    installNeeded: false,
    run: null,
    side: [],
    defaultPort: 3000,
    env: {},
    watch: null,
    needsWebSupport: false,
    unsupported: null,
    notes: [],
    staticDirs: staticDirsOf(dir),
    hasIndexHtml: fs.existsSync(path.join(dir, 'index.html')),
  };
}

function analyzeNode(dir, a, pkg) {
  const has = (f) => fs.existsSync(path.join(dir, f));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  a.kind = 'node';
  a.name = pkg.name || a.name;
  a.scripts = pkg.scripts || {};
  const needNode = nodeRequirement(dir, pkg, deps);
  if (needNode) a.minVersions.node = needNode;

  if (has('pnpm-lock.yaml')) a.pm = 'pnpm';
  else if (has('yarn.lock')) a.pm = 'yarn';
  else if (has('bun.lockb') || has('bun.lock')) a.pm = 'bun';
  else a.pm = 'npm';
  a.sdks = a.pm === 'npm' ? ['node'] : ['node', a.pm];

  const tool = NODE_TOOLS.find(([dep]) => deps[dep]);
  const ui = UI_LIBS.find(([dep]) => deps[dep]);
  if (tool) {
    [, a.id, a.label, a.defaultPort] = tool;
    if (['vite', 'rsbuild', 'rspack', 'parcel', 'webpack'].includes(a.id) && ui && ui[1] !== a.label) a.label = `${a.label} + ${ui[1]}`;
  } else {
    a.id = ui ? ui[0] : 'node';
    a.label = ui ? ui[1] : 'Node.js';
  }

  // React Native sans cible web : rien ne peut s'afficher dans une page.
  if (deps['react-native'] && !deps['react-native-web'] && !deps.expo) {
    a.unsupported = {
      title: 'Application React Native sans version web',
      message: 'Ce projet cible Android et iOS uniquement. Pour l\'afficher dans NEXORA, ajoute une cible web avec react-native-web (ou migre vers Expo, qui la gère).',
      steps: [
        { text: 'Dans le dossier du projet, installe react-native-web :', cmd: `${a.pm === 'npm' ? 'npm install' : `${a.pm} add`} react-native-web react-dom` },
        { text: 'Guide de configuration :', url: 'https://necolas.github.io/react-native-web/docs/setup/', label: 'React Native for Web' },
      ],
    };
  }

  const order = a.id === 'expo' ? ['web', 'dev', 'start']
    : a.id === 'cra' ? ['start', 'dev']
      : a.id === 'storybook' ? ['storybook', 'dev', 'start']
        : ['dev', 'start', 'serve', 'develop', 'web', 'preview'];
  a.script = order.find((s) => a.scripts[s]) || Object.keys(a.scripts)[0] || null;

  if (a.id === 'expo') {
    a.run = 'npx expo start --web --port {port}';
    a.env = { CI: '1', EXPO_NO_TELEMETRY: '1' };
  } else if (a.script) {
    a.run = a.pm === 'yarn' ? 'yarn {script}' : a.pm === 'bun' ? 'bun run {script}' : `${a.pm} run {script}`;
    if (a.id === 'angular') a.env = { NG_CLI_ANALYTICS: 'false' };
  } else if (a.staticDirs.length || a.hasIndexHtml) {
    a.kind = 'static';
  } else {
    a.unsupported = a.unsupported || {
      title: 'Aucun script de lancement',
      message: 'Le fichier package.json ne contient aucun script (dev, start…). Ajoute un script de développement ou ouvre le dossier de build.',
      steps: [],
    };
  }

  if (!has('node_modules')) {
    a.installNeeded = true;
    a.install = [{ cmd: a.pm === 'yarn' ? 'yarn install' : `${a.pm} install`, label: 'Installation des dépendances' }];
  }
  return a;
}

/* NEXORA #016 : version minimale de Node.js (numéro majeur) demandée par le projet : .nvmrc,
 * .node-version, champ engines.node du package.json, et exigences des outils qui le déclarent
 * (Vite 7 et plus, Next.js 16 et plus, Angular 20 et plus : Node.js 20). */
function lowestMajor(range) {
  let best = 0;
  for (const part of String(range || '').split('||')) {
    let low = 0;
    for (const m of part.matchAll(/(>=|>|\^|~|=|v|\s|^)(\d+)(?:\.\d+|\.x)*/g)) {
      if (part.slice(Math.max(0, m.index - 1), m.index + 1).includes('<')) continue;
      low = Math.max(low, Number(m[2]));
    }
    if (low && (!best || low < best)) best = low;
  }
  return best;
}
function depMajor(v) { const m = /(\d+)/.exec(String(v || '')); return m ? Number(m[1]) : 0; }
function nodeRequirement(dir, pkg, deps) {
  let need = 0;
  for (const f of ['.nvmrc', '.node-version']) {
    const m = /^\s*v?(\d+)/.exec(readText(path.join(dir, f)));
    if (m) need = Math.max(need, Number(m[1]));
  }
  need = Math.max(need, lowestMajor(pkg.engines && pkg.engines.node));
  if (depMajor(deps.vite) >= 7 || depMajor(deps.next) >= 16 || depMajor(deps['@angular/core']) >= 20) need = Math.max(need, 20);
  return need;
}

function pythonEntry(dir) {
  return ['app.py', 'main.py', 'server.py', 'wsgi.py', 'run.py'].find((f) => fs.existsSync(path.join(dir, f))) || 'app.py';
}

function venvPython(dir) {
  for (const v of ['.venv', 'venv', 'env']) {
    const p = IS_WIN ? path.join(dir, v, 'Scripts', 'python.exe') : path.join(dir, v, 'bin', 'python');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function analyzeProject(dir) {
  const a = base(dir);
  const has = (f) => fs.existsSync(path.join(dir, f));
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch { /* dossier illisible */ }

  // Flutter
  const pubspec = readText(path.join(dir, 'pubspec.yaml'));
  if (pubspec && /sdk:\s*flutter/.test(pubspec)) {
    const m = pubspec.match(/^name:\s*(\S+)/m);
    Object.assign(a, {
      kind: 'flutter', id: 'flutter', label: 'Flutter (web)', name: m ? m[1] : a.name, sdks: ['flutter', 'git'], defaultPort: 8090,
      run: 'flutter run -d web-server --web-port {port} --web-hostname localhost',
      watch: { dirs: ['lib'], key: 'r' },
      needsWebSupport: !has('web'),
    });
    if (!has(path.join('.dart_tool', 'package_config.json'))) {
      a.installNeeded = true;
      a.install = [{ cmd: 'flutter pub get', label: 'Récupération des paquets Dart' }];
    }
    a.notes.push('La première compilation Flutter pour le web prend souvent une à deux minutes.');
    return a;
  }

  // Node.js (React, Next.js, Vue, Angular, Svelte, Expo…)
  const pkg = readJSON(path.join(dir, 'package.json'));
  const isLaravel = has('artisan');
  if (pkg && !isLaravel) return analyzeNode(dir, a, pkg);

  // Deno
  const denoCfg = readJSON(path.join(dir, 'deno.json')) || readJSON(path.join(dir, 'deno.jsonc'));
  if (denoCfg) {
    const tasks = denoCfg.tasks || {};
    const task = ['dev', 'start'].find((t) => tasks[t]);
    Object.assign(a, {
      kind: 'deno', id: 'deno', label: denoCfg.imports && JSON.stringify(denoCfg.imports).includes('fresh') ? 'Fresh (Deno)' : 'Deno', sdks: ['deno'], defaultPort: 8000,
      run: task ? `deno task ${task}` : null, env: {},
    });
    if (!task) a.unsupported = { title: 'Aucune tâche de lancement', message: 'Le fichier deno.json ne contient pas de tâche dev ou start.', steps: [] };
    return a;
  }

  // PHP : Laravel, Symfony, WordPress, PHP simple
  if (isLaravel) {
    Object.assign(a, {
      kind: 'php', id: 'laravel', label: 'Laravel', sdks: ['php', 'composer'], defaultPort: 8000,
      run: 'php artisan serve --host=127.0.0.1 --port={port}',
    });
    if (!has('vendor')) { a.installNeeded = true; a.install.push({ cmd: 'composer install', label: 'Installation des dépendances PHP' }); }
    if (!has('.env') && has('.env.example')) {
      a.installNeeded = true;
      a.install.push({ copy: ['.env.example', '.env'], label: 'Création du fichier .env' });
      a.install.push({ cmd: 'php artisan key:generate', label: 'Génération de la clé de l\'application' });
    }
    if (pkg && (pkg.devDependencies || {})['laravel-vite-plugin']) {
      a.sdks.push('node');
      a.side.push({ cmd: 'npm run dev', label: 'Vite (styles et scripts)' });
      if (!has('node_modules')) { a.installNeeded = true; a.install.push({ cmd: 'npm install', label: 'Installation des dépendances JavaScript' }); }
    }
    a.notes.push('Si le site utilise une base de données, elle doit être configurée dans le fichier .env.');
    return a;
  }
  if (has('wp-config.php') || has('wp-config-sample.php')) {
    a.kind = 'php';
    a.id = 'wordpress';
    a.label = 'WordPress';
    a.unsupported = {
      title: 'WordPress a besoin d\'une base de données',
      message: 'Lance le site avec un outil comme LocalWP, XAMPP ou Laragon, puis colle son adresse locale (par exemple http://monsite.local) dans NEXORA.',
      steps: [{ text: 'LocalWP installe WordPress, PHP et MySQL en un clic :', url: 'https://localwp.com/', label: 'Télécharger LocalWP' }],
    };
    return a;
  }
  const composer = readJSON(path.join(dir, 'composer.json'));
  if (composer || has('index.php') || has(path.join('public', 'index.php'))) {
    const docroot = has(path.join('public', 'index.php')) ? 'public' : '.';
    Object.assign(a, {
      kind: 'php', id: has(path.join('bin', 'console')) ? 'symfony' : 'php', label: has(path.join('bin', 'console')) ? 'Symfony' : 'PHP',
      sdks: composer ? ['php', 'composer'] : ['php'], defaultPort: 8000,
      run: `php -S 127.0.0.1:{port} -t ${docroot}`,
    });
    if (composer && !has('vendor')) { a.installNeeded = true; a.install.push({ cmd: 'composer install', label: 'Installation des dépendances PHP' }); }
    return a;
  }

  // Python : Django, Flask, FastAPI, Streamlit
  const reqs = readText(path.join(dir, 'requirements.txt')).toLowerCase();
  const pyproject = readText(path.join(dir, 'pyproject.toml')).toLowerCase();
  const pyDeps = `${reqs}\n${pyproject}`;
  if (has('manage.py') || /\b(flask|fastapi|streamlit|django)\b/.test(pyDeps)) {
    const entry = pythonEntry(dir);
    const mod = entry.replace(/\.py$/, '');
    let id = 'python';
    let label = 'Python';
    let run = null;
    if (has('manage.py')) { id = 'django'; label = 'Django'; run = '{py} manage.py runserver 127.0.0.1:{port}'; }
    else if (/\bstreamlit\b/.test(pyDeps)) { id = 'streamlit'; label = 'Streamlit'; run = `{py} -m streamlit run ${entry} --server.port {port} --server.headless true`; }
    else if (/\bfastapi\b/.test(pyDeps)) { id = 'fastapi'; label = 'FastAPI'; run = `{py} -m uvicorn ${mod}:app --reload --host 127.0.0.1 --port {port}`; }
    else if (/\bflask\b/.test(pyDeps)) { id = 'flask'; label = 'Flask'; run = `{py} -m flask --app ${entry} run --debug --port {port}`; }
    Object.assign(a, {
      kind: 'python', id, label, sdks: ['python'], defaultPort: 8000, run,
    });
    if (!venvPython(dir)) {
      a.installNeeded = true;
      a.install.push({ cmd: '{pysys} -m venv .venv', label: 'Création de l\'environnement virtuel .venv' });
      if (reqs) a.install.push({ cmd: '{py} -m pip install -r requirements.txt', label: 'Installation des dépendances Python' });
    }
    if (!reqs) a.notes.push('Aucun requirements.txt : installe les dépendances dans .venv si le lancement échoue.');
    return a;
  }

  // Ruby : Rails, Jekyll
  const gemfile = readText(path.join(dir, 'Gemfile'));
  if (gemfile || has('_config.yml')) {
    if (/['"]rails['"]/.test(gemfile)) {
      Object.assign(a, {
        kind: 'ruby', id: 'rails', label: 'Ruby on Rails', sdks: ['ruby', 'bundler'], defaultPort: 3000, run: 'bundle exec rails server -b 127.0.0.1 -p {port}',
      });
    } else {
      Object.assign(a, {
        kind: 'ruby', id: 'jekyll', label: 'Jekyll', sdks: gemfile ? ['ruby', 'bundler'] : ['ruby'], defaultPort: 4000,
        run: gemfile ? 'bundle exec jekyll serve --host 127.0.0.1 --port {port} --livereload' : 'jekyll serve --host 127.0.0.1 --port {port}',
      });
    }
    if (gemfile) { a.installNeeded = true; a.install.push({ cmd: 'bundle check || bundle install', label: 'Installation des gems' }); }
    return a;
  }

  // Hugo
  const hugoCfg = ['hugo.toml', 'hugo.yaml', 'hugo.yml', 'hugo.json'].find(has)
    || (['config.toml', 'config.yaml'].find(has) && (has('archetypes') || has('themes') || has('content')) ? 'config' : null);
  if (hugoCfg) {
    Object.assign(a, {
      kind: 'hugo', id: 'hugo', label: 'Hugo', sdks: ['hugo'], defaultPort: 1313, run: 'hugo server --bind 127.0.0.1 -p {port} --disableFastRender',
    });
    return a;
  }

  // .NET
  if (entries.some((f) => /\.(csproj|fsproj)$/i.test(f))) {
    Object.assign(a, {
      kind: 'dotnet', id: 'dotnet', label: 'ASP.NET / Blazor', sdks: ['dotnet'], defaultPort: 5000,
      run: 'dotnet watch run --urls http://localhost:{port}', env: { DOTNET_WATCH_SUPPRESS_LAUNCH_BROWSER: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1' },
    });
    return a;
  }

  // Go
  if (has('go.mod')) {
    Object.assign(a, {
      kind: 'go', id: 'go', label: 'Go', sdks: ['go'], defaultPort: 8080, run: 'go run .',
    });
    a.notes.push('Le serveur doit écouter sur le port indiqué par la variable PORT.');
    return a;
  }

  // Projets natifs sans version web
  if (has('build.gradle') || has('build.gradle.kts') || has(path.join('app', 'build.gradle')) || has(path.join('app', 'build.gradle.kts'))) {
    a.unsupported = {
      title: 'Application Android native',
      message: 'Les applications Kotlin ou Java natives ne s\'affichent pas dans une page web. NEXORA affiche la version web d\'une application : Flutter, React Native avec Expo, ou un site.',
      steps: [],
    };
    a.label = 'Android natif';
    return a;
  }
  if (entries.some((f) => /\.xcodeproj$|\.xcworkspace$/.test(f))) {
    a.unsupported = {
      title: 'Application iOS native',
      message: 'Les applications Swift natives ne s\'affichent pas dans une page web. Utilise le simulateur Xcode sur Mac, ou ouvre la version web de l\'application.',
      steps: [],
    };
    a.label = 'iOS natif';
    return a;
  }

  // Site statique ou dossier de build
  if (a.hasIndexHtml || a.staticDirs.length) {
    a.kind = 'static';
    return a;
  }

  a.unsupported = {
    title: 'Projet non reconnu',
    message: 'Ce dossier ne contient ni package.json, ni pubspec.yaml, ni index.html, ni autre fichier de projet connu. Choisis le dossier racine du projet.',
    steps: [],
  };
  a.label = 'Inconnu';
  return a;
}

function commandPreview(a) {
  if (a.kind === 'static') return 'Serveur statique intégré';
  if (!a.run) return '';
  return a.run.replace('{script}', a.script || 'dev').replace('{port}', String(a.defaultPort)).replace('{py}', 'python');
}

module.exports = { analyzeProject, commandPreview, venvPython };
