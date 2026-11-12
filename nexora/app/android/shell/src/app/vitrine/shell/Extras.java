package app.vitrine.shell;

import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.security.MessageDigest;

/** Éléments natifs optionnels : bouton flottant, menu latéral, navigateur intégré, écrans d'accueil,
 * fenêtre d'annonce au lancement, code de verrouillage. */
final class Extras {
    final MainActivity a;
    View fab;
    FrameLayout drawer;
    FrameLayout browser;
    WebView browserWeb;
    TextView browserTitle;
    FrameLayout lock;
    long backgroundAt;

    Extras(MainActivity a) {
        this.a = a;
    }

    SharedPreferences prefs() {
        return a.getSharedPreferences("vitrine", Context.MODE_PRIVATE);
    }

    int dp(float v) {
        return a.dp(v);
    }

    void build() {
        if (a.cfg.fab != null && a.cfg.fab.optBoolean("enabled", true)) buildFab(a.cfg.fab);
        if (a.cfg.menu != null && a.cfg.menu.optJSONArray("items") != null) buildDrawer(a.cfg.menu);
    }

    /** Écrans à montrer après le démarrage : accueil (première fois), annonce, verrouillage. */
    void afterSplash() {
        if (needsLock()) showLock(false);
        else if (a.cfg.onboarding != null && !prefs().getBoolean("onboarding_done", false)) showOnboarding();
        else showModalIfNeeded();
    }

