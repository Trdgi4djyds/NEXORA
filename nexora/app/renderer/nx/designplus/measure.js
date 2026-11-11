// NEXORA #053 : mesures : en maintenant Alt, les distances entre l'élément sélectionné et l'élément survolé (ou
// les bords de la page) s'affichent en pixels.
export function bind(D) {
  const c = D.canvas;
  let hover = null;
  let alt = false;
  const draw = () => {
    const ctx = c.contextTop;
    if (!ctx) return;
    c.clearContext(ctx);
    const a = c.getActiveObject();
    if (!alt || !a) return;
    const A = a.getBoundingRect();
    const B = hover && hover !== a && hover.id !== '__board' ? hover.getBoundingRect() : { left: 0, top: 0, width: D.page.w, height: D.page.h, page: true };
    const v = c.viewportTransform; const R = c.getRetinaScaling();
    ctx.save();
    ctx.setTransform(v[0] * R, 0, 0, v[3] * R, v[4] * R, v[5] * R);
    const z = v[0];
    ctx.lineWidth = 1 / z; ctx.strokeStyle = '#e8336d'; ctx.fillStyle = '#e8336d'; ctx.font = `600 ${11 / z}px Inter, sans-serif`;
    const line = (x1, y1, x2, y2, label) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const d = Math.round(label);
      if (d <= 0) return;
      const tx = `${d}`; const w = ctx.measureText(tx).width + 8 / z; const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2;
      ctx.fillRect(mx - w / 2, my - 8 / z, w, 16 / z); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tx, mx, my); ctx.fillStyle = '#e8336d';
    };
    const cy = A.top + A.height / 2; const cx = A.left + A.width / 2;
    if (B.page) {
      line(B.left, cy, A.left, cy, A.left - B.left); line(A.left + A.width, cy, B.width, cy, B.width - A.left - A.width);
      line(cx, B.top, cx, A.top, A.top - B.top); line(cx, A.top + A.height, cx, B.height, B.height - A.top - A.height);
    } else {
      if (B.left >= A.left + A.width) line(A.left + A.width, cy, B.left, cy, B.left - A.left - A.width);
      else if (A.left >= B.left + B.width) line(B.left + B.width, cy, A.left, cy, A.left - B.left - B.width);
      if (B.top >= A.top + A.height) line(cx, A.top + A.height, cx, B.top, B.top - A.top - A.height);
      else if (A.top >= B.top + B.height) line(cx, B.top + B.height, cx, A.top, A.top - B.top - B.height);
      ctx.setLineDash([4 / z, 3 / z]); ctx.strokeRect(B.left, B.top, B.width, B.height); ctx.setLineDash([]);
    }
    ctx.restore();
  };
  c.on('mouse:move', (e) => { alt = Boolean(e.e && e.e.altKey); hover = e.target || null; if (alt) draw(); });
  c.on('after:render', () => { if (alt) draw(); });
  window.addEventListener('keyup', (e) => { if (e.key === 'Alt' && alt) { alt = false; c.clearContext(c.contextTop); } });
}
