// Catalogue des e-mails de NEXORA (#031). Une seule source pour trois usages :
// - e-mails des comptes envoyés par Supabase Auth (SMTP Brevo) : variables Go de Supabase ({{ .ConfirmationURL }}) ;
// - alertes de supervision envoyées par la base (nx_brevo_send) : variables {{titre}} remplacées en SQL ;
// - e-mails envoyés depuis le back office (mise à jour, facture) : rendus ici avec les vraies valeurs.
import { NEXORA_WEB_URL } from "../supabase"
import { box, bullets, button, code, esc, layout, p, pill, rows, TONES, type Tone } from "./layout"

export const LOGO_URL = `${NEXORA_WEB_URL}logo.png`
/** Version des modèles enregistrés dans la base (app_config.email_templates) : à augmenter à chaque changement. */
export const TEMPLATES_VERSION = 3

type V = Record<string, string>
export type Rendered = { subject: string; html: string; text?: string }
export type Variant = { id: string; label: string; vars: V }
export type EmailTemplate = {
  id: string
  group: string
  label: string
  desc: string
  icon: string
  /** auth : Supabase Auth ; db : envoyé par la base ; admin : envoyé depuis le back office. */
  target: "auth" | "db" | "admin"
  /** Nom du modèle chez Supabase (mailer_templates_<authKey>_content). */
  authKey?: string
  /** Notification de sécurité : activée (true) ou désactivée (false) chez Supabase. */
  notify?: boolean
  /** Quand l'e-mail part, en une phrase. */
  when: string
  render: (v: V) => Rendered
  /** Valeurs réelles envoyées à Supabase ou à la base (variables). */
  vars?: V
  /** Exemples pour l'aperçu. */
  variants: Variant[]
}

const base = { webUrl: NEXORA_WEB_URL, logoUrl: LOGO_URL }
const strong = (s: string) => `<b class="nx-ink" style="color:#0a0a0a">${esc(s)}</b>`
const REASON_ACCOUNT = "Tu reçois cet e-mail parce qu’une action a été demandée pour ton compte NEXORA."
const REASON_SECURITY = "Tu reçois cet e-mail pour la sécurité de ton compte NEXORA. Il ne contient aucun lien à usage unique."
const SUPPORT = "Si ce n’est pas toi, change ton mot de passe tout de suite (écran de connexion → « Mot de passe oublié ») et réponds à cet e-mail pour prévenir le support."

/* ---------------------------------------------------------------- Variables de Supabase */

const GO: V = {
  greet: "{{ if .Data.full_name }}Bonjour {{ .Data.full_name }},{{ else }}Bonjour,{{ end }}",
  url: "{{ .ConfirmationURL }}",
  email: "{{ .Email }}",
  newEmail: "{{ .NewEmail }}",
  oldEmail: "{{ .OldEmail }}",
  token: "{{ .Token }}",
  site: "{{ .SiteURL }}",
  phone: "{{ .Phone }}",
  oldPhone: "{{ .OldPhone }}",
  factor: "{{ .FactorType }}",
  provider: "{{ .Provider }}",
}
const SAMPLE: V = {
  greet: "Bonjour Camille,",
  url: `${NEXORA_WEB_URL}auth/v1/verify?token=exemple`,
  email: "camille@exemple.fr",
  newEmail: "camille.laurent@exemple.fr",
  oldEmail: "camille@ancienne-adresse.fr",
  token: "48291736",
  site: NEXORA_WEB_URL,
  phone: "+229 97 00 00 00",
  oldPhone: "+229 96 00 00 00",
  factor: "totp",
  provider: "google",
}
const sample = (label = "Exemple"): Variant[] => [{ id: "exemple", label, vars: SAMPLE }]

function auth(o: {
  id: string
  group: string
  label: string
  desc: string
  icon: string
  when: string
  notify?: boolean
  render: (v: V) => Rendered
}): EmailTemplate {
  return { ...o, target: "auth", authKey: o.id, vars: GO, variants: sample() }
}

