// NEXORA #052 : différence ligne à ligne (affichage des changements proposés par l'assistant).
import { esc } from './ui.js';

export function diffLines(a, b) {
  const x = String(a ?? '').split('\n');
  const y = String(b ?? '').split('\n');
  if (x.length * y.length > 4e6) return [...x.map((t) => ['-', t]), ...y.map((t) => ['+', t])];
  const n = x.length;
  const m = y.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { out.push([' ', x[i]]); i += 1; j += 1; } else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(['-', x[i]]); i += 1; } else { out.push(['+', y[j]]); j += 1; }
  }
  while (i < n) out.push(['-', x[i++]]);
  while (j < m) out.push(['+', y[j++]]);
  return out;
}
// Rendu compact : seules les zones modifiées, avec 3 lignes de contexte.
export function diffHtml(a, b) {
  const d = diffLines(a, b);
  const keep = new Set();
  d.forEach(([k], i) => { if (k !== ' ') for (let t = Math.max(0, i - 3); t <= Math.min(d.length - 1, i + 3); t += 1) keep.add(t); });
  const rows = [];
  let skipped = 0;
  d.forEach(([k, t], i) => {
    if (!keep.has(i)) { skipped += 1; return; }
    if (skipped) { rows.push(`<span class="hunk">… ${skipped} ligne(s) inchangée(s)</span>`); skipped = 0; }
    rows.push(`<span class="${k === '+' ? 'add' : k === '-' ? 'del' : ''}">${k} ${esc(t) || ' '}</span>`);
  });
  const add = d.filter(([k]) => k === '+').length;
  const del = d.filter(([k]) => k === '-').length;
  return { html: `<pre class="nxd-diff">${rows.join('\n') || '<span class="hunk">Aucun changement</span>'}</pre>`, add, del };
}
