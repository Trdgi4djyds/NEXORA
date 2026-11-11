'use strict';
/* Clés de signature des applications : création (keytool), import, empreintes, sauvegarde chiffrée du mot de passe. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { run } = require('./toolchain');

class Keystores {
  /* crypt : { encrypt(str) → base64, decrypt(base64) → str } (stockage protégé du système), ou null. */
  constructor({ dir, crypt = null }) {
    this.dir = dir;
    this.crypt = crypt;
    fs.mkdirSync(dir, { recursive: true });
  }

  file(appId) { return path.join(this.dir, `${appId}.p12`); }
  meta(appId) { return path.join(this.dir, `${appId}.json`); }

  info(appId) {
    try {
      const m = JSON.parse(fs.readFileSync(this.meta(appId), 'utf8'));
      if (!fs.existsSync(m.file || this.file(appId))) return null;
      return { ...m, file: m.file || this.file(appId) };
    } catch { return null; }
  }

  password(m) {
    if (m.passEnc && this.crypt) return this.crypt.decrypt(m.passEnc);
    return m.pass || '';
  }

  save(appId, m, pass) {
    const data = { ...m };
    delete data.pass;
    delete data.passEnc;
    if (this.crypt) data.passEnc = this.crypt.encrypt(pass);
    else data.pass = pass;
    fs.writeFileSync(this.meta(appId), JSON.stringify(data, null, 2));
    return { ...data, file: data.file || this.file(appId) };
  }

  static dname({ name, org, role, region, city, country }) {
    const clean = (s) => String(s || '').replace(/[,=+<>#;"\\]/g, ' ').trim();
    const parts = [`CN=${clean(name) || 'Application'}`];
    if (clean(role)) parts.push(`OU=${clean(role)}`);
    parts.push(`O=${clean(org) || clean(name) || 'Application'}`);
    parts.push(`L=${clean(city) || 'Cotonou'}`);
    if (clean(region)) parts.push(`ST=${clean(region)}`);
    parts.push(`C=${(clean(country) || 'BJ').slice(0, 2).toUpperCase()}`);
    return parts.join(', ');
  }

  /* Crée une clé RSA 2048 valable 30 ans (exigence Play Store : au-delà du 22 octobre 2033). */
  async create(appId, java, owner) {
    const pass = crypto.randomBytes(18).toString('base64url');
    const file = this.file(appId);
    fs.rmSync(file, { force: true });
    const alias = 'upload';
    const r = await run(java.keytool, [
      '-J-Duser.language=en', '-genkeypair', '-keystore', file, '-storetype', 'PKCS12', '-alias', alias, '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10950',
      '-dname', Keystores.dname(owner || {}), '-storepass:env', 'VITRINE_KS_PASS', '-keypass:env', 'VITRINE_KS_PASS', '-noprompt',
    ], { env: { ...process.env, VITRINE_KS_PASS: pass } });
    if (r.code) throw new Error(`Création de la clé impossible : ${(r.stderr || r.stdout).trim()}`);
    const fp = await this.fingerprints(file, alias, pass, java);
    return this.save(appId, {
      appId, alias, file, created: new Date().toISOString(), dname: Keystores.dname(owner || {}), ...fp, imported: false,
    }, pass);
  }

  /* Importe une clé existante (.jks ou .p12/.keystore). */
  async import(appId, java, { source, alias, storePass, keyPass }) {
    const ext = path.extname(source).toLowerCase();
    const file = path.join(this.dir, `${appId}-importee${ext || '.jks'}`);
    fs.copyFileSync(source, file);
    const type = ext === '.p12' || ext === '.pfx' ? 'PKCS12' : null;
    const fp = await this.fingerprints(file, alias, storePass, java, type);
    if (!fp.sha256) throw new Error('Mot de passe ou alias incorrect : la clé ne peut pas être lue.');
    const m = this.save(appId, {
      appId, alias, file, storeType: type, created: new Date().toISOString(), ...fp, imported: true, keyPassSeparate: Boolean(keyPass && keyPass !== storePass),
    }, storePass);
    if (keyPass && keyPass !== storePass) {
      const meta = JSON.parse(fs.readFileSync(this.meta(appId), 'utf8'));
      if (this.crypt) meta.keyPassEnc = this.crypt.encrypt(keyPass); else meta.keyPass = keyPass;
      fs.writeFileSync(this.meta(appId), JSON.stringify(meta, null, 2));
    }
    return m;
  }

  saveKeyPassword(appId, keyPass) {
    const meta = JSON.parse(fs.readFileSync(this.meta(appId), 'utf8'));
    if (this.crypt) meta.keyPassEnc = this.crypt.encrypt(keyPass); else meta.keyPass = keyPass;
    fs.writeFileSync(this.meta(appId), JSON.stringify(meta, null, 2));
  }

  keyPassword(m) {
    if (m.keyPassEnc && this.crypt) return this.crypt.decrypt(m.keyPassEnc);
    if (m.keyPass) return m.keyPass;
    return this.password(m);
  }

  async fingerprints(file, alias, pass, java, type) {
    const args = ['-J-Duser.language=en', '-list', '-v', '-keystore', file, '-alias', alias, '-storepass:env', 'VITRINE_KS_PASS'];
    if (type) args.push('-storetype', type);
    const r = await run(java.keytool, args, { env: { ...process.env, VITRINE_KS_PASS: pass } });
    const txt = r.stdout + r.stderr;
    const sha256 = /SHA256:\s*([0-9A-F:]{95})/i.exec(txt);
    const sha1 = /SHA1:\s*([0-9A-F:]{59})/i.exec(txt);
    const until = /(?:until|jusqu'au|bis):\s*(.+)$/im.exec(txt);
    return { sha256: sha256 ? sha256[1].toUpperCase() : null, sha1: sha1 ? sha1[1].toUpperCase() : null, validUntil: until ? until[1].trim() : null };
  }
}

module.exports = { Keystores };
