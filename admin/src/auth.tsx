// Connexion au back office : comptes NEXORA dont le rôle (profiles.app_role) est admin ou superadmin.
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react"
import type { Session } from "@supabase/supabase-js"
import { errText, sb, type Row } from "./supabase"
import logo from "../../nexora/app/renderer/logo.png"
import { authArt } from "../../nexora/app/renderer/nx/auth/art.js"
import { Icon } from "./icons"

export type Me = { session: Session; profile: Row<"profiles">; isSuper: boolean }
const AuthCtx = createContext<Me>(null as unknown as Me)
export const useMe = () => useContext(AuthCtx)

const isAdminRole = (r?: string | null) => r === "admin" || r === "superadmin"

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Row<"profiles"> | null | undefined>(undefined)
  const [recovery, setRecovery] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true)
      // Différé : pas d'appel Supabase à l'intérieur du rappel (recommandation de supabase-js).
      setTimeout(() => setSession(s), 0)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(session === null ? null : undefined)
      return
    }
    setProfile(undefined)
    sb.from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (e) setError(errText(e))
        setProfile((data as Row<"profiles">) || null)
      })
  }, [session?.user.id])

  if (recovery && session) return <SetPassword onDone={() => setRecovery(false)} />
  if (session === undefined || (session && profile === undefined)) return <Splash />
  if (!session) return <Login />
  if (!profile || !isAdminRole(profile.app_role) || profile.status === "suspended")
    return <Denied reason={error || (profile?.status === "suspended" ? "Ce compte est suspendu." : "")} />
  return (
    <AuthCtx.Provider value={{ session, profile, isSuper: profile.app_role === "superadmin" }}>
      {children}
    </AuthCtx.Provider>
  )
}

function Splash() {
  return (
    <div className="auth auth-splash" aria-busy="true">
      <span className="spinner" />
    </div>
  )
}

