package app.vitrine.shell;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.FrameLayout;
import android.widget.ImageView;

import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.browser.customtabs.CustomTabsService;
import androidx.browser.customtabs.CustomTabsServiceConnection;
import androidx.browser.customtabs.CustomTabsSession;
import androidx.browser.customtabs.TrustedWebUtils;
import androidx.browser.trusted.ScreenOrientation;
import androidx.browser.trusted.TrustedWebActivityDisplayMode;
import androidx.browser.trusted.TrustedWebActivityIntentBuilder;
import androidx.browser.trusted.sharing.ShareData;
import androidx.browser.trusted.sharing.ShareTarget;
import androidx.browser.trusted.splashscreens.SplashScreenParamKey;
import androidx.browser.trusted.splashscreens.SplashScreenVersion;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Mode « Trusted Web Activity » (comme PWABuilder et Bubblewrap) : le site s'ouvre en plein écran dans le
 * navigateur du téléphone (Chrome, Edge, Samsung Internet…), avec ses service workers, ses notifications et
 * ses cookies. Sans navigateur compatible, repli sur la WebView de Vitrine (MainActivity) ou sur un onglet
 * personnalisé. La barre d'adresse disparaît quand le site publie /.well-known/assetlinks.json.
 */
public class TwaActivity extends Activity {
    static final String CATEGORY_TWA = "androidx.browser.trusted.category.TrustedWebActivities";
    static final String EXTRA_MANAGE = "vitrine_manage";
    static final List<String> PREFERRED = Arrays.asList(
            "com.android.chrome", "com.chrome.beta", "com.chrome.dev", "com.chrome.canary", "com.google.android.apps.chrome",
            "org.chromium.chrome", "com.microsoft.emmx", "com.sec.android.app.sbrowser", "com.sec.android.app.sbrowser.beta",
            "com.brave.browser", "com.opera.browser", "com.kiwibrowser.browser", "com.vivaldi.browser");

    JSONObject cfg = new JSONObject();
    CustomTabsServiceConnection connection;
    boolean launched;
    final Handler ui = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        cfg = loadConfig();
        int bg = color(cfg.optString("bgColor"), Color.WHITE);
        Window w = getWindow();
        w.setStatusBarColor(color(cfg.optString("themeColor"), bg));
        w.setNavigationBarColor(color(cfg.optString("navColor"), bg));
        showSplash(bg);
        if (state != null && state.getBoolean("launched")) { finish(); return; }

