// Configuration du projet Supabase depuis le navigateur, par l'API de gestion
// (https://api.supabase.com). Réservé aux super-administrateurs.
// Cette API n'accepte les appels de navigateur que depuis supabase.com : le back office passe donc par
// le relais de sa propre adresse, /__supabase-api (Worker Cloudflare et aperçu, worker/supabase-relay.js, #026).
// Le jeton d'accès personnel (sbp_…) est saisi ici et gardé seulement pour la session de l'onglet
// (sessionStorage) : il n'est jamais écrit dans le code ; le relais le transmet à Supabase sans le garder.
import { useState, type FormEvent, type ReactNode } from "react"
import { useRefresh } from "../App"
import { Icon } from "../icons"
import { NEXORA_WEB_URL, PROJECT_REF } from "../supabase"
import { Empty, fmtDateTime, Loaded, Switch, Table, Tag, useAction, useLoad, useUi } from "../ui"
import setup from "../../../supabase/nexora.json"

const MIGRATIONS = import.meta.glob("../../../supabase/migrations/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>
const TOKEN_KEY = "nexora-admin-sbp"

type AuthConfig = {
  site_url: string
  uri_allow_list: string
  disable_signup: boolean
  mailer_autoconfirm: boolean
  password_min_length: number
  external_email_enabled: boolean
  smtp_host: string | null
  jwt_exp: number
}
type Fn = { slug: string; status: string; version: number; verify_jwt: boolean; updated_at: number }

/** Adresse du back office (sans le fragment), pour les liens de réinitialisation envoyés par e-mail. */
export const adminUrl = () => `${location.origin}${location.pathname}`
export const recommendedRedirects = () => [...new Set([...setup.redirectUrls, `${adminUrl()}**`])]

async function mgmt<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
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
        <span className="grow">Connecté au projet <code>{PROJECT_REF}</code> avec ton jeton d’accès (gardé jusqu’à la fermeture de l’onglet).</span>
        <button className="btn sm" onClick={() => { sessionStorage.removeItem(TOKEN_KEY); setToken("") }}>Oublier le jeton</button>
      </div>
      <Project token={token} />
      <Checks token={token} />
      <AuthSettings token={token} />
      <div className="cols">
        <Functions token={token} />
        <Migrations token={token} />
      </div>
      <SqlConsole token={token} />
    </>
  )
}

function TokenForm({ onToken }: { onToken: (t: string) => void }) {
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
      { label: "E-mails", ok: auth.smtp_host ? true : null, detail: auth.smtp_host ? <>SMTP : <code>{auth.smtp_host}</code></> : "Serveur d’envoi de Supabase (quelques e-mails par heure). Pour la production, configure un SMTP dans Supabase → Authentication → Emails." },
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

  async function save(patch: Partial<AuthConfig>, ok = "Configuration de l’authentification enregistrée.") {
    if (await act.run(() => mgmt(token, "/config/auth", { method: "PATCH", body: JSON.stringify(patch) }), ok)) {
      setDraft({})
      setTick((n) => n + 1)
    }
  }

  return (
    <div className="card">
      <div className="card-head"><Icon name="lock" size={16} /><h3 className="grow">Authentification</h3></div>
      <Loaded q={q}>
        {(a) => {
          const cur = { ...a, ...draft }
          const urls = cur.uri_allow_list ? cur.uri_allow_list.split(",").map((s) => s.trim()).filter(Boolean) : []
          const setUrls = (list: string[]) => setDraft({ ...draft, uri_allow_list: [...new Set(list)].join(",") })
          const recommended = recommendedRedirects()
          const needs = recommended.some((u) => !urls.includes(u)) || /localhost|127\.0\.0\.1/.test(cur.site_url)
          return (
            <div className="form">
              {needs && (
                <div className="banner">
                  <Icon name="warn" size={16} />
                  <span className="grow">Les liens envoyés par e-mail (confirmation d’inscription, mot de passe oublié) ne mènent pas encore à NEXORA ni au back office.</span>
                  <button className="btn sm primary" disabled={act.busy} onClick={async () => {
                    if (!(await ui.confirm({ title: "Appliquer la configuration recommandée ?", body: <>Adresse du site : {setup.siteUrl}. Redirections ajoutées : {recommended.filter((u) => !urls.includes(u)).join(", ") || "aucune"}.</>, confirm: "Appliquer" }))) return
                    save({ site_url: /localhost|127\.0\.0\.1/.test(a.site_url) ? setup.siteUrl : a.site_url, uri_allow_list: [...new Set([...urls, ...recommended])].join(",") }, "Configuration recommandée appliquée.")
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

function Migrations({ token }: { token: string }) {
  const ui = useUi()
  const act = useAction()
  const [done, setDone] = useState<string[]>([])
  const files = Object.entries(MIGRATIONS).map(([path, text]) => ({ name: path.split("/").pop()!, text, desc: (text.split("\n")[0] || "").replace(/^--\s*/, "") })).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <div className="card">
      <div className="card-head"><Icon name="layers" size={16} /><h3 className="grow">Migrations du dépôt</h3>
        {/* NEXORA #025 : toutes les migrations d'un coup, dans l'ordre, arrêt à la première erreur. */}
        <button className="btn sm primary" disabled={act.busy || !files.length} onClick={async () => {
          if (!(await ui.confirm({ title: "Appliquer toutes les migrations ?", body: <>Dans l’ordre : {files.map((f) => f.name).join(", ")}. Chacune peut être appliquée plusieurs fois sans effet en double ; en cas d’erreur, les suivantes ne sont pas lancées.</>, confirm: "Tout appliquer" }))) return
          await act.run(async () => {
            for (const f of files) {
              try {
                await sql(token, f.text)
              } catch (e) {
                throw new Error(`${f.name} : ${e instanceof Error ? e.message : String(e)}`)
              }
              setDone((d) => (d.includes(f.name) ? d : [...d, f.name]))
            }
          }, "Toutes les migrations sont appliquées.")
        }}>Tout appliquer</button>
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>Fichiers <code>supabase/migrations/</code>. Chacun peut être appliqué plusieurs fois sans effet en double.</p>
      <div className="list">
        {files.map((f) => (
          <div key={f.name} style={{ alignItems: "flex-start" }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <code>{f.name}</code>
              <div className="muted small">{f.desc}</div>
            </div>
            {done.includes(f.name) && <Tag tone="ok">appliquée</Tag>}
            <button className="btn sm" disabled={act.busy} onClick={async () => {
              if (!(await ui.confirm({ title: `Appliquer ${f.name} ?`, body: f.desc, confirm: "Appliquer" }))) return
              if (await act.run(() => sql(token, f.text), "Migration appliquée.")) setDone((d) => [...d, f.name])
            }}>Appliquer</button>
          </div>
        ))}
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
