// NEXORA #037 : objets illustrés des cartes (dossier, équipe, téléphone, bouclier, cube…), dans l'esprit
// des cartes de référence : un grand objet net, en relief doux, aux teintes de la carte, posé à droite et
// parfois rogné par le bord. Chaque objet est dessiné dans un repère de 100 × 100 ; illu.js le place, le
// tourne et choisit sa teinte (s douce, m moyenne, d vive, a vive d'une autre couleur ; w et k : reflet
// blanc et ombre, en transparence). Les détails marqués deco disparaissent s'ils touchent un texte.
// k : P() nouveau tracé ; fill(tracé, teinte, options) ; grad(tracé, arrêts, x1, y1, x2, y2, options) ;
// line(tracé, teinte, épaisseur, options). Options : alpha, deco, rule.

const DOWN = [[20, 8], [82, 96]]; // dégradé par défaut : lumière en haut à gauche
const g2 = (a, b) => [[a, 0, 1], [b, 1, 1]];

function rows(k, x, y, ws, gap, lvl, sw) {
  ws.forEach((w, i) => k.line(k.P().M(x, y + i * gap).L(x + w, y + i * gap), lvl, sw, { deco: true }));
}
function shine(k, d) { k.line(d, 'w', 2.4, { alpha: 0.55, deco: true }); }
function spark(k, cx, cy, r, lvl) { k.fill(k.P().star(cx, cy, r, r * 0.34, 4), lvl, { deco: true }); }

