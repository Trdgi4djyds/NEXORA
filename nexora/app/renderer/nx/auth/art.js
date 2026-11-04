// NEXORA #034 : illustration des écrans de connexion (application, version web et back office). Dessinée en SVG,
// sans image : halos et ruban aux couleurs du logo, fenêtre de navigateur, téléphone et pastille « vérifié »
// (ce que fait NEXORA : sites dans de vrais appareils). Les surfaces suivent le thème par des classes
// (.nxl-card, .nxl-soft, .nxl-line) que la feuille de style de l'écran colore. Module autonome, sans dépendance :
// importé aussi par le back office (admin/src/auth.tsx).

export function authArt(id = 'nxl') {
  const g = `${id}-g`;
  const g2 = `${id}-g2`;
  const ribbon = 'M-30 300 C 50 130, 185 112, 238 196 S 398 306, 512 118';
  return `<svg class="nxl-art-svg" viewBox="0 0 480 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
<defs>
<linearGradient id="${g}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ff6a88"/><stop offset=".5" stop-color="#d34bd5"/><stop offset="1" stop-color="#5b6cff"/></linearGradient>
<linearGradient id="${g2}" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff6a88"/><stop offset=".55" stop-color="#d34bd5"/><stop offset="1" stop-color="#5b6cff"/></linearGradient>
<filter id="${id}-b" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="30"/></filter>
<filter id="${id}-s" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#2a1d63" flood-opacity=".2"/></filter>
</defs>
<g class="nxl-glow" filter="url(#${id}-b)"><circle cx="96" cy="96" r="92" fill="#ff6a88"/><circle cx="392" cy="70" r="104" fill="#5b6cff"/><circle cx="262" cy="300" r="112" fill="#d34bd5"/></g>
<path d="${ribbon}" fill="none" stroke="url(#${g})" stroke-width="46" stroke-linecap="round"/>
<path d="${ribbon}" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="5" stroke-linecap="round" transform="translate(0 -13)"/>
<g filter="url(#${id}-s)" transform="translate(92 62) rotate(-6)">
<rect class="nxl-card" width="196" height="128" rx="15"/>
<circle cx="17" cy="16" r="4.2" fill="#ff5f57"/><circle cx="30.5" cy="16" r="4.2" fill="#febc2e"/><circle cx="44" cy="16" r="4.2" fill="#28c840"/>
<rect class="nxl-line" x="0" y="31" width="196" height="1"/>
<rect x="16" y="45" width="84" height="11" rx="5.5" fill="url(#${g})"/>
<rect class="nxl-soft" x="16" y="64" width="128" height="7" rx="3.5"/>
<rect class="nxl-soft" x="16" y="78" width="100" height="7" rx="3.5"/>
<rect class="nxl-soft" x="16" y="100" width="74" height="16" rx="8"/>
<rect x="98" y="100" width="74" height="16" rx="8" fill="url(#${g2})"/>
</g>
<g filter="url(#${id}-s)" transform="translate(306 118) rotate(8)">
<rect class="nxl-card" width="86" height="164" rx="19"/>
<rect class="nxl-soft" x="31" y="9" width="24" height="6" rx="3"/>
<rect x="10" y="26" width="66" height="60" rx="11" fill="url(#${g})"/>
<rect class="nxl-soft" x="10" y="96" width="52" height="7" rx="3.5"/>
<rect class="nxl-soft" x="10" y="110" width="40" height="7" rx="3.5"/>
<rect class="nxl-soft" x="10" y="130" width="66" height="19" rx="9.5"/>
</g>
<g filter="url(#${id}-s)" transform="translate(64 232)">
<rect class="nxl-card" width="138" height="42" rx="21"/>
<circle cx="21" cy="21" r="12" fill="#1f9d55"/>
<path d="M15.5 21.5l3.6 3.6 7-7.4" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
<rect class="nxl-soft" x="42" y="13" width="78" height="6.5" rx="3.25"/>
<rect class="nxl-soft" x="42" y="24.5" width="52" height="5.5" rx="2.75"/>
</g>
</svg>`;
}
