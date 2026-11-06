'use strict';
/* NEXORA #058 : distribution des logiciels du Desktop Builder, sans Electron (essayé par scripts/test-desktop.mjs).
 *  - suivi des versions d'Electron (fin de prise en charge, d'après endoflife.date) ;
 *  - essai dans le Bac à sable Windows (fichier .wsb : Windows vierge et jetable qui lance l'installateur) ;
 *  - fiches winget (gestionnaire de paquets de Windows, schéma 1.6.0) ;
 *  - mise à jour progressive ou obligatoire (latest.yml : stagingPercentage lu par electron-updater, nxMandatory lu
 *    par le logiciel généré) ;
 *  - publication d'une version (Release) sur GitHub avec ses fichiers, par l'API officielle. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------- versions d'Electron
const EOL_URL = 'https://endoflife.date/api/electron.json';
// Nom d'un fichier, que le chemin soit écrit à la manière de Windows (\\) ou d'Unix (/).
const fileName = (p) => String(p || '').split(/[\\/]/).pop();
const major = (v) => { const m = /^(\d+)/.exec(String(v || '').trim()); return m ? Number(m[1]) : 0; };

/** Cycles d'Electron : [{ major, eol: Date|null (null = encore suivi), latest }], plus récents d'abord. */
function parseCycles(list) {
  return (Array.isArray(list) ? list : []).map((c) => ({
    major: major(c && c.cycle),
    eol: c && typeof c.eol === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.eol) ? new Date(`${c.eol}T00:00:00Z`) : null,
    latest: c && c.latest ? String(c.latest) : '',
  })).filter((c) => c.major > 0).sort((a, b) => b.major - a.major);
}
/** État d'une version : suivie, bientôt plus suivie (moins de 30 jours) ou plus suivie. */
function supportOf(version, cycles, now = Date.now()) {
  const m = major(version);
  const newest = cycles.length ? cycles[0] : null;
  const c = cycles.find((x) => x.major === m);
  if (!m) return { state: 'unknown', major: 0, newest: newest && newest.latest };
  if (!c) return { state: newest && m < newest.major ? 'ended' : 'unknown', major: m, eol: null, newest: newest && newest.latest };
  const ended = c.eol && c.eol.getTime() <= now;
  const soon = c.eol && !ended && c.eol.getTime() - now < 30 * 86400e3;
  return { state: ended ? 'ended' : soon ? 'soon' : 'supported', major: m, eol: c.eol ? c.eol.toISOString().slice(0, 10) : null, latest: c.latest, newest: newest && newest.latest };
}
async function electronCycles(fetchImpl) {
  const res = await fetchImpl(EOL_URL, { headers: { Accept: 'application/json', 'User-Agent': 'NEXORA' } });
  if (!res.ok) throw new Error(`Calendrier d’Electron indisponible (erreur ${res.status}).`);
  return parseCycles(await res.json());
}

// ---------------------------------------------------------------- Bac à sable Windows
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SANDBOX_HOME = 'C:\\Users\\WDAGUtilityAccount\\Desktop';
/** Configuration du Bac à sable : le dossier des fichiers en lecture seule sur le bureau, l'installateur lancé à
 * l'ouverture (msiexec pour un MSI). */
function sandboxConfig({ hostDir, file, folder = 'Logiciel' }) {
  const safe = String(folder).replace(/[^A-Za-z0-9 ._-]+/g, '-').slice(0, 60) || 'Logiciel';
  const inBox = `${SANDBOX_HOME}\\${safe}`;
  const target = `${inBox}\\${path.win32.basename(String(file))}`;
  const cmd = /\.msi$/i.test(file) ? `msiexec /i "${target}"` : /\.zip$/i.test(file) ? `explorer "${inBox}"` : `"${target}"`;
  return `<Configuration>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>${xml(hostDir)}</HostFolder>
      <SandboxFolder>${xml(inBox)}</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>${xml(cmd)}</Command>
  </LogonCommand>
  <Networking>Default</Networking>
</Configuration>
`;
}

