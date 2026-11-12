// NEXORA #019 : section « Achats intégrés » de l'App Builder. L'application construite avec l'option contient
// Google Play Billing (kit préparé une fois par src/android/billing.js) et expose NexoraApp.billing à la page :
// produits, achat, achats possédés, confirmation, consommation. Vérification d'un achat par l'API de la Play Console.
import { api, esc, toast, busy, $ } from '../core.js';
import { b as icon } from '../../dist/chunks/chunk-S4I2LXHS.js';

export const SECTION = ['billing', 'Achats intégrés', 'cart', 'Google Play Billing, produits, abonnements'];
const ID_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const PRODUCT_RE = /^[a-z0-9][a-z0-9._]{0,138}$/;
const TYPES = { inapp: 'Achat unique', consumable: 'Consommable', subs: 'Abonnement' };
const fmtSize = (n) => `${(Number(n || 0) / 1e6).toFixed(1).replace('.', ',')} Mo`;

function sample(products) {
  const one = products.find((p) => p.type !== 'subs') || { id: 'premium', type: 'inapp' };
  const sub = products.find((p) => p.type === 'subs');
  return `// NexoraApp.billing existe seulement dans l’application Android construite avec les achats intégrés.
const achats = window.NexoraApp && NexoraApp.billing;
if (achats && achats.available) {
  // 1. Prix affiché dans la monnaie du client (défini dans la Play Console)
  const [produit] = await achats.products(['${one.id}'], 'inapp');
  bouton.textContent = \`Débloquer — \${produit.price}\`;

  // 2. Achat (idClient : identifiant de votre client, haché, pour relier l’achat à son compte)
  bouton.onclick = async () => {
    try {
      const [achat] = await achats.buy('${one.id}', { accountId: idClient });
      // 3. Envoyez achat.purchaseToken à votre serveur : il vérifie auprès de Google, puis débloque.
      await fetch('/api/achat-android', { method: 'POST', body: JSON.stringify(achat) });
    } catch (e) { alert(e.message); } // « Achat annulé. », produit déjà possédé…
  };

  // 4. Au démarrage : achats déjà possédés (nouveau téléphone, réinstallation)
  const possedes = await achats.purchases('inapp');
${sub ? `
  // Abonnement : choisis l’offre (essai, prix de lancement) parmi produit.offers
  const [abo] = await achats.products(['${sub.id}'], 'subs');
  await achats.buy('${sub.id}', { type: 'subs', offerToken: abo.offers[0].offerToken });
` : ''}}`;
}

