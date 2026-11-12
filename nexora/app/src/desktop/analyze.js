'use strict';
/* NEXORA #023 : analyse d'un dossier choisi dans le Desktop Builder.
 * Trois cas : site déjà prêt (index.html), projet web à construire (Vite, React, Angular, Astro, Flutter…, détecté par
 * frameworks.js) ou projet Electron existant. Pour un projet web, on propose la commande de construction et le
 * dossier produit ; les projets qui ont besoin d'un serveur (rendu côté serveur, PHP, Python…) sont signalés. */
const fs = require('fs');
const path = require('path');
const { analyzeProject } = require('../frameworks');

const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const has = (dir, rel) => fs.existsSync(path.join(dir, rel));

// Dossier produit par la construction, par outil (le premier qui existe après la construction est retenu).
const OUTPUT = {
  vite: ['dist'], react: ['dist', 'build'], vue: ['dist'], svelte: ['dist', 'build'], solid: ['dist'], preact: ['dist', 'build'], lit: ['dist'],
  cra: ['build'], 'vue-cli': ['dist'], astro: ['dist'], sveltekit: ['build'], next: ['out'], nuxt: ['.output/public', 'dist'], gatsby: ['public'],
  docusaurus: ['build'], vitepress: ['.vitepress/dist', 'docs/.vitepress/dist'], eleventy: ['_site'], parcel: ['dist'], webpack: ['dist', 'build'],
  rsbuild: ['dist'], rspack: ['dist'], remix: ['build/client'], 'react-router': ['build/client'], qwik: ['dist'], expo: ['dist'], ember: ['dist'],
  angular: ['dist'], storybook: ['storybook-static'], flutter: ['build/web'], hugo: ['public'], jekyll: ['_site'], node: ['dist', 'build', 'out', 'public'],
};
const SERVER_ONLY = {
  'tanstack-start': 'TanStack Start', 'solid-start': 'SolidStart', php: 'PHP', laravel: 'Laravel', symfony: 'Symfony', wordpress: 'WordPress',
  django: 'Django', flask: 'Flask', fastapi: 'FastAPI', streamlit: 'Streamlit', python: 'Python', rails: 'Ruby on Rails', dotnet: 'ASP.NET', go: 'Go', deno: 'Deno',
};

