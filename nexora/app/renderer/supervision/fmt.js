// NEXORA #022 : formats partagés par les graphiques de la supervision, sans dépendance à l'interface de
// NEXORA (pas de pont IPC ni d'icônes) : `charts.js` est aussi utilisé par le back office web (admin/).
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nf = (d) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
export const num = (v, d = 0) => (v == null || !Number.isFinite(Number(v)) ? '—' : nf(d).format(Number(v)));
