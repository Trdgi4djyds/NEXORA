package app.vitrine.shell;

import android.app.Activity;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;
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
import com.google.android.gms.ads.RequestConfiguration;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

import org.json.JSONObject;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * NEXORA #114 : module AdMob (SDK Google Mobile Ads et User Messaging Platform de Google). Consentement demandé
 * d'abord quand la loi l'exige (Espace économique européen, Royaume-Uni, Suisse), puis bannière adaptative en haut
 * ou en bas de l'écran, interstitiels et vidéos avec récompense. Ajouté par le kit AdMob de l'App Builder ;
 * MainActivity l'attache par réflexion quand le module est activé. Exposé à la page sous window.VitrineAds puis
 * NexoraApp.ads (bridge.js) ; événements « nexora-ads » (chargée, fermée, récompense, erreur).
 */
public final class VtAds {
    private final Activity act;
    private final WebView web;
    private final JSONObject cfg;
    private final AtomicBoolean started = new AtomicBoolean(false);
    private FrameLayout bannerBox;
    private AdView banner;
    private InterstitialAd interstitial;
    private RewardedAd rewarded;
    private long lastInterstitial;
    private int pages;
    private ConsentInformation consent;

    private VtAds(Activity a, WebView w, JSONObject c) {
        act = a;
        web = w;
        cfg = c;
    }

    /** Appelé par MainActivity (réflexion) avant le premier chargement de page. */
    public static Object attach(Activity a, WebView w, String config) {
        JSONObject c;
        try { c = new JSONObject(config); } catch (Exception e) { return null; }
        VtAds ads = new VtAds(a, w, c);
        w.addJavascriptInterface(ads, "VitrineAds");
        ads.askConsent();
        return ads;
    }

    // ------------------------------------------------------------ consentement puis démarrage du SDK
    private void askConsent() {
        consent = UserMessagingPlatform.getConsentInformation(act);
        ConsentRequestParameters params = new ConsentRequestParameters.Builder()
            .setTagForUnderAgeOfConsent(cfg.optBoolean("child", false))
            .build();
        consent.requestConsentInfoUpdate(act, params,
            () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(act, err -> { if (consent.canRequestAds()) start(); }),
            err -> { if (consent.canRequestAds()) start(); });
        // Consentement déjà donné lors d'une ouverture précédente : inutile d'attendre la réponse du serveur.
        if (consent.canRequestAds()) start();
    }

    private void start() {
        if (!started.compareAndSet(false, true)) return;
        RequestConfiguration.Builder rc = MobileAds.getRequestConfiguration().toBuilder();
        if (cfg.optBoolean("child", false)) rc.setTagForChildDirectedTreatment(RequestConfiguration.TAG_FOR_CHILD_DIRECTED_TREATMENT_TRUE);
        String rating = cfg.optString("rating", "");
        if ("G".equals(rating)) rc.setMaxAdContentRating(RequestConfiguration.MAX_AD_CONTENT_RATING_G);
        else if ("PG".equals(rating)) rc.setMaxAdContentRating(RequestConfiguration.MAX_AD_CONTENT_RATING_PG);
        else if ("T".equals(rating)) rc.setMaxAdContentRating(RequestConfiguration.MAX_AD_CONTENT_RATING_T);
        MobileAds.setRequestConfiguration(rc.build());
        new Thread(() -> MobileAds.initialize(act, status -> act.runOnUiThread(() -> {
            event("ready", "{}");
            if (!cfg.optString("banner", "").isEmpty() && cfg.optBoolean("bannerAuto", true)) showBanner(null);
            if (!cfg.optString("interstitial", "").isEmpty()) loadInterstitial();
            if (!cfg.optString("rewarded", "").isEmpty()) loadRewarded();
        }))).start();
    }

    // ------------------------------------------------------------ bannière
    private void showBanner(String id) {
        act.runOnUiThread(() -> {
            String unit = cfg.optString("banner", "");
            if (unit.isEmpty()) { if (id != null) reject(id, "Aucun bloc d'annonces de bannière configuré."); return; }
            if (!started.get()) { if (id != null) reject(id, "Publicités pas encore prêtes (consentement en attente)."); return; }
            if (banner == null) {
                // La bannière prend sa place dans la colonne de l'application (au-dessus des onglets ou sous la barre
                // d'état) : elle ne masque jamais la page.
                ViewParent p1 = web.getParent();
                ViewParent p2 = p1 == null ? null : p1.getParent();
                ViewParent p3 = p2 == null ? null : p2.getParent();
                if (!(p3 instanceof LinearLayout)) { if (id != null) reject(id, "Emplacement de la bannière introuvable."); return; }
                LinearLayout column = (LinearLayout) p3;
                int at = column.indexOfChild((View) p2);
                bannerBox = new FrameLayout(act);
                column.addView(bannerBox, "top".equals(cfg.optString("position")) ? at : at + 1,
                    new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
                banner = new AdView(act);
                banner.setAdUnitId(unit);
                DisplayMetrics m = act.getResources().getDisplayMetrics();
                banner.setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(act, (int) (m.widthPixels / m.density)));
                banner.setAdListener(new AdListener() {
                    @Override public void onAdLoaded() { event("banner-loaded", "{}"); }
                    @Override public void onAdFailedToLoad(LoadAdError e) { event("banner-error", err(e)); }
                    @Override public void onAdClicked() { event("banner-clicked", "{}"); }
                });
                FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                lp.gravity = Gravity.CENTER_HORIZONTAL;
                bannerBox.addView(banner, lp);
                banner.loadAd(new AdRequest.Builder().build());
            }
            bannerBox.setVisibility(View.VISIBLE);
            if (id != null) resolve(id, "true");
        });
    }

