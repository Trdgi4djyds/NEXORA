// Configuration du projet Supabase depuis le navigateur, par l'API de gestion
// (https://api.supabase.com). Réservé aux super-administrateurs.
// Cette API n'accepte les appels de navigateur que depuis supabase.com : le back office passe donc par
// le relais de sa propre adresse, /__supabase-api (Worker Cloudflare et aperçu, worker/supabase-relay.js, #026).
// Le jeton d'accès personnel (sbp_…) est saisi ici et gardé seulement pour la session de l'onglet
// (sessionStorage) : il n'est jamais écrit dans le code ; le relais le transmet à Supabase sans le garder.
import { useState, type FormEvent, type ReactNode } from "react"
import { useRefresh } from "../App"
import { Icon } from "../icons"
import { useMe } from "../auth"
import { NEXORA_WEB_URL, PROJECT_REF, sb } from "../supabase"
import { Empty, fmtDateTime, Loaded, Switch, Table, Tag, useAction, useLoad, useUi } from "../ui"
import setup from "../../../supabase/nexora.json"

const MIGRATIONS = import.meta.glob("../../../supabase/migrations/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>
export const TOKEN_KEY = "nexora-admin-sbp"

type AuthConfig = {
  site_url: string
  uri_allow_list: string
  disable_signup: boolean
  mailer_autoconfirm: boolean
  password_min_length: number
  external_email_enabled: boolean
  smtp_host: string | null
  smtp_port?: string | number | null
  smtp_user?: string | null
  smtp_pass?: string | null
  smtp_admin_email?: string | null
  smtp_sender_name?: string | null
  rate_limit_email_sent?: number | null
  jwt_exp: number
}

/** Limite horaire des e-mails des comptes avec le SMTP Brevo (#039) : Supabase garde 2 par heure tant qu'on ne la relève pas. */
const AUTH_MAIL_RATE = setup.email.authRateLimitPerHour
const lowMailRate = (a: Partial<AuthConfig>) => !!a.smtp_host && Number(a.rate_limit_email_sent ?? 0) < AUTH_MAIL_RATE
type Fn = { slug: string; status: string; version: number; verify_jwt: boolean; updated_at: number }

/** Adresse du back office (sans le fragment), pour les liens de réinitialisation envoyés par e-mail. */
declare const __ADMIN_BUILD__: string | undefined
/** Date de la publication du back office (scripts/build-web.mjs, #027) : montre tout de suite si la page est à jour. */
const ADMIN_BUILD = typeof __ADMIN_BUILD__ === "string" ? `Back office du ${new Date(__ADMIN_BUILD__).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}` : "Back office de l’aperçu"

/** Résultat d'une action, affiché jusqu'à la suivante (NEXORA #027 : confirmation visible, erreur complète). */
export type Outcome = { ok: boolean; text: string; at: number } | null
const clock = (t: number) => new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function OutcomeBanner({ outcome, onClose }: { outcome: Outcome; onClose: () => void }) {
  if (!outcome) return null
  return (
    <div className={`banner outcome ${outcome.ok ? "ok" : "bad"}`} role={outcome.ok ? "status" : "alert"}>
      <Icon name={outcome.ok ? "check" : "error"} size={16} />
      <span className="grow">{outcome.text} <span className="muted small">— {clock(outcome.at)}</span></span>
      <button className="icon-btn" title="Masquer" onClick={onClose}><Icon name="close" size={12} /></button>
    </div>
  )
}

export const adminUrl = () => `${location.origin}${location.pathname}`
export const recommendedRedirects = () => [...new Set([...setup.redirectUrls, `${adminUrl()}**`])]
// NEXORA #110 : SMTP en place sur un autre compte Brevo ou un autre expéditeur que ceux de supabase/nexora.json.
export const smtpStale = (a: { smtp_host?: string | null; smtp_user?: string | null; smtp_admin_email?: string | null }) =>
  a.smtp_host === setup.email.smtpHost && (a.smtp_user !== setup.email.smtpUser || a.smtp_admin_email !== setup.email.senderEmail)

export async function mgmt<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  // Relais à la racine du site (le back office est servi sous /admin/).
  const url = new URL(`../__supabase-api/v1/projects/${PROJECT_REF}${path}`, document.baseURI)
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) },
    })
  } catch {
    throw new Error("Impossible de joindre Supabase par le relais du back office : vérifie ta connexion, puis réessaie.")
  }
  const text = await res.text()
  let body: unknown = text
  try { body = JSON.parse(text) } catch { /* texte brut */ }
  // Réponse qui ne vient pas du relais (page restée ouverte avant la publication, publication en cours…).
  if (!res.ok && !res.headers.get("X-Nexora-Relay"))
    throw new Error(`Le relais du back office ne répond pas (HTTP ${res.status}) : recharge la page avec Ctrl + F5, puis réessaie.`)
  if (!res.ok) {
    const m = (body as { message?: string; error?: string })?.message || (body as { error?: string })?.error || text
    throw new Error(res.status === 401 ? "Jeton refusé : vérifie qu’il est valide et qu’il a accès au projet." : `Supabase (${res.status}) : ${m}`)
  }
  return body as T
}
const sql = <T = Record<string, unknown>>(token: string, query: string) =>
  mgmt<T[]>(token, "/database/query", { method: "POST", body: JSON.stringify({ query }) })

