// Mini-game "cipher": a page of the father's journal and a paper Caesar wheel.
// Alphabet: the full 33 Russian letters with Ё (as on a school cipher wheel), key shift 7.
(() => {
  const ABC = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ", N = ABC.length, KEY = 7, STEP = 2 * Math.PI / N;
  const STUB = "ключ под седьмой ступенью";
  const PENCIL = "#3a342a", FAINT = "#5b5244";

  const shiftChar = (ch, k) => {
    const up = ch.toUpperCase(), i = ABC.indexOf(up);
    if (i < 0) return ch;
    const c = ABC[((i + k) % N + N) % N];
    return ch === up ? c : c.toLowerCase();
  };
  const caesar = (s, k) => [...s].map(c => shiftChar(c, k)).join("");

  // seeded noise so pencil lines do not jitter between redraws
  const rng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const roughCircle = (cx, cy, r, rnd, j = 1.6) => {
    const n = 26, pts = [], a0 = rnd() * 6.28;
    for (let i = 0; i <= n + 1; i++) { const a = a0 + i / n * 6.28 * 1.02, rr = r + (rnd() - .5) * j * 2; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length - 1; i++) { const [x, y] = pts[i], [x2, y2] = pts[i + 1]; d += ` Q${x.toFixed(1)} ${y.toFixed(1)} ${((x + x2) / 2).toFixed(1)} ${((y + y2) / 2).toFixed(1)}`; }
    return d;
  };
  const roughLine = (x1, y1, x2, y2, rnd, j = 1.4) => {
    const mx = (x1 + x2) / 2 + (rnd() - .5) * j * 2, my = (y1 + y2) / 2 + (rnd() - .5) * j * 2;
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  const scribble = (x1, x2, y, rnd) => {
    let d = `M${x1} ${y}`;
    for (let x = x1; x < x2; x += 14) d += ` L${(x + 7).toFixed(1)} ${(y - 6 + rnd() * 3).toFixed(1)} L${(x + 14).toFixed(1)} ${(y + 5 + rnd() * 3).toFixed(1)}`;
    return d;
  };
  const wrap = (text, max) => {
    const out = []; let cur = "";
    for (const w of text.split(" ")) {
      if (cur && (cur + " " + w).length > max) { out.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
    }
    if (cur) out.push(cur);
    return out;
  };

  // journal text: first paragraph of journal_last, or a neutral stub until the script has it
  function sourceParas(ctx) {
    const d = ctx.story && ctx.story.docs && ctx.story.docs.journal_last;
    const clean = t => String(t).replace(/<[^>]+>/g, "").replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim();
    if (d && d.paras && d.paras.length) return d.paras.map(p => clean(ctx.fmt ? ctx.fmt(p) : p)).filter(Boolean);
    return [STUB];
  }

  MINIGAMES.cipher = {
    start(ctx) {
      MG.veil(ctx, .72);
      const fast = !!ctx.fast, rnd = rng(7071);
      const paras = sourceParas(ctx);
      const first = wrap(paras[0], 25)[0];
      const rest = wrap(paras.join(" "), 25).slice(1, 3);
      const plainLines = [first, ...rest];
      const paper = ctx.assetUrl("title/paper.jpg");
      const C = { x: 200, y: 414 }, RO = 178, RI = 132;   // wheel centre, outer and inner disc radii
      const READ = { x: 380, y: 250 };                       // the "читать" word, right of the wheel top

      // the svg keeps clear of the strip at the bottom where friends' hints appear
      const holder = document.createElement("div");
      holder.style.cssText = "position:absolute;left:0;right:0;top:0;bottom:18cqw";
      ctx.area.append(holder);
      const svg = MG.svg(holder, "0 0 400 600", `
        <defs>
          <clipPath id="cph-page"><path d="M10 8 L392 4 L389 214 L8 218 Z"/></clipPath>
          <clipPath id="cph-out"><circle cx="${C.x}" cy="${C.y}" r="${RO}"/></clipPath>
          <clipPath id="cph-in"><circle cx="${C.x}" cy="${C.y}" r="${RI}"/></clipPath>
          <radialGradient id="cph-sh"><stop offset=".8" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
        </defs>`);
      svg.style.userSelect = "none";
      const hand = (attrs, text, parent) => { const t = MG.el("text", { "font-family": "Caveat, 'Segoe Print', cursive", fill: PENCIL, ...attrs }, parent); t.textContent = text; return t; };
      const fit = (t, max) => { t.removeAttribute("textLength"); try { if (t.getComputedTextLength() > max) { t.setAttribute("textLength", max); t.setAttribute("lengthAdjust", "spacingAndGlyphs"); } } catch (e) {} };

      // ---------- the journal page ----------
      const page = MG.el("g", { transform: "rotate(-1.1 200 110)" }, svg);
      MG.el("path", { d: "M14 14 L398 10 L395 224 L12 228 Z", fill: "#000", opacity: .45 }, page);
      MG.el("image", { href: paper, x: 0, y: 0, width: 400, height: 222, preserveAspectRatio: "xMidYMid slice", "clip-path": "url(#cph-page)" }, page);
      const lines = MG.el("g", { filter: "url(#pencil)" }, page);
      MG.el("path", { d: roughLine(10, 8, 392, 4, rnd) + roughLine(392, 4, 389, 214, rnd) + roughLine(389, 214, 8, 218, rnd) + roughLine(8, 218, 10, 8, rnd), stroke: PENCIL, "stroke-width": 1.3, opacity: .55 }, lines);
      for (let y = 84; y <= 152; y += 34) MG.el("path", { d: roughLine(26, y + 8, 378, y + 6, rnd, .8), stroke: FAINT, "stroke-width": .8, opacity: .35 }, lines);
      MG.el("path", { d: roughLine(26, 170, 380, 167, rnd, .8), stroke: FAINT, "stroke-width": 1, opacity: .5, "stroke-dasharray": "6 5" }, lines);
      const ink = MG.el("g", {}, page);

      // older entries: the station number is underlined every time (the clue)
      const old = MG.el("g", { opacity: .62 }, ink);
      hand({ x: 26, y: 36, "font-size": 22 }, "…замер, ст.", old);
      hand({ x: 117, y: 36, "font-size": 25, fill: MG.SEVEN }, "7", old);
      MG.el("path", { d: roughLine(113, 42, 135, 41, rnd, .6) + roughLine(114, 45, 133, 45, rnd, .6), stroke: MG.SEVEN, "stroke-width": 1.4 }, old);
      hand({ x: 143, y: 36, "font-size": 22 }, "— норма.", old);
      hand({ x: 252, y: 40, "font-size": 22 }, "ст.", old);
      hand({ x: 281, y: 40, "font-size": 25, fill: MG.SEVEN }, "7", old);
      MG.el("path", { d: roughLine(277, 46, 298, 45, rnd, .6), stroke: MG.SEVEN, "stroke-width": 1.4 }, old);
      hand({ x: 303, y: 40, "font-size": 22 }, "— шум", old);

      // cipher lines (illegible strokes where the text runs out)
      const lineEls = [];
      for (let k = 0; k < 3; k++) {
        const y = 86 + k * 34;
        if (plainLines[k]) lineEls.push(hand({ x: 28, y, "font-size": 29, "font-weight": 700 }, caesar(plainLines[k], KEY), ink));
        else MG.el("path", { d: scribble(30, 30 + 200 + rnd() * 130, y - 8, rnd), stroke: PENCIL, "stroke-width": 1.5, opacity: .6, "stroke-linejoin": "round" }, lines);
      }

      // the margin: the first line read at the current shift
      const margin = MG.el("g", {}, page);
      hand({ x: 24, y: 199, "font-size": 22, fill: FAINT, opacity: .7 }, "→", margin);
      const guess = hand({ x: 48, y: 200, "font-size": 28, fill: FAINT }, "", margin);
      guess.style.transition = "opacity .35s ease";
      const strike = MG.el("path", { d: "", stroke: PENCIL, "stroke-width": 2, opacity: 0, "stroke-linecap": "round", "stroke-linejoin": "round" }, margin);
      strike.style.transition = "opacity .3s ease";
      const readBtn = MG.el("g", { opacity: .85 }, svg);
      hand({ x: READ.x, y: READ.y + 6, "font-size": 29, "font-weight": 700, "text-anchor": "end", fill: MG.INK }, "читать", readBtn);
      MG.el("path", { d: roughLine(READ.x - 74, READ.y + 13, READ.x + 2, READ.y + 11, rnd, .8), stroke: MG.INK, "stroke-width": 1.6 }, readBtn);

      // ---------- the wheel ----------
      MG.el("circle", { cx: C.x + 6, cy: C.y + 9, r: RO + 12, fill: "url(#cph-sh)" }, svg);
      MG.el("image", { href: paper, x: C.x - RO, y: C.y - RO, width: RO * 2, height: RO * 2, preserveAspectRatio: "xMidYMid slice", "clip-path": "url(#cph-out)" }, svg);
      const outerLines = MG.el("g", { filter: "url(#pencil)" }, svg), outer = MG.el("g", {}, svg);
      MG.el("path", { d: roughCircle(C.x, C.y, RO - 1, rnd), stroke: PENCIL, "stroke-width": 1.6, opacity: .8 }, outerLines);
      for (let j = 0; j < N; j++) {
        const a = j * 360 / N, b = (j + .5) * STEP - Math.PI / 2;
        hand({ x: C.x, y: C.y - RO + 31, "font-size": 26, "font-weight": 700, "text-anchor": "middle", transform: `rotate(${a} ${C.x} ${C.y})` }, ABC[j], outer);
        MG.el("path", { d: roughLine(C.x + Math.cos(b) * (RI + 4), C.y + Math.sin(b) * (RI + 4), C.x + Math.cos(b) * (RO - 6), C.y + Math.sin(b) * (RO - 6), rnd, .5), stroke: PENCIL, "stroke-width": .7, opacity: .45 }, outerLines);
      }
      // the inner disc turns; no filter on it, so turning stays cheap on phones
      const inner = MG.el("g", {}, svg);
      MG.el("circle", { cx: C.x + 3, cy: C.y + 5, r: RI + 4, fill: "#000", opacity: .2 }, inner);
      MG.el("image", { href: paper, x: C.x - RI, y: C.y - RI, width: RI * 2, height: RI * 2, preserveAspectRatio: "xMidYMid slice", "clip-path": "url(#cph-in)", transform: `rotate(90 ${C.x} ${C.y})` }, inner);
      MG.el("path", { d: roughCircle(C.x, C.y, RI, rnd), stroke: PENCIL, "stroke-width": 1.5, opacity: .85 }, inner);
      MG.el("path", { d: roughCircle(C.x, C.y, RI - 50, rnd, 1), stroke: PENCIL, "stroke-width": .8, opacity: .4 }, inner);
      for (let j = 0; j < N; j++) {
        const a = j * 360 / N, b = (j + .5) * STEP - Math.PI / 2;
        hand({ x: C.x, y: C.y - RI + 27, "font-size": 21, "font-weight": 500, "text-anchor": "middle", transform: `rotate(${a} ${C.x} ${C.y})` }, ABC[j], inner);
        MG.el("path", { d: roughLine(C.x + Math.cos(b) * (RI - 38), C.y + Math.sin(b) * (RI - 38), C.x + Math.cos(b) * (RI - 3), C.y + Math.sin(b) * (RI - 3), rnd, .4), stroke: PENCIL, "stroke-width": .6, opacity: .35 }, inner);
      }
      // a pencil arrow on the inner "А": shows how far the disc is turned
      MG.el("path", { d: `M${C.x - 7} ${C.y - RI + 9} L${C.x} ${C.y - RI - 4} L${C.x + 7} ${C.y - RI + 9}`, stroke: PENCIL, "stroke-width": 1.8, "stroke-linejoin": "round" }, inner);
      // grip marks so the disc reads as something to turn
      for (let j = 0; j < 3; j++) { const a = j * 2.094 + .5; MG.el("path", { d: roughLine(C.x + Math.cos(a) * 30, C.y + Math.sin(a) * 30, C.x + Math.cos(a) * 62, C.y + Math.sin(a) * 62, rnd, 1), stroke: PENCIL, "stroke-width": 1, opacity: .35 }, inner); }
      MG.el("circle", { cx: C.x, cy: C.y, r: 8, fill: "#8f8676", stroke: PENCIL, "stroke-width": 1.4 }, svg);
      MG.el("path", { d: `M${C.x - 4} ${C.y} L${C.x + 4} ${C.y} M${C.x} ${C.y - 4} L${C.x} ${C.y + 4}`, stroke: PENCIL, "stroke-width": 1 }, svg);

      // ---------- state ----------
      let rot = 0, shift = 0, busy = false, alive = true, raf = 0, snapRaf = 0;
      const timers = [];
      const later = (fn, ms) => { const t = setTimeout(() => { if (alive) fn(); }, fast ? Math.min(ms, 30) : ms); timers.push(t); return t; };
      const curShift = () => ((Math.round(rot / STEP) % N) + N) % N;

      const showGuess = () => {
        guess.style.opacity = 0;
        guess.textContent = caesar(caesar(first, KEY), -shift);
        fit(guess, 325);
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => { guess.style.opacity = .9; }); });
      };
      const render = () => {
        inner.setAttribute("transform", `rotate(${(rot * 180 / Math.PI).toFixed(2)} ${C.x} ${C.y})`);
        const s = curShift();
        if (s !== shift) {
          shift = s; showGuess();
          MG.click(ctx, .09, .018); ctx.vibrate && ctx.vibrate(4);
          if (s === KEY) hints.poke();
        }
      };
      lineEls.forEach(t => fit(t, 345));
      guess.textContent = caesar(caesar(first, KEY), 0); fit(guess, 325); guess.style.opacity = .9;

      const animateTo = (target, ms, then) => {
        cancelAnimationFrame(snapRaf);
        const from = rot, t0 = performance.now(), dur = fast ? 20 : ms;
        const step = now => {
          if (!alive) return;
          const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
          rot = from + (target - from) * e; render();
          if (k < 1) snapRaf = requestAnimationFrame(step); else then && then();
        };
        snapRaf = requestAnimationFrame(step);
      };

      // pencil scratch: a short band-passed noise burst
      const scratch = (dur = .5, level = .08) => {
        const ac = MG.ac(ctx); if (!ac) return;
        const len = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (.6 + .4 * Math.sin(i / ac.sampleRate * 40)) * Math.sin(Math.PI * i / len);
        const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
        f.type = "bandpass"; f.frequency.value = 3200; f.Q.value = .9; g.gain.value = level;
        s.buffer = b; s.connect(f); f.connect(g); g.connect(ctx.audio.fxBus); s.start();
      };

      const solve = () => {
        if (busy) return; busy = true; hints.stop();
        guess.style.opacity = 1; guess.setAttribute("fill", PENCIL);
        readBtn.style.transition = "opacity .5s"; readBtn.style.opacity = 0;
        // the page lines turn readable one after another, as if written over in pencil
        lineEls.forEach((t, k) => later(() => {
          t.style.transition = "opacity .35s ease"; t.style.opacity = 0; scratch(.45, .07);
          later(() => { t.textContent = plainLines[k]; t.setAttribute("font-weight", 500); fit(t, 345); t.style.opacity = 1; }, 380);
        }, 500 + k * 650));
        later(() => ctx.done("ok"), 900 + lineEls.length * 650 + 1400);
      };
      const wrong = () => {
        const w = Math.min(320, guess.getComputedTextLength ? guess.getComputedTextLength() : 260);
        strike.setAttribute("d", scribble(46, 52 + w, 191, rng(Math.random() * 1e9 | 0)));
        strike.style.opacity = .8; scratch(.3, .06); ctx.vibrate && ctx.vibrate(18);
        later(() => { strike.style.opacity = 0; }, 900);
      };
      const read = () => { if (busy) return; if (shift === KEY) solve(); else wrong(); };

      const hints = MG.hints(ctx, [
        ["tim", "Это шифр Цезаря. Сдвиг, вопрос только какой."],
        ["tim", "Он везде подчёркивал одну цифру."],
        ["tim", "Дай я. Семь. Конечно, семь."],
      ], () => {
        if (busy) return;
        let d = ((KEY - curShift()) % N + N) % N; if (d > N / 2) d -= N;
        busy = true;
        animateTo(Math.round(rot / STEP) * STEP + d * STEP, 1300 + Math.abs(d) * 60, () => later(() => { busy = false; solve(); }, 500));
      });

      // ---------- one gesture: turn the inner disc (a tap on the page reads it) ----------
      let mode = null, last = null, moved = 0;
      const offDrag = MG.drag(svg, svg, {
        down(ev, p) {
          if (busy) { mode = null; return; }
          const r = Math.hypot(p.x - C.x, p.y - C.y);
          mode = r < RO + 14 && p.y > 236 ? "wheel" : p.y < 236 || Math.hypot(p.x - READ.x + 36, p.y - READ.y) < 50 ? "page" : null;
          last = p; moved = 0; cancelAnimationFrame(snapRaf);
        },
        move(ev, p) {
          if (busy || !mode) return;
          moved += Math.hypot(p.x - last.x, p.y - last.y);
          if (mode === "wheel" && Math.hypot(p.x - C.x, p.y - C.y) > 22) { rot += MG.dAngle(C, last, p); render(); }
          last = p;
        },
        up(ev, p) {
          if (mode === "wheel" && !busy) animateTo(Math.round(rot / STEP) * STEP, 180);
          if (mode === "page" && moved < 24) read();
          mode = null;
        },
      });

      return () => {
        alive = false; hints.stop(); offDrag();
        cancelAnimationFrame(raf); cancelAnimationFrame(snapRaf);
        timers.forEach(clearTimeout);
      };
    },
  };
})();
