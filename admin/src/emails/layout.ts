// Mise en page commune des e-mails de NEXORA (#031). #104 : direction « Horizon » du site et des interfaces (#099 à
// #103) : fond gris clair, carte blanche à grands rayons dont le haut est un bandeau noir (repère « /tag » en pilule à
// contour, titre fin en blanc), texte sobre, bouton en pilule noire, encadrés gris, monochrome ; les couleurs d'état
// (panne, lenteur, retour, payée) ne servent qu'aux pastilles et au filet sous le bandeau. Police Urbanist chargée
// depuis Google Fonts là où le client l'accepte (Apple Mail, iOS, certains webmails), sinon Helvetica ou Arial.
// HTML « à l'ancienne » (tableaux, styles en ligne) pour Gmail, Outlook, Apple Mail et les webmails ; le mode sombre
// est pris en charge là où le client le permet. Les valeurs insérées sont échappées ; les variables de Supabase
// ({{ .ConfirmationURL }}) et celles remplacées par la base ({{titre}}) traversent l'échappement sans changement.

export const BRAND = {
  /** Encre : boutons, titres, bandeau du haut. */
  solid: "#0a0a0a",
  ink: "#0a0a0a",
  text: "#3d3d3d",
  muted: "#6b6b6b",
  faint: "#8f8f8f",
  bg: "#f2f2f2",
  card: "#ffffff",
  box: "#f5f5f5",
  line: "#e7e7e7",
  /** Bandeau du haut et textes posés dessus. */
  band: "#0a0a0a",
  bandText: "#ffffff",
  bandMuted: "#a3a3a3",
}

export type Tone = { color: string; tint: string }
export const TONES = {
  brand: { color: "#0a0a0a", tint: "#efefef" },
  bad: { color: "#d92d20", tint: "#fdecea" },
  warn: { color: "#c46a00", tint: "#fff3e0" },
  ok: { color: "#16884a", tint: "#e6f5ec" },
  info: { color: "#3f51d6", tint: "#eceffd" },
} satisfies Record<string, Tone>

const FONT = "Urbanist,'Helvetica Neue',Helvetica,Arial,sans-serif"
const MONO = "'SF Mono',ui-monospace,Menlo,Consolas,'Courier New',monospace"

export const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

/** Paragraphe de texte courant. */
export const p = (html: string, extra = "") =>
  `<p class="nx-text" style="margin:0 0 18px;font-family:${FONT};font-size:16px;line-height:1.65;color:${BRAND.text};${extra}">${html}</p>`

/** Bouton principal : pilule noire à flèche (blanche en mode sombre). La couleur d'état n'est jamais celle du bouton. */
export function button(label: string, url: string, _tone?: Tone) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 26px"><tr>
<td class="nx-btn" align="center" bgcolor="${BRAND.solid}" style="border-radius:999px;background:${BRAND.solid}">
<a class="nx-btn-a" href="${esc(url)}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:999px">${esc(label)}&nbsp;&nbsp;&#8599;</a>
</td></tr></table>`
}

/** Encadré gris (informations, récapitulatif). */
export const box = (html: string, extra = "") =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border-collapse:separate"><tr>
<td class="nx-box" style="background:${BRAND.box};border-radius:18px;padding:20px 22px;${extra}">${html}</td></tr></table>`

