// tuner and hold: the hand-made receiver close up. A dial window with 1..9 (red 7), a needle, a lamp and a big knob.
// The player turns the knob by dragging around it; the needle follows with a little inertia.

const Receiver = {
  // rough pencil path through points, a bit of jitter so lines never look ruled
  rough(pts, j = 1.2) {
    let s = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) s += ` L${(pts[i][0] + (Math.random() - .5) * j).toFixed(1)} ${(pts[i][1] + (Math.random() - .5) * j).toFixed(1)}`;
    return s;
  },
  roughCircle(cx, cy, r, n = 36, j = 1.5) {
    const pts = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; pts.push([cx + Math.cos(a) * (r + (Math.random() - .5) * j), cy + Math.sin(a) * (r + (Math.random() - .5) * j)]); }
    return Receiver.rough(pts, 0);
  },

  // builds the drawing; big = station transmitter (larger scale, a toggle switch)
  build(ctx, { big = false } = {}) {
    MG.veil(ctx, .95, 14); ctx.box.classList.add("solidhint");
    const W = 400, H = 700;
    const svg = MG.svg(ctx.area, `0 0 ${W} ${H}`);
    svg.style.maxHeight = "100%";
    const R = Receiver, ink = MG.INK;
    const dx = big ? 18 : 40, dw = W - dx * 2, dy = big ? 150 : 175, dh = big ? 120 : 92;
    const xOf = n => dx + 26 + (n - 1) * (dw - 52) / 8;
    const bot = (big ? 500 : 480) + 92 + 64; // receiver body ends under the knob, above the hint line
    let s = `<g filter="url(#pencil)" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round">`;
    // receiver body
    s += `<path d="${R.rough([[dx - 14, dy - 50], [W - dx + 14, dy - 54], [W - dx + 18, bot - 4], [dx - 18, bot], [dx - 14, dy - 50]], 3)}" stroke-width="2.2" opacity=".55"/>`;
    s += `<path d="${R.rough([[dx - 6, dy - 42], [W - dx + 8, dy - 45]], 2)}" stroke-width="1" opacity=".3"/>`;
    // dial window
    s += `<path d="${R.rough([[dx, dy], [dx + dw, dy - 1], [dx + dw + 1, dy + dh], [dx - 1, dy + dh + 1], [dx, dy]], 1.6)}" stroke-width="2.4"/>`;
    for (let k = 0; k <= 80; k++) {
      const x = dx + 26 + k * (dw - 52) / 80, major = k % 10 === 0;
      s += `<path d="M${x.toFixed(1)} ${dy + dh - 8} L${(x + (Math.random() - .5)).toFixed(1)} ${dy + dh - (major ? 30 : k % 5 === 0 ? 20 : 14)}" stroke-width="${major ? 1.8 : 1}" opacity="${major ? .9 : .55}"/>`;
    }
    s += `</g>`;
    for (let n = 1; n <= 9; n++) s += `<text x="${xOf(n)}" y="${dy + (big ? 52 : 42)}" text-anchor="middle" font-family="Caveat, cursive" font-weight="700" font-size="${(n === 7 ? 34 : 28) * (big ? 1.25 : 1)}" fill="${n === 7 ? MG.SEVEN : ink}"${n === 7 ? ' id="seven"' : ""} opacity="${n === 7 ? 1 : .85}">${n}</text>`;
    // lamp
    const lx = W - dx - 18, ly = dy - 26;
    s += `<defs><radialGradient id="lampGlow"><stop offset="0" stop-color="#fff6dc" stop-opacity=".95"/><stop offset=".35" stop-color="#ffe2a8" stop-opacity=".5"/><stop offset="1" stop-color="#ffe2a8" stop-opacity="0"/></radialGradient></defs>`;
    s += `<circle id="glow" cx="${lx}" cy="${ly}" r="46" fill="url(#lampGlow)" opacity="0"/>`;
    s += `<path d="${R.roughCircle(lx, ly, 9, 20, 1)}" stroke="${ink}" stroke-width="1.8" filter="url(#pencil)"/>`;
    // toggle switch on the station transmitter
    if (big) s += `<g filter="url(#pencil)" stroke="${ink}" stroke-width="2" stroke-linecap="round"><path d="${R.rough([[dx + 6, dy - 38], [dx + 46, dy - 38], [dx + 46, dy - 12], [dx + 6, dy - 12], [dx + 6, dy - 38]], 1)}"/><path id="tog" d="M26 -25 L40 -36" transform="translate(${dx} ${dy})"/></g>`;
    // needle
    s += `<g id="needle" filter="url(#pencil)"><path d="M0 ${dy + 6} L0 ${dy + dh - 4}" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/><path d="M3 ${dy + 10} L3 ${dy + dh - 6}" stroke="${ink}" stroke-width="1.2" opacity=".25"/></g>`;
    // knob
    const kx = W / 2, ky = big ? 500 : 480, kr = 92;
    s += `<g id="knob" filter="url(#pencil)" stroke="${ink}" stroke-linecap="round">`;
    s += `<path d="${R.roughCircle(kx, ky, kr, 48, 2)}" stroke-width="2.6"/><path d="${R.roughCircle(kx, ky, kr - 16, 40, 2)}" stroke-width="1.2" opacity=".5"/>`;
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; s += `<path d="M${kx + Math.cos(a) * (kr - 2)} ${ky + Math.sin(a) * (kr - 2)} L${kx + Math.cos(a) * (kr - 12)} ${ky + Math.sin(a) * (kr - 12)}" stroke-width="1.4" opacity=".7"/>`; }
    s += `<path d="M${kx} ${ky - kr + 22} L${kx} ${ky - 30}" stroke-width="3.2"/>`;
    s += `</g>`;
    // a hint of the turning gesture
    s += `<path id="arc" d="M${kx - kr - 22} ${ky + 30} A ${kr + 26} ${kr + 26} 0 0 1 ${kx - 40} ${ky - kr - 22}" stroke="${ink}" stroke-width="1.6" stroke-dasharray="4 7" opacity=".45" filter="url(#pencil)"/>`;
    s += `<path d="M${kx - 48} ${ky - kr - 30} L${kx - 38} ${ky - kr - 22} L${kx - 50} ${ky - kr - 13}" stroke="${ink}" stroke-width="1.6" opacity=".45" stroke-linecap="round"/>`;
    s += `<text id="howto" x="${kx}" y="${ky + kr + 42}" text-anchor="middle" font-family="Caveat, cursive" font-size="24" fill="${ink}" opacity=".7">крути ручку по кругу</text>`;
    // red thread (hold): from the receiver up into the fog
    s += `<path id="thread" d="" stroke="${MG.SEVEN}" stroke-width="2" stroke-linecap="round" fill="none" opacity="0"/>`;
    svg.innerHTML = s;
    // crop the drawing to the receiver itself, so it scales as large as the room above the hint line allows
    const top = dy - (big ? 70 : 75); svg.setAttribute("viewBox", `0 ${top} ${W} ${bot + 14 - top}`); svg.style.overflow = "visible"; // the hold thread runs on up above the receiver
    const q = sel => svg.querySelector(sel);
    const rec = {
      svg, xOf, dy, dh, kx, ky, kr, lamp: [lx, ly],
      needle: q("#needle"), knob: q("#knob"), glow: q("#glow"), arc: q("#arc"), howto: q("#howto"), thread: q("#thread"), tog: q("#tog"),
      setNeedle(f, shake = 0) { const x = xOf(Math.max(.6, Math.min(9.4, f))) + (Math.random() - .5) * shake; this.needle.setAttribute("transform", `translate(${x.toFixed(2)} 0)`); },
      setKnob(a) { this.knob.setAttribute("transform", `rotate(${(a * 180 / Math.PI).toFixed(2)} ${kx} ${ky})`); },
      setLamp(v) { this.glow.setAttribute("opacity", (Math.max(0, Math.min(1, v)) * .95).toFixed(3)); },
    };
    return rec;
  },

  // knob control with inertia: returns { get f(), set f(v), stop() }; onTurn() called on every drag move
  control(ctx, rec, start, onTurn) {
    let goal = start, f = start, ang = 0, last = null, raf;
    const perRad = 1 / (Math.PI * 2 / 3); // a third of a turn moves one number
    const off = MG.drag(rec.svg, rec.svg, {
      down: (ev, p) => { last = p; for (const e of [rec.arc, rec.howto]) { e.style.transition = "opacity .6s"; e.style.opacity = 0; } },
      move: (ev, p) => {
        const d = MG.dAngle({ x: rec.kx, y: rec.ky }, last, p); last = p;
        ang += d; goal = Math.max(.6, Math.min(9.4, goal + d * perRad)); rec.setKnob(ang);
        if (Math.abs(d) > .02 && Math.random() < .3) MG.click(ctx, .05, .015);
        onTurn && onTurn(d);
      },
      up: () => { last = null; },
    });
    const api = {
      get f() { return f; }, set f(v) { f = v; }, get goal() { return goal; }, set goal(v) { goal = v; },
      nudge(dv) { goal = Math.max(.6, Math.min(9.4, goal + dv)); },
      tick(dt) { f += (goal - f) * Math.min(1, dt * 7); return f; },
      stop() { off(); cancelAnimationFrame(raf); },
    };
    return api;
  },
};