export function SupabaseSetup() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || "")
  if (!token) return <TokenForm onToken={(t) => { sessionStorage.setItem(TOKEN_KEY, t); setToken(t) }} />
  return (
    <>
      <div className="banner info">
        <Icon name="key" size={16} />
        <span className="grow">Connecté au projet <code>{PROJECT_REF}</code> avec ton jeton d’accès (gardé jusqu’à la fermeture de l’onglet).</span><small className="muted">{ADMIN_BUILD}</small>
        <button className="btn sm" onClick={() => { sessionStorage.removeItem(TOKEN_KEY); setToken("") }}>Oublier le jeton</button>
      </div>
      <Project token={token} />
      <Checks token={token} />
      <AuthSettings token={token} />
      <EmailSettings token={token} />
      <div className="cols">
        <Functions token={token} />
        <Migrations token={token} />
      </div>
      <SqlConsole token={token} />
    </>
  )
}

export function TokenForm({ onToken }: { onToken: (t: string) => void }) {
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      await mgmt(value.trim(), "")
      onToken(value.trim())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="card form" style={{ maxWidth: 620 }} onSubmit={submit}>
      <div className="card-head"><Icon name="key" size={16} /><h3>Jeton d’accès Supabase</h3></div>
      <p className="muted" style={{ margin: 0 }}>
        Pour modifier la configuration du projet (adresses de redirection, inscriptions, base de données), le back office utilise l’API de gestion de Supabase avec ton jeton d’accès personnel.
        Crée-le dans Supabase → avatar → Account preferences → Access Tokens. Il commence par <code>sbp_</code>.
      </p>
      <label className="field"><span>Jeton d’accès personnel</span><input className="input" type="password" autoComplete="off" required pattern="sbp_.+" value={value} onChange={(e) => setValue(e.target.value)} placeholder="sbp_…" /></label>
      <small className="muted">Gardé seulement dans cet onglet ; il n’est enregistré nulle part ailleurs.</small>
      {error && <div className="alert">{error}</div>}
      <div className="actions"><button className="btn primary" disabled={busy}>{busy ? <span className="spinner sm" /> : "Se connecter au projet"}</button></div>
    </form>
  )
}

function Project({ token }: { token: string }) {
  const refresh = useRefresh()
  const q = useLoad(() => mgmt<{ name: string; region: string; status: string; created_at: string; database?: { version: string; host: string } }>(token, ""), [token, refresh])
  return (
    <div className="card">
      <div className="card-head"><Icon name="cloud" size={16} /><h3 className="grow">Projet</h3></div>
      <Loaded q={q}>
        {(p) => (
          <dl className="kv">
            <dt>Nom</dt><dd>{p.name} <code className="muted">{PROJECT_REF}</code></dd>
            <dt>État</dt><dd><Tag tone={p.status === "ACTIVE_HEALTHY" ? "ok" : "warn"}>{p.status === "ACTIVE_HEALTHY" ? "En ligne" : p.status}</Tag></dd>
            <dt>Région</dt><dd>{p.region}</dd>
            <dt>PostgreSQL</dt><dd>{p.database?.version || "—"}</dd>
            <dt>Créé le</dt><dd>{fmtDateTime(p.created_at)}</dd>
          </dl>
        )}
      </Loaded>
    </div>
  )
}

type Check = { label: string; ok: boolean | null; detail: ReactNode }

