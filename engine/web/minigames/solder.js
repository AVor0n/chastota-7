// solder: repair Tim's drowned receiver. One gesture, "drag and hold": lamp into the socket, two wires onto their pads.
(() => {
  // seeded noise so the pencil wobble is stable between redraws
  const rng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const f = n => n.toFixed(2);
  // a hand-drawn line: slightly bowed, ends overshoot a little
  const line = (r, x1, y1, x2, y2, j = .5) => {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, o = (r() - .5) * .06 * L / L;
    const mx = (x1 + x2) / 2 + (r() - .5) * j - dy * o, my = (y1 + y2) / 2 + (r() - .5) * j + dx * o;
    const ov = .6 + r() * .6;
    return `M${f(x1 - dx / L * ov * r())} ${f(y1 - dy / L * ov * r())}Q${f(mx)} ${f(my)} ${f(x2 + dx / L * ov * r())} ${f(y2 + dy / L * ov * r())}`;
  };
  // a hand-drawn circle that does not quite close
  const circ = (r, cx, cy, rad, j = .06) => {
    const n = 14, a0 = r() * 6.28; let d = "";
    for (let i = 0; i <= n + 1; i++) {
      const a = a0 + i / n * 6.28, k = rad * (1 + (r() - .5) * j);
      d += (i ? "L" : "M") + f(cx + Math.cos(a) * k) + " " + f(cy + Math.sin(a) * k);
    }
    return d;
  };
  const poly = (r, pts, close) => pts.map((p, i) => i ? line(r, pts[i - 1][0], pts[i - 1][1], p[0], p[1]) : "").join("") + (close ? line(r, pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1]) : "");
  // a radio valve seen from the side, base at (x, y): glass bulb with a tip, anode inside, base with pins
  const valve = (r, x, y, s = 1) => {
    const w = 3.2 * s, h = 9 * s, j = () => (r() - .5) * .3;
    return `M${f(x - w)} ${f(y)}L${f(x - w + j())} ${f(y - h * .62)}Q${f(x - w)} ${f(y - h)} ${f(x + j())} ${f(y - h + j())}Q${f(x + w)} ${f(y - h)} ${f(x + w + j())} ${f(y - h * .62)}L${f(x + w)} ${f(y)}Z` +
      `M${f(x - .5 * s)} ${f(y - h)}l${f(.2 * s)} ${f(-.9 * s)}h${f(.6 * s)}l${f(.2 * s)} ${f(.9 * s)}` +
      `M${f(x - w * .45)} ${f(y - h * .2)}L${f(x - w * .45)} ${f(y - h * .66)}L${f(x + w * .45)} ${f(y - h * .66)}L${f(x + w * .45)} ${f(y - h * .2)}` +
      `M${f(x - w * .2)} ${f(y - h * .72)}V${f(y - h * .15)}M${f(x + w * .2)} ${f(y - h * .72)}V${f(y - h * .15)}` +
      `M${f(x - w - .5)} ${f(y)}h${f(2 * w + 1)}v${f(1.8 * s)}h${f(-2 * w - 1)}Z` +
      `M${f(x - w * .6)} ${f(y + 1.8 * s)}v${f(1.2 * s)}M${f(x)} ${f(y + 1.8 * s)}v${f(1.2 * s)}M${f(x + w * .6)} ${f(y + 1.8 * s)}v${f(1.2 * s)}`;
  };

  MINIGAMES.solder = {
    start(ctx) {
      const r = rng(77), fast = ctx.fast;
      const HOLD = fast ? 200 : 2000;
      MG.veil(ctx, .62);
      ctx.area.style.touchAction = "none";
      const G = MG.GRAPHITE, INK = MG.INK, HOT = "#f4dc8c";  // red is kept for the 7 and Vera only: the hot tip is white-yellow

      // geometry (viewBox 100 x 180)
      const SOCK = { x: 34, y: 42 };
      const pads = [
        { id: "3", x: 20, y: 80 }, { id: "7", x: 40, y: 80 }, { id: "+", x: 60, y: 80 }, { id: "gnd", x: 80, y: 80 },
      ];
      const wires = [
        { id: "red", tag: "красн.", target: "7", ax: 9, ay: 56, rest: { x: 22, y: 64 }, done: false },
        { id: "blue", tag: "син.", target: "gnd", ax: 91, ay: 60, rest: { x: 74, y: 66 }, done: false },
      ];
      const IRON_TIP = { x: 66, y: 120 };

      const svg = MG.svg(ctx.area, "0 0 100 180", `
        <defs>
          <clipPath id="sdBoxClip"><path d="M9 12 L91 11 L92 98 L8 99 Z"/></clipPath>
          <radialGradient id="sdGlow"><stop offset="0" stop-color="#fff6dc" stop-opacity=".85"/><stop offset=".45" stop-color="#f3e6c4" stop-opacity=".35"/><stop offset="1" stop-color="#f3e6c4" stop-opacity="0"/></radialGradient>
          <radialGradient id="sdTip"><stop offset="0" stop-color="#fffbe8" stop-opacity=".95"/><stop offset=".35" stop-color="${HOT}" stop-opacity=".6"/><stop offset="1" stop-color="${HOT}" stop-opacity="0"/></radialGradient>
          <filter id="sdBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.2"/></filter>
        </defs>`);
      svg.style.maxHeight = "100%";
      const g = (attrs = {}, parent = svg) => MG.el("g", attrs, parent);
      const path = (d, attrs = {}, parent = svg) => MG.el("path", { d, "stroke-linecap": "round", "stroke-linejoin": "round", ...attrs }, parent);
      const text = (x, y, s, attrs = {}, parent = svg) => { const t = MG.el("text", { x, y, "text-anchor": "middle", "font-family": "Caveat, cursive", "font-weight": 700, ...attrs }, parent); t.textContent = s; return t; };

      // ---- the candy box: paper bottom, graphite schematic ----
      const box = g({ filter: "url(#pencil)" });
      const paper = g({ "clip-path": "url(#sdBoxClip)" }, box);
      MG.el("image", { href: ctx.assetUrl("title/paper.jpg"), x: 0, y: 0, width: 100, height: 110, preserveAspectRatio: "xMidYMid slice" }, paper);
      MG.el("rect", { x: 0, y: 0, width: 100, height: 110, fill: "rgba(40,30,15,.12)" }, paper);
      // inner shadow of the walls
      path("M9 12 L91 11 L92 98 L8 99 Z", { stroke: "rgba(30,24,15,.35)", "stroke-width": 3 }, paper);
      // box walls (light pencil on the dark table)
      path(poly(r, [[4, 6], [96, 5], [97, 103], [3, 104]], true), { stroke: INK, "stroke-width": .55, opacity: .85 }, box);
      path(poly(r, [[9, 12], [91, 11], [92, 98], [8, 99]], true), { stroke: INK, "stroke-width": .4, opacity: .7 }, box);
      path(line(r, 4, 6, 9, 12) + line(r, 96, 5, 91, 11) + line(r, 97, 103, 92, 98) + line(r, 3, 104, 8, 99), { stroke: INK, "stroke-width": .35, opacity: .6 }, box);
      text(50, 108.5, "Ласточка", { fill: INK, "font-size": 4.2, opacity: .45, "font-weight": 500 });

      const sch = g({ stroke: G, "stroke-width": .45, opacity: .92 }, box);
      // traces
      path(line(r, SOCK.x + 9, SOCK.y, 56, SOCK.y) + line(r, 56, SOCK.y, 56, 30) + line(r, 56, 30, 62, 30) +
        line(r, SOCK.x, SOCK.y + 9, SOCK.x, 62) + line(r, SOCK.x, 62, 40, 62) + line(r, 40, 62, 40, 76) +
        line(r, 20, 76, 20, 68) + line(r, 20, 68, 26, 68) + line(r, 60, 76, 60, 68) + line(r, 60, 68, 70, 68) + line(r, 70, 68, 70, 50) +
        line(r, 80, 76, 80, 72) + line(r, 14, 22, 26, 22) + line(r, 14, 22, 14, 40) + line(r, 14, 40, SOCK.x - 9, SOCK.y), {}, sch);
      // resistor zigzag and capacitor
      path(`M26 68l1.4 -2 2 4 2 -4 2 4 2 -4 1.4 2`, { "stroke-width": .4 }, sch);
      path(line(r, 37, 68, 40, 68) + line(r, 66, 50, 74, 50) + line(r, 66, 52.4, 74, 52.4) + line(r, 70, 52.4, 70, 56), {}, sch);
      path(line(r, 26, 19, 26, 25) + line(r, 28.4, 17, 28.4, 27) + line(r, 28.4, 22, 34, 22), {}, sch);
      // dial: half circle scale with ticks
      const dial = g({}, svg);
      const DC = { x: 74, y: 34 };
      const glow = MG.el("circle", { cx: DC.x, cy: DC.y - 3, r: 20, fill: "url(#sdGlow)", opacity: 0 }, dial);
      path(`M${DC.x - 14} ${DC.y}A14 14 0 0 1 ${DC.x + 14} ${DC.y}` + line(r, DC.x - 15, DC.y + .4, DC.x + 15, DC.y - .3), { stroke: G, "stroke-width": .5, filter: "url(#pencil)" }, dial);
      for (let i = 1; i <= 9; i++) {
        const a = Math.PI + i / 10 * Math.PI, c = Math.cos(a), s = Math.sin(a);
        path(line(r, DC.x + c * 11.5, DC.y + s * 11.5, DC.x + c * 13.6, DC.y + s * 13.6, .1), { stroke: G, "stroke-width": .35 }, dial);
        text(DC.x + c * 9.2, DC.y + s * 9.2 + 1.1, String(i), { fill: G, "font-size": 3.2, "font-weight": 500, opacity: .8 }, dial);
      }
      const needle = path(line(r, DC.x, DC.y, DC.x - 12, DC.y - 2, .1), { stroke: G, "stroke-width": .5 }, dial);
      needle.style.transformOrigin = `${DC.x}px ${DC.y}px`; needle.style.transformBox = "view-box";
      MG.el("circle", { cx: DC.x, cy: DC.y, r: .9, fill: G }, dial);

      // socket: ring of pin holes
      const sock = g({}, svg);
      const sockHi = MG.el("circle", { cx: SOCK.x, cy: SOCK.y, r: 10.5, stroke: G, "stroke-width": .5, "stroke-dasharray": "1.4 1.6", opacity: 0 }, sock);
      path(circ(r, SOCK.x, SOCK.y, 7.5) + circ(r, SOCK.x, SOCK.y, 8.2, .1), { stroke: G, "stroke-width": .45, filter: "url(#pencil)" }, sock);
      for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28 - 1.57; MG.el("circle", { cx: f(SOCK.x + Math.cos(a) * 4.6), cy: f(SOCK.y + Math.sin(a) * 4.6), r: .75, stroke: G, "stroke-width": .3 }, sock); }
      path(line(r, SOCK.x - 1.8, SOCK.y, SOCK.x + 1.8, SOCK.y, .1), { stroke: G, "stroke-width": .3, opacity: .6 }, sock);

      // pads with their pencil labels
      const padG = g({}, svg);
      for (const p of pads) {
        p.hi = MG.el("circle", { cx: p.x, cy: p.y, r: 4.6, stroke: G, "stroke-width": .45, "stroke-dasharray": "1 1.3", opacity: 0 }, padG);
        path(circ(r, p.x, p.y, 2) + `M${p.x - .7} ${p.y}a.7 .7 0 1 0 1.4 0a.7 .7 0 1 0 -1.4 0`, { stroke: G, "stroke-width": .45 }, padG);
        if (p.id === "gnd") path(line(r, p.x, p.y + 2.4, p.x, p.y + 4.6, .1) + line(r, p.x - 3, p.y + 4.6, p.x + 3, p.y + 4.6, .1) + line(r, p.x - 2, p.y + 6, p.x + 2, p.y + 6, .1) + line(r, p.x - 1, p.y + 7.3, p.x + 1, p.y + 7.3, .1), { stroke: G, "stroke-width": .4 }, padG);
        else text(p.x, p.y + 7.6, p.id, { fill: G, "font-size": 5.4 }, padG);
      }
      // the seven gets the same circle Dad drew around it everywhere
      path(circ(r, 40, 85.6, 3.6, .2), { stroke: G, "stroke-width": .3, opacity: .7 }, padG);

      // ---- the one live valve, taken off the station transmitter, on a folded rag ----
      const LAMP = { x: 26, y: 140 };
      const spare = g({ stroke: INK, "stroke-width": .45, filter: "url(#pencil)" });
      path(poly(r, [[8, 141], [42, 139.5], [46, 146], [12, 148.5]], true) + line(r, 14, 144, 40, 142.4, .4) + line(r, 10, 145.6, 22, 147, .3), { opacity: .45, "stroke-width": .35 }, spare);
      const lampEl = g({}, spare);
      path(valve(rng(31), LAMP.x, LAMP.y, 1.5), { stroke: INK, "stroke-width": .42, fill: "rgba(233,225,210,.1)" }, lampEl);
      path(`M${LAMP.x - 2.6} ${LAMP.y - 9}Q${LAMP.x - 2.6} ${LAMP.y - 11.6} ${LAMP.x - 1} ${LAMP.y - 12.4}`, { stroke: INK, "stroke-width": .35, opacity: .7 }, lampEl);
      text(LAMP.x + 13, LAMP.y - 10, "6Ж1П", { fill: INK, "font-size": 4, opacity: .5 });

      // ---- soldering iron: its tip glows white-yellow ----
      const iron = g({ filter: "url(#pencil)" });
      const tipGlow = MG.el("circle", { cx: IRON_TIP.x, cy: IRON_TIP.y, r: 3.4, fill: "url(#sdTip)" }, iron);
      path(line(r, IRON_TIP.x, IRON_TIP.y, IRON_TIP.x + 5, IRON_TIP.y + 6, .1), { stroke: HOT, "stroke-width": .9 }, iron);
      path(line(r, IRON_TIP.x + 5, IRON_TIP.y + 6, IRON_TIP.x + 12, IRON_TIP.y + 15, .2) + line(r, IRON_TIP.x + 6.2, IRON_TIP.y + 5.2, IRON_TIP.x + 13.2, IRON_TIP.y + 14.2, .2), { stroke: INK, "stroke-width": .42 }, iron);
      path(poly(r, [[IRON_TIP.x + 11, IRON_TIP.y + 15.8], [IRON_TIP.x + 14.2, IRON_TIP.y + 13.2], [IRON_TIP.x + 27, IRON_TIP.y + 30], [IRON_TIP.x + 23.4, IRON_TIP.y + 33]], true), { stroke: INK, "stroke-width": .5, fill: "rgba(8,7,5,.4)" }, iron);
      for (let k = 0; k < 4; k++) path(line(r, IRON_TIP.x + 14 + k * 3, IRON_TIP.y + 18.6 + k * 3.9, IRON_TIP.x + 16.6 + k * 3, IRON_TIP.y + 16.4 + k * 3.9, .1), { stroke: INK, "stroke-width": .3, opacity: .6 }, iron);
      // stand
      path(line(r, IRON_TIP.x + 4, IRON_TIP.y + 12, IRON_TIP.x + 10, IRON_TIP.y + 22, .2) + line(r, IRON_TIP.x + 3, IRON_TIP.y + 22.5, IRON_TIP.x + 15, IRON_TIP.y + 22, .2), { stroke: INK, "stroke-width": .35, opacity: .6 }, svg);
      svg.append(iron);
      const smoke = g({ stroke: INK, "stroke-width": .35, opacity: 0 });
      path("M0 0c-1.4 -2 1.4 -3.4 0 -5.6s1.2 -3 0 -5", {}, smoke);
      path("M1.6 -1c-1 -2 1.2 -3 .2 -4.6", { opacity: .6 }, smoke);

      // ---- wires: anchored at the box wall, loose end is dragged ----
      const wireLayer = g({});
      for (const w of wires) {
        w.end = { ...w.rest };
        w.p = path("", { stroke: G, "stroke-width": 1.2, opacity: .9 }, wireLayer);
        w.p2 = path("", { stroke: "#5a5244", "stroke-width": .45, opacity: .9 }, wireLayer);
        w.tip = g({}, wireLayer);
        path("M-1.2 0h2.4", { stroke: G, "stroke-width": 1.4 }, w.tip);
        path("M1.2 0h1.6", { stroke: "#8b8172", "stroke-width": .5 }, w.tip);
        w.blob = MG.el("circle", { cx: 0, cy: 0, r: 0, fill: "#9a958c", stroke: G, "stroke-width": .3 }, w.tip);
        w.label = text(0, -3, w.tag, { fill: G, "font-size": 4 }, w.tip);
        w.hit = MG.el("circle", { cx: 0, cy: 0, r: 8, fill: "transparent" }, w.tip);
        w.hit.style.cursor = "grab";
      }
      const drawWire = w => {
        const { ax, ay } = w, e = w.end, mx = (ax + e.x) / 2, my = Math.max(ay, e.y) + 6 - Math.min(5, Math.abs(e.x - ax) * .05);
        const d = `M${ax} ${ay}Q${f(mx)} ${f(my)} ${f(e.x - 1.2)} ${f(e.y)}`;
        w.p.setAttribute("d", d); w.p2.setAttribute("d", d);
        const ang = Math.atan2(e.y - my, e.x - mx) * 180 / Math.PI;
        w.tip.setAttribute("transform", `translate(${f(e.x)} ${f(e.y)}) rotate(${f(ang)})`);
        w.label.setAttribute("transform", `rotate(${f(-ang)})`);
      };
      wires.forEach(drawWire);

      // lamp being carried / seated
      const carried = path("", { stroke: G, "stroke-width": .5, fill: "rgba(236,228,211,.82)", opacity: 0 });
      const seated = g({ opacity: 0 });
      const seatedGlow = MG.el("circle", { cx: SOCK.x, cy: SOCK.y, r: 10, fill: "url(#sdGlow)", opacity: 0 }, seated);
      path(circ(r, SOCK.x, SOCK.y, 6.2, .05), { stroke: G, "stroke-width": .5, fill: "rgba(236,228,211,.8)", filter: "url(#pencil)" }, seated);
      path(circ(r, SOCK.x, SOCK.y, 3, .08) + `M${SOCK.x - .8} ${SOCK.y - .6}l1.6 1.2M${SOCK.x + .8} ${SOCK.y - .6}l-1.6 1.2`, { stroke: G, "stroke-width": .3, opacity: .75 }, seated);
      path(`M${SOCK.x - 4.4} ${SOCK.y - 1.6}Q${SOCK.x - 3.6} ${SOCK.y - 4} ${SOCK.x - 1.2} ${SOCK.y - 4.6}`, { stroke: "#fffaf0", "stroke-width": .6, opacity: .8 }, seated);
      const sparks = g({});

      // ---------- state ----------
      let lampIn = false, finished = false, busy = false, raf = 0;
      const timers = new Set();
      const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, fast ? Math.min(ms, 40) : ms); timers.add(t); return t; };
      const ironAt = { x: IRON_TIP.x, y: IRON_TIP.y };
      let ironGoal = { ...ironAt };
      let last = performance.now();
      const tick = now => {
        const k = 1 - Math.exp(-Math.min(200, now - last) / 70); last = now;
        ironAt.x += (ironGoal.x - ironAt.x) * k; ironAt.y += (ironGoal.y - ironAt.y) * k;
        iron.setAttribute("transform", `translate(${f(ironAt.x - IRON_TIP.x)} ${f(ironAt.y - IRON_TIP.y)})`);
        tipGlow.setAttribute("opacity", f(.75 + .25 * Math.sin(now / 260)));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      const spark = (x, y) => {
        MG.click(ctx, .45, .06); setTimeout(() => MG.click(ctx, .2, .03), 60); ctx.vibrate(30);
        const s = g({ stroke: G, "stroke-width": .4, transform: `translate(${x} ${y})` }, sparks);
        let d = ""; for (let i = 0; i < 7; i++) { const a = r() * 6.28, a1 = 1.4 + r() * 1.5, a2 = a1 + 2 + r() * 2.5; d += `M${f(Math.cos(a) * a1)} ${f(Math.sin(a) * a1)}L${f(Math.cos(a) * a2)} ${f(Math.sin(a) * a2)}`; }
        path(d, {}, s);
        MG.el("circle", { r: 3, fill: "url(#sdGlow)" }, s);
        s.animate([{ opacity: 1, transform: `translate(${x}px,${y}px) scale(.6)` }, { opacity: 0, transform: `translate(${x}px,${y}px) scale(1.5)` }], { duration: 380, easing: "ease-out" }).onfinish = () => s.remove();
      };
      // tween a wire end back to rest
      const springBack = w => {
        const from = { ...w.end }, t0 = performance.now(), dur = fast ? 40 : 420;
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - k, 3) * Math.cos(k * 7) ;
          w.end.x = from.x + (w.rest.x - from.x) * e; w.end.y = from.y + (w.rest.y - from.y) * e; drawWire(w);
          if (k < 1) requestAnimationFrame(step);
        };
        step();
      };
      // solder hiss: a burst of soft noise clicks while the tin flows
      let hissTimer = null;
      const hiss = on => { clearInterval(hissTimer); hissTimer = null; if (on) hissTimer = setInterval(() => MG.click(ctx, .05 + Math.random() * .05, .05), 70); };

      const blinkTargets = on => {
        for (const el of [sockHi, ...pads.map(p => p.hi)]) { el.getAnimations().forEach(a => a.cancel()); el.setAttribute("opacity", 0); }
        if (!on) return;
        const tg = [];
        if (!lampIn) tg.push(sockHi);
        for (const w of wires) if (!w.done) tg.push(pads.find(p => p.id === w.target).hi);
        for (const el of tg) { el.getAnimations().forEach(a => a.cancel()); el.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 900, iterations: Infinity }); }
      };

      const hints = MG.hints(ctx, [
        ["tim", "Лампа такая же, как у меня. Один в один. Последняя живая."],
        ["tim", "Красный к семи, синий к земле. То есть… к вот этой."],
        ["tim", "Дай я."],
      ], () => timTakesOver());
      // the second hint makes the needed points blink
      const hintWatch = setInterval(() => { if (hints.shown === 2 && !blinkTargets.done) { blinkTargets.done = true; blinkTargets(true); } }, 200);

      const progress = () => {
        hints.poke(); MG.tone(ctx, 180, .25, .05, "triangle");
        if (blinkTargets.done) blinkTargets(true);
        if (lampIn && wires.every(w => w.done)) comeAlive(true);
      };

      const seat = () => {
        lampIn = true; lampEl.setAttribute("opacity", 0); seated.setAttribute("opacity", 1);
        seated.animate([{ transform: "translateY(-3px)" }, { transform: "translateY(0)" }], { duration: 160, easing: "ease-in" });
        MG.click(ctx, .3, .03); ctx.vibrate(15);
        progress();
      };
      const solderDone = w => {
        w.done = true; w.blob.setAttribute("r", 1.7); w.hit.remove();
        ironGoal = { x: IRON_TIP.x, y: IRON_TIP.y }; smoke.setAttribute("opacity", 0); hiss(false);
        ctx.vibrate(12);
        progress();
      };

      const comeAlive = ok => {
        if (finished) return; finished = true; hints.stop();
        blinkTargets(false);
        if (ok) {
          later(() => {
            MG.click(ctx, .2, .02);
            glow.animate([{ opacity: 0 }, { opacity: .5 }, { opacity: .3 }, { opacity: 1 }], { duration: fast ? 50 : 1400, fill: "forwards" });
            seatedGlow.animate([{ opacity: 0 }, { opacity: .9 }], { duration: fast ? 50 : 1600, fill: "forwards" });
            needle.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(124deg)" }, { transform: "rotate(112deg)" }, { transform: "rotate(117deg)" }], { duration: fast ? 50 : 1500, fill: "forwards", easing: "ease-out" });
            const v = MG.radioVoice(ctx); v.set(.25);
            later(() => v.set(.6), 700);
            later(() => { v.stop(); ctx.done("ok"); }, 2600);
          }, 500);
        } else {
          // Tim's hands are not steady tonight: a spark and nothing
          later(() => { spark(SOCK.x, SOCK.y); MG.tone(ctx, 60, .5, .06, "sine"); }, 600);
          later(() => ctx.done("fail"), 2600);
        }
      };

      function timTakesOver() {
        if (finished) return;
        const vars = (ctx.state && ctx.state.vars) || {};
        const trust = "tim" in vars ? vars.tim : "tim_trust" in vars ? vars.tim_trust : null;  // story: tim; sample: tim_trust
        const ok = trust === null || !(+trust < 1);
        busy = true; finished = true; hints.stop();
        if (drag) { if (drag.kind === "wire" && !drag.w.done) springBack(drag.w); drag = null; carried.setAttribute("opacity", 0); sockHi.setAttribute("opacity", 0); hiss(false); smoke.setAttribute("opacity", 0); }
        // Tim finishes whatever is left, quickly
        const steps = [];
        if (!lampIn) steps.push(() => { lampIn = true; lampEl.setAttribute("opacity", 0); seated.setAttribute("opacity", 1); MG.click(ctx, .3, .03); });
        for (const w of wires) if (!w.done) steps.push(() => {
          const p = pads.find(q => q.id === w.target); w.end = { x: p.x, y: p.y }; drawWire(w);
          ironGoal = { x: p.x + 1, y: p.y - 1 }; hiss(true);
          later(() => { w.done = true; w.blob.setAttribute("r", 1.7); hiss(false); ironGoal = { ...IRON_TIP }; }, 700);
        });
        steps.forEach((fn, i) => later(fn, 300 + i * 1000));
        later(() => { finished = false; comeAlive(ok); }, 300 + steps.length * 1000);
      }

      // ---------- input: one pointer drags a lamp or a wire end ----------
      let drag = null;
      const hitLamp = pt => !lampIn && Math.abs(pt.x - LAMP.x) < 11 && pt.y > LAMP.y - 20 && pt.y < LAMP.y + 6;
      const down = ev => {
        if (busy || finished || drag) return;
        const pt = MG.point(svg, ev);
        let w = null, best = 9;
        for (const x of wires) if (!x.done) { const d = Math.hypot(pt.x - x.end.x, pt.y - x.end.y); if (d < best) { best = d; w = x; } }
        if (w) drag = { kind: "wire", w, pad: null, t: 0 };
        else if (hitLamp(pt)) {
          lampEl.setAttribute("opacity", .2);
          drag = { kind: "lamp" };
          carried.setAttribute("d", valve(rng(9), 0, 0, 1.15)); carried.setAttribute("opacity", 1);
        } else return;
        ev.preventDefault(); svg.setPointerCapture(ev.pointerId); drag.id = ev.pointerId;
        hints.poke(); move(ev);
      };
      const move = ev => {
        if (!drag || ev.pointerId !== drag.id) return;
        const pt = MG.point(svg, ev);
        if (drag.kind === "lamp") {
          // lift the lamp a little above the finger so it is visible
          carried.setAttribute("transform", `translate(${f(pt.x)} ${f(pt.y - 6)})`);
          sockHi.setAttribute("opacity", Math.hypot(pt.x - SOCK.x, pt.y - 6 - SOCK.y) < 12 ? .8 : 0);
          return;
        }
        const w = drag.w;
        const near = pads.find(p => Math.hypot(pt.x - p.x, pt.y - p.y) < 6);
        if (near && drag.pad !== near) {
          drag.pad = near; drag.t = performance.now();
          if (near.id === w.target) { ironGoal = { x: near.x + 1, y: near.y - 1 }; hiss(true); svg.append(smoke); smoke.setAttribute("transform", `translate(${near.x + 1} ${near.y - 3})`); }
        } else if (!near && drag.pad) {
          if (drag.pad.id === w.target) { ironGoal = { ...IRON_TIP }; hiss(false); smoke.setAttribute("opacity", 0); w.blob.setAttribute("r", 0); }
          drag.pad = null;
        }
        if (drag.pad) { w.end.x = drag.pad.x; w.end.y = drag.pad.y; } else { w.end.x = pt.x; w.end.y = pt.y; }
        drawWire(w);
      };
      const up = ev => {
        if (!drag || ev.pointerId !== drag.id) return;
        const d = drag; drag = null;
        try { svg.releasePointerCapture(ev.pointerId); } catch (e) {}
        if (d.kind === "lamp") {
          carried.setAttribute("opacity", 0); sockHi.setAttribute("opacity", 0);
          const pt = MG.point(svg, ev);
          if (Math.hypot(pt.x - SOCK.x, pt.y - 6 - SOCK.y) < 12) seat();
          else lampEl.setAttribute("opacity", 1);
          return;
        }
        const w = d.w;
        if (w.done) return;
        if (d.pad && d.pad.id !== w.target) spark(d.pad.x, d.pad.y);
        ironGoal = { ...IRON_TIP }; hiss(false); smoke.setAttribute("opacity", 0); w.blob.setAttribute("r", 0);
        springBack(w);
      };
      svg.addEventListener("pointerdown", down);
      svg.addEventListener("pointermove", move);
      svg.addEventListener("pointerup", up);
      svg.addEventListener("pointercancel", up);

      // hold timer: tin flows while the finger stays on the right pad; a wrong pad sparks after a short touch
      const holdLoop = setInterval(() => {
        if (!drag || drag.kind !== "wire" || !drag.pad) return;
        const w = drag.w, el = performance.now() - drag.t;
        if (drag.pad.id !== w.target) {
          if (el > (fast ? 30 : 280)) { const p = drag.pad; drag = null; spark(p.x, p.y); springBack(w); }
          return;
        }
        const k = Math.min(1, el / HOLD);
        w.blob.setAttribute("r", f(.4 + k * 1.3));
        smoke.setAttribute("opacity", f(.5 * Math.min(1, k * 3) * (.6 + .4 * Math.sin(el / 120))));
        if (k >= 1) { drag = null; solderDone(w); }
      }, 40);

      return () => {
        hints.stop(); clearInterval(hintWatch); clearInterval(holdLoop); hiss(false); cancelAnimationFrame(raf);
        timers.forEach(clearTimeout); timers.clear();
        svg.removeEventListener("pointerdown", down); svg.removeEventListener("pointermove", move);
        svg.removeEventListener("pointerup", up); svg.removeEventListener("pointercancel", up);
      };
    },
  };
})();
