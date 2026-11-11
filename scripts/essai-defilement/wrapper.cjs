// NEXORA #114, banc d'essai de webview-preload.js : les messages destinés à l'hôte (<webview>) sont renvoyés au
// processus principal du banc, puis le vrai script est chargé tel quel.
const { ipcRenderer } = require("electron")
ipcRenderer.sendToHost = (ch, d) => ipcRenderer.send("test-host", ch, d)
require(process.env.PRELOAD)
