# desigma (code repris dans NEXORA #113)

Les fichiers `motion-model.js`, `motion-live.js`, `motion-ui.js`, `proto.js` (Smart Animate, contrôle de l'animation), `extras.js` et les générateurs SwiftUI et Jetpack Compose de `code.js` reprennent des algorithmes et des données de **desigma** (https://github.com/deepfounder-ai/desigma, DeepFounder) : courbes de Bézier et ressorts à durée fixe (`crates/desigma-doc/src/motion/easing.rs`), clips et bibliothèque des 41 préréglages (`clip.rs`, `presets.rs`), pistes d'images clés et composition (`track.rs`, `eval.rs`), code d'animation CSS, SwiftUI et Compose (`crates/desigma-export/src/css_anim.rs`). Ils ont été réécrits en JavaScript pour NEX-DESIGN ; les noms des préréglages sont traduits.

desigma est distribué sous licence MIT ou Apache-2.0, au choix ; NEXORA utilise la licence MIT, reproduite ci-dessous. Le nom et le logo de desigma sont des marques de DeepFounder et ne sont pas utilisés par NEXORA (voir `TRADEMARKS.md` de desigma).

```
MIT License

Copyright (c) 2026 Deep Founder and the desigma contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
