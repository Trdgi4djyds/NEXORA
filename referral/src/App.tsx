// NEXORA #090 : parcours d'accès des parrains. Le back office crée le parrain et lui transmet un lien d'invitation
// (#/invitation/<jeton>) et un code d'accès qui change chaque mois. Accès : lien de connexion reçu à l'adresse invitée
// (Supabase Auth), puis code (activation au premier passage, puis une fois par mois). Ensuite : l'espace (Portal).
import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import type { Session } from "@supabase/supabase-js"
import { Portal } from "./Portal"
import { errText, rpc, sb, type CodeResult, type Me } from "./supabase"
import { Brand, DEFAULT_RULES, fmtTime, Icon, lastDay, pct, Spinner } from "./ui"

const INVITE_KEY = "nexora-referral-invite"
const TOKEN_RE = /^[0-9a-f]{64}$/

/** Jeton d'invitation : celui de l'adresse (#/invitation/…), sinon celui gardé avant l'envoi du lien de connexion. */
function readInvite(): string {
  const m = /^#\/invitation\/([0-9a-f]{64})/.exec(location.hash)
  if (m) {
    try { localStorage.setItem(INVITE_KEY, JSON.stringify({ token: m[1], at: Date.now() })) } catch { /* stockage refusé */ }
    return m[1]
  }
  try {
    const saved = JSON.parse(localStorage.getItem(INVITE_KEY) || "null") as { token?: string; at?: number } | null
    if (saved && saved.token && TOKEN_RE.test(saved.token) && Date.now() - Number(saved.at || 0) < 7 * 86400000) return saved.token
  } catch { /* valeur illisible */ }
  return ""
}
function forgetInvite() {
  try { localStorage.removeItem(INVITE_KEY) } catch { /* sans effet */ }
  if (location.hash.startsWith("#/invitation/")) history.replaceState(null, "", `${location.pathname}#/`)
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [me, setMe] = useState<Me | null>(null)
  const [err, setErr] = useState("")
  const [invite] = useState(readInvite)

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  // Retour du lien de connexion (?code=…) : la session est créée par supabase-js, l'adresse est nettoyée.
  useEffect(() => {
    if (session && /[?&]code=/.test(location.search)) history.replaceState(null, "", `${location.pathname}${location.hash || "#/"}`)
  }, [session])
  useEffect(() => {
    if (!session) { setMe(null); return }
    let alive = true
    setErr("")
    rpc<Me>("nx_partner_me").then((m) => alive && setMe(m), (e) => alive && setErr(e instanceof Error ? e.message : errText(e)))
    return () => { alive = false }
  }, [session])

  if (session === undefined) return <Splash />
  if (!session) return <SignIn invite={invite} />
  if (err) return <Frame><div className="panel narrow"><p className="msg bad">{err}</p><button className="btn" onClick={() => location.reload()}>Réessayer</button></div></Frame>
  if (!me) return <Splash />
  const signOut = () => sb.auth.signOut()
  if (!me.partner) {
    if (invite) return <CodeStep mode="activate" token={invite} email={session.user.email || ""} onDone={(m) => { forgetInvite(); setMe(m) }} onSignOut={signOut} />
    return <NotPartner me={me} onSignOut={signOut} />
  }
  if (me.status === "suspended") {
    return (
      <Frame onSignOut={signOut}>
        <div className="panel narrow center">
          <span className="big-ic warn"><Icon name="lock" size={22} /></span>
          <h1>Accès suspendu</h1>
          <p className="muted">Ton accès de parrain est suspendu : tes codes promo ne fonctionnent plus pour l’instant. Écris à l’équipe NEXORA pour en savoir plus.</p>
        </div>
      </Frame>
    )
  }
  if (me.needs_code) return <CodeStep mode="unlock" email={session.user.email || ""} me={me} onDone={setMe} onSignOut={signOut} />
  if (invite) forgetInvite()
  return <Portal me={me} onMe={setMe} onSignOut={signOut} />
}

function Splash() {
  return <div className="splash"><Spinner /></div>
}


/** Écran d'accès : marque, contenu centré, pied de page. */
function Frame({ children, onSignOut }: { children: ReactNode; onSignOut?: () => void }) {
  return (
    <div className="auth">
      <header className="auth-top">
        <Brand />
        {onSignOut && <button className="btn ghost sm" onClick={onSignOut}><Icon name="external" size={14} /> Se déconnecter</button>}
      </header>
      <main className="auth-main">{children}</main>
      <footer className="auth-foot">Espace réservé aux parrains invités par l’équipe NEXORA · <a href="/">Site de NEXORA</a></footer>
    </div>
  )
}

