package app.vitrine.shell;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.google.firebase.analytics.FirebaseAnalytics;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Iterator;

/**
 * NEXORA #115 : mesure d'audience par Google Analytics pour Firebase (SDK officiel, firebase-analytics), exposée à
 * la page sous window.VitrineAnalytics puis NexoraApp.analytics (bridge.js) : événements, écrans, identifiant et
 * propriétés de l'utilisateur. Le projet Firebase vient du fichier google-services.json importé dans l'App Builder.
 */
public final class VtAnalytics {
    private final FirebaseAnalytics fa;
    private boolean autoScreens = true;

    private VtAnalytics(Activity a) {
        fa = FirebaseAnalytics.getInstance(a.getApplicationContext());
    }

    /** Appelé par MainActivity (réflexion) avant le premier chargement de page. */
    public static void attach(Activity a, WebView w, String config) {
        JSONObject cfg = null;
        try { cfg = new JSONObject(config); } catch (Exception ignored) { /* réglages par défaut */ }
        VtAnalytics x = new VtAnalytics(a);
        x.fa.setAnalyticsCollectionEnabled(cfg == null || cfg.optBoolean("collect", true));
        x.autoScreens = cfg == null || cfg.optBoolean("autoScreens", true);
        w.addJavascriptInterface(x, "VitrineAnalytics");
    }

    /** Paramètres d'un événement : nombres, textes, booléens (convertis en 0/1) et listes d'articles (items). */
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
                else if (v instanceof JSONArray) {
                    JSONArray arr = (JSONArray) v;
                    Bundle[] items = new Bundle[arr.length()];
                    for (int i = 0; i < arr.length(); i++) items[i] = bundle(String.valueOf(arr.opt(i)));
                    b.putParcelableArray(k, items);
                } else if (v instanceof JSONObject) b.putBundle(k, bundle(v.toString()));
                else if (v != null && v != JSONObject.NULL) b.putString(k, String.valueOf(v));
            }
        } catch (Exception ignored) { /* paramètres illisibles : événement sans paramètre */ }
        return b;
    }

    // ------------------------------------------------------------ fonctions appelées par la page
    /** Écrans suivis automatiquement par bridge.js (chaque page et chaque changement d'adresse). */
    @JavascriptInterface
    public boolean autoScreens() { return autoScreens; }

    @JavascriptInterface
    public void logEvent(String name, String params) { if (name != null && !name.isEmpty()) fa.logEvent(name, bundle(params)); }

    @JavascriptInterface
    public void screen(String name, String cls) {
        Bundle b = new Bundle();
        b.putString(FirebaseAnalytics.Param.SCREEN_NAME, name == null ? "" : name);
        b.putString(FirebaseAnalytics.Param.SCREEN_CLASS, cls == null || cls.isEmpty() ? "Page" : cls);
        fa.logEvent(FirebaseAnalytics.Event.SCREEN_VIEW, b);
    }

    @JavascriptInterface
    public void setUserId(String id) { fa.setUserId(id == null || id.isEmpty() ? null : id); }

    @JavascriptInterface
    public void setUserProperty(String name, String value) { if (name != null && !name.isEmpty()) fa.setUserProperty(name, value == null || value.isEmpty() ? null : value); }

    @JavascriptInterface
    public void setEnabled(boolean on) { fa.setAnalyticsCollectionEnabled(on); }

    @JavascriptInterface
    public void reset() { fa.resetAnalyticsData(); }
}
