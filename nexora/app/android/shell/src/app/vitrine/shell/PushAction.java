package app.vitrine.shell;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * NEXORA #073 : boutons des notifications (Répondre, Marquer comme lu, Refuser un appel) et notification balayée.
 * Fonctionne application fermée : l'action part vers l'adresse des actions du site, hors du fil principal.
 */
public class PushAction extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        final PendingResult pending = goAsync();
        final Context app = ctx.getApplicationContext();
        new Thread(() -> {
            try {
                Push.action(app, intent);
            } catch (Throwable ignored) {
                // action perdue : la page relira l'état auprès du serveur
            } finally {
                pending.finish();
            }
        }).start();
    }
}