    // ------------------------------------------------------------ interstitiel
    private void loadInterstitial() {
        InterstitialAd.load(act, cfg.optString("interstitial"), new AdRequest.Builder().build(), new InterstitialAdLoadCallback() {
            @Override public void onAdLoaded(InterstitialAd ad) { interstitial = ad; event("interstitial-loaded", "{}"); }
            @Override public void onAdFailedToLoad(LoadAdError e) { interstitial = null; event("interstitial-error", err(e)); }
        });
    }

    private boolean showInterstitialNow(String id) {
        if (interstitial == null) { if (id != null) reject(id, "Aucune annonce interstitielle prête."); return false; }
        InterstitialAd ad = interstitial;
        interstitial = null;
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override public void onAdDismissedFullScreenContent() { event("interstitial-closed", "{}"); if (id != null) resolve(id, "true"); loadInterstitial(); }
            @Override public void onAdFailedToShowFullScreenContent(AdError e) { if (id != null) reject(id, e.getMessage()); loadInterstitial(); }
        });
        lastInterstitial = System.currentTimeMillis();
        ad.show(act);
        return true;
    }

    /** Appelé par MainActivity à chaque page chargée : interstitiel automatique toutes les N pages, au plus une fois par intervalle. */
    public void pageLoaded() {
        int every = cfg.optInt("autoEvery", 0);
        if (every <= 0) return;
        pages++;
        long gap = cfg.optLong("minGap", 60) * 1000L;
        if (pages >= every && System.currentTimeMillis() - lastInterstitial >= gap) {
            act.runOnUiThread(() -> { if (showInterstitialNow(null)) pages = 0; });
        }
    }

    // ------------------------------------------------------------ vidéo avec récompense
    private void loadRewarded() {
        RewardedAd.load(act, cfg.optString("rewarded"), new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override public void onAdLoaded(RewardedAd ad) { rewarded = ad; event("rewarded-loaded", "{}"); }
            @Override public void onAdFailedToLoad(LoadAdError e) { rewarded = null; event("rewarded-error", err(e)); }
        });
    }

    // ------------------------------------------------------------ fonctions appelées par la page
    @JavascriptInterface
    public void banner(boolean show, String id) {
        if (show) { showBanner(id); return; }
        act.runOnUiThread(() -> { if (bannerBox != null) bannerBox.setVisibility(View.GONE); resolve(id, "true"); });
    }

    @JavascriptInterface
    public void interstitial(String id) { act.runOnUiThread(() -> showInterstitialNow(id)); }

    @JavascriptInterface
    public void rewarded(String id) {
        act.runOnUiThread(() -> {
            if (rewarded == null) { reject(id, "Aucune vidéo avec récompense prête."); return; }
            RewardedAd ad = rewarded;
            rewarded = null;
            final boolean[] earned = { false };
            final String[] reward = { "{}" };
            ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override public void onAdDismissedFullScreenContent() {
                    if (earned[0]) resolve(id, reward[0]); else reject(id, "Vidéo fermée avant la fin : aucune récompense.");
                    loadRewarded();
                }
                @Override public void onAdFailedToShowFullScreenContent(AdError e) { reject(id, e.getMessage()); loadRewarded(); }
            });
            ad.show(act, item -> {
                earned[0] = true;
                try { reward[0] = new JSONObject().put("type", item.getType()).put("amount", item.getAmount()).toString(); } catch (Exception ignored) { /* récompense sans détail */ }
                event("reward", reward[0]);
            });
        });
    }

    @JavascriptInterface
    public void ready(String id) {
        try {
            resolve(id, new JSONObject().put("started", started.get()).put("interstitial", interstitial != null).put("rewarded", rewarded != null)
                .put("privacyOptions", consent != null && consent.getPrivacyOptionsRequirementStatus() == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED).toString());
        } catch (Exception e) { reject(id, "État indisponible."); }
    }

    /** Bouton « Gérer mes choix de confidentialité » de la page (obligatoire quand le formulaire de consentement s'applique). */
    @JavascriptInterface
    public void privacyOptions(String id) {
        act.runOnUiThread(() -> UserMessagingPlatform.showPrivacyOptionsForm(act, e -> { if (e != null) reject(id, e.getMessage()); else resolve(id, "true"); }));
    }

    // ------------------------------------------------------------ retour vers la page
    private static String err(LoadAdError e) {
        try { return new JSONObject().put("code", e.getCode()).put("message", e.getMessage()).toString(); } catch (Exception x) { return "{}"; }
    }

    private void event(String type, String detail) {
        send("window.dispatchEvent(new CustomEvent('nexora-ads', { detail: { type: " + JSONObject.quote(type) + ", data: " + detail + " } }))");
    }

    private void resolve(String id, String json) { if (id != null) send("window.__vitrineResolve && window.__vitrineResolve(" + JSONObject.quote(id) + ", true, " + json + ")"); }

    private void reject(String id, String msg) { if (id != null) send("window.__vitrineResolve && window.__vitrineResolve(" + JSONObject.quote(id) + ", false, new Error(" + JSONObject.quote(msg == null ? "Erreur" : msg) + "))"); }

    private void send(String js) {
        act.runOnUiThread(() -> { try { web.evaluateJavascript(js, null); } catch (Throwable ignored) { /* page fermée */ } });
    }
}
