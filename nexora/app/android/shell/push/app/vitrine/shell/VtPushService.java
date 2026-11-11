package app.vitrine.shell;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONObject;

/**
 * Réception des notifications push (Firebase Cloud Messaging) des applications créées avec NEXORA.
 * Application fermée ou en arrière-plan, un message « notification » est affiché par Firebase lui-même ;
 * un message « data » (conseillé pour une messagerie) passe toujours par ici.
 * NEXORA #073 : ce service ne fait que transmettre. L'affichage (catégories, conversations, appels, réponses),
 * le relais vers la page et la file d'attente sont dans Push, le code de l'application qui ne dépend pas de
 * Firebase. Compilé par NEXORA au moment de préparer le kit de notifications (il dépend de Firebase Messaging).
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
        JSONObject o = new JSONObject();
        try {
            o.put("id", m.getMessageId() == null ? "" : m.getMessageId());
            o.put("from", m.getFrom() == null ? "" : m.getFrom());
            o.put("sentTime", m.getSentTime());
            o.put("priority", m.getPriority());
            o.put("data", new JSONObject(m.getData()));
            RemoteMessage.Notification n = m.getNotification();
            if (n != null) {
                JSONObject j = new JSONObject();
                j.put("title", n.getTitle() == null ? "" : n.getTitle());
                j.put("body", n.getBody() == null ? "" : n.getBody());
                if (n.getImageUrl() != null) j.put("image", n.getImageUrl().toString());
                if (n.getTag() != null) j.put("tag", n.getTag());
                if (n.getChannelId() != null) j.put("channel", n.getChannelId());
                o.put("notification", j);
            }
        } catch (Exception ignored) {
            // contenu partiel
        }
        if (call("receive", o.toString()) == null) fallback(m);
    }

    @Override
    public void onDeletedMessages() {
        call("deleted", "");
    }

    private Object call(String method, String arg) {
        try {
            return Class.forName("app.vitrine.shell.Push").getMethod(method, Context.class, String.class).invoke(null, getApplicationContext(), arg);
        } catch (Throwable t) {
            return null;
        }
    }

    // Secours (code de l'application illisible) : titre et texte, comme avant NEXORA #073.
    @SuppressWarnings("deprecation")
    private void fallback(RemoteMessage m) {
        try {
            RemoteMessage.Notification n = m.getNotification();
            String title = n != null && n.getTitle() != null ? n.getTitle() : m.getData().get("title");
            String body = n != null && n.getBody() != null ? n.getBody() : m.getData().get("body");
            if (title == null || title.isEmpty() || "false".equals(m.getData().get("vt_show"))) return;
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
                nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Notifications", NotificationManager.IMPORTANCE_HIGH));
            }
            Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (open == null) open = new Intent(Intent.ACTION_VIEW);
            String url = m.getData().get("url");
            if (url != null && !url.isEmpty()) open.putExtra("vitrine_url", url);
            open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(this, (int) (System.currentTimeMillis() & 0xffff), open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
            int icon = getResources().getIdentifier("vt_notification", "drawable", getPackageName());
            b.setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(body == null ? "" : body)
                .setAutoCancel(true)
                .setContentIntent(pi);
            nm.notify((int) (System.currentTimeMillis() & 0x7fffffff), b.build());
        } catch (Exception ignored) {
            // notification impossible
        }
    }
}