    // ------------------------------------------------------------------ bouton flottant
    void buildFab(JSONObject f) {
        ImageView b = new ImageView(a);
        int color = Config.color(f.optString("color"), a.cfg.accent);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(color);
        b.setBackground(bg);
        b.setElevation(dp(6));
        int icon = a.drawable("vt_tab_" + f.optString("icon", "chat"));
        if (icon != 0) b.setImageResource(icon);
        b.setImageTintList(ColorStateList.valueOf(MainActivity.isLight(color) ? 0xFF1D1D1F : Color.WHITE));
        b.setPadding(dp(16), dp(16), dp(16), dp(16));
        b.setContentDescription(f.optString("label", "Action"));
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(56), dp(56));
        lp.gravity = Gravity.BOTTOM | ("left".equals(f.optString("position")) ? Gravity.START : Gravity.END);
        lp.setMargins(dp(18), dp(18), dp(18), dp(22));
        b.setOnClickListener(v -> fabAction(f));
        a.main.addView(b, lp);
        fab = b;
    }

    void fabAction(JSONObject f) {
        String action = f.optString("action", "url");
        String value = f.optString("value", "");
        switch (action) {
            case "share": a.shareText(a.web.getUrl()); break;
            case "js": a.web.evaluateJavascript(value, null); break;
            case "tel": a.openExternal(Uri.parse("tel:" + value)); break;
            case "whatsapp": a.openExternal(Uri.parse("https://wa.me/" + value.replaceAll("[^0-9]", ""))); break;
            case "menu": openDrawer(); break;
            case "reload": a.web.reload(); break;
            default: if (!value.isEmpty()) a.navigate(Uri.parse(value)); break;
        }
    }

    // ------------------------------------------------------------------ menu latéral
    void buildDrawer(JSONObject m) {
        drawer = new FrameLayout(a);
        drawer.setVisibility(View.GONE);
        View scrim = new View(a);
        scrim.setBackgroundColor(0x66000000);
        scrim.setOnClickListener(v -> closeDrawer());
        drawer.addView(scrim, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        int bgc = Config.color(m.optString("bg"), a.cfg.bgColor);
        boolean light = MainActivity.isLight(bgc);
        LinearLayout panel = new LinearLayout(a);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setBackgroundColor(bgc);
        panel.setElevation(dp(12));
        panel.setPadding(0, a.insetTop + dp(18), 0, dp(18));
        panel.setTag("panel");
        TextView title = new TextView(a);
        title.setText(m.optString("title", a.cfg.appName));
        title.setTextSize(20);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(light ? 0xFF1D1D1F : Color.WHITE);
        title.setPadding(dp(22), dp(8), dp(22), dp(18));
        panel.addView(title);
        JSONArray items = m.optJSONArray("items");
        for (int i = 0; items != null && i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null) continue;
            LinearLayout row = new LinearLayout(a);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(dp(22), 0, dp(22), 0);
            ImageView ic = new ImageView(a);
            int id = a.drawable("vt_tab_" + it.optString("icon", "info"));
            if (id != 0) ic.setImageResource(id);
            ic.setImageTintList(ColorStateList.valueOf(a.cfg.accent));
            row.addView(ic, new LinearLayout.LayoutParams(dp(22), dp(22)));
            TextView t = new TextView(a);
            t.setText(it.optString("label"));
            t.setTextSize(16);
            t.setTextColor(light ? 0xFF1D1D1F : Color.WHITE);
            LinearLayout.LayoutParams tl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            tl.leftMargin = dp(16);
            row.addView(t, tl);
            final String url = it.optString("url");
            row.setOnClickListener(v -> {
                closeDrawer();
                a.navigate(Uri.parse(url));
            });
            panel.addView(row, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)));
        }
        FrameLayout.LayoutParams pl = new FrameLayout.LayoutParams(Math.min(dp(320), a.getResources().getDisplayMetrics().widthPixels * 82 / 100), ViewGroup.LayoutParams.MATCH_PARENT);
        pl.gravity = Gravity.START;
        drawer.addView(panel, pl);
        a.root.addView(drawer, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    void openDrawer() {
        if (drawer == null) return;
        View panel = drawer.findViewWithTag("panel");
        drawer.setVisibility(View.VISIBLE);
        drawer.bringToFront();
        panel.setTranslationX(-panel.getWidth() - dp(20));
        panel.animate().translationX(0).setDuration(220).start();
    }

    boolean closeDrawer() {
        if (drawer == null || drawer.getVisibility() != View.VISIBLE) return false;
        View panel = drawer.findViewWithTag("panel");
        panel.animate().translationX(-panel.getWidth() - dp(20)).setDuration(180).withEndAction(() -> drawer.setVisibility(View.GONE)).start();
        return true;
    }

    // ------------------------------------------------------------------ navigateur intégré
    void openBrowser(String url) {
        if (browser == null) {
            browser = new FrameLayout(a);
            browser.setBackgroundColor(Color.WHITE);
            LinearLayout col = new LinearLayout(a);
            col.setOrientation(LinearLayout.VERTICAL);
            col.setPadding(0, a.insetTop, 0, 0);
            LinearLayout bar = new LinearLayout(a);
            bar.setOrientation(LinearLayout.HORIZONTAL);
            bar.setGravity(Gravity.CENTER_VERTICAL);
            bar.setBackgroundColor(0xFFF6F6F8);
            bar.setPadding(dp(6), 0, dp(6), 0);
            TextView close = barButton("✕");
            close.setOnClickListener(v -> closeBrowser());
            bar.addView(close, new LinearLayout.LayoutParams(dp(44), dp(48)));
            browserTitle = new TextView(a);
            browserTitle.setSingleLine(true);
            browserTitle.setTextColor(0xFF1D1D1F);
            browserTitle.setTextSize(14);
            browserTitle.setGravity(Gravity.CENTER);
            bar.addView(browserTitle, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            TextView ext = barButton("↗");
            ext.setOnClickListener(v -> {
                String u = browserWeb.getUrl();
                closeBrowser();
                if (u != null) a.openExternal(Uri.parse(u));
            });
            bar.addView(ext, new LinearLayout.LayoutParams(dp(44), dp(48)));
            col.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)));
            browserWeb = new WebView(a);
            browserWeb.getSettings().setJavaScriptEnabled(true);
            browserWeb.getSettings().setDomStorageEnabled(true);
            browserWeb.getSettings().setTextZoom(100);
            browserWeb.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                    String s = r.getUrl().getScheme();
                    if ("http".equals(s) || "https".equals(s)) return false;
                    a.openExternal(r.getUrl());
                    return true;
                }

                @Override
                public void onPageFinished(WebView v, String u) {
                    browserTitle.setText(v.getTitle() == null ? u : v.getTitle());
                }
            });
            col.addView(browserWeb, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
            browser.addView(col, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            a.root.addView(browser, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        browserTitle.setText(Uri.parse(url).getHost());
        browser.setVisibility(View.VISIBLE);
        browser.bringToFront();
        browser.setTranslationY(dp(40));
        browser.setAlpha(0f);
        browser.animate().translationY(0).alpha(1f).setDuration(200).start();
        browserWeb.loadUrl(url);
    }

    TextView barButton(String text) {
        TextView t = new TextView(a);
        t.setText(text);
        t.setTextSize(18);
        t.setGravity(Gravity.CENTER);
        t.setTextColor(0xFF1D1D1F);
        return t;
    }

    boolean closeBrowser() {
        if (browser == null || browser.getVisibility() != View.VISIBLE) return false;
        if (browserWeb.canGoBack()) {
            browserWeb.goBack();
            return true;
        }
        browser.animate().alpha(0f).setDuration(160).withEndAction(() -> {
            browser.setVisibility(View.GONE);
            browserWeb.loadUrl("about:blank");
        }).start();
        return true;
    }

    // ------------------------------------------------------------------ écrans d'accueil
    void showOnboarding() {
        JSONObject o = a.cfg.onboarding;
        JSONArray slides = o.optJSONArray("slides");
        if (slides == null || slides.length() == 0) return;
        int bg = Config.color(o.optString("bg"), a.cfg.bgColor);
        boolean light = MainActivity.isLight(bg);
        FrameLayout box = new FrameLayout(a);
        box.setBackgroundColor(bg);
        box.setClickable(true);
        LinearLayout col = new LinearLayout(a);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER);
        col.setPadding(dp(32), a.insetTop + dp(24), dp(32), a.insetBottom + dp(24));
        ImageView img = new ImageView(a);
        img.setScaleType(ImageView.ScaleType.FIT_CENTER);
        col.addView(img, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        TextView title = new TextView(a);
        title.setTextSize(24);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        title.setTextColor(light ? 0xFF1D1D1F : Color.WHITE);
        LinearLayout.LayoutParams tl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        tl.topMargin = dp(24);
        col.addView(title, tl);
        TextView text = new TextView(a);
        text.setTextSize(16);
        text.setGravity(Gravity.CENTER);
        text.setTextColor(light ? 0xFF6E6E73 : 0xFFC7C7CC);
        LinearLayout.LayoutParams xl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        xl.topMargin = dp(10);
        col.addView(text, xl);
        LinearLayout dots = new LinearLayout(a);
        dots.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams dl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(28));
        dl.topMargin = dp(20);
        col.addView(dots, dl);
        Button next = new Button(a);
        next.setAllCaps(false);
        next.setTextColor(MainActivity.isLight(a.cfg.accent) ? 0xFF1D1D1F : Color.WHITE);
        GradientDrawable nb = new GradientDrawable();
        nb.setColor(a.cfg.accent);
        nb.setCornerRadius(dp(26));
        next.setBackground(nb);
        LinearLayout.LayoutParams bl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52));
        bl.topMargin = dp(12);
        col.addView(next, bl);
        TextView skip = new TextView(a);
        skip.setText(o.optString("skip", "Passer"));
        skip.setGravity(Gravity.CENTER);
        skip.setTextColor(light ? 0xFF8E8E93 : 0xFFA1A1A6);
        col.addView(skip, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(40)));
        box.addView(col, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        final int[] idx = {0};
        Runnable show = new Runnable() {
            @Override
            public void run() {
                JSONObject sl = slides.optJSONObject(idx[0]);
                if (sl == null) return;
                int id = a.drawable("vt_onb_" + (idx[0] + 1));
                img.setImageResource(id != 0 ? id : a.drawable("vt_splash_logo"));
                title.setText(sl.optString("title"));
                text.setText(sl.optString("text"));
                boolean last = idx[0] == slides.length() - 1;
                next.setText(last ? o.optString("button", "Commencer") : o.optString("next", "Suivant"));
                skip.setVisibility(last ? View.INVISIBLE : View.VISIBLE);
                dots.removeAllViews();
                for (int i = 0; i < slides.length(); i++) {
                    View d = new View(a);
                    GradientDrawable g = new GradientDrawable();
                    g.setCornerRadius(dp(4));
                    g.setColor(i == idx[0] ? a.cfg.accent : (light ? 0x33000000 : 0x55FFFFFF));
                    d.setBackground(g);
                    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(i == idx[0] ? dp(22) : dp(8), dp(8));
                    p.setMargins(dp(4), 0, dp(4), 0);
                    dots.addView(d, p);
                }
                col.setAlpha(0.3f);
                col.animate().alpha(1f).setDuration(200).start();
            }
        };
        Runnable finish = () -> {
            prefs().edit().putBoolean("onboarding_done", true).apply();
            box.animate().alpha(0f).setDuration(220).withEndAction(() -> {
                a.root.removeView(box);
                showModalIfNeeded();
            }).start();
        };
        next.setOnClickListener(v -> {
            if (idx[0] < slides.length() - 1) {
                idx[0]++;
                show.run();
            } else finish.run();
        });
        skip.setOnClickListener(v -> finish.run());
        show.run();
        a.root.addView(box, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    // ------------------------------------------------------------------ annonce au lancement
    void showModalIfNeeded() {
        JSONObject m = a.cfg.modal;
        if (m == null || !m.optBoolean("enabled", true)) return;
        String key = "modal_" + m.optString("id", "1");
        if ("once".equals(m.optString("frequency", "once")) && prefs().getBoolean(key, false)) return;
        prefs().edit().putBoolean(key, true).apply();
        a.ui.postDelayed(() -> showModal(m), 400);
    }

    void showModal(JSONObject m) {
        AlertDialog.Builder b = new AlertDialog.Builder(a);
        LinearLayout col = new LinearLayout(a);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(24), dp(20), dp(24), dp(4));
        int img = a.drawable("vt_modal");
        if (img != 0) {
            ImageView iv = new ImageView(a);
            iv.setImageResource(img);
            iv.setAdjustViewBounds(true);
            col.addView(iv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        }
        TextView t = new TextView(a);
        t.setText(m.optString("title"));
        t.setTextSize(20);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setTextColor(0xFF1D1D1F);
        LinearLayout.LayoutParams tl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        tl.topMargin = dp(12);
        col.addView(t, tl);
        TextView x = new TextView(a);
        x.setText(m.optString("text"));
        x.setTextSize(15);
        x.setTextColor(0xFF3A3A3C);
        LinearLayout.LayoutParams xl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        xl.topMargin = dp(8);
        col.addView(x, xl);
        ScrollView sv = new ScrollView(a);
        sv.addView(col);
        b.setView(sv);
        String url = m.optString("url");
        b.setPositiveButton(m.optString("button", "OK"), (d, w) -> {
            if (!url.isEmpty()) a.navigate(Uri.parse(url));
        });
        if (!url.isEmpty()) b.setNegativeButton(m.optString("dismiss", "Plus tard"), null);
        b.show();
    }

    // ------------------------------------------------------------------ code de verrouillage
    static String hash(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] h = md.digest(("vitrine:" + s).getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (byte x : h) sb.append(String.format("%02x", x));
            return sb.toString();
        } catch (Exception e) {
            return s;
        }
    }

    boolean lockEnabled() {
        return a.cfg.passcode != null && a.cfg.passcode.optBoolean("enabled", false);
    }

    boolean needsLock() {
        return lockEnabled() && (prefs().contains("passcode") || a.cfg.passcode.optBoolean("required", false));
    }

    void setPasscode(String code) {
        if (code == null || code.length() < 4) return;
        prefs().edit().putString("passcode", hash(code)).apply();
    }

    void resetPasscode() {
        prefs().edit().remove("passcode").apply();
    }

    void onPause() {
        backgroundAt = System.currentTimeMillis();
    }

    void onResume() {
        if (backgroundAt > 0 && System.currentTimeMillis() - backgroundAt > a.cfg.passcode.optLong("timeout", 30) * 1000 && needsLock() && lock == null) showLock(false);
    }

    void showLock(boolean creating) {
        if (lock != null) return;
        boolean create = creating || !prefs().contains("passcode");
        int bg = Config.color(a.cfg.passcode.optString("bg"), 0xFF111114);
        boolean light = MainActivity.isLight(bg);
        int ink = light ? 0xFF1D1D1F : Color.WHITE;
        lock = new FrameLayout(a);
        lock.setBackgroundColor(bg);
        lock.setClickable(true);
        LinearLayout col = new LinearLayout(a);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        col.setPadding(dp(24), a.insetTop + dp(56), dp(24), a.insetBottom + dp(24));
        TextView title = new TextView(a);
        title.setTextColor(ink);
        title.setTextSize(19);
        title.setGravity(Gravity.CENTER);
        title.setText(create ? "Choisissez un code à 4 chiffres" : a.cfg.passcode.optString("title", "Saisissez votre code"));
        col.addView(title, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        LinearLayout dots = new LinearLayout(a);
        dots.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams dl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(44));
        dl.topMargin = dp(22);
        col.addView(dots, dl);
        final StringBuilder code = new StringBuilder();
        final String[] first = {null};
        Runnable draw = () -> {
            dots.removeAllViews();
            for (int i = 0; i < 4; i++) {
                View d = new View(a);
                GradientDrawable g = new GradientDrawable();
                g.setShape(GradientDrawable.OVAL);
                if (i < code.length()) g.setColor(ink);
                else g.setStroke(dp(1.5f), ink);
                d.setBackground(g);
                LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(dp(14), dp(14));
                p.setMargins(dp(10), 0, dp(10), 0);
                dots.addView(d, p);
            }
        };
        draw.run();
        String[] keys = {"1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"};
        LinearLayout grid = new LinearLayout(a);
        grid.setOrientation(LinearLayout.VERTICAL);
        for (int r = 0; r < 4; r++) {
            LinearLayout row = new LinearLayout(a);
            row.setGravity(Gravity.CENTER);
            for (int c = 0; c < 3; c++) {
                String k = keys[r * 3 + c];
                TextView key = new TextView(a);
                key.setText(k);
                key.setTextSize(26);
                key.setTextColor(ink);
                key.setGravity(Gravity.CENTER);
                if (!k.isEmpty()) {
                    GradientDrawable g = new GradientDrawable();
                    g.setShape(GradientDrawable.OVAL);
                    g.setColor(light ? 0x14000000 : 0x22FFFFFF);
                    if (!"⌫".equals(k)) key.setBackground(g);
                    key.setOnClickListener(v -> {
                        if ("⌫".equals(k)) {
                            if (code.length() > 0) code.deleteCharAt(code.length() - 1);
                        } else if (code.length() < 4) code.append(k);
                        draw.run();
                        if (code.length() < 4) return;
                        String entered = code.toString();
                        code.setLength(0);
                        a.ui.postDelayed(draw, 120);
                        if (create) {
                            if (first[0] == null) {
                                first[0] = entered;
                                title.setText("Confirmez le code");
                            } else if (first[0].equals(entered)) {
                                setPasscode(entered);
                                unlock();
                            } else {
                                first[0] = null;
                                title.setText("Les codes ne correspondent pas. Recommencez.");
                            }
                        } else if (hash(entered).equals(prefs().getString("passcode", ""))) unlock();
                        else {
                            title.setText("Code incorrect");
                            dots.animate().translationX(dp(12)).setDuration(60).withEndAction(() -> dots.animate().translationX(0).setDuration(60).start()).start();
                        }
                    });
                }
                LinearLayout.LayoutParams kp = new LinearLayout.LayoutParams(dp(74), dp(74));
                kp.setMargins(dp(12), dp(8), dp(12), dp(8));
                row.addView(key, kp);
            }
            grid.addView(row);
        }
        LinearLayout.LayoutParams gl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        gl.topMargin = dp(28);
        col.addView(grid, gl);
        lock.addView(col, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        a.root.addView(lock, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        a.setBarIcons(light, light);
    }

    void unlock() {
        if (lock == null) return;
        View l = lock;
        lock = null;
        l.animate().alpha(0f).setDuration(200).withEndAction(() -> {
            a.root.removeView(l);
            a.setStatusColor(a.lastTopColor == 0 ? a.cfg.statusColor : a.lastTopColor);
            if (a.cfg.onboarding != null && !prefs().getBoolean("onboarding_done", false)) showOnboarding();
            else showModalIfNeeded();
        }).start();
    }

    boolean locked() {
        return lock != null;
    }
}
