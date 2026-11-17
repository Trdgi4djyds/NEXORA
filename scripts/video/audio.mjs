// NEXORA #129 : bande son de la vidéo de présentation (scripts/video/presentation.html), entièrement fabriquée ici :
//   - voix off : phrases de VOICE (timeline.mjs) lues par Kokoro avec la voix française ff_siwis (base SIWIS, licence
//     CC BY 4.0) puis retouchées par Praat (#130, voir plus bas), enregistrées une fois dans scripts/video/voix/<id>.opus
//     (--nouvelle-voix pour les refaire) ; un fichier du même nom, enregistré au micro, remplace la voix de synthèse ;
//   - musique : nappes, basse, batterie et arpège synthétisés note par note (aucun échantillon ni morceau existant,
//     donc aucun droit à céder), 100 battements par minute, calée sur les scènes ;
//   - effets sonores : souffles, impacts, montées, clics, petits « pops », synthétisés aux instants des animations.
// Mixage : chaque piste est mesurée (sonie EBU R128) et ramenée à sa cible, la musique baisse sous la voix, puis
// l'ensemble est normalisé à -16 LUFS (crête -1,5 dBTP) par ffmpeg. Rendu identique à chaque passage (bruit pseudo-
// aléatoire à graine fixe).
import { spawnSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { BAR, BEAT, DURATION, SC, SHOW, VOICE, word } from "./timeline.mjs"

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const VOICE_DIR = path.join(HERE, "voix")
const SR = 48000
const N = Math.ceil(DURATION * SR)

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { maxBuffer: 1 << 30, ...opts })
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(" ")}… : ${String(r.stderr || "").slice(-800)}`)
  return r.stdout
}
const sha256 = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex")
async function download(url, file) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`téléchargement refusé (${r.status}) : ${url}`)
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()))
}

// ---------------------------------------------------------------- voix (Kokoro et Praat, hors du dépôt)
// #130 : voix plus vive et sans blanc, d'après la voix de référence de l'utilisateur (voix féminine de publicité :
// hauteur médiane 258 Hz, mélodie ample, peu de pauses). Kokoro 82M (Apache 2.0, voix française ff_siwis tirée de la
// base SIWIS, CC BY 4.0) lit le texte avec des pauses de phrase et de proposition minimales ; Praat (PSOLA, timbre
// gardé) amène la hauteur médiane à VOICE_STYLE.f0 et élargit la mélodie (écarts à la médiane portés à la puissance
// VOICE_STYLE.k) ; les silences d'au moins 80 ms sont vidés (aucun souffle), ceux de plus de 110 ms ramenés à 70 ms,
// les bords coupés net.
const TOOLS = process.env.NEXORA_VOIX_DIR || path.join(os.tmpdir(), "nexora-voix")
const KOKORO_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
const KOKORO_FILES = {
  "kokoro-v1.0.onnx": "7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5",
  "voices-v1.0.bin": "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
}
export const VOICE_STYLE = { voice: "ff_siwis", speed: 1.08, f0: 245, k: 1.35, sentencePause: 0.06, clausePause: 0.03 }
const VOICE_PY = String.raw`
import sys, json, re, wave, numpy as np
from kokoro_onnx import Kokoro
import parselmouth
from parselmouth.praat import call
cfg = json.load(sys.stdin)
st = cfg["style"]
k = Kokoro(cfg["model"], cfg["voices"])
def phon(text):
    # Texte français phonétisé par espeak ; les passages [[…]] sont déjà en phonèmes (noms anglais).
    out = []
    for part in re.split(r"(\[\[.*?\]\])", text):
        if not part.strip(): continue
        out.append(part[2:-2].strip() if part.startswith("[[") else re.sub(r"\((en|fr)\)", "", k.tokenizer.phonemize(part, "fr-fr")))
    return " ".join(out)
def melody(y, sr):
    snd = parselmouth.Sound(y.astype(np.float64), sampling_frequency=sr)
    med = call(call(snd, "To Pitch", 0.01, 75, 500), "Get quantile", 0, 0, 0.5, "Hertz")
    man = call(snd, "To Manipulation", 0.01, 75, 500)
    tier = call(man, "Extract pitch tier")
    call(tier, "Formula", "%f * (self / %f) ^ %f" % (st["f0"], med, st["k"]))
    call([tier, man], "Replace pitch tier")
    return call(man, "Get resynthesis (overlap-add)").values[0].astype(np.float32)
def tighten(y, sr):
    hop = int(sr * 0.01)
    db = np.array([10 * np.log10(np.mean(y[i:i + hop] ** 2) + 1e-12) for i in range(0, len(y) - hop, hop)])
    # Seuls les vrais silences (au moins 80 ms sous -45 dB du niveau de la parole) sont vidés ou raccourcis : les
    # consonnes faibles (f, s, occlusives), plus courtes, restent intactes.
    quiet = db < np.percentile(db, 95) - 45
    env = np.ones(len(y), np.float32); keep = np.ones(len(y), bool)
    i = 0
    while i < len(quiet):
        if not quiet[i]: i += 1; continue
        j = i
        while j < len(quiet) and quiet[j]: j += 1
        a, b = i * hop, j * hop
        if (b - a) / sr >= 0.08: env[a:b] = 0
        if (b - a) / sr > 0.11: keep[a + int(0.035 * sr):b - int(0.035 * sr)] = False
        i = j
    f = int(0.008 * sr)
    env = np.convolve(env, np.ones(f) / f, mode="same").astype(np.float32)
    sp = np.where(~quiet)[0]
    lo, hi = max(0, sp[0] * hop - int(0.01 * sr)), min(len(y), (sp[-1] + 1) * hop + int(0.03 * sr))
    keep[:lo] = False; keep[hi:] = False
    return (y * env)[keep]
