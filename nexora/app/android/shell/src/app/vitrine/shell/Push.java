package app.vitrine.shell;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Person;
import android.app.RemoteInput;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Looper;
import android.provider.Settings;
import android.webkit.CookieManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Notifications push : jeton de l'appareil, sujets, enregistrement auprès du serveur du site, relais vers la page.
 * Firebase Messaging n'est présent que si l'application a été construite avec les notifications push :
 * tout passe donc par la réflexion, et l'application fonctionne normalement sans.
 *
 * NEXORA #073 : messagerie complète. VtPushService (kit Firebase) ne fait que transmettre chaque message à
 * receive() ; tout le reste est ici, sans dépendance à Firebase :
 *  - application à l'écran : la page reçoit le message et peut le prendre en charge (conversation affichée,
 *    réponse de son écouteur, ou notifications masquées quand l'application est ouverte) ;
 *  - application fermée : message mis de côté, remis à la page à sa prochaine ouverture ;
 *  - catégories de notifications choisies par le serveur, une notification par conversation (« tag ») ;
 *  - style conversation, réponse directe et « Marquer comme lu », appels entrants en plein écran (offre Pro) ;
 *  - actions envoyées à l'adresse des actions du site, avec ses cookies de session ;
 *  - enregistrement du jeton avec la session, suppression du jeton à la déconnexion.
 */
public final class Push {
    static final String DEFAULT = "vt_default";
    static final String CALLS = "vt_calls";
    static final String PREFS = "vt_push";
    static final String HISTORY = "vt_push_h";
    static final int ID_MESSAGE = 1;
    static final int ID_CALL = 2;
    static final int MAX_QUEUE = 50;
    static final int MAX_HISTORY = 8;

    static MainActivity act;
    static String token;
    static String error;
    private static boolean started;
    private static Config conf;
    // État de l'écran, réglé par l'activité et par la page.
    static volatile boolean foreground;
    static volatile String activeTag = "";
    static volatile boolean showWhenOpen = true;
    static volatile boolean pageOpens;
    static volatile String opened;
    private static final Map<String, Object[]> waits = new ConcurrentHashMap<>();
    private static final Map<String, Bitmap> avatars = new ConcurrentHashMap<>();
    private static int seq;

    private Push() { }

    interface Done {
        void done(boolean ok, Object result, String err);
    }