export const OBJECTS = {
  folder(k) {
    k.grad(k.P().M(14, 20).L(38, 20).C(42, 20, 44, 22, 46, 25).L(49, 30).L(86, 30).C(89, 30, 91, 32, 91, 35).L(91, 84).L(9, 84).L(9, 25).C(9, 22, 11, 20, 14, 20).Z(),
      g2('m', 'd'), 20, 20, 80, 84);
    k.fill(k.P().rrect(17, 24, 62, 46, 4), 's');
    rows(k, 25, 34, [38, 30, 44], 8, 'm', 3);
    k.grad(k.P().M(11, 44).L(89, 44).C(92, 44, 94, 46, 93.5, 49).L(90, 85).C(89.6, 88, 88, 90, 85, 90).L(15, 90).C(12, 90, 10.4, 88, 10, 85).L(6.5, 49).C(6, 46, 8, 44, 11, 44).Z(),
      g2('d', 'a'), 10, 44, 90, 90);
    shine(k, k.P().M(12, 48).L(88, 48));
    k.fill(k.P().rrect(16, 76, 22, 6, 3), 'w', { alpha: 0.4, deco: true });
  },
  team(k) {
    for (const x of [24, 76]) {
      k.fill(k.P().circle(x, 40, 10), 'm');
      k.fill(k.P().M(x - 19, 82).C(x - 19, 64, x - 10, 56, x, 56).C(x + 10, 56, x + 19, 64, x + 19, 82).Z(), 'm');
    }
    k.grad(k.P().M(26, 92).C(26, 68, 37, 58, 50, 58).C(63, 58, 74, 68, 74, 92).Z(), g2('d', 'a'), 30, 58, 70, 92);
    k.grad(k.P().circle(50, 36, 14), g2('d', 'a'), 38, 22, 62, 50);
    k.fill(k.P().circle(45, 31, 4.5), 'w', { alpha: 0.45, deco: true });
    k.fill(k.P().circle(80, 76, 9), 's');
    k.line(k.P().M(75.5, 76).L(79, 79.5).L(85, 72.5), 'd', 3, { deco: true });
  },
  plus(k) {
    k.grad(k.P().rrect(14, 14, 72, 72, 22), g2('m', 'd'), 14, 14, 86, 86);
    k.fill(k.P().rrect(44, 28, 12, 44, 6), 's');
    k.fill(k.P().rrect(28, 44, 44, 12, 6), 's');
    shine(k, k.P().M(26, 20).L(60, 20));
    spark(k, 88, 14, 7, 'a');
    spark(k, 10, 84, 5, 'a');
  },
  phone(k) {
    k.grad(k.P().rrect(27, 5, 46, 90, 11), g2('d', 'a'), 27, 5, 73, 95);
    k.fill(k.P().rrect(73, 22, 2.4, 12, 1.2), 'm');
    k.fill(k.P().rrect(31.5, 12, 37, 76, 7), 's');
    k.fill(k.P().rrect(44, 15, 12, 3.6, 1.8), 'm');
    const tl = ['d', 'a', 'm', 'a', 'm', 'd', 'm', 'd', 'a'];
    for (let i = 0; i < 9; i++) k.fill(k.P().rrect(36 + (i % 3) * 10.6, 26 + Math.floor(i / 3) * 11.5, 8, 8, 2.6), tl[i]);
    k.fill(k.P().rrect(36, 62, 29, 14, 3.5), 'm', { alpha: 0.8 });
    k.fill(k.P().rrect(42, 82.5, 16, 2.4, 1.2), 'm');
    shine(k, k.P().M(30, 18).L(30, 60));
  },
  shield(k) {
    const sh = (p) => p.M(50, 7).C(62, 14, 74, 17, 87, 17).L(87, 45).C(87, 70, 71, 86, 50, 94).C(29, 86, 13, 70, 13, 45).L(13, 17).C(26, 17, 38, 14, 50, 7).Z();
    k.grad(sh(k.P()), g2('m', 'd'), 13, 10, 87, 94);
    k.grad(k.P().M(50, 7).C(62, 14, 74, 17, 87, 17).L(87, 45).C(87, 70, 71, 86, 50, 94).Z(), g2('d', 'a'), 50, 10, 87, 94, { alpha: 0.85 });
    k.line(k.P().M(33, 50).L(45, 62).L(68, 37), 's', 8);
    shine(k, k.P().M(18, 22).C(30, 21, 40, 18, 48, 13));
  },
  pulse(k) {
    k.grad(k.P().circle(50, 50, 42), g2('m', 'd'), 12, 10, 88, 92);
    k.fill(k.P().circle(50, 50, 31), 's');
    k.line(k.P().M(22, 52).L(36, 52).L(43, 34).L(52, 68).L(58, 44).L(63, 52).L(78, 52), 'd', 5.5);
    k.fill(k.P().circle(78, 52, 5), 'a');
    shine(k, k.P().arc(50, 50, 38, Math.PI * 1.05, Math.PI * 1.45, true));
  },
  slides(k) {
    k.line(k.P().M(50, 66).L(50, 90), 'm', 5);
    k.line(k.P().M(50, 72).L(33, 95), 'm', 5);
    k.line(k.P().M(50, 72).L(67, 95), 'm', 5);
    k.grad(k.P().rrect(6, 8, 88, 62, 8), g2('m', 'd'), 6, 8, 94, 70);
    k.fill(k.P().rrect(11, 13, 78, 52, 4.5), 's');
    const bars = [[20, 22, 'd'], [34, 34, 'a'], [48, 16, 'm'], [62, 40, 'd']];
    for (const [x, hh, lvl] of bars) k.fill(k.P().rrect(x, 58 - hh, 10, hh, 3), lvl);
    k.line(k.P().smooth([[19, 38], [34, 28], [50, 40], [70, 18]]), 'a', 2.6, { deco: true });
    k.fill(k.P().circle(50, 6, 4), 'd');
  },
  rocket(k) {
    k.grad(k.P().M(40, 70).C(40, 82, 45, 90, 50, 99).C(55, 90, 60, 82, 60, 70).Z(), g2('a', 'd'), 50, 70, 50, 99);
    k.fill(k.P().M(31, 48).L(15, 68).L(17, 80).L(33, 70).Z(), 'd');
    k.fill(k.P().M(69, 48).L(85, 68).L(83, 80).L(67, 70).Z(), 'd');
    k.grad(k.P().M(50, 4).C(67, 17, 73, 38, 70, 64).L(30, 64).C(27, 38, 33, 17, 50, 4).Z(), g2('s', 'm'), 30, 20, 70, 64);
    k.fill(k.P().M(50, 4).C(67, 17, 73, 38, 70, 64).L(56, 64).C(58, 38, 57, 17, 50, 4).Z(), 'm', { alpha: 0.7 });
    k.fill(k.P().circle(50, 33, 10), 'd');
    k.fill(k.P().circle(50, 33, 6), 'a');
    k.fill(k.P().rrect(37, 62, 26, 8, 3), 'd');
    k.fill(k.P().circle(46.5, 29.5, 2.2), 'w', { alpha: 0.7, deco: true });
  },
  devices(k) {
    k.grad(k.P().rrect(6, 10, 64, 82, 9), g2('m', 'd'), 6, 10, 70, 92);
    k.fill(k.P().rrect(11, 17, 54, 68, 4.5), 's');
    k.fill(k.P().rrect(16, 23, 44, 13, 3), 'm');
    rows(k, 16, 44, [30, 40, 24], 7, 'm', 3);
    k.grad(k.P().rrect(56, 34, 38, 62, 8), g2('d', 'a'), 56, 34, 94, 96);
    k.fill(k.P().rrect(59.5, 39.5, 31, 51, 5), 's');
    k.fill(k.P().rrect(64, 45, 22, 12, 3), 'a', { alpha: 0.85 });
    rows(k, 64, 64, [20, 14, 18], 6.5, 'm', 2.6);
    shine(k, k.P().M(10, 22).L(10, 52));
  },
  globe(k) {
    k.grad(k.P().circle(44, 48, 39), g2('m', 'd'), 8, 10, 82, 88);
    k.line(k.P().ellipse(44, 48, 16, 39), 's', 3);
    k.line(k.P().M(5, 48).L(83, 48), 's', 3);
    k.line(k.P().M(11, 29).C(30, 36, 58, 36, 77, 29), 's', 3, { deco: true });
    k.line(k.P().M(11, 67).C(30, 60, 58, 60, 77, 67), 's', 3, { deco: true });
    k.fill(k.P().M(62, 56).L(93, 68).L(79, 73).L(88, 88).L(81, 92).L(72, 77).L(63, 86).Z(), 'a');
    k.line(k.P().M(62, 56).L(93, 68).L(79, 73).L(88, 88).L(81, 92).L(72, 77).L(63, 86).Z(), 's', 2.4);
    shine(k, k.P().arc(44, 48, 34, Math.PI * 1.08, Math.PI * 1.42, true));
  },
  code(k) {
    k.grad(k.P().rrect(6, 12, 88, 76, 11), g2('m', 'd'), 6, 12, 94, 88);
    for (const [x, lvl] of [[17, 's'], [25, 's'], [33, 's']]) k.fill(k.P().circle(x, 22, 3.2), lvl);
    k.fill(k.P().rrect(12, 30, 76, 52, 6), 's');
    k.line(k.P().M(34, 45).L(23, 56).L(34, 67), 'd', 6.5);
    k.line(k.P().M(66, 45).L(77, 56).L(66, 67), 'd', 6.5);
    k.line(k.P().M(55, 40).L(45, 72), 'a', 6);
  },
  cube(k) {
    k.fill(k.P().M(50, 9).L(89, 30).L(50, 51).L(11, 30).Z(), 's');
    k.grad(k.P().M(11, 30).L(50, 51).L(50, 93).L(11, 72).Z(), g2('m', 'd'), 11, 30, 50, 93);
    k.grad(k.P().M(89, 30).L(50, 51).L(50, 93).L(89, 72).Z(), g2('d', 'a'), 50, 30, 89, 93);
    shine(k, k.P().M(13, 30).L(50, 11).L(87, 30));
    k.line(k.P().M(50, 52).L(50, 91), 'w', 1.6, { alpha: 0.35, deco: true });
    k.fill(k.P().circle(88, 86, 7), 'a');
  },
  palette(k) {
    k.grad(k.P().M(52, 8).C(79, 8, 95, 27, 95, 48).C(95, 63, 85, 67, 76, 65).C(67, 63, 61, 67, 63, 76).C(65, 86, 57, 94, 45, 94).C(23, 94, 6, 75, 6, 52).C(6, 27, 25, 8, 52, 8).Z()
      .circle(36, 74, 7), g2('m', 'd'), 6, 8, 95, 94, { rule: 'evenodd' });
    for (const [x, y, rr, lvl] of [[27, 38, 8, 's'], [47, 25, 7.5, 'a'], [70, 32, 7, 's'], [22, 58, 6.5, 'a']]) k.fill(k.P().circle(x, y, rr), lvl);
    k.line(k.P().M(60, 90).L(92, 50), 'd', 7);
    k.line(k.P().M(89, 54).L(96, 45), 'a', 9);
    shine(k, k.P().M(30, 16).C(38, 12, 46, 11, 54, 11));
  },
  monitor(k) {
    k.fill(k.P().M(42, 70).L(58, 70).L(62, 85).L(38, 85).Z(), 'm');
    k.fill(k.P().rrect(27, 84, 46, 7, 3.5), 'd');
    k.grad(k.P().rrect(5, 10, 90, 62, 9), g2('m', 'd'), 5, 10, 95, 72);
    k.fill(k.P().rrect(10, 15, 80, 50, 4.5), 's');
    k.fill(k.P().rrect(17, 22, 42, 28, 4), 'd');
    k.fill(k.P().rrect(17, 22, 42, 7, 3), 'a');
    rows(k, 64, 28, [18, 12, 16, 10], 6.5, 'm', 3);
    shine(k, k.P().M(9, 20).L(9, 44));
  },
  chart(k) {
    k.fill(k.P().rrect(6, 8, 88, 84, 13), 'm', { alpha: 0.55 });
    const b = [[16, 30, 'm'], [33, 46, 'd'], [50, 36, 'a'], [67, 60, 'd']];
    for (const [x, hh, lvl] of b) k.fill(k.P().rrect(x, 82 - hh, 13, hh, 4.5), lvl);
    k.line(k.P().smooth([[22, 46], [39, 32], [56, 40], [74, 16]]), 's', 3.2);
    for (const [x, y] of [[22, 46], [39, 32], [56, 40], [74, 16]]) k.fill(k.P().circle(x, y, 3.6), 's');
  },
  bell(k) {
    k.fill(k.P().circle(50, 10, 5.5), 'm');
    k.grad(k.P().M(50, 12).C(68, 12, 78, 26, 78, 46).L(78, 62).L(88, 74).L(12, 74).L(22, 62).L(22, 46).C(22, 26, 32, 12, 50, 12).Z(), g2('m', 'd'), 20, 12, 82, 74);
    k.fill(k.P().rrect(9, 71, 82, 9, 4.5), 'd');
    k.fill(k.P().circle(50, 86, 8.5), 'a');
    k.line(k.P().arc(50, 44, 44, -0.5, 0.15, true), 'm', 3, { deco: true });
    shine(k, k.P().M(30, 52).C(30, 36, 34, 26, 42, 21));
  },
  receipt(k) {
    const tk = (p, d) => p.M(18 + d, 8 + d).L(82 + d, 8 + d).L(82 + d, 90 + d).L(74 + d, 84 + d).L(66 + d, 90 + d).L(58 + d, 84 + d).L(50 + d, 90 + d).L(42 + d, 84 + d).L(34 + d, 90 + d).L(26 + d, 84 + d).L(18 + d, 90 + d).Z();
    k.grad(tk(k.P(), 6), g2('m', 'd'), 24, 14, 88, 96);
    k.fill(tk(k.P(), 0), 's');
    rows(k, 28, 24, [36, 26, 40, 30], 10, 'm', 4);
    k.fill(k.P().rrect(28, 64, 30, 10, 3.5), 'd');
    k.fill(k.P().circle(74, 72, 13), 'a');
    k.line(k.P().M(68, 72).L(72.5, 76.5).L(80.5, 67.5), 's', 3.6);
  },
  coins(k) {
    for (let i = 0; i < 3; i++) {
      const y = 74 - i * 15;
      k.fill(k.P().ellipse(44, y + 9, 33, 10).rect(11, y, 66, 9), 'd');
      k.grad(k.P().ellipse(44, y, 33, 10), g2('m', 'd'), 11, y - 10, 77, y + 10);
      k.fill(k.P().ellipse(44, y, 23, 6.5), 's');
    }
    k.grad(k.P().circle(76, 34, 19), g2('a', 'd'), 57, 15, 95, 53);
    k.line(k.P().circle(76, 34, 13), 's', 3);
    k.fill(k.P().star(76, 34, 7, 3, 5), 's');
  },
  clock(k) {
    k.grad(k.P().circle(50, 50, 43), g2('m', 'd'), 7, 7, 93, 93);
    k.fill(k.P().circle(50, 50, 34), 's');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, r0 = i % 3 ? 28 : 25;
      k.line(k.P().M(50 + Math.cos(a) * r0, 50 + Math.sin(a) * r0).L(50 + Math.cos(a) * 31, 50 + Math.sin(a) * 31), 'm', i % 3 ? 2 : 3, { deco: true });
    }
    k.line(k.P().M(50, 50).L(50, 27), 'd', 6);
    k.line(k.P().M(50, 50).L(66, 59), 'a', 5);
    k.fill(k.P().circle(50, 50, 4.5), 'd');
  },
  pencil(k) {
    k.fill(k.P().rrect(8, 8, 58, 72, 7), 's');
    rows(k, 17, 22, [36, 28, 38, 22], 9, 'm', 3.4);
    k.grad(k.P().M(22, 70).L(66, 26).L(80, 40).L(36, 84).Z(), g2('d', 'a'), 22, 26, 80, 84);
    k.fill(k.P().M(66, 26).L(73, 19).L(87, 33).L(80, 40).Z(), 'm');
    k.fill(k.P().M(73, 19).C(77, 15, 83, 15, 87, 19).C(91, 23, 91, 29, 87, 33).Z(), 'a');
    k.fill(k.P().M(22, 70).L(36, 84).L(13, 93).Z(), 's');
    k.fill(k.P().M(16.5, 88).L(13, 93).L(18.5, 91.2).Z(), 'd');
    shine(k, k.P().M(26, 70).L(66, 30));
  },
  database(k) {
    for (let i = 2; i >= 0; i--) {
      const y = 24 + i * 24;
      k.grad(k.P().ellipse(50, y + 18, 36, 11).rect(14, y, 72, 18), g2('m', 'd'), 14, y, 86, y + 29);
      k.fill(k.P().ellipse(50, y, 36, 11), i ? 'm' : 's');
      k.fill(k.P().circle(74, y + 13, 3), 'a', { deco: true });
    }
    k.fill(k.P().ellipse(50, 24, 26, 7), 'm', { alpha: 0.5 });
  },
  cloud(k) {
    k.grad(k.P().M(25, 74).C(11, 74, 5, 56, 17, 48).C(15, 31, 33, 22, 44, 30).C(50, 15, 75, 15, 79, 34).C(94, 34, 98, 56, 87, 65).C(84, 71, 80, 74, 74, 74).Z(), g2('m', 'd'), 10, 18, 92, 74);
    k.line(k.P().arc(50, 52, 12, Math.PI * 1.1, Math.PI * 1.95, true), 's', 4.5);
    k.line(k.P().arc(50, 52, 12, Math.PI * 0.1, Math.PI * 0.95, true), 's', 4.5);
    k.fill(k.P().M(61, 43).L(63.5, 51).L(55.5, 49).Z(), 's');
    k.fill(k.P().M(39, 61).L(36.5, 53).L(44.5, 55).Z(), 's');
    shine(k, k.P().M(22, 50).C(22, 40, 30, 34, 38, 35));
  },
  lock(k) {
    k.line(k.P().M(31, 46).L(31, 34).C(31, 22, 40, 13, 50, 13).C(60, 13, 69, 22, 69, 34).L(69, 46), 'm', 10);
    k.grad(k.P().rrect(17, 42, 66, 50, 13), g2('d', 'a'), 17, 42, 83, 92);
    k.fill(k.P().circle(50, 62, 7.5).rrect(46.8, 64, 6.4, 15, 3.2), 's');
    shine(k, k.P().M(23, 50).L(48, 50));
  },
  mail(k) {
    k.fill(k.P().rrect(20, 8, 60, 44, 6), 's');
    rows(k, 28, 18, [34, 26, 40], 8, 'm', 3);
    k.grad(k.P().rrect(7, 26, 86, 60, 11), g2('m', 'd'), 7, 26, 93, 86);
    k.fill(k.P().M(9, 31).L(50, 62).L(91, 31).L(91, 36).L(50, 68).L(9, 36).Z(), 'd');
    k.line(k.P().M(12, 82).L(40, 58), 'w', 2.4, { alpha: 0.4, deco: true });
    k.fill(k.P().circle(84, 26, 9), 'a');
  },
  star(k) {
    k.grad(k.P().star(48, 54, 42, 18, 5), g2('d', 'a'), 10, 14, 90, 94);
    k.fill(k.P().star(48, 54, 24, 10.5, 5), 'm', { alpha: 0.55 });
    spark(k, 88, 14, 8, 'a');
    spark(k, 14, 12, 5, 'm');
  },
  chat(k) {
    k.grad(k.P().rrect(5, 10, 64, 46, 15).M(18, 54).L(14, 68).L(32, 55).Z(), g2('m', 'd'), 5, 10, 69, 68);
    for (const x of [24, 37, 50]) k.fill(k.P().circle(x, 33, 4.2), 's');
    k.grad(k.P().rrect(38, 44, 56, 38, 13).M(80, 80).L(86, 93).L(70, 82).Z(), g2('d', 'a'), 38, 44, 94, 93);
    rows(k, 48, 57, [34, 24], 10, 's', 3.6);
  },
  sparkle(k) {
    k.grad(k.P().star(44, 54, 38, 9, 4), g2('d', 'a'), 6, 16, 82, 92);
    k.fill(k.P().star(44, 54, 16, 4.5, 4), 's', { alpha: 0.6 });
    k.grad(k.P().star(80, 22, 15, 4, 4), g2('a', 'd'), 65, 7, 95, 37);
    spark(k, 84, 74, 7, 'm');
  },
  crown(k) {
    k.grad(k.P().M(10, 72).L(16, 28).L(35, 49).L(50, 17).L(65, 49).L(84, 28).L(90, 72).Z(), g2('a', 'd'), 10, 17, 90, 72);
    k.fill(k.P().rrect(10, 74, 80, 13, 5), 'd');
    for (const [x, y, rr] of [[16, 26, 5], [50, 15, 6], [84, 26, 5]]) k.fill(k.P().circle(x, y, rr), 'm');
    for (const x of [30, 50, 70]) k.fill(k.P().circle(x, 80.5, 3.2), 's');
    shine(k, k.P().M(19, 66).L(81, 66));
  },
  plane(k) {
    k.grad(k.P().M(6, 46).L(94, 10).L(68, 90).L(48, 60).Z(), g2('m', 'd'), 6, 10, 94, 90);
    k.fill(k.P().M(48, 60).L(94, 10).L(40, 82).Z(), 'a');
    k.fill(k.P().M(48, 60).L(94, 10).L(68, 90).Z(), 'd', { alpha: 0.75 });
    k.line(k.P().M(4, 76).C(14, 70, 22, 74, 30, 66), 'm', 2.6, { deco: true });
  },
};

