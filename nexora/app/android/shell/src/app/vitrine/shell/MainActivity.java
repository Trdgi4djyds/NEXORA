package app.vitrine.shell;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.hardware.biometrics.BiometricPrompt;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.ContactsContract;
import android.provider.MediaStore;
import android.text.TextUtils;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Application Android générée par NEXORA : une WebView plein écran avec les fonctions natives
 * (autorisations, appareil photo, fichiers, téléchargements, notifications, partage, biométrie…).
 * Tout est construit en code : aucune ressource n'est référencée par identifiant compilé, ce qui
 * permet de réutiliser ce même code pour chaque application (les ressources sont générées par NEXORA).
 */
public class MainActivity extends Activity {
    static final int REQ_FILE = 41;
    static final int REQ_CONTACT = 42;
    static final int REQ_PERM_BASE = 100;

    Config cfg;
    FrameLayout root;
    LinearLayout column;
    View statusBg;
    View navBg;
    FrameLayout main;
    WebView web;
    PullRefresh pull;
    ProgressBar progress;
    LinearLayout tabs;
    View offline;
    View splash;
    View customView;
    WebChromeClient.CustomViewCallback customViewCallback;
    final Handler ui = new Handler(Looper.getMainLooper());
    final Map<Integer, PermissionCallback> permCallbacks = new HashMap<>();
    int permSeq = 0;
    ValueCallback<Uri[]> fileCallback;
    Uri cameraUri;
    String contactCallbackId;
    boolean splashHidden;
    long startedAt;
    volatile String currentHost = "";
    int insetTop;
    int insetBottom;
    int imeBottom;
    boolean lastFailed;
    long backPressedAt;
    String pendingUrl;
    LocalAssets local;
    String bridgeJs = "";
    int lastTopColor = 0;
    final Map<String, ByteArrayOutputStream> uploads = new HashMap<>();
    final Map<String, String[]> uploadMeta = new HashMap<>();
    ConnectivityManager.NetworkCallback netCallback;
    volatile boolean netUp = true; // état réseau connu, pour notifier les transitions perdu/rétabli
    Extras extras;
    Wtn wtn;
    boolean manualStatus;
    ProgressBar spinner;
    FrameLayout scanner;
    WebView scannerWeb;
    static final int REQ_VOICE = Wtn.REQ_VOICE;

    interface PermissionCallback {
        void done(boolean granted);
    }