    static boolean available() {
        try {
            Class.forName("com.google.firebase.messaging.FirebaseMessaging");
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Réglages de l'application : ceux de l'activité, ou relus quand seul le service tourne. */
    static Config cfg(Context ctx) {
        MainActivity a = act;
        if (a != null && a.cfg != null) return a.cfg;
        if (conf == null) {
            try {
                conf = Config.load(ctx.getApplicationContext());
            } catch (Throwable t) {
                conf = new Config();
            }
        }
        return conf;
    }

    private static Object messaging() throws Exception {
        Class<?> fm = Class.forName("com.google.firebase.messaging.FirebaseMessaging");
        return fm.getMethod("getInstance").invoke(null);
    }

    static void start(MainActivity a) {
        act = a;
        Config c = a.cfg;
        showWhenOpen = c.pushShowWhenOpen;
        if (!c.push || started) return;
        started = true;
        ensureChannels(a);
        SharedPreferences sp = prefs(a);
        token = sp.getString("token", null);
        migrateLast(a);
        if (!available()) { error = "Firebase Messaging absent de l'application"; return; }
        try {
            Object inst = messaging();
            onTask(inst.getClass().getMethod("getToken").invoke(inst), (ok, r, err) -> {
                if (ok) onToken(act, (String) r);
                else error = err;
            });
            // Sujets propres à l'application : « com_exemple_app__all » et non « all ». Deux applications
            // construites avec NEXORA (même projet Firebase ou non) ne reçoivent donc jamais les envois de l'autre.
            if (!sp.getBoolean("ns1", false)) {
                Method unsub = inst.getClass().getMethod("unsubscribeFromTopic", String.class);
                for (String t : c.pushTopics) if (!t.isEmpty() && !t.startsWith(prefix(a))) unsub.invoke(inst, t);
                unsub.invoke(inst, "all");
                sp.edit().putBoolean("ns1", true).apply();
            }
            subscribeAll(a, inst);
        } catch (Throwable t) {
            Throwable r = t.getCause() != null ? t.getCause() : t;
            error = r.getClass().getSimpleName() + ": " + r.getMessage();
        }
        // Enregistrement qui avait échoué (serveur injoignable) : nouvel essai à chaque démarrage.
        if (token != null && sp.getBoolean("regRetry", false) && !c.pushRegisterUrl.isEmpty()) registerAsync(a, "register", null, null);
        if (c.pushAsk && Build.VERSION.SDK_INT >= 33) {
            a.ui.postDelayed(() -> a.requestRuntime(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, g -> page("{\"type\":\"permission\",\"granted\":" + g + "}")), 1200);
        }
    }

    // Sujets de l'App Builder et sujets choisis par la page (rétablis après un nouveau jeton), sauf ceux que la page a quittés.
    private static void subscribeAll(Context ctx, Object inst) throws Exception {
        Method sub = inst.getClass().getMethod("subscribeToTopic", String.class);
        Set<String> left = prefs(ctx).getStringSet("untopics", new HashSet<>());
        for (String t : cfg(ctx).pushTopics) if (!t.isEmpty() && !left.contains(t)) sub.invoke(inst, topic(ctx, t));
        for (String t : prefs(ctx).getStringSet("topics", new HashSet<>())) sub.invoke(inst, topic(ctx, t));
    }

    // Tâche Google Play (Task) : écoute par un « proxy » de l'interface OnCompleteListener.
    private static void onTask(Object task, final Done done) throws Exception {
        if (task == null) return;
        Class<?> l = Class.forName("com.google.android.gms.tasks.OnCompleteListener");
        Object listener = Proxy.newProxyInstance(l.getClassLoader(), new Class<?>[]{l}, (proxy, m, args) -> {
            if ("onComplete".equals(m.getName()) && args != null && args.length == 1) {
                try {
                    Object t = args[0];
                    boolean ok = (Boolean) t.getClass().getMethod("isSuccessful").invoke(t);
                    if (ok) done.done(true, t.getClass().getMethod("getResult").invoke(t), null);
                    else {
                        Object e = t.getClass().getMethod("getException").invoke(t);
                        done.done(false, null, e == null ? "inconnue" : String.valueOf(e));
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

    /** Jeton demandé par la page (après une déconnexion, le jeton suivant est créé à la demande). */
    static void requestToken() {
        if (!available()) return;
        try {
            Object inst = messaging();
            onTask(inst.getClass().getMethod("getToken").invoke(inst), (ok, r, err) -> {
                if (ok) onToken(act, (String) r);
                else error = err;
            });
        } catch (Throwable t) {
            Throwable r = t.getCause() != null ? t.getCause() : t;
            error = r.getClass().getSimpleName() + ": " + r.getMessage();
        }
    }

    /** Nouveau jeton (appelé aussi par VtPushService, même application fermée). */
    public static Object onToken(Context ctx, String t) {
        if (t == null || t.isEmpty()) return null;
        Context app = ctx != null ? ctx.getApplicationContext() : (act != null ? act.getApplicationContext() : null);
        boolean changed = !t.equals(token);
        token = t;
        error = null;
        if (app != null) prefs(app).edit().putString("token", t).apply();
        page("{\"type\":\"token\",\"token\":" + JSONObject.quote(t) + "}");
        if (app != null && changed) {
            // Après une suppression du jeton, les abonnements aux sujets sont à refaire avec le nouveau.
            if (prefs(app).getBoolean("resub", false) && available()) {
                try {
                    subscribeAll(app, messaging());
                    prefs(app).edit().remove("resub").apply();
                } catch (Throwable ignored) {
                    // nouvel essai au prochain démarrage
                }
            }
            if (!cfg(app).pushRegisterUrl.isEmpty()) registerAsync(app, "register", null, null);
        }
        return null;
    }

    // ================================================================== réception
    /** Message reçu (VtPushService) : { id, from, sentTime, data: {…}, notification: { title, body, image, tag, channel } }. */
    public static Object receive(Context ctx, String json) {
        Context app = ctx.getApplicationContext();
        JSONObject in;
        try {
            in = new JSONObject(json);
        } catch (Exception e) {
            return Boolean.FALSE;
        }
        JSONObject data = in.optJSONObject("data");
        if (data == null) data = new JSONObject();
        // Message destiné à une autre application (champ « vt_app ») ou sujet d'une autre application : ignoré.
        String target = data.optString("vt_app");
        if (!target.isEmpty() && !target.equals(app.getPackageName())) return Boolean.TRUE;
        String from = in.optString("from");
        if (from.startsWith("/topics/") && from.contains("__") && !from.startsWith("/topics/" + prefix(app))) return Boolean.TRUE;
        JSONObject m = message(app, in, data, in.optJSONObject("notification"));
        String type = m.optString("type");
        if ("cancel".equals(type)) {
            cancel(app, m.optString("tag"));
            deliver(app, m, false);
            return Boolean.TRUE;
        }
        boolean visible = !"false".equals(data.optString("vt_show"))
            && ("call".equals(type) || !m.optString("title").isEmpty() || !m.optString("body").isEmpty());
        int r = deliver(app, m, visible);
        if (visible && r != 2) show(app, m, false, true);
        return Boolean.TRUE;
    }

    /** Firebase a supprimé des messages en attente (appareil hors ligne trop longtemps) : la page doit tout relire. */
    public static Object deleted(Context ctx, String unused) {
        String d = "{\"type\":\"deleted\"}";
        if (pageReady()) page(d);
        else {
            try {
                queue(ctx.getApplicationContext(), new JSONObject(d));
            } catch (Exception ignored) {
                // file illisible
            }
        }
        return Boolean.TRUE;
    }

    /** Ancien service (kit d'avant NEXORA #073) : message seulement relayé à la page. */
    public static Object onMessage(Context ctx, String json) {
        if (!pageReady()) return Boolean.FALSE;
        page("{\"type\":\"message\",\"message\":" + json + "}");
        return Boolean.TRUE;
    }

    // Message tel que la page le reçoit : champs connus, puis toutes les données du serveur.
    static JSONObject message(Context ctx, JSONObject in, JSONObject data, JSONObject n) {
        JSONObject m = new JSONObject();
        try {
            String title = n != null ? n.optString("title") : "";
            if (title.isEmpty()) title = data.optString("title");
            String body = n != null ? n.optString("body") : "";
            if (body.isEmpty()) body = data.optString("body");
            String sender = data.optString("sender");
            if (title.isEmpty()) title = sender;
            String url = data.optString("url", data.optString("link"));
            String image = n != null ? n.optString("image") : "";
            if (image.isEmpty()) image = data.optString("image");
            String tag = data.optString("tag", n != null ? n.optString("tag") : "");
            String channel = data.optString("channel", n != null ? n.optString("channel") : "");
            m.put("id", in.optString("id"));
            m.put("type", data.optString("type", "message"));
            m.put("title", title);
            m.put("body", body);
            m.put("url", url);
            m.put("image", image);
            m.put("tag", tag);
            m.put("channel", channel);
            m.put("sender", sender);
            m.put("avatar", data.optString("avatar"));
            m.put("conversation", data.optString("conversation"));
            m.put("key", data.optString("key"));
            m.put("badge", data.optInt("badge", 0));
            m.put("timeout", data.optInt("timeout", 0));
            m.put("from", in.optString("from"));
            long sent = in.optLong("sentTime", 0);
            m.put("sentAt", sent > 0 ? sent : System.currentTimeMillis());
            m.put("data", data);
        } catch (Exception ignored) {
            // message partiel
        }
        return m;
    }

    /** La page peut recevoir des événements (application ouverte sur une page du site, pont autorisé). */
    static boolean pageReady() {
        MainActivity a = act;
        if (a == null || a.web == null || a.isFinishing()) return false;
        if (Build.VERSION.SDK_INT >= 17 && a.isDestroyed()) return false;
        return a.bridgeAllowed();
    }

    /**
     * Remet le message à la page. Renvoie 0 (pas de page : mis de côté), 1 (page prévenue) ou 2 (pris en charge
     * par la page : rien à afficher). Application à l'écran : conversation affichée par la page, notifications
     * masquées quand l'application est ouverte, ou réponse de ses écouteurs (attendue 900 ms au plus).
     */
    static int deliver(Context ctx, JSONObject m, boolean ask) {
        if (!pageReady()) {
            try {
                queue(ctx, new JSONObject().put("type", "message").put("message", m));
            } catch (Exception ignored) {
                // file illisible
            }
            return 0;
        }
        String tag = m.optString("tag");
        if (!foreground || !ask) { page(event(m, null, false)); return 1; }
        if (!tag.isEmpty() && tag.equals(activeTag)) { page(event(m, null, true)); return 2; }
        if (!showWhenOpen) { page(event(m, null, true)); return 2; }
        if (Looper.myLooper() == Looper.getMainLooper()) { page(event(m, null, false)); return 1; }
        String id = "q" + (++seq) + "_" + System.currentTimeMillis();
        CountDownLatch latch = new CountDownLatch(1);
        boolean[] res = {false};
        waits.put(id, new Object[]{latch, res});
        page(event(m, id, false));
        try {
            latch.await(900, TimeUnit.MILLISECONDS);
        } catch (InterruptedException ignored) {
            // délai dépassé : la notification s'affiche
        }
        waits.remove(id);
        return res[0] ? 2 : 1;
    }

    private static String event(JSONObject m, String ask, boolean handled) {
        return "{\"type\":\"message\",\"message\":" + m + ",\"ask\":" + (ask == null ? "null" : JSONObject.quote(ask)) + ",\"handled\":" + handled + "}";
    }

    /** Réponse de la page pour un message reçu à l'écran : true = déjà montré, pas de notification. */
    static void answer(String id, boolean handled) {
        Object[] w = id == null ? null : waits.get(id);
        if (w == null) return;
        ((boolean[]) w[1])[0] = handled;
        ((CountDownLatch) w[0]).countDown();
    }

    static void page(String detailJson) {
        final MainActivity a = act;
        if (a == null) return;
        a.ui.post(() -> {
            if (a.web == null || !a.bridgeAllowed()) return;
            a.web.evaluateJavascript("(function(){var d=" + detailJson + ";if(d.type==='token')window.__vitrinePushToken=d.token;window.dispatchEvent(new CustomEvent('vitrinepush',{detail:d}));})()", null);
        });
    }

    // ================================================================== file d'attente (application fermée)
    static synchronized void queue(Context ctx, JSONObject detail) {
        try {
            SharedPreferences sp = prefs(ctx);
            JSONArray q = new JSONArray(sp.getString("queue", "[]"));
            detail.put("queued", true);
            detail.put("receivedAt", System.currentTimeMillis());
            q.put(detail);
            while (q.length() > MAX_QUEUE) q.remove(0);
            sp.edit().putString("queue", q.toString()).apply();
        } catch (Exception ignored) {
            // file illisible : remise à zéro
            prefs(ctx).edit().remove("queue").apply();
        }
    }

    /** Messages et actions reçus pendant que la page était absente, remis une seule fois. */
    static synchronized String takeQueue(Context ctx) {
        SharedPreferences sp = prefs(ctx);
        String q = sp.getString("queue", "[]");
        sp.edit().remove("queue").apply();
        return q;
    }

    // Dernier message gardé par l'ancien service (avant NEXORA #073) : versé dans la file.
    private static void migrateLast(Context ctx) {
        SharedPreferences sp = prefs(ctx);
        String last = sp.getString("last", null);
        if (last == null) return;
        try {
            queue(ctx, new JSONObject().put("type", "message").put("message", new JSONObject(last)));
        } catch (Exception ignored) {
            // message illisible
        }
        sp.edit().remove("last").apply();
    }

    // ================================================================== ouverture depuis une notification
    static boolean isCall(Intent intent) {
        if (intent == null) return false;
        String a = intent.getStringExtra("vt_open");
        return "incoming".equals(a) || "accept".equals(a);
    }

    /**
     * Notification touchée (ou appel accepté) : le message est gardé pour la page (onOpen). Renvoie true si la page,
     * déjà affichée, gère elle-même la navigation (NexoraApp.push.onOpen(cb, { navigate: false })).
     */
    static boolean noteOpen(MainActivity a, Intent intent) {
        if (intent == null) return false;
        JSONObject m = null;
        String json = intent.getStringExtra("vt_msg");
        String action = intent.getStringExtra("vt_open");
        try {
            if (json != null) m = new JSONObject(json);
            else if (intent.hasExtra("google.message_id")) {
                // Notification affichée par Firebase (application fermée) : les données du message sont dans les « extras ».
                Bundle b = intent.getExtras();
                JSONObject data = new JSONObject();
                if (b != null) {
                    for (String k : b.keySet()) {
                        if (k.startsWith("google.") || k.startsWith("gcm.") || k.startsWith("android.") || "from".equals(k) || "collapse_key".equals(k)) continue;
                        Object v = b.get(k);
                        if (v instanceof String) data.put(k, v);
                    }
                }
                JSONObject in = new JSONObject();
                in.put("id", intent.getStringExtra("google.message_id"));
                in.put("from", intent.getStringExtra("from") == null ? "" : intent.getStringExtra("from"));
                m = message(a, in, data, null);
            }
        } catch (Exception ignored) {
            m = null;
        }
        if (m == null) return false;
        if (action == null || action.isEmpty()) action = "open";
        intent.removeExtra("vt_msg");
        intent.removeExtra("google.message_id");
        // Appel accepté depuis la notification : la sonnerie s'arrête. Conversation ouverte : son historique repart à zéro.
        if ("accept".equals(action) || "open".equals(action)) cancel(a, m.optString("tag"));
        try {
            opened = new JSONObject().put("type", "open").put("action", action).put("message", m).toString();
        } catch (Exception e) {
            opened = null;
        }
        return pageOpens && a.web != null && a.web.getUrl() != null && a.bridgeAllowed();
    }

    static String takeOpened() {
        String o = opened;
        opened = null;
        return o == null ? "" : o;
    }

    /** Page déjà affichée : l'ouverture lui est remise tout de suite. */
    static void deliverOpened() {
        if (opened == null || !pageReady()) return;
        page(takeOpened());
    }

    // ================================================================== écran, conversation affichée
    static void resumed(Context ctx) {
        foreground = true;
        if (!activeTag.isEmpty()) cancel(ctx, activeTag);
    }

    /** Conversation (tag) affichée par la page : ses notifications sont retirées et ne s'affichent plus à l'écran. */
    static void setActive(Context ctx, String tag) {
        activeTag = tag == null ? "" : tag.trim();
        if (foreground && !activeTag.isEmpty()) cancel(ctx, activeTag);
    }

    static void detach(MainActivity a) {
        if (act == a) act = null;
        foreground = false;
    }

    // ================================================================== catégories
    static String slug(String s) {
        String n = Normalizer.normalize(s == null ? "" : s, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        n = n.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "_").replaceAll("^_+|_+$", "");
        return n.length() > 40 ? n.substring(0, 40) : n;
    }

    static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        try {
            Config c = cfg(ctx);
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm.getNotificationChannel(DEFAULT) == null) {
                nm.createNotificationChannel(new NotificationChannel(DEFAULT, c.pushChannel.isEmpty() ? "Notifications" : c.pushChannel, NotificationManager.IMPORTANCE_HIGH));
            }
            for (String[] ch : c.pushChannels) {
                if (nm.getNotificationChannel(ch[0]) != null) continue;
                int imp = "high".equals(ch[2]) ? NotificationManager.IMPORTANCE_HIGH : "low".equals(ch[2]) ? NotificationManager.IMPORTANCE_LOW : NotificationManager.IMPORTANCE_DEFAULT;
                nm.createNotificationChannel(new NotificationChannel(ch[0], ch[1], imp));
            }
            if (c.pushCalls && nm.getNotificationChannel(CALLS) == null) {
                NotificationChannel call = new NotificationChannel(CALLS, "Appels", NotificationManager.IMPORTANCE_HIGH);
                call.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                call.enableVibration(true);
                call.setVibrationPattern(new long[]{0, 800, 600, 800, 600});
                call.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(call);
            }
        } catch (Exception ignored) {
            // catégories indisponibles : catégorie par défaut d'Android
        }
    }

    /** Catégorie configurée qui correspond à un identifiant (« vt_messages »), un nom court (« messages ») ou un nom affiché. */
    static String knownChannel(Context ctx, String want) {
        if (want == null || want.trim().isEmpty()) return null;
        String w = want.trim();
        Config c = cfg(ctx);
        if (DEFAULT.equals(w)) return DEFAULT;
        if (CALLS.equals(w) && c.pushCalls) return CALLS;
        String s = slug(w);
        for (String[] ch : c.pushChannels) if (ch[0].equals(w) || ch[0].equals("vt_" + s) || slug(ch[1]).equals(s)) return ch[0];
        return null;
    }

    static String channelFor(Context ctx, String want) {
        String k = knownChannel(ctx, want);
        return k == null ? DEFAULT : k;
    }

    // ================================================================== affichage
    private static int res(Context ctx, String name, String type) {
        return ctx.getResources().getIdentifier(name, type, ctx.getPackageName());
    }

    private static int code(JSONObject m, int k) {
        return (m.optString("tag") + "|" + m.optString("id")).hashCode() * 31 + k;
    }

    static PendingIntent activity(Context ctx, JSONObject m, String action, int k) {
        Intent open = new Intent(ctx, MainActivity.class);
        open.setAction("app.vitrine.open." + action + "." + m.optString("tag") + "." + m.optString("id"));
        String url = m.optString("url");
        if (!url.isEmpty()) open.putExtra("vitrine_url", url);
        open.putExtra("vt_msg", m.toString());
        open.putExtra("vt_open", action);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(ctx, code(m, k), open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static PendingIntent broadcast(Context ctx, JSONObject m, String action, int k, boolean mutable) {
        Intent i = new Intent(ctx, PushAction.class);
        i.setAction("app.vitrine.push." + action + "." + m.optString("tag") + "." + m.optString("id"));
        i.putExtra("vt_action", action);
        i.putExtra("vt_msg", m.toString());
        // Répondre (RemoteInput) : Android ajoute le texte tapé à l'intention, qui doit donc rester modifiable
        // (FLAG_MUTABLE depuis Android 12, aucun drapeau avant) ; les autres actions sont immuables.
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (mutable ? (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0) : PendingIntent.FLAG_IMMUTABLE);
        return PendingIntent.getBroadcast(ctx, code(m, k), i, flags);
    }

    /** Affiche un message. quiet : mise à jour sans son (réponse envoyée) ; record : ajouté à l'historique de la conversation. */
    @SuppressWarnings("deprecation")
    static void show(Context ctx, JSONObject m, boolean quiet, boolean record) {
        try {
            Config c = cfg(ctx);
            ensureChannels(ctx);
            if ("call".equals(m.optString("type"))) {
                if (c.pushCalls) { showCall(ctx, m); return; }
            }
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            String tag = m.optString("tag");
            String channel = channelFor(ctx, m.optString("channel"));
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, channel) : new Notification.Builder(ctx);
            int icon = res(ctx, "vt_notification", "drawable");
            int color = res(ctx, "vt_push_color", "color");
            long at = m.optLong("sentAt", System.currentTimeMillis());
            b.setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_dialog_info)
                .setAutoCancel(true)
                .setOnlyAlertOnce(quiet)
                .setWhen(at)
                .setShowWhen(true)
                .setContentIntent(activity(ctx, m, "open", 0))
                .setDeleteIntent(broadcast(ctx, m, "dismiss", 9, false));
            if (color != 0) b.setColor(ctx.getColor(color));
            String title = m.optString("title");
            String body = m.optString("body");
            JSONObject data = m.optJSONObject("data");
            boolean convo = c.pushMessaging && !tag.isEmpty()
                && (!m.optString("sender").isEmpty() || (data != null && "conversation".equals(data.optString("style"))));
            if (convo) {
                JSONObject entry = new JSONObject();
                entry.put("sender", m.optString("sender", title));
                entry.put("avatar", m.optString("avatar"));
                entry.put("text", body);
                entry.put("at", at);
                JSONArray h = remember(ctx, tag, record ? entry : null, m);
                if (h.length() == 0) h.put(entry);
                b.setStyle(conversation(m, h));
                b.setCategory(Notification.CATEGORY_MESSAGE);
                String group = m.optString("conversation");
                b.setContentTitle(group.isEmpty() ? m.optString("sender", title) : group).setContentText(body);
                Bitmap av = avatar(m.optString("avatar"));
                if (av != null && Build.VERSION.SDK_INT < 28) b.setLargeIcon(av);
                addActions(ctx, b, c, m, icon);
            } else {
                b.setContentTitle(title).setContentText(body);
                String image = m.optString("image");
                Bitmap pic = image.startsWith("https://") ? fetchBitmap(image) : null;
                if (pic != null) b.setLargeIcon(pic).setStyle(new Notification.BigPictureStyle().bigPicture(pic).setSummaryText(body));
                else b.setStyle(new Notification.BigTextStyle().bigText(body));
            }
            int n = m.optInt("badge", 0);
            if (n > 0) b.setNumber(n);
            if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH);
            if (tag.isEmpty()) nm.notify((int) (System.currentTimeMillis() & 0x7fffffff), b.build());
            else nm.notify(tag, ID_MESSAGE, b.build());
        } catch (Exception ignored) {
            // notification impossible
        }
    }

    @SuppressWarnings("deprecation")
    private static Notification.Style conversation(JSONObject m, JSONArray h) {
        String group = m.optString("conversation");
        Notification.MessagingStyle st = Build.VERSION.SDK_INT >= 28
            ? new Notification.MessagingStyle(new Person.Builder().setName("Toi").build())
            : new Notification.MessagingStyle("Toi");
        if (!group.isEmpty()) st.setConversationTitle(group);
        if (Build.VERSION.SDK_INT >= 28) st.setGroupConversation(!group.isEmpty());
        for (int i = 0; i < h.length(); i++) {
            JSONObject x = h.optJSONObject(i);
            if (x == null) continue;
            String text = x.optString("text");
            long at = x.optLong("at", System.currentTimeMillis());
            if (Build.VERSION.SDK_INT >= 28) {
                Person p = null;
                if (!x.optBoolean("me")) {
                    Person.Builder pb = new Person.Builder().setName(x.optString("sender")).setKey(x.optString("sender"));
                    Bitmap av = avatar(x.optString("avatar"));
                    if (av != null) pb.setIcon(Icon.createWithBitmap(av));
                    p = pb.build();
                }
                st.addMessage(new Notification.MessagingStyle.Message(text, at, p));
            } else {
                st.addMessage(text, at, x.optBoolean("me") ? (CharSequence) null : x.optString("sender"));
            }
        }
        return st;
    }

    private static void addActions(Context ctx, Notification.Builder b, Config c, JSONObject m, int icon) {
        if (c.pushActionUrl.isEmpty()) return;
        int ic = icon != 0 ? icon : android.R.drawable.ic_menu_send;
        RemoteInput ri = new RemoteInput.Builder("vt_reply").setLabel("Ta réponse").build();
        Notification.Action.Builder reply = new Notification.Action.Builder(Icon.createWithResource(ctx, ic), "Répondre", broadcast(ctx, m, "reply", 1, true))
            .addRemoteInput(ri).setAllowGeneratedReplies(true);
        if (Build.VERSION.SDK_INT >= 28) reply.setSemanticAction(Notification.Action.SEMANTIC_ACTION_REPLY);
        b.addAction(reply.build());
        Notification.Action.Builder read = new Notification.Action.Builder(Icon.createWithResource(ctx, ic), "Marquer comme lu", broadcast(ctx, m, "read", 2, false));
        if (Build.VERSION.SDK_INT >= 28) read.setSemanticAction(Notification.Action.SEMANTIC_ACTION_MARK_AS_READ);
        b.addAction(read.build());
    }

    /** Appel entrant : sonnerie insistante, écran d'appel par-dessus l'écran verrouillé, Répondre et Refuser. */
    @SuppressWarnings("deprecation")
    static void showCall(Context ctx, JSONObject m) throws Exception {
        Config c = cfg(ctx);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (m.optString("tag").isEmpty()) m.put("tag", "appel");
        String tag = m.optString("tag");
        String caller = m.optString("sender", m.optString("title"));
        if (caller.isEmpty()) caller = "Appel entrant";
        String text = m.optString("body");
        if (text.isEmpty() || text.equals(caller)) text = "Appel entrant";
        int icon = res(ctx, "vt_notification", "drawable");
        int ic = icon != 0 ? icon : android.R.drawable.ic_menu_call;
        int color = res(ctx, "vt_push_color", "color");
        PendingIntent full = activity(ctx, m, "incoming", 3);
        PendingIntent answer = activity(ctx, m, "accept", 4);
        PendingIntent decline = broadcast(ctx, m, "decline", 5, false);
        int timeout = m.optInt("timeout", 0) > 0 ? Math.min(120, m.optInt("timeout")) : c.pushCallTimeout;
        Bitmap av = avatar(m.optString("avatar"));
        for (int attempt = 0; attempt < 2; attempt++) {
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, CALLS) : new Notification.Builder(ctx);
            b.setSmallIcon(ic).setContentTitle(caller).setContentText(text)
                .setCategory(Notification.CATEGORY_CALL).setOngoing(true).setAutoCancel(false)
                .setFullScreenIntent(full, true).setContentIntent(full).setVisibility(Notification.VISIBILITY_PUBLIC);
            if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(timeout * 1000L);
            if (color != 0) b.setColor(ctx.getColor(color));
            boolean styled = false;
            if (attempt == 0 && Build.VERSION.SDK_INT >= 31) {
                Person.Builder p = new Person.Builder().setName(caller).setImportant(true);
                if (av != null) p.setIcon(Icon.createWithBitmap(av));
                b.setStyle(Notification.CallStyle.forIncomingCall(p.build(), decline, answer));
                styled = true;
            }
            if (!styled) {
                if (av != null) b.setLargeIcon(av);
                b.addAction(new Notification.Action.Builder(Icon.createWithResource(ctx, ic), "Refuser", decline).build());
                b.addAction(new Notification.Action.Builder(Icon.createWithResource(ctx, ic), "Répondre", answer).build());
            }
            if (Build.VERSION.SDK_INT < 26) {
                b.setPriority(Notification.PRIORITY_MAX);
                b.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), AudioManager.STREAM_RING);
                b.setVibrate(new long[]{0, 800, 600, 800, 600});
            }
            Notification n = b.build();
            n.flags |= Notification.FLAG_INSISTENT;
            try {
                nm.notify(tag, ID_CALL, n);
                return;
            } catch (Exception e) {
                // style d'appel refusé par le système : nouvel essai avec des boutons classiques
                if (attempt == 1) throw e;
            }
        }
    }

    // Historique d'une conversation (8 derniers messages), et dernier message reçu pour la réafficher.
    static synchronized JSONArray remember(Context ctx, String tag, JSONObject entry, JSONObject last) {
        SharedPreferences sp = ctx.getSharedPreferences(HISTORY, Context.MODE_PRIVATE);
        JSONArray h;
        try {
            h = new JSONArray(sp.getString(tag, "[]"));
        } catch (Exception e) {
            h = new JSONArray();
        }
        SharedPreferences.Editor ed = sp.edit();
        if (entry != null) {
            h.put(entry);
            while (h.length() > MAX_HISTORY) h.remove(0);
            ed.putString(tag, h.toString());
        }
        if (last != null) ed.putString(tag + "#m", last.toString());
        ed.apply();
        return h;
    }

    static synchronized void forget(Context ctx, String tag) {
        SharedPreferences sp = ctx.getSharedPreferences(HISTORY, Context.MODE_PRIVATE);
        if (tag == null || tag.isEmpty()) sp.edit().clear().apply();
        else sp.edit().remove(tag).remove(tag + "#m").apply();
    }

    /** Retire la notification d'une conversation ou d'un appel (tag), ou toutes celles de l'application (tag vide). */
    static void cancel(Context ctx, String tag) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (tag == null || tag.isEmpty()) nm.cancelAll();
            else {
                nm.cancel(tag, ID_MESSAGE);
                nm.cancel(tag, ID_CALL);
                // Notification affichée par Firebase lui-même (bloc « notification » avec tag, application fermée).
                nm.cancel(tag, 0);
            }
        } catch (Exception ignored) {
            // rien à retirer
        }
        forget(ctx, tag);
    }

