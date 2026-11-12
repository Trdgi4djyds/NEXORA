// E-mails de NEXORA (#031) : modèles aux couleurs de la marque (comptes, sécurité, supervision, mise à jour,
// facture) avec aperçu et envoi d'exemple, application chez Supabase et dans la base, annonce d'une mise à
// jour par e-mail et journal des envois Brevo.
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { go, useRefresh, type SectionProps } from "../App"
import { useMe } from "../auth"
import { Icon } from "../icons"
import { must, NEXORA_WEB_URL, sb, type Json, type Row } from "../supabase"
import { fmtDateTime, fmtNum, Loaded, Seg, Table, Tag, useAction, useLoad, useUi } from "../ui"
import setup from "../../../supabase/nexora.json"
import nexoraApp from "../../../nexora/app/package.json"
import { EmailFrame } from "../emails/frame"
import { hello, waitBrevo } from "../emails/send"
import { authPatch, dbTemplates, TEMPLATES, TEMPLATES_VERSION, updateEmail, type EmailTemplate } from "../emails/templates"
import { errMsg, mgmt, OutcomeBanner, TOKEN_KEY, TokenForm, type Outcome } from "./SupabaseSetup"

const GROUPS = ["Compte", "Sécurité", "Supervision", "Mises à jour", "Facturation"]
const AUTH_COUNT = TEMPLATES.filter((t) => t.target === "auth").length
/** Quota quotidien (offre gratuite de Brevo), moins la marge gardée pour les e-mails des comptes. */
const DAILY = 280
const KIND_LABEL: Record<string, string> = { alerte: "Alerte", test: "Test d’alerte", exemple: "Exemple", maj: "Mise à jour", facture: "Facture", admin: "Back office" }
const missing = (e: unknown) => /does not exist|schema cache|PGRST20[25]|42P01|42883/.test(errMsg(e))

export function Emails({ param }: SectionProps) {
  const tab = param === "maj" ? "maj" : param === "journal" ? "journal" : "modeles"
  return (
    <>
      <div className="toolbar">
        <Seg value={tab} options={[["modeles", "Modèles"], ["maj", "Annoncer une mise à jour"], ["journal", "Journal des envois"]]} onChange={(v) => go("emails", v === "modeles" ? undefined : v)} />
      </div>
      {tab === "modeles" && <Templates />}
      {tab === "maj" && <Announce />}
      {tab === "journal" && <Journal />}
    </>
  )
}

/* ---------------------------------------------------------------- Modèles */

type AuthState = Record<string, unknown>

