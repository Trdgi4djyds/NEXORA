package app.vitrine.shell;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.onesignal.Continue;
import com.onesignal.OneSignal;
import com.onesignal.debug.LogLevel;
import com.onesignal.notifications.INotification;
import com.onesignal.notifications.INotificationClickEvent;
import com.onesignal.notifications.INotificationClickListener;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Iterator;

/**
 * NEXORA #114 : module OneSignal (SDK officiel de OneSignal, licence MIT). Notifications push envoyées depuis le
 * tableau de bord ou l'API de OneSignal, sans projet Firebase ni fichier google-services.json dans l'application.
 * Ajouté par le kit OneSignal de l'App Builder ; MainActivity l'attache par réflexion quand le module est activé.
 * Exposé à la page sous window.VitrineOneSignal puis NexoraApp.onesignal (bridge.js) ; les résultats reviennent par
 * window.__vitrineResolve(id, ok, valeur), les clics sur une notification par l'événement « nexora-onesignal ».
 */
public final class VtOneSignal {
    private final Activity act;
    private final WebView web;
    private final boolean openUrls;
    private static String pendingClick;

    private VtOneSignal(Activity a, WebView w, JSONObject cfg) {
        act = a;
        web = w;
        openUrls = cfg == null || cfg.optBoolean("openUrls", true);
    }

    /** Appelé par MainActivity (réflexion) avant le premier chargement de page. */
    public static void attach(Activity a, WebView w, String config) {
        JSONObject cfg = null;
        try { cfg = new JSONObject(config); } catch (Exception ignored) { /* réglages par défaut */ }
        if (cfg == null || cfg.optString("appId", "").isEmpty()) return;
        VtOneSignal o = new VtOneSignal(a, w, cfg);
        if (cfg.optBoolean("debug", false)) OneSignal.getDebug().setLogLevel(LogLevel.VERBOSE);
        // Consentement (RGPD) : rien n'est envoyé à OneSignal avant que la page appelle NexoraApp.onesignal.consent(true).
        if (cfg.optBoolean("consentRequired", false)) OneSignal.setConsentRequired(true);
        OneSignal.initWithContext(a.getApplicationContext(), cfg.optString("appId"));
        OneSignal.getNotifications().addClickListener(new INotificationClickListener() {
            @Override
            public void onClick(INotificationClickEvent event) { o.clicked(event.getNotification()); }
        });
        w.addJavascriptInterface(o, "VitrineOneSignal");
        JSONArray tags = cfg.optJSONArray("tags");
        if (tags != null) {
            for (int i = 0; i < tags.length(); i++) {
                JSONObject t = tags.optJSONObject(i);
                if (t != null && !t.optString("key").isEmpty()) OneSignal.getUser().addTag(t.optString("key"), t.optString("value"));
            }
        }
        if (cfg.optBoolean("ask", true) && !cfg.optBoolean("consentRequired", false)) {
            OneSignal.getNotifications().requestPermission(true, Continue.none());
        }
    }

    // ------------------------------------------------------------ clic sur une notification
    private void clicked(INotification n) {
        try {
            JSONObject d = new JSONObject();
            d.put("type", "click");
            d.put("id", n.getNotificationId());
            d.put("title", n.getTitle() == null ? "" : n.getTitle());
            d.put("body", n.getBody() == null ? "" : n.getBody());
            JSONObject extra = n.getAdditionalData();
            d.put("data", extra == null ? new JSONObject() : extra);
            String url = n.getLaunchURL();
            if ((url == null || url.isEmpty()) && extra != null) url = extra.optString("url", "");
            d.put("url", url == null ? "" : url);
            final String u = url;
            act.runOnUiThread(() -> {
                // Lien de la notification : ouvert dans l'application (OneSignal n'ouvre pas le navigateur, voir le manifeste).
                if (openUrls && u != null && u.startsWith("https://")) web.loadUrl(u);
            });
            pendingClick = d.toString();
            send("window.__vitrineOneSignalClick=" + d + ";window.dispatchEvent(new CustomEvent('nexora-onesignal', { detail: " + d + " }))");
        } catch (Exception ignored) { /* notification illisible */ }
    }

    // ------------------------------------------------------------ fonctions appelées par la page
    @JavascriptInterface
    public void login(String externalId, String id) {
        if (externalId == null || externalId.trim().isEmpty()) { reject(id, "Identifiant vide."); return; }
        OneSignal.login(externalId.trim());
        resolve(id, "true");
    }

    @JavascriptInterface
    public void logout(String id) {
        OneSignal.logout();
        resolve(id, "true");
    }

    @JavascriptInterface
    public void tags(String json, String id) {
        try {
            JSONObject t = new JSONObject(json);
            for (Iterator<String> it = t.keys(); it.hasNext();) {
                String k = it.next();
                Object v = t.opt(k);
                if (v == null || v == JSONObject.NULL || "".equals(String.valueOf(v))) OneSignal.getUser().removeTag(k);
                else OneSignal.getUser().addTag(k, String.valueOf(v));
            }
            resolve(id, "true");
        } catch (Exception e) { reject(id, "Étiquettes illisibles."); }
    }

    @JavascriptInterface
    public void requestPermission(String id) {
        OneSignal.getNotifications().requestPermission(true, Continue.with(r -> resolve(id, Boolean.TRUE.equals(r.getData()) ? "true" : "false")));
    }

    @JavascriptInterface
    public void consent(boolean given, String id) {
        OneSignal.setConsentGiven(given);
        resolve(id, given ? "true" : "false");
    }

    @JavascriptInterface
    public void state(String id) {
        try {
            JSONObject s = new JSONObject();
            s.put("permission", OneSignal.getNotifications().getPermission());
            String sub = OneSignal.getUser().getPushSubscription().getId();
            s.put("subscriptionId", sub == null ? "" : sub);
            s.put("optedIn", OneSignal.getUser().getPushSubscription().getOptedIn());
            s.put("onesignalId", OneSignal.getUser().getOnesignalId());
            String ext = OneSignal.getUser().getExternalId();
            s.put("externalId", ext == null ? "" : ext);
            resolve(id, s.toString());
        } catch (Exception e) { reject(id, "État indisponible."); }
    }

    @JavascriptInterface
    public String lastClick() { return pendingClick == null ? "" : pendingClick; }

    @JavascriptInterface
    public void optIn(boolean on, String id) {
        if (on) OneSignal.getUser().getPushSubscription().optIn();
        else OneSignal.getUser().getPushSubscription().optOut();
        resolve(id, on ? "true" : "false");
    }

    // ------------------------------------------------------------ retour vers la page
    private void resolve(String id, String json) { send("window.__vitrineResolve && window.__vitrineResolve(" + JSONObject.quote(id) + ", true, " + json + ")"); }

    private void reject(String id, String msg) { send("window.__vitrineResolve && window.__vitrineResolve(" + JSONObject.quote(id) + ", false, new Error(" + JSONObject.quote(msg) + "))"); }

    private void send(String js) {
        act.runOnUiThread(() -> { try { web.evaluateJavascript(js, null); } catch (Throwable ignored) { /* page fermée */ } });
    }
}
