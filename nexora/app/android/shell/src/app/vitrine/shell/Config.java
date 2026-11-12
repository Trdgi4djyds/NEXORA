package app.vitrine.shell;

import android.content.Context;
import android.graphics.Color;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/** Réglages de l'application, écrits par NEXORA dans assets/vitrine/config.json. */
final class Config {
    String startUrl = "https://example.com/";
    String mode = "remote"; // remote : site en ligne ; local : fichiers intégrés à l'application
    String publicUrl = "";
    final List<String> hosts = new ArrayList<>();
    String externalLinks = "browser"; // browser | inapp
    String uaSuffix = "";
    String statusMode = "auto"; // auto | color | overlay
    int statusColor = Color.WHITE;
    String navMode = "auto"; // auto | color
    int navColor = Color.WHITE;
    int bgColor = Color.WHITE;
    int accent = 0xFF007AFF;
    int splashBg = Color.WHITE;
    int splashMin = 500;
    int splashMax = 6000;
    boolean pullToRefresh = true;
    boolean zoom = false;
    boolean debug = false;
    boolean secure = false;
    boolean keepAwake = false;
    boolean fullscreen = false;
    boolean progressBar = true;
    String back = "history"; // history | exit | confirm
    String cache = "default"; // default | network | offline-first
    String injectCss = "";
    String injectJs = "";
    boolean askAtStart = false;
    boolean push = false;
    boolean pushAsk = true;
    String pushChannel = "Notifications";
    String pushRegisterUrl = "";
    final List<String> pushTopics = new ArrayList<>();
    // NEXORA #073 : messagerie. Adresse des actions (réponse, lu, refus d'appel), notifications quand
    // l'application est à l'écran, style conversation et appels entrants (offre Pro), catégories de notifications.
    String pushActionUrl = "";
    boolean pushShowWhenOpen = true;
    boolean pushMessaging = false;
    boolean pushCalls = false;
    int pushCallTimeout = 45;
    final List<String[]> pushChannels = new ArrayList<>(); // [identifiant, nom, importance : high | default | low]
    final List<String> permissions = new ArrayList<>();
    boolean downloads = true;
    // Notifications locales d'événements (sans serveur) : l'application elle-même affiche une notification système.
    boolean notifyNetwork = false;   // connexion perdue / rétablie
    boolean notifyDownload = true;    // fin d'un téléchargement (géré par Android)
    boolean notifyUpdate = true;      // une mise à jour de l'application est disponible (réglages à distance)
    String eventChannel = "Activité";
    // Orientation : réglage du téléphone, réglage tablette (vide = le même), page autorisée à la changer.
    String orientPhone = "unspecified";
    String orientTablet = "";
    boolean orientJs = true;
    boolean fileUpload = true;
    boolean offlinePage = true;
    String offlineTitle = "Pas de connexion";
    String offlineText = "Vérifiez votre connexion Internet, puis réessayez.";
    String offlineButton = "Réessayer";
    final List<Tab> tabs = new ArrayList<>();
    int tabBg = Color.WHITE;
    int tabActive = 0xFF007AFF;
    int tabInactive = 0xFF8E8E93;
    String appName = "";
    String loader = "bar"; // bar | spinner | none
    String splashAnim = "fade"; // fade | zoom | slideUp | shrink | reveal | blur | none
    String splashIntro = "none"; // none | pop | fadeUp | zoomOut | spin | flip | bounce | swing | pulse | heartbeat | shine | glow | typewriter | blurIn
    boolean splashName = false;
    String splashTagline = "";
    int splashTextColor = 0;
    int splashLogoSize = 150;
    String splashHideOn = "load"; // load | js
    boolean clipboard = true;
    boolean inAppBrowser = true;
    final List<String[]> linkRules = new ArrayList<>(); // [motif, action] action : app | browser | inapp
    JSONObject fab;
    JSONObject menu;
    JSONObject onboarding;
    JSONObject modal;
    String remoteUrl = ""; // réglages à distance (JSON publié par le propriétaire de l'application)
    JSONObject passcode;
    JSONObject raw = new JSONObject();

    static final class Tab {
        String label;
        String icon;
        String url;
    }

