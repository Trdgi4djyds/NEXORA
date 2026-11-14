// NEXORA #120 : Code Editor prêt à l'avance. Si le Dev Lab était en mode « Code Editor » à la fermeture de NEXORA,
// son serveur démarre en arrière-plan dès que NEXORA est inactif (processus principal : dev:vscode-warm), sans
// attendre l'ouverture du Dev Lab ; rien si l'outil n'a jamais été installé ou ses conditions pas acceptées.
import { api, settings } from '../core.js';

export function install() {
  const dl = settings.devLab;
  if (!dl || dl.mode !== 'vscode' || !dl.root) return;
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 3000));
  idle(() => { api.invoke('dev:vscode-warm').catch(() => {}); }, { timeout: 8000 });
}
