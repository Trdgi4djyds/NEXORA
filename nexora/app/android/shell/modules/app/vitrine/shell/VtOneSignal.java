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
import com.onesignal.user.subscriptions.IPushSubscription;

import org.json.JSONObject;

/**
 * NEXORA #115 : notifications push par OneSignal (SDK officiel, com.onesignal:OneSignal), exposées à la page sous
 * window.VitrineOneSignal puis NexoraApp.onesignal (bridge.js). Ajouté à l'application par le kit OneSignal de
 * l'App Builder ; MainActivity l'attache par réflexion quand le module est activé.
 * Un clic sur une notification ouvre son lien (launchURL ou donnée « url ») dans l'application, pas dans le
 * navigateur (com.onesignal.suppressLaunchURLs dans le manifeste), puis prévient la page (événement nexora-onesignal).
 */
public final class VtOneSignal {
    private final Activity act;
    private final WebView web;

    private VtOneSignal(Activity a, WebView w) {
        act = a;
        web = w;
    }

    /** Appelé par MainActivity (réflexion) avant le premier chargement de page. */
    public static void attach(Activity a, WebView w, String config) {
        JSONObject cfg = null;
        try { cfg = new JSONObject(config); } catch (Exception ignored) { /* réglages par défaut */ }
        if (cfg == null) cfg = new JSONObject();
        final VtOneSignal o = new VtOneSignal(a, w);
        if (cfg.optBoolean("debug", false)) OneSignal.getDebug().setLogLevel(LogLevel.VERBOSE);
        OneSignal.initWithContext(a.getApplicationContext(), cfg.optString("appId", ""));
        OneSignal.getNotifications().addClickListener(new INotificationClickListener() {
            @Override
            public void onClick(INotificationClickEvent event) { o.opened(event.getNotification()); }
        });
        if (cfg.optBoolean("ask", true)) OneSignal.getNotifications().requestPermission(false, Continue.none());
        w.addJavascriptInterface(o, "VitrineOneSignal");
    }

    private void opened(INotification n) {
        String url = n.getLaunchURL();
        JSONObject data = n.getAdditionalData();
        if ((url == null || url.isEmpty()) && data != null) url = data.optString("url", "");
        JSONObject detail = new JSONObject();
        try {
            detail.put("type", "open");
            detail.put("id", n.getNotificationId());
            detail.put("title", n.getTitle() == null ? "" : n.getTitle());
            detail.put("body", n.getBody() == null ? "" : n.getBody());
            detail.put("url", url == null ? "" : url);
            detail.put("data", data == null ? new JSONObject() : data);
        } catch (Exception ignored) { /* champs facultatifs */ }
        final String target = url;
        act.runOnUiThread(() -> {
            try {
                if (target != null && target.startsWith("http")) web.loadUrl(target);
            } catch (Throwable ignored) { /* page fermée */ }
        });
        // La page qui vient de s'ouvrir reçoit l'événement une fois chargée (file gardée par bridge.js).
        send("window.__vitrineOneSignal && window.__vitrineOneSignal(" + detail + ")");
    }

    // ------------------------------------------------------------ fonctions appelées par la page
    @JavascriptInterface
    public void login(String externalId) { if (externalId != null && !externalId.isEmpty()) OneSignal.login(externalId); }

    @JavascriptInterface
    public void logout() { OneSignal.logout(); }

    @JavascriptInterface
    public void addTag(String key, String value) { if (key != null && !key.isEmpty()) OneSignal.getUser().addTag(key, value == null ? "" : value); }

    @JavascriptInterface
    public void removeTag(String key) { if (key != null && !key.isEmpty()) OneSignal.getUser().removeTag(key); }

    @JavascriptInterface
    public void addEmail(String email) { if (email != null && email.contains("@")) OneSignal.getUser().addEmail(email); }

    @JavascriptInterface
    public void setLanguage(String lang) { if (lang != null && !lang.isEmpty()) OneSignal.getUser().setLanguage(lang); }

    @JavascriptInterface
    public void optIn() { OneSignal.getUser().getPushSubscription().optIn(); }

    @JavascriptInterface
    public void optOut() { OneSignal.getUser().getPushSubscription().optOut(); }

    /** Identifiant d'abonnement OneSignal, jeton, état et autorisation (pour l'envoyer à votre serveur). */
    @JavascriptInterface
    public void status(String id) {
        try {
            IPushSubscription s = OneSignal.getUser().getPushSubscription();
            JSONObject r = new JSONObject();
            r.put("subscriptionId", s.getId() == null ? "" : s.getId());
            r.put("token", s.getToken() == null ? "" : s.getToken());
            r.put("optedIn", s.getOptedIn());
            r.put("permission", OneSignal.getNotifications().getPermission());
            resolve(id, r.toString());
        } catch (Throwable t) {
            reject(id, "OneSignal n'est pas encore prêt : réessayez dans un instant.");
        }
    }

    @JavascriptInterface
    public void requestPermission(final String id) {
        OneSignal.getNotifications().requestPermission(true, Continue.with((r) -> resolve(id, r.isSuccess() && Boolean.TRUE.equals(r.getData()) ? "true" : "false")));
    }

    // ------------------------------------------------------------ réponses à la page
    private void resolve(String id, String json) { send("window.__vitrineResolve && window.__vitrineResolve(" + JSONObject.quote(id) + ", true, " + json + ")"); }

    private void reject(String id, String msg) { send("window.__vitrineResolve && window.__vitrineResolve(" + JSONObject.quote(id) + ", false, new Error(" + JSONObject.quote(msg) + "))"); }

    private void send(String js) {
        act.runOnUiThread(() -> { try { web.evaluateJavascript(js, null); } catch (Throwable ignored) { /* page fermée */ } });
    }
}
