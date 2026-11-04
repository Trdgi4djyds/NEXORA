// Mise en page commune des e-mails de NEXORA (#031) : logo, dégradé de la marque, carte blanche, bouton,
// encadrés et pied de page. HTML « à l'ancienne » (tableaux, styles en ligne) pour Gmail, Outlook,
// Apple Mail et les webmails ; le mode sombre est pris en charge là où le client le permet.
// Les valeurs insérées sont échappées ; les variables de Supabase ({{ .ConfirmationURL }}) et celles
// remplacées par la base ({{titre}}) traversent l'échappement sans changement.

export const BRAND = {
  grad: "linear-gradient(135deg,#ff6a88 0%,#d34bd5 48%,#5b6cff 100%)",
  solid: "#7b4fe6",
  ink: "#1d1d1f",
  text: "#3a3a3c",
  muted: "#6e6e73",
  faint: "#8e8e93",
  bg: "#f2f2f7",
  card: "#ffffff",
  box: "#f6f6f9",
  line: "#e5e5ea",
}

export type Tone = { color: string; tint: string }
export const TONES = {
  brand: { color: BRAND.solid, tint: "#f3eefe" },
  bad: { color: "#e5302a", tint: "#fdecec" },
  warn: { color: "#d97706", tint: "#fff4e0" },
  ok: { color: "#1f9d55", tint: "#e7f6ee" },
  info: { color: "#4f62f5", tint: "#eef0ff" },
} satisfies Record<string, Tone>

const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const MONO = "'SF Mono',ui-monospace,Menlo,Consolas,'Courier New',monospace"

export const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

/** Paragraphe de texte courant. */
export const p = (html: string, extra = "") =>
  `<p class="nx-text" style="margin:0 0 16px;font-size:15.5px;line-height:1.6;color:${BRAND.text};${extra}">${html}</p>`

