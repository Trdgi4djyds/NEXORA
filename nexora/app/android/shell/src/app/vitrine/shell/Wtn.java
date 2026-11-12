package app.vitrine.shell;

import android.Manifest;
import android.app.DatePickerDialog;
import android.app.NotificationManager;
import android.app.TimePickerDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.hardware.biometrics.BiometricManager;
import android.location.LocationManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.nfc.NdefMessage;
import android.nfc.NdefRecord;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.Ndef;
import android.os.Build;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.util.Base64;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebStorage;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Interface compatible avec le SDK JavaScript de WebToNative (window.WebToNativeInterface) :
 * une page déjà adaptée à WebToNative fonctionne telle quelle dans une application NEXORA.
 * Les réponses passent par WebToNativeInterface.androidCBHook(json), comme dans le SDK d'origine,
 * et par l'événement « vitrinenative » sur window.
 */
final class Wtn {
    static final int REQ_VOICE = 43;
    final MainActivity a;
    boolean customBack;

    Wtn(MainActivity a) {
        this.a = a;
    }

    void cb(JSONObject o) {
        String json = JSONObject.quote(o.toString());
        a.ui.post(() -> {
            if (a.web == null) return;
            a.web.evaluateJavascript("(function(r){var w=window.WebToNativeInterface;try{if(w&&w.androidCBHook)w.androidCBHook(r);}catch(e){}try{window.dispatchEvent(new CustomEvent('vitrinenative',{detail:JSON.parse(r)}));}catch(e){}})(" + json + ")", null);
        });
    }

    static JSONObject obj(Object... kv) {
        JSONObject o = new JSONObject();
        try {
            for (int i = 0; i + 1 < kv.length; i += 2) o.put(String.valueOf(kv[i]), kv[i + 1]);
        } catch (Exception ignored) {
            // clé invalide
        }
        return o;
    }