/** Lignes « libellé : valeur » dans un encadré. La valeur est du HTML déjà échappé. */
export function rows(list: [string, string][], strongLast = false) {
  return box(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${list
      .map(([k, v], i) => {
        const last = strongLast && i === list.length - 1
        const sep = i ? `border-top:1px solid ${BRAND.line};` : ""
        return `<tr><td class="nx-muted nx-sep" style="${sep}padding:${i ? 12 : 0}px 12px 0 0;font-family:${FONT};font-size:14px;line-height:1.5;color:${BRAND.muted};vertical-align:${last ? "bottom" : "top"};white-space:nowrap">${esc(k)}</td>
<td class="nx-ink nx-sep" align="right" style="${sep}padding:${i ? 12 : 0}px 0 0;font-family:${FONT};font-size:${last ? 22 : 14.5}px;line-height:1.4;font-weight:${last ? 500 : 600};letter-spacing:${last ? "-.4px" : "0"};color:${BRAND.ink};vertical-align:top">${v}</td></tr>`
      })
      .join("")}</table>`,
  )
}

/** Code à saisir, en grands chiffres espacés, dans un encadré à filet pointillé. */
export const code = (value: string) =>
  box(
    `<div class="nx-ink" style="font-family:${MONO};font-size:32px;font-weight:600;letter-spacing:10px;text-align:center;color:${BRAND.ink}">${esc(value)}</div>`,
    `padding:24px 20px;text-align:center;border:1px dashed #cfcfcf`,
  )

/** Liste à puces : coche blanche dans un rond noir. Chaque élément est du HTML déjà échappé. */
export function bullets(items: string[], _tone: Tone = TONES.brand) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px">${items
    .map(
      (it) => `<tr><td width="30" style="vertical-align:top;padding:2px 0 12px">
<div class="nx-dot" style="width:20px;height:20px;border-radius:10px;background:${BRAND.solid};color:#ffffff;font-family:${FONT};font-size:11px;line-height:20px;font-weight:700;text-align:center">&#10003;</div></td>
<td class="nx-text" style="vertical-align:top;padding:0 0 12px;font-family:${FONT};font-size:15.5px;line-height:1.6;color:${BRAND.text}">${it}</td></tr>`,
    )
    .join("")}</table>`
}

/** Pastille de statut (« Site hors ligne », « Version 1.2.0 »…), posée dans le bandeau noir. */
export const pill = (label: string, tone: Tone) =>
  `<span style="display:inline-block;padding:6px 13px;border-radius:999px;background:${tone.color === TONES.brand.color ? "#ffffff" : tone.color};color:${tone.color === TONES.brand.color ? BRAND.ink : "#ffffff"};font-family:${FONT};font-size:12.5px;font-weight:600;letter-spacing:.2px">${esc(label)}</span>`

export type Layout = {
  /** Titre du document et grand titre de l'e-mail. */
  title: string
  /** Texte d'aperçu affiché par la boîte de réception après l'objet. */
  preheader: string
  /** Petit libellé au-dessus du titre (« Inscription », « Supervision »…), montré en repère « /inscription ». */
  kicker?: string
  /** Couleur d'état (alertes, factures) : filet sous le bandeau. Aucun filet par défaut. */
  tone?: Tone
  /** Pastille au-dessus du titre (HTML, voir pill()). */
  badge?: string
  /** Salutation (« Bonjour Camille, »), déjà prête (HTML). */
  greeting?: string
  /** Corps : HTML (paragraphes, encadrés, bouton…). */
  body: string
  /** Lien à recopier si le bouton ne fonctionne pas. */
  fallbackUrl?: string
  /** Petite note sous le corps (sécurité, validité du lien). HTML. */
  note?: string
  /** Raison de l'envoi, dans le pied de page. HTML. */
  reason: string
  /** Adresse de NEXORA web (liens du pied de page). */
  webUrl: string
  /** Adresse absolue du logo. */
  logoUrl: string
  /** Année du pied de page (texte ou variable). */
  year?: string
}

/** Typographie française : espace insécable avant « : ; ! ? » (évite un signe seul en début de ligne). */
const fr = (html = "") => html.replace(/ ([:;!?])(?=\s|<|$)/g, "&nbsp;$1")