    private static Bitmap avatar(String url) {
        if (url == null || !url.startsWith("https://")) return null;
        Bitmap b = avatars.get(url);
        if (b != null) return b;
        if (Looper.myLooper() == Looper.getMainLooper()) return null;
        b = fetchBitmap(url);
        if (b != null) {
            if (avatars.size() > 40) avatars.clear();
            avatars.put(url, b);
        }
        return b;
    }

    static Bitmap fetchBitmap(String u) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
            c.setConnectTimeout(6000);
            c.setReadTimeout(8000);
            try (InputStream in = c.getInputStream()) { return BitmapFactory.decodeStream(in); }
        } catch (Exception e) {
            return null;
        }
    }

    // ================================================================== actions des notifications
    /** Répondre, Marquer comme lu, Refuser un appel, notification balayée (PushAction, hors du fil principal). */
    static void action(Context ctx, Intent intent) {
        String action = intent.getStringExtra("vt_action");
        JSONObject m;
        try {
            m = new JSONObject(intent.getStringExtra("vt_msg") == null ? "{}" : intent.getStringExtra("vt_msg"));
        } catch (Exception e) {
            m = new JSONObject();
        }
        String tag = m.optString("tag");
        if ("dismiss".equals(action)) { forget(ctx, tag); return; }
        String text = null;
        if ("reply".equals(action)) {
            Bundle r = RemoteInput.getResultsFromIntent(intent);
            CharSequence cs = r == null ? null : r.getCharSequence("vt_reply");
            text = cs == null ? "" : cs.toString().trim();
            if (text.isEmpty()) return;
        }
        Config c = cfg(ctx);
        boolean ok = false;
        if (!c.pushActionUrl.isEmpty()) {
            try {
                JSONObject body = new JSONObject();
                body.put("action", action);
                body.put("tag", tag);
                if (text != null) body.put("text", text);
                body.put("key", m.optString("key"));
                body.put("message", m);
                body.put("token", token == null ? prefs(ctx).getString("token", "") : token);
                body.put("package", ctx.getPackageName());
                body.put("app", c.appName);
                body.put("at", System.currentTimeMillis());
                int code = post(c.pushActionUrl, body, null);
                ok = code >= 200 && code < 300;
            } catch (Exception ignored) {
                ok = false;
            }
        }
        if ("reply".equals(action)) {
            // La réponse s'ajoute à la conversation, ou signale l'échec : Android arrête alors l'indicateur d'envoi.
            try {
                JSONObject mine = new JSONObject().put("me", true).put("text", ok ? text : text + " (non envoyé)").put("at", System.currentTimeMillis());
                remember(ctx, tag, mine, null);
                String last = ctx.getSharedPreferences(HISTORY, Context.MODE_PRIVATE).getString(tag + "#m", null);
                show(ctx, last == null ? m : new JSONObject(last), true, false);
            } catch (Exception ignored) {
                cancel(ctx, tag);
            }
        } else {
            cancel(ctx, tag);
        }
        try {
            JSONObject d = new JSONObject().put("type", "action").put("action", action).put("tag", tag).put("ok", ok).put("message", m);
            if (text != null) d.put("text", text);
            if (pageReady()) page(d.toString());
            else queue(ctx, d);
        } catch (Exception ignored) {
            // page non prévenue
        }
    }

    // ================================================================== serveur du site
    private static boolean safeHeader(String k) {
        String h = k == null ? "" : k.trim().toLowerCase(Locale.ROOT);
        return !h.isEmpty() && h.matches("[a-z0-9-]+") && !h.equals("host") && !h.equals("content-length") && !h.equals("cookie") && !h.equals("content-type");
    }

    /** POST JSON vers le site, avec ses cookies (session de l'utilisateur dans l'application) en https. */
    static int post(String url, JSONObject body, JSONObject headers) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            c.setRequestProperty("X-Nexora-Push", "1");
            if (url.startsWith("https://")) {
                String cookies = null;
                try {
                    cookies = CookieManager.getInstance().getCookie(url);
                } catch (Throwable ignored) {
                    // moteur de page indisponible : envoi sans cookies
                }
                if (cookies != null && !cookies.isEmpty()) c.setRequestProperty("Cookie", cookies);
            }
            if (headers != null) {
                for (Iterator<String> it = headers.keys(); it.hasNext();) {
                    String k = it.next();
                    if (safeHeader(k)) c.setRequestProperty(k, headers.optString(k));
                }
            }
            try (OutputStream os = c.getOutputStream()) { os.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            return c.getResponseCode();
        } catch (Exception e) {
            return -1;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** Envoie le jeton à l'adresse d'enregistrement : event = register | unregister. Renvoie le code HTTP. */
    static int registerNow(Context ctx, String event, JSONObject fields, JSONObject headers, String tok) {
        Config c = cfg(ctx);
        String t = tok != null ? tok : token;
        if (c.pushRegisterUrl.isEmpty() || t == null || t.isEmpty()) return 0;
        try {
            JSONObject o = new JSONObject();
            String saved = prefs(ctx).getString("regFields", null);
            if (saved != null) {
                JSONObject f = new JSONObject(saved);
                for (Iterator<String> it = f.keys(); it.hasNext();) { String k = it.next(); o.put(k, f.get(k)); }
            }
            if (fields != null) for (Iterator<String> it = fields.keys(); it.hasNext();) { String k = it.next(); o.put(k, fields.get(k)); }
            o.put("event", event);
            o.put("token", t);
            o.put("platform", "android");
            o.put("package", ctx.getPackageName());
            o.put("app", c.appName);
            o.put("model", Build.MODEL);
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("locale", Locale.getDefault().toLanguageTag());
            int code = post(c.pushRegisterUrl, o, headers);
            boolean ok = code >= 200 && code < 300;
            if ("register".equals(event)) {
                if (ok) prefs(ctx).edit().remove("regRetry").apply();
                else prefs(ctx).edit().putBoolean("regRetry", true).apply();
            }
            return code;
        } catch (Exception e) {
            return -1;
        }
    }

    static void registerAsync(final Context ctx, final String event, final JSONObject fields, final JSONObject headers) {
        final Context app = ctx.getApplicationContext();
        new Thread(() -> registerNow(app, event, fields, headers, null)).start();
    }

    /** NexoraApp.push.register({ fields, headers }) : après la connexion, le jeton part avec la session. */
    static void registerFromPage(final MainActivity a, final String json, final String id) {
        final Context app = a.getApplicationContext();
        new Thread(() -> {
            try {
                JSONObject o = new JSONObject(json == null || json.isEmpty() ? "{}" : json);
                if (cfg(app).pushRegisterUrl.isEmpty()) {
                    a.resolve(id, false, JSONObject.quote("Aucune adresse d'enregistrement : indique-la dans l'App Builder (section Notifications push)."));
                    return;
                }
                if (token == null) {
                    a.resolve(id, false, JSONObject.quote("Jeton indisponible : appelle d'abord NexoraApp.push.getToken()."));
                    return;
                }
                JSONObject fields = o.optJSONObject("fields");
                if (fields != null) prefs(app).edit().putString("regFields", fields.toString()).apply();
                int code = registerNow(app, "register", null, o.optJSONObject("headers"), null);
                if (code >= 200 && code < 300) a.resolve(id, true, "true");
                else a.resolve(id, false, JSONObject.quote(code < 0 ? "Adresse d'enregistrement injoignable." : "L'adresse d'enregistrement a répondu " + code + "."));
            } catch (Exception e) {
                a.resolve(id, false, JSONObject.quote("Enregistrement impossible : " + e.getMessage()));
            }
        }).start();
    }

    /** Déconnexion : désinscription auprès du site, jeton supprimé chez Firebase, notifications et messages retirés. */
    static void deleteToken(final MainActivity a, final String id) {
        final Context app = a.getApplicationContext();
        new Thread(() -> {
            String old = token != null ? token : prefs(app).getString("token", null);
            if (old != null) registerNow(app, "unregister", null, null, old);
            boolean ok = true;
            String err = null;
            if (available()) {
                try {
                    Object inst = messaging();
                    Object task = inst.getClass().getMethod("deleteToken").invoke(inst);
                    Class<?> tasks = Class.forName("com.google.android.gms.tasks.Tasks");
                    tasks.getMethod("await", Class.forName("com.google.android.gms.tasks.Task"), long.class, TimeUnit.class).invoke(null, task, 15L, TimeUnit.SECONDS);
                } catch (Throwable t) {
                    ok = false;
                    Throwable r = t.getCause() != null ? t.getCause() : t;
                    err = r.getClass().getSimpleName() + ": " + r.getMessage();
                }
            }
            token = null;
            prefs(app).edit().remove("token").remove("regFields").remove("topics").remove("untopics").remove("queue").remove("regRetry").putBoolean("resub", true).apply();
            cancel(app, null);
            page("{\"type\":\"token\",\"token\":null}");
            a.resolve(id, ok, ok ? "true" : JSONObject.quote("Jeton non supprimé : " + err));
        }).start();
    }

    // ================================================================== sujets
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

    static void subscribe(String t, boolean on, MainActivity a, String id) {
        try {
            Object inst = messaging();
            inst.getClass().getMethod(on ? "subscribeToTopic" : "unsubscribeFromTopic", String.class).invoke(inst, topic(a, t));
            String clean = t.replaceAll("^/topics/", "");
            Set<String> mine = new HashSet<>(prefs(a).getStringSet("topics", new HashSet<>()));
            Set<String> left = new HashSet<>(prefs(a).getStringSet("untopics", new HashSet<>()));
            if (on) { mine.add(clean); left.remove(clean); } else { mine.remove(clean); left.add(clean); }
            prefs(a).edit().putStringSet("topics", mine).putStringSet("untopics", left).apply();
            a.resolve(id, true, "true");
        } catch (Throwable e) {
            a.resolve(id, false, JSONObject.quote("Notifications push indisponibles"));
        }
    }

    // ================================================================== état et réglages
    static String state(MainActivity a) {
        JSONObject o = new JSONObject();
        try {
            Config c = a.cfg;
            o.put("enabled", c.push);
            o.put("available", available());
            o.put("token", token == null ? JSONObject.NULL : token);
            o.put("error", error == null ? JSONObject.NULL : error);
            o.put("permission", Build.VERSION.SDK_INT < 33 || a.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED);
            o.put("app", a.getPackageName());
            o.put("topicPrefix", prefix(a));
            o.put("foreground", foreground);
            o.put("active", activeTag);
            o.put("showWhenOpen", showWhenOpen);
            o.put("register", !c.pushRegisterUrl.isEmpty());
            o.put("actions", !c.pushActionUrl.isEmpty());
            o.put("messaging", c.pushMessaging);
            o.put("calls", c.pushCalls);
            boolean fsi = true;
            if (Build.VERSION.SDK_INT >= 34) {
                NotificationManager nm = (NotificationManager) a.getSystemService(Context.NOTIFICATION_SERVICE);
                fsi = nm.canUseFullScreenIntent();
            }
            o.put("fullScreen", fsi);
            JSONArray ch = new JSONArray();
            ch.put(new JSONObject().put("id", DEFAULT).put("name", c.pushChannel));
            for (String[] x : c.pushChannels) ch.put(new JSONObject().put("id", x[0]).put("name", x[1]).put("importance", x[2]));
            if (c.pushCalls) ch.put(new JSONObject().put("id", CALLS).put("name", "Appels"));
            o.put("channels", ch);
        } catch (Exception ignored) {
            // état partiel
        }
        return o.toString();
    }

    /** Réglages Android : notifications de l'application ou d'une catégorie, écran d'appel, économie de batterie. */
    static void openSettings(MainActivity a, String what, String channel) {
        String pkg = a.getPackageName();
        String w = what == null ? "" : what;
        Intent i;
        if ("battery".equals(w)) i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
        else if ("fullscreen".equals(w) && Build.VERSION.SDK_INT >= 34) i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + pkg));
        else if ("channel".equals(w) && Build.VERSION.SDK_INT >= 26 && channel != null && !channel.isEmpty()) {
            i = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg).putExtra(Settings.EXTRA_CHANNEL_ID, channelFor(a, channel));
        } else if (Build.VERSION.SDK_INT >= 26) i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
        else i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
        try {
            a.startActivity(i);
        } catch (Exception e) {
            try {
                a.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)));
            } catch (Exception ignored) {
                // réglages introuvables
            }
        }
    }
}