const FEATURES = [
  `${strong("Responsive Lab")} : tes sites dans de vrais appareils, côte à côte.`,
  `${strong("Studio 3D & Motion")} et ${strong("NEX-DESIGN")} pour tes visuels et tes vidéos.`,
  `${strong("App Builder")} et ${strong("Desktop Builder")} : ton site en application Android ou Windows.`,
  `${strong("Supervision")} : tes sites surveillés, avec des alertes par e-mail.`,
]

/* ---------------------------------------------------------------- E-mails des comptes */

const AUTH: EmailTemplate[] = [
  auth({
    id: "confirmation",
    group: "Compte",
    label: "Inscription",
    desc: "Confirmation de l’adresse e-mail à la création du compte.",
    icon: "user",
    when: "À la création d’un compte, depuis NEXORA pour Windows ou NEXORA web.",
    render: (v) => ({
      subject: "Bienvenue sur NEXORA : confirme ton adresse e-mail",
      html: layout({
        ...base,
        kicker: "Inscription",
        title: "Bienvenue sur NEXORA",
        preheader: "Confirme ton adresse pour activer ton compte et synchroniser tes projets.",
        greeting: esc(v.greet),
        body:
          p("Merci d’avoir créé ton compte. Confirme ton adresse e-mail pour l’activer : tes réglages et tes projets se synchroniseront entre NEXORA pour Windows et NEXORA en ligne.") +
          button("Confirmer mon adresse", v.url) +
          p(strong("Ce qui t’attend"), "margin-bottom:12px") +
          bullets(FEATURES),
        fallbackUrl: v.url,
        note: "Ce lien est valable 1 heure. Si tu n’as pas créé de compte NEXORA, ignore cet e-mail : aucun compte ne sera activé.",
        reason: "Tu reçois cet e-mail parce que ton adresse a servi à créer un compte NEXORA.",
      }),
    }),
  }),
  auth({
    id: "magic_link",
    group: "Compte",
    label: "Connexion par lien",
    desc: "Lien de connexion sans mot de passe.",
    icon: "link",
    when: "Quand tu choisis « Recevoir un lien de connexion » à l’écran de connexion.",
    render: (v) => ({
      subject: "Ton lien de connexion à NEXORA",
      html: layout({
        ...base,
        kicker: "Connexion",
        title: "Connecte-toi à NEXORA",
        preheader: "Un clic suffit : pas de mot de passe à saisir.",
        greeting: esc(v.greet),
        body:
          p(`Voici ton lien pour te connecter à ton compte ${strong(v.email)}. Un clic suffit, sans mot de passe.`) +
          button("Me connecter", v.url),
        fallbackUrl: v.url,
        note: "Ce lien ne sert qu’une fois et expire dans 1 heure. Si tu n’as pas demandé à te connecter, ignore cet e-mail : ton compte reste protégé.",
        reason: REASON_ACCOUNT,
      }),
    }),
  }),
  auth({
    id: "recovery",
    group: "Compte",
    label: "Mot de passe oublié",
    desc: "Lien pour choisir un nouveau mot de passe.",
    icon: "key",
    when: "Quand tu demandes « Mot de passe oublié », ou quand un administrateur réinitialise ton mot de passe.",
    render: (v) => ({
      subject: "Réinitialise ton mot de passe NEXORA",
      html: layout({
        ...base,
        kicker: "Mot de passe",
        title: "Choisis un nouveau mot de passe",
        preheader: "Ton lien pour choisir un nouveau mot de passe, valable 1 heure.",
        greeting: esc(v.greet),
        body:
          p(`Une demande de réinitialisation du mot de passe a été faite pour ${strong(v.email)}. Clique sur le bouton pour en choisir un nouveau.`) +
          button("Choisir un nouveau mot de passe", v.url),
        fallbackUrl: v.url,
        note: "Ce lien ne sert qu’une fois et expire dans 1 heure. Si tu n’es pas à l’origine de cette demande, ignore cet e-mail : ton mot de passe actuel reste valable.",
        reason: REASON_ACCOUNT,
      }),
    }),
  }),
  auth({
    id: "invite",
    group: "Compte",
    label: "Invitation",
    desc: "Invitation à créer un compte, envoyée par un administrateur.",
    icon: "mail",
    when: "Quand un administrateur t’invite depuis le back office.",
    render: (v) => ({
      subject: "Tu es invité à rejoindre NEXORA",
      html: layout({
        ...base,
        kicker: "Invitation",
        title: "Tu es invité sur NEXORA",
        preheader: "Accepte l’invitation pour créer ton compte en quelques secondes.",
        greeting: "Bonjour,",
        body:
          p(`Un compte NEXORA t’attend pour ${strong(v.email)}. Accepte l’invitation pour choisir ton mot de passe et commencer.`) +
          button("Accepter l’invitation", v.url) +
          bullets(FEATURES),
        fallbackUrl: v.url,
        note: "Cette invitation expire dans 24 heures. Si tu ne t’attendais pas à la recevoir, ignore cet e-mail.",
        reason: "Tu reçois cet e-mail parce qu’un administrateur de NEXORA t’a invité.",
      }),
    }),
  }),
  auth({
    id: "email_change",
    group: "Compte",
    label: "Changement d’adresse",
    desc: "Confirmation de la nouvelle adresse e-mail du compte.",
    icon: "mail",
    when: "Quand tu changes l’adresse e-mail de ton compte (envoyé à l’ancienne et à la nouvelle adresse).",
    render: (v) => ({
      subject: "Confirme ta nouvelle adresse e-mail NEXORA",
      html: layout({
        ...base,
        kicker: "Adresse e-mail",
        title: "Confirme ta nouvelle adresse",
        preheader: "Un dernier clic pour changer l’adresse de ton compte.",
        greeting: esc(v.greet),
        body:
          p("Tu as demandé à changer l’adresse e-mail de ton compte NEXORA.") +
          rows([["Adresse actuelle", esc(v.email)], ["Nouvelle adresse", esc(v.newEmail)]]) +
          button("Confirmer le changement", v.url),
        fallbackUrl: v.url,
        note: "Pour ta sécurité, le changement doit être confirmé depuis les deux adresses. Si tu n’as rien demandé, ignore cet e-mail et change ton mot de passe.",
        reason: REASON_ACCOUNT,
      }),
    }),
  }),
  auth({
    id: "reauthentication",
    group: "Compte",
    label: "Code de vérification",
    desc: "Code à saisir pour confirmer une action sensible.",
    icon: "lock",
    when: "Quand une action sensible demande de confirmer ton identité.",
    render: (v) => ({
      subject: `${v.token} est ton code de vérification NEXORA`,
      html: layout({
        ...base,
        kicker: "Vérification",
        title: "Ton code de vérification",
        preheader: "Saisis ce code dans NEXORA pour confirmer qu’il s’agit bien de toi.",
        greeting: esc(v.greet),
        body: p("Saisis ce code dans NEXORA pour confirmer qu’il s’agit bien de toi :") + code(v.token),
        note: "Ce code expire dans 1 heure. Ne le communique à personne : l’équipe NEXORA ne te le demandera jamais.",
        reason: REASON_ACCOUNT,
      }),
    }),
  }),
]