export function layout(o: Layout) {
  const year = o.year ?? String(new Date().getFullYear())
  const rule = o.tone ? `<tr><td height="4" style="height:4px;line-height:4px;font-size:0;background:${o.tone.color}">&nbsp;</td></tr>` : ""
  return `<!doctype html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(o.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@300;400;500;600;700&amp;display=swap" rel="stylesheet">
<style>
  body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table,td{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0}
  img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
  a{color:${BRAND.ink}}
  @media only screen and (max-width:620px){
    .nx-wrap{padding:14px 8px!important}
    .nx-pad{padding:28px 22px 6px!important}
    .nx-band{padding:28px 22px 26px!important}
    .nx-title{font-size:28px!important}
  }
  @media (prefers-color-scheme:dark){
    .nx-bg{background:#000000!important}
    .nx-card{background:#111111!important;border-color:#262626!important}
    .nx-box{background:#1b1b1b!important}
    .nx-ink{color:#ffffff!important}
    .nx-text{color:#d4d4d4!important}
    .nx-muted{color:#9a9a9a!important}
    .nx-sep{border-color:#2e2e2e!important}
    .nx-link{color:#ffffff!important}
    .nx-btn{background:#ffffff!important}
    .nx-btn-a{color:#0a0a0a!important}
    .nx-dot{background:#ffffff!important;color:#0a0a0a!important}
  }
  [data-ogsc] .nx-card{background:#111111!important}
  [data-ogsc] .nx-ink{color:#ffffff!important}
  [data-ogsc] .nx-text{color:#d4d4d4!important}
</style>
</head>
<body class="nx-bg" style="margin:0;padding:0;background:${BRAND.bg};font-family:${FONT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${esc(o.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="nx-bg" style="background:${BRAND.bg}">
<tr><td align="center" class="nx-wrap" style="padding:36px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;border-collapse:separate">

<tr><td style="padding:0 8px 18px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:middle"><a href="${esc(o.webUrl)}" target="_blank"><img src="${esc(o.logoUrl)}" width="36" height="36" alt="NEXORA" style="display:block;width:36px;height:36px;border-radius:10px"></a></td>
<td class="nx-ink" style="vertical-align:middle;padding-left:11px;font-family:${FONT};font-size:16px;font-weight:600;letter-spacing:3px;color:${BRAND.ink}">NEXORA</td>
</tr></table></td>
<td align="right" class="nx-muted" style="vertical-align:middle;font-family:${FONT};font-size:12.5px;color:${BRAND.muted}">l’atelier web tout-en-un</td>
</tr></table>
</td></tr>

<tr><td class="nx-card nx-sep" style="background:${BRAND.card};border-radius:28px;border:1px solid #e3e3e3;overflow:hidden">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate">
<tr><td class="nx-band" bgcolor="${BRAND.band}" style="background:${BRAND.band};border-radius:27px 27px 0 0;padding:34px 40px 32px">
${o.kicker ? `<div style="margin:0 0 18px"><span style="display:inline-block;padding:6px 13px;border-radius:999px;border:1px solid #3a3a3a;font-family:${FONT};font-size:12.5px;font-weight:500;color:${BRAND.bandText}"><span style="color:${BRAND.bandMuted}">/</span>&nbsp;${esc(o.kicker.toLowerCase())}</span></div>` : ""}
${o.badge ? `<div style="margin:0 0 16px">${o.badge}</div>` : ""}
<h1 class="nx-title" style="margin:0;font-family:${FONT};font-size:34px;line-height:1.12;font-weight:300;letter-spacing:-.8px;color:${BRAND.bandText}">${esc(o.title)}</h1>
</td></tr>
${rule}
<tr><td class="nx-pad" style="padding:34px 40px 10px">
${o.greeting ? p(o.greeting, "font-weight:600;color:" + BRAND.ink) : ""}
${fr(o.body)}
${
  o.fallbackUrl
    ? `<p class="nx-muted" style="margin:0 0 6px;font-family:${FONT};font-size:13px;line-height:1.5;color:${BRAND.muted}">Le bouton ne fonctionne pas&nbsp;? Copie ce lien dans ton navigateur&nbsp;:</p>
<p style="margin:0 0 24px;font-family:${MONO};font-size:12px;line-height:1.55;word-break:break-all"><a class="nx-link" href="${esc(o.fallbackUrl)}" target="_blank" style="color:${BRAND.ink};text-decoration:underline">${esc(o.fallbackUrl)}</a></p>`
    : ""
}
${o.note ? `<p class="nx-muted nx-sep" style="margin:0;padding:18px 0 28px;border-top:1px solid ${BRAND.line};font-family:${FONT};font-size:13.5px;line-height:1.6;color:${BRAND.muted}">${fr(o.note)}</p>` : `<div style="height:16px;line-height:16px;font-size:0">&nbsp;</div>`}
</td></tr>
</table>
</td></tr>

<tr><td align="center" style="padding:26px 24px 6px">
<p style="margin:0 0 12px;font-family:${FONT};font-size:13px;line-height:1.6"><a class="nx-link" href="${esc(o.webUrl)}" target="_blank" style="display:inline-block;padding:8px 16px;border-radius:999px;border:1px solid #d6d6d6;color:${BRAND.ink};text-decoration:none;font-weight:600">Ouvrir NEXORA&nbsp;&#8599;</a></p>
<p class="nx-muted" style="margin:0 0 8px;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${BRAND.muted}"><b class="nx-ink" style="color:${BRAND.ink};letter-spacing:1.5px">NEXORA</b> · crée, teste et publie tes sites et applications.</p>
<p class="nx-muted" style="margin:0 0 6px;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.faint}">${fr(o.reason)}</p>
<p class="nx-muted" style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.faint}">© ${esc(year)} NEXORA</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}
