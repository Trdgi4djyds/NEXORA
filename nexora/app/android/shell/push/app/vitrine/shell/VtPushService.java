package app.vitrine.shell;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONObject;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

/**
 * Réception des notifications push (Firebase Cloud Messaging) pour les applications créées avec Vitrine.
 * Application fermée ou en arrière-plan : Firebase affiche lui-même les notifications « notification ».
 * Application ouverte, ou message « data » avec un titre : ce service affiche la notification et prévient la page.
 * Compilé par Vitrine au moment de préparer le kit de notifications (il dépend de Firebase Messaging).
 */
public class VtPushService extends FirebaseMessagingService {
    static final String CHANNEL = "vt_default";

    @Override
    public void onNewToken(String token) {
        getSharedPreferences("vt_push", MODE_PRIVATE).edit().putString("token", token).apply();
        call("onToken", token);
    }

    @Override
    public void onMessageReceived(RemoteMessage m) {
        Map<String, String> data = m.getData();
        // Message destiné à une autre application (champ « vt_app ») : ignoré.
        String target = data.get("vt_app");
        if (target != null && !target.isEmpty() && !target.equals(getPackageName())) return;
        // Sujet d'une autre application : ignoré aussi (garde-fou si un ancien abonnement subsiste).
        String from = m.getFrom();
        if (from != null && from.startsWith("/topics/") && from.contains("__") && !from.startsWith("/topics/" + getPackageName().replace('.', '_') + "__")) return;
        RemoteMessage.Notification n = m.getNotification();
        String title = n != null && n.getTitle() != null ? n.getTitle() : data.get("title");
        String body = n != null && n.getBody() != null ? n.getBody() : data.get("body");
        String url = data.containsKey("url") ? data.get("url") : data.get("link");
        String image = n != null && n.getImageUrl() != null ? n.getImageUrl().toString() : data.get("image");
        JSONObject o = new JSONObject();
        try {
            o.put("title", title == null ? "" : title);
            o.put("body", body == null ? "" : body);
            if (url != null) o.put("url", url);
            if (image != null) o.put("image", image);
            o.put("data", new JSONObject(data));
            o.put("from", m.getFrom() == null ? "" : m.getFrom());
        } catch (Exception ignored) {
            // contenu partiel
        }
        boolean shown = Boolean.TRUE.equals(call("onMessage", o.toString()));
        if (title != null && !title.isEmpty() && !"false".equals(data.get("vt_show"))) show(title, body, url, image);
        if (!shown) getSharedPreferences("vt_push", MODE_PRIVATE).edit().putString("last", o.toString()).apply();
    }

    private Object call(String method, String arg) {
        try {
            return Class.forName("app.vitrine.shell.Push").getMethod(method, Context.class, String.class).invoke(null, getApplicationContext(), arg);
        } catch (Throwable t) {
            return null;
        }
    }

    @SuppressWarnings("deprecation")
    private void show(String title, String body, String url, String image) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
                nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Notifications", NotificationManager.IMPORTANCE_HIGH));
            }
            Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (open == null) open = new Intent(Intent.ACTION_VIEW);
            if (url != null && !url.isEmpty()) open.putExtra("vitrine_url", url);
            open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(this, (int) (System.currentTimeMillis() & 0xffff), open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
            int icon = getResources().getIdentifier("vt_notification", "drawable", getPackageName());
            int color = getResources().getIdentifier("vt_push_color", "color", getPackageName());
            b.setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(body == null ? "" : body)
                .setAutoCancel(true)
                .setContentIntent(pi);
            if (color != 0) b.setColor(getResources().getColor(color));
            Bitmap pic = image != null && image.startsWith("https://") ? fetch(image) : null;
            if (pic != null) b.setLargeIcon(pic).setStyle(new Notification.BigPictureStyle().bigPicture(pic).setSummaryText(body == null ? "" : body));
            else b.setStyle(new Notification.BigTextStyle().bigText(body == null ? "" : body));
            if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH);
            nm.notify((int) (System.currentTimeMillis() & 0x7fffffff), b.build());
        } catch (Exception ignored) {
            // notification impossible
        }
    }

    private static Bitmap fetch(String u) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
            c.setConnectTimeout(6000);
            c.setReadTimeout(8000);
            try (InputStream in = c.getInputStream()) { return BitmapFactory.decodeStream(in); }
        } catch (Exception e) {
            return null;
        }
    }
}