function Checks({ token }: { token: string }) {
  const refresh = useRefresh()
  const [tick, setTick] = useState(0)
  const q = useLoad(async () => {
    const [auth, fns, [d]] = await Promise.all([
      mgmt<AuthConfig>(token, "/config/auth"),
      mgmt<Fn[]>(token, "/functions"),
      sql<{ realtime: string[]; no_rls: string[]; extensions: string[]; buckets: { id: string; public: boolean }[] }>(token, `select
        (select coalesce(json_agg(tablename order by tablename), '[]') from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public') as realtime,
        (select coalesce(json_agg(c.relname order by c.relname), '[]') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) as no_rls,
        (select coalesce(json_agg(extname order by extname), '[]') from pg_extension) as extensions,
        (select coalesce(json_agg(json_build_object('id', id, 'public', public)), '[]') from storage.buckets) as buckets`),
    ])
    const jobs = d.extensions.includes("pg_cron") ? await sql<{ command: string; active: boolean }>(token, "select command, active from cron.job") : null
    const missingRt = setup.realtimeTables.filter((t) => !d.realtime.includes(t))
    const allow = auth.uri_allow_list ? auth.uri_allow_list.split(",").map((s) => s.trim()) : []
    const missingUrls = recommendedRedirects().filter((u) => !allow.includes(u))
    const missingFns = setup.functions.filter((f) => !fns.some((x) => x.slug === f && x.status === "ACTIVE"))
    const missingBuckets = setup.buckets.filter((b) => !d.buckets.some((x) => x.id === b.id))
    const missingCron = jobs ? setup.cronFunctions.filter((f) => !jobs.some((j) => j.active && j.command.includes(f))) : setup.cronFunctions
    const checks: Check[] = [
      { label: "Adresse du site", ok: !/localhost|127\.0\.0\.1/.test(auth.site_url), detail: <>Actuelle : <code>{auth.site_url}</code>. Les liens des e-mails (confirmation, mot de passe) y renvoient par défaut ; NEXORA attend <code>{setup.siteUrl}</code>.</> },
      { label: "Adresses de redirection", ok: !missingUrls.length, detail: missingUrls.length ? <>Manquantes : {missingUrls.map((u) => <code key={u} style={{ marginRight: 6 }}>{u}</code>)}</> : "NEXORA web, le back office et le développement local sont autorisés." },
      { label: "Temps réel", ok: !missingRt.length, detail: missingRt.length ? <>Tables non publiées : {missingRt.join(", ")}. Migration « temps réel » ci-dessous.</> : `${setup.realtimeTables.length} tables publiées.` },
      { label: "Tâches planifiées", ok: !missingCron.length, detail: missingCron.length ? <>{jobs ? "" : "pg_cron n’est pas activé. "}Sans tâche : {missingCron.join(", ")}. Migration « planification » ci-dessous.</> : "Supervision et nettoyage planifiés." },
      { label: "Sécurité des tables (RLS)", ok: !d.no_rls.length, detail: d.no_rls.length ? <>Sans RLS : {d.no_rls.join(", ")}.</> : "Toutes les tables publiques ont la RLS." },
      { label: "Fonctions Edge", ok: !missingFns.length, detail: missingFns.length ? <>Absentes ou inactives : {missingFns.join(", ")}.</> : `${setup.functions.length} fonctions actives.` },
      { label: "Stockage", ok: !missingBuckets.length, detail: missingBuckets.length ? <>Compartiments manquants : {missingBuckets.map((b) => b.id).join(", ")}.</> : `${setup.buckets.length} compartiments présents.` },
      { label: "E-mails", ok: auth.smtp_host ? !lowMailRate(auth) && !smtpStale(auth) : null, detail: auth.smtp_host ? <>SMTP : <code>{auth.smtp_host}</code>{auth.smtp_host === setup.email.smtpHost ? " (Brevo)" : ""}, {Number(auth.rate_limit_email_sent ?? 0)} e-mails de compte par heure au plus.{smtpStale(auth) ? <> Ancien compte Brevo (identifiant <code>{auth.smtp_user || "?"}</code>, expéditeur {auth.smtp_admin_email}) : NEXORA attend <code>{setup.email.smtpUser}</code> et {setup.email.senderEmail} (carte « E-mails (Brevo) »).</> : null}{lowMailRate(auth) ? <> Limite trop basse : au-delà, les inscriptions et les mots de passe oubliés ne reçoivent plus d’e-mail. « Appliquer la configuration recommandée » la passe à {AUTH_MAIL_RATE}.</> : null}</> : "Serveur d’envoi de Supabase (quelques e-mails par heure) : configure Brevo dans la carte « E-mails (Brevo) » ci-dessous." },
    ]
    return checks
  }, [token, refresh, tick])
  return (
    <div className="card">
      <div className="card-head"><Icon name="pass" size={16} /><h3 className="grow">Vérification de la configuration</h3><button className="btn sm" onClick={() => setTick((n) => n + 1)}>Revérifier</button></div>
      <Loaded q={q}>
        {(checks) => (
          <div className="list">
            {checks.map((c) => (
              <div key={c.label} style={{ alignItems: "flex-start" }}>
                <Icon name={c.ok ? "pass" : c.ok === null ? "info" : "warn"} size={16} className="" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <b>{c.label}</b>
                  <div className="muted small">{c.detail}</div>
                </div>
                <Tag tone={c.ok ? "ok" : c.ok === null ? "" : "warn"}>{c.ok ? "OK" : c.ok === null ? "À noter" : "À corriger"}</Tag>
              </div>
            ))}
          </div>
        )}
      </Loaded>
    </div>
  )
}

