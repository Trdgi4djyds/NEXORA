package app.vitrine.shell;

import android.content.SharedPreferences;
import android.util.Base64;

import androidx.browser.trusted.Token;
import androidx.browser.trusted.TokenStore;
import androidx.browser.trusted.TrustedWebActivityService;

/**
 * Délégation des notifications (Trusted Web Activity) : les notifications push du site sont affichées au nom
 * de l'application, sans demande d'autorisation du navigateur. Le jeton identifie le navigateur autorisé.
 */
public class TwaService extends TrustedWebActivityService {
    @Override
    public TokenStore getTokenStore() {
        final SharedPreferences p = getSharedPreferences("vitrine_twa", MODE_PRIVATE);
        return new TokenStore() {
            @Override
            public void store(Token token) {
                if (token == null) { p.edit().remove("token").apply(); return; }
                p.edit().putString("token", Base64.encodeToString(token.serialize(), Base64.NO_WRAP)).apply();
            }

            @Override
            public Token load() {
                String s = p.getString("token", null);
                if (s == null) return null;
                try { return Token.deserialize(Base64.decode(s, Base64.NO_WRAP)); } catch (Throwable t) { return null; }
            }
        };
    }
}