/* ---------------------------------------------------------------- Notifications de sécurité */

function notice(o: { id: string; label: string; desc: string; icon: string; when: string; notify: boolean; subject: string; title: string; preheader: string; body: (v: V) => string }) {
  return auth({
    ...o,
    group: "Sécurité",
    render: (v) => ({
      subject: o.subject,
      html: layout({
        ...base,
        kicker: "Sécurité du compte",
        title: o.title,
        preheader: o.preheader,
        greeting: esc(v.greet),
        body: o.body(v) + button("Ouvrir NEXORA", v.site),
        note: SUPPORT,
        reason: REASON_SECURITY,
      }),
    }),
  })
}

const SECURITY: EmailTemplate[] = [
  notice({
    id: "password_changed_notification", label: "Mot de passe modifié", icon: "key", notify: true,
    desc: "Prévient que le mot de passe du compte vient de changer.",
    when: "Après chaque changement de mot de passe.",
    subject: "Ton mot de passe NEXORA a été modifié",
    title: "Ton mot de passe a été modifié",
    preheader: "Le mot de passe de ton compte vient de changer.",
    body: (v) => p(`Le mot de passe du compte ${strong(v.email)} vient d’être modifié. Si c’est toi, tout est en ordre : tu n’as rien à faire.`),
  }),
  notice({
    id: "email_changed_notification", label: "Adresse modifiée", icon: "mail", notify: true,
    desc: "Prévient l’ancienne adresse que l’adresse du compte a changé.",
    when: "Après chaque changement d’adresse e-mail.",
    subject: "L’adresse e-mail de ton compte NEXORA a changé",
    title: "L’adresse de ton compte a changé",
    preheader: "Ton compte NEXORA utilise désormais une nouvelle adresse e-mail.",
    body: (v) => p("L’adresse e-mail de ton compte NEXORA a été remplacée.") + rows([["Ancienne adresse", esc(v.oldEmail)], ["Nouvelle adresse", esc(v.email)]]),
  }),
  notice({
    id: "mfa_factor_enrolled_notification", label: "Vérification ajoutée", icon: "shield", notify: true,
    desc: "Une méthode de vérification en deux étapes a été ajoutée.",
    when: "Quand une méthode de vérification en deux étapes est ajoutée au compte.",
    subject: "Nouvelle méthode de vérification sur ton compte NEXORA",
    title: "Vérification en deux étapes ajoutée",
    preheader: "Une nouvelle méthode de vérification protège ton compte.",
    body: (v) => p("Une nouvelle méthode de vérification en deux étapes a été ajoutée à ton compte.") + rows([["Compte", esc(v.email)], ["Méthode", esc(v.factor)]]),
  }),
  notice({
    id: "mfa_factor_unenrolled_notification", label: "Vérification retirée", icon: "shield", notify: true,
    desc: "Une méthode de vérification en deux étapes a été retirée.",
    when: "Quand une méthode de vérification en deux étapes est retirée du compte.",
    subject: "Une méthode de vérification a été retirée de ton compte NEXORA",
    title: "Vérification en deux étapes retirée",
    preheader: "Une méthode de vérification ne protège plus ton compte.",
    body: (v) => p("Une méthode de vérification en deux étapes a été retirée de ton compte.") + rows([["Compte", esc(v.email)], ["Méthode", esc(v.factor)]]),
  }),
  notice({
    id: "identity_linked_notification", label: "Connexion liée", icon: "link", notify: true,
    desc: "Un nouveau moyen de connexion (Google…) a été lié au compte.",
    when: "Quand un compte Google, GitHub… est lié à ton compte NEXORA.",
    subject: "Nouveau moyen de connexion sur ton compte NEXORA",
    title: "Nouveau moyen de connexion",
    preheader: "Un nouveau moyen de connexion a été lié à ton compte.",
    body: (v) => p(`Ton compte ${esc(v.provider)} peut désormais servir à te connecter à NEXORA.`) + rows([["Compte", esc(v.email)], ["Service", esc(v.provider)]]),
  }),
  notice({
    id: "identity_unlinked_notification", label: "Connexion retirée", icon: "link", notify: true,
    desc: "Un moyen de connexion a été retiré du compte.",
    when: "Quand un compte Google, GitHub… n’est plus lié à ton compte NEXORA.",
    subject: "Un moyen de connexion a été retiré de ton compte NEXORA",
    title: "Moyen de connexion retiré",
    preheader: "Un moyen de connexion ne permet plus d’accéder à ton compte.",
    body: (v) => p(`Ton compte ${esc(v.provider)} ne permet plus de te connecter à NEXORA.`) + rows([["Compte", esc(v.email)], ["Service", esc(v.provider)]]),
  }),
  notice({
    id: "phone_changed_notification", label: "Téléphone modifié", icon: "phone", notify: false,
    desc: "Numéro de téléphone du compte modifié (NEXORA n’utilise pas la connexion par téléphone).",
    when: "Jamais pour l’instant : NEXORA n’utilise pas la connexion par téléphone (notification désactivée).",
    subject: "Le numéro de téléphone de ton compte NEXORA a changé",
    title: "Ton numéro de téléphone a changé",
    preheader: "Ton compte NEXORA utilise un nouveau numéro de téléphone.",
    body: (v) => p("Le numéro de téléphone de ton compte NEXORA a été remplacé.") + rows([["Ancien numéro", esc(v.oldPhone)], ["Nouveau numéro", esc(v.phone)]]),
  }),
]

