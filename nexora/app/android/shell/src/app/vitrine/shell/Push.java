package app.vitrine.shell;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONObject;

import java.io.OutputStream;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Notifications push : jeton de l'appareil, sujets, enregistrement auprès du serveur du site, relais vers la page.
 * Firebase Messaging n'est présent que si l'application a été construite avec les notifications push :
 * tout passe donc par la réflexion, et l'application fonctionne normalement sans.
 */
public final class Push {
    static MainActivity act;
    static String token;
    static String error;
    private static boolean started;

    private Push() { }

    static boolean available() {
        try {
            Class.forName("com.google.firebase.messaging.FirebaseMessaging");
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    static void start(MainActivity a) {
        act = a;
        Config c = a.cfg;
        if (!c.push || started) return;
        started = true;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) a.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm.getNotificationChannel("vt_default") == null) {
                nm.createNotificationChannel(new NotificationChannel("vt_default", c.pushChannel.isEmpty() ? "Notifications" : c.pushChannel, NotificationManager.IMPORTANCE_HIGH));
            }
        }
        SharedPreferences sp = a.getSharedPreferences("vt_push", Context.MODE_PRIVATE);
        token = sp.getString("token", null);
        if (!available()) { error = "Firebase Messaging absent de l'application"; return; }
        try {
            Class<?> fm = Class.forName("com.google.firebase.messaging.FirebaseMessaging");
            Object inst = fm.getMethod("getInstance").invoke(null);
            onTask(fm.getMethod("getToken").invoke(inst), true);
            // Sujets propres à l'application : « com_exemple_app__all » et non « all ». Deux applications
            // construites avec NEXORA (même projet Firebase ou non) ne reçoivent donc jamais les envois de l'autre.
            if (!sp.getBoolean("ns1", false)) {
                for (String t : c.pushTopics) if (!t.isEmpty() && !t.startsWith(prefix(a))) fm.getMethod("unsubscribeFromTopic", String.class).invoke(inst, t);
                fm.getMethod("unsubscribeFromTopic", String.class).invoke(inst, "all");
                sp.edit().putBoolean("ns1", true).apply();
            }
            for (String t : c.pushTopics) if (!t.isEmpty()) fm.getMethod("subscribeToTopic", String.class).invoke(inst, topic(a, t));
        } catch (Throwable t) {
            Throwable r = t.getCause() != null ? t.getCause() : t;
            error = r.getClass().getSimpleName() + ": " + r.getMessage();
        }
        if (c.pushAsk && Build.VERSION.SDK_INT >= 33) {
            a.ui.postDelayed(() -> a.requestRuntime(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, g -> page("{\"type\":\"permission\",\"granted\":" + g + "}")), 1200);
        }
    }

    // Tâche Google Play (Task) : écoute par un « proxy » de l'interface OnCompleteListener.
    private static void onTask(Object task, final boolean isToken) throws Exception {
        if (task == null) return;
        Class<?> l = Class.forName("com.google.android.gms.tasks.OnCompleteListener");
        Object listener = Proxy.newProxyInstance(l.getClassLoader(), new Class<?>[]{l}, (proxy, m, args) -> {
            if ("onComplete".equals(m.getName()) && args != null && args.length == 1) {
                try {
                    Object t = args[0];
                    boolean ok = (Boolean) t.getClass().getMethod("isSuccessful").invoke(t);
                    if (ok && isToken) onToken(act, (String) t.getClass().getMethod("getResult").invoke(t));
                    else if (!ok) {
                        Object e = t.getClass().getMethod("getException").invoke(t);
                        error = e == null ? "inconnue" : String.valueOf(e);
                    }
                } catch (Throwable ignored) {
                    // résultat illisible
                }
                return null;
            }
            if ("hashCode".equals(m.getName())) return System.identityHashCode(proxy);
            if ("equals".equals(m.getName())) return proxy == args[0];
            if ("toString".equals(m.getName())) return "VitrinePushListener";
            return null;
        });
        Method add = task.getClass().getMethod("addOnCompleteListener", l);
        add.invoke(task, listener);
    }

    /** Nouveau jeton (appelé aussi par VtPushService). */
    public static Object onToken(Context ctx, String t) {
        if (t == null || t.isEmpty()) return null;
        boolean changed = !t.equals(token);
        token = t;
        error = null;
        if (ctx != null) ctx.getSharedPreferences("vt_push", Context.MODE_PRIVATE).edit().putString("token", t).apply();
        page("{\"type\":\"token\",\"token\":" + JSONObject.quote(t) + "}");
        if (changed && act != null && !act.cfg.pushRegisterUrl.isEmpty()) register(ctx != null ? ctx : act, act.cfg.pushRegisterUrl, t);
        return null;
    }

    /** Message reçu application ouverte (appelé par VtPushService) : relayé à la page. */
    public static Object onMessage(Context ctx, String json) {
        if (act == null || act.web == null) return Boolean.FALSE;
        page("{\"type\":\"message\",\"message\":" + json + "}");
        return Boolean.TRUE;
    }

    static void page(String detailJson) {
        final MainActivity a = act;
        if (a == null) return;
        a.ui.post(() -> {
            if (a.web == null) return;
            a.web.evaluateJavascript("(function(){var d=" + detailJson + ";if(d.type==='token')window.__vitrinePushToken=d.token;window.dispatchEvent(new CustomEvent('vitrinepush',{detail:d}));})()", null);
        });
    }

    /** Préfixe des sujets de cette application (nom du paquet, points remplacés). */
    static String prefix(Context ctx) {
        return ctx.getPackageName().replace('.', '_') + "__";
    }

    /** Nom réel du sujet chez Firebase pour un sujet de l'application (« promo » → « com_x_app__promo »). */
    static String topic(Context ctx, String t) {
        String p = prefix(ctx);
        String clean = t.replaceAll("^/topics/", "").replaceAll("[^a-zA-Z0-9\\-_.~%]", "_");
        return clean.startsWith(p) ? clean : p + clean;
    }

    static void subscribe(String topic, boolean on, MainActivity a, String id) {
        try {
            Class<?> fm = Class.forName("com.google.firebase.messaging.FirebaseMessaging");
            Object inst = fm.getMethod("getInstance").invoke(null);
            fm.getMethod(on ? "subscribeToTopic" : "unsubscribeFromTopic", String.class).invoke(inst, topic(a, topic));
            a.resolve(id, true, "true");
        } catch (Throwable t) {
            a.resolve(id, false, JSONObject.quote("Notifications push indisponibles"));
        }
    }

    // Enregistre l'appareil auprès du serveur du site (adresse choisie dans NEXORA), en arrière-plan.
    static void register(final Context ctx, final String url, final String t) {
        new Thread(() -> {
            try {
                JSONObject o = new JSONObject();
                o.put("token", t);
                o.put("platform", "android");
                o.put("package", ctx.getPackageName());
                o.put("app", act != null ? act.cfg.appName : "");
                o.put("model", Build.MODEL);
                o.put("sdk", Build.VERSION.SDK_INT);
                o.put("locale", Locale.getDefault().toLanguageTag());
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setRequestMethod("POST");
                c.setConnectTimeout(10000);
                c.setReadTimeout(10000);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                try (OutputStream os = c.getOutputStream()) { os.write(o.toString().getBytes(StandardCharsets.UTF_8)); }
                c.getResponseCode();
                c.disconnect();
            } catch (Exception ignored) {
                // serveur injoignable : nouvel essai au prochain démarrage
                if (ctx != null) ctx.getSharedPreferences("vt_push", Context.MODE_PRIVATE).edit().remove("token").apply();
            }
        }).start();
    }
}
