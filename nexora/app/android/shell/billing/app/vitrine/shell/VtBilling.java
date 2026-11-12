package app.vitrine.shell;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * NEXORA #019 : achats intégrés avec Google Play Billing (bibliothèque officielle de Google), exposés à la page
 * sous window.VitrineBilling puis NexoraApp.billing (bridge.js). Ajouté à l'application par le kit d'achats
 * de l'App Builder ; MainActivity l'attache par réflexion quand l'option est cochée.
 * Les résultats reviennent par window.__vitrineResolve(id, ok, valeur), comme les autres fonctions natives.
 */
public final class VtBilling {
    private final Activity act;
    private final WebView web;
    private final BillingClient client;
    private final boolean autoAck;
    private final Set<String> consumables = new HashSet<>();
    private final Map<String, ProductDetails> details = new HashMap<>();
    private final List<Runnable> waiting = new ArrayList<>();
    private String buyId;
    private boolean connecting;

    private VtBilling(Activity a, WebView w, JSONObject cfg) {
        act = a;
        web = w;
        autoAck = cfg == null || cfg.optBoolean("autoAcknowledge", true);
        JSONArray c = cfg != null ? cfg.optJSONArray("consumables") : null;
        if (c != null) for (int i = 0; i < c.length(); i++) consumables.add(c.optString(i));
        client = BillingClient.newBuilder(a.getApplicationContext())
            .setListener(this::onPurchasesUpdated)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection()
            .build();
    }

    /** Appelé par MainActivity (réflexion) avant le premier chargement de page. */
    public static void attach(Activity a, WebView w, String config) {
        JSONObject cfg = null;
        try { cfg = new JSONObject(config); } catch (Exception ignored) { /* réglages par défaut */ }
        VtBilling b = new VtBilling(a, w, cfg);
        w.addJavascriptInterface(b, "VitrineBilling");
        b.ensure(() -> b.syncPurchases(null));
    }