MINIGAMES.tuner = {
  start(ctx) {
    const target = +ctx.params.target || 7, station = ctx.params.mode === "station";
    const rec = Receiver.build(ctx, { big: station });
    const voice = MG.radioVoice(ctx);
    if (station && rec.tog) { setTimeout(() => { rec.tog.setAttribute("d", "M26 -25 L12 -36"); MG.click(ctx, .4, .06); ctx.vibrate(20); }, 600); }
    let best = 99, held = 0, finished = false, raf, prev = performance.now();
    const ctl = Receiver.control(ctx, rec, target > 4 ? 2.2 : 8.2);
    const lines = station
      ? [["tim", "Тут шкала другая, но семёрка та же."], ["tim", "dir"], ["tim", "Дай я."]]
      : [["tim", "Медленнее. Там что-то есть, около семи."], ["tim", "dir"], ["tim", "Дай я."]];
    const hint = MG.hints({ ...ctx, hint: (who, text) => ctx.hint(who, text === "dir" ? dirHint() : text) }, lines, () => auto());
    function dirHint() {
      const d = target - ctl.f;
      if (Math.abs(d) > 1.2) return d > 0 ? "Крути вправо. Медленно, до семёрки." : "Перекрутил. Назад, влево.";
      return d > 0 ? "Ещё чуть вправо… стоп." : "Ещё чуть влево… стоп.";
    }
    let autoOn = false;
    function auto() { autoOn = true; }
    function loop(now) {
      const dt = Math.min(.05, (now - prev) / 1000); prev = now;
      if (autoOn) ctl.goal = ctl.goal + (target - ctl.goal) * Math.min(1, dt * 2.5);
      const f = ctl.tick(dt), dist = Math.abs(f - target);
      const near = Math.max(0, 1 - dist / 1.6);
      voice.set(dist < .15 ? 1 : near * near * .8);
      rec.setLamp(.15 + near * .85);
      rec.setNeedle(f, near > .5 ? (1 - dist) * 2.4 : 0);
      if (dist < best - .3) { best = dist; hint.poke(); }
      if (dist <= .15) { held += dt; if (held > (ctx.fast ? .1 : 1.5)) return win(); } else held = Math.max(0, held - dt * 2);
      raf = requestAnimationFrame(loop);
    }
    function win() {
      if (finished) return; finished = true;
      hint.stop(); rec.setLamp(1); ctx.vibrate(30);
      setTimeout(() => ctx.done("ok"), ctx.fast ? 10 : 900);
    }
    raf = requestAnimationFrame(loop);
    return () => { finished = true; cancelAnimationFrame(raf); ctl.stop(); hint.stop(); voice.stop(); };
  },
};