/* ---------------------------------------------------------------- Alertes de supervision (base) */

// Variables remplacées par public.nx_email_render (migration 20261104000006), déjà échappées par la base.
const ALERT_VARS: V = {
  titre: "{{titre}}", message: "{{message}}", niveau: "{{niveau}}", couleur: "{{couleur}}", fond: "{{fond}}",
  date: "{{date}}", lien: "{{lien}}", kicker: "{{kicker}}", apercu: "{{apercu}}", annee: "{{annee}}",
}
const alertVariant = (id: string, label: string, tone: Tone, niveau: string, titre: string, message: string): Variant => ({
  id, label,
  vars: { titre, message, niveau, couleur: tone.color, fond: tone.tint, date: "4 novembre 2026 à 09:42", lien: NEXORA_WEB_URL, kicker: id === "test" ? "Test" : "Supervision", apercu: message, annee: "2026" },
})
const ALERT: EmailTemplate = {
  id: "alert",
  group: "Supervision",
  label: "Alerte de supervision",
  desc: "Panne, lenteur, certificat, retour à la normale : couleur selon la gravité.",
  icon: "bell",
  target: "db",
  when: "Quand un site surveillé tombe, ralentit, revient ou que son certificat expire (application Windows et serveurs NEXORA).",
  vars: ALERT_VARS,
  variants: [
    alertVariant("down", "Panne", TONES.bad, "Site hors ligne", "boutique-camille.fr est hors ligne", "Délai dépassé · 2 vérifications en échec de suite. Vérifié par les serveurs NEXORA."),
    alertVariant("slow", "Lenteur", TONES.warn, "Lenteur", "boutique-camille.fr est lent", "2 480 ms pour un seuil de 1 500 ms, plusieurs fois de suite."),
    alertVariant("up", "Retour", TONES.ok, "Retour à la normale", "boutique-camille.fr est de nouveau en ligne", "Le site répond de nouveau (312 ms) après 14 min de panne."),
    alertVariant("test", "Test", TONES.info, "Test", "Test des alertes NEXORA", "Cet e-mail confirme que les alertes de supervision partent bien par Brevo."),
  ],
  render: (v) => {
    const tone = { color: v.couleur, tint: v.fond }
    return {
      subject: v.titre,
      html: layout({
        ...base,
        kicker: v.kicker,
        tone,
        badge: pill(v.niveau, tone),
        title: v.titre,
        preheader: v.apercu,
        body: p(v.message) + rows([["Type", v.niveau], ["Détecté le", v.date]]) + button("Ouvrir la supervision", v.lien, tone),
        note: "Pour ne plus recevoir ces e-mails : NEXORA → Sécurité → Supervision &amp; alertes → Alertes, ou demande à l’administrateur de ton équipe.",
        reason: "Tu reçois cet e-mail parce que les alertes par e-mail sont activées pour un site que tu suis dans NEXORA.",
        year: v.annee,
      }),
    }
  },
}