export function install(proto, SECTIONS) {
  const at = SECTIONS.findIndex((s) => s[0] === 'store');
  if (!SECTIONS.some((s) => s[0] === SECTION[0])) SECTIONS.splice(at < 0 ? SECTIONS.length : at + 1, 0, SECTION);

  const bil = (cfg) => {
    const b = cfg.billing || (cfg.billing = {});
    if (b.enabled == null) b.enabled = false;
    if (b.autoAcknowledge == null) b.autoAcknowledge = true;
    if (!Array.isArray(b.products)) b.products = [];
    if (!b.verify) b.verify = { productId: '', type: 'inapp', token: '' };
    return b;
  };

  proto.nxBillingStatus = function nxBillingStatus(force = false) {
    if (this.nxBil && !force) return;
    if (this.nxBilLoading) return;
    this.nxBilLoading = true;
    Promise.all([
      api.invoke('android:billing-status').catch(() => ({ installed: false })),
      this.playSt ? Promise.resolve(this.playSt) : api.invoke('android:play-status', this.cfg.appId).catch(() => ({ serviceAccount: false })),
    ]).then(([st, play]) => {
      this.nxBil = st; this.playSt = play; this.nxBilLoading = false;
      if (this.section === 'billing') this.renderForm();
    });
    if (!this.nxBilBound) {
      this.nxBilBound = true;
      api.on('android:progress', (p) => {
        if (!p || p.part !== 'billing') return;
        const el = $('[data-nxb-prog]', this.el);
        if (el) el.textContent = `${p.label || ''}${p.progress != null ? ` · ${Math.round(p.progress * 100)} %` : ''}`;
      });
    }
  };

  proto.form_billing = function formBilling(cfg) {
    const b = bil(cfg);
    this.nxBillingStatus();
    const st = this.nxBil || {};
    const play = this.playSt || {};
    const twa = cfg.engine === 'twa' && cfg.source.kind === 'url';
    const bad = b.products.filter((p) => p.id && !PRODUCT_RE.test(p.id));
    const kit = !this.nxBil ? '<span class="ab-hint"><span class="spinner small"></span> Vérification du kit…</span>'
      : st.installed ? `<span class="ab-okchip">${icon('check', 12)} Kit Google Play Billing ${esc(st.version || '')} prêt</span><small class="ab-hint">${st.artifacts || 0} bibliothèques, ${fmtSize(st.size)}</small>`
        : `<span class="ab-hint">Le kit (bibliothèque officielle de Google et ses dépendances, environ 9 Mo) est préparé une fois sur ce PC, automatiquement à la première construction.</span><button class="btn small" data-act="billing-install">${icon('download', 13)}<span>Préparer maintenant</span></button><small class="ab-hint" data-nxb-prog></small>`;
    let h = this.card('Achats intégrés avec Google Play', `
      <p class="ab-hint">Pour vendre dans l’application du <b>contenu numérique</b> (fonctions premium, crédits, abonnements, contenus à débloquer), Google Play impose son système de paiement. Les biens physiques et les services réels (commandes, réservations, livraisons) peuvent garder le paiement de votre site.</p>
      ${twa ? `<div class="ab-note">${icon('info', 15)}<span>Le mode Trusted Web Activity n’est pas pris en charge ici : choisissez le moteur NEX-WEBVIEW (section Source) pour les achats intégrés.</span></div>` : ''}
      <div class="ab-row">${kit}</div>
      ${this.tog('Activer les achats intégrés', 'billing.enabled', 'Ajoutez Google Play Billing à l’application (environ 3 Mo) et NexoraApp.billing à votre page.')}
      ${b.enabled ? this.tog('Confirmer les achats automatiquement', 'billing.autoAcknowledge', 'Google rembourse tout achat non confirmé sous 3 jours. Décochez si votre serveur vérifie puis confirme lui-même chaque achat (recommandé pour les abonnements).') : ''}`);
    if (!b.enabled) return h;
    h += this.card('Produits', `
      <p class="ab-hint">Créez d’abord chaque produit dans la Play Console (Monétiser › Produits) avec exactement le même identifiant. Un produit « Consommable » (crédits, pièces) est consommé après l’achat pour pouvoir être racheté.</p>
      <div class="nxb-products">${b.products.map((p, i) => `<div class="nxb-prod">
          <input class="input${p.id && !PRODUCT_RE.test(p.id) ? ' bad' : ''}" data-k="billing.products.${i}.id" value="${esc(p.id || '')}" placeholder="premium" spellcheck="false" aria-label="Identifiant du produit">
          <select class="input" data-k="billing.products.${i}.type" aria-label="Type">${Object.entries(TYPES).map(([v, l]) => `<option value="${v}" ${p.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <input class="input" data-k="billing.products.${i}.label" value="${esc(p.label || '')}" placeholder="Note (facultatif)" aria-label="Note">
          <button class="icon-btn" data-list-del="billing.products" data-i="${i}" title="Retirer">${icon('close', 13)}</button>
        </div>`).join('') || '<p class="ab-hint">Aucun produit pour l’instant.</p>'}</div>
      ${bad.length ? `<p class="ab-hint bad">Identifiant invalide : lettres minuscules, chiffres, points et tirets bas, en commençant par une lettre ou un chiffre (${bad.map((p) => esc(p.id)).join(', ')}).</p>` : ''}
      <div class="ab-row"><button class="btn small" data-act="billing-add">${icon('plus', 13)}<span>Ajouter un produit</span></button><button class="btn small" data-act="billing-read" ${play.serviceAccount && ID_RE.test(cfg.appId || '') ? '' : 'disabled'} title="${play.serviceAccount ? 'Lire les produits créés dans la Play Console' : 'Importez d’abord la clé du compte de service (section Publication Play Store)'}">${icon('download', 13)}<span>Lire les produits de la Play Console</span></button><button class="btn small" data-external="https://play.google.com/console">${icon('external', 13)}<span>Play Console</span></button></div>`);
    const code = sample(b.products.filter((p) => p.id));
    h += this.card('Dans votre page', `
      <p class="ab-hint">L’application ajoute <code>NexoraApp.billing</code> à votre page. Chaque achat renvoie un jeton (<code>purchaseToken</code>) : votre serveur le vérifie auprès de Google (API Google Play Developer, <code>purchases.products.get</code> ou <code>purchases.subscriptionsv2.get</code>) avant de livrer. Un achat payé pendant que l’application était fermée est finalisé à l’ouverture suivante, et <code>onPurchase</code> vous prévient.</p>
      <pre class="nxb-code">${esc(code)}</pre>
      <div class="ab-row"><button class="btn small" data-copy="${esc(code)}">${icon('copy', 13)}<span>Copier le code</span></button></div>`);
    const v = b.verify;
    h += this.card('Vérifier un achat', `
      <p class="ab-hint">Contrôlez un achat signalé par un client, ou votre propre achat de test, avec la clé du compte de service de la publication.</p>
      <div class="ab-grid2">${this.field('Identifiant du produit', 'billing.verify.productId', { placeholder: (b.products[0] && b.products[0].id) || 'premium' })}${this.field('Type', 'billing.verify.type', { type: 'select', options: { inapp: 'Achat unique ou consommable', subs: 'Abonnement' } })}</div>
      ${this.field('Jeton d’achat (purchaseToken)', 'billing.verify.token', { type: 'textarea', rows: 2, placeholder: 'Reçu par votre page après l’achat' })}
      <div class="ab-row"><button class="btn small primary" data-act="billing-verify" ${play.serviceAccount ? '' : 'disabled'}>${icon('pass', 13)}<span>Vérifier auprès de Google</span></button>${play.serviceAccount ? '' : `<button class="btn small" data-sec="store">${icon('key', 13)}<span>Ajouter la clé d’accès</span></button>`}</div>
      <div data-nxb-verify></div>`);
    h += this.card('Tester les achats', `<ol class="ab-psteps">
      <li class="ab-pstep"><i>1</i><div><b>Créer les produits</b><p>Play Console › Monétiser › Produits : achats uniques ou abonnements, actifs, avec les identifiants ci-dessus.</p></div></li>
      <li class="ab-pstep"><i>2</i><div><b>Ajouter des testeurs de licence</b><p>Play Console › Paramètres › Test de licence : leurs achats sont gratuits (cartes de test).</p></div></li>
      <li class="ab-pstep"><i>3</i><div><b>Publier en test interne</b><p>Construisez l’AAB et envoyez-le sur la piste « Test interne » (section Publication Play Store), puis installez l’application depuis le lien de test : une application installée par câble USB répond « Achats indisponibles ».</p></div></li>
    </ol>`);
    return h;
  };

  proto.act_billing_install = async function act() {
    const n = busy('Préparation du kit Google Play Billing…');
    try {
      this.nxBil = await api.invoke('android:billing-install');
      toast('Kit d’achats intégrés prêt.');
      this.renderForm();
    } finally { n.close(); }
  };
  proto.act_billing_add = async function act() {
    const b = bil(this.cfg);
    this.set('billing.products', [...b.products, { id: '', type: 'inapp', label: '' }], { rerender: true });
  };
  proto.act_billing_read = async function act() {
    const n = busy('Lecture des produits de la Play Console…');
    try {
      const list = await api.invoke('android:billing-products', { appId: this.cfg.appId });
      const b = bil(this.cfg);
      const have = new Set(b.products.map((p) => p.id));
      const added = list.filter((p) => !have.has(p.productId)).map((p) => ({ id: p.productId, type: p.type === 'subs' ? 'subs' : 'inapp', label: p.title || '' }));
      this.set('billing.products', [...b.products.filter((p) => p.id), ...added], { rerender: true });
      toast(list.length ? `${list.length} produit(s) dans la Play Console, ${added.length} ajouté(s) ici.${list.some((p) => p.status !== 'active') ? ' Certains ne sont pas actifs.' : ''}` : 'Aucun produit dans la Play Console pour cette application.');
    } finally { n.close(); }
  };
  proto.act_billing_verify = async function act() {
    const v = bil(this.cfg).verify;
    const out = $('[data-nxb-verify]', this.el);
    if (!v.productId || !v.token) throw new Error('Indiquez l’identifiant du produit et le jeton d’achat.');
    const n = busy('Vérification auprès de Google…');
    try {
      const r = await api.invoke('android:billing-verify', { appId: this.cfg.appId, productId: v.productId.trim(), token: v.token.trim(), type: v.type });
      const label = { PURCHASED: 'Payé', CANCELED: 'Annulé', PENDING: 'En attente de paiement', SUBSCRIPTION_STATE_ACTIVE: 'Abonnement actif', SUBSCRIPTION_STATE_CANCELED: 'Abonnement résilié (actif jusqu’à l’échéance)', SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'Période de grâce', SUBSCRIPTION_STATE_ON_HOLD: 'Suspendu (paiement refusé)', SUBSCRIPTION_STATE_PAUSED: 'En pause', SUBSCRIPTION_STATE_EXPIRED: 'Expiré', SUBSCRIPTION_STATE_PENDING: 'En attente de paiement' }[r.state] || r.state;
      if (out) out.innerHTML = `<ul class="nxa-ready nxb-result">
        <li class="${/PURCHASED|ACTIVE|GRACE/.test(r.state) ? 'ok' : ''}">${icon(/PURCHASED|ACTIVE|GRACE/.test(r.state) ? 'pass' : 'warn', 14)}<span>État : <b>${esc(label)}</b></span></li>
        <li class="${r.acknowledged ? 'ok' : ''}">${icon(r.acknowledged ? 'pass' : 'warn', 14)}<span>${r.acknowledged ? 'Confirmé' : 'Pas encore confirmé (remboursé automatiquement après 3 jours)'}</span></li>
        ${r.type === 'inapp' ? `<li class="ok">${icon('info', 14)}<span>${r.consumed ? 'Consommé' : 'Non consommé'}</span></li>` : `<li class="ok">${icon('info', 14)}<span>Échéance : ${r.expiry ? esc(new Date(r.expiry).toLocaleString('fr-FR')) : '—'}</span></li>`}
        <li class="ok">${icon('info', 14)}<span>${r.test ? 'Achat de test' : 'Achat réel'}${r.orderId ? ` · commande ${esc(r.orderId)}` : ''}</span></li></ul>`;
    } finally { n.close(); }
  };

  // Construction : réglages des achats dans la configuration de l'application.
  const spec0 = proto.spec;
  proto.spec = async function spec() {
    const s = await spec0.call(this);
    const b = this.cfg.billing;
    if (b && b.enabled) s.billing = { enabled: true, autoAcknowledge: b.autoAcknowledge !== false, consumables: (b.products || []).filter((p) => p.type === 'consumable' && p.id).map((p) => p.id.trim()) };
    return s;
  };
  const validate0 = proto.validate;
  proto.validate = function validate() {
    const out = validate0.call(this) || [];
    const b = this.cfg.billing;
    if (b && b.enabled) {
      if (this.cfg.engine === 'twa' && this.cfg.source.kind === 'url') out.push(['billing', 'Achats intégrés : choisissez le moteur NEX-WEBVIEW (section Source), le mode Trusted Web Activity n’est pas pris en charge.']);
      const badIds = (b.products || []).filter((p) => p.id && !PRODUCT_RE.test(p.id.trim()));
      if (badIds.length) out.push(['billing', `Achats intégrés : identifiant de produit invalide (${badIds.map((p) => p.id).join(', ')}).`]);
    }
    return out;
  };
}
