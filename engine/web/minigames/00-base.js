// Mini-games: registry and shared helpers.
// Each game: MINIGAMES[id] = { start(ctx) } and start returns a stop() function that removes timers/listeners.
// ctx: area, acts, box (DOM), params, state (vars, items), story, audio (AudioEngine), scene (SceneView),
//      hint(who, text), done(outcome), vibrate(ms), sleep(ms), fast, assetUrl(p), fmt(text), sceneImage().
window.MINIGAMES = {};

const MG = {
  NS: "http://www.w3.org/2000/svg",
  INK: "#e9e1d2", GRAPHITE: "#26221b", PAPER: "#ece4d3", SEVEN: "#b02a1f",

  // an <svg> filling the play area; children are drawn with the shared pencil filter
  svg(parent, viewBox, inner = "") {
    const s = document.createElementNS(MG.NS, "svg");
    s.setAttribute("viewBox", viewBox); s.setAttribute("fill", "none");
    s.style.cssText = "width:100%;height:100%;display:block;overflow:visible;touch-action:none";
    s.innerHTML = inner; parent.append(s); return s;
  },
  el(tag, attrs = {}, parent) {
    const e = document.createElementNS(MG.NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.append(e); return e;
  },

  // pointer position in the svg's own coordinates
  point(svg, ev) {
    const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  },
  // drag with pointer capture: handlers get (ev, point-in-svg)
  drag(svg, target, { down, move, up }) {
    const on = (ev, fn) => fn && fn(ev, MG.point(svg, ev));
    const d = ev => { ev.preventDefault(); target.setPointerCapture(ev.pointerId); on(ev, down); };
    const m = ev => { if (target.hasPointerCapture(ev.pointerId)) on(ev, move); };
    const u = ev => { if (target.hasPointerCapture(ev.pointerId)) { target.releasePointerCapture(ev.pointerId); on(ev, up); } };
    target.addEventListener("pointerdown", d); target.addEventListener("pointermove", m);
    target.addEventListener("pointerup", u); target.addEventListener("pointercancel", u);
    return () => { target.removeEventListener("pointerdown", d); target.removeEventListener("pointermove", m); target.removeEventListener("pointerup", u); target.removeEventListener("pointercancel", u); };
  },
  // signed change of angle around a centre between two pointer positions, in radians
  dAngle(c, a, b) {
    let d = Math.atan2(b.y - c.y, b.x - c.x) - Math.atan2(a.y - c.y, a.x - c.x);
    while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  },

  // hints from friends after 15, 30 and 45 s without progress. poke() restarts the wait (call on real progress).
  // lines: [[who, text], ...]; onLast(): called after the last hint is shown (usually "Дай я" -> done("ok")).
  // The wait does not run while the game is paused (pause, settings or backpack open) or the tab is hidden.
  hints(ctx, lines, onLast, every = 15) {
    let i = 0, waited = 0, stopped = false, last = performance.now();
    const wait = (ctx.fast ? .05 : every) * 1000;
    const held = () => (ctx.paused && ctx.paused()) || document.hidden;
    const tick = setInterval(() => {
      const now = performance.now(), dt = now - last; last = now;
      if (stopped || i >= lines.length || held()) return;
      waited += dt;
      if (waited < wait) return;
      waited = 0;
      const [who, text] = lines[i++];
      ctx.hint(who, text);
      if (i >= lines.length && onLast) setTimeout(() => { if (!stopped) onLast(); }, ctx.fast ? 10 : 2600);
    }, ctx.fast ? 10 : 200);
    return { poke() { waited = 0; }, stop() { stopped = true; clearInterval(tick); }, get shown() { return i; } };
  },

  // ---------- sound helpers (silent when the sound is off) ----------
  ac(ctx) { return ctx.audio && ctx.audio.ctx ? ctx.audio.ctx : null; },
  // short click/crackle
  click(ctx, level = .25, dur = .04) {
    const ac = MG.ac(ctx); if (!ac) return;
    const len = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const s = ac.createBufferSource(), g = ac.createGain(); g.gain.value = level; s.buffer = b; s.connect(g); g.connect(ctx.audio.fxBus); s.start();
  },
  // a soft sine/triangle tone
  tone(ctx, freq, dur = .2, level = .15, type = "sine", pan = 0) {
    const ac = MG.ac(ctx); if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = freq;
    const t = ac.currentTime; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + .015); g.gain.exponentialRampToValueAtTime(.0005, t + dur);
    let out = g;
    if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    o.connect(g); out.connect(ctx.audio.fxBus); o.start(t); o.stop(t + dur + .05);
  },
  // continuous radio: hiss plus a voice-like formant hum that becomes clear as clarity -> 1
  radioVoice(ctx) {
    const ac = MG.ac(ctx); if (!ac) return { set() {}, stop() {} };
    const len = ac.sampleRate * 2, nb = ac.createBuffer(1, len, ac.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const n = ac.createBufferSource(); n.buffer = nb; n.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = .7;
    const hiss = ac.createGain(); hiss.gain.value = 0;
    // "voice": a buzzy source through two formant filters with a syllable-like envelope
    const src = ac.createOscillator(); src.type = "sawtooth"; src.frequency.value = 220;
    const f1 = ac.createBiquadFilter(); f1.type = "bandpass"; f1.frequency.value = 700; f1.Q.value = 6;
    const f2 = ac.createBiquadFilter(); f2.type = "bandpass"; f2.frequency.value = 1200; f2.Q.value = 8;
    const voice = ac.createGain(); voice.gain.value = 0;
    const out = ac.createGain(); out.gain.value = 1;
    n.connect(bp); bp.connect(hiss); hiss.connect(out);
    src.connect(f1); src.connect(f2); f1.connect(voice); f2.connect(voice); voice.connect(out); out.connect(ctx.audio.fxBus);
    n.start(); src.start();
    let clarity = 0, alive = true;
    const t0 = ac.currentTime;
    const tick = setInterval(() => {
      if (!alive) return;
      const t = ac.currentTime - t0;
      const syl = Math.max(0, Math.sin(t * 7.3) * Math.sin(t * 2.1 + 1)) * (Math.sin(t * .9) > -.3 ? 1 : .1);
      src.frequency.setTargetAtTime(200 + 40 * Math.sin(t * 1.7) + 30 * Math.sin(t * 4.1), ac.currentTime, .05);
      f1.frequency.setTargetAtTime(500 + 400 * (.5 + .5 * Math.sin(t * 5.3)), ac.currentTime, .04);
      f2.frequency.setTargetAtTime(1100 + 700 * (.5 + .5 * Math.sin(t * 3.7 + 2)), ac.currentTime, .04);
      voice.gain.setTargetAtTime(Math.pow(clarity, 2) * syl * .06, ac.currentTime, .03);
      const pulse = clarity > .2 ? (.5 + .5 * Math.sin(t * 18)) * clarity : 0;
      hiss.gain.setTargetAtTime(.05 * (1 - .75 * clarity) * (1 - .4 * pulse) + (Math.random() < .06 ? .04 : 0), ac.currentTime, .05);
    }, 40);
    return {
      set(c) { clarity = Math.max(0, Math.min(1, c)); },
      stop() { alive = false; clearInterval(tick); out.gain.setTargetAtTime(0, ac.currentTime, .1); setTimeout(() => { try { n.stop(); src.stop(); } catch (e) {} }, 600); },
    };
  },
  // play a file from audio/sfx (e.g. tape_1); resolves true when it ends, false when the file is missing
  async play(ctx, id, { rate = 1 } = {}) {
    if (!MG.ac(ctx)) return false;
    const buf = await ctx.audio.buffer(ctx.assetUrl(`audio/sfx/${id}.mp3`));
    if (!buf) return false;
    const s = ctx.audio.ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate; s.connect(ctx.audio.fxBus); s.start();
    return new Promise(r => { s.onended = () => r(true); });
  },

  // a darker veil over the scene so the pencil interface reads on top of the picture
  // also blurred, so details of the picture underneath (a red 7 on a drawn dial) never compete with the game's own
  veil(ctx, alpha = .55, blur = 6) {
    ctx.box.style.background = `rgba(8,7,5,${alpha})`;
    ctx.box.style.backdropFilter = ctx.box.style.webkitBackdropFilter = blur ? `blur(${blur}px)` : "";
  },
};
