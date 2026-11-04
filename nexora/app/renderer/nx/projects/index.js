// NEXORA #016 : isolation des projets et outils indispensables aux projets importés.
// Chargé par nx/boot.js dès le démarrage (ces fonctions concernent tous les espaces).
import { installIsolation } from './isolation.js';
import { installTools } from './tools.js';

export function install() {
  installIsolation();
  installTools();
}
