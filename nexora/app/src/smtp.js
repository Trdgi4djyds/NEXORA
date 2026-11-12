'use strict';
/* Client SMTP minimal pour les alertes e-mail, sans dépendance externe.
 * - TLS implicite (port 465) ou STARTTLS (587/25) quand le serveur le propose.
 * - Authentification PLAIN (ou LOGIN si c'est la seule proposée).
 * - Message MIME UTF-8 encodé en base64 (lignes CRLF, aucun « LF nu » que Gmail & co refusent),
 *   sujet encodé (accents, emojis), en-têtes Date et Message-ID pour ne pas finir en indésirables. */
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');

function readReply(sock, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (d) => {
      buf += d.toString('utf8');
      if (!buf.endsWith('\n')) return; // réponse incomplète
      const lines = buf.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1];
      // Dernière ligne d'une réponse SMTP : « 250 texte » ; les lignes de continuation ont « 250- ».
      if (last && /^\d{3}( |$)/.test(last)) { cleanup(); resolve({ code: Number(last.slice(0, 3)), text: buf, lines }); }
    };
    const onErr = (e) => { cleanup(); reject(e); };
    const onClose = () => { cleanup(); reject(new Error('connexion fermée par le serveur')); };
    const t = setTimeout(() => { cleanup(); reject(new Error('délai SMTP dépassé')); }, timeoutMs);
    function cleanup() { clearTimeout(t); sock.removeListener('data', onData); sock.removeListener('error', onErr); sock.removeListener('close', onClose); }
    sock.on('data', onData); sock.on('error', onErr); sock.on('close', onClose);
  });
}

function smtpError(r, what) {
  const last = r.text.trim().split(/\r?\n/).pop() || '';
  const msg = last.slice(4, 220);
  if (r.code === 535 || r.code === 534) return new Error(`Identifiant ou mot de passe refusé (${r.code}). Gmail, Outlook, Yahoo : créez un « mot de passe d’application » et utilisez-le ici.`);
  if (r.code === 530) return new Error(`Le serveur exige une connexion sécurisée (${r.code}) : utilisez le port 587 ou 465.`);
  if ([550, 551, 553, 554].includes(r.code)) return new Error(`Adresse refusée par le serveur (${r.code}) : ${msg}`);
  return new Error(`SMTP ${r.code}${what ? ` pendant ${what}` : ''} : ${msg}`);
}

async function cmd(sock, line, expect, what) {
  if (line != null) sock.write(`${line}\r\n`);
  const r = await readReply(sock);
  if (expect && !expect.includes(r.code)) throw smtpError(r, what);
  return r;
}

const b64lines = (s) => Buffer.from(String(s), 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n').trimEnd();
const encWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);

async function connect(host, port, implicit) {
  const sock = implicit ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
  try {
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(Object.assign(new Error('délai de connexion dépassé'), { code: 'ETIMEDOUT' })), 15000);
      sock.once(implicit ? 'secureConnect' : 'connect', () => { clearTimeout(t); res(); });
      sock.once('error', (e) => { clearTimeout(t); rej(e); });
    });
    return sock;
  } catch (e) {
    try { sock.destroy(); } catch { /* déjà fermé */ }
    const hint = e.code === 'ENOTFOUND' ? 'serveur introuvable' : e.code === 'ECONNREFUSED' ? 'connexion refusée' : e.code === 'ETIMEDOUT' ? 'pas de réponse' : (e.code || e.message);
    throw new Error(`Impossible de joindre ${host}:${port} (${hint}). Vérifiez l’adresse du serveur et le port (587 ou 465).`);
  }
}

async function sendMail({
  host, port = 587, secure = false, user, pass, from, to, subject, text,
}) {
  host = String(host || '').trim();
  user = String(user || '').trim();
  if (!host || !user || !pass) throw new Error('Renseignez le serveur, l’identifiant et le mot de passe SMTP.');
  const rcpts = String(to || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  if (!rcpts.length) throw new Error('Indiquez au moins un destinataire.');
  port = Number(port) || 587;
  const implicit = Boolean(secure) || port === 465;
  let sock = await connect(host, port, implicit);
  try {
    await cmd(sock, null, [220], 'l’accueil');
    let ehlo = await cmd(sock, 'EHLO nexora.local', [250], 'EHLO');
    let caps = ehlo.lines.map((l) => l.slice(4).toUpperCase());
    if (!implicit && caps.some((x) => x.startsWith('STARTTLS'))) {
      await cmd(sock, 'STARTTLS', [220], 'STARTTLS');
      const plain = sock;
      sock = tls.connect({ socket: plain, host, servername: host });
      await new Promise((res, rej) => { sock.once('secureConnect', res); sock.once('error', rej); });
      ehlo = await cmd(sock, 'EHLO nexora.local', [250], 'EHLO');
      caps = ehlo.lines.map((l) => l.slice(4).toUpperCase());
    }
    const auth = caps.find((x) => x.startsWith('AUTH')) || '';
    if (auth.includes('PLAIN') || !auth.includes('LOGIN')) {
      await cmd(sock, `AUTH PLAIN ${Buffer.from(`\u0000${user}\u0000${pass}`, 'utf8').toString('base64')}`, [235], 'l’authentification');
    } else {
      await cmd(sock, 'AUTH LOGIN', [334], 'l’authentification');
      await cmd(sock, Buffer.from(user, 'utf8').toString('base64'), [334], 'l’authentification');
      await cmd(sock, Buffer.from(String(pass), 'utf8').toString('base64'), [235], 'l’authentification');
    }
    const sender = String(from || user).trim();
    await cmd(sock, `MAIL FROM:<${sender}>`, [250], 'l’expéditeur');
    for (const r of rcpts) await cmd(sock, `RCPT TO:<${r}>`, [250, 251], 'le destinataire'); // eslint-disable-line no-await-in-loop
    await cmd(sock, 'DATA', [354], 'DATA');
    const domain = ((sender.split('@')[1]) || 'nexora.local').replace(/[^\w.-]/g, '') || 'nexora.local';
    const msg = [
      `From: NEXORA <${sender}>`,
      `To: ${rcpts.join(', ')}`,
      `Subject: ${encWord(String(subject || 'NEXORA'))}`,
      `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
      `Message-ID: <${crypto.randomBytes(12).toString('hex')}@${domain}>`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64lines(text || ''),
      '.',
    ].join('\r\n');
    await cmd(sock, msg, [250], 'l’envoi');
    await cmd(sock, 'QUIT').catch(() => {});
    return { ok: true };
  } finally { try { sock.end(); } catch { /* fermé */ } }
}

module.exports = { sendMail };
