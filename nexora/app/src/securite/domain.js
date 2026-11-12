'use strict';
/* NEXORA #048 — Audit du domaine et de la messagerie : SPF, DMARC, DKIM, MX, MTA-STS, CAA, DNSSEC,
 * expiration du nom de domaine (RDAP), fichier security.txt et sous-domaines orphelins (risque de prise de
 * contrôle d'un sous-domaine qui pointe vers un service supprimé). Uniquement des lectures publiques : DNS
 * par HTTPS (Cloudflare, puis Google), journaux de certificats (crt.sh) et pages des sous-domaines. */
const { collector, finish, registrable, platformOf, grab, pool } = require('./util');

const TYPES = { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28, DS: 43, CAA: 257 };

async function doh(fetchImpl, name, type) {
  const q = `name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  for (const base of ['https://cloudflare-dns.com/dns-query?', 'https://dns.google/resolve?']) {
    const r = await grab(fetchImpl, `${base}${q}${base.includes('google') ? '&do=1' : '&do=true'}`, { headers: { accept: 'application/dns-json' }, timeout: 8000, max: 200000 });
    if (!r.status) continue;
    try {
      const j = JSON.parse(r.body);
      const want = TYPES[type];
      const answers = (j.Answer || []).filter((a) => !want || a.type === want).map((a) => String(a.data || ''));
      return { status: j.Status, ad: Boolean(j.AD), answers, cname: (j.Answer || []).filter((a) => a.type === 5).map((a) => String(a.data || '').replace(/\.$/, '')) };
    } catch { /* réponse illisible : autre résolveur */ }
  }
  return { status: -1, ad: false, answers: [], cname: [], error: 'résolution DNS impossible' };
}

const txt = (s) => String(s).replace(/^"|"$/g, '').replace(/"\s*"/g, '');

// Services d'hébergement dont un sous-domaine orphelin peut être repris par n'importe qui.
const TAKEOVER = [
  [/\.github\.io$/i, /There isn't a GitHub Pages site here/i, 'GitHub Pages'],
  [/\.herokuapp\.com$|\.herokudns\.com$/i, /No such app|herokucdn\.com\/error-pages\/no-such-app/i, 'Heroku'],
  [/\.s3[.-][a-z0-9-]*\.?amazonaws\.com$|\.s3\.amazonaws\.com$|s3-website/i, /NoSuchBucket|The specified bucket does not exist/i, 'Amazon S3'],
  [/\.azurewebsites\.net$|\.cloudapp\.net$|\.cloudapp\.azure\.com$|\.trafficmanager\.net$|\.blob\.core\.windows\.net$|\.azureedge\.net$/i, /404 Web Site not found|The resource you are looking for has been removed/i, 'Microsoft Azure'],
  [/\.netlify\.app$|\.netlify\.com$/i, /Not Found - Request ID/i, 'Netlify'],
  [/\.vercel\.app$|cname\.vercel-dns\.com$/i, /DEPLOYMENT_NOT_FOUND|The deployment could not be found/i, 'Vercel'],
  [/\.surge\.sh$/i, /project not found/i, 'Surge'],
  [/\.bitbucket\.io$/i, /Repository not found/i, 'Bitbucket'],
  [/\.myshopify\.com$/i, /Sorry, this shop is currently unavailable|Only one step left/i, 'Shopify'],
  [/\.wordpress\.com$/i, /Do you want to register/i, 'WordPress.com'],
  [/\.pantheonsite\.io$/i, /404 error unknown site/i, 'Pantheon'],
  [/\.readthedocs\.io$/i, /unknown to Read the Docs/i, 'Read the Docs'],
  [/\.fastly\.net$/i, /Fastly error: unknown domain/i, 'Fastly'],
  [/\.firebaseapp\.com$|\.web\.app$/i, /Site Not Found|Firebase Hosting Setup Complete/i, 'Firebase'],
  [/\.ghost\.io$/i, /Site unavailable|Failed to resolve DNS path/i, 'Ghost'],
  [/\.zendesk\.com$/i, /Help Center Closed/i, 'Zendesk'],
  [/\.helpscoutdocs\.com$/i, /No settings were found for this company/i, 'Help Scout'],
  [/\.cargocollective\.com$/i, /404 Not Found/i, 'Cargo'],
];
const COMMON_SUBS = ['www', 'app', 'api', 'blog', 'shop', 'boutique', 'mail', 'webmail', 'dev', 'staging', 'test', 'preprod', 'admin', 'cdn', 'static', 'status', 'docs', 'help', 'support', 'portal', 'beta', 'm', 'old', 'demo'];

async function subdomains(fetchImpl, domain, onStep) {
  const names = new Set(COMMON_SUBS.map((s) => `${s}.${domain}`));
  onStep({ label: 'Lecture des journaux de certificats', progress: 0.55 });
  const ct = await grab(fetchImpl, `https://crt.sh/?q=${encodeURIComponent(`%.${domain}`)}&output=json`, { timeout: 12000, max: 3000000 });
  let fromCt = 0;
  if (ct.ok) {
    try {
      for (const row of JSON.parse(ct.body).slice(0, 4000)) {
        for (const n of String(row.name_value || '').split(/\s+/)) {
          const v = n.toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
          if (v.endsWith(`.${domain}`) && !v.includes('*') && names.size < 120) { if (!names.has(v)) fromCt += 1; names.add(v); }
        }
      }
    } catch { /* journal illisible : liste courante seulement */ }
  }
  onStep({ label: 'Vérification des sous-domaines', progress: 0.65 });
  const list = [...names];
  const out = await pool(list, 8, async (name) => {
    const r = await doh(fetchImpl, name, 'CNAME');
    if (r.status === 3 || (!r.answers.length && !r.cname.length)) return null; // le sous-domaine n'existe pas
    const target = (r.cname[0] || r.answers[0] || '').replace(/\.$/, '');
    if (!target) return null;
    const t = await doh(fetchImpl, target, 'A');
    const svc = TAKEOVER.find(([re]) => re.test(target));
    const item = { name, cname: target, service: svc ? svc[2] : '', state: 'ok' };
    if (t.status === 3) { item.state = 'orphan'; return item; }
    if (svc) {
      const page = await grab(fetchImpl, `https://${name}/`, { timeout: 9000, max: 60000 });
      const page2 = page.status ? page : await grab(fetchImpl, `http://${name}/`, { timeout: 9000, max: 60000 });
      if (svc[1].test(page2.body)) item.state = 'takeover';
    }
    return item;
  });
  return { list: out.filter((x) => x && !x.error), checked: list.length, fromCt, ctOk: ct.ok };
}

