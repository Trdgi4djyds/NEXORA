'use strict';
/* Téléchargement avec reprise : un fichier interrompu (« .part ») reprend là où il s'était arrêté
 * (en-tête HTTP Range), puis l'empreinte est vérifiée sur le fichier complet. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function resumableDownload(fetchImpl, url, file, {
  sha1, sha256, onProgress, headers = {},
} = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.part`;
  // Fichier déjà complet (interruption pendant l'extraction) : vérifié puis réutilisé.
  if ((sha1 || sha256) && fs.existsSync(file) && fs.statSync(file).size > 0) {
    const h = crypto.createHash(sha256 ? 'sha256' : 'sha1');
    await new Promise((resolve, reject) => { const rs = fs.createReadStream(file); rs.on('data', (c) => h.update(c)); rs.on('end', resolve); rs.on('error', reject); });
    if (h.digest('hex') === String(sha256 || sha1).toLowerCase()) { if (onProgress) onProgress(1, 0, 0, true); return { file, resumed: true, bytes: fs.statSync(file).size }; }
    fs.rmSync(file, { force: true });
  }
  let have = 0;
  try { have = fs.statSync(tmp).size; } catch { have = 0; }
  let res = await fetchImpl(url, { redirect: 'follow', headers: have ? { ...headers, Range: `bytes=${have}-` } : headers });
  if (have && res.status === 416) { have = 0; fs.rmSync(tmp, { force: true }); res = await fetchImpl(url, { redirect: 'follow', headers }); }
  if (!res.ok) throw new Error(`Téléchargement impossible (erreur ${res.status}). Vérifiez votre connexion, puis réessayez : il reprendra là où il s'est arrêté.`);
  const resumed = have > 0 && res.status === 206;
  if (!resumed) have = 0;
  const h1 = crypto.createHash('sha1');
  const h256 = crypto.createHash('sha256');
  if (resumed && (sha1 || sha256)) {
    // Empreinte de la partie déjà présente.
    await new Promise((resolve, reject) => {
      const rs = fs.createReadStream(tmp);
      rs.on('data', (c) => { h1.update(c); h256.update(c); });
      rs.on('end', resolve);
      rs.on('error', reject);
    });
  }
  const len = Number(res.headers.get('content-length')) || 0;
  const total = len ? len + have : 0;
  const ws = fs.createWriteStream(tmp, { flags: resumed ? 'a' : 'w' });
  let got = have;
  const reader = res.body.getReader();
  try {
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      const buf = Buffer.from(value);
      got += buf.length;
      h1.update(buf);
      h256.update(buf);
      if (!ws.write(buf)) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => ws.once('drain', r));
      }
      if (onProgress) onProgress(total ? got / total : 0, got, total, resumed);
    }
  } finally {
    await new Promise((r) => ws.end(r));
  }
  if (sha1 && h1.digest('hex') !== String(sha1).toLowerCase()) { fs.rmSync(tmp, { force: true }); throw new Error(`Fichier corrompu (empreinte SHA-1 différente) : ${path.basename(file)}. Relancez le téléchargement.`); }
  if (sha256 && h256.digest('hex') !== String(sha256).toLowerCase()) { fs.rmSync(tmp, { force: true }); throw new Error(`Fichier corrompu (empreinte SHA-256 différente) : ${path.basename(file)}. Relancez le téléchargement.`); }
  fs.renameSync(tmp, file);
  return { file, resumed, bytes: got };
}

module.exports = { resumableDownload };