    // ------------------------------------------------------------ connexion au service de Google Play
    private void ensure(Runnable then) {
        if (client.isReady()) { then.run(); return; }
        synchronized (waiting) {
            waiting.add(then);
            if (connecting) return;
            connecting = true;
        }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult r) {
                List<Runnable> run;
                synchronized (waiting) { connecting = false; run = new ArrayList<>(waiting); waiting.clear(); }
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) for (Runnable x : run) x.run();
                else failAll(run, r);
            }

            @Override
            public void onBillingServiceDisconnected() {
                synchronized (waiting) { connecting = false; }
            }
        });
    }

    private void failAll(List<Runnable> run, BillingResult r) {
        lastSetupError = message(r);
        for (Runnable x : run) x.run();
    }

    private String lastSetupError;

    private boolean notReady(String id) {
        if (client.isReady()) return false;
        reject(id, lastSetupError != null ? lastSetupError : "Google Play n'est pas disponible sur ce téléphone.");
        return true;
    }

    // ------------------------------------------------------------ fonctions appelées par la page
    @JavascriptInterface
    public void connect(String id) {
        ensure(() -> { if (!notReady(id)) resolve(id, "true"); });
    }

    /** ids : tableau JSON d'identifiants ; type : « inapp » ou « subs ». */
    @JavascriptInterface
    public void products(String ids, String type, String id) {
        ensure(() -> {
            if (notReady(id)) return;
            try {
                JSONArray a = new JSONArray(ids);
                List<QueryProductDetailsParams.Product> list = new ArrayList<>();
                for (int i = 0; i < a.length(); i++) {
                    list.add(QueryProductDetailsParams.Product.newBuilder().setProductId(a.getString(i)).setProductType(productType(type)).build());
                }
                if (list.isEmpty()) { resolve(id, "[]"); return; }
                client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(list).build(), (r, res) -> {
                    if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) { reject(id, message(r)); return; }
                    JSONArray out = new JSONArray();
                    for (ProductDetails d : res.getProductDetailsList()) {
                        details.put(d.getProductId(), d);
                        out.put(productJson(d));
                    }
                    resolve(id, out.toString());
                });
            } catch (Exception e) {
                reject(id, "Liste de produits invalide : " + e.getMessage());
            }
        });
    }

    /** Lance l'achat ; offerToken : offre d'abonnement (sinon la première) ; account : identifiant chiffré du compte sur le site. */
    @JavascriptInterface
    public void buy(String productId, String type, String offerToken, String account, String id) {
        ensure(() -> {
            if (notReady(id)) return;
            ProductDetails d = details.get(productId);
            if (d == null) {
                // Produit pas encore chargé : on le lit, puis on relance l'achat.
                List<QueryProductDetailsParams.Product> one = new ArrayList<>();
                one.add(QueryProductDetailsParams.Product.newBuilder().setProductId(productId).setProductType(productType(type)).build());
                client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(one).build(), (r, res) -> {
                    if (r.getResponseCode() != BillingClient.BillingResponseCode.OK || res.getProductDetailsList().isEmpty()) {
                        reject(id, r.getResponseCode() == BillingClient.BillingResponseCode.OK ? "Produit introuvable sur Google Play : « " + productId + " » (vérifiez qu'il est actif dans la Play Console)." : message(r));
                        return;
                    }
                    details.put(productId, res.getProductDetailsList().get(0));
                    act.runOnUiThread(() -> launch(res.getProductDetailsList().get(0), offerToken, account, id));
                });
                return;
            }
            act.runOnUiThread(() -> launch(d, offerToken, account, id));
        });
    }

    private void launch(ProductDetails d, String offerToken, String account, String id) {
        BillingFlowParams.ProductDetailsParams.Builder p = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(d);
        String token = offerToken;
        if ((token == null || token.isEmpty()) && d.getSubscriptionOfferDetails() != null && !d.getSubscriptionOfferDetails().isEmpty()) token = d.getSubscriptionOfferDetails().get(0).getOfferToken();
        if ((token == null || token.isEmpty()) && d.getOneTimePurchaseOfferDetails() != null) token = d.getOneTimePurchaseOfferDetails().getOfferToken();
        if (token != null && !token.isEmpty()) p.setOfferToken(token);
        List<BillingFlowParams.ProductDetailsParams> list = new ArrayList<>();
        list.add(p.build());
        BillingFlowParams.Builder f = BillingFlowParams.newBuilder().setProductDetailsParamsList(list);
        if (account != null && !account.isEmpty()) f.setObfuscatedAccountId(account.length() > 64 ? account.substring(0, 64) : account);
        if (buyId != null) reject(buyId, "Achat remplacé par un nouvel achat.");
        buyId = id;
        BillingResult r = client.launchBillingFlow(act, f.build());
        if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) { buyId = null; reject(id, message(r)); }
    }

    @JavascriptInterface
    public void purchases(String type, String id) {
        ensure(() -> {
            if (notReady(id)) return;
            client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(productType(type)).build(), (r, list) -> {
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) { reject(id, message(r)); return; }
                resolve(id, purchasesJson(list).toString());
            });
        });
    }

    @JavascriptInterface
    public void acknowledge(String token, String id) {
        ensure(() -> {
            if (notReady(id)) return;
            client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build(), r -> {
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) resolve(id, "true");
                else reject(id, message(r));
            });
        });
    }

    @JavascriptInterface
    public void consume(String token, String id) {
        ensure(() -> {
            if (notReady(id)) return;
            client.consumeAsync(ConsumeParams.newBuilder().setPurchaseToken(token).build(), (r, t) -> {
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) resolve(id, "true");
                else reject(id, message(r));
            });
        });
    }

    // ------------------------------------------------------------ résultats d'achat
    private void onPurchasesUpdated(BillingResult r, List<Purchase> list) {
        String id = buyId;
        buyId = null;
        int code = r.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && list != null) {
            for (Purchase p : list) finish(p);
            JSONArray out = purchasesJson(list);
            if (id != null) resolve(id, out.toString());
            event("purchase", out);
        } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            if (id != null) reject(id, "Achat annulé.");
        } else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            if (id != null) reject(id, "Vous possédez déjà ce produit.");
            syncPurchases(null);
        } else if (id != null) {
            reject(id, message(r));
        }
    }

    /** Achat payé : produit consommable consommé (rachetable), sinon confirmé, si l'option est cochée. */
    private void finish(Purchase p) {
        if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) return;
        boolean consumable = false;
        for (String pid : p.getProducts()) if (consumables.contains(pid)) consumable = true;
        if (consumable) {
            client.consumeAsync(ConsumeParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build(), (r, t) -> { });
        } else if (autoAck && !p.isAcknowledged()) {
            client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build(), r -> { });
        }
    }

    /** Au démarrage : les achats payés pendant que l'application était fermée (achats en attente) sont finalisés. */
    private void syncPurchases(String id) {
        if (!client.isReady()) return;
        for (String type : new String[]{BillingClient.ProductType.INAPP, BillingClient.ProductType.SUBS}) {
            client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(type).build(), (r, list) -> {
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK || list == null) return;
                for (Purchase p : list) if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED && !p.isAcknowledged()) finish(p);
            });
        }
    }

    // ------------------------------------------------------------ conversions
    private static String productType(String t) {
        return "subs".equals(t) ? BillingClient.ProductType.SUBS : BillingClient.ProductType.INAPP;
    }

    private static JSONObject productJson(ProductDetails d) {
        JSONObject o = new JSONObject();
        try {
            o.put("productId", d.getProductId());
            o.put("type", BillingClient.ProductType.SUBS.equals(d.getProductType()) ? "subs" : "inapp");
            o.put("title", d.getTitle());
            o.put("name", d.getName());
            o.put("description", d.getDescription());
            ProductDetails.OneTimePurchaseOfferDetails one = d.getOneTimePurchaseOfferDetails();
            if (one != null) {
                o.put("price", one.getFormattedPrice());
                o.put("priceMicros", one.getPriceAmountMicros());
                o.put("currency", one.getPriceCurrencyCode());
            }
            List<ProductDetails.SubscriptionOfferDetails> subs = d.getSubscriptionOfferDetails();
            if (subs != null) {
                JSONArray offers = new JSONArray();
                for (ProductDetails.SubscriptionOfferDetails s : subs) {
                    JSONObject of = new JSONObject();
                    of.put("offerToken", s.getOfferToken());
                    of.put("basePlanId", s.getBasePlanId());
                    of.put("offerId", s.getOfferId());
                    JSONArray phases = new JSONArray();
                    for (ProductDetails.PricingPhase ph : s.getPricingPhases().getPricingPhaseList()) {
                        JSONObject p = new JSONObject();
                        p.put("price", ph.getFormattedPrice());
                        p.put("priceMicros", ph.getPriceAmountMicros());
                        p.put("currency", ph.getPriceCurrencyCode());
                        p.put("period", ph.getBillingPeriod());
                        p.put("cycles", ph.getBillingCycleCount());
                        phases.put(p);
                    }
                    of.put("phases", phases);
                    offers.put(of);
                }
                o.put("offers", offers);
                if (subs.size() > 0 && !s0(subs).isEmpty()) o.put("price", s0(subs));
            }
        } catch (Exception ignored) {
            // champ facultatif
        }
        return o;
    }

    /** Prix de la dernière phase (le prix « normal ») de la première offre d'abonnement. */
    private static String s0(List<ProductDetails.SubscriptionOfferDetails> subs) {
        List<ProductDetails.PricingPhase> ph = subs.get(0).getPricingPhases().getPricingPhaseList();
        return ph.isEmpty() ? "" : ph.get(ph.size() - 1).getFormattedPrice();
    }

    private static JSONArray purchasesJson(List<Purchase> list) {
        JSONArray out = new JSONArray();
        if (list == null) return out;
        for (Purchase p : list) {
            try {
                JSONObject o = new JSONObject();
                o.put("orderId", p.getOrderId());
                o.put("products", new JSONArray(p.getProducts()));
                o.put("purchaseToken", p.getPurchaseToken());
                o.put("purchaseTime", p.getPurchaseTime());
                o.put("quantity", p.getQuantity());
                o.put("state", p.getPurchaseState() == Purchase.PurchaseState.PURCHASED ? "purchased" : p.getPurchaseState() == Purchase.PurchaseState.PENDING ? "pending" : "unknown");
                o.put("acknowledged", p.isAcknowledged());
                o.put("autoRenewing", p.isAutoRenewing());
                out.put(o);
            } catch (Exception ignored) {
                // achat illisible
            }
        }
        return out;
    }

    private static String message(BillingResult r) {
        switch (r.getResponseCode()) {
            case BillingClient.BillingResponseCode.BILLING_UNAVAILABLE: return "Achats indisponibles : ouvrez le Play Store avec un compte Google sur ce téléphone, ou installez l'application depuis Google Play (piste de test).";
            case BillingClient.BillingResponseCode.ITEM_UNAVAILABLE: return "Produit indisponible : vérifiez qu'il est actif dans la Play Console et que l'application vient de Google Play.";
            case BillingClient.BillingResponseCode.DEVELOPER_ERROR: return "Configuration refusée par Google Play (identifiant de produit, offre ou signature de l'application) : " + r.getDebugMessage();
            case BillingClient.BillingResponseCode.NETWORK_ERROR:
            case BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE: return "Pas de connexion à Google Play : réessayez.";
            case BillingClient.BillingResponseCode.ITEM_NOT_OWNED: return "Ce produit n'est pas possédé.";
            default: return "Google Play a répondu par l'erreur " + r.getResponseCode() + (r.getDebugMessage() != null && !r.getDebugMessage().isEmpty() ? " : " + r.getDebugMessage() : ".");
        }
    }

    // ------------------------------------------------------------ retour vers la page
    private void resolve(String id, String json) { send("window.__vitrineResolve && window.__vitrineResolve(" + JSONObject.quote(id) + ", true, " + json + ")"); }

    private void reject(String id, String msg) { send("window.__vitrineResolve && window.__vitrineResolve(" + JSONObject.quote(id) + ", false, new Error(" + JSONObject.quote(msg) + "))"); }

    private void event(String type, JSONArray data) {
        send("window.dispatchEvent(new CustomEvent('nexora-billing', { detail: { type: " + JSONObject.quote(type) + ", purchases: " + data + " } }))");
    }

    private void send(String js) {
        act.runOnUiThread(() -> { try { web.evaluateJavascript(js, null); } catch (Throwable ignored) { /* page fermée */ } });
    }
}