    static JSONObject parse(String s) {
        try {
            return new JSONObject(s == null || s.isEmpty() ? "{}" : s);
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    boolean ok() {
        return a.bridgeAllowed();
    }

    SharedPreferences data() {
        return a.getSharedPreferences("vitrine_data", Context.MODE_PRIVATE);
    }

    // ================================================================== application
    @JavascriptInterface
    public int getAndroidVersion() {
        return Build.VERSION.SDK_INT;
    }

    @JavascriptInterface
    public void hideSplashScreen() {
        a.ui.post(() -> a.hideSplash(true));
    }

    @JavascriptInterface
    public void splashScreenJsTrigger() {
        hideSplashScreen();
    }

    @JavascriptInterface
    public void firstCallWhenAppStarted() {
        SharedPreferences p = a.getSharedPreferences("vitrine", Context.MODE_PRIVATE);
        boolean first = !p.getBoolean("started", false);
        p.edit().putBoolean("started", true).apply();
        cb(obj("type", "firstCallWhenAppStarted", "isFirstLaunch", first));
    }

    @JavascriptInterface
    public void getDeviceInfo() {
        JSONObject o = obj("type", "deviceInfo", "os", "Android", "osVersion", Build.VERSION.RELEASE, "sdk", Build.VERSION.SDK_INT,
            "model", Build.MODEL, "manufacturer", Build.MANUFACTURER, "brand", Build.BRAND, "locale", Locale.getDefault().toLanguageTag(),
            "packageName", a.getPackageName(), "isTablet", a.getResources().getConfiguration().smallestScreenWidthDp >= 600,
            "deviceId", Settings.Secure.getString(a.getContentResolver(), Settings.Secure.ANDROID_ID));
        try {
            PackageInfo pi = a.getPackageManager().getPackageInfo(a.getPackageName(), 0);
            o.put("appVersion", pi.versionName);
            o.put("appVersionCode", Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : versionCode(pi));
        } catch (Exception ignored) {
            // sans version
        }
        cb(o);
    }

    @SuppressWarnings("deprecation")
    private static long versionCode(PackageInfo pi) {
        return pi.versionCode;
    }

    @JavascriptInterface
    public void closeApp() {
        if (ok()) a.ui.post(a::finish);
    }

    @JavascriptInterface
    public void clearWebViewCache(String json) {
        if (!ok()) return;
        JSONObject o = parse(json);
        a.ui.post(() -> {
            a.web.clearCache(true);
            if (!o.optBoolean("cacheOnly", true)) {
                WebStorage.getInstance().deleteAllData();
                CookieManager.getInstance().removeAllCookies(null);
                data().edit().clear().apply();
            }
            if (o.optBoolean("reload", true)) a.web.reload();
        });
    }

    @JavascriptInterface
    public void forceUpdateCookies() {
        CookieManager.getInstance().flush();
    }

    @JavascriptInterface
    public void customBackHandling(String json) {
        customBack = parse(json).optBoolean("enable", false);
    }

    @JavascriptInterface
    public void setOrientation(String json) {
        if (!ok()) return;
        String o = parse(json).optString("orientation", "auto");
        int v = "portrait".equals(o) ? ActivityInfo.SCREEN_ORIENTATION_PORTRAIT : "landscape".equals(o) ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
        a.ui.post(() -> a.setRequestedOrientation(v));
    }

    @JavascriptInterface
    public void pinchToZoom(boolean on) {
        a.ui.post(() -> {
            a.web.getSettings().setSupportZoom(on);
            a.web.getSettings().setBuiltInZoomControls(on);
        });
    }

    @JavascriptInterface
    public void enableSwipeRefresh(boolean on) {
        a.pull.enabled = on;
    }

    @JavascriptInterface
    public void disableScreenshotForPage(boolean on) {
        if (!ok()) return;
        a.ui.post(() -> {
            if (on) a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            else if (!a.cfg.secure) a.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        });
    }

    @JavascriptInterface
    public void keepScreenOn() {
        a.ui.post(() -> a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
    }

    @JavascriptInterface
    public void keepScreenNormal() {
        a.ui.post(() -> a.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
    }

    // ================================================================== barres système, composants
    @JavascriptInterface
    public void statusBar(String json) {
        if (!ok()) return;
        JSONObject o = parse(json);
        a.ui.post(() -> {
            int c = MainActivity.parseCss(o.optString("color", o.optString("backgroundColor")), a.lastTopColor == 0 ? a.cfg.statusColor : a.lastTopColor);
            a.statusBg.setBackgroundColor(c);
            a.lastTopColor = c;
            String style = o.optString("style", o.optString("textColor"));
            boolean dark = style.isEmpty() ? MainActivity.isLight(c) : "dark".equalsIgnoreCase(style) || "black".equalsIgnoreCase(style);
            a.setBarIcons(dark, MainActivity.isLight(a.navColorNow()));
            a.manualStatus = true;
            if (o.has("overlay")) {
                a.cfg.statusMode = o.optBoolean("overlay") ? "overlay" : "color";
                a.root.requestApplyInsets();
            }
        });
    }

    @JavascriptInterface
    public void setNavigationBarColor(String json) {
        if (!ok()) return;
        JSONObject o = parse(json);
        a.ui.post(() -> {
            int c = MainActivity.parseCss(o.optString("color", o.optString("backgroundColor")), a.cfg.navColor);
            a.cfg.navMode = "color";
            a.setNavColor(c);
        });
    }

    @JavascriptInterface
    public void showHideStickyFooter(boolean show) {
        a.ui.post(() -> {
            if (a.tabs != null) a.tabs.setVisibility(show ? View.VISIBLE : View.GONE);
        });
    }

    @JavascriptInterface
    public void hideNativeComponents(String json) {
        components(json, false);
    }

    @JavascriptInterface
    public void showNativeComponents(String json) {
        components(json, true);
    }

    private void components(String json, boolean show) {
        JSONArray list = parse(json).optJSONArray("components");
        a.ui.post(() -> {
            int vis = show ? View.VISIBLE : View.GONE;
            boolean all = list == null || list.length() == 0;
            for (int i = 0; all || i < list.length(); i++) {
                String c = all ? "" : list.optString(i);
                if ((all || c.toLowerCase(Locale.ROOT).contains("bottom") || c.contains("tab")) && a.tabs != null) a.tabs.setVisibility(vis);
                if ((all || c.toLowerCase(Locale.ROOT).contains("float") || c.contains("fab")) && a.extras.fab != null) a.extras.fab.setVisibility(vis);
                if (all) break;
            }
        });
    }

    @JavascriptInterface
    public void getSafeArea() {
        float d = a.getResources().getDisplayMetrics().density;
        cb(obj("type", "getSafeArea", "top", Math.round(a.insetTop / d), "bottom", Math.round(a.insetBottom / d), "left", 0, "right", 0));
    }

    @JavascriptInterface
    public void getComponentStatus(String json) {
        cb(obj("type", "getComponentStatus", "bottomNavigation", a.tabs != null, "floatingButton", a.extras.fab != null, "pullToRefresh", a.pull.enabled));
    }

    @JavascriptInterface
    public void getAddOnStatus(String json) {
        String name = parse(json).optString("addOnName");
        cb(obj("type", "getAddOnStatus", "addOnName", name, "status", true));
    }

    // ================================================================== liens, partage, fichiers
    @JavascriptInterface
    public void openUrlInBrowser(String url) {
        if (ok()) a.ui.post(() -> a.openExternal(Uri.parse(url)));
    }

    @JavascriptInterface
    public void openShareIntent(String url) {
        if (ok()) a.ui.post(() -> a.shareText(url));
    }

    @JavascriptInterface
    public void shareFile(String fileUrl, String ext, String text) {
        if (!ok() || fileUrl == null) return;
        new Thread(() -> {
            try {
                String name = "partage-" + System.currentTimeMillis() + (ext == null || ext.isEmpty() ? "" : (ext.startsWith(".") ? ext : "." + ext));
                File f = new File(FilesProvider.dir(a), name);
                if (fileUrl.startsWith("data:")) {
                    byte[] b = Base64.decode(fileUrl.substring(fileUrl.indexOf(',') + 1), Base64.DEFAULT);
                    try (FileOutputStream out = new FileOutputStream(f)) {
                        out.write(b);
                    }
                } else {
                    HttpURLConnection c = (HttpURLConnection) new URL(fileUrl).openConnection();
                    String ck = CookieManager.getInstance().getCookie(fileUrl);
                    if (ck != null) c.setRequestProperty("Cookie", ck);
                    try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(f)) {
                        byte[] buf = new byte[16384];
                        int n;
                        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    }
                }
                Uri u = FilesProvider.uriFor(a, f);
                a.ui.post(() -> {
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType(a.getContentResolver().getType(u));
                    i.putExtra(Intent.EXTRA_STREAM, u);
                    if (text != null && !text.isEmpty()) i.putExtra(Intent.EXTRA_TEXT, text);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    a.startActivity(Intent.createChooser(i, "Partager"));
                });
            } catch (Exception e) {
                a.toast("Partage du fichier impossible");
            }
        }).start();
    }

    @JavascriptInterface
    public void downloadFile(String json) {
        if (!ok()) return;
        JSONObject o = parse(json);
        String url = o.optString("url", o.optString("downloadUrl"));
        String name = o.optString("fileName", "");
        String mime = o.optString("mimeType", "");
        a.ui.post(() -> a.download(url, a.web.getSettings().getUserAgentString(), name.isEmpty() ? null : "attachment; filename=\"" + name + "\"", mime.isEmpty() ? null : mime));
    }

    @JavascriptInterface
    public void openPDF(String json) {
        if (!ok()) return;
        String url = parse(json).optString("url");
        a.ui.post(() -> {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(Uri.parse(url), "application/pdf");
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                a.startActivity(i);
            } catch (Exception e) {
                a.extras.openBrowser("https://docs.google.com/viewer?embedded=true&url=" + Uri.encode(url));
            }
        });
    }

    @JavascriptInterface
    public void print(String json) {
        if (!ok()) return;
        JSONObject o = parse(json);
        a.ui.post(() -> {
            PrintManager pm = (PrintManager) a.getSystemService(Context.PRINT_SERVICE);
            String job = a.cfg.appName.isEmpty() ? "Document" : a.cfg.appName;
            String url = o.optString("url");
            if (!url.isEmpty() && !url.equals(a.web.getUrl())) {
                android.webkit.WebView w = new android.webkit.WebView(a);
                w.setWebViewClient(new android.webkit.WebViewClient() {
                    @Override
                    public void onPageFinished(android.webkit.WebView v, String u) {
                        pm.print(job, v.createPrintDocumentAdapter(job), new PrintAttributes.Builder().build());
                    }
                });
                w.loadUrl(url);
            } else {
                pm.print(job, a.web.createPrintDocumentAdapter(job), new PrintAttributes.Builder().build());
            }
        });
    }

    @JavascriptInterface
    public void setPrintSize(String json) {
        // Le format est choisi dans la boîte d'impression d'Android.
    }

    // ================================================================== presse-papiers, retour haptique, son
    @JavascriptInterface
    public void getText() {
        if (!ok()) return;
        a.ui.post(() -> {
            ClipboardManager cm = (ClipboardManager) a.getSystemService(Context.CLIPBOARD_SERVICE);
            String t = "";
            if (cm.hasPrimaryClip() && cm.getPrimaryClip() != null && cm.getPrimaryClip().getItemCount() > 0) {
                CharSequence s = cm.getPrimaryClip().getItemAt(0).coerceToText(a);
                t = s == null ? "" : s.toString();
            }
            cb(obj("type", "CLIPBOARD_CONTENT", "data", t));
        });
    }

    @JavascriptInterface
    public void setText(String text) {
        if (!ok()) return;
        a.ui.post(() -> ((ClipboardManager) a.getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("texte", text)));
    }

    @JavascriptInterface
    public void isHapticSupported() {
        cb(obj("type", "isHapticSupported", "value", true, "isSupported", true));
    }

    @JavascriptInterface
    public void haptikEffect(String json) {
        String e = parse(json).optString("effect", "light").toLowerCase(Locale.ROOT);
        a.ui.post(() -> {
            int c;
            switch (e) {
                case "heavy": case "longpress": c = HapticFeedbackConstants.LONG_PRESS; break;
                case "success": c = Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.CONTEXT_CLICK; break;
                case "error": case "warning": c = Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.REJECT : HapticFeedbackConstants.LONG_PRESS; break;
                case "selection": case "tick": c = HapticFeedbackConstants.CLOCK_TICK; break;
                case "medium": c = HapticFeedbackConstants.CONTEXT_CLICK; break;
                default: c = HapticFeedbackConstants.KEYBOARD_TAP; break;
            }
            a.web.performHapticFeedback(c);
        });
    }

    @JavascriptInterface
    public void playSound(String name) {
        a.ui.post(() -> {
            try {
                MediaPlayer mp = null;
                for (String ext : new String[]{".mp3", ".ogg", ".wav", ".m4a"}) {
                    try {
                        android.content.res.AssetFileDescriptor fd = a.getAssets().openFd("vitrine/sounds/" + name + ext);
                        mp = new MediaPlayer();
                        mp.setDataSource(fd.getFileDescriptor(), fd.getStartOffset(), fd.getLength());
                        fd.close();
                        break;
                    } catch (Exception ignored) {
                        mp = null;
                    }
                }
                if (mp == null) {
                    RingtoneManager.getRingtone(a, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)).play();
                    return;
                }
                MediaPlayer p = mp;
                p.setOnCompletionListener(MediaPlayer::release);
                p.prepare();
                p.start();
            } catch (Exception ignored) {
                // son indisponible
            }
        });
    }

    // ================================================================== autorisations
    private String[] map(String name) {
        List<String> one = new ArrayList<>();
        String n = name == null ? "" : name.toLowerCase(Locale.ROOT).replace("\"", "");
        if (n.contains("camera")) one.add("camera");
        else if (n.contains("micro") || n.contains("audio") || n.contains("record")) one.add("microphone");
        else if (n.contains("location") || n.contains("gps")) one.add("location");
        else if (n.contains("contact")) one.add("contacts");
        else if (n.contains("notif") || n.contains("push")) one.add("notifications");
        return MainActivity.runtimePermissions(one);
    }

    @JavascriptInterface
    public void checkPermission(String json) {
        String name = json;
        JSONObject o = parse(json);
        if (o.has("permission")) name = o.optString("permission");
        if (o.has("permissionName")) name = o.optString("permissionName");
        String[] perms = map(name);
        boolean granted = true;
        for (String p : perms) if (a.checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) granted = false;
        cb(obj("type", "checkPermission", "permission", name, "isGranted", granted, "status", granted ? "granted" : "denied"));
    }

    @JavascriptInterface
    public void showPermission(String json) {
        if (!ok()) return;
        JSONObject o = parse(json);
        String name = o.optString("permission", json);
        a.ui.post(() -> a.requestRuntime(map(name), g -> cb(obj("type", "showPermission", "typeValue", "showPermission", "permission", name, "isGranted", g, "status", g ? "granted" : "denied"))));
    }

    @JavascriptInterface
    public void requestPermission(String json) {
        showPermission(json);
    }

    @JavascriptInterface
    public void openAppSettingForPermission(String values) {
        a.ui.post(() -> {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + a.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            a.startActivity(i);
            cb(obj("type", "openAppSettingForPermission"));
        });
    }

    @JavascriptInterface
    public void openAppNotificationPage() {
        a.ui.post(() -> {
            Intent i;
            if (Build.VERSION.SDK_INT >= 26) {
                i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                i.putExtra(Settings.EXTRA_APP_PACKAGE, a.getPackageName());
            } else i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + a.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            a.startActivity(i);
        });
    }

    @JavascriptInterface
    public void registerNotification() {
        a.ui.post(() -> a.requestRuntime(Build.VERSION.SDK_INT >= 33 ? new String[]{Manifest.permission.POST_NOTIFICATIONS} : new String[0], g -> cb(obj("type", "registerNotification", "isGranted", g))));
    }

    @JavascriptInterface
    public void removeAllNotifications() {
        ((NotificationManager) a.getSystemService(Context.NOTIFICATION_SERVICE)).cancelAll();
        cb(obj("type", "removeAllNotifications", "isSuccess", true));
    }

    @JavascriptInterface
    public void isLocationServiceEnabled() {
        LocationManager lm = (LocationManager) a.getSystemService(Context.LOCATION_SERVICE);
        boolean on = Build.VERSION.SDK_INT >= 28 ? lm.isLocationEnabled() : lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        cb(obj("type", "isDeviceGPSEnabled", "value", on, "isEnabled", on));
    }

    // ================================================================== sélecteurs natifs
    @JavascriptInterface
    public void pickDateTime(String json) {
        if (!ok()) return;
        JSONObject o = parse(json);
        boolean date = o.optBoolean("showDate", true);
        boolean time = o.optBoolean("showTime", false);
        a.ui.post(() -> {
            Calendar c = Calendar.getInstance();
            final String[] d = {null};
            Runnable askTime = () -> new TimePickerDialog(a, (v, h, m) -> cb(obj("type", "DATE_TIME_PICKER", "date", d[0], "time", String.format(Locale.ROOT, "%02d:%02d", h, m), "value", (d[0] == null ? "" : d[0] + " ") + String.format(Locale.ROOT, "%02d:%02d", h, m))), c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE), true).show();
            if (date) {
                new DatePickerDialog(a, (v, y, mo, dd) -> {
                    d[0] = String.format(Locale.ROOT, "%04d-%02d-%02d", y, mo + 1, dd);
                    if (time) askTime.run();
                    else cb(obj("type", "DATE_TIME_PICKER", "date", d[0], "value", d[0]));
                }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH)).show();
            } else askTime.run();
        });
    }

    @JavascriptInterface
    public void openVoiceSearch() {
        if (!ok()) return;
        a.ui.post(() -> {
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag());
            try {
                a.startActivityForResult(i, REQ_VOICE);
            } catch (Exception e) {
                cb(obj("type", "VOICE_SEARCH_RESULT", "results", new JSONArray(), "error", "indisponible"));
            }
        });
    }

    void onVoiceResult(int resultCode, Intent data) {
        JSONArray r = new JSONArray();
        if (resultCode == android.app.Activity.RESULT_OK && data != null) {
            ArrayList<String> list = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (list != null) for (String s : list) r.put(s);
        }
        cb(obj("type", "VOICE_SEARCH_RESULT", "results", r, "value", r.length() > 0 ? r.optString(0) : ""));
    }

    @JavascriptInterface
    public void startScanner(String json) {
        if (!ok()) return;
        a.ui.post(() -> a.requestRuntime(new String[]{Manifest.permission.CAMERA}, g -> {
            if (g) a.openScanner();
            else cb(obj("type", "BARCODE_SCAN", "value", "", "error", "camera"));
        }));
    }

    // ================================================================== contacts
    @JavascriptInterface
    public void getPermissionStatus() {
        boolean g = a.checkSelfPermission(Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED;
        cb(obj("type", "contactPermissionStatus", "status", g ? "granted" : "denied"));
    }

    @JavascriptInterface
    public void getAll() {
        if (!ok() || !a.cfg.has("contacts")) {
            cb(obj("type", "contactDetails", "contacts", new JSONArray(), "error", "indisponible"));
            return;
        }
        a.ui.post(() -> a.requestRuntime(new String[]{Manifest.permission.READ_CONTACTS}, g -> {
            if (!g) {
                cb(obj("type", "contactDetails", "contacts", new JSONArray(), "error", "refusé"));
                return;
            }
            new Thread(() -> {
                JSONArray list = new JSONArray();
                try (Cursor c = a.getContentResolver().query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, new String[]{ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER}, null, null, ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC")) {
                    while (c != null && c.moveToNext() && list.length() < 5000) list.put(obj("name", c.getString(0), "phoneNumber", c.getString(1)));
                } catch (Exception ignored) {
                    // liste partielle
                }
                cb(obj("type", "contactDetails", "contacts", list));
            }).start();
        }));
    }

    // ================================================================== données de l'application
    @JavascriptInterface
    public void setAppData(String json) {
        JSONObject o = parse(json);
        data().edit().putString(o.optString("keyName"), o.optString("value")).apply();
        cb(obj("type", "setAppData", "isSuccess", true));
    }

    @JavascriptInterface
    public void getAppData(String key) {
        cb(obj("type", "getAppData", "keyName", key, "value", data().getString(key, null)));
    }

    @JavascriptInterface
    public void deleteAppData(String key) {
        data().edit().remove(key).apply();
        cb(obj("type", "deleteAppData", "isSuccess", true));
    }

    @JavascriptInterface
    public void setCloudData(String json) {
        setAppData(json);
    }

    @JavascriptInterface
    public void getCloudData(String key) {
        getAppData(key);
    }

    @JavascriptInterface
    public void deleteCloudData(String key) {
        deleteAppData(key);
    }

    // ================================================================== biométrie et secret protégé
    @JavascriptInterface
    public void checkBiometricStatus() {
        boolean available = false;
        if (Build.VERSION.SDK_INT >= 29) {
            BiometricManager bm = (BiometricManager) a.getSystemService(Context.BIOMETRIC_SERVICE);
            available = Build.VERSION.SDK_INT >= 30 ? bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) == BiometricManager.BIOMETRIC_SUCCESS : canAuth29(bm);
        } else if (Build.VERSION.SDK_INT >= 28) available = a.getPackageManager().hasSystemFeature(PackageManager.FEATURE_FINGERPRINT);
        cb(obj("type", "checkBiometricStatus", "isAvailable", available, "hasSecret", data().contains("__secret")));
    }

    @SuppressWarnings("deprecation")
    private static boolean canAuth29(BiometricManager bm) {
        return bm.canAuthenticate() == BiometricManager.BIOMETRIC_SUCCESS;
    }

    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (!ks.containsAlias("vitrine_secret")) {
            KeyGenerator kg = KeyGenerator.getInstance("AES", "AndroidKeyStore");
            kg.init(new android.security.keystore.KeyGenParameterSpec.Builder("vitrine_secret", android.security.keystore.KeyProperties.PURPOSE_ENCRYPT | android.security.keystore.KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE).build());
            return kg.generateKey();
        }
        return (SecretKey) ks.getKey("vitrine_secret", null);
    }

    @JavascriptInterface
    public void saveSecret(String secret) {
        if (!ok()) return;
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key());
            byte[] enc = c.doFinal(secret.getBytes(StandardCharsets.UTF_8));
            data().edit().putString("__secret", Base64.encodeToString(c.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(enc, Base64.NO_WRAP)).apply();
            cb(obj("type", "saveBiometricSecret", "isSuccess", true));
        } catch (Exception e) {
            cb(obj("type", "saveBiometricSecret", "isSuccess", false, "error", String.valueOf(e.getMessage())));
        }
    }

    @JavascriptInterface
    public void deleteSecret() {
        data().edit().remove("__secret").apply();
        cb(obj("type", "deleteBiometricSecret", "isSuccess", true));
    }

    String readSecret() {
        try {
            String s = data().getString("__secret", null);
            if (s == null) return null;
            String[] p = s.split(":");
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(p[0], Base64.NO_WRAP)));
            return new String(c.doFinal(Base64.decode(p[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    @JavascriptInterface
    public void callBiometric(String prompt) {
        if (!ok()) return;
        a.ui.post(() -> a.biometric(prompt, success -> cb(obj("type", "showBiometric", "isSuccess", success, "secret", success ? readSecret() : null))));
    }

    @JavascriptInterface
    public void biometricAuthWithDismissOnCancel(String json) {
        JSONObject o = parse(json);
        if (!ok()) return;
        a.ui.post(() -> a.biometric(o.optString("prompt", "Confirmez votre identité"), success -> {
            cb(obj("type", "biometricAuthWithDismissOnCancel", "isSuccess", success, "secret", success ? readSecret() : null));
            if (!success && !o.optBoolean("isAuthenticationOptional", false)) a.finish();
        }));
    }

    // ================================================================== code de verrouillage
    @JavascriptInterface
    public void setPasscode(String code) {
        if (ok()) a.extras.setPasscode(code);
    }

    @JavascriptInterface
    public void resetPasscode() {
        if (ok()) a.extras.resetPasscode();
    }

    // ================================================================== NFC
    @JavascriptInterface
    public void nfcSupported() {
        NfcAdapter n = NfcAdapter.getDefaultAdapter(a);
        cb(obj("type", "nfcSupported", "isSupported", n != null, "isEnabled", n != null && n.isEnabled()));
    }

    @JavascriptInterface
    public void nfcGetStatus() {
        NfcAdapter n = NfcAdapter.getDefaultAdapter(a);
        cb(obj("type", "nfcGetStatus", "isSupported", n != null, "isEnabled", n != null && n.isEnabled()));
    }

    @JavascriptInterface
    public void nfcScanTag(String json) {
        nfc(null);
    }

    @JavascriptInterface
    public void nfcWriteTag(String json) {
        nfc(parse(json));
    }

    private void nfc(JSONObject write) {
        if (!ok() || !a.cfg.has("nfc")) return;
        NfcAdapter n = NfcAdapter.getDefaultAdapter(a);
        if (n == null) {
            cb(obj("type", write == null ? "nfcScanTag" : "nfcWriteTag", "isSuccess", false, "error", "NFC absent"));
            return;
        }
        a.toast(write == null ? "Approche une étiquette NFC" : "Approche l'étiquette NFC à écrire");
        int flags = NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B | NfcAdapter.FLAG_READER_NFC_F | NfcAdapter.FLAG_READER_NFC_V;
        n.enableReaderMode(a, (Tag tag) -> {
            JSONObject res = obj("type", write == null ? "nfcScanTag" : "nfcWriteTag", "id", bytesHex(tag.getId()));
            try {
                Ndef ndef = Ndef.get(tag);
                if (write != null) {
                    JSONArray recs = write.optJSONArray("records");
                    List<NdefRecord> list = new ArrayList<>();
                    for (int i = 0; recs != null && i < recs.length(); i++) {
                        JSONObject r = recs.optJSONObject(i);
                        if (r == null) continue;
                        list.add("uri".equals(r.optString("type")) || "url".equals(r.optString("type")) ? NdefRecord.createUri(r.optString("value")) : NdefRecord.createTextRecord("fr", r.optString("value")));
                    }
                    if (list.isEmpty() && write.has("text")) list.add(NdefRecord.createTextRecord("fr", write.optString("text")));
                    if (ndef == null) throw new IllegalStateException("étiquette non NDEF");
                    ndef.connect();
                    ndef.writeNdefMessage(new NdefMessage(list.toArray(new NdefRecord[0])));
                    ndef.close();
                    res.put("isSuccess", true);
                } else {
                    JSONArray out = new JSONArray();
                    NdefMessage msg = ndef != null ? ndef.getCachedNdefMessage() : null;
                    if (msg != null) {
                        for (NdefRecord r : msg.getRecords()) {
                            Uri u = r.toUri();
                            out.put(u != null ? obj("type", "uri", "value", u.toString()) : obj("type", "text", "value", textOf(r)));
                        }
                    }
                    res.put("records", out);
                    res.put("isSuccess", true);
                }
            } catch (Exception e) {
                try {
                    res.put("isSuccess", false);
                    res.put("error", String.valueOf(e.getMessage()));
                } catch (Exception ignored) {
                    // ignore
                }
            }
            cb(res);
            a.ui.post(() -> n.disableReaderMode(a));
        }, flags, null);
    }

    private static String textOf(NdefRecord r) {
        byte[] p = r.getPayload();
        if (p == null || p.length == 0) return "";
        int lang = p[0] & 0x3f;
        return new String(p, 1 + lang, p.length - 1 - lang, StandardCharsets.UTF_8);
    }

    private static String bytesHex(byte[] b) {
        StringBuilder s = new StringBuilder();
        if (b != null) for (byte x : b) s.append(String.format("%02X", x));
        return s.toString();
    }
}