// ---------------------------------------------------------------- winget
const WINGET_SCHEMA = '1.6.0';
const PART = /^[^.\s\\/:*?"<>|\u0001-\u001f]{1,32}$/;
const idPart = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9-]+/g, '').slice(0, 32);
/** Identifiant winget : Éditeur.Logiciel (lettres et chiffres). */
function wingetId(publisher, name) {
  const a = idPart(publisher) || idPart(name);
  const b = idPart(name) || 'App';
  return `${a}.${b}`;
}
const y = (v) => JSON.stringify(String(v)); // chaîne YAML entre guillemets (sous-ensemble JSON de YAML)
function wingetManifests({
  id, name, publisher, version, url, sha256, kind = 'nsis', scope = 'user', arch = 'x64', description = '', homepage = '', license = 'Propriétaire', copyright = '', locale = 'fr-FR',
}) {
  if (!String(id).split('.').every((p) => PART.test(p)) || String(id).split('.').length < 2) throw new Error('Identifiant winget invalide (forme Éditeur.Logiciel).');
  if (!/^https:\/\//i.test(String(url || ''))) throw new Error('winget exige l’adresse https publique de l’installateur.');
  if (!/^[0-9a-f]{64}$/i.test(String(sha256 || ''))) throw new Error('Empreinte SHA-256 de l’installateur manquante.');
  if (!/^\d+\.\d+\.\d+/.test(String(version || ''))) throw new Error('Version invalide.');
  const head = (type) => `# Créé par NEXORA (Desktop Builder)\n# yaml-language-server: $schema=https://aka.ms/winget-manifest.${type}.${WINGET_SCHEMA}.schema.json\n\nPackageIdentifier: ${id}\nPackageVersion: ${version}\n`;
  const type = { nsis: 'nullsoft', msi: 'msi', portable: 'portable', zip: 'zip' }[kind] || 'nullsoft';
  const versionYaml = `${head('version')}DefaultLocale: ${locale}\nManifestType: version\nManifestVersion: ${WINGET_SCHEMA}\n`;
  const installerYaml = `${head('installer')}InstallerType: ${type}\n${type === 'zip' ? `NestedInstallerType: portable\nNestedInstallerFiles:\n  - RelativeFilePath: ${y(`${name}.exe`)}\n` : ''}Scope: ${scope === 'machine' ? 'machine' : 'user'}\nUpgradeBehavior: install\nInstallers:\n  - Architecture: ${arch === 'arm64' ? 'arm64' : 'x64'}\n    InstallerUrl: ${url}\n    InstallerSha256: ${String(sha256).toUpperCase()}\nManifestType: installer\nManifestVersion: ${WINGET_SCHEMA}\n`;
  const localeYaml = `${head('defaultLocale')}PackageLocale: ${locale}\nPublisher: ${y(publisher || name)}\n${homepage ? `PublisherUrl: ${homepage}\nPackageUrl: ${homepage}\n` : ''}PackageName: ${y(name)}\nLicense: ${y(license || 'Propriétaire')}\n${copyright ? `Copyright: ${y(copyright)}\n` : ''}ShortDescription: ${y(String(description || name).slice(0, 256))}\nManifestType: defaultLocale\nManifestVersion: ${WINGET_SCHEMA}\n`;
  return [
    { name: `${id}.yaml`, text: versionYaml },
    { name: `${id}.installer.yaml`, text: installerYaml },
    { name: `${id}.locale.${locale}.yaml`, text: localeYaml },
  ];
}
/** Dossier attendu par le dépôt microsoft/winget-pkgs : manifests/<initiale>/<Éditeur>/<Logiciel>/<version>. */
function wingetDir(id, version) {
  const parts = String(id).split('.');
  return path.join('manifests', parts[0][0].toLowerCase(), ...parts, String(version));
}
const sha256File = (file) => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(file).on('data', (d) => h.update(d)).on('error', reject).on('end', () => resolve(h.digest('hex')));
});