function AuthSettings({ token }: { token: string }) {
  const refresh = useRefresh()
  const ui = useUi()
  const act = useAction()
  const [tick, setTick] = useState(0)
  const q = useLoad(() => mgmt<AuthConfig>(token, "/config/auth"), [token, refresh, tick])
  const [draft, setDraft] = useState<Partial<AuthConfig>>({})
  const [newUrl, setNewUrl] = useState("")

  const [outcome, setOutcome] = useState<Outcome>(null)

  // Envoi, puis relecture de la configuration : la confirmation n'apparaît que si Supabase a bien gardé les valeurs.
  async function save(patch: Partial<AuthConfig>, ok = "Configuration de l’authentification enregistrée.") {
    setOutcome(null)
    const done = await act.run(async () => {
      try {
        await mgmt(token, "/config/auth", { method: "PATCH", body: JSON.stringify(patch) })
        const fresh = await mgmt<AuthConfig>(token, "/config/auth")
        const list = (v: unknown) => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean).sort().join(",")
        const wrong = (Object.keys(patch) as (keyof AuthConfig)[]).filter((k) =>
          k === "uri_allow_list" ? list(fresh[k]) !== list(patch[k]) : String(fresh[k]) !== String(patch[k]))
        if (wrong.length) throw new Error(`Supabase a répondu, mais ces réglages n’ont pas la valeur envoyée : ${wrong.join(", ")}.`)
        const n = list(fresh.uri_allow_list).split(",").filter(Boolean).length
        setOutcome({ ok: true, text: `${ok} Vérifié sur Supabase : adresse du site ${fresh.site_url}, ${n} adresse${n > 1 ? "s" : ""} de redirection.`, at: Date.now() })
      } catch (e) {
        setOutcome({ ok: false, text: `Échec de l’enregistrement : ${errMsg(e)}`, at: Date.now() })
        throw e
      }
    }, ok)
    if (done) {
      setDraft({})
      setTick((n) => n + 1)
    }
  }

  return (
    <div className="card">
      <div className="card-head"><Icon name="lock" size={16} /><h3 className="grow">Authentification</h3></div>
      <OutcomeBanner outcome={outcome} onClose={() => setOutcome(null)} />
      <Loaded q={q}>
        {(a) => {
          const cur = { ...a, ...draft }
          const urls = cur.uri_allow_list ? cur.uri_allow_list.split(",").map((s) => s.trim()).filter(Boolean) : []
          const setUrls = (list: string[]) => setDraft({ ...draft, uri_allow_list: [...new Set(list)].join(",") })
          const recommended = recommendedRedirects()
          const linksOff = recommended.some((u) => !urls.includes(u)) || /localhost|127\.0\.0\.1/.test(cur.site_url)
          const rateOff = lowMailRate(a)
          const needs = linksOff || rateOff
          return (
            <div className="form">
              {needs && (
                <div className="banner">
                  <Icon name="warn" size={16} />
                  <span className="grow">{[linksOff && "Les liens envoyés par e-mail (confirmation d’inscription, mot de passe oublié) ne mènent pas encore à NEXORA ni au back office.", rateOff && `Les e-mails des comptes (confirmation d’inscription, mot de passe oublié) sont limités à ${Number(a.rate_limit_email_sent ?? 0)} par heure : au-delà, ils ne partent plus.`].filter(Boolean).join(" ")}</span>
                  <button className="btn sm primary" disabled={act.busy} onClick={async () => {
                    if (!(await ui.confirm({ title: "Appliquer la configuration recommandée ?", body: <>Adresse du site : {setup.siteUrl}. Redirections ajoutées : {recommended.filter((u) => !urls.includes(u)).join(", ") || "aucune"}.{rateOff ? <> E-mails des comptes : {AUTH_MAIL_RATE} par heure au plus (au lieu de {Number(a.rate_limit_email_sent ?? 0)}).</> : null}</>, confirm: "Appliquer" }))) return
                    save({ site_url: /localhost|127\.0\.0\.1/.test(a.site_url) ? setup.siteUrl : a.site_url, uri_allow_list: [...new Set([...urls, ...recommended])].join(","), ...(rateOff ? { rate_limit_email_sent: AUTH_MAIL_RATE } : {}) }, "Configuration recommandée appliquée.")
                  }}>Appliquer la configuration recommandée</button>
                </div>
              )}
              <label className="field"><span>Adresse du site</span><input className="input" value={cur.site_url} onChange={(e) => setDraft({ ...draft, site_url: e.target.value })} /><small>Page ouverte par défaut par les liens des e-mails. NEXORA pour Windows utilise {NEXORA_WEB_URL}.</small></label>
              <div className="field">
                <span>Adresses de redirection autorisées</span>
                <div className="list">
                  {urls.map((u) => (
                    <div key={u}>
                      <code className="grow ellipsis">{u}</code>
                      {recommended.includes(u) && <Tag tone="info">recommandée</Tag>}
                      <button className="icon-btn danger" title="Retirer" onClick={() => setUrls(urls.filter((x) => x !== u))}><Icon name="close" size={12} /></button>
                    </div>
                  ))}
                </div>
                <div className="row">
                  <input className="input grow" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://exemple.com/**" />
                  <button className="btn" disabled={!/^https?:\/\//.test(newUrl)} onClick={() => { setUrls([...urls, newUrl.trim()]); setNewUrl("") }}>Ajouter</button>
                </div>
              </div>
              <div className="grid2">
                <label className="row"><Switch checked={!cur.disable_signup} onChange={(v) => setDraft({ ...draft, disable_signup: !v })} label="Inscriptions" /><span>Inscriptions autorisées (niveau Supabase)</span></label>
                <label className="row"><Switch checked={cur.mailer_autoconfirm} onChange={(v) => setDraft({ ...draft, mailer_autoconfirm: v })} label="Confirmation automatique" /><span>Comptes confirmés sans e-mail</span></label>
                <label className="row"><Switch checked={cur.external_email_enabled} onChange={(v) => setDraft({ ...draft, external_email_enabled: v })} label="Connexion par e-mail" /><span>Connexion par e-mail et mot de passe</span></label>
                <label className="field"><span>Longueur minimale du mot de passe</span><input className="input" type="number" min={6} max={72} value={cur.password_min_length} onChange={(e) => setDraft({ ...draft, password_min_length: Number(e.target.value) })} /></label>
              </div>
              <div className="actions">
                {Object.keys(draft).length > 0 && <button className="btn" onClick={() => setDraft({})}>Annuler</button>}
                <button className="btn primary" disabled={act.busy || !Object.keys(draft).length} onClick={() => save(draft)}>Enregistrer</button>
              </div>
            </div>
          )
        }}
      </Loaded>
    </div>
  )
}

function Functions({ token }: { token: string }) {
  const refresh = useRefresh()
  const q = useLoad(() => mgmt<Fn[]>(token, "/functions"), [token, refresh])
  return (
    <div className="card">
      <div className="card-head"><Icon name="code" size={16} /><h3>Fonctions Edge</h3></div>
      <Loaded q={q}>
        {(fns) => fns.length ? (
          <div className="list">
            {fns.map((f) => (
              <div key={f.slug}>
                <span className={`dot ${f.status === "ACTIVE" ? "ok" : "bad"}`} />
                <code className="grow">{f.slug}</code>
                <small className="muted">v{f.version}</small>
                {f.verify_jwt && <Tag>JWT</Tag>}
                <small className="muted nowrap">{fmtDateTime(new Date(f.updated_at).toISOString())}</small>
              </div>
            ))}
          </div>
        ) : <Empty>Aucune fonction déployée.</Empty>}
      </Loaded>
    </div>
  )
}