/** Bouton principal (dégradé, couleur pleine pour Outlook). */
export function button(label: string, url: string, tone?: Tone) {
  const bg = tone ? tone.color : BRAND.solid
  const fill = tone ? tone.color : BRAND.grad
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr>
<td align="center" bgcolor="${bg}" style="border-radius:12px;background:${bg};background-image:${fill}">
<a href="${esc(url)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:12px">${esc(label)}</a>
</td></tr></table>`
}

/** Encadré gris (informations, récapitulatif). */
export const box = (html: string, extra = "") =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr>
<td class="nx-box" style="background:${BRAND.box};border-radius:14px;padding:18px 20px;${extra}">${html}</td></tr></table>`

/** Lignes « libellé : valeur » dans un encadré. La valeur est du HTML déjà échappé. */
export function rows(list: [string, string][], strongLast = false) {
  return box(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${list
      .map(([k, v], i) => {
        const last = strongLast && i === list.length - 1
        const sep = i ? `border-top:1px solid ${BRAND.line};` : ""
        return `<tr><td class="nx-muted nx-sep" style="${sep}padding:${i ? 10 : 0}px 12px 0 0;font-size:13.5px;line-height:1.5;color:${BRAND.muted};vertical-align:top;white-space:nowrap">${esc(k)}</td>
<td class="nx-ink nx-sep" align="right" style="${sep}padding:${i ? 10 : 0}px 0 0;font-size:${last ? 17 : 14}px;line-height:1.5;font-weight:${last ? 700 : 600};color:${BRAND.ink};vertical-align:top">${v}</td></tr>`
      })
      .join("")}</table>`,
  )
}

/** Code à saisir, en grands chiffres espacés. */
export const code = (value: string) =>
  box(
    `<div class="nx-ink" style="font-family:${MONO};font-size:30px;font-weight:700;letter-spacing:8px;text-align:center;color:${BRAND.ink}">${esc(value)}</div>`,
    "padding:22px 20px;text-align:center",
  )

/** Liste à puces aux couleurs de la marque. Chaque élément est du HTML déjà échappé. */
export function bullets(items: string[], tone: Tone = TONES.brand) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">${items
    .map(
      (it) => `<tr><td width="26" style="vertical-align:top;padding:3px 0 10px">
<div style="width:18px;height:18px;border-radius:9px;background:${tone.tint};color:${tone.color};font-size:11px;line-height:18px;font-weight:700;text-align:center">&#10003;</div></td>
<td class="nx-text" style="vertical-align:top;padding:0 0 10px;font-size:15px;line-height:1.55;color:${BRAND.text}">${it}</td></tr>`,
    )
    .join("")}</table>`
}

/** Pastille de statut (« Site hors ligne », « Version 1.1.0 »…). */
export const pill = (label: string, tone: Tone) =>
  `<span style="display:inline-block;padding:5px 11px;border-radius:999px;background:${tone.tint};color:${tone.color};font-size:12px;font-weight:700;letter-spacing:.3px">${esc(label)}</span>`

export type Layout = {
  /** Titre du document et grand titre de l'e-mail. */
  title: string
  /** Texte d'aperçu affiché par la boîte de réception après l'objet. */
  preheader: string
  /** Petit libellé au-dessus du titre (« Inscription », « Supervision »…). */
  kicker?: string
  /** Couleur du bandeau du haut : dégradé de la marque par défaut. */
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
  const tone = o.tone
  const strip = tone
    ? `background:${tone.color}`
    : `background:${BRAND.solid};background-image:${BRAND.grad}`
  const year = o.year ?? String(new Date().getFullYear())
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
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
<style>
  body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table,td{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0}
  img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
  a{color:${BRAND.solid}}
  @media only screen and (max-width:620px){
    .nx-wrap{padding:16px 10px!important}
    .nx-pad{padding:28px 22px 8px!important}
    .nx-title{font-size:23px!important}
  }
  @media (prefers-color-scheme:dark){
    .nx-bg{background:#000000!important}
    .nx-card{background:#1c1c1e!important}
    .nx-box{background:#2c2c2e!important}
    .nx-ink,.nx-title{color:#f5f5f7!important}
    .nx-text{color:#d1d1d6!important}
    .nx-muted{color:#a1a1a6!important}
    .nx-sep{border-color:#3a3a3c!important}
    .nx-link{color:#b9a6ff!important}
  }
  [data-ogsc] .nx-card{background:#1c1c1e!important}
  [data-ogsc] .nx-ink,[data-ogsc] .nx-title{color:#f5f5f7!important}
  [data-ogsc] .nx-text{color:#d1d1d6!important}
</style>
</head>
<body class="nx-bg" style="margin:0;padding:0;background:${BRAND.bg};font-family:${FONT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${esc(o.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="nx-bg" style="background:${BRAND.bg}">
<tr><td align="center" class="nx-wrap" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;border-collapse:separate">

<tr><td style="padding:0 6px 18px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:middle"><a href="${esc(o.webUrl)}" target="_blank"><img src="${esc(o.logoUrl)}" width="40" height="40" alt="NEXORA" style="display:block;width:40px;height:40px;border-radius:10px"></a></td>
<td class="nx-ink" style="vertical-align:middle;padding-left:11px;font-family:${FONT};font-size:18px;font-weight:700;letter-spacing:1.6px;color:${BRAND.ink}">NEXORA</td>
</tr></table>
</td></tr>

<tr><td class="nx-card nx-sep" style="background:${BRAND.card};border-radius:22px;border:1px solid #e8e8ee;overflow:hidden">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td height="6" style="height:6px;line-height:6px;font-size:0;${strip};border-radius:21px 21px 0 0">&nbsp;</td></tr>
<tr><td class="nx-pad" style="padding:36px 40px 12px">
${o.kicker ? `<div style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${tone ? tone.color : BRAND.solid}">${esc(o.kicker)}</div>` : ""}
${o.badge ? `<div style="margin:0 0 14px">${o.badge}</div>` : ""}
<h1 class="nx-title" style="margin:0 0 18px;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-.4px;color:${BRAND.ink}">${esc(o.title)}</h1>
${o.greeting ? p(o.greeting, "font-weight:600;color:" + BRAND.ink) : ""}
${fr(o.body)}
${
  o.fallbackUrl
    ? `<p class="nx-muted" style="margin:0 0 6px;font-size:12.5px;line-height:1.5;color:${BRAND.muted}">Le bouton ne fonctionne pas&nbsp;? Copie ce lien dans ton navigateur&nbsp;:</p>
<p style="margin:0 0 22px;font-family:${MONO};font-size:12px;line-height:1.5;word-break:break-all"><a class="nx-link" href="${esc(o.fallbackUrl)}" target="_blank" style="color:${BRAND.solid};text-decoration:none">${esc(o.fallbackUrl)}</a></p>`
    : ""
}
${o.note ? `<p class="nx-muted nx-sep" style="margin:0;padding:16px 0 26px;border-top:1px solid ${BRAND.line};font-size:13px;line-height:1.55;color:${BRAND.muted}">${fr(o.note)}</p>` : `<div style="height:14px;line-height:14px;font-size:0">&nbsp;</div>`}
</td></tr>
</table>
</td></tr>

<tr><td align="center" style="padding:22px 24px 6px">
<p class="nx-muted" style="margin:0 0 8px;font-size:12.5px;line-height:1.6;color:${BRAND.muted}"><b class="nx-ink" style="color:${BRAND.ink}">NEXORA</b> · l’atelier pour créer, tester et publier tes sites et applications.</p>
<p style="margin:0 0 10px;font-size:12.5px;line-height:1.6"><a class="nx-link" href="${esc(o.webUrl)}" target="_blank" style="color:${BRAND.solid};text-decoration:none;font-weight:600">Ouvrir NEXORA</a></p>
<p class="nx-muted" style="margin:0 0 6px;font-size:11.5px;line-height:1.6;color:${BRAND.faint}">${fr(o.reason)}</p>
<p class="nx-muted" style="margin:0;font-size:11.5px;line-height:1.6;color:${BRAND.faint}">© ${esc(year)} NEXORA</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}
