# Atelier de rendus 3D (NEXORA #100)

Produit, avec **three.js**, **React Three Fiber**, **Drei** et **react-3d-mockups** (MIT, appareils construits par
le code d'après leurs dimensions réelles, sans fichier 3D tiers) :

- les **rendus d'appareils** du site vitrine (`site/src/assets/rendus/*.webp`), écrans montrant les vraies captures
  sombres de NEXORA (`site/src/assets/ecrans/*-sombre.webp`) et le site lui-même (`site-iphone.webp`) ;
- les **icônes en verre** des espaces (`verre-<espace>.webp`) : tracés des icônes de NEXORA
  (`chunk-S4I2LXHS.js`) en tubes de verre irisé, sous un éclairage violet, bleu, rose et citron vert ;
- les **appareils réalistes du Studio** (`nexora/app/renderer/nx/studioplus/devices/*.glb`) : export GLTF de chaque
  appareil, surface d'écran remplacée par le maillage `NX_SCREEN` (coordonnées de texture normalisées), reconnu par
  `screenMesh()` du Studio ; les autres pièces dont le nom contiendrait « screen », « écran » ou « display » sont
  renommées.

Les dépendances s'installent **hors du dépôt** (comme Go ou PGlite), depuis la racine du dépôt :

```sh
mkdir -p /tmp/mock && cp -r scripts/rendus-3d/. /tmp/mock/ && (cd /tmp/mock && pnpm install)
mkdir -p /tmp/mock/public && cp site/src/assets/ecrans/*-sombre.webp site/src/assets/ecrans/site-iphone.webp /tmp/mock/public/
# Icônes : /tmp/mock/public/icons.json = { espace: { icon, svg } }, tiré de site/src/data/spaces.ts (champ icon)
# et de l'export « a » de nexora/app/renderer/dist/chunks/chunk-S4I2LXHS.js.
(cd /tmp/mock && pnpm exec vite build && cd dist && python3 -m http.server 5199 &)
cd /tmp/mock
node shoot.mjs hero 2400 1500 out/hero.png          # scènes : hero, duo, display, ipad, phones
Q="id=dev" node shoot.mjs icon 640 640 out/verre-dev.png
node exp.mjs macbook-pro-16 iphone-18-pro           # GLB dans glb/ (liste complète : DEVICES de src/Export.tsx)
```

Chromium sans processeur graphique : `--use-gl=angle --use-angle=swiftshader` (déjà dans `shoot.mjs` et `exp.mjs`).
Les PNG à fond transparent sont recadrés sur leur contenu puis convertis en WebP (Pillow). Après une refonte du site :
`pnpm build`, `node scripts/ecrans-vitrine.mjs site`, refaire le rendu `hero` (l'iPhone montre le site), reconstruire
et relancer `ecrans-vitrine.mjs site` (deux passes).

Licence de react-3d-mockups : MIT © 2026 Ye Joo Park (texte complet dans
`nexora/app/renderer/nx/studioplus/devices/LICENCE.md`).