/* ---------------------------------------------------------------- E-mails (Brevo, NEXORA #029) */

const EMAIL = setup.email
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
const sqlText = (v: string) => `'${v.replace(/'/g, "''")}'`
type AlertState = { installed: boolean; app: boolean; has_key: boolean; cfg: { enabled?: boolean; sender_email?: string; sender_name?: string } | null }

// E-mails des comptes par le relais SMTP de Brevo, et alertes de supervision par l'API Brevo (clé dans le coffre).
function EmailSettings({ token }: { token: string }) {
  const ui = useUi()
  const me = useMe()
  const myEmail = me?.session.user.email || me?.profile.email || ""
  const smtpAct = useAction()
  const alertAct = useAction()
  const [tick, setTick] = useState(0)
  const [smtpOutcome, setSmtpOutcome] = useState<Outcome>(null)
  const [alertOutcome, setAlertOutcome] = useState<Outcome>(null)
  const [form, setForm] = useState({ host: EMAIL.smtpHost, port: String(EMAIL.smtpPort), user: EMAIL.smtpUser, sender: EMAIL.senderEmail, name: EMAIL.senderName })
  const [smtpKey, setSmtpKey] = useState("")
  const [apiKey, setApiKey] = useState("")
  const auth = useLoad(() => mgmt<AuthConfig>(token, "/config/auth"), [token, tick])
  const alerts = useLoad(async () => {
    const [r] = await sql<AlertState>(token, `select
      to_regprocedure('public.nx_brevo_send(text,text,text,text,text)') is not null as installed,
      to_regprocedure('public.nx_alert_email(text,text,text)') is not null as app,
      exists (select 1 from vault.secrets where name = 'brevo_api_key') as has_key,
      (select value from public.app_config where key = 'email_alerts') as cfg`)
    return r
  }, [token, tick])
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  const formOk = form.host.trim() && /^\d+$/.test(form.port) && form.user.trim() && isEmail(form.sender.trim()) && form.name.trim()

  async function saveSmtp() {
    if (!(await ui.confirm({ title: "Envoyer les e-mails des comptes par Brevo ?", body: <>Confirmation d’inscription, mot de passe oublié, liens de connexion et invitations partiront de <b>{form.name} &lt;{form.sender}&gt;</b> par {form.host}:{form.port}.</>, confirm: "Enregistrer" }))) return
    setSmtpOutcome(null)
    const patch = { smtp_host: form.host.trim(), smtp_port: form.port.trim(), smtp_user: form.user.trim(), smtp_pass: smtpKey.trim(), smtp_admin_email: form.sender.trim(), smtp_sender_name: form.name.trim() }
    await smtpAct.run(async () => {
      try {
        await mgmt(token, "/config/auth", { method: "PATCH", body: JSON.stringify(patch) })
        const fresh = await mgmt<AuthConfig>(token, "/config/auth")
        const wrong = (["smtp_host", "smtp_port", "smtp_user", "smtp_admin_email", "smtp_sender_name"] as const).filter((k) => String(fresh[k] ?? "") !== String(patch[k]))
        if (wrong.length) throw new Error(`Supabase a répondu, mais ces réglages n’ont pas la valeur envoyée : ${wrong.join(", ")}.`)
        // Supabase garde 2 e-mails de compte par heure tant que la limite n'est pas relevée (#039) ; envoi séparé, une fois le SMTP actif.
        let rate = Number(fresh.rate_limit_email_sent ?? 0)
        if (lowMailRate(fresh)) {
          await mgmt(token, "/config/auth", { method: "PATCH", body: JSON.stringify({ rate_limit_email_sent: AUTH_MAIL_RATE }) })
          const after = await mgmt<AuthConfig>(token, "/config/auth")
          rate = Number(after.rate_limit_email_sent ?? 0)
          if (lowMailRate(after)) throw new Error(`SMTP enregistré, mais la limite des e-mails des comptes reste à ${rate} par heure.`)
        }
        setSmtpKey("")
        setSmtpOutcome({ ok: true, text: `SMTP Brevo enregistré et vérifié sur Supabase : ${fresh.smtp_host}:${fresh.smtp_port}, expéditeur ${fresh.smtp_sender_name} <${fresh.smtp_admin_email}>, ${rate} e-mails de compte par heure au plus. Envoie-toi un e-mail de test pour vérifier la clé SMTP.`, at: Date.now() })
        setTick((n) => n + 1)
      } catch (e) {
        setSmtpOutcome({ ok: false, text: `Échec de l’enregistrement du SMTP : ${errMsg(e)}`, at: Date.now() })
        throw e
      }
    }, "SMTP Brevo enregistré.")
  }

  async function testSmtp() {
    setSmtpOutcome(null)
    await smtpAct.run(async () => {
      const { error } = await sb.auth.resetPasswordForEmail(myEmail, { redirectTo: adminUrl() })
      if (error) {
        setSmtpOutcome({ ok: false, text: `Supabase n’a pas pu envoyer l’e-mail de test : ${error.message}. Vérifie la clé SMTP (xsmtpsib-…) et que l’expéditeur est validé dans Brevo.`, at: Date.now() })
        throw error
      }
      setSmtpOutcome({ ok: true, text: `E-mail de test envoyé par Brevo à ${myEmail} (lien « mot de passe oublié », tu peux l’ignorer). S’il n’arrive pas d’ici quelques minutes, regarde les indésirables, puis Brevo → Statistiques → E-mails transactionnels.`, at: Date.now() })
    }, "E-mail de test envoyé.")
  }

  async function saveApiKey() {
    setAlertOutcome(null)
    await alertAct.run(async () => {
      try {
        await sql(token, `select public.nx_brevo_set_key(${sqlText(apiKey.trim())})`)
        // L'expéditeur est gardé en même temps : les alertes de l'application Windows en ont besoin (#030).
        if (isEmail(form.sender.trim()) && form.name.trim())
          await sql(token, `update public.app_config set value = value || jsonb_build_object('sender_email', ${sqlText(form.sender.trim())}, 'sender_name', ${sqlText(form.name.trim())}), updated_at = now() where key = 'email_alerts'`)
        setApiKey("")
        setAlertOutcome({ ok: true, text: `Clé API Brevo enregistrée dans le coffre chiffré de Supabase (Vault), expéditeur ${form.name.trim()} <${form.sender.trim()}>. La clé n’est ni affichée ni gardée dans le navigateur.`, at: Date.now() })
        setTick((n) => n + 1)
      } catch (e) {
        setAlertOutcome({ ok: false, text: `Échec de l’enregistrement de la clé : ${errMsg(e)}`, at: Date.now() })
        throw e
      }
    }, "Clé API enregistrée.")
  }

  async function saveAlerts(enabled: boolean) {
    setAlertOutcome(null)
    await alertAct.run(async () => {
      try {
        const [r] = await sql<{ value: AlertState["cfg"] }>(token, `update public.app_config set value = jsonb_build_object('enabled', ${enabled}, 'sender_email', ${sqlText(form.sender.trim())}, 'sender_name', ${sqlText(form.name.trim())}), updated_at = now() where key = 'email_alerts' returning value`)
        if (!r || Boolean(r.value?.enabled) !== enabled) throw new Error("Supabase n’a pas gardé le réglage : applique d’abord la migration des alertes.")
        setAlertOutcome({ ok: true, text: enabled ? `Alertes par e-mail activées : chaque panne, lenteur ou retour en ligne part de ${form.name} <${form.sender}> vers les membres concernés.` : "Alertes par e-mail désactivées : les notifications restent dans NEXORA.", at: Date.now() })
        setTick((n) => n + 1)
      } catch (e) {
        setAlertOutcome({ ok: false, text: `Échec : ${errMsg(e)}`, at: Date.now() })
        throw e
      }
    }, enabled ? "Alertes par e-mail activées." : "Alertes par e-mail désactivées.")
  }

  // Le résultat de Brevo arrive dans net._http_response quelques secondes après l'envoi.
  async function testAlert() {
    setAlertOutcome(null)
    await alertAct.run(async () => {
      try {
        const [r] = await sql<{ id: number | null }>(token, `select public.nx_brevo_test(${sqlText(myEmail)}) as id`)
        if (!r?.id) throw new Error("rien n’est parti : enregistre la clé API et l’expéditeur.")
        let res: { status_code: number | null; error_msg: string | null; content: string | null } | undefined
        for (let i = 0; i < 8 && !res; i++) {
          await new Promise((ok) => setTimeout(ok, 1500))
          ;[res] = await sql<NonNullable<typeof res>>(token, `select status_code, error_msg, left(content::text, 400) as content from net._http_response where id = ${Number(r.id)}`)
        }
        if (!res) throw new Error("Brevo n’a pas encore répondu. Réessaie dans un instant.")
        if (res.status_code && res.status_code < 300) {
          setAlertOutcome({ ok: true, text: `Brevo a accepté l’alerte de test (HTTP ${res.status_code}) pour ${myEmail}.`, at: Date.now() })
          return
        }
        let detail = res.error_msg || res.content || ""
        try { detail = (JSON.parse(res.content || "") as { message?: string }).message || detail } catch { /* texte brut */ }
        throw new Error(res.status_code === 401 ? "Brevo refuse la clé API (401) : vérifie-la ou crée-en une nouvelle." : `Brevo a refusé l’e-mail (HTTP ${res.status_code ?? "?"}) : ${detail}`)
      } catch (e) {
        setAlertOutcome({ ok: false, text: `Échec de l’alerte de test : ${errMsg(e)}`, at: Date.now() })
        throw e
      }
    }, "Alerte de test acceptée par Brevo.")
  }

  return (
    <div className="card form">
      <div className="card-head"><Icon name="mail" size={16} /><h3 className="grow">E-mails (Brevo)</h3></div>

      <h4 className="email-sub">E-mails des comptes (SMTP)</h4>
      <OutcomeBanner outcome={smtpOutcome} onClose={() => setSmtpOutcome(null)} />
      <Loaded q={auth}>
        {(a) => (
          <p className="muted small" style={{ margin: 0 }}>
            {a.smtp_host === EMAIL.smtpHost && !smtpStale(a) ? <><Tag tone="ok">Brevo actif</Tag> Expéditeur {a.smtp_sender_name} &lt;{a.smtp_admin_email}&gt;.</>
              : a.smtp_host === EMAIL.smtpHost ? <><Tag tone="warn">ancien compte Brevo</Tag> Identifiant <code>{a.smtp_user || "?"}</code>, expéditeur &lt;{a.smtp_admin_email}&gt; : NEXORA attend <code>{EMAIL.smtpUser}</code> et &lt;{EMAIL.senderEmail}&gt;. Colle la clé SMTP de ce compte ci-dessous, puis « Enregistrer le SMTP Brevo ».</>
              : a.smtp_host ? <><Tag tone="warn">autre SMTP</Tag> {a.smtp_host}</>
              : <><Tag tone="warn">serveur de Supabase</Tag> quelques e-mails par heure seulement.</>}
          </p>
        )}
      </Loaded>
      <div className="grid2">
        <label className="field"><span>Serveur SMTP</span><input className="input" value={form.host} onChange={set("host")} /></label>
        <label className="field"><span>Port</span><input className="input" value={form.port} onChange={set("port")} inputMode="numeric" /></label>
        <label className="field"><span>Identifiant SMTP</span><input className="input" value={form.user} onChange={set("user")} /></label>
        <label className="field"><span>Clé SMTP Brevo</span><input className="input" type="password" autoComplete="off" value={smtpKey} onChange={(e) => setSmtpKey(e.target.value)} placeholder="xsmtpsib-…" /><small>Brevo → SMTP &amp; API → SMTP → « Générer une nouvelle clé SMTP ». Envoyée à Supabase, jamais gardée ici.</small></label>
        <label className="field"><span>Adresse de l’expéditeur</span><input className="input" value={form.sender} onChange={set("sender")} /><small>Doit être validée dans Brevo (Expéditeurs).</small></label>
        <label className="field"><span>Nom de l’expéditeur</span><input className="input" value={form.name} onChange={set("name")} /></label>
      </div>
      <div className="actions">
        <button className="btn" disabled={smtpAct.busy || !myEmail || auth.data?.smtp_host !== EMAIL.smtpHost} onClick={testSmtp} title={myEmail ? `Envoie un e-mail à ${myEmail}` : ""}>M’envoyer un e-mail de test</button>
        <button className="btn primary" disabled={smtpAct.busy || !formOk || !/^xsmtpsib-[\w-]{10,}$/.test(smtpKey.trim())} onClick={saveSmtp}>{smtpAct.busy ? <span className="spinner sm" /> : "Enregistrer le SMTP Brevo"}</button>
      </div>

      <h4 className="email-sub">Alertes de supervision par e-mail (API)</h4>
      <p className="muted small" style={{ margin: 0 }}>Une seule clé pour deux usages : les alertes de la supervision 24 h/24 des serveurs (membres de l’équipe) et celles de l’application Windows (Sécurité → Supervision &amp; alertes), envoyées à l’adresse du compte de chaque utilisateur. Telegram et WhatsApp ne sont plus proposés.</p>
      <OutcomeBanner outcome={alertOutcome} onClose={() => setAlertOutcome(null)} />
      <Loaded q={alerts}>
        {(st) => !st.installed ? (
          <div className="banner"><Icon name="warn" size={16} /><span className="grow">Applique d’abord la migration <code>20261104000004_alertes_email_brevo.sql</code> (carte « Migrations du dépôt »).</span></div>
        ) : (
          <>
            {!st.app && <div className="banner"><Icon name="warn" size={16} /><span className="grow">Pour les alertes de l’application Windows, applique aussi la migration <code>20261104000005_alertes_email_application.sql</code>.</span></div>}
            <p className="muted small" style={{ margin: 0 }}>
              {st.has_key ? <Tag tone="ok">clé API dans le coffre</Tag> : <Tag tone="warn">clé API manquante</Tag>}{" "}
              {st.app ? <Tag tone="ok">application Windows prête</Tag> : <Tag tone="warn">application Windows : migration manquante</Tag>}{" "}
              {st.cfg?.enabled ? <Tag tone="ok">serveurs : alertes activées</Tag> : <Tag>serveurs : alertes désactivées</Tag>}{" "}
              {st.cfg?.sender_email ? <>Expéditeur {st.cfg.sender_name} &lt;{st.cfg.sender_email}&gt;.</> : "Expéditeur à enregistrer."}
            </p>
            <div className="row">
              <input className="input grow" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={st.has_key ? "Remplacer la clé API (xkeysib-…)" : "Clé API Brevo (xkeysib-…)"} />
              <button className="btn" disabled={alertAct.busy || !/^xkeysib-[A-Za-z0-9-]{20,}$/.test(apiKey.trim())} onClick={saveApiKey}>Enregistrer dans le coffre</button>
            </div>
            <div className="actions">
              <button className="btn" disabled={alertAct.busy || !st.has_key || !st.cfg?.sender_email || !myEmail} onClick={testAlert}>M’envoyer une alerte de test</button>
              {st.cfg?.enabled
                ? <button className="btn" disabled={alertAct.busy} onClick={() => saveAlerts(false)}>Désactiver les alertes des serveurs</button>
                : <button className="btn primary" disabled={alertAct.busy || !st.has_key || !isEmail(form.sender.trim()) || !form.name.trim()} onClick={() => saveAlerts(true)}>{alertAct.busy ? <span className="spinner sm" /> : "Activer les alertes des serveurs"}</button>}
            </div>
          </>
        )}
      </Loaded>
    </div>
  )
}