    static Config load(Context ctx) {
        Config c = new Config();
        try (InputStream in = ctx.getAssets().open("vitrine/config.json")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            JSONObject j = new JSONObject(out.toString("UTF-8"));
            c.startUrl = j.optString("startUrl", c.startUrl);
            JSONObject pu = j.optJSONObject("push");
            if (pu != null && pu.optBoolean("enabled")) {
                c.push = true;
                c.pushAsk = pu.optBoolean("ask", true);
                c.pushChannel = pu.optString("channel", c.pushChannel);
                c.pushRegisterUrl = pu.optString("registerUrl", "");
                JSONArray tp = pu.optJSONArray("topics");
                if (tp != null) for (int i = 0; i < tp.length(); i++) c.pushTopics.add(tp.optString(i));
                c.pushActionUrl = pu.optString("actionUrl", "");
                c.pushShowWhenOpen = pu.optBoolean("showWhenOpen", true);
                c.pushMessaging = pu.optBoolean("messaging", false);
                c.pushCalls = c.pushMessaging && pu.optBoolean("calls", false);
                c.pushCallTimeout = Math.max(10, Math.min(120, pu.optInt("callTimeout", 45)));
                JSONArray ch = pu.optJSONArray("channels");
                if (ch != null) {
                    for (int i = 0; i < ch.length(); i++) {
                        JSONObject o = ch.optJSONObject(i);
                        if (o == null || o.optString("id").isEmpty()) continue;
                        c.pushChannels.add(new String[]{o.optString("id"), o.optString("name", o.optString("id")), o.optString("importance", "default")});
                    }
                }
            }
            c.mode = j.optString("mode", c.mode);
            c.publicUrl = j.optString("publicUrl", "");
            JSONArray h = j.optJSONArray("hosts");
            if (h != null) for (int i = 0; i < h.length(); i++) c.hosts.add(h.optString(i).toLowerCase());
            c.externalLinks = j.optString("externalLinks", c.externalLinks);
            c.uaSuffix = j.optString("uaSuffix", "");
            c.statusMode = j.optString("statusMode", c.statusMode);
            c.statusColor = color(j.optString("statusColor"), c.statusColor);
            c.navMode = j.optString("navMode", c.navMode);
            c.navColor = color(j.optString("navColor"), c.navColor);
            c.bgColor = color(j.optString("bgColor"), c.bgColor);
            c.accent = color(j.optString("accent"), c.accent);
            c.splashBg = color(j.optString("splashBg"), c.splashBg);
            c.splashMin = j.optInt("splashMin", c.splashMin);
            c.splashMax = j.optInt("splashMax", c.splashMax);
            c.pullToRefresh = j.optBoolean("pullToRefresh", c.pullToRefresh);
            c.zoom = j.optBoolean("zoom", c.zoom);
            c.debug = j.optBoolean("debug", c.debug);
            c.secure = j.optBoolean("secure", c.secure);
            c.keepAwake = j.optBoolean("keepAwake", c.keepAwake);
            c.fullscreen = j.optBoolean("fullscreen", c.fullscreen);
            c.progressBar = j.optBoolean("progressBar", c.progressBar);
            c.back = j.optString("back", c.back);
            c.cache = j.optString("cache", c.cache);
            c.injectCss = j.optString("injectCss", "");
            c.injectJs = j.optString("injectJs", "");
            c.askAtStart = j.optBoolean("askAtStart", false);
            JSONArray p = j.optJSONArray("permissions");
            if (p != null) for (int i = 0; i < p.length(); i++) c.permissions.add(p.optString(i));
            c.downloads = j.optBoolean("downloads", true);
            JSONObject ev = j.optJSONObject("events");
            if (ev != null) {
                c.notifyNetwork = ev.optBoolean("network", c.notifyNetwork);
                c.notifyDownload = ev.optBoolean("download", c.notifyDownload);
                c.notifyUpdate = ev.optBoolean("update", c.notifyUpdate);
                c.eventChannel = ev.optString("channel", c.eventChannel);
            }
            JSONObject or = j.optJSONObject("orientation");
            if (or != null) {
                c.orientPhone = or.optString("phone", c.orientPhone);
                c.orientTablet = or.optString("tablet", "");
                c.orientJs = or.optBoolean("js", true);
            }
            c.fileUpload = j.optBoolean("fileUpload", true);
            c.offlinePage = j.optBoolean("offlinePage", true);
            c.offlineTitle = j.optString("offlineTitle", c.offlineTitle);
            c.offlineText = j.optString("offlineText", c.offlineText);
            c.offlineButton = j.optString("offlineButton", c.offlineButton);
            JSONArray t = j.optJSONArray("tabs");
            if (t != null) {
                for (int i = 0; i < t.length(); i++) {
                    JSONObject o = t.optJSONObject(i);
                    if (o == null) continue;
                    Tab tab = new Tab();
                    tab.label = o.optString("label", "");
                    tab.icon = o.optString("icon", "home");
                    tab.url = o.optString("url", c.startUrl);
                    c.tabs.add(tab);
                }
            }
            c.tabBg = color(j.optString("tabBg"), c.tabBg);
            c.tabActive = color(j.optString("tabActive"), c.tabActive);
            c.tabInactive = color(j.optString("tabInactive"), c.tabInactive);
            c.appName = j.optString("appName", "");
            c.loader = j.optString("loader", c.loader);
            c.splashAnim = j.optString("splashAnim", c.splashAnim);
            c.splashIntro = j.optString("splashIntro", c.splashIntro);
            c.splashName = j.optBoolean("splashName", false);
            c.splashTagline = j.optString("splashTagline", "");
            c.splashTextColor = j.has("splashTextColor") && j.optString("splashTextColor").length() > 0 ? color(j.optString("splashTextColor"), 0) : 0;
            c.splashLogoSize = Math.max(64, Math.min(260, j.optInt("splashLogoSize", 150)));
            c.splashHideOn = j.optString("splashHideOn", c.splashHideOn);
            c.clipboard = j.optBoolean("clipboard", true);
            c.inAppBrowser = j.optBoolean("inAppBrowser", true);
            JSONArray lr = j.optJSONArray("linkRules");
            if (lr != null) {
                for (int i = 0; i < lr.length(); i++) {
                    JSONObject o = lr.optJSONObject(i);
                    if (o != null && !o.optString("pattern").isEmpty()) c.linkRules.add(new String[]{o.optString("pattern"), o.optString("action", "app")});
                }
            }
            c.fab = j.optJSONObject("fab");
            c.menu = j.optJSONObject("menu");
            c.onboarding = j.optJSONObject("onboarding");
            c.modal = j.optJSONObject("modal");
            c.remoteUrl = j.optString("remoteUrl", "");
            c.passcode = j.optJSONObject("passcode");
            c.raw = j;
        } catch (Exception ignored) {
            // Réglages par défaut.
        }
        return c;
    }

    boolean has(String permission) {
        return permissions.contains(permission);
    }

    static int color(String s, int fallback) {
        if (s == null || s.isEmpty()) return fallback;
        try {
            return Color.parseColor(s.trim());
        } catch (Exception e) {
            return fallback;
        }
    }
}
