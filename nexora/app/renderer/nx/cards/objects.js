// NEXORA #037, redessinés au #038 : objets illustrés des cartes (dossier, équipe, téléphone, bouclier…).
// Style : un objet net, d'une seule teinte (celle de la carte), en relief doux : corps en dégradé de la
// teinte moyenne (m) à la teinte vive (d), surfaces claires (s), reflets blancs (w) et ombres (k) en
// transparence, aucune seconde couleur ni étincelle. Repère de 100 × 100 ; illu.js mesure l'objet, le
// place sans jamais toucher un texte et le met à l'échelle de la carte.
// k : P() nouveau tracé ; fill(tracé, teinte, options) ; line(tracé, teinte, épaisseur, options) ;
// body(tracé, x0, y0, x1, y1) corps en dégradé ; grad(tracé, arrêts, x1, y1, x2, y2). Options : alpha, deco, rule.

const hi = (k, p) => k.line(p, 'w', 2.2, { alpha: 0.42, deco: true });
const rows = (k, x, y, ws, gap, lvl, sw) => ws.forEach((w, i) => k.line(k.P().M(x, y + i * gap).L(x + w, y + i * gap), lvl, sw, { deco: true }));

export const OBJECTS = {
  folder(k) {
    k.fill(k.P().M(13, 22).L(36, 22).C(40, 22, 42, 24, 44, 27).L(47, 31).L(84, 31).C(87, 31, 89, 33, 89, 36).L(89, 80).L(11, 80).L(11, 24).C(11, 23, 12, 22, 13, 22).Z(), 'm');
    k.fill(k.P().rrect(19, 26, 58, 40, 4), 's');
    rows(k, 27, 35, [33, 25], 8, 'm', 3);
    k.body(k.P().M(12, 42).L(88, 42).C(91, 42, 93, 44, 92.6, 47).L(89.5, 82).C(89.2, 85, 87.5, 87, 84.5, 87).L(15.5, 87).C(12.5, 87, 10.8, 85, 10.5, 82).L(7.4, 47).C(7, 44, 9, 42, 12, 42).Z(), 8, 42, 92, 87);
    hi(k, k.P().M(13, 46.5).L(87, 46.5));
  },
  team(k) {
    for (const x of [24, 76]) {
      k.fill(k.P().circle(x, 41, 9), 'm');
      k.fill(k.P().M(x - 17, 82).C(x - 17, 65, x - 9, 58, x, 58).C(x + 9, 58, x + 17, 65, x + 17, 82).Z(), 'm');
    }
    k.body(k.P().M(27, 92).C(27, 70, 37, 61, 50, 61).C(63, 61, 73, 70, 73, 92).Z(), 27, 61, 73, 92);
    k.body(k.P().circle(50, 38, 14), 36, 24, 64, 52);
    k.fill(k.P().circle(45, 33, 4), 'w', { alpha: 0.4, deco: true });
  },
  plus(k) {
    k.body(k.P().rrect(12, 12, 76, 76, 23), 12, 12, 88, 88);
    k.fill(k.P().rrect(44, 28, 12, 44, 6), 's');
    k.fill(k.P().rrect(28, 44, 44, 12, 6), 's');
    hi(k, k.P().M(27, 19).L(60, 19));
  },
  phone(k) {
    k.body(k.P().rrect(28, 4, 44, 92, 11), 28, 4, 72, 96);
    k.fill(k.P().rrect(72, 24, 2.4, 11, 1.2), 'm');
    k.fill(k.P().rrect(32.5, 11, 35, 78, 7), 's');
    k.fill(k.P().rrect(44, 14.5, 12, 3.6, 1.8), 'm');
    for (let i = 0; i < 9; i++) k.fill(k.P().rrect(37 + (i % 3) * 10.3, 25 + Math.floor(i / 3) * 10.8, 7.6, 7.6, 2.4), i === 0 || i === 5 ? 'd' : 'm');
    k.fill(k.P().rrect(37, 59.5, 26, 15, 3.5), 'm', { alpha: 0.75 });
    k.fill(k.P().rrect(43, 83, 14, 2.4, 1.2), 'm');
    hi(k, k.P().M(31, 18).L(31, 58));
  },
  shield(k) {
    k.body(k.P().M(50, 7).C(62, 14, 74, 17, 87, 17).L(87, 45).C(87, 70, 71, 86, 50, 94).C(29, 86, 13, 70, 13, 45).L(13, 17).C(26, 17, 38, 14, 50, 7).Z(), 13, 7, 87, 94);
    k.fill(k.P().M(50, 7).C(62, 14, 74, 17, 87, 17).L(87, 45).C(87, 70, 71, 86, 50, 94).Z(), 'k', { alpha: 0.1 });
    k.line(k.P().M(33, 50).L(45, 62).L(68, 37), 's', 8);
    hi(k, k.P().M(19, 22).C(30, 21, 40, 18, 48, 13));
  },
  pulse(k) {
    k.body(k.P().circle(50, 50, 42), 8, 8, 92, 92);
    k.fill(k.P().circle(50, 50, 31), 's');
    k.line(k.P().M(22, 52).L(36, 52).L(43, 35).L(52, 67).L(58, 45).L(63, 52).L(77, 52), 'd', 5.5);
    hi(k, k.P().arc(50, 50, 38, Math.PI * 1.05, Math.PI * 1.42, true));
  },
  slides(k) {
    k.line(k.P().M(50, 68).L(50, 92), 'm', 5);
    k.line(k.P().M(50, 74).L(35, 95), 'm', 5);
    k.line(k.P().M(50, 74).L(65, 95), 'm', 5);
    k.body(k.P().rrect(6, 8, 88, 62, 9), 6, 8, 94, 70);
    k.fill(k.P().rrect(11, 13, 78, 52, 5), 's');
    for (const [x, hh, lvl] of [[21, 20, 'm'], [35, 32, 'd'], [49, 16, 'm'], [63, 38, 'd']]) k.fill(k.P().rrect(x, 58 - hh, 10, hh, 3), lvl);
    hi(k, k.P().M(11, 10.5).L(48, 10.5));
  },
  rocket(k) {
    k.grad(k.P().M(40, 70).C(40, 82, 45, 90, 50, 98).C(55, 90, 60, 82, 60, 70).Z(), [['m', 0, 1], ['d', 1, 1]], 50, 70, 50, 98);
    k.fill(k.P().M(31, 48).L(16, 68).L(18, 79).L(33, 70).Z(), 'd');
    k.fill(k.P().M(69, 48).L(84, 68).L(82, 79).L(67, 70).Z(), 'd');
    k.fill(k.P().M(50, 4).C(67, 17, 73, 38, 70, 64).L(30, 64).C(27, 38, 33, 17, 50, 4).Z(), 's');
    k.fill(k.P().M(50, 4).C(67, 17, 73, 38, 70, 64).L(55, 64).C(58, 38, 57, 17, 50, 4).Z(), 'm', { alpha: 0.6 });
    k.fill(k.P().circle(50, 33, 10), 'd');
    k.fill(k.P().circle(50, 33, 6), 'm');
    k.fill(k.P().rrect(37, 62, 26, 8, 3), 'd');
    k.fill(k.P().circle(46.5, 29.5, 2.2), 'w', { alpha: 0.65, deco: true });
  },
  devices(k) {
    k.body(k.P().rrect(6, 10, 64, 80, 9), 6, 10, 70, 90);
    k.fill(k.P().rrect(11, 17, 54, 66, 4.5), 's');
    k.fill(k.P().rrect(16, 23, 44, 13, 3), 'm');
    rows(k, 16, 44, [30, 40, 22], 7, 'm', 3);
    k.body(k.P().rrect(56, 33, 38, 62, 8), 56, 33, 94, 95);
    k.fill(k.P().rrect(59.5, 38.5, 31, 51, 5), 's');
    k.fill(k.P().rrect(64, 44, 22, 12, 3), 'd', { alpha: 0.85 });
    rows(k, 64, 63, [20, 14, 18], 6.5, 'm', 2.6);
  },
  globe(k) {
    k.body(k.P().circle(46, 48, 39), 7, 9, 85, 87);
    k.line(k.P().ellipse(46, 48, 16, 39), 's', 3);
    k.line(k.P().M(7, 48).L(85, 48), 's', 3);
    k.line(k.P().M(13, 29).C(32, 36, 60, 36, 79, 29), 's', 3, { deco: true });
    k.line(k.P().M(13, 67).C(32, 60, 60, 60, 79, 67), 's', 3, { deco: true });
    const cur = () => k.P().M(62, 56).L(93, 68).L(79, 73).L(88, 88).L(81, 92).L(72, 77).L(63, 86).Z();
    k.fill(cur(), 's');
    k.line(cur(), 'd', 2.6);
  },
  code(k) {
    k.body(k.P().rrect(6, 12, 88, 76, 12), 6, 12, 94, 88);
    for (const x of [17, 25, 33]) k.fill(k.P().circle(x, 22, 3.2), 's');
    k.fill(k.P().rrect(12, 30, 76, 52, 6), 's');
    k.line(k.P().M(34, 45).L(23, 56).L(34, 67), 'd', 6.5);
    k.line(k.P().M(66, 45).L(77, 56).L(66, 67), 'd', 6.5);
    k.line(k.P().M(55, 41).L(45, 71), 'm', 6);
  },
  cube(k) {
    k.fill(k.P().M(50, 8).L(90, 30).L(50, 52).L(10, 30).Z(), 's');
    k.fill(k.P().M(10, 30).L(50, 52).L(50, 94).L(10, 72).Z(), 'm');
    k.fill(k.P().M(90, 30).L(50, 52).L(50, 94).L(90, 72).Z(), 'd');
    hi(k, k.P().M(12, 30).L(50, 10).L(88, 30));
  },
  palette(k) {
    k.body(k.P().M(52, 8).C(79, 8, 95, 27, 95, 48).C(95, 63, 85, 67, 76, 65).C(67, 63, 61, 67, 63, 76).C(65, 86, 57, 94, 45, 94).C(23, 94, 6, 75, 6, 52).C(6, 27, 25, 8, 52, 8).Z()
      .circle(35, 74, 7), 6, 8, 95, 94, { rule: 'evenodd' });
    for (const [x, y, rr, lvl] of [[27, 40, 7.5, 's'], [46, 26, 7, 'm'], [69, 33, 7, 's'], [22, 59, 6.5, 'm']]) k.fill(k.P().circle(x, y, rr), lvl);
    k.line(k.P().M(61, 90).L(91, 52), 'd', 7);
    k.line(k.P().M(88, 56).L(95, 47), 's', 8);
  },
  monitor(k) {
    k.fill(k.P().M(42, 70).L(58, 70).L(62, 85).L(38, 85).Z(), 'm');
    k.fill(k.P().rrect(27, 84, 46, 7, 3.5), 'd');
    k.body(k.P().rrect(5, 10, 90, 62, 9), 5, 10, 95, 72);
    k.fill(k.P().rrect(10, 15, 80, 50, 4.5), 's');
    k.fill(k.P().rrect(17, 22, 42, 28, 4), 'd');
    k.fill(k.P().rrect(17, 22, 42, 7, 3), 'm');
    rows(k, 65, 28, [17, 11, 15, 9], 6.5, 'm', 3);
  },
  chart(k) {
    k.fill(k.P().rrect(6, 8, 88, 84, 14), 's');
    for (const [x, hh, lvl] of [[17, 28, 'm'], [34, 44, 'd'], [51, 34, 'm'], [68, 58, 'd']]) k.fill(k.P().rrect(x, 82 - hh, 13, hh, 4.5), lvl);
    k.line(k.P().smooth([[23, 44], [40, 30], [57, 38], [75, 16]]), 'd', 3);
    for (const [x, y] of [[23, 44], [40, 30], [57, 38], [75, 16]]) k.fill(k.P().circle(x, y, 3.6), 'd');
  },
  bell(k) {
    k.fill(k.P().circle(50, 10, 5.5), 'm');
    k.body(k.P().M(50, 12).C(68, 12, 78, 26, 78, 46).L(78, 62).L(88, 74).L(12, 74).L(22, 62).L(22, 46).C(22, 26, 32, 12, 50, 12).Z(), 12, 12, 88, 74);
    k.fill(k.P().rrect(9, 71, 82, 9, 4.5), 'd');
    k.fill(k.P().circle(50, 86, 8.5), 'm');
    hi(k, k.P().M(30, 52).C(30, 36, 34, 26, 42, 21));
  },
  receipt(k) {
    const tk = (p, d) => p.M(18 + d, 8 + d).L(82 + d, 8 + d).L(82 + d, 90 + d).L(74 + d, 84 + d).L(66 + d, 90 + d).L(58 + d, 84 + d).L(50 + d, 90 + d).L(42 + d, 84 + d).L(34 + d, 90 + d).L(26 + d, 84 + d).L(18 + d, 90 + d).Z();
    k.body(tk(k.P(), 6), 24, 14, 88, 96);
    k.fill(tk(k.P(), 0), 's');
    rows(k, 28, 24, [36, 26, 40, 30], 10, 'm', 4);
    k.fill(k.P().rrect(28, 64, 30, 10, 3.5), 'd');
    k.fill(k.P().circle(73, 71, 12), 'd');
    k.line(k.P().M(67.5, 71).L(71.8, 75.3).L(79, 67), 's', 3.6);
  },
  coins(k) {
    for (let i = 0; i < 3; i++) {
      const y = 74 - i * 15;
      k.fill(k.P().ellipse(44, y + 9, 33, 10).rect(11, y, 66, 9), 'd');
      k.fill(k.P().ellipse(44, y, 33, 10), 'm');
      k.fill(k.P().ellipse(44, y, 23, 6.5), 's');
    }
    k.body(k.P().circle(76, 34, 19), 57, 15, 95, 53);
    k.line(k.P().circle(76, 34, 13), 's', 3);
    k.fill(k.P().star(76, 34, 7, 3, 5), 's');
  },
  clock(k) {
    k.body(k.P().circle(50, 50, 43), 7, 7, 93, 93);
    k.fill(k.P().circle(50, 50, 34), 's');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, r0 = i % 3 ? 28 : 25;
      k.line(k.P().M(50 + Math.cos(a) * r0, 50 + Math.sin(a) * r0).L(50 + Math.cos(a) * 31, 50 + Math.sin(a) * 31), 'm', i % 3 ? 2 : 3, { deco: true });
    }
    k.line(k.P().M(50, 50).L(50, 28), 'd', 6);
    k.line(k.P().M(50, 50).L(65, 58), 'd', 5);
    k.fill(k.P().circle(50, 50, 4.5), 'd');
  },
  pencil(k) {
    k.fill(k.P().rrect(8, 8, 58, 72, 7), 's');
    rows(k, 17, 22, [36, 28, 38, 22], 9, 'm', 3.4);
    k.body(k.P().M(22, 70).L(66, 26).L(80, 40).L(36, 84).Z(), 22, 26, 80, 84);
    k.fill(k.P().M(66, 26).L(73, 19).L(87, 33).L(80, 40).Z(), 'm');
    k.fill(k.P().M(73, 19).C(77, 15, 83, 15, 87, 19).C(91, 23, 91, 29, 87, 33).Z(), 'd');
    k.fill(k.P().M(22, 70).L(36, 84).L(13, 93).Z(), 's');
    k.fill(k.P().M(16.5, 88).L(13, 93).L(18.5, 91.2).Z(), 'd');
    hi(k, k.P().M(26, 70).L(66, 30));
  },
  database(k) {
    for (let i = 2; i >= 0; i--) {
      const y = 24 + i * 24;
      k.body(k.P().ellipse(50, y + 18, 36, 11).rect(14, y, 72, 18), 14, y, 86, y + 29);
      k.fill(k.P().ellipse(50, y, 36, 11), i ? 'm' : 's');
    }
    k.fill(k.P().ellipse(50, 24, 25, 6.5), 'm', { alpha: 0.5 });
  },
  cloud(k) {
    k.body(k.P().M(25, 74).C(11, 74, 5, 56, 17, 48).C(15, 31, 33, 22, 44, 30).C(50, 15, 75, 15, 79, 34).C(94, 34, 98, 56, 87, 65).C(84, 71, 80, 74, 74, 74).Z(), 8, 18, 94, 74);
    k.line(k.P().arc(50, 52, 12, Math.PI * 1.1, Math.PI * 1.95, true), 's', 4.5);
    k.line(k.P().arc(50, 52, 12, Math.PI * 0.1, Math.PI * 0.95, true), 's', 4.5);
    k.fill(k.P().M(61, 43).L(63.5, 51).L(55.5, 49).Z(), 's');
    k.fill(k.P().M(39, 61).L(36.5, 53).L(44.5, 55).Z(), 's');
  },
  lock(k) {
    k.line(k.P().M(31, 46).L(31, 34).C(31, 22, 40, 13, 50, 13).C(60, 13, 69, 22, 69, 34).L(69, 46), 'm', 10);
    k.body(k.P().rrect(17, 42, 66, 50, 13), 17, 42, 83, 92);
    k.fill(k.P().circle(50, 62, 7.5).rrect(46.8, 64, 6.4, 15, 3.2), 's');
    hi(k, k.P().M(24, 49).L(48, 49));
  },
  mail(k) {
    k.fill(k.P().rrect(20, 8, 60, 44, 6), 's');
    rows(k, 28, 18, [34, 26], 8, 'm', 3);
    k.body(k.P().rrect(7, 26, 86, 60, 11), 7, 26, 93, 86);
    k.fill(k.P().M(9, 31).L(50, 62).L(91, 31).L(91, 37).L(50, 68).L(9, 37).Z(), 'm');
  },
  star(k) {
    k.body(k.P().star(50, 54, 44, 19, 5), 6, 10, 94, 94);
    k.fill(k.P().star(50, 54, 24, 10.5, 5), 'w', { alpha: 0.22 });
  },
  chat(k) {
    k.fill(k.P().rrect(5, 10, 64, 46, 15).M(18, 54).L(14, 68).L(32, 55).Z(), 'm');
    for (const x of [24, 37, 50]) k.fill(k.P().circle(x, 33, 4.2), 's');
    k.body(k.P().rrect(36, 42, 58, 40, 14).M(80, 80).L(86, 93).L(70, 82).Z(), 36, 42, 94, 93);
    rows(k, 47, 56, [36, 24], 10, 's', 3.6);
  },
  sparkle(k) {
    k.body(k.P().star(44, 54, 40, 9.5, 4), 4, 14, 84, 94);
    k.fill(k.P().star(80, 22, 15, 4, 4), 'm');
    k.fill(k.P().star(84, 76, 8, 2.4, 4), 'm');
  },
  crown(k) {
    k.body(k.P().M(10, 72).L(16, 28).L(35, 49).L(50, 17).L(65, 49).L(84, 28).L(90, 72).Z(), 10, 17, 90, 72);
    k.fill(k.P().rrect(10, 74, 80, 13, 5), 'd');
    for (const [x, y, rr] of [[16, 26, 5], [50, 15, 6], [84, 26, 5]]) k.fill(k.P().circle(x, y, rr), 'm');
    for (const x of [30, 50, 70]) k.fill(k.P().circle(x, 80.5, 3.2), 's');
  },
  plane(k) {
    k.body(k.P().M(6, 46).L(94, 10).L(68, 90).L(48, 60).Z(), 6, 10, 94, 90);
    k.fill(k.P().M(48, 60).L(94, 10).L(40, 82).Z(), 'm');
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
  [/(attente|echeance|retard|heure|temps|delai|duree|latence|reponse)/, 'clock'],
  [/(brouillon|draft|redaction)/, 'pencil'],
  [/(stockage|fichier|storage|octet)/, 'database'],
  [/(notification|alerte|rappel|annonce)/, 'bell'],
  [/(offre|abonnement|\bplan\b|\bpro\b|standard)/, 'star'],
  [/(cloud|synchro|serveur)/, 'cloud'],
  [/(support|ticket|aide|discussion)/, 'chat'],
  [/(\bia\b|assistant|intelligence)/, 'sparkle'],
  [/(browser|navigat|\bsite|\bweb\b|page)/, 'globe'],
  [/(bonjour|bonsoir|accueil|bienvenue|demarr)/, 'rocket'],
  [/(cle\b|connexion|mot de passe|session|verrou|suspendu)/, 'lock'],
  [/(statistique|ouverture|graphique|courbe|tendance|actifs)/, 'chart'],
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