type MigrationState = { state: "run" | "ok" | "bad"; at: number; msg?: string }

function Migrations({ token }: { token: string }) {
  const ui = useUi()
  const act = useAction()
  const [status, setStatus] = useState<Record<string, MigrationState>>({})
  const [outcome, setOutcome] = useState<Outcome>(null)
  const files = Object.entries(MIGRATIONS).map(([path, text]) => ({ name: path.split("/").pop()!, text, desc: (text.split("\n")[0] || "").replace(/^--\s*/, "") })).sort((a, b) => a.name.localeCompare(b.name))
  const mark = (name: string, st: MigrationState) => setStatus((s) => ({ ...s, [name]: st }))

  // Applique dans l'ordre et s'arrête à la première erreur ; chaque fichier garde son état (NEXORA #027).
  async function apply(list: typeof files) {
    setOutcome(null)
    await act.run(async () => {
      for (const f of list) {
        mark(f.name, { state: "run", at: Date.now() })
        try {
          await sql(token, f.text)
        } catch (e) {
          const msg = errMsg(e)
          mark(f.name, { state: "bad", at: Date.now(), msg })
          const rest = list.length - list.indexOf(f) - 1
          setOutcome({ ok: false, text: `Échec de ${f.name} : ${msg}${/[.!?]$/.test(msg) ? "" : "."}${rest > 1 ? ` Les ${rest} migrations suivantes n’ont pas été lancées.` : rest === 1 ? " La migration suivante n’a pas été lancée." : ""}`, at: Date.now() })
          throw new Error(`${f.name} : ${msg}`)
        }
        mark(f.name, { state: "ok", at: Date.now() })
      }
      setOutcome({ ok: true, text: list.length > 1 ? `Les ${list.length} migrations ont été appliquées sur Supabase.` : `${list[0].name} a été appliquée sur Supabase.`, at: Date.now() })
    }, list.length > 1 ? "Toutes les migrations sont appliquées." : "Migration appliquée.")
  }

  return (
    <div className="card">
      <div className="card-head"><Icon name="layers" size={16} /><h3 className="grow">Migrations du dépôt</h3>
        <button className="btn sm primary" disabled={act.busy || !files.length} onClick={async () => {
          if (!(await ui.confirm({ title: "Appliquer toutes les migrations ?", body: <>Dans l’ordre : {files.map((f) => f.name).join(", ")}. Chacune peut être appliquée plusieurs fois sans effet en double ; en cas d’erreur, les suivantes ne sont pas lancées.</>, confirm: "Tout appliquer" }))) return
          await apply(files)
        }}>{act.busy ? <span className="spinner sm" /> : "Tout appliquer"}</button>
      </div>
      <OutcomeBanner outcome={outcome} onClose={() => setOutcome(null)} />
      <p className="muted small" style={{ marginTop: 0 }}>Fichiers <code>supabase/migrations/</code>. Chacun peut être appliqué plusieurs fois sans effet en double.</p>
      <div className="list">
        {files.map((f) => {
          const st = status[f.name]
          return (
            <div key={f.name} style={{ alignItems: "flex-start" }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <code>{f.name}</code>
                <div className="muted small">{f.desc}</div>
                {st?.state === "bad" && <div className="small migration-error">{st.msg}</div>}
              </div>
              {st?.state === "run" && <Tag tone="info"><span className="spinner sm" /> en cours</Tag>}
              {st?.state === "ok" && <Tag tone="ok">appliquée à {clock(st.at)}</Tag>}
              {st?.state === "bad" && <Tag tone="bad">échec</Tag>}
              <button className="btn sm" disabled={act.busy} onClick={async () => {
                if (!(await ui.confirm({ title: `Appliquer ${f.name} ?`, body: f.desc, confirm: "Appliquer" }))) return
                await apply([f])
              }}>Appliquer</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SqlConsole({ token }: { token: string }) {
  const ui = useUi()
  const act = useAction()
  const [query, setQuery] = useState("select key, value from public.app_config order by key;")
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null)
  async function run() {
    const write = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(query)
    if (write && !(await ui.confirm({ title: "Exécuter une requête qui modifie la base ?", body: "Elle s’exécute avec tous les droits, sans les règles RLS.", confirm: "Exécuter", danger: true }))) return
    await act.run(async () => setRows(await sql(token, query)))
  }
  const cols = rows && rows.length ? Object.keys(rows[0]) : []
  return (
    <div className="card form">
      <div className="card-head"><Icon name="terminal" size={16} /><h3 className="grow">Console SQL</h3><small className="muted">Ctrl + Entrée pour exécuter</small></div>
      <textarea className="input code" rows={5} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run() } }} spellCheck={false} />
      <div className="actions"><button className="btn primary" disabled={act.busy || !query.trim()} onClick={run}>{act.busy ? <span className="spinner sm" /> : "Exécuter"}</button></div>
      {rows && (rows.length ? (
        <Table head={cols}>
          {rows.slice(0, 200).map((r, i) => (
            <tr key={i}>{cols.map((c) => <td key={c} className="small">{typeof r[c] === "object" && r[c] !== null ? <code>{JSON.stringify(r[c])}</code> : String(r[c] ?? "—")}</td>)}</tr>
          ))}
        </Table>
      ) : <p className="muted small">Requête exécutée : aucune ligne renvoyée.</p>)}
    </div>
  )
}