/* ---------------------------------------------------------------- Mise à jour (back office) */

export type UpdateData = { version: string; title: string; intro: string; highlights: string[]; url: string; greeting?: string }

export function updateEmail(d: UpdateData): Rendered {
  const title = d.title.trim() || `NEXORA ${d.version} est disponible`
  const items = d.highlights.map((h) => h.trim()).filter(Boolean)
  const greeting = d.greeting ?? "{{salutation}}"
  return {
    subject: title,
    html: layout({
      ...base,
      kicker: "Nouvelle version",
      badge: pill(`Version ${d.version}`, TONES.brand),
      title,
      preheader: d.intro.trim().slice(0, 140) || `Découvre les nouveautés de NEXORA ${d.version}.`,
      greeting: esc(greeting),
      body:
        (d.intro.trim() ? p(esc(d.intro.trim()).replace(/\n/g, "<br>")) : "") +
        (items.length ? p(strong("Les nouveautés"), "margin-bottom:12px") + bullets(items.map(esc)) : "") +
        button(`Télécharger NEXORA ${d.version}`, d.url) +
        p(`Déjà installée ? NEXORA te propose la mise à jour au prochain lancement (Réglages → Mises à jour). Tu peux aussi utiliser <a class="nx-link" href="${esc(NEXORA_WEB_URL)}" style="color:#0a0a0a;text-decoration:underline;font-weight:600">NEXORA en ligne</a>, toujours à jour.`, "font-size:14px"),
      note: "Tes réglages et tes projets sont conservés pendant la mise à jour.",
      reason: "Tu reçois cet e-mail parce que tu as un compte NEXORA.",
    }),
    text: [
      greeting,
      "",
      title,
      d.intro.trim(),
      ...(items.length ? ["", "Les nouveautés :", ...items.map((h) => `- ${h}`)] : []),
      "",
      `Télécharger NEXORA ${d.version} : ${d.url}`,
      `NEXORA en ligne : ${NEXORA_WEB_URL}`,
      "",
      "— L’équipe NEXORA",
    ].join("\n"),
  }
}

