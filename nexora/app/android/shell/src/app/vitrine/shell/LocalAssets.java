package app.vitrine.shell;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceResponse;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Application web intégrée (mode « projet ») : les fichiers de assets/www sont servis à l'adresse
 * https://appassets.androidplatform.net/ (domaine réservé à cet usage par Android). Les routes des
 * applications monopages (React, Vue, Angular…) renvoient index.html.
 */
final class LocalAssets {
    static final String HOST = "appassets.androidplatform.net";
    private static final Map<String, String> MIME = new HashMap<>();

    static {
        String[][] m = {
            {"html", "text/html"}, {"htm", "text/html"}, {"js", "text/javascript"}, {"mjs", "text/javascript"}, {"css", "text/css"},
            {"json", "application/json"}, {"map", "application/json"}, {"webmanifest", "application/manifest+json"}, {"svg", "image/svg+xml"},
            {"png", "image/png"}, {"jpg", "image/jpeg"}, {"jpeg", "image/jpeg"}, {"gif", "image/gif"}, {"webp", "image/webp"}, {"avif", "image/avif"},
            {"ico", "image/x-icon"}, {"woff", "font/woff"}, {"woff2", "font/woff2"}, {"ttf", "font/ttf"}, {"otf", "font/otf"},
            {"mp4", "video/mp4"}, {"webm", "video/webm"}, {"mp3", "audio/mpeg"}, {"wav", "audio/wav"}, {"ogg", "audio/ogg"},
            {"wasm", "application/wasm"}, {"txt", "text/plain"}, {"xml", "application/xml"}, {"pdf", "application/pdf"},
        };
        for (String[] e : m) MIME.put(e[0], e[1]);
    }

    private final AssetManager assets;

    LocalAssets(AssetManager assets) {
        this.assets = assets;
    }

    WebResourceResponse serve(Uri uri) {
        if (uri == null || !HOST.equalsIgnoreCase(uri.getHost())) return null;
        String path = uri.getPath() == null ? "/" : uri.getPath();
        if (path.contains("..")) return notFound();
        if (path.endsWith("/")) path = path + "index.html";
        String rel = "www" + path;
        InputStream in = open(rel);
        String ext = ext(path);
        if (in == null && ext.isEmpty()) {
            in = open("www" + path + "/index.html");
            if (in == null) in = open("www" + path + ".html");
            if (in == null) in = open("www/index.html");
            ext = "html";
        }
        if (in == null) return notFound();
        String mime = MIME.get(ext);
        if (mime == null) mime = "application/octet-stream";
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cache-Control", "html".equals(ext) ? "no-cache" : "max-age=31536000");
        String enc = mime.startsWith("text/") || mime.endsWith("json") || mime.endsWith("javascript") || mime.endsWith("xml") ? "utf-8" : null;
        return new WebResourceResponse(mime, enc, 200, "OK", headers, in);
    }

    private InputStream open(String path) {
        try {
            return assets.open(path, AssetManager.ACCESS_STREAMING);
        } catch (IOException e) {
            return null;
        }
    }

    private static String ext(String path) {
        int slash = path.lastIndexOf('/');
        int dot = path.lastIndexOf('.');
        return dot > slash ? path.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<>(), null);
    }
}