function Templates() {
  const me = useMe()
  const ui = useUi()
  const act = useAction()
  const refresh = useRefresh()
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || "")
  const [askToken, setAskToken] = useState(false)
  const [tick, setTick] = useState(0)
  const [outcome, setOutcome] = useState<Outcome>(null)
  const [sel, setSel] = useState(TEMPLATES[0].id)
  const myEmail = me.session.user.email || me.profile.email || ""

  const status = useLoad(async () => {
    const since = new Date(Date.now() - 86400000).toISOString()
    const [cfg, sent] = await Promise.all([
      sb.from("app_config").select("value, updated_at").eq("key", "email_templates").maybeSingle(),
      sb.from("nx_email_log").select("id", { count: "exact", head: true }).gte("created_at", since),
    ])
    const auth = me.isSuper && token ? await mgmt<AuthState>(token, "/config/auth").catch(() => null) : null
    return {
      db: (cfg.data?.value as { version?: number } | null)?.version ?? 0,
      dbAt: cfg.data?.updated_at as string | undefined,
      sent: sent.error ? null : sent.count || 0,
      migration: !sent.error || !missing(sent.error),
      auth,
    }
  }, [refresh, tick, token])

  const wanted = useMemo(() => authPatch(), [])
  const applied = (auth: AuthState | null | undefined, t: EmailTemplate) =>
    auth ? String(auth[`mailer_templates_${t.authKey}_content`] ?? "") === wanted[`mailer_templates_${t.authKey}_content`] : null

  async function applyAll() {
    const withAuth = me.isSuper && Boolean(token)
    if (!(await ui.confirm({
      title: "Appliquer les modèles d’e-mails ?",
      body: withAuth
        ? <>Les {AUTH_COUNT} e-mails des comptes (inscription, connexion, mot de passe, sécurité…) seront remplacés chez Supabase, la limite passera à 30 e-mails par heure, et le modèle des alertes sera enregistré dans la base.</>
        : <>Le modèle des alertes de supervision sera enregistré dans la base. Les e-mails des comptes demandent le jeton d’accès d’un super-administrateur.</>,
      confirm: "Appliquer",
    }))) return
    setOutcome(null)
    await act.run(async () => {
      try {
        const done: string[] = []
        if (withAuth) {
          await mgmt(token, "/config/auth", { method: "PATCH", body: JSON.stringify(wanted) })
          const fresh = await mgmt<AuthState>(token, "/config/auth")
          const wrong = Object.keys(wanted).filter((k) => String(fresh[k]) !== String(wanted[k]))
          if (wrong.length) throw new Error(`Supabase a répondu, mais ces réglages n’ont pas la valeur envoyée : ${wrong.join(", ")}.`)
          done.push(`${AUTH_COUNT} e-mails des comptes vérifiés chez Supabase, limite de 30 e-mails par heure`)
        }
        const r = await sb.rpc("nx_email_templates_save", { p: dbTemplates() as unknown as Json })
        if (r.error) throw new Error(missing(r.error) ? "appliquez d’abord la migration 20261104000006_emails_factures.sql (Supabase → Migrations du dépôt)." : errMsg(r.error))
        done.push(`modèle des alertes enregistré dans la base (version ${TEMPLATES_VERSION})`)
        setOutcome({ ok: true, text: `Modèles appliqués : ${done.join(" ; ")}.`, at: Date.now() })
        setTick((n) => n + 1)
      } catch (e) {
        setOutcome({ ok: false, text: `Échec : ${errMsg(e)}`, at: Date.now() })
        throw e
      }
    }, "Modèles d’e-mails appliqués.")
  }

  const t = TEMPLATES.find((x) => x.id === sel) || TEMPLATES[0]
  return (
    <>
      <div className="card form">
        <div className="card-head">
          <Icon name="mail" size={16} />
          <h3 className="grow">E-mails aux couleurs de NEXORA</h3>
          <button className="btn primary" disabled={act.busy} onClick={applyAll}>{act.busy ? <span className="spinner sm" /> : <><Icon name="upload" size={14} /> Appliquer les modèles</>}</button>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Tous les e-mails partent par Brevo depuis {setup.email.senderName} &lt;{setup.email.senderEmail}&gt; : les e-mails des comptes par le SMTP de Supabase, les alertes, mises à jour et factures par l’API depuis la base.
        </p>
        <OutcomeBanner outcome={outcome} onClose={() => setOutcome(null)} />
        <Loaded q={status}>
          {(s) => (
            <>
              {!s.migration && <div className="banner"><Icon name="warn" size={16} /><span className="grow">Appliquez d’abord la migration <code>20261104000006_emails_factures.sql</code> (Supabase → Migrations du dépôt) : alertes aux couleurs de NEXORA, annonces, factures et journal.</span></div>}
              <div className="email-stats">
                <Stat icon="user" label="E-mails des comptes" value={s.auth ? `${TEMPLATES.filter((x) => applied(s.auth, x)).length} / ${AUTH_COUNT}` : "—"}
                  hint={s.auth ? (String(s.auth.smtp_host) === setup.email.smtpHost ? `Brevo · ${s.auth.rate_limit_email_sent} par heure` : "SMTP de Supabase") : me.isSuper ? "Connectez votre jeton pour vérifier" : "Réservé aux super-administrateurs"}
                  tone={s.auth ? (TEMPLATES.every((x) => x.target !== "auth" || applied(s.auth, x)) ? "good" : "warn") : ""} />
                <Stat icon="bell" label="Modèle des alertes" value={s.db >= TEMPLATES_VERSION ? "À jour" : s.db ? "Ancien" : "À enregistrer"}
                  hint={s.db ? `Version ${s.db}${s.dbAt ? ` · ${fmtDateTime(s.dbAt)}` : ""}` : "Version simple en attendant"} tone={s.db >= TEMPLATES_VERSION ? "good" : "warn"} />
                <Stat icon="sync" label="Envoyés depuis 24 h" value={s.sent == null ? "—" : `${fmtNum(s.sent)} / ${DAILY}`}
                  hint="Alertes, annonces, factures (Brevo gratuit : 300 par jour)" tone={s.sent != null && s.sent > DAILY * 0.8 ? "warn" : ""} />
              </div>
              {me.isSuper && !token && (
                askToken
                  ? <TokenForm onToken={(v) => { sessionStorage.setItem(TOKEN_KEY, v); setToken(v); setAskToken(false) }} />
                  : <div className="banner info"><Icon name="key" size={16} /><span className="grow">Pour appliquer les e-mails des comptes chez Supabase, connectez votre jeton d’accès personnel (gardé dans cet onglet seulement).</span><button className="btn sm" onClick={() => setAskToken(true)}>Connecter le jeton</button></div>
              )}
            </>
          )}
        </Loaded>
      </div>

      <div className="email-gallery">
        <nav className="card email-list" aria-label="Modèles d’e-mails">
          {GROUPS.map((g) => (
            <div key={g}>
              <div className="nav-group">{g}</div>
              {TEMPLATES.filter((x) => x.group === g).map((x) => {
                const ok = x.target === "auth" ? applied(status.data?.auth, x) : x.target === "db" ? (status.data ? status.data.db >= TEMPLATES_VERSION : null) : true
                return (
                  <button key={x.id} className={x.id === t.id ? "on" : ""} onClick={() => setSel(x.id)}>
                    <Icon name={x.icon} size={15} />
                    <span className="grow ellipsis">{x.label}</span>
                    {x.target === "auth" && x.notify === false ? <small className="muted">désactivé</small> : ok === false ? <span className="dot warn" title="À appliquer" /> : ok ? <span className="dot ok" title="À jour" /> : null}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
        <TemplatePreview key={t.id} t={t} myEmail={myEmail} myName={me.profile.full_name} />
      </div>
    </>
  )
}

function Stat({ icon, label, value, hint, tone = "" }: { icon: string; label: string; value: ReactNode; hint: ReactNode; tone?: string }) {
  return (
    <div className={`kpi ${tone}`}>
      <small><Icon name={icon} size={13} />{label}</small>
      <b>{value}</b>
      <span>{hint}</span>
    </div>
  )
}

function TemplatePreview({ t, myEmail, myName }: { t: EmailTemplate; myEmail: string; myName: string }) {
  const act = useAction()
  const [variant, setVariant] = useState(t.variants[0].id)
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")
  const [dark, setDark] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>(null)
  const r = useMemo(() => t.render((t.variants.find((v) => v.id === variant) || t.variants[0]).vars), [t, variant])
  const where = t.target === "auth" ? "Supabase Auth (SMTP Brevo)" : t.target === "db" ? "La base (API Brevo)" : "Le back office (API Brevo)"

  async function sendSample() {
    setOutcome(null)
    await act.run(async () => {
      try {
        const res = must(await sb.rpc("nx_email_send_admin", {
          p_to: myEmail, p_to_name: myName || "", p_subject: `[Exemple] ${r.subject}`, p_html: r.html, p_text: r.text || "", p_tag: "exemple",
        })) as { id: number }
        const b = await waitBrevo(res.id)
        if (!b.ok) throw new Error(b.text)
        setOutcome({ ok: true, text: `Exemple envoyé à ${myEmail}. ${b.text}${t.target === "auth" ? " Les liens de l’exemple ne mènent nulle part." : ""}`, at: Date.now() })
      } catch (e) {
        setOutcome({ ok: false, text: `Échec de l’envoi : ${missing(e) ? "appliquez d’abord la migration 20261104000006_emails_factures.sql." : errMsg(e)}`, at: Date.now() })
        throw e
      }
    }, "Exemple envoyé.")
  }

  return (
    <div className="card email-preview">
      <div className="email-meta">
        <div className="grow" style={{ minWidth: 0 }}>
          <h3>{t.label}</h3>
          <p className="muted small">{t.desc}</p>
        </div>
        <button className="btn" disabled={act.busy || !myEmail} onClick={sendSample} title={myEmail ? `Envoyez cet exemple à ${myEmail}` : ""}>
          {act.busy ? <span className="spinner sm" /> : <><Icon name="mail" size={14} /> M’envoyer un exemple</>}
        </button>
      </div>
      <dl className="email-headers">
        <dt>Objet</dt><dd><b>{r.subject}</b></dd>
        <dt>De</dt><dd>{setup.email.senderName} &lt;{setup.email.senderEmail}&gt;</dd>
        <dt>Envoyé par</dt><dd>{where}</dd>
        <dt>Quand</dt><dd>{t.when}</dd>
      </dl>
      <OutcomeBanner outcome={outcome} onClose={() => setOutcome(null)} />
      <div className="row wrap">
        {t.variants.length > 1 && <Seg value={variant} options={t.variants.map((v) => [v.id, v.label] as [string, string])} onChange={setVariant} />}
        <span className="grow" />
        <Seg value={device} options={[["desktop", "Ordinateur"], ["mobile", "Mobile"]]} onChange={setDevice} />
        <Seg value={dark ? "dark" : "light"} options={[["light", "Clair"], ["dark", "Sombre"]]} onChange={(v) => setDark(v === "dark")} />
      </div>
      <div className={`email-stage ${dark ? "dark" : ""}`}>
        <EmailFrame html={r.html} dark={dark} width={device === "mobile" ? 390 : 680} title={`Aperçu : ${t.label}`} />
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Annonce d'une mise à jour */

function Announce() {
  const me = useMe()
  const ui = useUi()
  const act = useAction()
  const [outcome, setOutcome] = useState<Outcome>(null)
  const [form, setForm] = useState({ version: nexoraApp.version, title: "", intro: "", highlights: "", url: "", audience: "me" })
  const [count, setCount] = useState<number | null>(null)
  const [dark, setDark] = useState(false)
  const ctx = useLoad(async () => {
    const [plans, cfg] = await Promise.all([
      sb.from("plans").select("id, name").order("sort"),
      sb.from("app_config").select("value").eq("key", "desktop_download_url").maybeSingle(),
    ])
    return { plans: (plans.data || []) as Pick<Row<"plans">, "id" | "name">[], download: typeof cfg.data?.value === "string" ? cfg.data.value : "" }
  }, [])
  const url = form.url.trim() || ctx.data?.download || NEXORA_WEB_URL
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  const data = { version: form.version.trim() || "?", title: form.title, intro: form.intro, highlights: form.highlights.split("\n"), url }
  const preview = useMemo(() => updateEmail({ ...data, greeting: hello(me.profile.full_name) }), [form, url, me.profile.full_name])
  const audiences: [string, string][] = [["me", "Moi seulement (essai)"], ["admins", "Administrateurs"], ["all", "Tout le monde"], ...(ctx.data?.plans || []).map((p) => [`plan:${p.id}`, `Offre ${p.name}`] as [string, string])]
  const audienceLabel = audiences.find((a) => a[0] === form.audience)?.[1] || form.audience

  // Nombre de destinataires, recalculé à chaque changement de public.
  useEffect(() => {
    let live = true
    setCount(null)
    sb.rpc("nx_email_broadcast", { p_audience: form.audience, p_subject: "", p_html: "", p_text: "", p_dry_run: true }).then(({ data, error }) => {
      // -1 : fonction absente (migration à appliquer) ou refus.
      if (live) setCount(error ? -1 : (data as { count?: number } | null)?.count ?? null)
    })
    return () => { live = false }
  }, [form.audience])

  async function send() {
    if (!(await ui.confirm({
      title: "Envoyer l’annonce ?",
      body: <>« {preview.subject} » partira par Brevo vers {count == null ? "le public choisi" : `${fmtNum(count)} personne${count > 1 ? "s" : ""}`} ({audienceLabel.toLowerCase()}). Chaque e-mail commence par « Bonjour » et le prénom.</>,
      confirm: "Envoyer",
    }))) return
    setOutcome(null)
    await act.run(async () => {
      try {
        const mail = updateEmail(data)
        const res = must(await sb.rpc("nx_email_broadcast", { p_audience: form.audience, p_subject: mail.subject, p_html: mail.html, p_text: mail.text || "", p_tag: "maj" })) as { count: number }
        setOutcome({ ok: true, text: `Annonce envoyée à ${fmtNum(res.count)} personne${res.count > 1 ? "s" : ""} par Brevo. La réponse de Brevo pour chaque e-mail se lit dans le journal des envois.`, at: Date.now() })
      } catch (e) {
        setOutcome({ ok: false, text: `Échec de l’envoi : ${missing(e) ? "appliquez d’abord la migration 20261104000006_emails_factures.sql." : errMsg(e)}`, at: Date.now() })
        throw e
      }
    }, "Annonce envoyée.")
  }

  return (
    <div className="email-compose">
      <div className="card form">
        <div className="card-head"><Icon name="download" size={16} /><h3 className="grow">Annoncer une nouvelle version</h3></div>
        <div className="grid2">
          <label className="field"><span>Version</span><input className="input" value={form.version} onChange={set("version")} placeholder="1.1.0" /></label>
          <label className="field"><span>Public</span>
            <select className="input" value={form.audience} onChange={set("audience")}>{audiences.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <small>{count == null ? "Calcul des destinataires…" : count < 0 ? "Indisponible : appliquez la migration 20261104000006_emails_factures.sql." : `${fmtNum(count)} destinataire${count > 1 ? "s" : ""}`}</small>
          </label>
        </div>
        <label className="field"><span>Titre</span><input className="input" value={form.title} onChange={set("title")} placeholder={`NEXORA ${form.version || "1.1.0"} est disponible`} /></label>
        <label className="field"><span>Introduction</span><textarea className="input" rows={3} value={form.intro} onChange={set("intro")} placeholder="Ce que cette version change, en une ou deux phrases." /></label>
        <label className="field"><span>Nouveautés (une par ligne)</span><textarea className="input" rows={5} value={form.highlights} onChange={set("highlights")} placeholder={"Alertes par e-mail aux couleurs de NEXORA\nFactures PDF envoyées par e-mail"} /></label>
        <label className="field"><span>Lien du bouton « Télécharger »</span><input className="input" value={form.url} onChange={set("url")} placeholder={ctx.data?.download || NEXORA_WEB_URL} />
          <small>Par défaut : le lien de téléchargement de la Configuration ({`desktop_download_url`}), sinon NEXORA en ligne.</small></label>
        <OutcomeBanner outcome={outcome} onClose={() => setOutcome(null)} />
        <div className="actions">
          <small className="muted grow">Quota : 280 e-mails par jour avec l’offre gratuite de Brevo. Commencez par « Moi seulement ».</small>
          <button className="btn primary" disabled={act.busy || !form.version.trim() || count === 0 || count === -1} onClick={send}>{act.busy ? <span className="spinner sm" /> : <><Icon name="mail" size={14} /> Envoyer</>}</button>
        </div>
      </div>
      <div className="card email-preview">
        <div className="email-meta">
          <div className="grow"><h3>Aperçu</h3><p className="muted small">Objet : <b>{preview.subject}</b></p></div>
          <Seg value={dark ? "dark" : "light"} options={[["light", "Clair"], ["dark", "Sombre"]]} onChange={(v) => setDark(v === "dark")} />
        </div>
        <div className={`email-stage ${dark ? "dark" : ""}`}><EmailFrame html={preview.html} dark={dark} width={640} title="Aperçu de l’annonce" /></div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Journal */

type LogRow = Row<"nx_email_log">

function Journal() {
  const refresh = useRefresh()
  const q = useLoad(async () => must(await sb.from("nx_email_log").select("*").order("created_at", { ascending: false }).limit(150)) as LogRow[], [refresh])
  const [res, setRes] = useState<Record<number, { ok: boolean; text: string } | "load">>({})
  async function check(id: number) {
    setRes((r) => ({ ...r, [id]: "load" }))
    const { data, error } = await sb.rpc("nx_email_result", { p_id: id })
    const v = data as { status: number | null; error: string | null } | null
    setRes((r) => ({ ...r, [id]: error ? { ok: false, text: errMsg(error) } : !v ? { ok: false, text: "Réponse expirée (gardée 6 h par Supabase)" } : v.status && v.status < 300 ? { ok: true, text: `Acceptée (HTTP ${v.status})` } : { ok: false, text: v.error || `Refusée (HTTP ${v.status ?? "?"})` } }))
  }
  if (q.error && missing(q.error))
    return <div className="banner"><Icon name="warn" size={16} /><span className="grow">Le journal des envois demande la migration <code>20261104000006_emails_factures.sql</code> (Supabase → Migrations du dépôt).</span></div>
  return (
    <Loaded q={q}>
      {(rows) => (
        <Table head={["Date", "Type", "Destinataire", "Réponse de Brevo"]} count={rows.length} empty="Aucun e-mail envoyé pour l’instant.">
          {rows.map((r) => {
            const v = r.request_id != null ? res[r.request_id] : undefined
            return (
              <tr key={r.id}>
                <td className="nowrap">{fmtDateTime(r.created_at)}</td>
                <td><Tag tone={r.kind === "alerte" ? "warn" : r.kind === "facture" ? "info" : ""}>{KIND_LABEL[r.kind] || r.kind}</Tag></td>
                <td className="ellipsis">{r.to_email || <span className="muted">adresse du compte</span>}</td>
                <td>
                  {r.request_id == null ? "—" : v === "load" ? <span className="spinner sm" /> : v ? <Tag tone={v.ok ? "ok" : "bad"}>{v.text}</Tag>
                    : <button className="btn sm" onClick={() => check(r.request_id as number)}>Vérifier</button>}
                </td>
              </tr>
            )
          })}
        </Table>
      )}
    </Loaded>
  )
}