        Uri uri = launchUri(getIntent());
        String browser = pickBrowser();
        if (browser == null) { fallback(uri); return; }
        final boolean manage = getIntent().getBooleanExtra(EXTRA_MANAGE, false) || "true".equals(getIntent().getStringExtra(EXTRA_MANAGE));
        connection = new CustomTabsServiceConnection() {
            @Override
            public void onCustomTabsServiceConnected(ComponentName name, CustomTabsClient client) {
                try {
                    client.warmup(0);
                    CustomTabsSession session = client.newSession(null);
                    if (session == null) { fallback(uri); return; }
                    if (manage) {
                        TrustedWebUtils.launchBrowserSiteSettings(TwaActivity.this, session, uri);
                        launched = true;
                        finish();
                        return;
                    }
                    launch(browser, session, uri);
                } catch (Throwable t) {
                    fallback(uri);
                }
            }

            @Override
            public void onServiceDisconnected(ComponentName name) { }
        };
        if (!CustomTabsClient.bindCustomTabsService(this, browser, connection)) fallback(uri);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putBoolean("launched", launched);
    }

    @Override
    protected void onRestart() {
        super.onRestart();
        // Retour depuis le navigateur : l'écran de lancement ne doit pas rester affiché.
        if (launched) finish();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (connection != null) {
            try { unbindService(connection); } catch (Throwable ignored) { }
        }
    }

    // ------------------------------------------------------------------ lancement
    void launch(String browser, CustomTabsSession session, Uri uri) {
        TrustedWebActivityIntentBuilder b = new TrustedWebActivityIntentBuilder(uri);
        int bg = color(cfg.optString("bgColor"), Color.WHITE);
        CustomTabColorSchemeParams.Builder light = new CustomTabColorSchemeParams.Builder()
                .setToolbarColor(color(cfg.optString("themeColor"), bg))
                .setNavigationBarColor(color(cfg.optString("navColor"), bg));
        if (cfg.has("navDivider")) light.setNavigationBarDividerColor(color(cfg.optString("navDivider"), Color.TRANSPARENT));
        b.setDefaultColorSchemeParams(light.build());
        if (cfg.has("themeColorDark") || cfg.has("navColorDark")) {
            CustomTabColorSchemeParams.Builder dark = new CustomTabColorSchemeParams.Builder()
                    .setToolbarColor(color(cfg.optString("themeColorDark"), color(cfg.optString("themeColor"), Color.BLACK)))
                    .setNavigationBarColor(color(cfg.optString("navColorDark"), color(cfg.optString("navColor"), Color.BLACK)));
            if (cfg.has("navDividerDark")) dark.setNavigationBarDividerColor(color(cfg.optString("navDividerDark"), Color.TRANSPARENT));
            b.setColorSchemeParams(CustomTabsIntent.COLOR_SCHEME_DARK, dark.build());
            b.setColorScheme(CustomTabsIntent.COLOR_SCHEME_SYSTEM);
        }
        String display = cfg.optString("display", "standalone");
        if ("fullscreen".equals(display) || "fullscreen-sticky".equals(display)) {
            int cutout = Build.VERSION.SDK_INT >= 28 ? 1 : 0; // LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            b.setDisplayMode(new TrustedWebActivityDisplayMode.ImmersiveMode("fullscreen-sticky".equals(display), cutout));
        } else {
            b.setDisplayMode(new TrustedWebActivityDisplayMode.DefaultMode());
        }
        b.setScreenOrientation(orientation(cfg.optString("orientation", "default")));
        List<String> origins = new ArrayList<>();
        JSONArray o = cfg.optJSONArray("trustedOrigins");
        if (o != null) for (int i = 0; i < o.length(); i++) if (o.optString(i).length() > 0) origins.add(o.optString(i));
        if (!origins.isEmpty()) b.setAdditionalTrustedOrigins(origins);
        shareParams(b, getIntent());

        // Écran de démarrage du navigateur : l'image est transmise au navigateur puis fondue à l'ouverture.
        Bitmap splash = splashBitmap();
        if (splash != null && TrustedWebUtils.areSplashScreensSupported(this, browser, SplashScreenVersion.V1)) {
            new Thread(() -> {
                boolean ok = false;
                try {
                    File dir = FilesProvider.dir(this);
                    File f = new File(dir, "vt_twa_splash.png");
                    try (FileOutputStream out = new FileOutputStream(f)) { splash.compress(Bitmap.CompressFormat.PNG, 100, out); }
                    Uri u = FilesProvider.uriFor(this, f);
                    grantUriPermission(browser, u, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    ok = session.receiveFile(u, CustomTabsService.FILE_PURPOSE_TRUSTED_WEB_ACTIVITY_SPLASH_IMAGE, null);
                } catch (Throwable ignored) { }
                final boolean sent = ok;
                ui.post(() -> {
                    if (sent) {
                        Bundle p = new Bundle();
                        p.putString(SplashScreenParamKey.KEY_VERSION, SplashScreenVersion.V1);
                        p.putInt(SplashScreenParamKey.KEY_BACKGROUND_COLOR, bg);
                        p.putInt(SplashScreenParamKey.KEY_SCALE_TYPE, ImageView.ScaleType.CENTER.ordinal());
                        p.putInt(SplashScreenParamKey.KEY_FADE_OUT_DURATION_MS, cfg.optInt("splashFade", 300));
                        b.setSplashScreenParams(p);
                    }
                    start(b, session, browser);
                });
            }).start();
        } else {
            start(b, session, browser);
        }
    }

    void start(TrustedWebActivityIntentBuilder b, CustomTabsSession session, String browser) {
        try {
            b.build(session).launchTrustedWebActivity(this);
            launched = true;
            if (Build.VERSION.SDK_INT >= 34) overrideActivityTransition(OVERRIDE_TRANSITION_OPEN, 0, 0);
            else overridePendingTransition(0, 0);
        } catch (Throwable t) {
            fallback(b.getUri());
        }
    }

    // Partage vers l'application (share_target du manifest web).
    void shareParams(TrustedWebActivityIntentBuilder b, Intent in) {
        JSONObject st = cfg.optJSONObject("shareTarget");
        if (st == null || in == null || !(Intent.ACTION_SEND.equals(in.getAction()) || Intent.ACTION_SEND_MULTIPLE.equals(in.getAction()))) return;
        try {
            JSONObject p = st.optJSONObject("params");
            if (p == null) p = new JSONObject();
            List<ShareTarget.FileFormField> files = new ArrayList<>();
            JSONArray fa = p.optJSONArray("files");
            if (fa != null) {
                for (int i = 0; i < fa.length(); i++) {
                    JSONObject f = fa.getJSONObject(i);
                    List<String> accept = new ArrayList<>();
                    JSONArray ac = f.optJSONArray("accept");
                    if (ac != null) for (int k = 0; k < ac.length(); k++) accept.add(ac.getString(k));
                    else if (f.has("accept")) accept.add(f.optString("accept"));
                    files.add(new ShareTarget.FileFormField(f.optString("name", "file"), accept));
                }
            }
            ShareTarget target = new ShareTarget(st.optString("action", "/"), st.optString("method", "GET").toUpperCase(),
                    st.optString("enctype", ShareTarget.ENCODING_TYPE_URL_ENCODED),
                    new ShareTarget.Params(p.optString("title", null), p.optString("text", null), files));
            List<Uri> uris = new ArrayList<>();
            if (Intent.ACTION_SEND_MULTIPLE.equals(in.getAction())) {
                ArrayList<Uri> l = in.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (l != null) uris.addAll(l);
            } else {
                Uri one = in.getParcelableExtra(Intent.EXTRA_STREAM);
                if (one != null) uris.add(one);
            }
            b.setShareParams(target, new ShareData(in.getStringExtra(Intent.EXTRA_SUBJECT), in.getStringExtra(Intent.EXTRA_TEXT), uris));
        } catch (Throwable ignored) { }
    }

    void fallback(Uri uri) {
        if (isFinishing()) return;
        String mode = cfg.optString("fallback", "webview");
        try {
            if ("customtabs".equals(mode)) {
                int bg = color(cfg.optString("bgColor"), Color.WHITE);
                CustomTabsIntent ct = new CustomTabsIntent.Builder()
                        .setDefaultColorSchemeParams(new CustomTabColorSchemeParams.Builder().setToolbarColor(color(cfg.optString("themeColor"), bg)).build())
                        .build();
                String pkg = CustomTabsClient.getPackageName(this, null);
                if (pkg != null) ct.intent.setPackage(pkg);
                ct.launchUrl(this, uri);
            } else {
                Intent i = new Intent(this, MainActivity.class);
                i.setAction(Intent.ACTION_VIEW);
                i.setData(uri);
                startActivity(i);
            }
        } catch (Throwable t) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Throwable ignored) { }
        }
        launched = true;
        finish();
    }

    // ------------------------------------------------------------------ aides
    JSONObject loadConfig() {
        try (InputStream in = getAssets().open("vitrine/twa.json")) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            return new JSONObject(b.toString("UTF-8"));
        } catch (Throwable t) {
            return new JSONObject();
        }
    }

    Uri launchUri(Intent in) {
        String start = cfg.optString("url", "https://example.com/");
        Uri base = Uri.parse(start);
        if (in != null) {
            String extra = in.getStringExtra("vitrine_url");
            if (extra != null && extra.startsWith("http")) return Uri.parse(extra);
            Uri d = in.getData();
            if (d != null && ("https".equals(d.getScheme()) || "http".equals(d.getScheme()))) return d;
            if (d != null && d.getScheme() != null) {
                // Schéma personnalisé : monapp://chemin → https://site/chemin
                String path = (d.getHost() != null ? "/" + d.getHost() : "") + (d.getEncodedPath() != null ? d.getEncodedPath() : "");
                return base.buildUpon().encodedPath(path).encodedQuery(d.getEncodedQuery()).build();
            }
        }
        return base;
    }

    String pickBrowser() {
        PackageManager pm = getPackageManager();
        List<String> twa = new ArrayList<>();
        try {
            List<ResolveInfo> l = pm.queryIntentServices(new Intent(CustomTabsService.ACTION_CUSTOM_TABS_CONNECTION), PackageManager.GET_RESOLVED_FILTER);
            for (ResolveInfo ri : l) {
                if (ri.filter != null && ri.filter.hasCategory(CATEGORY_TWA) && ri.serviceInfo != null) twa.add(ri.serviceInfo.packageName);
            }
        } catch (Throwable ignored) { }
        if (twa.isEmpty()) return null;
        try {
            ResolveInfo def = pm.resolveActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://")), PackageManager.MATCH_DEFAULT_ONLY);
            if (def != null && def.activityInfo != null && twa.contains(def.activityInfo.packageName)) return def.activityInfo.packageName;
        } catch (Throwable ignored) { }
        for (String p : PREFERRED) if (twa.contains(p)) return p;
        return twa.get(0);
    }

    void showSplash(int bg) {
        FrameLayout f = new FrameLayout(this);
        f.setBackgroundColor(bg);
        int id = getResources().getIdentifier("vt_splash_logo", "drawable", getPackageName());
        if (id != 0) {
            ImageView logo = new ImageView(this);
            logo.setImageResource(id);
            float d = getResources().getDisplayMetrics().density;
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams((int) (150 * d), (int) (150 * d));
            lp.gravity = Gravity.CENTER;
            f.addView(logo, lp);
            logo.setAlpha(0f);
            logo.setScaleX(0.86f);
            logo.setScaleY(0.86f);
            logo.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(380).start();
        }
        setContentView(f, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        f.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    Bitmap splashBitmap() {
        int id = getResources().getIdentifier("vt_splash_logo", "drawable", getPackageName());
        if (id == 0) return null;
        try {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inScaled = true;
            Bitmap b = BitmapFactory.decodeResource(getResources(), id, o);
            if (b == null) return null;
            float d = getResources().getDisplayMetrics().density;
            int px = (int) (150 * d);
            return Bitmap.createScaledBitmap(b, px, px * b.getHeight() / Math.max(1, b.getWidth()), true);
        } catch (Throwable t) {
            return null;
        }
    }

    static int orientation(String s) {
        switch (s) {
            case "portrait": return ScreenOrientation.PORTRAIT;
            case "portrait-primary": return ScreenOrientation.PORTRAIT_PRIMARY;
            case "portrait-secondary": return ScreenOrientation.PORTRAIT_SECONDARY;
            case "landscape": return ScreenOrientation.LANDSCAPE;
            case "landscape-primary": return ScreenOrientation.LANDSCAPE_PRIMARY;
            case "landscape-secondary": return ScreenOrientation.LANDSCAPE_SECONDARY;
            case "natural": return ScreenOrientation.NATURAL;
            case "any": return ScreenOrientation.ANY;
            default: return ScreenOrientation.DEFAULT;
        }
    }

    static int color(String s, int fallback) {
        try { return s == null || s.isEmpty() ? fallback : Color.parseColor(s); } catch (Throwable t) { return fallback; }
    }

    static SharedPreferences prefs(Activity a) {
        return a.getSharedPreferences("vitrine_twa", MODE_PRIVATE);
    }
}
