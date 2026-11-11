// Page de statut publique de NEXORA (#048) : état des services d'une équipe, disponibilité sur 90 jours,
// incidents, maintenances prévues, abonnement aux incidents par e-mail. Lit une fonction publique de la base
// avec la clé publique (config.json, écrit à la publication). ?p=<page>, ?confirm=<jeton>, ?stop=<jeton>,
// ?demo=1 (données fictives pour les captures).
;(async () => {
  const main = document.querySelector("main")
  const qs = new URLSearchParams(location.search)
  const slug = (qs.get("p") || location.hash.slice(1) || "").toLowerCase()
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
  const fmt = (t) => new Date(t).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
  const dur = (a, b) => { const m = Math.round((new Date(b) - new Date(a)) / 60000); return m < 60 ? `${Math.max(1, m)} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` }
  let cfg = null
  const rpc = async (name, args) => {
    if (!cfg) cfg = await (await fetch("./config.json", { cache: "no-store" })).json()
    const r = await fetch(`${cfg.url}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: cfg.key, authorization: `Bearer ${cfg.key}`, "content-type": "application/json" }, body: JSON.stringify(args) })
    if (!r.ok) throw new Error(String(r.status))
    return r.json()
  }
  let notice = ""
  try {
    if (qs.get("confirm")) { const r = await rpc("nx_status_confirm", { p_token: qs.get("confirm") }); notice = r && r.ok ? "Abonnement confirmé : tu seras prévenu des incidents et de leur résolution." : "Ce lien de confirmation n’est plus valable." }
    if (qs.get("stop")) { await rpc("nx_status_unsubscribe", { p_token: qs.get("stop") }); notice = "Tu ne recevras plus de messages pour cette page." }
  } catch { notice = "Réessaie dans un instant." }
  let d = null
  if (qs.get("demo")) d = demo()
  else if (slug) { try { d = await rpc("nx_status_page", { p_slug: slug }) } catch { d = undefined } }
  if (!d) {
    document.title = "Page introuvable"
    main.innerHTML = `${notice ? `<p class="notice">${esc(notice)}</p>` : ""}<p class="empty">${d === undefined ? "La page de statut ne répond pas. Réessaie dans un instant." : "Cette page de statut n’existe pas ou n’est pas publiée."}</p>`
    return
  }
  document.title = `${d.title} · État des services`
  const LABEL = { up: "Opérationnel", degraded: "Perturbé", down: "En panne", maint: "En maintenance", paused: "Suspendu", unknown: "En attente" }
  const BANNER = { up: ["Tous les services fonctionnent", ""], degraded: ["Certains services sont perturbés", "Nous suivons la situation."], down: ["Incident en cours", "Nous travaillons au rétablissement."] }
  const tone = (a) => (a == null ? "" : a >= 99.9 ? "ok" : a >= 98 ? "warn" : "bad")
  const svc = (s) => `<div class="svc"><div class="svc-h"><b>${esc(s.name)}</b><span class="state ${esc(s.status)}">${esc(LABEL[s.status] || s.status)}</span></div>
    <div class="bars" role="img" aria-label="Disponibilité des 90 derniers jours">${(s.days || []).map((x) => `<i class="${tone(x.a)}" title="${esc(new Date(x.d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }))} : ${x.a == null ? "aucune mesure" : `${String(x.a).replace(".", ",")} %`}"></i>`).join("")}</div>
    <div class="legend"><span>il y a 90 jours</span><span>${s.uptime == null ? "—" : `${String(s.uptime).replace(".", ",")} % de disponibilité`}</span><span>aujourd’hui</span></div></div>`
  const [bt, bs] = BANNER[d.overall] || BANNER.up
  main.innerHTML = `${notice ? `<p class="notice">${esc(notice)}</p>` : ""}
    <header><h1>${esc(d.title)}</h1>${d.intro ? `<p class="intro">${esc(d.intro)}</p>` : ""}</header>
    <div class="banner ${esc(d.overall)}"><span class="dot"></span><span>${esc(bt)}${bs ? `<small>${esc(bs)}</small>` : ""}</span></div>
    ${d.maintenance && d.maintenance.length ? `<section class="card"><h2>Maintenances prévues</h2>${d.maintenance.map((w) => `<div class="inc"><b>${esc(w.label)}</b><small>${esc(fmt(w.starts_at))} → ${esc(fmt(w.ends_at))}${w.recur === "daily" ? " · chaque jour" : w.recur === "weekly" ? " · chaque semaine" : ""}</small></div>`).join("")}</section>` : ""}
    <section class="card"><h2>Services</h2>${(d.services || []).map(svc).join("") || '<p class="msg">Aucun service.</p>'}</section>
    ${d.incidents && d.incidents.length ? `<section class="card"><h2>Incidents récents</h2>${d.incidents.map((i) => `<div class="inc"><b>${esc(i.service)} · ${i.kind === "down" ? "panne" : "lenteur"}</b><small>${esc(fmt(i.started_at))} · ${i.ended_at ? `résolu en ${esc(dur(i.started_at, i.ended_at))}` : "en cours"}</small><div class="cause">${esc(i.cause)}</div></div>`).join("")}</section>` : ""}
    <section class="card"><h2>Être prévenu</h2><form class="sub"><input type="email" name="email" required placeholder="ton@adresse.com" autocomplete="email" aria-label="Adresse e-mail"><button>S’abonner</button></form><p class="msg" data-msg>Un e-mail à chaque incident et à sa résolution. Désabonnement en un clic.</p></section>
    <footer>Mis à jour ${esc(fmt(d.updated_at))} · Page de statut propulsée par NEXORA</footer>`
  const form = main.querySelector("form.sub")
  form.onsubmit = async (ev) => {
    ev.preventDefault()
    const msg = main.querySelector("[data-msg]")
    const email = new FormData(form).get("email")
    if (qs.get("demo")) { msg.textContent = "Vérifie ta boîte e-mail pour confirmer l’abonnement."; return }
    try { const r = await rpc("nx_status_subscribe", { p_slug: slug, p_email: email }); msg.textContent = r && r.ok ? "Vérifie ta boîte e-mail pour confirmer l’abonnement." : (r && r.message) || "Réessaie dans un instant." } catch { msg.textContent = "Réessaie dans un instant." }
  }

  function demo() {
    const now = Date.now()
    const days = (bad) => Array.from({ length: 90 }, (_, i) => ({ d: new Date(now - (89 - i) * 864e5).toISOString(), a: bad.includes(i) ? (i === 84 ? 97.9 : 99.6) : i < 6 ? null : 100 }))
    return {
      title: "Statut de la boutique", intro: "Suis ici l’état de nos services en temps réel.", overall: "degraded", updated_at: new Date(now).toISOString(),
      services: [
        { name: "Boutique en ligne", status: "up", uptime: 99.874, days: days([31, 78, 84]) },
        { name: "Paiement", status: "up", uptime: 99.981, days: days([55]) },
        { name: "API mobile", status: "degraded", uptime: 99.62, days: days([12, 60, 88, 89]) },
      ],
      incidents: [
        { service: "API mobile", kind: "slow", started_at: new Date(now - 42 * 6e4).toISOString(), ended_at: null, cause: "1 480 ms pour un seuil de 900 ms" },
        { service: "Boutique en ligne", kind: "down", started_at: new Date(now - 5 * 864e5).toISOString(), ended_at: new Date(now - 5 * 864e5 + 18 * 6e4).toISOString(), cause: "statut 503" },
      ],
      maintenance: [{ label: "Mise à jour de la base de données", starts_at: new Date(now + 20 * 36e5).toISOString(), ends_at: new Date(now + 22 * 36e5).toISOString(), recur: "none" }],
    }
  }
})()