    // ================================================================== cycle de vie
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        startedAt = System.currentTimeMillis();
        installCrashGuard();
        // Deux fermetures inattendues de suite au démarrage : mode sans échec (page seule, sans les extras).
        android.content.SharedPreferences crash = getSharedPreferences("vt_crash", MODE_PRIVATE);
        safeMode = crash.getInt("count", 0) >= 2 && startedAt - crash.getLong("at", 0) < 180000;
        try {
            cfg = Config.load(this);
        } catch (Throwable t) {
            cfg = new Config();
            note("config", t);
        }
        if (safeMode) { cfg.injectJs = ""; cfg.injectCss = ""; cfg.askAtStart = false; }
        applyDefaultOrientation();
        try {
            if ("local".equals(cfg.mode)) local = new LocalAssets(getAssets());
        } catch (Throwable t) { note("assets", t); }
        bridgeJs = readAsset("vitrine/bridge.js");
        Window w = getWindow();
        if (cfg.secure) w.addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        if (cfg.keepAwake) w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        step("edge", () -> setupEdgeToEdge(w));
        try {
            buildViews();
        } catch (Throwable t) {
            // Le plus souvent : composant WebView d'Android absent, désactivé ou en cours de mise à jour.
            note("webview", t);
            showFatal("Impossible d'afficher l'application",
                "Le composant « Android System WebView » est indisponible ou en cours de mise à jour. Mets-le à jour depuis le Play Store, puis relance l'application.");
            return;
        }
        extras = new Extras(this);
        wtn = new Wtn(this);
        try {
            setupWebView();
        } catch (Throwable t) {
            note("webview-setup", t);
        }
        if (!safeMode) step("extras", () -> extras.build());
        step("back", this::setupBack);
        step("network", this::watchNetwork);
        String url = urlFromIntent(getIntent());
        if (state != null && !safeMode) {
            try { web.restoreState(state); } catch (Throwable t) { note("restore", t); }
        }
        if (state == null || safeMode || web.getUrl() == null) load(url != null ? url : cfg.startUrl);
        ui.postDelayed(() -> hideSplash(true), safeMode ? 600 : Math.max(cfg.splashMax, 1500));
        if (cfg.askAtStart) step("permissions", () -> requestRuntime(runtimePermissions(cfg.permissions), granted -> { }));
        // Notifications d'événements locaux (réseau, mise à jour) sans push : demander l'autorisation une fois.
        if (!safeMode && !cfg.push && !cfg.askAtStart && (cfg.notifyNetwork || cfg.notifyUpdate) && Build.VERSION.SDK_INT >= 33)
            step("event-perm", () -> { if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) requestRuntime(new String[]{Manifest.permission.POST_NOTIFICATIONS}, g -> { }); });
        if (!safeMode) step("push", () -> Push.start(this));
        if (!safeMode) step("remote", this::remoteSettings);
        // Démarrage réussi : 20 s sans fermeture remettent le compteur à zéro.
        ui.postDelayed(() -> getSharedPreferences("vt_crash", MODE_PRIVATE).edit().putInt("count", 0).apply(), 20000);
        if (safeMode) {
            ui.postDelayed(() -> Toast.makeText(this, "Application relancée en mode simplifié après une erreur.", Toast.LENGTH_LONG).show(), 800);
            if (cfg.debug) ui.postDelayed(this::showCrashReport, 1500);
        }
    }

    // ================================================================== réglages à distance
    // Le propriétaire publie un petit fichier JSON (annonce, maintenance, version minimale, adresse de départ) :
    // l'application le lit au démarrage, en arrière-plan, sans reconstruction ni nouvelle publication.
    void remoteSettings() {
        if (cfg.remoteUrl == null || cfg.remoteUrl.isEmpty()) return;
        final android.content.SharedPreferences sp = getSharedPreferences("vt_remote", MODE_PRIVATE);
        String cached = sp.getString("json", null);
        if (cached != null) { try { applyRemote(new JSONObject(cached), true); } catch (Exception ignored) { /* cache illisible */ } }
        new Thread(() -> {
            try {
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(cfg.remoteUrl + (cfg.remoteUrl.contains("?") ? "&" : "?") + "t=" + (System.currentTimeMillis() / 60000)).openConnection();
                c.setConnectTimeout(5000); c.setReadTimeout(5000); c.setUseCaches(false);
                if (c.getResponseCode() != 200) return;
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                try (InputStream in = c.getInputStream()) { byte[] b = new byte[8192]; int n; while ((n = in.read(b)) > 0 && out.size() < 200000) out.write(b, 0, n); }
                final String txt = out.toString("UTF-8");
                final JSONObject j = new JSONObject(txt);
                sp.edit().putString("json", txt).apply();
                ui.post(() -> { try { applyRemote(j, false); } catch (Throwable t) { note("remote", t); } });
            } catch (Throwable t) {
                note("remote-fetch", t);
            }
        }).start();
    }

    private boolean remoteShown;

    void applyRemote(JSONObject j, boolean fromCache) {
        long ver = 0;
        try { PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0); ver = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode; } catch (Exception ignored) { /* version inconnue */ }
        JSONObject maint = j.optJSONObject("maintenance");
        if (maint != null && maint.optBoolean("enabled")) {
            showFatal(maint.optString("title", "Maintenance en cours"), maint.optString("text", "L'application revient très vite. Merci de ta patience."));
            return;
        }
        if (remoteShown) return;
        long min = j.optLong("minVersionCode", 0);
        if (min > ver) {
            remoteShown = true;
            final String store = j.optString("updateUrl", "https://play.google.com/store/apps/details?id=" + getPackageName());
            // Mise à jour non obligatoire : une notification locale reste après fermeture de la boîte de dialogue.
            if (cfg.notifyUpdate && !j.optBoolean("forceUpdate", false)) eventNotify(992, j.optString("updateTitle", "Mise à jour disponible"), j.optString("updateText", "Une nouvelle version de l'application est disponible."));
            new android.app.AlertDialog.Builder(this).setTitle(j.optString("updateTitle", "Mise à jour nécessaire"))
                .setMessage(j.optString("updateText", "Une nouvelle version de l'application est disponible. Mets-la à jour pour continuer."))
                .setCancelable(!j.optBoolean("forceUpdate", false))
                .setPositiveButton("Mettre à jour", (d, w) -> { try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(store))); } catch (Exception ignored) { /* aucun magasin */ } if (j.optBoolean("forceUpdate", false)) finish(); })
                .setNegativeButton(j.optBoolean("forceUpdate", false) ? null : "Plus tard", null).show();
            return;
        }
        JSONObject ann = j.optJSONObject("announcement");
        if (ann != null && ann.optBoolean("enabled", true) && !ann.optString("title").isEmpty() && extras != null) {
            String key = "remote_ann_" + ann.optString("id", ann.optString("title"));
            android.content.SharedPreferences sp = getSharedPreferences("vt_remote", MODE_PRIVATE);
            if (!sp.getBoolean(key, false) || "always".equals(ann.optString("frequency"))) {
                sp.edit().putBoolean(key, true).apply();
                remoteShown = true;
                try { JSONObject m = new JSONObject(ann.toString()); m.put("enabled", true); extras.showModal(m); } catch (Exception ignored) { /* annonce illisible */ }
            }
        }
        String start = j.optString("startUrl", "");
        if (!fromCache && !start.isEmpty() && web != null && web.getUrl() != null && web.getUrl().equals(cfg.startUrl)) { cfg.startUrl = start; load(start); }
    }

    // ================================================================== robustesse
    boolean safeMode;
    private static boolean crashGuard;

    /** Enregistre toute fermeture inattendue (trace dans les préférences et dans Android/data/<paquet>/files). */
    void installCrashGuard() {
        if (crashGuard) return;
        crashGuard = true;
        final Context app = getApplicationContext();
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((th, e) -> {
            try {
                StringWriter sw = new StringWriter();
                e.printStackTrace(new PrintWriter(sw));
                String trace = "NEXORA " + Build.MANUFACTURER + " " + Build.MODEL + " Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")\n" + sw;
                android.content.SharedPreferences sp = app.getSharedPreferences("vt_crash", MODE_PRIVATE);
                long now = System.currentTimeMillis();
                int n = now - sp.getLong("at", 0) < 180000 ? sp.getInt("count", 0) + 1 : 1;
                sp.edit().putString("trace", trace.length() > 8000 ? trace.substring(0, 8000) : trace).putLong("at", now).putInt("count", n).commit();
                File dir = app.getExternalFilesDir(null);
                if (dir != null) {
                    try (FileOutputStream out = new FileOutputStream(new File(dir, "nexora-crash.txt"))) {
                        out.write(trace.getBytes("UTF-8"));
                    }
                }
            } catch (Throwable ignored) {
                // rien de plus à faire
            }
            if (prev != null) prev.uncaughtException(th, e);
            else {
                android.os.Process.killProcess(android.os.Process.myPid());
                System.exit(10);
            }
        });
    }

    interface Step {
        void run() throws Exception;
    }

    /** Étape facultative du démarrage : une erreur est notée, l'application continue. */
    void step(String name, Step s) {
        try {
            s.run();
        } catch (Throwable t) {
            note(name, t);
        }
    }

    void note(String where, Throwable t) {
        try {
            String msg = where + " : " + t.getClass().getSimpleName() + " " + t.getMessage();
            android.util.Log.w("NEXORA", msg, t);
            android.content.SharedPreferences sp = getSharedPreferences("vt_crash", MODE_PRIVATE);
            String prev = sp.getString("warnings", "");
            String all = msg + "\n" + prev;
            sp.edit().putString("warnings", all.length() > 4000 ? all.substring(0, 4000) : all).apply();
        } catch (Throwable ignored) {
            // journal indisponible
        }
    }

    String crashReport() {
        android.content.SharedPreferences sp = getSharedPreferences("vt_crash", MODE_PRIVATE);
        return sp.getString("trace", "") + (sp.getString("warnings", "").isEmpty() ? "" : "\n--- Avertissements ---\n" + sp.getString("warnings", ""));
    }

    void showCrashReport() {
        try {
            String r = crashReport();
            if (r.isEmpty()) return;
            new android.app.AlertDialog.Builder(this).setTitle("Rapport d'erreur").setMessage(r.length() > 3000 ? r.substring(0, 3000) : r)
                .setPositiveButton("OK", null).show();
        } catch (Throwable ignored) {
            // fenêtre impossible
        }
    }

    /** Écran d'erreur natif (aucune WebView disponible). */
    void showFatal(String title, String text) {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(android.view.Gravity.CENTER);
        col.setPadding(dp(32), dp(32), dp(32), dp(32));
        col.setBackgroundColor(0xFFF5F5F7);
        TextView t = new TextView(this);
        t.setText(title);
        t.setTextSize(20);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setTextColor(0xFF1D1D1F);
        t.setGravity(android.view.Gravity.CENTER);
        col.addView(t);
        TextView b = new TextView(this);
        b.setText(text);
        b.setTextSize(15);
        b.setTextColor(0xFF555555);
        b.setGravity(android.view.Gravity.CENTER);
        b.setPadding(0, dp(12), 0, dp(20));
        col.addView(b);
        android.widget.Button retry = new android.widget.Button(this);
        retry.setText("Réessayer");
        retry.setOnClickListener(v -> recreate());
        col.addView(retry);
        setContentView(col);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String url = urlFromIntent(intent);
        if (url != null) load(url);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        if (extras != null) step("resume", () -> extras.onResume());
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        if (extras != null) step("pause", () -> extras.onPause());
        step("cookies", () -> CookieManager.getInstance().flush());
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (netCallback != null) {
            try {
                ((ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE)).unregisterNetworkCallback(netCallback);
            } catch (Exception ignored) {
                // déjà désinscrit
            }
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    // ================================================================== affichage bord à bord
    @SuppressWarnings("deprecation")
    void setupEdgeToEdge(Window w) {
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
        if (Build.VERSION.SDK_INT < 35) {
            w.setStatusBarColor(Color.TRANSPARENT);
            w.setNavigationBarColor(Color.TRANSPARENT);
        }
        if (Build.VERSION.SDK_INT >= 29) {
            w.setStatusBarContrastEnforced(false);
            w.setNavigationBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= 30 ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }
        if (cfg.fullscreen) hideSystemBars(w);
    }

    @SuppressWarnings("deprecation")
    void hideSystemBars(Window w) {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    /** Icônes sombres (fond clair) ou claires (fond sombre) dans les barres système. */
    @SuppressWarnings("deprecation")
    void setBarIcons(boolean darkStatus, boolean darkNav) {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = w.getInsetsController();
            if (c == null) return;
            int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            int val = (darkStatus ? WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS : 0) | (darkNav ? WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS : 0);
            c.setSystemBarsAppearance(val, mask);
        } else {
            View d = w.getDecorView();
            int f = d.getSystemUiVisibility();
            f = darkStatus ? f | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR : f & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= 26) f = darkNav ? f | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : f & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            d.setSystemUiVisibility(f);
        }
    }

    static boolean isLight(int c) {
        double r = Color.red(c) / 255.0;
        double g = Color.green(c) / 255.0;
        double b = Color.blue(c) / 255.0;
        return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55;
    }

    void setStatusColor(int c) {
        lastTopColor = c;
        statusBg.setBackgroundColor(c);
        boolean navLight = isLight(cfg.tabs.isEmpty() ? navColorNow() : cfg.tabBg);
        setBarIcons(isLight(c), navLight);
    }

    int navColorNow() {
        if (navBg.getBackground() instanceof android.graphics.drawable.ColorDrawable) return ((android.graphics.drawable.ColorDrawable) navBg.getBackground()).getColor();
        return cfg.navColor;
    }

    void setNavColor(int c) {
        navBg.setBackgroundColor(cfg.tabs.isEmpty() ? c : cfg.tabBg);
        setBarIcons(isLight(lastTopColor == 0 ? cfg.statusColor : lastTopColor), isLight(cfg.tabs.isEmpty() ? c : cfg.tabBg));
    }

    // ================================================================== vues
    int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    int drawable(String name) {
        return getResources().getIdentifier(name, "drawable", getPackageName());
    }

    @SuppressLint("SetJavaScriptEnabled")
    void buildViews() {
        root = new FrameLayout(this);
        root.setBackgroundColor(cfg.bgColor);
        column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        statusBg = new View(this);
        statusBg.setBackgroundColor(cfg.statusColor);
        column.addView(statusBg, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0));
        main = new FrameLayout(this);
        column.addView(main, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        web = new WebView(this);
        web.setBackgroundColor(cfg.bgColor);
        pull = new PullRefresh(this, web, cfg.accent);
        pull.enabled = cfg.pullToRefresh;
        pull.listener = () -> {
            lastFailed = false;
            web.reload();
        };
        main.addView(pull, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setProgressTintList(ColorStateList.valueOf(cfg.accent));
        progress.setProgressBackgroundTintList(ColorStateList.valueOf(Color.TRANSPARENT));
        progress.setVisibility(View.GONE);
        FrameLayout.LayoutParams plp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3));
        plp.gravity = Gravity.TOP;
        plp.topMargin = -dp(1);
        main.addView(progress, plp);
        if ("spinner".equals(cfg.loader)) {
            spinner = new ProgressBar(this);
            spinner.setIndeterminateTintList(ColorStateList.valueOf(cfg.accent));
            spinner.setVisibility(View.GONE);
            FrameLayout.LayoutParams slp = new FrameLayout.LayoutParams(dp(40), dp(40));
            slp.gravity = Gravity.CENTER;
            main.addView(spinner, slp);
        }
        offline = buildOffline();
        offline.setVisibility(View.GONE);
        main.addView(offline, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        if (!cfg.tabs.isEmpty()) {
            tabs = buildTabs();
            column.addView(tabs, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(58)));
        }
        navBg = new View(this);
        navBg.setBackgroundColor(cfg.tabs.isEmpty() ? cfg.navColor : cfg.tabBg);
        column.addView(navBg, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0));
        root.addView(column, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        splash = Splash.build(this, cfg);
        root.addView(splash, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        Splash.intro(splash, cfg);
        setContentView(root);
        setBarIcons(isLight(cfg.splashBg), isLight(cfg.splashBg));
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            applyInsets(insets);
            return insets;
        });
    }

    @SuppressWarnings("deprecation")
    void applyInsets(WindowInsets insets) {
        int top;
        int bottom;
        int left;
        int right;
        int ime = 0;
        if (Build.VERSION.SDK_INT >= 30) {
            Insets sb = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            Insets im = insets.getInsets(WindowInsets.Type.ime());
            top = sb.top;
            bottom = sb.bottom;
            left = sb.left;
            right = sb.right;
            ime = im.bottom;
        } else {
            top = insets.getSystemWindowInsetTop();
            bottom = insets.getSystemWindowInsetBottom();
            left = insets.getSystemWindowInsetLeft();
            right = insets.getSystemWindowInsetRight();
            if (bottom > dp(120)) {
                ime = bottom;
                bottom = 0;
            }
        }
        insetTop = top;
        insetBottom = bottom;
        imeBottom = ime;
        boolean overlay = "overlay".equals(cfg.statusMode);
        statusBg.getLayoutParams().height = overlay ? 0 : top;
        statusBg.requestLayout();
        boolean keyboard = ime > bottom;
        navBg.getLayoutParams().height = keyboard ? ime : bottom;
        navBg.requestLayout();
        if (tabs != null) tabs.setVisibility(keyboard ? View.GONE : View.VISIBLE);
        column.setPadding(left, 0, right, 0);
        if (web != null && overlay) { long px = Math.round(top / getResources().getDisplayMetrics().density); web.evaluateJavascript("document.documentElement.style.setProperty('--nexora-top','" + px + "px');document.documentElement.style.setProperty('--vitrine-top','" + px + "px')", null); }
    }

    View buildSplash() {
        FrameLayout f = new FrameLayout(this);
        f.setBackgroundColor(cfg.splashBg);
        f.setClickable(true);
        int id = drawable("vt_splash_logo");
        if (id != 0) {
            ImageView logo = new ImageView(this);
            logo.setImageResource(id);
            logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(150), dp(150));
            lp.gravity = Gravity.CENTER;
            f.addView(logo, lp);
        }
        return f;
    }

    void hideSplash() {
        hideSplash(false);
    }

    /** force : masque même si l'écran de démarrage attend un signal de la page (hideSplashScreen). */
    void hideSplash(boolean force) {
        if (splashHidden || splash == null) return;
        if (!force && "js".equals(cfg.splashHideOn)) return;
        long wait = cfg.splashMin - (System.currentTimeMillis() - startedAt);
        if (wait > 0) {
            ui.postDelayed(() -> hideSplash(force), wait);
            return;
        }
        splashHidden = true;
        View sp = splash;
        Runnable end = () -> {
            root.removeView(sp);
            splash = null;
            setStatusColor(lastTopColor == 0 ? cfg.statusColor : lastTopColor);
            if (extras != null) extras.afterSplash();
        };
        Splash.exit(sp, cfg, end);
    }

    View buildOffline() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(cfg.bgColor);
        box.setPadding(dp(32), dp(32), dp(32), dp(32));
        box.setClickable(true);
        boolean light = isLight(cfg.bgColor);
        int ink = light ? 0xFF1D1D1F : 0xFFF5F5F7;
        int id = drawable("vt_offline");
        if (id != 0) {
            ImageView ic = new ImageView(this);
            ic.setImageResource(id);
            ic.setImageTintList(ColorStateList.valueOf(light ? 0xFF8E8E93 : 0xFFA1A1A6));
            box.addView(ic, new LinearLayout.LayoutParams(dp(64), dp(64)));
        }
        TextView title = new TextView(this);
        title.setText(cfg.offlineTitle);
        title.setTextColor(ink);
        title.setTextSize(20);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        tlp.topMargin = dp(16);
        box.addView(title, tlp);
        TextView msg = new TextView(this);
        msg.setText(cfg.offlineText);
        msg.setTextColor(light ? 0xFF6E6E73 : 0xFFA1A1A6);
        msg.setTextSize(15);
        msg.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams mlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        mlp.topMargin = dp(8);
        box.addView(msg, mlp);
        Button retry = new Button(this);
        retry.setText(cfg.offlineButton);
        retry.setAllCaps(false);
        retry.setTextColor(Color.WHITE);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(cfg.accent);
        bg.setCornerRadius(dp(22));
        retry.setBackground(bg);
        retry.setPadding(dp(28), 0, dp(28), 0);
        retry.setOnClickListener(v -> retry());
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(44));
        blp.topMargin = dp(24);
        box.addView(retry, blp);
        return box;
    }

    void retry() {
        lastFailed = false;
        offline.setVisibility(View.GONE);
        String u = web.getUrl();
        if (u == null || u.startsWith("data:") || u.equals("about:blank")) load(pendingUrl != null ? pendingUrl : cfg.startUrl);
        else web.reload();
    }

    void showOffline(String failingUrl) {
        if (!cfg.offlinePage) return;
        lastFailed = true;
        pendingUrl = failingUrl;
        offline.setVisibility(View.VISIBLE);
        progress.setVisibility(View.GONE);
        pull.setRefreshing(false);
        if (spinner != null) spinner.setVisibility(View.GONE);
        hideSplash(true);
    }

    LinearLayout buildTabs() {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setBackgroundColor(cfg.tabBg);
        bar.setElevation(dp(6));
        for (int i = 0; i < cfg.tabs.size(); i++) {
            Config.Tab t = cfg.tabs.get(i);
            LinearLayout item = new LinearLayout(this);
            item.setOrientation(LinearLayout.VERTICAL);
            item.setGravity(Gravity.CENTER);
            item.setTag(t.url);
            ImageView ic = new ImageView(this);
            int id = drawable("vt_tab_" + t.icon);
            if (id == 0) id = drawable("vt_tab_home");
            if (id != 0) ic.setImageResource(id);
            ic.setImageTintList(ColorStateList.valueOf(i == 0 ? cfg.tabActive : cfg.tabInactive));
            item.addView(ic, new LinearLayout.LayoutParams(dp(24), dp(24)));
            TextView label = new TextView(this);
            label.setText(t.label);
            label.setTextSize(11);
            label.setSingleLine(true);
            label.setEllipsize(TextUtils.TruncateAt.END);
            label.setTextColor(i == 0 ? cfg.tabActive : cfg.tabInactive);
            LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            llp.topMargin = dp(2);
            item.addView(label, llp);
            item.setOnClickListener(v -> {
                selectTab((String) v.getTag());
                load((String) v.getTag());
            });
            bar.addView(item, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f));
        }
        return bar;
    }

    void selectTab(String url) {
        if (tabs == null || url == null) return;
        int best = -1;
        int bestLen = -1;
        for (int i = 0; i < tabs.getChildCount(); i++) {
            String u = (String) tabs.getChildAt(i).getTag();
            if (u != null && url.startsWith(u) && u.length() > bestLen) {
                best = i;
                bestLen = u.length();
            }
        }
        if (best < 0) return;
        for (int i = 0; i < tabs.getChildCount(); i++) {
            LinearLayout item = (LinearLayout) tabs.getChildAt(i);
            int c = i == best ? cfg.tabActive : cfg.tabInactive;
            ((ImageView) item.getChildAt(0)).setImageTintList(ColorStateList.valueOf(c));
            ((TextView) item.getChildAt(1)).setTextColor(c);
        }
    }

    // ================================================================== WebView
    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface", "AddJavascriptInterface"})
    void setupWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(cfg.zoom);
        s.setBuiltInZoomControls(cfg.zoom);
        s.setDisplayZoomControls(false);
        s.setGeolocationEnabled(cfg.has("location"));
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportMultipleWindows(true);
        s.setCacheMode("offline-first".equals(cfg.cache) ? WebSettings.LOAD_CACHE_ELSE_NETWORK : "network".equals(cfg.cache) ? WebSettings.LOAD_NO_CACHE : WebSettings.LOAD_DEFAULT);
        String ua = s.getUserAgentString();
        s.setUserAgentString(ua + " NexoraApp/1.0" + (cfg.uaSuffix.isEmpty() ? "" : " " + cfg.uaSuffix));
        if (cfg.debug) WebView.setWebContentsDebuggingEnabled(true);
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);
        web.addJavascriptInterface(new Bridge(), "VitrineNative");
        web.addJavascriptInterface(wtn, "WebToNativeInterface");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener((url, userAgent, disposition, mime, length) -> download(url, userAgent, disposition, mime));
        web.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
    }

    void load(String url) {
        if (url == null) return;
        lastFailed = false;
        offline.setVisibility(View.GONE);
        web.loadUrl(url);
    }

    boolean isInternal(Uri u) {
        if (u == null || u.getHost() == null) return false;
        String h = u.getHost().toLowerCase(Locale.ROOT);
        if (LocalAssets.HOST.equals(h)) return true;
        for (String allowed : cfg.hosts) {
            if (allowed.startsWith("*.")) {
                String base = allowed.substring(2);
                if (h.equals(base) || h.endsWith("." + base)) return true;
            } else if (h.equals(allowed) || h.equals("www." + allowed) || ("www." + h).equals(allowed)) return true;
        }
        return false;
    }

    boolean openExternal(Uri u) {
        try {
            Intent i;
            if ("intent".equals(u.getScheme())) {
                i = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                i.setSelector(null);
                try {
                    startActivity(i);
                } catch (ActivityNotFoundException e) {
                    String fb = i.getStringExtra("browser_fallback_url");
                    if (fb != null) startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fb)));
                }
                return true;
            }
            i = new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
            return true;
        } catch (Exception e) {
            Toast.makeText(this, "Aucune application ne peut ouvrir ce lien.", Toast.LENGTH_SHORT).show();
            return true;
        }
    }

    boolean useBar() {
        return cfg.progressBar && "bar".equals(cfg.loader);
    }

    /** Motif d'une règle de lien : « * » remplace n'importe quels caractères ; sans « / », le motif vise le domaine. */
    static boolean matches(String pattern, Uri u) {
        String p = pattern.trim().toLowerCase(Locale.ROOT);
        if (p.isEmpty()) return false;
        String target = p.contains("/") || p.contains(":") ? u.toString().toLowerCase(Locale.ROOT) : (u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT));
        StringBuilder re = new StringBuilder();
        for (char ch : p.toCharArray()) {
            if (ch == '*') re.append(".*");
            else if ("\\.[]{}()+-?^$|".indexOf(ch) >= 0) re.append('\\').append(ch);
            else re.append(ch);
        }
        String r = re.toString();
        if (!p.contains("/") && !p.contains(":")) return target.matches(r) || target.matches(".*\\." + r);
        return target.matches(r) || target.matches(r + ".*") || target.matches("https?://(www\\.)?" + r + ".*");
    }

    /** true : le lien est pris en charge hors de la WebView. */
    boolean handleUrl(Uri u) {
        String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
        if ("about".equals(scheme) || "data".equals(scheme) || "blob".equals(scheme) || "javascript".equals(scheme)) return false;
        for (String[] rule : cfg.linkRules) {
            if (!matches(rule[0], u)) continue;
            switch (rule[1]) {
                case "browser": return openExternal(u);
                case "inapp":
                    if ("http".equals(scheme) || "https".equals(scheme)) {
                        extras.openBrowser(u.toString());
                        return true;
                    }
                    return openExternal(u);
                case "block": return true;
                default: return false;
            }
        }
        if ("http".equals(scheme) || "https".equals(scheme)) {
            if (isInternal(u) || "app".equals(cfg.externalLinks)) return false;
            if ("inapp".equals(cfg.externalLinks)) {
                if (!cfg.inAppBrowser) return false;
                extras.openBrowser(u.toString());
                return true;
            }
            return openExternal(u);
        }
        return openExternal(u);
    }

    /** Ouvre un lien choisi dans un menu ou un bouton de l'application, en suivant les règles de liens. */
    void navigate(Uri u) {
        if (u == null) return;
        String s = u.getScheme();
        if (s == null) u = Uri.parse(cfg.startUrl).buildUpon().encodedPath(u.getEncodedPath()).encodedQuery(u.getEncodedQuery()).build();
        if (!handleUrl(u)) load(u.toString());
    }

    void shareText(String text) {
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, text == null || text.isEmpty() ? (web == null ? cfg.startUrl : web.getUrl()) : text);
        try {
            startActivity(Intent.createChooser(i, "Partager"));
        } catch (Exception ignored) {
            // aucune application de partage
        }
    }

    void toast(String text) {
        ui.post(() -> Toast.makeText(this, text, Toast.LENGTH_SHORT).show());
    }

    /** Les fonctions natives ne sont accessibles qu'aux pages de l'application. */
    boolean bridgeAllowed() {
        String h = currentHost;
        if (h.isEmpty()) return false;
        return isInternal(Uri.parse("https://" + h + "/"));
    }

    /** Demande l'empreinte, le visage ou le code de l'appareil. */
    void biometric(String reason, PermissionCallback cb) {
        if (Build.VERSION.SDK_INT < 28) {
            cb.done(false);
            return;
        }
        try {
            BiometricPrompt.Builder b = new BiometricPrompt.Builder(this)
                .setTitle(cfg.appName.isEmpty() ? "Confirmation" : cfg.appName)
                .setDescription(reason == null || reason.isEmpty() ? "Confirme ton identité" : reason);
            if (Build.VERSION.SDK_INT >= 30) {
                b.setAllowedAuthenticators(android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_WEAK | android.hardware.biometrics.BiometricManager.Authenticators.DEVICE_CREDENTIAL);
            } else {
                b.setNegativeButton("Annuler", getMainExecutor(), (d, w) -> cb.done(false));
            }
            b.build().authenticate(new CancellationSignal(), getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    cb.done(true);
                }

                @Override
                public void onAuthenticationError(int code, CharSequence msg) {
                    cb.done(false);
                }
            });
        } catch (Exception e) {
            cb.done(false);
        }
    }

    // ================================================================== lecteur de codes-barres
    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    void openScanner() {
        if (scanner != null) return;
        scanner = new FrameLayout(this);
        scanner.setBackgroundColor(Color.BLACK);
        scannerWeb = new WebView(this);
        scannerWeb.setBackgroundColor(Color.BLACK);
        WebSettings s = scannerWeb.getSettings();
        s.setJavaScriptEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        scannerWeb.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void result(String value, String format) {
                ui.post(MainActivity.this::closeScanner);
                wtn.cb(Wtn.obj("type", "BARCODE_SCAN", "value", value, "format", format));
            }

            @JavascriptInterface
            public void cancel() {
                ui.post(MainActivity.this::closeScanner);
                wtn.cb(Wtn.obj("type", "BARCODE_SCAN", "value", "", "cancelled", true));
            }
        }, "VitrineScan");
        scannerWeb.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String path = u.getPath() == null ? "" : u.getPath();
                if (!LocalAssets.HOST.equals(u.getHost()) || !path.startsWith("/__vitrine/")) return null;
                String name = path.substring("/__vitrine/".length());
                if (name.contains("..")) return null;
                try {
                    String mime = name.endsWith(".html") ? "text/html" : name.endsWith(".js") ? "text/javascript" : "application/octet-stream";
                    return new WebResourceResponse(mime, "utf-8", getAssets().open("vitrine/" + name));
                } catch (Exception e) {
                    return null;
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return true;
            }
        });
        scannerWeb.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            }
        });
        scanner.addView(scannerWeb, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(scanner, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setBarIcons(false, false);
        int top = Math.round(insetTop / getResources().getDisplayMetrics().density);
        scannerWeb.loadUrl("https://" + LocalAssets.HOST + "/__vitrine/scanner.html#" + Uri.encode("{\"top\":" + top + "}"));
    }

    void closeScanner() {
        if (scanner == null) return;
        root.removeView(scanner);
        scannerWeb.destroy();
        scanner = null;
        scannerWeb = null;
        setStatusColor(lastTopColor == 0 ? cfg.statusColor : lastTopColor);
    }

    final class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleUrl(request.getUrl());
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            if (local != null) {
                WebResourceResponse r = local.serve(request.getUrl());
                if (r != null) return r;
            }
            return super.shouldInterceptRequest(view, request);
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            Uri u = Uri.parse(url);
            currentHost = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
            if (useBar()) {
                progress.setProgress(5);
                progress.setVisibility(View.VISIBLE);
            }
            if (spinner != null && splash == null && !pull.isRefreshing()) spinner.setVisibility(View.VISIBLE);
            selectTab(url);
        }

        @Override
        public void onPageCommitVisible(WebView view, String url) {
            inject();
            if (spinner != null) spinner.setVisibility(View.GONE);
            if (!lastFailed) hideSplash();
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            inject();
            progress.setVisibility(View.GONE);
            if (spinner != null) spinner.setVisibility(View.GONE);
            pull.setRefreshing(false);
            if (!lastFailed) {
                offline.setVisibility(View.GONE);
                hideSplash();
            }
            CookieManager.getInstance().flush();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showOffline(request.getUrl().toString());
        }

        @Override
        public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
            // Le moteur de la page s'est arrêté (mémoire saturée, page trop lourde…) : sans ce retour « true »
            // Android fermerait toute l'application. La WebView morte est retirée et détruite, puis l'activité
            // est recréée ; au-delà de deux arrêts en une minute, on affiche la page hors ligne au lieu de boucler.
            note("renderer", new RuntimeException(detail != null && detail.didCrash() ? "plantage du moteur de rendu" : "moteur de rendu arrêté par le système"));
            try {
                if (view.getParent() instanceof android.view.ViewGroup) ((android.view.ViewGroup) view.getParent()).removeView(view);
                view.destroy();
            } catch (Throwable ignored) {
                // déjà détruite
            }
            if (view == web) web = null;
            android.content.SharedPreferences sp = getSharedPreferences("vt_crash", MODE_PRIVATE);
            long now = System.currentTimeMillis();
            int n = now - sp.getLong("rgAt", 0) < 60000 ? sp.getInt("rg", 0) + 1 : 1;
            sp.edit().putLong("rgAt", now).putInt("rg", n).apply();
            if (n <= 2) recreate();
            else showFatal("La page ne peut pas s'afficher", "Le site demande plus de mémoire que ce téléphone n'en a de disponible. Ferme d'autres applications, puis réessaie.");
            return true;
        }
    }

    void inject() {
        StringBuilder js = new StringBuilder();
        js.append("(function(){try{");
        js.append(bridgeJs);
        if (!cfg.injectCss.isEmpty()) {
            js.append(";(function(){if(document.getElementById('__vitrine_css'))return;var s=document.createElement('style');s.id='__vitrine_css';s.textContent=")
                .append(JSONObject.quote(cfg.injectCss)).append(";(document.head||document.documentElement).appendChild(s);})();");
        }
        if (!cfg.injectJs.isEmpty()) js.append(";if(!window.__vitrineUserJs){window.__vitrineUserJs=1;").append(cfg.injectJs).append("\n}");
        js.append("}catch(e){console.error('NEXORA',e)}})();");
        web.evaluateJavascript(js.toString(), null);
    }

    final class Chrome extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int p) {
            if (!useBar()) return;
            progress.setProgress(Math.max(5, p));
            if (p >= 100) progress.setVisibility(View.GONE);
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            List<String> perms = new ArrayList<>();
            List<String> grant = new ArrayList<>();
            for (String r : request.getResources()) {
                if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && cfg.has("camera")) {
                    perms.add(Manifest.permission.CAMERA);
                    grant.add(r);
                } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && cfg.has("microphone")) {
                    perms.add(Manifest.permission.RECORD_AUDIO);
                    grant.add(r);
                } else if (PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID.equals(r)) {
                    grant.add(r);
                }
            }
            if (grant.isEmpty()) {
                request.deny();
                return;
            }
            requestRuntime(perms.toArray(new String[0]), granted -> {
                if (granted) request.grant(grant.toArray(new String[0]));
                else request.deny();
            });
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (!cfg.has("location")) {
                callback.invoke(origin, false, false);
                return;
            }
            requestRuntime(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, granted -> callback.invoke(origin, granted, false));
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (!cfg.fileUpload) return false;
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            String[] accept = params.getAcceptTypes();
            boolean images = false;
            boolean video = false;
            boolean any = accept == null || accept.length == 0;
            List<String> mimes = new ArrayList<>();
            if (accept != null) {
                for (String a : accept) {
                    for (String part : a.split(",")) {
                        String m = part.trim().toLowerCase(Locale.ROOT);
                        if (m.isEmpty()) {
                            any = true;
                            continue;
                        }
                        if (m.startsWith(".")) {
                            String t = MimeTypeMap.getSingleton().getMimeTypeFromExtension(m.substring(1));
                            if (t != null) m = t;
                        }
                        if (m.startsWith("image/")) images = true;
                        if (m.startsWith("video/")) video = true;
                        mimes.add(m);
                    }
                }
            }
            if (any) {
                images = true;
                video = true;
            }
            boolean multiple = params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
            boolean capture = params.isCaptureEnabled();
            final boolean wantImage = images;
            final boolean wantVideo = video;
            Runnable launch = () -> launchChooser(mimes, multiple, cfg.has("camera") && wantImage, cfg.has("camera") && wantVideo, capture);
            if (cfg.has("camera") && (images || video)) requestRuntime(new String[]{Manifest.permission.CAMERA}, g -> launch.run());
            else launch.run();
            return true;
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            WebView tmp = new WebView(MainActivity.this);
            tmp.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                    Uri u = request.getUrl();
                    if (!handleUrl(u)) load(u.toString());
                    v.destroy();
                    return true;
                }
            });
            WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
            transport.setWebView(tmp);
            resultMsg.sendToTarget();
            return true;
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (customView != null) {
                callback.onCustomViewHidden();
                return;
            }
            customView = view;
            customViewCallback = callback;
            root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            hideSystemBars(getWindow());
        }

        @Override
        public void onHideCustomView() {
            if (customView == null) return;
            root.removeView(customView);
            customView = null;
            if (customViewCallback != null) customViewCallback.onCustomViewHidden();
            customViewCallback = null;
            if (!cfg.fullscreen) showSystemBars();
        }
    }

    @SuppressWarnings("deprecation")
    void showSystemBars() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = w.getInsetsController();
            if (c != null) c.show(WindowInsets.Type.systemBars());
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
        setStatusColor(lastTopColor == 0 ? cfg.statusColor : lastTopColor);
    }

    void launchChooser(List<String> mimes, boolean multiple, boolean photo, boolean video, boolean captureOnly) {
        cameraUri = null;
        List<Intent> extra = new ArrayList<>();
        if (photo) {
            try {
                File f = new File(FilesProvider.dir(this), "photo-" + System.currentTimeMillis() + ".jpg");
                cameraUri = FilesProvider.uriFor(this, f);
                Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                cam.setClipData(ClipData.newRawUri("photo", cameraUri));
                extra.add(cam);
            } catch (Exception ignored) {
                cameraUri = null;
            }
        }
        if (video) extra.add(new Intent(MediaStore.ACTION_VIDEO_CAPTURE));
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType(mimes.size() == 1 ? mimes.get(0) : "*/*");
        if (mimes.size() > 1) pick.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
        if (multiple) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        Intent chooser;
        if (captureOnly && !extra.isEmpty()) chooser = extra.get(0);
        else {
            chooser = Intent.createChooser(pick, "Choisir un fichier");
            if (!extra.isEmpty()) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, extra.toArray(new Intent[0]));
        }
        try {
            startActivityForResult(chooser, REQ_FILE);
        } catch (ActivityNotFoundException e) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_VOICE) {
            wtn.onVoiceResult(resultCode, data);
            return;
        }
        if (requestCode == REQ_FILE) {
            if (fileCallback == null) return;
            Uri[] result = null;
            if (resultCode == RESULT_OK) {
                if (data != null && data.getClipData() != null && (data.getData() == null || data.getClipData().getItemCount() > 1)) {
                    ClipData cd = data.getClipData();
                    result = new Uri[cd.getItemCount()];
                    for (int i = 0; i < cd.getItemCount(); i++) result[i] = cd.getItemAt(i).getUri();
                } else if (data != null && data.getData() != null) {
                    result = new Uri[]{data.getData()};
                } else if (cameraUri != null) {
                    result = new Uri[]{cameraUri};
                }
            }
            fileCallback.onReceiveValue(result);
            fileCallback = null;
        } else if (requestCode == REQ_CONTACT) {
            String id = contactCallbackId;
            contactCallbackId = null;
            if (id == null) return;
            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                resolve(id, false, "\"annulé\"");
                return;
            }
            try (Cursor c = getContentResolver().query(data.getData(), new String[]{ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER}, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    JSONObject o = new JSONObject();
                    o.put("name", c.getString(0));
                    o.put("phone", c.getString(1));
                    resolve(id, true, o.toString());
                } else resolve(id, false, "\"vide\"");
            } catch (Exception e) {
                resolve(id, false, JSONObject.quote(String.valueOf(e.getMessage())));
            }
        }
    }

    // ================================================================== autorisations
    static String[] runtimePermissions(List<String> names) {
        List<String> out = new ArrayList<>();
        for (String n : names) {
            switch (n) {
                case "camera": out.add(Manifest.permission.CAMERA); break;
                case "microphone": out.add(Manifest.permission.RECORD_AUDIO); break;
                case "location": out.add(Manifest.permission.ACCESS_FINE_LOCATION); out.add(Manifest.permission.ACCESS_COARSE_LOCATION); break;
                case "contacts": out.add(Manifest.permission.READ_CONTACTS); break;
                case "notifications": if (Build.VERSION.SDK_INT >= 33) out.add(Manifest.permission.POST_NOTIFICATIONS); break;
                default: break;
            }
        }
        return out.toArray(new String[0]);
    }

    void requestRuntime(String[] perms, PermissionCallback cb) {
        List<String> missing = new ArrayList<>();
        for (String p : perms) if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
        if (missing.isEmpty()) {
            cb.done(true);
            return;
        }
        int code = REQ_PERM_BASE + (permSeq++ % 800);
        permCallbacks.put(code, cb);
        requestPermissions(missing.toArray(new String[0]), code);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        PermissionCallback cb = permCallbacks.remove(requestCode);
        if (cb == null) return;
        boolean any = false;
        for (int r : results) if (r == PackageManager.PERMISSION_GRANTED) any = true;
        cb.done(any);
    }

    // ================================================================== téléchargements
    void download(String url, String userAgent, String disposition, String mime) {
        if (!cfg.downloads) return;
        String name = URLUtil.guessFileName(url, disposition, mime);
        if (url.startsWith("blob:") || url.startsWith("data:")) {
            web.evaluateJavascript("window.__vitrineDownload && window.__vitrineDownload(" + JSONObject.quote(url) + "," + JSONObject.quote(name) + "," + JSONObject.quote(mime == null ? "" : mime) + ")", null);
            return;
        }
        Runnable go = () -> {
            try {
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) r.addRequestHeader("Cookie", cookies);
                r.addRequestHeader("User-Agent", userAgent);
                r.setMimeType(mime);
                r.setTitle(name);
                r.setNotificationVisibility(cfg.notifyDownload ? DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED : DownloadManager.Request.VISIBILITY_VISIBLE);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(r);
                Toast.makeText(this, "Téléchargement de " + name + "…", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                openExternal(Uri.parse(url));
            }
        };
        if (Build.VERSION.SDK_INT <= 28) requestRuntime(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, g -> go.run());
        else go.run();
    }

    /** Enregistre des octets dans Téléchargements et propose de les ouvrir ou de les partager. */
    String saveBytes(byte[] bytes, String name, String mime) throws Exception {
        if (name == null || name.trim().isEmpty()) name = "fichier";
        name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
        if (mime == null || mime.isEmpty()) {
            String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1) : "";
            mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase(Locale.ROOT));
            if (mime == null) mime = "application/octet-stream";
        }
        Uri uri;
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            ContentResolver cr = getContentResolver();
            uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new IllegalStateException("MediaStore");
            try (OutputStream out = cr.openOutputStream(uri)) {
                if (out == null) throw new IllegalStateException("flux");
                out.write(bytes);
            }
        } else {
            File f = new File(FilesProvider.dir(this), name);
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(bytes);
            }
            uri = FilesProvider.uriFor(this, f);
        }
        final Uri saved = uri;
        final String type = mime;
        final String label = name;
        ui.post(() -> {
            Toast.makeText(this, label + " enregistré dans Téléchargements", Toast.LENGTH_SHORT).show();
            Intent open = new Intent(Intent.ACTION_VIEW);
            open.setDataAndType(saved, type);
            open.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                startActivity(Intent.createChooser(open, label));
            } catch (Exception ignored) {
                // pas d'application pour ce type de fichier
            }
        });
        return uri.toString();
    }

    // ================================================================== retour
    void setupBack() {
        if (Build.VERSION.SDK_INT >= 33) {
            OnBackInvokedCallback cb = this::back;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, cb);
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        back();
    }

    void back() {
        if (customView != null) {
            new Chrome().onHideCustomView();
            return;
        }
        if (web == null || extras == null || wtn == null) {
            finish();
            return;
        }
        if (extras.locked()) {
            moveTaskToBack(true);
            return;
        }
        if (scanner != null) {
            scannerWeb.evaluateJavascript("document.getElementById('close').click()", null);
            return;
        }
        if (extras.closeBrowser() || extras.closeDrawer()) return;
        if (wtn.customBack) {
            web.evaluateJavascript("(function(){var d={type:'backPress',data:{canGoBack:" + web.canGoBack() + "}};try{window.nativeEventCB&&window.nativeEventCB(JSON.stringify(d))}catch(e){}try{var w=window.WebToNativeInterface;w&&w.androidCBHook&&w.androidCBHook(JSON.stringify({type:'customBackHandling',canGoBack:" + web.canGoBack() + "}))}catch(e){}window.dispatchEvent(new CustomEvent('vitrineback',{detail:d.data}))})()", null);
            return;
        }
        if (offline.getVisibility() == View.VISIBLE && web.canGoBack()) {
            offline.setVisibility(View.GONE);
            lastFailed = false;
        }
        if (!"exit".equals(cfg.back) && web.canGoBack()) {
            web.goBack();
            return;
        }
        if ("confirm".equals(cfg.back) && System.currentTimeMillis() - backPressedAt > 2000) {
            backPressedAt = System.currentTimeMillis();
            Toast.makeText(this, "Appuie encore une fois pour quitter", Toast.LENGTH_SHORT).show();
            return;
        }
        finish();
    }

    // ================================================================== liens profonds, réseau
    String urlFromIntent(Intent intent) {
        if (intent == null) return null;
        String extra = intent.getStringExtra("vitrine_url");
        if (extra != null) return extra;
        // Notification push ouverte (application fermée) : Firebase transmet les données du message en « extras ».
        for (String k : new String[]{"url", "link"}) {
            String v = intent.getStringExtra(k);
            if (v != null && (v.startsWith("https://") || v.startsWith("http://") || v.startsWith("/"))) {
                if (v.startsWith("/")) { Uri s0 = Uri.parse(cfg.startUrl); return s0.getScheme() + "://" + s0.getEncodedAuthority() + v; }
                return v;
            }
        }
        Uri d = intent.getData();
        if (d == null) return null;
        String scheme = d.getScheme();
        if ("https".equals(scheme) || "http".equals(scheme)) {
            if (local != null && !cfg.publicUrl.isEmpty()) {
                return "https://" + LocalAssets.HOST + (d.getEncodedPath() == null ? "/" : d.getEncodedPath()) + (d.getEncodedQuery() == null ? "" : "?" + d.getEncodedQuery()) + (d.getEncodedFragment() == null ? "" : "#" + d.getEncodedFragment());
            }
            return d.toString();
        }
        // Schéma personnalisé : monapp://chemin → page de l'application.
        Uri start = Uri.parse(cfg.startUrl);
        String path = (d.getHost() == null ? "" : "/" + d.getHost()) + (d.getEncodedPath() == null ? "" : d.getEncodedPath());
        return start.getScheme() + "://" + start.getEncodedAuthority() + (path.isEmpty() ? "/" : path) + (d.getEncodedQuery() == null ? "" : "?" + d.getEncodedQuery());
    }

    void watchNetwork() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            netCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    ui.post(() -> {
                        boolean wasDown = !netUp;
                        netUp = true;
                        if (wasDown && cfg.notifyNetwork) eventNotify(991, cfg.appName.isEmpty() ? "Connexion rétablie" : cfg.appName, "Tu es de nouveau en ligne.");
                        if (lastFailed) retry();
                    });
                }

                @Override
                public void onLost(Network network) {
                    ui.post(() -> {
                        netUp = false;
                        if (cfg.notifyNetwork) eventNotify(991, cfg.appName.isEmpty() ? "Hors ligne" : cfg.appName, "La connexion Internet a été perdue.");
                    });
                }
            };
            cm.registerDefaultNetworkCallback(netCallback);
        } catch (Exception ignored) {
            netCallback = null;
        }
    }

    String readAsset(String path) {
        try (InputStream in = getAssets().open(path)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    void resolve(String id, boolean ok, String jsonValue) {
        if (web == null || id == null) return;
        String js = "window.__vitrineResolve&&window.__vitrineResolve(" + JSONObject.quote(id) + "," + ok + "," + jsonValue + ")";
        ui.post(() -> {
            if (web != null) web.evaluateJavascript(js, null);
        });
    }

    // ================================================================== fonctions natives pour la page
    // ================================================================== orientation
    static int orientationValue(String name) {
        switch (name == null ? "" : name) {
            case "portrait": return android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
            case "sensorPortrait": return android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT;
            case "landscape": return android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE;
            case "sensorLandscape": return android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;
            case "fullSensor": return android.content.pm.ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR;
            case "locked": return android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LOCKED;
            default: return android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
        }
    }

    boolean isTablet() {
        return getResources().getConfiguration().smallestScreenWidthDp >= 600;
    }

    // Réglage de l'App Builder : celui du téléphone (déjà dans le manifeste) ou celui des tablettes.
    void applyDefaultOrientation() {
        try {
            String o = isTablet() && cfg.orientTablet != null && !cfg.orientTablet.isEmpty() ? cfg.orientTablet : cfg.orientPhone;
            setRequestedOrientation(orientationValue(o));
        } catch (Throwable t) { note("orientation", t); }
    }

    final class Bridge {
        private boolean allowed() {
            return bridgeAllowed();
        }

        /* Orientation demandée par la page : portrait, landscape, auto, sensor, lock (garder l'actuelle),
         * default (réglage de l'App Builder). Renvoie false si l'application ne l'autorise pas. */
        @JavascriptInterface
        public boolean setOrientation(String o) {
            if (!allowed() || !cfg.orientJs) return false;
            final String v = o == null ? "" : o.trim().toLowerCase(java.util.Locale.ROOT);
            ui.post(() -> {
                switch (v) {
                    case "portrait": case "portrait-primary": setRequestedOrientation(orientationValue("portrait")); break;
                    case "portrait-secondary": setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_REVERSE_PORTRAIT); break;
                    case "landscape": setRequestedOrientation(orientationValue("sensorLandscape")); break;
                    case "landscape-primary": setRequestedOrientation(orientationValue("landscape")); break;
                    case "landscape-secondary": setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_REVERSE_LANDSCAPE); break;
                    case "auto": case "any": case "natural": setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED); break;
                    case "sensor": setRequestedOrientation(orientationValue("fullSensor")); break;
                    case "lock": case "locked": setRequestedOrientation(orientationValue("locked")); break;
                    default: applyDefaultOrientation(); break;
                }
            });
            return true;
        }

        @JavascriptInterface
        public String orientation() {
            return getResources().getConfiguration().orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE ? "landscape" : "portrait";
        }

        @JavascriptInterface
        public String appInfo() {
            JSONObject o = new JSONObject();
            try {
                PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
                o.put("package", getPackageName());
                o.put("version", pi.versionName);
                o.put("versionCode", Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode);
                o.put("platform", "android");
                o.put("sdk", Build.VERSION.SDK_INT);
                o.put("model", Build.MODEL);
                o.put("publicUrl", cfg.publicUrl);
                o.put("name", cfg.appName);
            } catch (Exception ignored) {
                // infos partielles
            }
            return o.toString();
        }

        @JavascriptInterface
        public int insetTop() {
            return Math.round(insetTop / getResources().getDisplayMetrics().density);
        }

        @JavascriptInterface
        public void share(String json) {
            if (!allowed()) return;
            ui.post(() -> {
                try {
                    JSONObject o = new JSONObject(json);
                    String text = o.optString("text", "");
                    String url = o.optString("url", "");
                    String body = (text + (text.isEmpty() || url.isEmpty() ? "" : "\n") + url).trim();
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType("text/plain");
                    i.putExtra(Intent.EXTRA_TEXT, body);
                    if (!o.optString("title").isEmpty()) i.putExtra(Intent.EXTRA_SUBJECT, o.optString("title"));
                    startActivity(Intent.createChooser(i, o.optString("title", "Partager")));
                } catch (Exception ignored) {
                    // partage impossible
                }
            });
        }

        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public void vibrate(long ms) {
            if (!allowed() || !cfg.has("vibrate")) return;
            try {
                Vibrator v = Build.VERSION.SDK_INT >= 31 ? ((VibratorManager) getSystemService(VIBRATOR_MANAGER_SERVICE)).getDefaultVibrator() : (Vibrator) getSystemService(VIBRATOR_SERVICE);
                long d = Math.max(1, Math.min(ms, 5000));
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(d, VibrationEffect.DEFAULT_AMPLITUDE));
                else v.vibrate(d);
            } catch (Exception ignored) {
                // pas de vibreur
            }
        }

        @JavascriptInterface
        public void toast(String text) {
            if (!allowed()) return;
            ui.post(() -> Toast.makeText(MainActivity.this, text, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public void copy(String text) {
            if (!allowed()) return;
            ui.post(() -> {
                ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                cm.setPrimaryClip(ClipData.newPlainText("texte", text));
            });
        }

        @JavascriptInterface
        public void openExternal(String url) {
            if (!allowed()) return;
            ui.post(() -> MainActivity.this.openExternal(Uri.parse(url)));
        }

        @JavascriptInterface
        public void statusBar(String color, boolean darkIcons) {
            if (!allowed()) return;
            ui.post(() -> {
                int c = Config.color(color, cfg.statusColor);
                statusBg.setBackgroundColor(c);
                lastTopColor = c;
                setBarIcons(darkIcons, isLight(navColorNow()));
            });
        }

        @JavascriptInterface
        public void __top(String color) {
            if (manualStatus) return;
            if (!"auto".equals(cfg.statusMode) || splash != null) {
                if ("auto".equals(cfg.statusMode)) lastTopColor = parseCss(color, lastTopColor);
                return;
            }
            ui.post(() -> {
                int c = parseCss(color, lastTopColor == 0 ? cfg.statusColor : lastTopColor);
                if (c != lastTopColor) setStatusColor(c);
            });
        }

        @JavascriptInterface
        public void __bottom(String color) {
            if (!"auto".equals(cfg.navMode) || !cfg.tabs.isEmpty()) return;
            ui.post(() -> setNavColor(parseCss(color, cfg.navColor)));
        }

        @JavascriptInterface
        public void __touchTop(boolean top) {
            pull.pageAtTop = top;
        }

        @JavascriptInterface
        public String lastError() {
            if (!allowed()) return "";
            return MainActivity.this.crashReport();
        }

        @JavascriptInterface
        public String pushState() {
            JSONObject o = new JSONObject();
            try {
                o.put("enabled", cfg.push);
                o.put("available", Push.available());
                o.put("token", Push.token == null ? JSONObject.NULL : Push.token);
                o.put("error", Push.error == null ? JSONObject.NULL : Push.error);
                o.put("permission", Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED);
                o.put("app", getPackageName());
                o.put("topicPrefix", Push.prefix(MainActivity.this));
            } catch (Exception ignored) {
                // état partiel
            }
            return o.toString();
        }

        @JavascriptInterface
        public void pushSubscribe(String topic, boolean on, String id) {
            if (!allowed()) return;
            Push.subscribe(topic, on, MainActivity.this, id);
        }

        @JavascriptInterface
        public void pushPermission(String id) {
            if (!allowed()) return;
            ui.post(() -> requestRuntime(Build.VERSION.SDK_INT >= 33 ? new String[]{Manifest.permission.POST_NOTIFICATIONS} : new String[0], g -> resolve(id, true, String.valueOf(g))));
        }

        @JavascriptInterface
        public void notify(String json) {
            if (!allowed() || (!cfg.has("notifications") && !cfg.push)) return;
            ui.post(() -> {
                String[] perm = Build.VERSION.SDK_INT >= 33 ? new String[]{Manifest.permission.POST_NOTIFICATIONS} : new String[0];
                requestRuntime(perm, granted -> {
                    if (granted) showNotification(json);
                });
            });
        }

        @JavascriptInterface
        public void fileBegin(String id, String name, String mime) {
            if (!allowed()) return;
            synchronized (uploads) {
                uploads.put(id, new ByteArrayOutputStream());
                uploadMeta.put(id, new String[]{name, mime});
            }
        }

        @JavascriptInterface
        public void fileChunk(String id, String base64) {
            synchronized (uploads) {
                ByteArrayOutputStream b = uploads.get(id);
                if (b == null) return;
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                b.write(bytes, 0, bytes.length);
            }
        }

        @JavascriptInterface
        public void fileEnd(String id) {
            ByteArrayOutputStream b;
            String[] meta;
            synchronized (uploads) {
                b = uploads.remove(id);
                meta = uploadMeta.remove(id);
            }
            if (b == null || meta == null) return;
            final byte[] bytes = b.toByteArray();
            Runnable save = () -> new Thread(() -> {
                try {
                    String where = saveBytes(bytes, meta[0], meta[1]);
                    resolve(id, true, JSONObject.quote(where));
                } catch (Exception e) {
                    resolve(id, false, JSONObject.quote(String.valueOf(e.getMessage())));
                }
            }).start();
            if (Build.VERSION.SDK_INT <= 28) ui.post(() -> requestRuntime(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, g -> save.run()));
            else save.run();
        }

        @JavascriptInterface
        public void authenticate(String reason, String id) {
            if (!allowed()) return;
            if (!cfg.has("biometric") || Build.VERSION.SDK_INT < 28) {
                resolve(id, false, "\"indisponible\"");
                return;
            }
            ui.post(() -> {
                try {
                    BiometricPrompt.Builder b = new BiometricPrompt.Builder(MainActivity.this)
                        .setTitle(cfg.appName.isEmpty() ? "Confirmation" : cfg.appName)
                        .setDescription(reason);
                    if (Build.VERSION.SDK_INT >= 30) {
                        b.setAllowedAuthenticators(android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_WEAK | android.hardware.biometrics.BiometricManager.Authenticators.DEVICE_CREDENTIAL);
                    } else {
                        b.setNegativeButton("Annuler", getMainExecutor(), (d, w) -> resolve(id, false, "\"annulé\""));
                    }
                    b.build().authenticate(new CancellationSignal(), getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                            resolve(id, true, "true");
                        }

                        @Override
                        public void onAuthenticationError(int code, CharSequence msg) {
                            resolve(id, false, JSONObject.quote(String.valueOf(msg)));
                        }
                    });
                } catch (Exception e) {
                    resolve(id, false, JSONObject.quote(String.valueOf(e.getMessage())));
                }
            });
        }

        @JavascriptInterface
        public void requestPermission(String name, String id) {
            if (!allowed()) return;
            List<String> one = new ArrayList<>();
            one.add(name);
            String[] perms = cfg.has(name) ? runtimePermissions(one) : null;
            if (perms == null) {
                resolve(id, false, "false");
                return;
            }
            ui.post(() -> requestRuntime(perms, granted -> resolve(id, granted, String.valueOf(granted))));
        }

        @JavascriptInterface
        public void pickContact(String id) {
            if (!allowed() || !cfg.has("contacts")) {
                resolve(id, false, "\"indisponible\"");
                return;
            }
            ui.post(() -> {
                contactCallbackId = id;
                Intent i = new Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI);
                try {
                    startActivityForResult(i, REQ_CONTACT);
                } catch (Exception e) {
                    contactCallbackId = null;
                    resolve(id, false, "\"indisponible\"");
                }
            });
        }

        @JavascriptInterface
        public void keepAwake(boolean on) {
            if (!allowed()) return;
            ui.post(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface
        public void openMenu() {
            if (allowed()) ui.post(() -> extras.openDrawer());
        }

        @JavascriptInterface
        public void openInApp(String url) {
            if (allowed()) ui.post(() -> extras.openBrowser(url));
        }

        @JavascriptInterface
        public void exit() {
            if (!allowed()) return;
            ui.post(MainActivity.this::finish);
        }
    }

    @SuppressWarnings("deprecation")
    void showNotification(String json) {
        try {
            JSONObject o = new JSONObject(json);
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            // Catégorie (canal) : nom lisible fourni par la page, sinon « Notifications ». Un même nom = un même canal.
            String chanName = o.optString("channel", "").trim();
            if (chanName.isEmpty()) chanName = "Notifications";
            String channel = "vt_" + Integer.toHexString(chanName.toLowerCase(Locale.ROOT).hashCode());
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(channel) == null) {
                nm.createNotificationChannel(new NotificationChannel(channel, chanName, NotificationManager.IMPORTANCE_DEFAULT));
            }
            Intent open = new Intent(this, MainActivity.class);
            if (!o.optString("url").isEmpty()) open.putExtra("vitrine_url", o.optString("url"));
            open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(this, (int) (System.currentTimeMillis() & 0xffff), open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, channel) : new Notification.Builder(this);
            int icon = drawable("vt_notification");
            String body = o.optString("body", "");
            b.setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_dialog_info)
                .setContentTitle(o.optString("title", cfg.appName))
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setOngoing(o.optBoolean("ongoing", false))
                .setContentIntent(pi)
                .setColor(cfg.accent);
            nm.notify(o.optInt("id", (int) (System.currentTimeMillis() & 0x7fffffff)), b.build());
        } catch (Exception ignored) {
            // notification impossible
        }
    }

    /** Notification locale d'un événement interne (connexion, mise à jour…), sur le canal « Activité ». */
    void eventNotify(int id, String title, String body) {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return;
        try {
            JSONObject o = new JSONObject();
            o.put("id", id); o.put("title", title); o.put("body", body); o.put("channel", cfg.eventChannel);
            showNotification(o.toString());
        } catch (Exception ignored) { /* sans gravité */ }
    }

    /** Couleur CSS (rgb(), rgba(), #rgb, #rrggbb) ; un fond transparent donne la couleur de repli. */
    static int parseCss(String s, int fallback) {
        if (s == null) return fallback;
        s = s.trim().toLowerCase(Locale.ROOT);
        try {
            if (s.startsWith("rgb")) {
                String inner = s.substring(s.indexOf('(') + 1, s.indexOf(')'));
                String[] p = inner.split("[,\\s/]+");
                int r = Math.round(Float.parseFloat(p[0]));
                int g = Math.round(Float.parseFloat(p[1]));
                int b = Math.round(Float.parseFloat(p[2]));
                if (p.length > 3 && Float.parseFloat(p[3]) < 0.5f) return fallback;
                return Color.rgb(r, g, b);
            }
            if (s.startsWith("#")) {
                if (s.length() == 4) s = "#" + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2) + s.charAt(3) + s.charAt(3);
                return Color.parseColor(s.length() > 7 ? s.substring(0, 7) : s);
            }
            return Color.parseColor(s);
        } catch (Exception e) {
            return fallback;
        }
    }
}