function Steps({ at }: { at: 1 | 2 }) {
  return (
    <ol className="steps" aria-label="Étapes">
      <li className={at === 1 ? "on" : "done"}><i>{at > 1 ? <Icon name="check" size={12} /> : 1}</i>Adresse e-mail</li>
      <li className={at === 2 ? "on" : ""}><i>2</i>Code d’accès</li>
    </ol>
  )
}

type Invite = { valid: boolean; reason?: string; email?: string; name?: string; expires_at?: string }

function SignIn({ invite }: { invite: string }) {
  const [info, setInfo] = useState<Invite | null>(null)
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState("")
  const [err, setErr] = useState("")
  const [wait, setWait] = useState(0)
  useEffect(() => {
    if (!invite) return
    rpc<Invite>("nx_partner_invite_info", { p_token: invite }).then(setInfo, () => setInfo({ valid: false, reason: "server" }))
  }, [invite])
  useEffect(() => {
    if (!wait) return
    const t = setTimeout(() => setWait((w) => Math.max(0, w - 1)), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function send(e?: FormEvent) {
    e?.preventDefault()
    const v = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setErr("Saisis une adresse e-mail valide."); return }
    setBusy(true)
    setErr("")
    // Avec une invitation, le compte NEXORA est créé s'il n'existe pas ; sans invitation, seul un compte existant reçoit un lien.
    const { error } = await sb.auth.signInWithOtp({ email: v, options: { emailRedirectTo: `${location.origin}${location.pathname}`, shouldCreateUser: Boolean(invite && info?.valid) } })
    setBusy(false)
    if (error) { setErr(errText(error)); return }
    setSent(v)
    setWait(60)
  }

  const invalid = invite && info && !info.valid
  return (
    <Frame>
      <div className="auth-grid">
        <section className="pitch">
          <span className="eyebrow"><Icon name="gift" size={13} /> Programme de parrainage</span>
          <h1>{invite && info?.valid ? <>Bienvenue{info.name ? `, ${info.name}` : ""}.<br /><em>Ton espace de parrain t’attend.</em></> : <>Partage NEXORA.<br /><em>Gagne à chaque paiement.</em></>}</h1>
          <p>Tes filleuls ont {pct(DEFAULT_RULES.discount_pct)} % de remise sur l’offre Pro, à chaque paiement. Tu touches {pct(DEFAULT_RULES.commission_pct)} % de ce qu’ils paient, remise déduite, tant que leur abonnement continue.</p>
          <ul className="pitch-list">
            <li><Icon name="link" size={16} />Crée tes codes promo et tes liens de parrainage</li>
            <li><Icon name="sync" size={16} />Suis tes revenus récurrents, filleul par filleul</li>
            <li><Icon name="download" size={16} />Demande tes retraits : PayPal, virement ou Mobile Money</li>
          </ul>
        </section>
        <section className="panel">
          {invite && <Steps at={1} />}
          {invalid ? (
            <>
              <h2>Lien d’invitation expiré</h2>
              <p className="muted">{info?.reason === "suspended" ? "Cet accès de parrain est suspendu." : "Ce lien a déjà servi ou a été remplacé. Si ton accès est déjà activé, connecte-toi avec ton adresse e-mail ; sinon, demande un nouveau lien à l’équipe NEXORA."}</p>
            </>
          ) : sent ? (
            <>
              <span className="big-ic"><Icon name="mail" size={22} /></span>
              <h2>Vérifie ta boîte de réception</h2>
              <p className="muted">Un lien de connexion vient d’être envoyé à <b>{sent}</b>. Ouvre-le <b>sur cet appareil</b>{invite ? " : tu saisiras ensuite ton code d’accès" : ""}. Il expire dans une heure.</p>
              <div className="row">
                <button className="btn" disabled={busy || wait > 0} onClick={() => send()}>{wait > 0 ? `Renvoyer dans ${wait} s` : "Renvoyer le lien"}</button>
                <button className="btn ghost" onClick={() => { setSent(""); setErr("") }}>Changer d’adresse</button>
              </div>
            </>
          ) : (
            <form onSubmit={send} className="form">
              <h2>{invite ? "Active ton accès" : "Connexion des parrains"}</h2>
              <p className="muted">
                {invite && info?.valid ? <>Connecte-toi avec l’adresse invitée, <b>{info.email}</b>. Tu recevras un lien de connexion, sans mot de passe.</> : "Saisis l’adresse e-mail de ton accès de parrain : tu recevras un lien de connexion, sans mot de passe."}
              </p>
              <label className="field">
                <span>Adresse e-mail</span>
                <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@exemple.com" autoFocus />
              </label>
              {err && <p className="msg bad" role="alert">{err}</p>}
              <button className="btn primary block" disabled={busy || Boolean(invite && !info)}>{busy ? "Envoi…" : "Recevoir mon lien de connexion"}</button>
              {!invite && <p className="fine">Pas encore parrain ? L’accès se fait sur invitation de l’équipe NEXORA.</p>}
            </form>
          )}
        </section>
      </div>
    </Frame>
  )
}

/** Code d'accès : activation (lien d'invitation + code) ou code du mois. */
function CodeStep({ mode, token, email, me, onDone, onSignOut }: { mode: "activate" | "unlock"; token?: string; email: string; me?: Me; onDone: (m: Me) => void; onSignOut: () => void }) {
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [wrongMail, setWrongMail] = useState("")
  const locked = me?.locked_until && new Date(me.locked_until).getTime() > Date.now() ? me.locked_until : ""
  const month = new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(new Date())

  function onInput(v: string) {
    const raw = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)
    setCode(raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw)
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (code.replace("-", "").length !== 8) { setErr("Le code d’accès compte 8 caractères (XXXX-XXXX)."); return }
    setBusy(true)
    setErr("")
    try {
      const r = mode === "activate" ? await rpc<CodeResult>("nx_partner_activate", { p_token: token, p_code: code }) : await rpc<CodeResult>("nx_partner_unlock", { p_code: code })
      if (r.ok) { onDone(r); return }
      if (r.reason === "email") setWrongMail(r.expected || "")
      else if (r.reason === "locked") setErr(`Trop de codes faux : réessaie après ${fmtTime(r.until)}.`)
      else if (r.reason === "code") setErr(`Code incorrect${r.left != null ? ` : encore ${r.left} essai${(r.left || 0) > 1 ? "s" : ""} avant un blocage de 30 minutes` : ""}.`)
      else if (r.reason === "invite") setErr("Ce lien d’invitation n’est plus valable : demande un nouveau lien à l’équipe NEXORA.")
      else if (r.reason === "already") setErr("Ce compte est déjà lié à un autre accès de parrain.")
      else setErr("Le code n’a pas pu être vérifié.")
    } catch (x) {
      setErr(x instanceof Error ? x.message : errText(x))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Frame onSignOut={onSignOut}>
      <section className="panel narrow">
        {mode === "activate" && <Steps at={2} />}
        <span className="big-ic"><Icon name="key" size={22} /></span>
        <h2>{mode === "activate" ? "Saisis ton code d’accès" : `Code d’accès de ${month}`}</h2>
        <p className="muted">
          {mode === "activate"
            ? <>Connecté avec <b>{email}</b>. Saisis le code de 8 caractères transmis par l’équipe NEXORA avec ton invitation.</>
            : <>Pour ta sécurité, l’accès change chaque mois. Saisis le code de {month} transmis par l’équipe NEXORA{me?.code_expires_at ? ` (valable jusqu’au ${lastDay(me.code_expires_at)})` : ""}.</>}
        </p>
        {wrongMail ? (
          <div className="stack">
            <p className="msg bad" role="alert">Tu es connecté avec <b>{email}</b>, mais l’invitation est pour <b>{wrongMail}</b>. Déconnecte-toi, puis connecte-toi avec l’adresse invitée.</p>
            <button className="btn primary block" onClick={onSignOut}>Changer de compte</button>
          </div>
        ) : (
          <form className="form" onSubmit={submit}>
            <label className="field">
              <span>Code d’accès</span>
              <input className="input code-input" value={code} onChange={(e) => onInput(e.target.value)} placeholder="XXXX-XXXX" autoComplete="one-time-code" inputMode="text" spellCheck={false} autoFocus aria-describedby="code-hint" disabled={Boolean(locked)} />
              <small id="code-hint">Sans 0, O, 1, I ni L : les caractères qui se confondent ne sont jamais utilisés.</small>
            </label>
            {locked && <p className="msg bad" role="alert">Trop de codes faux : réessaie après {fmtTime(locked)}.</p>}
            {err && <p className="msg bad" role="alert">{err}</p>}
            <button className="btn primary block" disabled={busy || Boolean(locked)}>{busy ? "Vérification…" : mode === "activate" ? "Activer mon accès" : "Ouvrir mon espace"}</button>
            <p className="fine">Pas de code ? Demande-le à l’équipe NEXORA : il n’est jamais envoyé automatiquement.</p>
          </form>
        )}
      </section>
    </Frame>
  )
}

function NotPartner({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  return (
    <Frame onSignOut={onSignOut}>
      <section className="panel narrow center">
        <span className="big-ic"><Icon name="gift" size={22} /></span>
        <h2>{me.invited ? "Ouvre ton lien d’invitation" : "Pas d’accès parrain"}</h2>
        <p className="muted">
          {me.invited
            ? <>Une invitation attend <b>{me.email}</b>. Ouvre le lien d’invitation reçu de l’équipe NEXORA sur cet appareil pour saisir ton code d’accès.</>
            : <>Le compte <b>{me.email}</b> n’est pas parrain. L’accès au programme se fait sur invitation de l’équipe NEXORA.</>}
        </p>
      </section>
    </Frame>
  )
}