async function rdap(fetchImpl, domain) {
  const r = await grab(fetchImpl, `https://rdap.org/domain/${encodeURIComponent(domain)}`, { timeout: 12000, max: 400000, headers: { accept: 'application/rdap+json, application/json' } });
  if (!r.ok) return null;
  try {
    const j = JSON.parse(r.body);
    const ev = (j.events || []).find((e) => /expir/i.test(e.eventAction || ''));
    const reg = (j.entities || []).find((e) => (e.roles || []).includes('registrar'));
    let registrar = '';
    try { registrar = (reg.vcardArray[1].find((v) => v[0] === 'fn') || [])[3] || ''; } catch { registrar = ''; }
    const date = ev ? new Date(ev.eventDate) : null;
    return { date: date && !Number.isNaN(date.getTime()) ? date.getTime() : null, days: date ? Math.floor((date - Date.now()) / 86400000) : null, registrar, status: j.status || [] };
  } catch { return null; }
}

function spfLookups(record) {
  return (record.match(/\b(include:|a\b|a:|mx\b|mx:|ptr\b|ptr:|exists:|redirect=)/gi) || []).length;
}

async function audit(host, { fetchImpl, onStep = () => {} } = {}) {
  const domain = registrable(host);
  if (!domain || !domain.includes('.')) throw new Error('Indiquez un nom de domaine, par exemple votre-site.com.');
  const { findings, add } = collector();
  const rec = { domain, host };
  // Sous-domaine d'une plateforme (workers.dev, github.io, vercel.app…) : messagerie, DNS et renouvellement du
  // domaine sont gérés par la plateforme ; seuls le fichier security.txt et l'adresse elle-même te concernent.
  const plat = platformOf(host);
  if (plat) {
    rec.platform = plat;
    add('info', 'Domaine', `Site hébergé sur un sous-domaine de ${plat}`, `Le nom de domaine, sa messagerie et son renouvellement appartiennent à la plateforme ${plat}. Avec votre propre nom de domaine, vous gardez votre adresse si vous changez d’hébergeur et vous pouvez envoyer des e-mails à votre nom.`, 'Facultatif : reliez un nom de domaine à vous (quelques euros par an) depuis les réglages de votre hébergeur.', { who: 'vous' });
    const st0 = await grab(fetchImpl, `https://${host}/.well-known/security.txt`, { timeout: 8000, max: 20000 });
    rec.securityTxt = st0.ok && /contact:/i.test(st0.body);
    if (!rec.securityTxt) add('info', 'Bonnes pratiques', 'Fichier security.txt absent', 'Ce fichier indique comment vous signaler une faille de sécurité.', 'Créez /.well-known/security.txt avec « Contact: mailto:… » et une date « Expires: ».', { who: 'vous' });
    onStep({ label: 'Terminé', progress: 1 });
    return finish(findings, { kind: 'domain', target: domain, host, domain, records: rec });
  }
  onStep({ label: 'Enregistrements DNS', progress: 0.08 });
  const [a, ns, mx, txtR, dmarc, caa, ds, mtasts, tlsrpt] = await Promise.all([
    doh(fetchImpl, domain, 'A'), doh(fetchImpl, domain, 'NS'), doh(fetchImpl, domain, 'MX'), doh(fetchImpl, domain, 'TXT'),
    doh(fetchImpl, `_dmarc.${domain}`, 'TXT'), doh(fetchImpl, domain, 'CAA'), doh(fetchImpl, domain, 'DS'),
    doh(fetchImpl, `_mta-sts.${domain}`, 'TXT'), doh(fetchImpl, `_smtp._tls.${domain}`, 'TXT'),
  ]);
  if (a.status === -1) throw new Error('Impossible d’interroger les serveurs DNS : vérifiez votre connexion à Internet.');
  if (a.status === 3 && !ns.answers.length) throw new Error(`Le domaine ${domain} n’existe pas (aucun enregistrement DNS).`);
  rec.ns = ns.answers.map((x) => x.replace(/\.$/, ''));
  rec.mx = mx.answers.map((x) => x.replace(/\.$/, '').replace(/^\d+\s+/, ''));
  const hasMail = rec.mx.length > 0 && !rec.mx.every((m) => m === '' || m === '.');

  // --- SPF ---
  const spf = txtR.answers.map(txt).filter((t) => /^v=spf1\b/i.test(t));
  rec.spf = spf[0] || '';
  if (!spf.length) {
    add('high', 'Messagerie', 'Aucun enregistrement SPF', `N’importe qui peut envoyer des e-mails qui semblent venir de @${domain} : vos clients peuvent recevoir de faux messages (hameçonnage).`, hasMail ? 'Ajoutez un enregistrement TXT « v=spf1 include:<ton fournisseur d’e-mail> -all » chez votre hébergeur DNS.' : 'Vous n’envoyez pas d’e-mails depuis ce domaine : ajoutez « v=spf1 -all » pour interdire tout envoi en votre nom.', { who: 'dns' });
  } else if (spf.length > 1) {
    add('high', 'Messagerie', 'Plusieurs enregistrements SPF', 'Un domaine ne doit avoir qu’un seul SPF : avec plusieurs, les messageries considèrent le SPF comme invalide.', 'Fusionnez-les en un seul enregistrement TXT « v=spf1 … -all ».', { who: 'dns' });
  } else {
    const s = spf[0];
    if (/[+]all\b/i.test(s)) add('critical', 'Messagerie', 'SPF « +all » : tout le monde est autorisé', 'Ce SPF autorise explicitement n’importe quel serveur à envoyer en votre nom.', 'Remplacez « +all » par « -all » (ou « ~all » le temps de vérifier).', { who: 'dns' });
    else if (/\?all\b/i.test(s)) add('medium', 'Messagerie', 'SPF neutre (« ?all »)', 'Les messages envoyés par d’autres serveurs ne sont pas rejetés.', 'Terminez votre SPF par « -all » une fois vos services d’envoi listés.', { who: 'dns' });
    else if (!/[-~]all\b|redirect=/i.test(s)) add('medium', 'Messagerie', 'SPF sans règle finale', 'Votre SPF ne dit pas quoi faire des autres serveurs.', 'Ajoutez « -all » à la fin de l’enregistrement.', { who: 'dns' });
    const n = spfLookups(s);
    if (n > 10) add('medium', 'Messagerie', `SPF trop long (${n} recherches DNS)`, 'Au-delà de 10 recherches, le SPF est considéré comme invalide par les messageries.', 'Retirez les « include » inutiles ou regroupez vos services d’envoi.', { who: 'dns' });
  }

  // --- DMARC ---
  const dm = dmarc.answers.map(txt).find((t) => /^v=DMARC1/i.test(t)) || '';
  rec.dmarc = dm;
  if (!dm) {
    add('high', 'Messagerie', 'Aucune politique DMARC', 'Sans DMARC, les messageries ne savent pas quoi faire d’un faux e-mail à votre nom, et vous ne recevez aucun rapport.', `Ajoutez un TXT sur _dmarc.${domain} : « v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain} », puis passez à p=reject.`, { who: 'dns' });
  } else {
    const p = (/;\s*p=(\w+)/i.exec(`;${dm}`) || [])[1] || '';
    if (/^none$/i.test(p)) add('medium', 'Messagerie', 'DMARC en observation seulement (p=none)', 'Les faux e-mails à votre nom sont encore livrés : la politique ne fait que les compter.', 'Après quelques semaines de rapports, passez à « p=quarantine » puis « p=reject ».', { who: 'dns' });
    else if (/^quarantine$/i.test(p)) add('low', 'Messagerie', 'DMARC en quarantaine', 'Les faux e-mails vont dans les indésirables : c’est bien, « reject » les bloque complètement.', 'Passez à « p=reject » quand vos rapports ne montrent plus d’envoi légitime en échec.', { who: 'dns' });
    if (!/rua=/i.test(dm)) add('low', 'Messagerie', 'DMARC sans adresse de rapports', 'Vous ne recevez pas les rapports qui montrent qui envoie des e-mails à votre nom.', 'Ajoutez « rua=mailto:dmarc@votre-domaine » à l’enregistrement DMARC.', { who: 'dns' });
    const pct = Number((/pct=(\d+)/i.exec(dm) || [])[1] || 100);
    if (pct < 100) add('low', 'Messagerie', `DMARC appliqué à ${pct} % des messages`, 'Une partie des faux e-mails échappe à la politique.', 'Monte « pct » à 100.', { who: 'dns' });
  }

  // --- DKIM (sélecteurs courants) ---
  onStep({ label: 'Signatures DKIM', progress: 0.3 });
  const SELECTORS = ['default', 'google', 'selector1', 'selector2', 'k1', 'k2', 's1', 's2', 'mail', 'dkim', 'brevo', 'mailjet', 'zoho', 'zmail', 'mandrill', 'smtp', 'protonmail', 'protonmail2', 'mxvault', 'everlytickey1', 'sendinblue', 'mailchimp', 'hs1', 'resend', 'postmark', 'pm', 'amazonses', 'ovh', 'mail1'];
  const dk = await pool(SELECTORS, 8, async (s) => {
    const r = await doh(fetchImpl, `${s}._domainkey.${domain}`, 'TXT');
    const v = r.answers.map(txt).find((t) => /p=/i.test(t));
    return v ? s : null;
  });
  rec.dkim = dk.filter((x) => typeof x === 'string');
  if (hasMail && !rec.dkim.length) add('low', 'Messagerie', 'Signature DKIM non trouvée', 'Aucune clé DKIM sur les sélecteurs courants : vos e-mails sont peut-être signés avec un autre sélecteur, sinon ils arrivent plus souvent dans les indésirables.', 'Activez la signature DKIM chez votre fournisseur d’e-mail et publiez la clé qu’il vous donne.', { who: 'messagerie' });
  if (hasMail && !mtasts.answers.length) add('info', 'Messagerie', 'MTA-STS absent', 'MTA-STS oblige les autres serveurs à vous envoyer les e-mails de façon chiffrée.', 'Facultatif : publiez une politique MTA-STS et un enregistrement _mta-sts.', { who: 'messagerie' });
  if (hasMail && !tlsrpt.answers.length) add('info', 'Messagerie', 'Rapports TLS (TLS-RPT) absents', 'Ces rapports signalent les problèmes de chiffrement des e-mails reçus.', `Facultatif : TXT « v=TLSRPTv1; rua=mailto:tls@${domain} » sur _smtp._tls.${domain}.`, { who: 'messagerie' });
  if (!hasMail) add('info', 'Messagerie', 'Aucun serveur de messagerie (MX)', 'Ce domaine ne reçoit pas d’e-mails. Pensez quand même à SPF « -all » et DMARC « p=reject » pour empêcher les envois en votre nom.', '', { who: 'dns' });

  // --- CAA et DNSSEC ---
  rec.caa = caa.answers;
  if (!caa.answers.length) add('low', 'DNS', 'Aucun enregistrement CAA', 'N’importe quelle autorité peut émettre un certificat pour votre domaine.', `Ajoutez un enregistrement CAA, par exemple « 0 issue "letsencrypt.org" » (selon l’autorité de votre hébergeur).`, { who: 'dns' });
  rec.dnssec = Boolean(ds.answers.length || a.ad);
  if (!rec.dnssec) add('low', 'DNS', 'DNSSEC non activé', 'Les réponses DNS de votre domaine ne sont pas signées : une redirection vers un faux serveur est plus facile.', 'Active DNSSEC chez votre registraire (souvent une simple case à cocher).', { who: 'registraire' });

  // --- Expiration du domaine ---
  onStep({ label: 'Date d’expiration du domaine', progress: 0.45 });
  const exp = await rdap(fetchImpl, domain);
  rec.expiry = exp;
  if (exp && exp.days != null) {
    if (exp.days < 0) add('critical', 'Domaine', 'Nom de domaine expiré', 'Votre site et vos e-mails vont s’arrêter, et le domaine peut être racheté par quelqu’un d’autre.', 'Renouvelez-le tout de suite chez votre registraire.', { who: 'registraire' });
    else if (exp.days <= 30) add('high', 'Domaine', `Le domaine expire dans ${exp.days} jour(s)`, 'S’il n’est pas renouvelé, votre site et vos e-mails s’arrêtent.', 'Renouvelez le domaine et activez le renouvellement automatique.', { who: 'registraire' });
    else if (exp.days <= 60) add('medium', 'Domaine', `Le domaine expire dans ${exp.days} jours`, 'Pensez au renouvellement.', 'Activez le renouvellement automatique chez votre registraire.', { who: 'registraire' });
    if (exp.status && !exp.status.some((s) => /transfer ?prohibited/i.test(s))) add('low', 'Domaine', 'Verrou de transfert non activé', 'Quelqu’un qui accède à votre compte de registraire peut transférer le domaine plus facilement.', 'Activez le verrou de transfert (« transfer lock ») chez votre registraire.', { who: 'registraire' });
  }

  // --- security.txt ---
  const st = await grab(fetchImpl, `https://${host}/.well-known/security.txt`, { timeout: 8000, max: 20000 });
  rec.securityTxt = st.ok && /contact:/i.test(st.body);
  if (!rec.securityTxt) add('info', 'Bonnes pratiques', 'Fichier security.txt absent', 'Ce fichier indique comment vous signaler une faille de sécurité.', `Créez /.well-known/security.txt avec « Contact: mailto:securite@${domain} » et une date « Expires: ».`, { who: 'vous' });

  // --- Sous-domaines ---
  const subs = await subdomains(fetchImpl, domain, onStep);
  rec.subdomains = subs.list;
  rec.subChecked = subs.checked;
  rec.ctOk = subs.ctOk;
  for (const s of subs.list) {
    if (s.state === 'takeover') add('critical', 'Sous-domaines', `${s.name} peut être repris (${s.service})`, `Ce sous-domaine pointe vers ${s.cname}, un service ${s.service} supprimé : n’importe qui peut le recréer et publier ce qu’il veut sous votre nom.`, `Supprimez l’enregistrement DNS de ${s.name}, ou recréez le service chez ${s.service}.`, { who: 'dns' });
    else if (s.state === 'orphan') add('high', 'Sous-domaines', `${s.name} pointe vers une adresse qui n’existe plus`, `L’alias ${s.cname} n’existe plus : si ce nom se libère, quelqu’un peut le réserver et prendre la main sur ${s.name}.`, `Supprimez l’enregistrement CNAME de ${s.name} s’il ne sert plus.`, { who: 'dns' });
  }
  onStep({ label: 'Terminé', progress: 1 });
  return finish(findings, { kind: 'domain', target: domain, host, domain, records: rec });
}

module.exports = { audit, doh, registrable, TAKEOVER };