// NEXORA #034 : écran de connexion modernisé, deux panneaux comme dans l'application : la marque (logo,
// illustration partagée nx/auth/art.js, ce que permet le back office) et le formulaire.
// Écran public (avant connexion) : rien sur l'infrastructure ni sur la configuration (NEXORA #038).
const FEATS: [string, string, string][] = [
  ["user", "Utilisateurs et équipes", "Comptes, rôles et offres"],
  ["pdf", "Factures et e-mails", "Factures et messages aux couleurs de NEXORA"],
  ["sync", "Supervision", "Sites surveillés, incidents et alertes"],
]

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-brand">
        <div className="auth-logo">
          <img src={logo} alt="" />
          <div><b>NEXORA</b><small>Administration</small></div>
        </div>
        <div className="auth-art" dangerouslySetInnerHTML={{ __html: authArt("nxl-admin") }} />
        <div className="auth-pitch">
          <h2>Pilote NEXORA en un seul endroit.</h2>
          <ul>
            {FEATS.map(([icon, title, text]) => (
              <li key={title}>
                <span className="auth-ic"><Icon name={icon} size={15} /></span>
                <span><b>{title}</b><small>{text}</small></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="auth-trust"><Icon name="lock" size={12} /> Accès réservé aux administrateurs · © {new Date().getFullYear()} NEXORA</p>
      </aside>
      <main className="auth-main">
        <div className="auth-panel">
          <div className="auth-mobile-logo"><img src={logo} alt="" /><b>NEXORA</b></div>
          {children}
        </div>
      </main>
    </div>
  )
}

function Head({ kicker, title, text, badge }: { kicker?: string; title: string; text: ReactNode; badge?: string }) {
  return (
    <div className="auth-head">
      {badge && <span className="auth-badge"><Icon name={badge} size={20} /></span>}
      {kicker && <span className="auth-kicker">{kicker}</span>}
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  )
}

function Field({ label, icon, aside, children }: { label: string; icon: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <label className="field auth-field">
      <span className="auth-label">{label}{aside}</span>
      <span className="auth-input"><Icon name={icon} size={16} />{children}</span>
    </label>
  )
}

/** Champ mot de passe avec bouton d'affichage. */
function PasswordInput(props: { value: string; onChange: (v: string) => void; autoComplete: string; minLength?: number; placeholder?: string; autoFocus?: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <>
      <input className="input" type={show ? "text" : "password"} required autoComplete={props.autoComplete} minLength={props.minLength}
        placeholder={props.placeholder} autoFocus={props.autoFocus} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      <button type="button" className="auth-eye" onClick={() => setShow(!show)} aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"} title={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
        <Icon name={show ? "eyeOff" : "eye"} size={16} />
      </button>
    </>
  )
}

function Submit({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button className="btn primary auth-submit" disabled={busy}>
      {busy ? <span className="spinner sm" /> : <><span>{children}</span><Icon name="chevronRight" size={16} /></>}
    </button>
  )
}

function Login() {
  const [mode, setMode] = useState<"login" | "forgot">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${location.origin}${location.pathname}`,
        })
        if (error) throw error
        setMsg({ text: "Si un compte existe avec cette adresse, un lien de réinitialisation vient d’être envoyé." })
      }
    } catch (err) {
      setMsg({ text: errText(err), bad: true })
    } finally {
      setBusy(false)
    }
  }
  const go = (m: "login" | "forgot") => {
    setMode(m)
    setMsg(null)
  }

  return (
    <AuthShell>
      <form className="auth-form" onSubmit={submit}>
        {mode === "forgot" && (
          <button type="button" className="auth-back" onClick={() => go("login")}><Icon name="back" size={14} /> Retour à la connexion</button>
        )}
        {mode === "login"
          ? <Head kicker="Back office" title="Connexion" text="Connecte-toi avec ton compte NEXORA administrateur." />
          : <Head badge="key" title="Mot de passe oublié ?" text="Saisis ton adresse e-mail : tu recevras un lien pour choisir un nouveau mot de passe." />}
        <Field label="Adresse e-mail" icon="mail">
          <input className="input" type="email" autoComplete="email" required autoFocus placeholder="toi@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {mode === "login" && (
          <Field label="Mot de passe" icon="lock" aside={<button type="button" className="link-btn auth-forgot" onClick={() => go("forgot")}>Mot de passe oublié ?</button>}>
            <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" placeholder="Ton mot de passe" />
          </Field>
        )}
        {msg && <div className={`auth-msg ${msg.bad ? "bad" : "ok"}`} role={msg.bad ? "alert" : "status"}>{msg.text}</div>}
        <Submit busy={busy}>{mode === "login" ? "Se connecter" : "Envoyer le lien"}</Submit>
        <p className="auth-note"><Icon name="shield" size={13} /> Seuls les comptes au rôle administrateur ou super-administrateur peuvent entrer.</p>
      </form>
    </AuthShell>
  )
}

function SetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) return setMsg("Les deux mots de passe ne correspondent pas.")
    setBusy(true)
    const { error } = await sb.auth.updateUser({ password })
    setBusy(false)
    if (error) return setMsg(errText(error))
    history.replaceState(null, "", location.pathname)
    onDone()
  }
  return (
    <AuthShell>
      <form className="auth-form" onSubmit={submit}>
        <Head badge="lock" title="Nouveau mot de passe" text="Choisis un mot de passe d’au moins 8 caractères." />
        <Field label="Nouveau mot de passe" icon="lock">
          <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" minLength={8} placeholder="8 caractères minimum" autoFocus />
        </Field>
        <Field label="Confirmation" icon="lock">
          <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" minLength={8} placeholder="Le même mot de passe" />
        </Field>
        {msg && <div className="auth-msg bad" role="alert">{msg}</div>}
        <Submit busy={busy}>Enregistrer</Submit>
      </form>
    </AuthShell>
  )
}

function Denied({ reason }: { reason: string }) {
  return (
    <AuthShell>
      <div className="auth-form">
        <Head badge="shield" title="Accès réservé" text={reason || "Ce compte n’a pas le rôle administrateur. Demande à un super-administrateur de te l’attribuer."} />
        <button className="btn auth-alt" onClick={() => sb.auth.signOut()}>
          Changer de compte
        </button>
      </div>
    </AuthShell>
  )
}