const UPDATE_SAMPLE: UpdateData = {
  version: "1.2.2",
  title: "",
  intro: "Une interface entièrement redessinée, plus sobre, et des appareils réalistes dans le Studio.",
  highlights: ["Nouvelle interface : noir et gris très sombre, ou blanc et gris clair, boutons et champs arrondis.", "Appareils réalistes dans le Studio : 10 modèles à taille réelle, avec ta scène ou ton image à l’écran.", "Formulaires plus lisibles et lanceur 1.0.5, qui se met à jour tout seul."],
  url: NEXORA_WEB_URL,
  greeting: "Bonjour Camille,",
}

const UPDATE: EmailTemplate = {
  id: "update",
  group: "Mises à jour",
  label: "Nouvelle version",
  desc: "Annonce d’une nouvelle version de NEXORA, avec les nouveautés.",
  icon: "download",
  target: "admin",
  when: "Depuis le back office : E-mails → « Annoncer une mise à jour ».",
  variants: [{ id: "exemple", label: "Exemple", vars: {} }],
  render: () => updateEmail(UPDATE_SAMPLE),
}

/* ---------------------------------------------------------------- Facture (back office) */

export type InvoiceMailData = {
  number: string
  greeting: string
  total: string
  issuedAt: string
  dueAt: string
  paid: boolean
  filename: string
  payment: string
  issuerName: string
}

export function invoiceEmail(d: InvoiceMailData): Rendered {
  const title = d.paid ? `Ta facture ${d.number} (payée)` : `Ta facture ${d.number}`
  return {
    subject: `Facture ${d.number} · NEXORA`,
    html: layout({
      ...base,
      kicker: "Facturation",
      badge: d.paid ? pill("Payée", TONES.ok) : pill(`À régler avant le ${d.dueAt}`, TONES.brand),
      title,
      preheader: `Facture ${d.number} de ${d.total}, en pièce jointe au format PDF.`,
      greeting: esc(d.greeting),
      body:
        p(`Voici ta facture ${strong(d.number)}. Tu la trouveras en pièce jointe au format PDF.`) +
        rows([["Facture", esc(d.number)], ["Date", esc(d.issuedAt)], ...(d.paid ? [] : ([["Échéance", esc(d.dueAt)]] as [string, string][])), ["Montant", esc(d.total)]], true) +
        (d.paid
          ? p("Merci, ton paiement est bien reçu. Garde cette facture pour ta comptabilité.")
          : d.payment.trim()
            ? p(strong("Modalités de paiement"), "margin-bottom:8px") + box(`<div class="nx-text" style="font-size:14.5px;line-height:1.65;color:#3d3d3d">${esc(d.payment.trim()).replace(/\n/g, "<br>")}</div>`)
            : "") +
        box(
          `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:middle;padding-right:12px"><div class="nx-dot" style="width:36px;height:44px;border-radius:9px;background:#0a0a0a;color:#ffffff;font-size:10px;font-weight:700;line-height:44px;text-align:center;letter-spacing:.5px">PDF</div></td>
<td class="nx-ink" style="vertical-align:middle;font-size:14.5px;font-weight:600;color:#0a0a0a">${esc(d.filename)}<div class="nx-muted" style="font-size:12.5px;font-weight:400;color:#6b6b6b">Pièce jointe · PDF</div></td></tr></table>`,
          "padding:14px 16px",
        ),
      note: "Une question sur cette facture ? Réponds simplement à cet e-mail.",
      reason: `Tu reçois cet e-mail parce que ${esc(d.issuerName)} t’a adressé une facture pour NEXORA.`,
    }),
    text: [
      d.greeting,
      "",
      `Voici ta facture ${d.number} (pièce jointe : ${d.filename}).`,
      `Date : ${d.issuedAt}`,
      ...(d.paid ? ["Statut : payée. Merci !"] : [`Échéance : ${d.dueAt}`]),
      `Montant : ${d.total}`,
      ...(!d.paid && d.payment.trim() ? ["", "Modalités de paiement :", d.payment.trim()] : []),
      "",
      "Une question ? Réponds à cet e-mail.",
      "— L’équipe NEXORA",
    ].join("\n"),
  }
}

