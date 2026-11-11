package app.vitrine.shell;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.UUID;

/**
 * NEXORA #018 : statistiques et rapports de plantage, envoyés au compte NEXORA du propriétaire de l'application
 * (fonction app_track de la base de NEXORA). Rien n'est envoyé si l'option n'a pas été cochée dans l'App Builder.
 * Identifiant d'installation tiré au hasard (aucun identifiant du téléphone), file d'attente gardée sur
 * l'appareil tant que l'envoi n'a pas réussi, plafonnée à 40 événements.
 */
final class Insights {
    static volatile boolean enabled;
    private static String url;
    private static String anon;
    private static String key;
    private static boolean launches;
    private static final Object LOCK = new Object();
    private static final int MAX = 40;

    private Insights() { }

    /** Lit les réglages (config.json › insights) et envoie le lancement et les plantages en attente. */
    static void start(MainActivity a) {
        JSONObject j = a.cfg.raw != null ? a.cfg.raw.optJSONObject("insights") : null;
        if (j == null || !j.optBoolean("enabled", false)) return;
        url = j.optString("url", "");
        anon = j.optString("anon", "");
        key = j.optString("key", "");
        launches = j.optBoolean("launches", true);
        if (url.isEmpty() || key.isEmpty()) return;
        enabled = true;
        Context app = a.getApplicationContext();
        if (launches) queue(app, event(app, "launch", null, null));
        flush(app);
    }

    /** Appelé par le gestionnaire de fermetures inattendues : l'événement est gardé, envoyé au lancement suivant. */
    static void crash(Context app, Thread th, Throwable e) {
        if (!enabled) return;
        try {
            StringWriter sw = new StringWriter();
            e.printStackTrace(new PrintWriter(sw));
            String stack = sw.toString();
            JSONObject d = new JSONObject();
            d.put("message", String.valueOf(e.getClass().getName() + (e.getMessage() != null ? ": " + e.getMessage() : "")));
            d.put("thread", th != null ? th.getName() : "");
            d.put("stack", stack.length() > 6000 ? stack.substring(0, 6000) : stack);
            queue(app, event(app, "crash", signature(e), d));
        } catch (Throwable ignored) {
            // rien de plus à faire pendant une fermeture
        }
    }

    /** Erreur sans fermeture (moteur de la page arrêté, par exemple). */
    static void error(Context app, String what, String message) {
        if (!enabled) return;
        try {
            JSONObject d = new JSONObject();
            d.put("message", message);
            queue(app, event(app, "error", what, d));
            flush(app);
        } catch (Throwable ignored) {
            // facultatif
        }
    }

    /** Empreinte d'un plantage : type d'erreur et première ligne de la trace, pour regrouper les mêmes causes. */
    static String signature(Throwable e) {
        Throwable root = e;
        while (root.getCause() != null && root.getCause() != root) root = root.getCause();
        StackTraceElement[] st = root.getStackTrace();
        String at = st.length > 0 ? st[0].getClassName() + "." + st[0].getMethodName() + ":" + st[0].getLineNumber() : "?";
        return root.getClass().getName() + " @ " + at;
    }

    private static JSONObject event(Context app, String kind, String sig, JSONObject detail) {
        JSONObject o = new JSONObject();
        try {
            o.put("kind", kind);
            o.put("at", System.currentTimeMillis());
            o.put("install", install(app));
            try {
                PackageInfo pi = app.getPackageManager().getPackageInfo(app.getPackageName(), 0);
                o.put("version", pi.versionName);
                o.put("version_code", Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode);
            } catch (Exception ignored) {
                // version inconnue
            }
            o.put("os", "Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
            o.put("model", (Build.MANUFACTURER + " " + Build.MODEL).trim());
            o.put("locale", Locale.getDefault().toLanguageTag());
            if (sig != null) o.put("signature", sig);
            if (detail != null) o.put("detail", detail);
        } catch (Exception ignored) {
            // champs facultatifs
        }
        return o;
    }

    private static String install(Context app) {
        SharedPreferences sp = app.getSharedPreferences("vt_insights", Context.MODE_PRIVATE);
        String id = sp.getString("install", null);
        if (id == null) {
            id = UUID.randomUUID().toString();
            sp.edit().putString("install", id).commit();
        }
        return id;
    }

    private static void queue(Context app, JSONObject ev) {
        synchronized (LOCK) {
            SharedPreferences sp = app.getSharedPreferences("vt_insights", Context.MODE_PRIVATE);
            JSONArray q;
            try {
                q = new JSONArray(sp.getString("queue", "[]"));
            } catch (Exception e) {
                q = new JSONArray();
            }
            q.put(ev);
            JSONArray keep = new JSONArray();
            for (int i = Math.max(0, q.length() - MAX); i < q.length(); i++) keep.put(q.opt(i));
            // commit (et non apply) : pendant une fermeture, l'écriture doit être finie avant l'arrêt du processus.
            sp.edit().putString("queue", keep.toString()).commit();
        }
    }

    /** Envoi en arrière-plan ; la file n'est vidée que des événements bien reçus. */
    static void flush(final Context app) {
        if (!enabled) return;
        new Thread(() -> {
            final JSONArray q;
            synchronized (LOCK) {
                try {
                    q = new JSONArray(app.getSharedPreferences("vt_insights", Context.MODE_PRIVATE).getString("queue", "[]"));
                } catch (Exception e) {
                    return;
                }
            }
            if (q.length() == 0) return;
            HttpURLConnection c = null;
            try {
                JSONObject body = new JSONObject();
                body.put("p_key", key);
                body.put("p_events", q);
                c = (HttpURLConnection) new URL(url.replaceAll("/+$", "") + "/rest/v1/rpc/app_track").openConnection();
                c.setConnectTimeout(10000);
                c.setReadTimeout(15000);
                c.setRequestMethod("POST");
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                c.setRequestProperty("apikey", anon);
                c.setRequestProperty("Authorization", "Bearer " + anon);
                try (OutputStream out = c.getOutputStream()) {
                    out.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
                int code = c.getResponseCode();
                if (code >= 200 && code < 300) {
                    synchronized (LOCK) {
                        SharedPreferences sp = app.getSharedPreferences("vt_insights", Context.MODE_PRIVATE);
                        JSONArray cur;
                        try {
                            cur = new JSONArray(sp.getString("queue", "[]"));
                        } catch (Exception e) {
                            cur = new JSONArray();
                        }
                        // Événements ajoutés pendant l'envoi : gardés pour la prochaine fois.
                        JSONArray rest = new JSONArray();
                        for (int i = q.length(); i < cur.length(); i++) rest.put(cur.opt(i));
                        sp.edit().putString("queue", rest.toString()).apply();
                    }
                }
            } catch (Throwable ignored) {
                // hors connexion : nouvel essai au prochain lancement
            } finally {
                if (c != null) c.disconnect();
            }
        }, "nexora-insights").start();
    }
}