function runCmd(pm, script) {
  if (pm === 'yarn') return `yarn ${script}`;
  if (pm === 'bun') return `bun run ${script}`;
  return `${pm || 'npm'} run ${script}`;
}
function angularOutput(dir, name) {
  const cfg = readJSON(path.join(dir, 'angular.json'));
  const projects = cfg && cfg.projects ? Object.entries(cfg.projects) : [];
  for (const [id, p] of projects) {
    const opt = p && p.architect && p.architect.build && p.architect.build.options;
    const out = opt && (typeof opt.outputPath === 'string' ? opt.outputPath : opt.outputPath && opt.outputPath.base);
    if (out) return [`${out}/browser`, out];
    return [`dist/${id}/browser`, `dist/${id}`];
  }
  return [`dist/${name}/browser`, `dist/${name}`, 'dist'];
}
function nextIsStatic(dir) {
  for (const f of ['next.config.js', 'next.config.mjs', 'next.config.ts', 'next.config.cjs']) {
    if (/output\s*:\s*['"]export['"]/.test(readText(path.join(dir, f)))) return true;
  }
  return false;
}

/* Icônes candidates trouvées dans le projet (en images intégrées, pour le choix dans l'interface). */
const ICON_FILES = [
  'build/icon.png', 'resources/icon.png', 'assets/icon.png', 'icon.png', 'public/icon-512.png', 'public/icon-512x512.png', 'public/android-chrome-512x512.png',
  'public/logo512.png', 'public/pwa-512x512.png', 'public/apple-touch-icon.png', 'public/favicon.svg', 'public/logo.svg', 'static/favicon.png', 'src/assets/logo.png',
  'src/assets/logo.svg', 'assets/logo.png', 'logo.png', 'logo.svg', 'favicon.svg', 'public/favicon.png', 'public/favicon.ico', 'favicon.ico', 'web/icons/Icon-512.png',
];
const MIME = { '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
function iconCandidates(dir, extraDirs = []) {
  const out = [];
  const add = (file) => {
    if (out.length >= 6 || out.some((o) => o.path === file)) return;
    try {
      const st = fs.statSync(file);
      const mime = MIME[path.extname(file).toLowerCase()];
      if (!st.isFile() || !mime || st.size > 2e6) return;
      out.push({ path: file, name: path.relative(dir, file).replace(/\\/g, '/'), dataUrl: `data:${mime};base64,${fs.readFileSync(file).toString('base64')}` });
    } catch { /* fichier absent */ }
  };
  // Icônes déclarées dans un manifeste d'application web (les plus grandes d'abord).
  for (const base of [dir, ...extraDirs]) {
    for (const m of ['public/manifest.json', 'public/manifest.webmanifest', 'public/site.webmanifest', 'manifest.json', 'manifest.webmanifest', 'site.webmanifest', 'web/manifest.json']) {
      const j = readJSON(path.join(base, m));
      const icons = j && Array.isArray(j.icons) ? j.icons.slice().sort((a, b) => parseInt(String(b.sizes || '0'), 10) - parseInt(String(a.sizes || '0'), 10)) : [];
      // Adresse absolue (/icon.png) : depuis la racine du site (public/ pour Vite et React) ; sinon depuis le manifeste.
      const webRoot = path.join(base, m.startsWith('public/') ? 'public' : m.startsWith('web/') ? 'web' : '.');
      for (const ic of icons.slice(0, 2)) {
        const src = String((ic && ic.src) || '').split(/[?#]/)[0];
        if (src && !/^[a-z]+:/i.test(src)) add(src.startsWith('/') ? path.join(webRoot, src) : path.join(path.dirname(path.join(base, m)), src));
      }
    }
  }
  for (const base of [dir, ...extraDirs]) for (const f of ICON_FILES) add(path.join(base, f));
  return out;
}

function analyzeElectron(dir, pkg, a) {
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const scripts = pkg.scripts || {};
  const configFile = ['electron-builder.yml', 'electron-builder.yaml', 'electron-builder.json', 'electron-builder.json5', 'electron-builder.toml', 'electron-builder.js', 'electron-builder.cjs', 'electron-builder.mjs', 'electron-builder.ts', 'electron-builder.config.js', 'electron-builder.config.ts']
    .find((f) => has(dir, f)) || (pkg.build ? 'package.json (champ « build »)' : '');
  const forge = Boolean(deps['@electron-forge/cli'] || (pkg.config && pkg.config.forge) || has(dir, 'forge.config.js') || has(dir, 'forge.config.ts') || has(dir, 'forge.config.cjs'));
  const prepare = ['build', 'compile'].find((s) => scripts[s] && !/electron-builder|electron-forge|electron-packager|\bmake\b/.test(scripts[s]));
  Object.assign(a, {
    kind: 'electron',
    label: forge ? 'Projet Electron (Electron Forge)' : configFile ? 'Projet Electron (electron-builder)' : 'Projet Electron',
    framework: 'electron',
    electron: {
      version: String(deps.electron || '').replace(/^[^\d]*/, ''),
      main: pkg.main || '',
      builder: Boolean(configFile),
      configFile,
      forge,
      ownBuilder: Boolean(deps['electron-builder']),
      scripts: Object.keys(scripts).slice(0, 30),
      prepareCmd: prepare ? runCmd(a.pm, prepare) : '',
    },
  });
  if (!pkg.main && !forge) a.warnings.push('Le package.json n’indique pas le fichier principal (champ « main ») : electron-builder prendra index.js.');
  if (forge) a.warnings.push('Ce projet utilise Electron Forge : NEXORA lance sa commande « make » et récupère les installateurs produits.');
  return a;
}

function analyzeDesktopSource(dir) {
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error('Ce dossier est introuvable.');
  const pkg = readJSON(path.join(dir, 'package.json'));
  const p = analyzeProject(dir);
  const author = pkg && (typeof pkg.author === 'string' ? pkg.author.replace(/\s*[<(].*$/, '') : pkg.author && pkg.author.name) || '';
  const a = {
    dir,
    name: (pkg && (pkg.productName || pkg.name)) || p.name || path.basename(dir),
    version: pkg && /^\d+\.\d+\.\d+/.test(pkg.version || '') ? pkg.version : '1.0.0',
    description: (pkg && pkg.description) || '',
    author,
    homepage: (pkg && typeof pkg.homepage === 'string' && /^https?:/.test(pkg.homepage)) ? pkg.homepage : '',
    kind: 'static',
    label: p.label,
    framework: p.id,
    pm: p.pm || 'npm',
    sdks: p.sdks || [],
    buildCmd: '',
    webDir: '',
    webDirs: [],
    needsInstall: Boolean(p.installNeeded),
    electron: null,
    warnings: [],
    unsupported: null,
    icons: [],
  };
  const deps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : {};
  if (pkg && deps.electron) {
    analyzeElectron(dir, pkg, a);
    a.icons = iconCandidates(dir);
    return a;
  }
  if (p.kind === 'static') {
    a.kind = 'static';
    a.label = 'Site statique (HTML, CSS, JavaScript)';
    a.webDirs = p.hasIndexHtml ? [''] : p.staticDirs;
    a.webDir = a.webDirs[0] || '';
    if (!p.hasIndexHtml && !p.staticDirs.length) {
      a.kind = 'unsupported';
      a.unsupported = { title: 'Aucune page d’accueil', message: 'Ce dossier ne contient pas de fichier index.html. Choisissez le dossier du site (celui qui contient index.html) ou le dossier racine d’un projet de code.' };
    }
  } else if (SERVER_ONLY[p.id] || ['php', 'python', 'ruby', 'dotnet', 'go', 'deno'].includes(p.kind) && !['jekyll'].includes(p.id)) {
    a.kind = 'unsupported';
    a.unsupported = {
      title: `${p.label} a besoin d’un serveur`,
      message: 'Ce projet produit ses pages sur un serveur : il ne peut pas être intégré tel quel dans un logiciel. Publiez-le en ligne (ou lancez-le sur votre réseau), puis choisissez la source « Site en ligne » avec son adresse.',
    };
  } else {
    a.kind = 'web';
    const scripts = (pkg && pkg.scripts) || {};
    let outs = OUTPUT[p.id] || OUTPUT.node;
    if (p.id === 'angular') outs = angularOutput(dir, (pkg && pkg.name) || a.name);
    if (p.kind === 'flutter') a.buildCmd = 'flutter build web --release';
    else if (p.kind === 'hugo') a.buildCmd = 'hugo --minify';
    else if (p.id === 'jekyll') a.buildCmd = has(dir, 'Gemfile') ? 'bundle exec jekyll build' : 'jekyll build';
    else if (p.id === 'nuxt') a.buildCmd = scripts.generate ? runCmd(a.pm, 'generate') : 'npx nuxi generate';
    else if (p.id === 'expo') a.buildCmd = 'npx expo export --platform web';
    else if (p.id === 'storybook') a.buildCmd = scripts['build-storybook'] ? runCmd(a.pm, 'build-storybook') : 'npx storybook build';
    else if (scripts.build) a.buildCmd = runCmd(a.pm, 'build');
    a.webDirs = outs;
    a.webDir = outs.find((o) => has(dir, path.join(o, 'index.html'))) || outs[0];
    if (!a.buildCmd) a.warnings.push('Aucun script « build » dans le package.json : indiquez la commande qui produit le site, ou choisissez directement son dossier construit.');
    if (p.id === 'next' && !nextIsStatic(dir)) a.warnings.push('Next.js : ajoutez output: \'export\' dans next.config pour produire un site statique (dossier out). Sans cela, les pages rendues par le serveur ne fonctionneront pas hors ligne.');
    if (p.id === 'sveltekit' && !deps['@sveltejs/adapter-static']) a.warnings.push('SvelteKit : installez @sveltejs/adapter-static pour produire un site statique (dossier build).');
    if (['remix', 'react-router'].includes(p.id)) a.warnings.push('Activez le mode « SPA » (ssr: false) pour produire un site sans serveur (dossier build/client).');
    if (p.unsupported) a.warnings.push(p.unsupported.message);
  }
  a.icons = iconCandidates(dir, a.webDir ? [path.join(dir, a.webDir)] : []);
  return a;
}

module.exports = { analyzeDesktopSource, iconCandidates };
