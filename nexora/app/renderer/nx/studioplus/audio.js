// NEXORA #055 : bruitages synthétisés posés sur la frise (swoosh, pop, clic, impact, montée, notification, passage
// rapide), écoutables tout de suite et mêlés à la musique et à la voix off dans les vidéos MP4 exportées.
import { SFX, synth, mixInto } from './formats.js';
import { toast } from './ui.js';

export { SFX };
export const list = (S) => (S.anim.nxSfx = Array.isArray(S.anim.nxSfx) ? S.anim.nxSfx : []);
let ctx = null;
export function listen(kind) {
  ctx = ctx || new AudioContext();
  const d = synth(kind, ctx.sampleRate); const b = ctx.createBuffer(1, d.length, ctx.sampleRate); b.copyToChannel(d, 0);
  const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start();
}
export function add(S, kind) {
  list(S).push({ kind, t: Math.round(S.time * 100) / 100, vol: 0.8 });
  list(S).sort((a, b) => a.t - b.t);
  S.dirty = true; S.commit();
  toast(`Bruitage « ${SFX[kind]} » ajouté à ${S.time.toFixed(2).replace('.', ',')} s.`);
}
// Bande son de l'export : musique (ou voix off déjà mêlée) + bruitages, volume de la musique compensé.
export function mixedMusic(S) {
  const sfx = list(S); if (!sfx.length) return null;
  const m = S.music; const base = m && m.buffer; const rate = base ? base.sampleRate : 48000; const off = (m && m.offset) || 0;
  const length = Math.max(base ? base.length : 0, Math.ceil((off + S.anim.duration + 1) * rate));
  const chans = [new Float32Array(length), new Float32Array(length)];
  if (base) for (let c = 0; c < 2; c++) chans[c].set(base.getChannelData(Math.min(c, base.numberOfChannels - 1)));
  const vol = (m && m.volume) || 1;
  for (const s of sfx) mixInto(chans, synth(s.kind, rate), Math.round((off + s.t) * rate), Math.min(3, (s.vol ?? 0.8) / vol));
  const buf = new AudioBuffer({ length, numberOfChannels: 2, sampleRate: rate });
  buf.copyToChannel(chans[0], 0); buf.copyToChannel(chans[1], 1);
  return m ? { ...m, buffer: buf } : { name: 'Bruitages', buffer: buf, volume: 1, offset: 0, fadeIn: 0, fadeOut: 0 };
}
// Pendant l'export vidéo, la musique est remplacée par le mélange, puis rétablie.
export function wrapExport(proto) {
  if (proto.sxExportVideo) return;
  proto.sxExportVideo = proto.exportVideo;
  proto.exportVideo = async function (...args) {
    const keep = this.music; let mixed = null;
    try { mixed = mixedMusic(this); } catch (e) { console.warn('[NEXORA #055] bruitages', e); }
    if (mixed) this.music = mixed;
    try { return await this.sxExportVideo(...args); } finally { if (mixed) this.music = keep; }
  };
}
