// Sound: music and ambience loops with cross-fades, one-shot effects and the synthesized radio hiss.
// Starts only after the first touch (browsers require it). Missing files simply stay silent.

class AudioEngine {
  constructor(assetUrl) {
    this.assetUrl = assetUrl; this.ctx = null; this.buffers = new Map();
    this.vol = { music: .8, fx: .6 }; this.muted = false;
    this.layers = { music: null, amb: null }; this.want = { music: null, amb: null };
    this.radioLevel = 0; this.radioMode = "steady";
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.musicBus = ctx.createGain(); this.musicBus.connect(ctx.destination);
    this.fxBus = ctx.createGain(); this.fxBus.connect(ctx.destination);
    // radio hiss: band-passed noise with crackles
    const len = ctx.sampleRate * 2, nb = ctx.createBuffer(1, len, ctx.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const n = ctx.createBufferSource(); n.buffer = nb; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1700; bp.Q.value = .8;
    this.radioGain = ctx.createGain(); this.radioGain.gain.value = 0;
    n.connect(bp); bp.connect(this.radioGain); this.radioGain.connect(this.fxBus); n.start();
    const t0 = performance.now();
    this.radioTimer = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      let g;
      if (this.radioMode === "title") {
        const burst = Math.max(0, Math.min(1, Math.sin(t * 2 * Math.PI / 14) / .25));
        const pulse = Math.exp(-Math.pow((t / 2.8) % 1 - .08, 2) / .004);
        g = .006 + burst * (.012 + pulse * .03) + this.boost;
      } else {
        const crackle = Math.random() < .08 ? Math.random() * .6 : 0;
        g = this.radioLevel * (.05 + .02 * Math.sin(t * 1.7) + crackle * .05) + this.boost;
      }
      this.radioGain.gain.setTargetAtTime(g, ctx.currentTime, .06);
    }, 50);
    this.boost = 0;
    this.applyVolume(1.5);
    // replay what was asked before the sound could start
    for (const k of ["music", "amb"]) if (this.want[k]) { const w = this.want[k]; this.want[k] = null; this.loop(k, w.id, w.fade, w.src); }
  }

  applyVolume(ramp = .2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.muted ? 0 : this.vol.music * .9, t, ramp / 3);
    this.fxBus.gain.setTargetAtTime(this.muted ? 0 : this.vol.fx * 1.6, t, ramp / 3);
  }
  setVolume(kind, v) { this.vol[kind] = v; this.applyVolume(); }
  setMuted(m) { this.muted = m; this.applyVolume(); }
  suspend(on) { if (this.ctx) on ? this.ctx.suspend() : this.ctx.resume(); }

  async buffer(src) {
    if (!this.buffers.has(src)) {
      this.buffers.set(src, fetch(src).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(b => new Promise((res, rej) => this.ctx.decodeAudioData(b, res, rej))).catch(() => null));
    }
    return this.buffers.get(src);
  }
  srcOf(kind, id) { return this.assetUrl(`audio/${kind}/${id}.mp3`); }

  // kind: music | amb. id null stops. src overrides the file (title screen).
  async loop(kind, id, fade = 2.5, src = null) {
    const cur = this.layers[kind];
    if (cur && cur.id === id) return;
    if (!this.ctx) { this.want[kind] = id ? { id, fade, src } : null; return; }
    const t = this.ctx.currentTime;
    if (cur) { cur.gain.gain.setTargetAtTime(0, t, fade / 3); const s = cur.src; setTimeout(() => { try { s && s.stop(); } catch (e) {} }, fade * 1500); }
    this.layers[kind] = null;
    if (!id) return;
    const layer = { id, gain: this.ctx.createGain(), src: null };
    layer.gain.gain.value = 0; layer.gain.connect(this.musicBus);
    this.layers[kind] = layer;
    const buf = await this.buffer(src || this.srcOf(kind, id));
    if (!buf || this.layers[kind] !== layer) return;
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    s.loopStart = Math.min(.04, buf.duration / 4); s.loopEnd = Math.max(s.loopStart + .1, buf.duration - .04);
    s.connect(layer.gain); s.start(0, s.loopStart); layer.src = s;
    // ambience sits a few dB under the music (music -20 LUFS, ambience -24 LUFS in the files)
    layer.gain.gain.setTargetAtTime(kind === "amb" ? .65 : 1, this.ctx.currentTime, fade / 3);
  }
  async sfx(id, { rate = 1, gain = 1 } = {}) {
    if (!this.ctx) return;
    const buf = await this.buffer(this.srcOf("sfx", id)); if (!buf) return;
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    let out = s;
    if (gain !== 1) { const g = this.ctx.createGain(); g.gain.value = gain; s.connect(g); out = g; }
    out.connect(this.fxBus); s.start();
  }
  // interface sounds; quiet pencil ticks while a line is written
  ui(id) { this.sfx(id); }
  tick() { this.sfx("text_tick_" + (1 + Math.floor(Math.random() * 3)), { rate: .95 + Math.random() * .1, gain: .8 }); }
  radio(level, mode = "steady") { this.radioLevel = level; this.radioMode = mode; }
  silence() { this.loop("music", null, .3); this.loop("amb", null, .3); this.radio(0); }
  preload(kind, ids) { if (this.ctx) ids.forEach(id => this.buffer(this.srcOf(kind, id))); }
}