// ---------- Choix de l'objet d'après le sens de la carte ----------
export const OBJECT_NAMES = Object.keys(OBJECTS);
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const RULES = [
  [/(invitation|e-?mail|courriel|message)/, 'mail'],
  [/(dossier|projet|folder)/, 'folder'],
  [/(equipe|membre|utilisateur|personne|team|groupe|espace)/, 'team'],
  [/(nouveau|nouvelle|creer|ajouter)/, 'plus'],
  [/(application|\bapps?\b|android|apk|app builder|installation)/, 'phone'],
  [/(surveill|supervision|disponib|moniteur|uptime|incident|plantage|sans plantage)/, 'pulse'],
  [/(securit|audit|scan|protection|risque)/, 'shield'],
  [/(presentation|diapo|slide)/, 'slides'],
  [/(responsive|appareil|device)/, 'devices'],
  [/(dev lab|code|terminal|\bgit\b|depot)/, 'code'],
  [/(studio|3d|motion|scene|animation)/, 'cube'],
  [/(nex-design|design|planche|maquette|document)/, 'palette'],
  [/(desktop|logiciel|windows|installateur)/, 'monitor'],
  [/(a encaisser|en attente|echeance|en retard)/, 'clock'],
  [/(facture|invoice|recu)/, 'receipt'],
  [/(encaiss|revenu|mrr|chiffre d|paiement|payee?s?\b|montant)/, 'coins'],
  [/(attente|echeance|retard|a encaisser|heure|temps|delai|duree|latence|reponse)/, 'clock'],
  [/(brouillon|draft|redaction)/, 'pencil'],
  [/(stockage|fichier|storage|octet)/, 'database'],
  [/(notification|alerte|rappel|annonce)/, 'bell'],
  [/(offre|abonnement|\bplan\b|\bpro\b|standard)/, 'star'],
  [/(supabase|cloud|synchro|serveur)/, 'cloud'],
  [/(support|ticket|aide|discussion)/, 'chat'],
  [/(\bia\b|assistant|intelligence)/, 'sparkle'],
  [/(browser|navigat|\bsite|\bweb\b|page)/, 'globe'],
  [/(bonjour|accueil|bienvenue|demarr)/, 'rocket'],
  [/(cle\b|connexion|mot de passe|session|verrou)/, 'lock'],
  [/(statistique|ouverture|graphique|courbe|tendance)/, 'chart'],
];
// Icônes de NEXORA (composant Kpi du back office) vers objets.
const ICON_OBJECTS = {
  user: 'team', group: 'team', users: 'team', laptop: 'devices', layers: 'folder', folder: 'folder', folderOpen: 'folder',
  pdf: 'receipt', check: 'coins', clock: 'clock', pencil: 'pencil', sync: 'pulse', shield: 'shield', chat: 'chat',
  star: 'star', cloud: 'cloud', bell: 'bell', mail: 'mail', download: 'database', globe: 'globe', code: 'code',
  phone: 'phone', android: 'phone', cube: 'cube', palette: 'palette', image: 'palette', warn: 'shield', lock: 'lock',
  sparkle: 'sparkle', chart: 'chart', grid: 'chart', bolt: 'pulse', wrench: 'code', plus: 'plus', send: 'plane',
};
export const SPACE_OBJECTS = { preview: 'devices', browser: 'globe', dev: 'code', android: 'phone', studio: 'cube', design: 'palette', security: 'shield', desktop: 'monitor' };

export function objectFor(...texts) {
  for (const t of texts) {
    if (!t) continue;
    if (OBJECTS[t]) return t;
    if (ICON_OBJECTS[t]) return ICON_OBJECTS[t];
    const s = norm(t);
    for (const [re, name] of RULES) if (re.test(s)) return name;
  }
  return 'chart';
}
export const DEFAULT_DOWN = DOWN;
