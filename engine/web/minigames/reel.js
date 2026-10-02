// Mini-game "reel": a reel-to-reel recorder. Turn the supply reel to scrub the tape; stop on the father's
// paper marks to hear each fragment (audio/sfx/tape_N.mp3, otherwise its text from docs as subtitles).
(() => {
  const PX = 15;          // svg units per tape unit in the tape window
  const TURN = 12;        // tape units per full turn of the supply reel
  const HEAD = { x: 200, y: 272 };

  const rng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const roughCircle = (cx, cy, r, rnd, j = 1.6) => {
    const n = 24, pts = [], a0 = rnd() * 6.28;
    for (let i = 0; i <= n + 1; i++) { const a = a0 + i / n * 6.28 * 1.02, rr = r + (rnd() - .5) * j * 2; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length - 1; i++) { const [x, y] = pts[i], [x2, y2] = pts[i + 1]; d += ` Q${x.toFixed(1)} ${y.toFixed(1)} ${((x + x2) / 2).toFixed(1)} ${((y + y2) / 2).toFixed(1)}`; }
    return d;
  };
  const roughLine = (x1, y1, x2, y2, rnd, j = 1.4) => {
    const mx = (x1 + x2) / 2 + (rnd() - .5) * j * 2, my = (y1 + y2) / 2 + (rnd() - .5) * j * 2;
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  const wrap = (text, max) => {
    const out = []; let cur = "";
    for (const w of text.split(" ")) { if (cur && (cur + " " + w).length > max) { out.push(cur); cur = w; } else cur = cur ? cur + " " + w : w; }
    if (cur) out.push(cur);
    return out;
  };

  // fragments: audio ids and subtitle lines for each mark
  function fragments(ctx, mode) {
    const n = mode === "old" ? 2 : 3;
    const docs = (ctx.story && ctx.story.docs) || {};
    const clean = t => String(ctx.fmt ? ctx.fmt(t) : t).replace(/<[^>]+>/g, "").replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim();
    const ids = mode === "old" ? ["tape_old_1", "tape_old_2"] : ["tape_1", "tape_2", "tape_3"];
    const exact = ids.map(id => docs[id]);
    let texts = exact.map(d => d && d.paras && d.paras.length ? d.paras.map(clean) : null);
    if (texts.some(t => !t)) {
      const pool = Object.keys(docs).filter(id => id.startsWith("tape_") && (mode === "old" ? /old/.test(id) : !/old/.test(id))).sort();
      if (pool.length >= n) texts = texts.map((t, k) => t || docs[pool[k]].paras.map(clean));
      else if (pool.length === 1 && docs[pool[0]].paras.length >= n) {
        const ps = docs[pool[0]].paras.map(clean), per = Math.ceil(ps.length / n);
        texts = texts.map((t, k) => t || ps.slice(k * per, (k + 1) * per));
      }
    }
    return ids.map((id, k) => ({ id, lines: texts[k] && texts[k].length ? texts[k] : null, k }));
  }

  MINIGAMES.reel = {
    start(ctx) {
      MG.veil(ctx, .7);
      const fast = !!ctx.fast, rnd = rng(1707);
      const mode = (ctx.params && ctx.params.mode) === "old" ? "old" : "last";
      const frags = fragments(ctx, mode);
      const L = mode === "old" ? 60 : 100;
      const marks = (mode === "old" ? [21, 42] : [17, 46, 78]).map((at, k) => ({ at, frag: frags[k], heard: false, lastPlayPos: -99 }));
      const buffers = frags.map(() => null);
      if (MG.ac(ctx)) frags.forEach((f, k) => ctx.audio.buffer(ctx.assetUrl(`audio/sfx/${f.id}.mp3`)).then(b => { buffers[k] = b; }));

      // the svg keeps clear of the strip at the bottom where friends' hints appear
      const holder = document.createElement("div");
      holder.style.cssText = "position:absolute;left:0;right:0;top:0;bottom:18cqw";
      ctx.area.append(holder);
      const svg = MG.svg(holder, "0 0 400 540");
      const g = (attrs = {}, parent = svg) => MG.el("g", attrs, parent);
      const hand = (attrs, text, parent) => { const t = MG.el("text", { "font-family": "Caveat, 'Segoe Print', cursive", fill: MG.INK, ...attrs }, parent); t.textContent = text; return t; };
      const INK = MG.INK, SL = { stroke: INK, "stroke-linecap": "round", "stroke-linejoin": "round" };

      // ---------- deck ----------
      const deck = g({ filter: "url(#pencil)" });
      MG.el("path", { d: roughLine(8, 6, 392, 2, rnd) + roughLine(392, 2, 394, 388, rnd) + roughLine(394, 388, 6, 392, rnd) + roughLine(6, 392, 8, 6, rnd), ...SL, "stroke-width": 1.4, opacity: .5 }, deck);
      // light hatching on the deck plate
      for (let i = 0; i < 26; i++) { const x = 16 + i * 15; MG.el("path", { d: roughLine(x, 382, x + 18, 358, rnd, .6), ...SL, "stroke-width": .6, opacity: .16 }, deck); }

      const R1 = { x: 108, y: 112 }, R2 = { x: 292, y: 112 }, FL = 88, HUB = 20, PMIN = 30, PMAX = 80;
      const packR = frac => Math.sqrt(PMIN * PMIN + frac * (PMAX * PMAX - PMIN * PMIN));
      const mkReel = c => {
        const outer = g({});
        // the tape pack under the flange: seen only through the windows
        const pack = MG.el("circle", { cx: c.x, cy: c.y, r: 60, fill: "#0f0d0b", stroke: INK, "stroke-width": 1.1, opacity: .95 }, outer);
        const rot = g({}, outer);
        const p = (r, aa) => `${(c.x + Math.cos(aa) * r).toFixed(1)} ${(c.y + Math.sin(aa) * r).toFixed(1)}`;
        let win = "";
        for (let k = 0; k < 3; k++) {
          const a1 = k * 2.094 + .25, a2 = a1 + 1.25, r1 = 30, r2 = 80;
          win += ` M${p(r1, a1)} L${p(r2, a1)} A${r2} ${r2} 0 0 1 ${p(r2, a2)} L${p(r1, a2)} A${r1} ${r1} 0 0 0 ${p(r1, a1)} Z`;
        }
        const disc = `M${c.x - FL} ${c.y} A${FL} ${FL} 0 1 1 ${c.x + FL} ${c.y} A${FL} ${FL} 0 1 1 ${c.x - FL} ${c.y} Z`;
        MG.el("path", { d: disc + win, "fill-rule": "evenodd", fill: "#37322b", opacity: .93 }, rot);
        // pencil shading on the flange spokes
        for (let k = 0; k < 3; k++) for (let i = 0; i < 6; i++) {
          const a = k * 2.094 + 1.62 + i * .1;
          MG.el("path", { d: roughLine(c.x + Math.cos(a) * 36, c.y + Math.sin(a) * 36, c.x + Math.cos(a + .08) * 76, c.y + Math.sin(a + .08) * 76, rnd, .6), ...SL, "stroke-width": .6, opacity: .22 }, rot);
        }
        MG.el("path", { d: win, ...SL, "stroke-width": 1.2, opacity: .85 }, rot);
        MG.el("path", { d: roughCircle(c.x, c.y, FL, rnd), ...SL, "stroke-width": 1.8 }, rot);
        MG.el("circle", { cx: c.x, cy: c.y, r: HUB, fill: "#26221c" }, rot);
        MG.el("path", { d: roughCircle(c.x, c.y, HUB, rnd, 1), ...SL, "stroke-width": 1.4 }, rot);
        for (let k = 0; k < 3; k++) { const a = k * 2.094 + 1.05; MG.el("path", { d: roughLine(c.x + Math.cos(a) * 7, c.y + Math.sin(a) * 7, c.x + Math.cos(a) * 15, c.y + Math.sin(a) * 15, rnd, .3), ...SL, "stroke-width": 2 }, rot); }
        return { pack, rot };
      };
      const sup = mkReel(R1), tak = mkReel(R2);
      // a pencil arrow around the supply reel: "turn me"
      { const pt = a => `${(R1.x + Math.cos(a) * 101).toFixed(1)} ${(R1.y + Math.sin(a) * 101).toFixed(1)}`, a1 = 3.6, a2 = 4.45;
        const tip = R1.x + Math.cos(a2) * 101, tipy = R1.y + Math.sin(a2) * 101;
        MG.el("path", { d: `M${pt(a1)} A101 101 0 0 1 ${pt(a2)} M${(tip - 9).toFixed(1)} ${(tipy - 3).toFixed(1)} L${tip.toFixed(1)} ${tipy.toFixed(1)} L${(tip - 4).toFixed(1)} ${(tipy + 9).toFixed(1)}`, ...SL, "stroke-width": 1.3, opacity: .5, filter: "url(#pencil)" }, svg); }

      // guide rollers, head block, tape run
      const RL = { x: 34, y: HEAD.y }, RR = { x: 366, y: HEAD.y };
      const rollers = g({ filter: "url(#pencil)" });
      for (const r of [RL, RR]) { MG.el("path", { d: roughCircle(r.x, r.y + 9, 11, rnd, .8), ...SL, "stroke-width": 1.4 }, rollers); MG.el("circle", { cx: r.x, cy: r.y + 9, r: 2.5, fill: INK }, rollers); }
      MG.el("path", { d: `M${HEAD.x - 34} ${HEAD.y + 6} L${HEAD.x + 34} ${HEAD.y + 6} L${HEAD.x + 30} ${HEAD.y + 46} L${HEAD.x - 30} ${HEAD.y + 46} Z`, ...SL, "stroke-width": 1.5, fill: "#14120f" }, rollers);
      MG.el("path", { d: roughLine(HEAD.x, HEAD.y + 6, HEAD.x, HEAD.y + 22, rnd, .3), ...SL, "stroke-width": 1.2 }, rollers);
      for (let i = 0; i < 4; i++) MG.el("path", { d: roughLine(HEAD.x - 26 + i * 4, HEAD.y + 44, HEAD.x - 10 + i * 4, HEAD.y + 26, rnd, .4), ...SL, "stroke-width": .6, opacity: .4 }, rollers);
      const feedL = MG.el("path", { ...SL, "stroke-width": 2.2, opacity: .8 }, svg);
      const feedR = MG.el("path", { ...SL, "stroke-width": 2.2, opacity: .8 }, svg);

      // the tape window: a band that scrolls under the head
      MG.el("clipPath", { id: "rl-win" }, svg).append(MG.el("rect", { x: RL.x, y: HEAD.y - 40, width: RR.x - RL.x, height: 80 }));
      const win = g({ "clip-path": "url(#rl-win)" });
      MG.el("rect", { x: RL.x, y: HEAD.y - 4, width: RR.x - RL.x, height: 8, fill: "#2a241d" }, win);
      MG.el("path", { d: roughLine(RL.x, HEAD.y - 4, RR.x, HEAD.y - 4, rnd, .5) + roughLine(RL.x, HEAD.y + 4, RR.x, HEAD.y + 4, rnd, .5), ...SL, "stroke-width": 1.1 }, win);
      const grain = g({}, win);
      let gd = "";
      for (let x = -40; x < 440; x += 9 + rnd() * 9) gd += `M${x.toFixed(1)} ${HEAD.y - 3} l${(1 + rnd() * 3).toFixed(1)} 6 `;
      MG.el("path", { d: gd, ...SL, "stroke-width": .7, opacity: .45 }, grain);
      // paper slips spliced into the tape
      const slipEls = marks.map((m, k) => {
        const s = g({}, win);
        MG.el("path", { d: `M-11 -15 L11 -14 L12 15 L-10 16 Z`, fill: MG.PAPER, stroke: MG.GRAPHITE, "stroke-width": 1 }, s);
        hand({ x: 0, y: 8, "font-size": 22, "font-weight": 700, "text-anchor": "middle", fill: MG.GRAPHITE }, String(k + 1), s);
        const tick = MG.el("path", { d: "M-7 -9 L-2 -4 L8 -13", stroke: MG.GRAPHITE, "stroke-width": 1.6, fill: "none", opacity: 0, "stroke-linecap": "round" }, s);
        return { s, tick };
      });
      // the head gap glows faintly with the signal; a pencil wave rides above it
      const wave = MG.el("path", { ...SL, "stroke-width": 1.3, opacity: .9 }, svg);

      // a VU meter
      const VU = { x: 200, y: 372 };
      const vu = g({ filter: "url(#pencil)" });
      MG.el("path", { d: `M${VU.x - 46} ${VU.y - 18} A54 54 0 0 1 ${VU.x + 46} ${VU.y - 18}`, ...SL, "stroke-width": 1.2 }, vu);
      for (let i = 0; i <= 8; i++) { const a2 = -Math.PI / 2 + (i - 4) * .2; MG.el("path", { d: roughLine(VU.x + Math.cos(a2) * 50, VU.y + Math.sin(a2) * 50, VU.x + Math.cos(a2) * (i > 5 ? 58 : 55), VU.y + Math.sin(a2) * (i > 5 ? 58 : 55), rnd, .2), ...SL, "stroke-width": i > 5 ? 1.6 : 1 }, vu); }
      const lbl = MG.el("text", { x: VU.x, y: VU.y - 2, "font-family": "Oswald, 'Arial Narrow', sans-serif", "font-size": 11, "letter-spacing": 3, "text-anchor": "middle", fill: INK, opacity: .6 }, svg); lbl.textContent = "VU";
      const needle = MG.el("path", { d: `M${VU.x} ${VU.y} L${VU.x} ${VU.y - 52}`, ...SL, "stroke-width": 1.5 }, svg);

      // subtitles
      const subs = g({});
      const subLines = [0, 1, 2].map(k => hand({ x: 200, y: 438 + k * 34, "font-size": 31, "text-anchor": "middle" }, "", subs));
      subLines.forEach(t => { t.style.transition = "opacity .5s ease"; });
      const subTag = MG.el("text", { x: 200, y: 412, "font-family": "Oswald, 'Arial Narrow', sans-serif", "font-size": 12, "letter-spacing": 3, "text-anchor": "middle", fill: INK, opacity: 0 }, subs);
      const fit = (t, max) => { t.removeAttribute("textLength"); try { if (t.getComputedTextLength() > max) { t.setAttribute("textLength", max); t.setAttribute("lengthAdjust", "spacingAndGlyphs"); } } catch (e) {} };

      // ---------- sound: tape rustle (noise through a band-pass, follows the speed) ----------
      const ac = MG.ac(ctx);
      let noise = null, bp = null, rg = null, tapeHiss = null;
      if (ac) {
        const len = ac.sampleRate * 2, nb = ac.createBuffer(1, len, ac.sampleRate), d = nb.getChannelData(0);
        let br = 0;
        for (let i = 0; i < len; i++) { br = br * .6 + (Math.random() * 2 - 1) * .4; d[i] = (Math.random() * 2 - 1) * .5 + br; }
        noise = ac.createBufferSource(); noise.buffer = nb; noise.loop = true;
        bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 400; bp.Q.value = 1.4;
        rg = ac.createGain(); rg.gain.value = 0;
        tapeHiss = ac.createGain(); tapeHiss.gain.value = 0;
        const hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2500;
        noise.connect(bp); bp.connect(rg); rg.connect(ctx.audio.fxBus);
        noise.connect(hp); hp.connect(tapeHiss); tapeHiss.connect(ctx.audio.fxBus);
        noise.start();
      }

      // ---------- state ----------
      let pos = 3, vel = 0, spd = 0, angle = 0, dragging = false, alive = true, auto = false, finished = false;
      let playing = null, still = 0, lastT = performance.now(), raf = 0, level = 0, phase = 0;
      const timers = [];
      const later = (fn, ms) => { const t = setTimeout(() => { if (alive) fn(); }, fast ? Math.min(ms, 30) : ms); timers.push(t); return t; };
      const clampPos = () => { if (pos < 0) { pos = 0; vel = 0; } if (pos > L) { pos = L; vel = 0; } };

      const clearSubs = () => { subLines.forEach(t => { t.style.opacity = 0; }); subTag.setAttribute("opacity", 0); };
      const showSub = (text, tag) => {
        const ls = wrap(text, 24).slice(0, 3);
        subLines.forEach((t, k) => { t.textContent = ls[k] || ""; fit(t, 370); t.style.opacity = ls[k] ? .95 : 0; });
        subTag.textContent = tag || ""; subTag.setAttribute("opacity", tag ? .55 : 0);
      };

      // play the fragment of mark m: the file if it exists, its text as subtitles in any case
      const play = m => {
        const k = marks.indexOf(m), f = m.frag, buf = buffers[k];
        const lines = f.lines || ["…"];
        const tag = f.lines ? "" : `фрагмент ${k + 1}`;
        const p = { m, src: null, startPos: pos, timers: [], an: null, data: null, ended: false };
        playing = p; m.lastPlayPos = m.at;
        MG.click(ctx, .3, .03); ctx.vibrate && ctx.vibrate(10);
        let total;
        if (buf && ac) {
          const s = ac.createBufferSource(); s.buffer = buf;
          const an = ac.createAnalyser(); an.fftSize = 256; p.an = an; p.data = new Uint8Array(an.fftSize);
          s.connect(an); an.connect(ctx.audio.fxBus); s.start(); p.src = s;
          total = buf.duration * 1000;
          s.onended = () => { if (playing === p && !p.ended) finishPlay(p); };
        } else {
          total = lines.reduce((t, l) => t + 1400 + l.length * 55, 0);
          p.t = setTimeout(() => { if (alive && playing === p) finishPlay(p); }, fast ? 40 : total + 300);
        }
        // subtitles follow the fragment line by line
        if (!(buf && !f.lines)) {
          let t = 0; const per = buf ? total / lines.length : 0;
          lines.forEach(l => { const at = t; p.timers.push(setTimeout(() => { if (alive && playing === p) showSub(l, tag); }, fast ? 0 : at)); t += buf ? per : 1400 + l.length * 55; });
        }
        p.total = total; p.t0 = performance.now();
      };
      const stopPlay = () => {
        const p = playing; if (!p) return;
        p.ended = true; playing = null;
        p.timers.forEach(clearTimeout); clearTimeout(p.t);
        if (p.src) { try { p.src.onended = null; p.src.stop(); } catch (e) {} }
        clearSubs();
      };
      const finishPlay = p => {
        p.ended = true; playing = null; p.timers.forEach(clearTimeout); clearTimeout(p.t);
        const m = p.m;
        later(clearSubs, 1600);
        if (!m.heard) {
          m.heard = true; hints.poke();
          slipEls[marks.indexOf(m)].tick.setAttribute("opacity", .9);
          MG.click(ctx, .1, .02);
        }
        if (!finished && marks.every(x => x.heard)) { finished = true; hints.stop(); later(() => ctx.done("ok"), 1800); }
      };

      // ---------- frame loop ----------
      const frame = now => {
        if (!alive) return;
        const raw = Math.min(.25, (now - lastT) / 1000), dt = Math.min(.05, raw); lastT = now;
        const prev = pos;
        if (!dragging && !auto) {
          // flywheel: coast after a flick, a soft pull towards a mark when nearly stopped
          pos += vel * dt; vel *= Math.pow(.12, dt);
          if (Math.abs(vel) < 1.2 && !playing) {
            const m = marks.find(x => Math.abs(x.at - pos) < 1.3);
            if (m) { pos += (m.at - pos) * Math.min(1, dt * 5); vel *= .8; }
          }
          if (playing) { pos += .25 * dt; playing.startPos += .25 * dt; }
          clampPos();
        }
        const dpos = pos - prev;
        spd += ((dpos / Math.max(dt, .001)) - spd) * Math.min(1, dt * 12);
        angle += dpos / TURN * 360;

        // a mark passing the head clicks
        for (const m of marks) if ((prev - m.at) * (pos - m.at) < 0 && Math.abs(dpos) > .02) { MG.click(ctx, .18, .015); ctx.vibrate && ctx.vibrate(5); }

        // stop on a mark -> play it
        const a = Math.abs(spd);
        if (!playing && !auto) {
          const m = marks.find(x => Math.abs(x.at - pos) < .9);
          if (m && a < .6 && m.lastPlayPos < 0) { still += raw; if (still > (fast ? .02 : .35)) { still = 0; play(m); } }
          else still = 0;
          for (const x of marks) if (Math.abs(x.at - pos) > 2) x.lastPlayPos = -99;
        }
        if (playing && Math.abs(pos - playing.startPos) > 2.2) stopPlay();

        // sound
        if (ac) {
          const t = ac.currentTime, sp = Math.min(a, 30);
          bp.frequency.setTargetAtTime(160 + sp * 120, t, .03);
          rg.gain.setTargetAtTime(Math.min(.32, sp * .028) * (playing ? .3 : 1), t, .04);
          tapeHiss.gain.setTargetAtTime(playing ? .012 : 0, t, .2);
        }

        // signal level for the needle and the wave
        let sig = Math.min(1, a / 14);
        if (playing) {
          hints.poke();   // a long fragment is progress: no hints while it plays
          if (playing.an) {
            playing.an.getByteTimeDomainData(playing.data);
            let s = 0; for (const v of playing.data) s += (v - 128) * (v - 128);
            sig = Math.max(sig, Math.min(1, Math.sqrt(s / playing.data.length) / 30));
          } else {
            // no file: a speech-like envelope, so the meter still "talks"
            const tt = (now - playing.t0) / 1000;
            sig = Math.max(sig, .25 + .55 * Math.max(0, Math.sin(tt * 7.3) * Math.sin(tt * 2.1 + 1)) + .1 * Math.random());
          }
        }
        level += (sig - level) * Math.min(1, dt * 14);
        phase += dt * (6 + a * 2);

        // draw
        const fr = pos / L;
        const rs = packR(1 - fr), rt = packR(fr);
        sup.pack.setAttribute("r", rs.toFixed(1)); tak.pack.setAttribute("r", rt.toFixed(1));
        sup.rot.setAttribute("transform", `rotate(${angle.toFixed(1)} ${R1.x} ${R1.y})`);
        tak.rot.setAttribute("transform", `rotate(${(angle * packR(1 - fr) / rt).toFixed(1)} ${R2.x} ${R2.y})`);
        feedL.setAttribute("d", `M${(R1.x - rs).toFixed(1)} ${R1.y} L${RL.x - 11} ${HEAD.y + 9} Q${RL.x - 9} ${HEAD.y + 1} ${RL.x} ${HEAD.y}`);
        feedR.setAttribute("d", `M${RR.x} ${HEAD.y} Q${RR.x + 9} ${HEAD.y + 1} ${RR.x + 11} ${HEAD.y + 9} L${(R2.x + rt).toFixed(1)} ${R2.y}`);
        grain.setAttribute("transform", `translate(${(((pos * PX) % 90) + 90) % 90 - 45} 0)`);
        marks.forEach((m, k) => {
          const x = HEAD.x - (m.at - pos) * PX;
          slipEls[k].s.setAttribute("transform", `translate(${x.toFixed(1)} ${HEAD.y}) rotate(${(k % 2 ? 3 : -4)})`);
        });
        let wd = `M${HEAD.x - 40} ${HEAD.y - 16}`;
        for (let i = 1; i <= 20; i++) { const x = HEAD.x - 40 + i * 4, env = Math.sin(i / 20 * Math.PI); wd += ` L${x} ${(HEAD.y - 16 - env * level * 12 * Math.sin(phase + i * 1.3) * (.6 + .4 * Math.random())).toFixed(1)}`; }
        wave.setAttribute("d", wd); wave.setAttribute("opacity", (.15 + level * .85).toFixed(2));
        const na = -50 + level * 95 + (Math.random() - .5) * level * 6;
        needle.setAttribute("transform", `rotate(${na.toFixed(1)} ${VU.x} ${VU.y})`);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      svg.__state = () => ({ pos: +pos.toFixed(2), spd: +spd.toFixed(2), vel: +vel.toFixed(2), playing: !!playing, auto, dragging, heard: marks.map(m => m.heard), last: marks.map(m => m.lastPlayPos) }); // for tests

      // ---------- hints; "Дай я": Tim scrubs to every mark and plays it ----------
      const hints = MG.hints(ctx, [
        ["tim", "Там бумажки вклеены. Он метил места."],
        ["tim", "Крути медленнее у меток."],
        ["tim", "Дай я."],
      ], () => {
        if (finished) return;
        auto = true; dragging = false; vel = 0; stopPlay();
        const next = () => {
          if (!alive) return;
          const m = marks.find(x => !x.heard); if (!m) return;
          const from = pos, t0 = performance.now(), dur = fast ? 20 : 900 + Math.abs(m.at - from) * 45;
          const go = now => {
            if (!alive) return;
            const k = Math.min(1, (now - t0) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
            pos = from + (m.at - from) * e;
            if (k < 1) requestAnimationFrame(go);
            else later(() => {
              play(m);
              const p = playing;
              const wait = () => { if (!alive) return; if (p && !p.ended) { timers.push(setTimeout(wait, 100)); return; } later(next, 700); };
              wait();
            }, 400);
          };
          requestAnimationFrame(go);
        };
        next();
      });

      // ---------- one gesture: turn the supply reel ----------
      let last = null, lastMove = 0;
      const offDrag = MG.drag(svg, svg, {
        down(ev, p) { if (auto) return; dragging = true; vel = 0; last = p; lastMove = performance.now(); },
        move(ev, p) {
          if (!dragging || auto) return;
          if (Math.hypot(p.x - R1.x, p.y - R1.y) > 14 && Math.hypot(last.x - R1.x, last.y - R1.y) > 14) {
            const d = MG.dAngle(R1, last, p) / (2 * Math.PI) * TURN;
            const now = performance.now(), dt = Math.max(.008, (now - lastMove) / 1000);
            pos += d; clampPos();
            vel = vel * .5 + (d / dt) * .5; lastMove = now;
          }
          last = p;
        },
        up() {
          if (!dragging) return;
          dragging = false;
          if (performance.now() - lastMove > 80) vel = 0;
          vel = Math.max(-40, Math.min(40, vel));
        },
      });

      return () => {
        alive = false; hints.stop(); offDrag(); cancelAnimationFrame(raf);
        timers.forEach(clearTimeout); stopPlay();
        if (ac && noise) { rg.gain.setTargetAtTime(0, ac.currentTime, .05); tapeHiss.gain.setTargetAtTime(0, ac.currentTime, .05); setTimeout(() => { try { noise.stop(); } catch (e) {} }, 300); }
      };
    },
  };
})();
