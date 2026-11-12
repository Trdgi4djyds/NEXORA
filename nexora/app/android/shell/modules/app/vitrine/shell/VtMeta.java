package app.vitrine.shell;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.facebook.FacebookSdk;
import com.facebook.appevents.AppEventsLogger;

import org.json.JSONArray;
import org.json.JSONObject;

import java.math.BigDecimal;
import java.util.Currency;
import java.util.Iterator;

/**
 * NEXORA #115 : événements d'application Meta (SDK officiel Facebook, facebook-core : App Events) pour mesurer les
 * campagnes Facebook et Instagram, exposés à la page sous window.VitrineMeta puis NexoraApp.meta (bridge.js).
 * Identifiant de l'application et jeton client dans le manifeste (ressources écrites par l'App Builder).
 */
public final class VtMeta {
    private final AppEventsLogger logger;

    private VtMeta(Activity a) {
        logger = AppEventsLogger.newLogger(a.getApplicationContext());
    }

    /** Appelé par MainActivity (réflexion) avant le premier chargement de page. */
    public static void attach(Activity a, WebView w, String config) {
        JSONObject cfg = null;
        try { cfg = new JSONObject(config); } catch (Exception ignored) { /* réglages par défaut */ }
        boolean auto = cfg == null || cfg.optBoolean("autoEvents", true);
        FacebookSdk.setAutoLogAppEventsEnabled(auto);
        FacebookSdk.setAdvertiserIDCollectionEnabled(cfg == null || cfg.optBoolean("advertiserId", true));
        if (!FacebookSdk.isInitialized()) FacebookSdk.sdkInitialize(a.getApplicationContext());
        if (auto) AppEventsLogger.activateApp(a.getApplication());
        w.addJavascriptInterface(new VtMeta(a), "VitrineMeta");
    }

    /** Paramètres d'un événement : nombres, textes et booléens (convertis en 0/1). */
    static Bundle bundle(String json) {
        Bundle b = new Bundle();
        if (json == null || json.isEmpty()) return b;
        try {
            JSONObject o = new JSONObject(json);
            Iterator<String> it = o.keys();
            while (it.hasNext()) {
                String k = it.next();
                Object v = o.opt(k);
                if (v instanceof Integer || v instanceof Long) b.putLong(k, ((Number) v).longValue());
                else if (v instanceof Number) b.putDouble(k, ((Number) v).doubleValue());
                else if (v instanceof Boolean) b.putLong(k, ((Boolean) v) ? 1 : 0);
                else if (v instanceof JSONArray || v instanceof JSONObject) b.putString(k, v.toString());
                else if (v != null && v != JSONObject.NULL) b.putString(k, String.valueOf(v));
            }
        } catch (Exception ignored) { /* paramètres illisibles : événement sans paramètre */ }
        return b;
    }

    // ------------------------------------------------------------ fonctions appelées par la page
    @JavascriptInterface
    public void logEvent(String name, String params, double valueToSum) {
        if (name == null || name.isEmpty()) return;
        if (valueToSum != 0) logger.logEvent(name, valueToSum, bundle(params));
        else logger.logEvent(name, bundle(params));
    }

    @JavascriptInterface
    public void logPurchase(double amount, String currency, String params) {
        try {
            logger.logPurchase(BigDecimal.valueOf(amount), Currency.getInstance(currency == null || currency.isEmpty() ? "EUR" : currency.toUpperCase()), bundle(params));
        } catch (IllegalArgumentException e) {
            logger.logPurchase(BigDecimal.valueOf(amount), Currency.getInstance("EUR"), bundle(params));
        }
    }

    @JavascriptInterface
    public void setUserId(String id) {
        if (id == null || id.isEmpty()) AppEventsLogger.clearUserID();
        else AppEventsLogger.setUserID(id);
    }

    @JavascriptInterface
    public void flush() { logger.flush(); }
}
