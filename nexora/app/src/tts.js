'use strict';
/* Voix-off : synthèse vocale gratuite et hors ligne avec les voix installées dans Windows
 * (français : Hortense, Julie, Paul… selon le PC). Le texte est transmis par fichier, jamais par la ligne de commande. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const ps = (script) => new Promise((resolve, reject) => {
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true, maxBuffer: 16e6, timeout: 120000 }, (err, stdout, stderr) => {
    if (err) reject(new Error((stderr || err.message || '').toString().trim().split('\n').slice(-1)[0] || 'Synthèse vocale impossible.')); else resolve(stdout.toString());
  });
});

function register({ ipcMain }) {
  ipcMain.handle('tts:voices', async () => {
    if (process.platform !== 'win32') return { ok: false, voices: [], error: 'La voix-off utilise les voix de Windows.' };
    const out = await ps("Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name + '|' + $_.VoiceInfo.Culture.Name + '|' + $_.VoiceInfo.Gender }");
    const voices = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [name, lang, gender] = l.split('|'); return { name, lang, gender }; });
    return { ok: true, voices };
  });
  ipcMain.handle('tts:speak', async (_e, { text, voice, rate = 0 }) => {
    if (process.platform !== 'win32') throw new Error('La voix-off utilise les voix de Windows : disponible sur un PC Windows.');
    const clean = String(text || '').trim();
    if (!clean) throw new Error('Écris d’abord le texte de la voix-off.');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexora-voix-'));
    const txt = path.join(dir, 'texte.txt'); const wav = path.join(dir, 'voix.wav');
    fs.writeFileSync(txt, clean, 'utf8');
    const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
    try {
      await ps(`Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ${voice ? `try { $s.SelectVoice(${q(voice)}) } catch {}` : ''} $s.Rate = ${Math.max(-10, Math.min(10, Math.round(Number(rate) || 0)))}; $s.SetOutputToWaveFile(${q(wav)}); $s.Speak([IO.File]::ReadAllText(${q(txt)}, [Text.Encoding]::UTF8)); $s.Dispose()`);
      const data = fs.readFileSync(wav);
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
}

module.exports = { register };