for it in cfg["items"]:
    x, sr = k.create(phon(it["dit"]), voice=st["voice"], speed=st["speed"], lang="fr-fr", is_phonemes=True,
                     sentence_pause=st["sentencePause"], clause_pause=st["clausePause"])
    y = tighten(melody(np.asarray(x, np.float32), sr), sr)
    y = y / max(1e-6, float(np.max(np.abs(y)))) * 0.89
    with wave.open(it["out"], "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((y * 32767).astype(np.int16).tobytes())
`
/** Installe Kokoro (kokoro-onnx 0.6.1) et Praat (praat-parselmouth 0.4.7) dans un dossier temporaire, modèles vérifiés. */
async function ensureVoiceTools() {
  fs.mkdirSync(TOOLS, { recursive: true })
  const py = path.join(TOOLS, "py")
  if (!fs.existsSync(path.join(py, "kokoro_onnx", "__init__.py")) || !fs.existsSync(path.join(py, "praat_parselmouth-0.4.7.dist-info"))) {
    const pip = path.join(TOOLS, "pip")
    if (!fs.existsSync(path.join(pip, "pip"))) {
      await download("https://bootstrap.pypa.io/get-pip.py", path.join(TOOLS, "get-pip.py"))
      run("python3", [path.join(TOOLS, "get-pip.py"), "--target", pip, "-q"])
    }
    console.log("Installation de Kokoro et de Praat…")
    run("python3", ["-m", "pip", "install", "-q", "--target", py, "kokoro-onnx==0.6.1", "praat-parselmouth==0.4.7"], { env: { ...process.env, PYTHONPATH: pip } })
  }
  for (const [name, sum] of Object.entries(KOKORO_FILES)) {
    const f = path.join(TOOLS, name)
    if (fs.existsSync(f) && sha256(f) === sum) continue
    console.log(`Téléchargement du modèle de voix : ${name}`)
    await download(KOKORO_URL + name, f)
    if (sha256(f) !== sum) throw new Error(`empreinte inattendue pour ${name}`)
  }
  return { py, model: path.join(TOOLS, "kokoro-v1.0.onnx"), voices: path.join(TOOLS, "voices-v1.0.bin") }
}
/** Refait les fichiers de voix (tous, ou ceux qui manquent) : synthèse, mélodie, pauses resserrées, Opus. */
export async function makeVoice({ all = false } = {}) {
  fs.mkdirSync(VOICE_DIR, { recursive: true })
  const todo = VOICE.filter((v) => all || !fs.existsSync(path.join(VOICE_DIR, `${v.id}.opus`)))
  if (!todo.length) return
  const { py, model, voices } = await ensureVoiceTools()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-voix-"))
  const items = todo.map((v) => ({ dit: v.dit, out: path.join(tmp, `${v.id}.wav`) }))
  run("python3", ["-c", VOICE_PY], { input: JSON.stringify({ model, voices, style: VOICE_STYLE, items }), env: { ...process.env, PYTHONPATH: py } })
  for (const [k, v] of todo.entries()) {
    run("ffmpeg", ["-y", "-loglevel", "error", "-i", items[k].out, "-af", "aresample=48000", "-ac", "1", "-c:a", "libopus", "-b:a", "64k", path.join(VOICE_DIR, `${v.id}.opus`)])
    console.log(`  voix : ${v.id}.opus`)
  }
  fs.rmSync(tmp, { recursive: true, force: true })
}
/** Fichier audio décodé en 48 kHz mono flottant, avec une chaîne de filtres ffmpeg. */
function decode(file, filters = "anull") {
  const buf = run("ffmpeg", ["-loglevel", "error", "-i", file, "-af", filters, "-f", "f32le", "-ac", "1", "-ar", String(SR), "-"])
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).slice()
}

// ---------------------------------------------------------------- outils de synthèse
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12)
const TAU = Math.PI * 2
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const R = rng(129)
const noise = () => R() * 2 - 1
const bus = () => ({ L: new Float32Array(N), R: new Float32Array(N) })
const panL = (p) => Math.cos(((clamp(p, -1, 1) + 1) * Math.PI) / 4)
const panR = (p) => Math.sin(((clamp(p, -1, 1) + 1) * Math.PI) / 4)
function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1 }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1 }
  return 0
}
class Biquad {
  constructor(type = "lp", f = 1000, q = 0.707, g = 0) { this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(type, f, q, g) }
  set(type, f, q = 0.707, g = 0) {
    const w = (TAU * clamp(f, 20, SR * 0.45)) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q)
    let b0, b1, b2, a0 = 1 + al, a2 = 1 - al
    if (type === "lp") { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0 }
    else if (type === "hp") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0 }
    else if (type === "peak") { const A = Math.pow(10, g / 40); b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a2 = 1 - al / A } // cloche de ±g dB
    else { b0 = al; b1 = 0; b2 = -al } // passe-bande, 0 dB au centre
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * c) / a0; this.a2 = a2 / a0
    return this
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y
    return y
  }
}
/** Parcourt les échantillons de [t0, t0 + len] ; fn(u) renvoie la valeur mono à l'instant u (secondes depuis t0). */
function play(b, t0, len, fn, { gain = 1, pan = 0, panAt, send = 0, rev } = {}) {
  const i0 = Math.max(0, Math.round(t0 * SR)), i1 = Math.min(N, Math.round((t0 + len) * SR))
  let gl = panL(pan) * gain, gr = panR(pan) * gain
  for (let i = i0; i < i1; i += 1) {
    const u = (i - Math.round(t0 * SR)) / SR
    if (panAt && (i - i0) % 256 === 0) { const p = panAt(u); gl = panL(p) * gain; gr = panR(p) * gain }
    const v = fn(u)
    b.L[i] += v * gl; b.R[i] += v * gr
    if (send) { rev.L[i] += v * gl * send; rev.R[i] += v * gr * send }
  }
}
/** Réverbération de type Freeverb (8 filtres en peigne, 4 passe-tout par canal). */
function reverb(inp, { room = 0.86, damp = 0.3 } = {}) {
  const out = bus()
  const k = SR / 44100
  for (const [ch, spread] of [["L", 0], ["R", 23]]) {
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((n) => ({ buf: new Float32Array(Math.round((n + spread) * k)), i: 0, st: 0 }))
    const aps = [556, 441, 341, 225].map((n) => ({ buf: new Float32Array(Math.round((n + spread) * k)), i: 0 }))
    const dst = out[ch]
    for (let n = 0; n < N; n += 1) {
      const x = (inp.L[n] + inp.R[n]) * 0.015
      let s = 0
      for (const c of combs) {
        const y = c.buf[c.i]
        c.st = y * (1 - damp) + c.st * damp
        c.buf[c.i] = x + c.st * room
        if (++c.i >= c.buf.length) c.i = 0
        s += y
      }
      for (const a of aps) {
        const y = a.buf[a.i]
        a.buf[a.i] = s + y * 0.5
        if (++a.i >= a.buf.length) a.i = 0
        s = y - s
      }
      dst[n] = s * 3
    }
  }
  return out
}

// ---------------------------------------------------------------- instruments
const CHORDS = {
  A: { bass: 33, pad: [57, 60, 64, 67, 71] }, // la mineur 9
  F: { bass: 29, pad: [53, 57, 60, 64, 67] }, // fa majeur 9
  C: { bass: 36, pad: [55, 60, 62, 64, 71] }, // do majeur 9
  G: { bass: 31, pad: [55, 59, 62, 64, 69] }, // sol 6/9
}
/** Accords : [début, accord] ; le dernier dure jusqu'à la fin. */
const PROG = [[0, "A"], [SC.probleme, "F"], [11.4, "G"], [SC.espaces, "A"], [19.8, "F"], [24.6, "C"], [29.4, "G"], [34.2, "A"],
  [39.0, "F"], [43.8, "C"], [48.6, "G"], [SC.appareils, "A"], [58.2, "F"], [63.0, "G"], [SC.fin, "F"], [72.6, "C"]]
const chordAt = (t) => { let c = PROG[0][1]; for (const [s, n] of PROG) if (t >= s) c = n; return CHORDS[c] }
const inRange = (t, ranges) => ranges.some(([a, b]) => t >= a && t < b)

function pad(b, rev, notes, t0, t1, { gain = 0.012, att = 1.4, rel = 2.2, cut = () => 1500 } = {}) {
  const oscs = []
  notes.forEach((m, k) => [-8, 0, 8].forEach((ct, j) => {
    const p = [-0.7, 0, 0.7][j] * (k % 2 ? 1 : -1)
    oscs.push({ f: midi(m) * Math.pow(2, ct / 1200), ph: R(), l: panL(p), r: panR(p) })
  }))
  const fl = new Biquad(), fr = new Biquad()
  const i0 = Math.round(t0 * SR), i1 = Math.min(N, Math.round((t1 + rel) * SR))
  for (let i = i0; i < i1; i += 1) {
    const t = i / SR, u = t - t0
    if ((i - i0) % 64 === 0) { const c = cut(t); fl.set("lp", c, 0.9); fr.set("lp", c, 0.9) }
    let l = 0, r = 0
    for (const o of oscs) {
      const dt = o.f / SR
      o.ph += dt
      if (o.ph >= 1) o.ph -= 1
      const v = 2 * o.ph - 1 - polyblep(o.ph, dt)
      l += v * o.l; r += v * o.r
    }
    const a = Math.sin(clamp(u / att) * Math.PI / 2) ** 2
    const env = a * (t > t1 ? Math.cos(clamp((t - t1) / rel) * Math.PI / 2) ** 2 : 1)
    l = fl.run(l) * env * gain; r = fr.run(r) * env * gain
    b.L[i] += l; b.R[i] += r
    rev.L[i] += l * 0.5; rev.R[i] += r * 0.5
  }
}
function bassNote(b, m, t0, dur, gain, { cut = 900 } = {}) {
  const f = midi(m), lp = new Biquad("lp", cut, 0.8)
  let ph = 0
  play(b, t0, dur + 0.04, (u) => {
    ph += f / SR
    const env = clamp(u / 0.006) * Math.exp(-u / (dur * 0.7)) * (u > dur ? 1 - (u - dur) / 0.04 : 1)
    return lp.run(Math.tanh((Math.sin(TAU * ph) + 0.35 * Math.sin(2 * TAU * ph) + 0.15 * Math.sin(3 * TAU * ph)) * 1.6)) * env
  }, { gain })
}
function kick(b, t0, gain) {
  let ph = 0
  play(b, t0, 0.5, (u) => {
    ph += (46 + 115 * Math.exp(-u / 0.03)) / SR
    const body = Math.sin(TAU * ph) * Math.exp(-u / 0.2) * clamp(u / 0.0015)
    return Math.tanh((body + noise() * Math.exp(-u / 0.003) * 0.25) * 1.5)
  }, { gain })
}
function clap(b, rev, t0, gain) {
  const bp = new Biquad("bp", 1700, 0.9)
  play(b, t0, 0.45, (u) => {
    let e = 0
    for (let k = 0; k < 3; k += 1) if (u >= k * 0.011) e += Math.exp(-(u - k * 0.011) / 0.0045)
    if (u >= 0.022) e += 0.75 * Math.exp(-(u - 0.022) / 0.12)
    return bp.run(noise()) * e * 2.2 + Math.sin(TAU * 195 * u) * Math.exp(-u / 0.04) * 0.25
  }, { gain, pan: 0.05, send: 0.3, rev })
}
function hat(b, t0, gain, open = false) {
  const h1 = new Biquad("hp", 7200, 0.7), h2 = new Biquad("hp", 7200, 0.7)
  play(b, t0, open ? 0.35 : 0.09, (u) => h2.run(h1.run(noise())) * Math.exp(-u / (open ? 0.1 : 0.022)), { gain, pan: 0.28 })
}
function pluck(b, m, t0, gain, pan, bright = 3200) {
  const f = midi(m), lp = new Biquad()
  let p1 = R(), p2 = R()
  const d1 = (f * 1.003) / SR, d2 = (f * 0.997) / SR
  let n = 0
  play(b, t0, 0.5, (u) => {
    if (n++ % 32 === 0) lp.set("lp", 380 + bright * Math.exp(-u / 0.06), 1.1)
    p1 += d1; if (p1 >= 1) p1 -= 1
    p2 += d2; if (p2 >= 1) p2 -= 1
    const v = (2 * p1 - 1 - polyblep(p1, d1)) + (2 * p2 - 1 - polyblep(p2, d2))
    return lp.run(v) * clamp(u / 0.003) * Math.exp(-u / 0.15)
  }, { gain, pan })
}
function bell(b, rev, m, t0, gain, pan = 0) {
  const f = midi(m)
  play(b, t0, 2.6, (u) => {
    const e = clamp(u / 0.002)
    return e * (Math.sin(TAU * f * u) * Math.exp(-u / 0.9) + 0.45 * Math.sin(TAU * f * 2.76 * u) * Math.exp(-u / 0.18) + 0.2 * Math.sin(TAU * f * 5.4 * u) * Math.exp(-u / 0.07))
  }, { gain, pan, send: 0.55, rev })
}
/** Délai ping-pong (croche pointée) appliqué à un bus, ajouté à `out`. */
function pingPong(inp, out, rev, { time = 0.45, fb = 0.32, mix = 0.38 } = {}) {
  const d = Math.round(time * SR), dl = new Float32Array(d), dr = new Float32Array(d)
  const lpL = new Biquad("lp", 3500), lpR = new Biquad("lp", 3500)
  let j = 0
  for (let i = 0; i < N; i += 1) {
    const yl = dl[j], yr = dr[j]
    dl[j] = lpL.run((inp.L[i] + inp.R[i]) * 0.5 + yr * fb)
    dr[j] = lpR.run(yl * fb)
    if (++j >= d) j = 0
    out.L[i] += inp.L[i] + yl * mix; out.R[i] += inp.R[i] + yr * mix
    rev.L[i] += (inp.L[i] + yl * mix) * 0.3; rev.R[i] += (inp.R[i] + yr * mix) * 0.3
  }
}

// ---------------------------------------------------------------- effets sonores
const FX = {
  whoosh(b, rev, t0, { dur = 0.7, gain = 1, dir = 1, lo = 280, hi = 3200 } = {}) {
    const bl = new Biquad("bp"), br = new Biquad("bp"), body = new Biquad("lp", 260)
    let n = 0, f = lo
    play(b, t0, dur, (u) => {
      const k = u / dur, s = Math.sin(Math.PI * Math.pow(k, 0.8)) ** 1.6
      if (n++ % 32 === 0) { f = lo * Math.pow(hi / lo, Math.sin(Math.PI * k * 0.5) ** 0.7); bl.set("bp", f, 1.3); br.set("bp", f * 1.08, 1.3) }
      return (bl.run(noise()) * 1.6 + br.run(noise()) * 1.6 + body.run(noise()) * 0.9) * s
    }, { gain, panAt: (u) => dir * ((u / dur) * 1.6 - 0.8), send: 0.25, rev })
  },
  impact(b, rev, t0, { gain = 1, size = 1 } = {}) {
    let ph = 0
    const lp = new Biquad("lp", 1600, 0.8)
    play(b, t0, 2.8 * size, (u) => {
      ph += (36 + 75 * Math.exp(-u / 0.07)) / SR
      const sub = Math.sin(TAU * ph) * Math.exp(-u / (0.75 * size))
      const crack = lp.run(noise()) * Math.exp(-u / 0.09) * 0.9
      return Math.tanh((sub * 1.1 + crack) * clamp(u / 0.002) * 1.4)
    }, { gain, send: 0.45, rev })
  },
  riser(b, rev, t0, t1, { gain = 1, from = 57 } = {}) {
    const dur = t1 - t0, bp = new Biquad("bp"), lp = new Biquad()
    let ph = 0, ph2 = 0, n = 0
    play(b, t0, dur, (u) => {
      const k = u / dur
      if (n++ % 32 === 0) { bp.set("bp", 300 * Math.pow(24, k), 1.6); lp.set("lp", 500 + 5000 * k * k, 0.9) }
      const f = midi(from + 12 * k)
      ph += f / SR; ph2 += (f * 1.5) / SR
      const tone = lp.run((ph % 1) * 2 - 1 + ((ph2 % 1) * 2 - 1) * 0.6) * 0.35
      return (bp.run(noise()) * 2 + tone) * Math.pow(k, 2.2) * (k > 0.985 ? (1 - k) / 0.015 : 1)
    }, { gain, panAt: (u) => Math.sin(u * 5) * 0.3, send: 0.35, rev })
  },
  tick(b, t0, { gain = 1, f = 2400, pan = 0 } = {}) {
    play(b, t0, 0.07, (u) => Math.sin(TAU * f * u) * Math.exp(-u / 0.011) + noise() * Math.exp(-u / 0.0015) * 0.3, { gain, pan })
  },
  pop(b, rev, t0, { gain = 1, f = 700, pan = 0 } = {}) {
    let ph = 0
    play(b, t0, 0.25, (u) => {
      ph += (f * (1 + 0.7 * Math.exp(-u / 0.018))) / SR
      return Math.sin(TAU * ph) * clamp(u / 0.002) * Math.exp(-u / 0.06)
    }, { gain, pan, send: 0.2, rev })
  },
  click(b, t0, { gain = 1, pan = 0 } = {}) {
    const bp = new Biquad("bp", 2600, 1.6)
    play(b, t0, 0.12, (u) => {
      const e = Math.exp(-u / 0.0028) + (u > 0.068 ? 0.55 * Math.exp(-(u - 0.068) / 0.0022) : 0)
      return bp.run(noise()) * e * 3 + Math.sin(TAU * 1400 * u) * Math.exp(-u / 0.006) * 0.3
    }, { gain, pan })
  },
  shimmer(b, rev, t0, { gain = 1, notes = [81, 88, 93, 96, 100] } = {}) {
    notes.forEach((m, k) => {
      const f = midi(m), s = t0 + k * 0.045
      play(b, s, 2.4, (u) => Math.sin(TAU * f * u + Math.sin(TAU * 5.5 * u) * 0.4) * clamp(u / 0.04) * Math.exp(-u / 0.8),
        { gain: gain * 0.2, pan: (k / (notes.length - 1)) * 1.2 - 0.6, send: 0.9, rev })
    })
  },
  reverse(b, rev, tEnd, { dur = 1, gain = 1 } = {}) {
    const hp = new Biquad("hp", 2500, 0.7)
    play(b, tEnd - dur, dur, (u) => hp.run(noise()) * Math.pow(u / dur, 3) * (u > dur - 0.01 ? (dur - u) / 0.01 : 1), { gain, send: 0.3, rev })
  },
}

// ---------------------------------------------------------------- partition
/** Instants des effets sonores, calés sur les animations de presentation.html (mêmes calculs). */
export function cues() {
  const C = []
  const add = (type, t, o = {}) => C.push({ type, t, ...o })
  // Ouverture : montée vers le logo, impact, lettres, sortie en travelling avant.
  add("reverse", SC.intro + 0.9, { dur: 0.85, gain: 0.7 })
  add("impact", SC.intro + 0.9, { gain: 0.9 })
  add("shimmer", SC.intro + 0.95, { gain: 0.8 })
  for (let i = 0; i < 6; i += 1) add("tick", SC.intro + 1.0 + i * 0.07, { gain: 0.25, f: 1800 + i * 160 })
  add("whoosh", SC.probleme - 0.55, { dur: 0.9, gain: 0.8, dir: 1 })
  // Problème : étiquettes qui surgissent, aspirées vers le logo, impact.
  for (let i = 0; i < 12; i += 1) add("pop", SC.probleme + 1.2 + i * 0.1, { gain: 0.32, f: 560 + (i % 5) * 90, pan: (i % 2 ? 1 : -1) * 0.5 })
  add("whoosh", SC.probleme + 4.75, { dur: 0.85, gain: 0.9, dir: -1, lo: 2600, hi: 300 })
  add("impact", SC.probleme + 5.55, { gain: 0.8, size: 0.8 })
  add("shimmer", SC.probleme + 5.6, { gain: 0.6 })
  add("riser", SC.probleme + 6.0, { t1: SC.espaces, gain: 0.55 })
  // 9 espaces : arrivée de la batterie, tuiles, balayage.
  add("impact", SC.espaces, { gain: 0.75, size: 0.9 })
  for (let i = 0; i < 9; i += 1) add("tick", SC.espaces + 0.55 + i * 0.07, { gain: 0.22, f: 2000 + i * 120, pan: ((i % 3) - 1) * 0.5 })
  add("shimmer", SC.espaces + 2.1, { gain: 0.4, notes: [76, 81, 83, 88] })
  add("whoosh", SC.espaces + 4.2, { dur: 0.8, gain: 0.4 })
  // 8 espaces en action : fenêtre, annotations, clic du curseur.
  for (let i = 0; i < 8; i += 1) {
    const T = SC.action + i * SHOW
    if (i) add("whoosh", T - 0.2, { dur: 0.65, gain: 0.55, dir: i % 2 ? -1 : 1 })
    for (let k = 0; k < 3; k += 1) add("pop", T + 1.0 + k * 0.28, { gain: 0.24, f: 620 + k * 120, pan: 0.45 })
    add("click", T + 2.25, { gain: 0.5, pan: 0.2 })
  }
  // Appareils : compteur, arrivée des appareils.
  add("whoosh", SC.appareils - 0.3, { dur: 0.7, gain: 0.6 })
  let last = 0
  const c0 = word("16-appareils", 0) - 0.05, c1 = word("16-appareils", 1) + 0.2 // compteur de presentation.html
  for (let t = 0; t <= c1 - c0; t += 1 / 120) {
    const v = Math.floor((182 * (1 - Math.pow(1 - clamp(t / (c1 - c0)), 3))) / 7)
    if (v > last) { add("tick", c0 + t, { gain: 0.16, f: 2600 + v * 15 }); last = v }
  }
  add("shimmer", c1, { gain: 0.45, notes: [76, 81, 84, 88] })
  for (const [d, g] of [[0.3, 0.5], [0.6, 0.4], [0.75, 0.35]]) add("impact", SC.appareils + d + 0.35, { gain: g * 0.6, size: 0.4 })
  add("riser", SC.appareils + 5.6, { t1: SC.parcours, gain: 0.45 })
  // Parcours : étapes qui s'allument, branches, trois sorties.
  add("impact", SC.parcours, { gain: 0.55, size: 0.7 })
  ;[69, 72, 76, 79, 81].forEach((m, i) => add("bell", word("17-parcours", i), { m, gain: 0.32 })) // étapes allumées sur les verbes
  for (let k = 0; k < 3; k += 1) {
    const said = word("17-parcours", 5 + k)
    add("whoosh", said - 0.62, { dur: 0.6, gain: 0.3, lo: 500, hi: 2600, dir: k - 1 || 1 })
    add("pop", said - 0.08, { gain: 0.4, f: 640 + k * 110, pan: (k - 1) * 0.5 })
  }
  // Conclusion : impact du logo, lettres, bouton de l'adresse, clic du curseur quand la voix la prononce.
  add("impact", SC.fin + 0.15, { gain: 1, size: 1.2 })
  add("shimmer", SC.fin + 0.2, { gain: 0.9, notes: [77, 81, 84, 88, 91] })
  for (let i = 0; i < 6; i += 1) add("tick", word("18-fin", 0) - 0.05 + i * 0.06, { gain: 0.22, f: 1900 + i * 150 })
  add("pop", word("19-adresse", 0) - 0.15, { gain: 0.4, f: 520 })
  add("click", word("19-adresse", 1) + 0.15, { gain: 0.6 })
  return C
}

function compose() {
  const padBus = bus(), drums = bus(), arp = bus(), music = bus(), mrev = bus(), sfx = bus(), srev = bus()
  // Nappes : ouverture qui s'éclaircit, tension, groove, pause, conclusion lumineuse.
  const cutAt = (t) => {
    if (t < SC.probleme) return 350 + 1300 * clamp(t / SC.probleme)
    if (t < SC.espaces) return 900 + 500 * Math.sin(t * 1.3) ** 2
    if (t < SC.appareils) return 1700 + 500 * Math.sin(t * 0.5)
    if (t < SC.fin) return 2400 + 1400 * clamp((t - SC.appareils) / 7)
    return 3200
  }
  PROG.forEach(([t0, name], k) => {
    const t1 = k + 1 < PROG.length ? PROG[k + 1][0] : DURATION - 1.6
    pad(padBus, mrev, CHORDS[name].pad, t0, t1, { cut: cutAt, att: k === 0 ? 3 : 1.2, rel: t1 >= DURATION - 2 ? 1.5 : 1.8, gain: t0 >= SC.fin ? 0.012 : 0.0095 })
  })
  // Place pour la voix : la nappe est creusée autour de 800 Hz (premiers formants de la parole).
  for (const ch of ["L", "R"]) { const eq = new Biquad("peak", 800, 0.9, -5), d = padBus[ch]; for (let i = 0; i < N; i += 1) d[i] = eq.run(d[i]) }
  // Basse : impulsions sourdes pendant le problème, croches à contretemps dans le groove, tenue à la fin.
  for (let t = SC.probleme; t < SC.espaces - 0.01; t += BEAT / 2) bassNote(padBus, chordAt(t).bass + 12, t, 0.22, 0.05 + 0.1 * ((t - SC.probleme) / 8.4), { cut: 500 })
  const groove = [[SC.espaces, SC.appareils], [SC.parcours, SC.fin]]
  for (let t = SC.espaces; t < SC.fin - 0.01; t += BEAT) {
    if (inRange(t, groove)) bassNote(padBus, chordAt(t).bass + 12, t + BEAT / 2, 0.26, 0.22)
    else if (t >= SC.appareils && Math.round((t - SC.appareils) / BEAT) % 8 === 0) bassNote(padBus, chordAt(t).bass + 12, t, 2 * BAR - 0.2, 0.14, { cut: 400 })
  }
  bassNote(padBus, CHORDS.F.bass + 12, SC.fin, 4.6, 0.2, { cut: 500 })
  bassNote(padBus, CHORDS.C.bass, 72.6, DURATION - 72.6 - 0.8, 0.2, { cut: 400 })
  // Batterie.
  const kicks = []
  for (let t = SC.espaces; t < SC.fin - 0.01; t += BEAT) {
    if (!inRange(t, groove)) continue
    const beat = Math.round((t - SC.espaces) / BEAT)
    kick(drums, t, 0.55); kicks.push(t)
    if (beat % 2 === 1) clap(drums, mrev, t, 0.17)
    hat(drums, t + BEAT / 2, 0.06)
    if (t >= 34.2) { hat(drums, t + BEAT / 4, 0.025); hat(drums, t + (3 * BEAT) / 4, 0.025) }
    if (beat % 8 === 7) hat(drums, t + BEAT / 2, 0.05, true)
  }
  for (let t = 9.0; t < SC.espaces - 0.6; t += BEAT / 4) hat(drums, t, 0.012 + 0.03 * ((t - 9) / 5.4))
  // Roulement avant la conclusion.
  for (let t = SC.fin - 1.2; t < SC.fin - 0.02;) { const k = (t - (SC.fin - 1.2)) / 1.2; clap(drums, mrev, t, 0.05 + 0.12 * k); t += k < 0.5 ? BEAT / 4 : BEAT / 8 }
  // Pompe : la nappe et la basse s'effacent un instant à chaque grosse caisse.
  let ki = 0
  for (let i = 0; i < N; i += 1) {
    const t = i / SR
    while (ki + 1 < kicks.length && kicks[ki + 1] <= t) ki += 1
    const dt = kicks.length && kicks[ki] <= t ? t - kicks[ki] : 9
    const g = 1 - 0.32 * Math.exp(-dt / 0.11)
    music.L[i] += padBus.L[i] * g; music.R[i] += padBus.R[i] * g
    music.L[i] += drums.L[i]; music.R[i] += drums.R[i]
  }
  // Arpège en doubles croches (à partir des espaces en action), plus présent pendant la pause des appareils.
  const ORDER = [0, 1, 2, 3, 4, 3, 2, 1]
  for (let t = SC.action, n = 0; t < SC.fin - 0.01; t += BEAT / 4, n += 1) {
    const c = chordAt(t), m = c.pad[ORDER[n % 8]] + 12 * (n % 16 >= 8 ? 1 : 0)
    const pause = t >= SC.appareils && t < SC.parcours
    pluck(arp, m, t, pause ? 0.05 : 0.03, ((n % 4) - 1.5) * 0.25, pause ? 1200 + 3600 * clamp((t - SC.appareils) / 6) : 2400)
  }
  // Conclusion : quelques notes de cloche qui retombent.
  ;[[76, 0.9], [81, 1.5], [84, 2.1], [88, 2.7], [83, 3.6], [79, 4.5], [76, 5.4], [72, 6.6]].forEach(([m, d], k) => bell(arp, mrev, m, SC.fin + d, 0.07 - k * 0.005, (k % 2 ? 1 : -1) * 0.35))
  pingPong(arp, music, mrev)
  const mr = reverb(mrev, { room: 0.88, damp: 0.35 })
  for (let i = 0; i < N; i += 1) { music.L[i] += mr.L[i]; music.R[i] += mr.R[i] }

  // Effets.
  for (const c of cues()) {
    if (c.type === "whoosh") FX.whoosh(sfx, srev, c.t, c)
    else if (c.type === "impact") FX.impact(sfx, srev, c.t, c)
    else if (c.type === "riser") FX.riser(sfx, srev, c.t, c.t1, c)
    else if (c.type === "tick") FX.tick(sfx, c.t, c)
    else if (c.type === "pop") FX.pop(sfx, srev, c.t, c)
    else if (c.type === "click") FX.click(sfx, c.t, c)
    else if (c.type === "shimmer") FX.shimmer(sfx, srev, c.t, c)
    else if (c.type === "reverse") FX.reverse(sfx, srev, c.t, c)
    else if (c.type === "bell") bell(sfx, srev, c.m, c.t, c.gain)
  }
  const sr = reverb(srev, { room: 0.84, damp: 0.25 })
  for (let i = 0; i < N; i += 1) { sfx.L[i] += sr.L[i]; sfx.R[i] += sr.R[i] }
  return { music, sfx }
}

// ---------------------------------------------------------------- mixage
function writeWav(file, b) {
  const data = Buffer.alloc(N * 8)
  for (let i = 0; i < N; i += 1) { data.writeFloatLE(b.L[i], i * 8); data.writeFloatLE(b.R[i], i * 8 + 4) }
  const h = Buffer.alloc(44)
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12)
  h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24)
  h.writeUInt32LE(SR * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40)
  fs.writeFileSync(file, Buffer.concat([h, data]))
}
/** Sonie intégrée (LUFS) d'un fichier, par le filtre ebur128 de ffmpeg. */
export function loudness(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 28 })
  const sum = r.stderr.slice(r.stderr.lastIndexOf("Summary:"))
  return { lufs: Number(/I:\s+(-?[\d.]+) LUFS/.exec(sum)?.[1]), peak: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(sum)?.[1]), lra: Number(/LRA:\s+(-?[\d.]+) LU/.exec(sum)?.[1]) }
}
const TARGET = { voice: -16, music: -21, sfx: -23 }
const db = (x) => Math.pow(10, x / 20)

/**
 * Fabrique la bande son complète (48 kHz, stéréo, WAV) et les sous-titres (SRT).
 * Renvoie { wav, srt, spans, levels } ; `spans` : début et fin réels de chaque phrase.
 */
export async function buildAudio({ dir, withVoice = true, newVoice = false } = {}) {
  fs.mkdirSync(dir, { recursive: true })
  if (withVoice) await makeVoice({ all: newVoice })
  // #130 : timbre plus chaud (référence : centre spectral 1 610 Hz), sifflantes adoucies ; aucune compression, pour
  // garder le relief de la voix de référence (9,8 dB entre syllabes appuyées et médianes) : la musique baisse sous elle.
  const vchain = "highpass=f=85,equalizer=f=220:t=q:w=1:g=1.5,equalizer=f=3500:t=q:w=1.2:g=-2,highshelf=f=7000:g=-3,deesser=i=0.4"
  const voice = bus(), spans = []
  if (withVoice) {
    for (const v of VOICE) {
      const s = decode(path.join(VOICE_DIR, `${v.id}.opus`), vchain)
      const i0 = Math.round(v.t * SR)
      for (let i = 0; i < s.length && i0 + i < N; i += 1) { voice.L[i0 + i] += s[i]; voice.R[i0 + i] += s[i] }
      spans.push({ ...v, end: v.t + s.length / SR })
    }
    for (const [k, v] of spans.entries()) {
      const next = spans[k + 1]
      if (next && v.end > next.t - 0.15) console.warn(`  attention : la phrase ${v.id} (${(v.end - v.t).toFixed(2)} s) touche la suivante`)
    }
  }
  const { music, sfx } = compose()

  // Sonie de chaque piste, ramenée à sa cible.
  const files = { music: path.join(dir, "musique.wav"), sfx: path.join(dir, "effets.wav"), voice: path.join(dir, "voix.wav") }
  writeWav(files.music, music); writeWav(files.sfx, sfx)
  if (withVoice) writeWav(files.voice, voice)
  const levels = { music: loudness(files.music), sfx: loudness(files.sfx), voice: withVoice ? loudness(files.voice) : null }
  const g = { music: db(TARGET.music - levels.music.lufs), sfx: db(TARGET.sfx - levels.sfx.lufs), voice: withVoice ? db(TARGET.voice - levels.voice.lufs) : 0 }
  // Musique sous la voix : -7,5 dB (montée et descente de 0,25 et 0,45 s) ; effets : -6 dB (#130 : voix presque continue).
  const duck = new Float32Array(N)
  for (const s of spans) for (let i = Math.max(0, Math.round((s.t - 0.12) * SR)); i < Math.min(N, Math.round((s.end + 0.1) * SR)); i += 1) duck[i] = 1
  let e = 0
  const up = 1 / (0.25 * SR), down = 1 / (0.45 * SR)
  for (let i = 0; i < N; i += 1) { e += duck[i] > e ? Math.min(up, duck[i] - e) : -Math.min(down, e - duck[i]); duck[i] = e }
  const mix = bus()
  const fadeOut = (t) => clamp((DURATION - t) / 1.2)
  for (let i = 0; i < N; i += 1) {
    const gm = g.music * (1 - 0.58 * duck[i]), gs = g.sfx * (1 - 0.5 * duck[i]), f = fadeOut(i / SR)
    mix.L[i] = (music.L[i] * gm + sfx.L[i] * gs + voice.L[i] * g.voice) * f
    mix.R[i] = (music.R[i] * gm + sfx.R[i] * gs + voice.R[i] * g.voice) * f
  }
  const raw = path.join(dir, "mixage.wav"), wav = path.join(dir, "bande-son.wav")
  writeWav(raw, mix)
  // Normalisation en deux passes : mesure, puis correction linéaire à -16 LUFS, crête -1,5 dBTP.
  const LN = "loudnorm=I=-16:TP=-1.5:LRA=11"
  const m = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", raw, "-af", `${LN}:print_format=json`, "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 28 })
  const j = JSON.parse(/\{\s*"input_i"[\s\S]*?\}/.exec(m.stderr)[0])
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-af",
    `${LN}:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`,
    "-ar", String(SR), "-c:a", "pcm_s24le", wav])
  levels.final = loudness(wav)
  // Voix au-dessus du fond (musique et effets) pendant les phrases, dans la bande de la parole (300 à 3 400 Hz).
  if (spans.length) {
    const band = () => { const a = new Biquad("hp", 300, 0.7), b = new Biquad("lp", 3400, 0.7); return (x) => b.run(a.run(x)) }
    const fv = band(), fb = band()
    let ev = 0, eb = 0
    for (const sp of spans) for (let i = Math.round(sp.t * SR); i < Math.min(N, Math.round(sp.end * SR)); i += 1) {
      const v = fv(voice.L[i] * g.voice), bg = fb(mix.L[i] / Math.max(1e-9, fadeOut(i / SR)) - voice.L[i] * g.voice)
      ev += v * v; eb += bg * bg
    }
    levels.voiceOverBed = 10 * Math.log10(ev / Math.max(eb, 1e-12))
  }
  // Sous-titres : une entrée par phrase, coupée en deux lignes au-delà de 42 caractères.
  const ts = (t) => { const ms = Math.round(t * 1000); const p = (n, w = 2) => String(n).padStart(w, "0"); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}` }
  const lines = (s) => {
    if (s.length <= 42) return s
    const mid = s.length / 2
    let best = -1
    for (let i = 0; i < s.length; i += 1) if (s[i] === " " && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i
    return `${s.slice(0, best)}\n${s.slice(best + 1)}`
  }
  const srt = path.join(dir, "sous-titres.srt")
  fs.writeFileSync(srt, spans.map((s, k) => `${k + 1}\n${ts(s.t)} --> ${ts(Math.min(s.end + 0.35, spans[k + 1]?.t ?? DURATION))}\n${lines(s.texte)}\n`).join("\n"))
  return { wav, srt, spans, levels, gains: g }
}