// ---------------------------------------------------------------- latest.yml
/** Ajoute (ou retire) le déploiement progressif, la mise à jour obligatoire et les nouveautés. */
function patchUpdateYml(text, { staging = 100, mandatory = false, notes = '' } = {}) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let skipping = false;
  for (const l of lines) {
    if (/^(stagingPercentage|nxMandatory|releaseNotes):/.test(l)) { skipping = /^releaseNotes:\s*[|>]/.test(l); continue; }
    if (skipping && /^\s+/.test(l)) continue;
    skipping = false;
    out.push(l);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  const pct = Math.round(Number(staging));
  if (pct >= 1 && pct < 100) out.push(`stagingPercentage: ${pct}`);
  if (mandatory) out.push('nxMandatory: true');
  if (String(notes || '').trim()) out.push(`releaseNotes: ${JSON.stringify(String(notes).trim().slice(0, 4000))}`);
  return `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------- GitHub
const GH = 'https://api.github.com';
function ghExplain(status, j, what) {
  const msg = (j && j.message) || '';
  if (status === 401) return 'Jeton GitHub refusé : vérifie-le ou crée-en un nouveau.';
  if (status === 403) return 'Ce jeton n’a pas le droit d’écrire dans ce dépôt (autorisation « Contents : lecture et écriture » nécessaire).';
  if (status === 404) return 'Dépôt introuvable : vérifie le propriétaire, le nom et que le jeton y a accès.';
  if (status === 422 && /empty/i.test(msg)) return 'Le dépôt est vide : ajoute au moins un fichier (README) avant de publier une version.';
  return `GitHub a refusé ${what} (${status}${msg ? ` : ${msg}` : ''}).`;
}
async function ghCall(fetchImpl, token, method, url, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const res = await fetchImpl(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'NEXORA', ...(body && !isBuf ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: isBuf ? body : body ? JSON.stringify(body) : undefined,
  });
  const j = res.status === 204 ? {} : await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, j };
}
/** Crée (ou complète) la version vX.Y.Z et y dépose les fichiers ; un fichier de même nom est remplacé. */
async function publishGithub({
  owner, repo, token, version, files, notes = '', prerelease = false, name = '',
}, fetchImpl, onStep = () => {}) {
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(owner || '') || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo || '')) throw new Error('Indique le propriétaire et le nom du dépôt (section Mises à jour).');
  if (!token) throw new Error('Ajoute d’abord un jeton GitHub.');
  if (!Array.isArray(files) || !files.length) throw new Error('Aucun fichier à publier : construis d’abord le logiciel.');
  const tag = `v${version}`;
  const base = `${GH}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  onStep(`Version ${tag}`, 0.05);
  let r = await ghCall(fetchImpl, token, 'GET', `${base}/releases/tags/${encodeURIComponent(tag)}`);
  if (r.status === 404) {
    const c = await ghCall(fetchImpl, token, 'POST', `${base}/releases`, { tag_name: tag, name: name || tag, body: notes, draft: false, prerelease });
    if (!c.ok) throw new Error(ghExplain(c.status, c.j, 'la création de la version'));
    r = c;
  } else if (!r.ok) throw new Error(ghExplain(r.status, r.j, 'la lecture des versions'));
  else if (notes || r.j.prerelease !== prerelease) {
    const u = await ghCall(fetchImpl, token, 'PATCH', `${base}/releases/${r.j.id}`, { ...(notes ? { body: notes } : {}), prerelease });
    if (u.ok) r = u;
  }
  const release = r.j;
  const existing = new Map((release.assets || []).map((a) => [a.name, a.id]));
  const uploaded = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const fname = fileName(f.path).replace(/ /g, '.');
    onStep(`Envoi de ${fname}`, 0.1 + (0.85 * i) / files.length);
    if (existing.has(fname)) await ghCall(fetchImpl, token, 'DELETE', `${base}/releases/assets/${existing.get(fname)}`);
    const up = await ghCall(fetchImpl, token, 'POST', `https://uploads.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/${release.id}/assets?name=${encodeURIComponent(fname)}`, fs.readFileSync(f.path), { 'Content-Type': 'application/octet-stream' });
    if (!up.ok) throw new Error(ghExplain(up.status, up.j, `l’envoi de ${fname}`));
    uploaded.push({ name: fname, url: up.j.browser_download_url || '' });
  }
  onStep('Version publiée', 1);
  return { ok: true, tag, url: release.html_url || `https://github.com/${owner}/${repo}/releases/tag/${tag}`, files: uploaded };
}
/** Adresse publique d'un fichier publié (pour winget et la page de téléchargement). */
function publicUrl(updates, version, file) {
  const n = fileName(file).replace(/ /g, '.');
  if (updates && updates.mode === 'github' && updates.owner && updates.repo) return `https://github.com/${updates.owner}/${updates.repo}/releases/download/v${version}/${encodeURIComponent(n)}`;
  if (updates && updates.mode === 'generic' && /^https:/i.test(updates.url || '')) return `${String(updates.url).replace(/\/+$/, '')}/${encodeURIComponent(n)}`;
  return '';
}

module.exports = {
  parseCycles, supportOf, electronCycles, sandboxConfig, wingetId, wingetManifests, wingetDir, sha256File, patchUpdateYml, publishGithub, publicUrl, EOL_URL,
};