const INVOICE: EmailTemplate = {
  id: "invoice",
  group: "Facturation",
  label: "Facture",
  desc: "Facture en pièce jointe PDF, avec le montant et l’échéance.",
  icon: "pdf",
  target: "admin",
  when: "Depuis le back office : Factures → « Envoyer par e-mail ».",
  variants: [
    { id: "due", label: "À régler", vars: { paid: "" } },
    { id: "paid", label: "Payée", vars: { paid: "1" } },
  ],
  render: (v) =>
    invoiceEmail({
      number: "NX-2026-0004",
      greeting: "Bonjour Camille,",
      total: "29,00 €",
      issuedAt: "4 novembre 2026",
      dueAt: "4 décembre 2026",
      paid: Boolean(v.paid),
      filename: "Facture-NX-2026-0004.pdf",
      payment: "Virement bancaire — IBAN FR76 0000 0000 0000 0000 0000 000\nRéférence à indiquer : NX-2026-0004",
      issuerName: "NEXORA",
    }),
}

export const TEMPLATES: EmailTemplate[] = [...AUTH, ...SECURITY, ALERT, UPDATE, INVOICE]

/** Rendu pour l'aperçu : variables d'exemple, logo servi par le back office (l'aperçu marche hors ligne). */
export function preview(t: EmailTemplate, variantId: string | undefined, logo: string): Rendered {
  const v = t.variants.find((x) => x.id === variantId) || t.variants[0]
  const r = t.render(v.vars)
  return { ...r, html: r.html.split(LOGO_URL).join(logo) }
}

/* ---------------------------------------------------------------- Ce qui part chez Supabase et dans la base */

/** Réglages de Supabase Auth : objets, contenus, notifications de sécurité et limite d'envoi. */
export function authPatch(): Record<string, string | boolean | number> {
  const patch: Record<string, string | boolean | number> = {
    // Brevo gratuit : 300 e-mails par jour ; Supabase n'en laisse partir que 2 par heure par défaut.
    rate_limit_email_sent: 30,
  }
  for (const t of TEMPLATES) {
    if (t.target !== "auth" || !t.authKey) continue
    const r = t.render(GO)
    patch[`mailer_subjects_${t.authKey}`] = r.subject
    patch[`mailer_templates_${t.authKey}_content`] = r.html
    if (t.notify !== undefined) patch[`mailer_notifications_${t.authKey.replace(/_notification$/, "")}_enabled`] = t.notify
  }
  return patch
}

/** Modèles enregistrés dans la base (app_config.email_templates), lus par nx_brevo_send. */
export function dbTemplates() {
  const r = ALERT.render(ALERT_VARS)
  return { version: TEMPLATES_VERSION, alert: { subject: r.subject, html: r.html } }
}