MINIGAMES.hold = {
  skip: "ok", // no failing by dexterity: the story decides what happens next
  start(ctx) {
    const target = 7, rec = Receiver.build(ctx);
    const voice = MG.radioVoice(ctx);
    const total = ctx.fast ? 1.5 : 46;
    let t = 0, farFor = 0, drift = 0, finished = false, raf, prev = performance.now(), jerk = 0, said = {}, helping = 0, helps = 0;
    const ctl = Receiver.control(ctx, rec, target, d => { jerk = jerk * .8 + Math.abs(d) * .2; });
    // the red thread is there only when the hero carries the kurgod (kurgod=1)
    const thread = String((ctx.params || {}).kurgod ?? "0") === "1";
    rec.thread.setAttribute("opacity", thread ? 1 : 0);
    // one red object per frame: with the thread on, the 7 goes graphite
    if (thread) { const seven = rec.svg.querySelector("#seven"); if (seven) seven.setAttribute("fill", MG.INK); }
    // a friend's hand that settles on the knob when the needle has been lost for too long
    const hand = MG.el("path", { d: Receiver.rough([[rec.kx + 70, rec.ky + 150], [rec.kx + 40, rec.ky + 60], [rec.kx + 10, rec.ky + 20], [rec.kx - 30, rec.ky - 10], [rec.kx - 52, rec.ky - 40], [rec.kx - 40, rec.ky - 52], [rec.kx - 10, rec.ky - 34], [rec.kx + 20, rec.ky - 40], [rec.kx + 46, rec.ky - 30], [rec.kx + 60, rec.ky - 8], [rec.kx + 80, rec.ky + 40], [rec.kx + 120, rec.ky + 150]], 2), stroke: MG.INK, "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round", filter: "url(#pencil)", opacity: 0 }, rec.svg);
    hand.style.transition = "opacity .8s ease";
    const say = (k, who, text) => { if (!said[k]) { said[k] = 1; ctx.hint(who, text); } };
    function loop(now) {
      const dt = Math.min(.05, (now - prev) / 1000); prev = now;
      if (ctx.paused && ctx.paused()) { raf = requestAnimationFrame(loop); return; }
      t += dt;
      // the needle wanders away from 7, slowly at first, then faster, always smooth
      const k = t / total;
      drift += ((Math.sin(t * .37) + Math.sin(t * .83 + 1.7) * .6 + Math.sin(t * 1.9 + .4) * .25) * (.18 + k * .55) - drift) * Math.min(1, dt * 1.5);
      if (helping > 0) { helping -= dt; ctl.goal += (target - ctl.goal) * Math.min(1, dt * 2.2); if (helping <= 0) hand.setAttribute("opacity", 0); }
      else ctl.nudge(drift * dt);
      const f = ctl.tick(dt), dist = Math.abs(f - target);
      farFor = dist > 1 ? farFor + dt : 0;
      if (farFor > 3 && helping <= 0) {
        helping = 2.4; farFor = 0; helps++; hand.setAttribute("opacity", .85); ctx.vibrate(15);
        say("help" + Math.min(helps, 2), null, helps % 2 ? "_Чья-то тёплая ладонь ложится поверх твоей и мягко возвращает ручку._" : "_Снова та же ладонь. Вот так. Держи._");
      }
      const good = Math.max(0, 1 - dist / 1.2);
      voice.set(good);
      rec.setNeedle(f, 0); rec.setLamp(.2 + good * .8);
      ctx.box.style.background = `rgba(${Math.round(8 + (1 - good) * 120)},${Math.round(7 + (1 - good) * 115)},${Math.round(5 + (1 - good) * 105)},${(.95 - (1 - good) * .12).toFixed(3)})`;
      // the thread: from the lamp to the top of the screen, thinner and shakier when the needle strays
      // (almost straight up: between the title and the pause button)
      const [lx, ly] = rec.lamp, pts = [];
      for (let i = 0; i <= 24; i++) { const y = ly - 8 - i / 24 * (ly + 60); pts.push(`${(lx + i * .3 + Math.sin(t * 3 + i * .7) * (2 + (1 - good) * 10) * i / 24).toFixed(1)} ${y.toFixed(1)}`); }
      rec.thread.setAttribute("d", "M" + pts.join(" L"));
      rec.thread.setAttribute("stroke-width", (.6 + good * 2).toFixed(2));
      rec.thread.setAttribute("opacity", thread ? (.35 + good * .65).toFixed(2) : 0);
      if (jerk > .08 && t > 4) say("jerk", "tim", "Не дёргай. Мягко. Как я учил.");
      if (t > total * .45) say("leva", "leva", "Вера, иди на голос!");
      if (t >= total) return end();
      raf = requestAnimationFrame(loop);
    }
    function end() {
      if (finished) return; finished = true;
      rec.setLamp(1); ctx.vibrate(30);
      setTimeout(() => ctx.done("ok"), ctx.fast ? 10 : 1400);
    }
    raf = requestAnimationFrame(loop);
    return () => { finished = true; cancelAnimationFrame(raf); ctl.stop(); voice.stop(); };
  },
};
