// NEXORA — mesure des visiteurs réels (Web Vitals et erreurs JavaScript), moins de 3 Ko.
// <script src="https://nexoradevs.online/rum.js" data-site="CLÉ" defer></script>
// Aucune donnée personnelle : chemin de la page (sans paramètres), type d'appareil, mesures et erreurs.
;(() => {
  const s = document.currentScript
  const key = s && s.dataset.site
  if (!key || !("PerformanceObserver" in window)) return
  const endpoint = new URL("/rum", s.src).href
  const m = {
    path: location.pathname,
    device: innerWidth < 768 ? "mobile" : innerWidth < 1100 ? "tablet" : "desktop",
  }
  const errors = []
  let cls = 0
  let inp = 0
  const watch = (type, fn, opts = {}) => {
    try {
      new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({
        type,
        buffered: true,
        ...opts,
      })
    } catch {
      /* type non pris en charge par ce navigateur */
    }
  }
  watch("largest-contentful-paint", (e) => {
    m.lcp = Math.round(e.startTime)
  })
  watch("layout-shift", (e) => {
    if (!e.hadRecentInput) cls += e.value
  })
  watch(
    "event",
    (e) => {
      if (e.interactionId) inp = Math.max(inp, Math.round(e.duration))
    },
    { durationThreshold: 40 },
  )
  watch("paint", (e) => {
    if (e.name === "first-contentful-paint") m.fcp = Math.round(e.startTime)
  })
  try {
    const nav = performance.getEntriesByType("navigation")[0]
    if (nav) m.ttfb = Math.round(nav.responseStart)
  } catch {
    /* rien */
  }
  const short = (u) => String(u || "").split("/").pop().split("?")[0]
  addEventListener("error", (e) => {
    if (errors.length < 5 && e.message)
      errors.push({ path: m.path, err: String(e.message).slice(0, 300), src: `${short(e.filename)}:${e.lineno || 0}` })
  })
  addEventListener("unhandledrejection", (e) => {
    if (errors.length < 5)
      errors.push({ path: m.path, err: String((e.reason && e.reason.message) || e.reason || "Promesse rejetée").slice(0, 300), src: "" })
  })
  let sent = false
  const send = () => {
    if (sent) return
    sent = true
    const body = JSON.stringify({
      site: key,
      events: [{ ...m, cls: Math.round(cls * 10000) / 10000, inp: inp || undefined }, ...errors],
    })
    try {
      navigator.sendBeacon(endpoint, new Blob([body], { type: "text/plain" }))
    } catch {
      fetch(endpoint, { method: "POST", body, keepalive: true, mode: "no-cors" }).catch(() => {})
    }
  }
  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") send()
  })
  addEventListener("pagehide", send)
})()
