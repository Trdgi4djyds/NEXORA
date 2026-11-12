package app.vitrine.shell;

import android.app.Activity;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.LinearLayout;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * NEXORA #115 : publicités Google AdMob (SDK officiel, play-services-ads) avec le consentement de Google (UMP) :
 * bannière adaptative posée au-dessus ou au-dessous de la page (la page rétrécit, rien n'est recouvert),
 * interstitiel et vidéo avec récompense commandés par la page sous window.VitrineAdMob puis NexoraApp.ads
 * (bridge.js). Les identifiants de test de Google sont utilisés tant que l'App Builder est en mode test.
 */
public final class VtAdMob {
    private final Activity act;
    private final WebView web;
    private final JSONObject cfg;
    private final List<Runnable> waiting = new ArrayList<>();
    private boolean ready;
    private boolean starting;
    private AdView banner;
    private FrameLayout bannerBox;
    private InterstitialAd interstitial;
    private RewardedAd rewarded;

    private VtAdMob(Activity a, WebView w, JSONObject c) {
        act = a;
        web = w;
        cfg = c;
    }

    /** Appelé par MainActivity (réflexion) avant le premier chargement de page. */
    public static void attach(Activity a, WebView w, String config) {
        JSONObject cfg = null;
        try { cfg = new JSONObject(config); } catch (Exception ignored) { /* réglages par défaut */ }
        if (cfg == null) cfg = new JSONObject();
        final VtAdMob m = new VtAdMob(a, w, cfg);
        w.addJavascriptInterface(m, "VitrineAdMob");
        // Annonces web de votre site (AdSense, Ad Manager) : rattachées à l'application pour être mieux rémunérées.
        if (cfg.optBoolean("webview", false)) {
            try { MobileAds.registerWebView(w); } catch (Throwable ignored) { /* version du SDK sans cette fonction */ }
        }
        m.ensure(() -> {
            JSONObject b = m.cfg.optJSONObject("banner");
            if (b != null && b.optString("unit", "").length() > 0 && b.optBoolean("auto", true)) m.showBannerNow();
            JSONObject i = m.cfg.optJSONObject("interstitial");
            if (i != null && i.optString("unit", "").length() > 0) m.loadInterstitialNow(null);
            JSONObject r = m.cfg.optJSONObject("rewarded");
            if (r != null && r.optString("unit", "").length() > 0) m.loadRewardedNow(null);
        });
    }

    // ------------------------------------------------------------ consentement puis démarrage du SDK
    private void ensure(Runnable then) {
        synchronized (waiting) {
            if (ready) { act.runOnUiThread(then); return; }
            waiting.add(then);
            if (starting) return;
            starting = true;
        }
        if (cfg.optBoolean("consent", true)) {
            final ConsentInformation ci = UserMessagingPlatform.getConsentInformation(act);
            ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();
            ci.requestConsentInfoUpdate(act, params,
                () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(act, (err) -> { if (ci.canRequestAds()) start(); else stopWaiting(); }),
                (err) -> { if (ci.canRequestAds()) start(); else stopWaiting(); });
            // Consentement déjà donné lors d'une session précédente : inutile d'attendre la réponse.
            if (ci.canRequestAds()) start();
        } else {
            start();
        }
    }

    private void stopWaiting() {
        synchronized (waiting) { starting = false; waiting.clear(); }
        event("{\"type\":\"consent\",\"canRequestAds\":false}");
    }

    private void start() {
        synchronized (waiting) { if (ready) return; }
        new Thread(() -> MobileAds.initialize(act.getApplicationContext(), (status) -> {
            List<Runnable> run;
            synchronized (waiting) { ready = true; starting = false; run = new ArrayList<>(waiting); waiting.clear(); }
            for (Runnable x : run) act.runOnUiThread(x);
        })).start();
    }

    private String unit(String kind) {
        JSONObject o = cfg.optJSONObject(kind);
        return o == null ? "" : o.optString("unit", "");
    }

    // ------------------------------------------------------------ bannière
    private void showBannerNow() {
        String unit = unit("banner");
        if (unit.isEmpty()) return;
        if (banner != null) { bannerBox.setVisibility(View.VISIBLE); return; }
        JSONObject b = cfg.optJSONObject("banner");
        boolean top = b != null && "top".equals(b.optString("position", "bottom"));
        banner = new AdView(act);
        banner.setAdUnitId(unit);
        float density = act.getResources().getDisplayMetrics().density;
        int widthDp = Math.round(act.getResources().getDisplayMetrics().widthPixels / density);
        banner.setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(act, widthDp));
        bannerBox = new FrameLayout(act);
        bannerBox.addView(banner, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER_HORIZONTAL));
        banner.setAdListener(new AdListener() {
            @Override
            public void onAdLoaded() {
                int h = Math.round(banner.getAdSize() != null ? banner.getAdSize().getHeight() : 50);
                event("{\"type\":\"banner\",\"shown\":true,\"height\":" + h + "}");
            }

            @Override
            public void onAdFailedToLoad(LoadAdError e) { event("{\"type\":\"banner\",\"shown\":false,\"error\":" + JSONObject.quote(e.getMessage()) + "}"); }
        });
        // Colonne de MainActivity (barre d'état, page, onglets, barre de navigation) : la bannière s'y insère.
        View main = web.getParent() instanceof View ? (View) ((View) web.getParent()).getParent() : null;
        ViewGroup col = main != null && main.getParent() instanceof LinearLayout ? (ViewGroup) main.getParent() : null;
        if (col != null) {
            int at = col.indexOfChild(main);
            col.addView(bannerBox, top ? at : at + 1, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        } else {
            ViewGroup content = act.findViewById(android.R.id.content);
            content.addView(bannerBox, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, top ? Gravity.TOP : Gravity.BOTTOM));
        }
        banner.loadAd(new AdRequest.Builder().build());
    }

    // ------------------------------------------------------------ interstitiel
    private void loadInterstitialNow(final String id) {
        String unit = unit("interstitial");
        if (unit.isEmpty()) { if (id != null) reject(id, "Aucun identifiant d'interstitiel dans l'App Builder."); return; }
        InterstitialAd.load(act, unit, new AdRequest.Builder().build(), new InterstitialAdLoadCallback() {
            @Override
            public void onAdLoaded(InterstitialAd ad) { interstitial = ad; if (id != null) resolve(id, "true"); }

            @Override
            public void onAdFailedToLoad(LoadAdError e) { interstitial = null; if (id != null) reject(id, e.getMessage()); }
        });
    }

    // ------------------------------------------------------------ vidéo avec récompense
    private void loadRewardedNow(final String id) {
        String unit = unit("rewarded");
        if (unit.isEmpty()) { if (id != null) reject(id, "Aucun identifiant de vidéo avec récompense dans l'App Builder."); return; }
        RewardedAd.load(act, unit, new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override
            public void onAdLoaded(RewardedAd ad) { rewarded = ad; if (id != null) resolve(id, "true"); }

            @Override
            public void onAdFailedToLoad(LoadAdError e) { rewarded = null; if (id != null) reject(id, e.getMessage()); }
        });
    }

    // ------------------------------------------------------------ fonctions appelées par la page
    @JavascriptInterface
    public void showBanner() { ensure(this::showBannerNow); }

    @JavascriptInterface
    public void hideBanner() {
        act.runOnUiThread(() -> { if (bannerBox != null) bannerBox.setVisibility(View.GONE); event("{\"type\":\"banner\",\"shown\":false,\"height\":0}"); });
    }

    @JavascriptInterface
    public void loadInterstitial(String id) { ensure(() -> loadInterstitialNow(id)); }

    @JavascriptInterface
    public void showInterstitial(final String id) {
        ensure(() -> {
            if (interstitial == null) { reject(id, "Aucun interstitiel prêt : appelez d'abord NexoraApp.ads.loadInterstitial()."); loadInterstitialNow(null); return; }
            interstitial.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override
                public void onAdDismissedFullScreenContent() { interstitial = null; resolve(id, "true"); loadInterstitialNow(null); }

                @Override
                public void onAdFailedToShowFullScreenContent(AdError e) { interstitial = null; reject(id, e.getMessage()); loadInterstitialNow(null); }
            });
            interstitial.show(act);
        });
    }

    @JavascriptInterface
    public void loadRewarded(String id) { ensure(() -> loadRewardedNow(id)); }

    @JavascriptInterface
    public void showRewarded(final String id) {
        ensure(() -> {
            if (rewarded == null) { reject(id, "Aucune vidéo prête : appelez d'abord NexoraApp.ads.loadRewarded()."); loadRewardedNow(null); return; }
            final JSONObject reward = new JSONObject();
            rewarded.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override
                public void onAdDismissedFullScreenContent() {
                    rewarded = null;
                    try { if (!reward.has("earned")) reward.put("earned", false); } catch (Exception ignored) { /* objet simple */ }
                    resolve(id, reward.toString());
                    loadRewardedNow(null);
                }

                @Override
                public void onAdFailedToShowFullScreenContent(AdError e) { rewarded = null; reject(id, e.getMessage()); loadRewardedNow(null); }
            });
            rewarded.show(act, (item) -> {
                try { reward.put("earned", true); reward.put("amount", item.getAmount()); reward.put("type", item.getType()); } catch (Exception ignored) { /* objet simple */ }
            });
        });
    }

    /** Formulaire « Options de confidentialité » de Google (à proposer dans les réglages de votre page). */
    @JavascriptInterface
    public void privacyOptions(final String id) {
        act.runOnUiThread(() -> UserMessagingPlatform.showPrivacyOptionsForm(act, (err) -> { if (err != null) reject(id, err.getMessage()); else resolve(id, "true"); }));
    }

    @JavascriptInterface
    public void status(String id) {
        ConsentInformation ci = UserMessagingPlatform.getConsentInformation(act);
        boolean privacy = ci.getPrivacyOptionsRequirementStatus() == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED;
        resolve(id, "{\"ready\":" + ready + ",\"canRequestAds\":" + ci.canRequestAds() + ",\"privacyOptions\":" + privacy
            + ",\"interstitial\":" + (interstitial != null) + ",\"rewarded\":" + (rewarded != null) + ",\"banner\":" + (banner != null && bannerBox.getVisibility() == View.VISIBLE) + "}");
    }

    // ------------------------------------------------------------ réponses à la page
    private void event(String json) {
        send("window.__vitrineAds && window.__vitrineAds(" + json + ")");
    }

    private void resolve(String id, String json) { if (id != null) send("window.__vitrineResolve && window.__vitrineResolve(" + JSONObject.quote(id) + ", true, " + json + ")"); }

    private void reject(String id, String msg) { if (id != null) send("window.__vitrineResolve && window.__vitrineResolve(" + JSONObject.quote(id) + ", false, new Error(" + JSONObject.quote(msg == null ? "Publicité indisponible." : msg) + "))"); }

    private void send(String js) {
        act.runOnUiThread(() -> { try { web.evaluateJavascript(js, null); } catch (Throwable ignored) { /* page fermée */ } });
    }
}
