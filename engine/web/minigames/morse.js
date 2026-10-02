// morse: a dark cave, Dad's old cable along the wall. Vera knocks on it somewhere ahead; the player knocks the pattern back.
// short touch = a short knock, hold = a long one (stone dragged along the cable). Three patterns, each a little longer:
// pieces of "СЮДА" in Morse: Ю ..--, ДА -...-, С+Д ...-..
(() => {
  const rng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const f = n => n.toFixed(2);
  const contour = (r, x, y, len, dir, wob) => {
    let d = `M${f(x)} ${f(y)}`, a = dir;
    for (let i = 0; i < len; i++) { a += (r() - .5) * wob; const s = 3 + r() * 4; x += Math.cos(a) * s; y += Math.sin(a) * s; d += `L${f(x)} ${f(y)}`; }
    return d;
  };

  const PATTERNS = ["..--", "-...-", "...-.."];
  // cable: cubic from the near end (bottom left, under the hero's palm) into the dark ahead (top right). viewBox 100 x 180
  const P = [[-8, 142], [30, 104], [58, 54], [106, 14]];
  const N = 90, PALM_U = .17, TIM_U = .36;
  const VERA_PAN = .55;

  MINIGAMES.morse = {
    start(ctx) {
      const fast = ctx.fast, r = rng(7);
      const T = ms => fast ? Math.min(ms, 30) : ms;
      MG.veil(ctx, .93);
      ctx.area.style.touchAction = "none";
      const INK = MG.INK;

      const svg = MG.svg(ctx.area, "0 0 100 180", `
        <defs>
          <linearGradient id="mrFade" gradientUnits="userSpaceOnUse" x1="10" y1="126" x2="100" y2="18">
            <stop offset="0" stop-color="${INK}" stop-opacity=".95"/><stop offset=".6" stop-color="${INK}" stop-opacity=".55"/><stop offset="1" stop-color="${INK}" stop-opacity="0"/>
          </linearGradient>
          <linearGradient id="mrGlow" gradientUnits="userSpaceOnUse" x1="10" y1="126" x2="100" y2="18">
            <stop offset="0" stop-color="#fffaf0" stop-opacity="1"/><stop offset="1" stop-color="#fffaf0" stop-opacity=".3"/>
          </linearGradient>
        </defs>`);
      const g = (attrs = {}, parent = svg) => MG.el("g", attrs, parent);
      const path = (d, attrs = {}, parent = svg) => MG.el("path", { d, "stroke-linecap": "round", "stroke-linejoin": "round", ...attrs }, parent);

      // ---- cable geometry ----
      const base = [], nrm = [], tan = [], jit = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N, a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, c = 3 * u * u * (1 - u), d = u ** 3;
        base.push({ x: a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0], y: a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1] });
        const tx = 3 * (1 - u) ** 2 * (P[1][0] - P[0][0]) + 6 * u * (1 - u) * (P[2][0] - P[1][0]) + 3 * u * u * (P[3][0] - P[2][0]);
        const ty = 3 * (1 - u) ** 2 * (P[1][1] - P[0][1]) + 6 * u * (1 - u) * (P[2][1] - P[1][1]) + 3 * u * u * (P[3][1] - P[2][1]);
        const L = Math.hypot(tx, ty); tan.push({ x: tx / L, y: ty / L }); nrm.push({ x: -ty / L, y: tx / L });
        jit.push([(r() - .5) * .35, (r() - .5) * .35]);
      }
      const width = u => 3.4 * (1 - u) + .5 * u;
      const at = u => { const i = Math.max(0, Math.min(N, Math.round(u * N))); return { p: base[i], n: nrm[i], t: tan[i], i }; };

      // ---- the wall: barely there, it only shows that we move ----
      const world = g({ stroke: INK, "stroke-width": .3, filter: "url(#pencil)", opacity: .05 });
      for (let i = 0; i < 12; i++) path(contour(r, -20 + r() * 40, -10 + i * 18 + r() * 6, 24, -.35 + (r() - .5) * .3, .5), {}, world);

      // ---- cable layers: body, edges, armour ticks, highlights ----
      const body = path("", { fill: "url(#mrFade)", opacity: .35 });
      const edge = path("", { stroke: "url(#mrFade)", "stroke-width": .45 });
      const ticks = path("", { stroke: "url(#mrFade)", "stroke-width": .3, opacity: .7 });
      const glowW = path("", { stroke: "url(#mrGlow)", "stroke-width": 5, opacity: .12 });
      const glowN = path("", { stroke: "url(#mrGlow)", "stroke-width": 1.4, opacity: .85 });
      const ripples = g({ stroke: INK, "stroke-width": .35, fill: "none" });

      // ---- hero's palm on the cable ----
      const PA = at(PALM_U), ang = Math.atan2(PA.t.y, PA.t.x) * 180 / Math.PI;
      const palmOuter = g({ transform: `translate(${f(PA.p.x)} ${f(PA.p.y)}) rotate(${f(ang)})` });
      const palm = g({ stroke: INK, "stroke-width": .42, fill: "#0f0e0b", filter: "url(#pencil)", opacity: .88, "stroke-linecap": "round", "stroke-linejoin": "round" }, palmOuter);
      // sleeve, back of the hand below the cable, thumb along it, four fingers curled over it
      path("M-6.2 13.5L-9.4 28M6.8 13L5.6 28", { fill: "none", opacity: .7 }, palm);
      path("M-7.2 17.6Q0 19.6 6.5 16.6", { fill: "none", opacity: .55 }, palm);
      path("M-6.4 2.6C-7.6 6.6 -7.4 10.6 -6 14C-2 15.6 3 15.4 6.8 13.2C8.2 9.4 8.4 5.4 7.6 2.2Z", {}, palm);
      path("M-6.6 7.2C-9.6 6.6 -12.6 4.6 -14.6 2.4Q-15.6 .6 -13.8 .5C-11.6 1.4 -9.2 2.8 -6.6 3.4Z", {}, palm);
      path("M-14.2 1.5q.8 -.6 1.4 .2", { fill: "none", opacity: .6, "stroke-width": .3 }, palm);
      for (const d of ["M-6.2 3.6L-6.2 -2.2Q-6.2 -4.4 -4.6 -4.4Q-3.2 -4.4 -3.2 -2.4L-3.2 3", "M-3.1 3L-3.1 -3.2Q-3.1 -5.4 -1.5 -5.4Q0 -5.4 0 -3.2L0 2.8",
        "M0.1 2.8L0.1 -2.9Q0.1 -5.1 1.6 -5.1Q3.1 -5.1 3.1 -3L3.1 2.6", "M3.2 2.6L3.2 -1.6Q3.2 -3.6 4.6 -3.6Q6 -3.6 6.1 -1.8L6.6 2.4"]) path(d, {}, palm);
      path("M-5.4 -.9q.8 .5 1.6 0M-2.3 -1.6q.8 .5 1.6 0M.9 -1.4q.8 .5 1.6 0M3.9 -.4q.7 .4 1.4 0", { fill: "none", opacity: .55, "stroke-width": .28 }, palm);
      path("M-5.2 -3.4q.6 -.5 1.2 0M-2.1 -4.4q.6 -.5 1.2 0M1.1 -4.1q.6 -.5 1.2 0M4 -2.7q.5 -.4 1 0", { fill: "none", opacity: .5, "stroke-width": .25 }, palm);
      path("M-4.6 6.4l3 6.2M-2.6 5.8l3.2 6.8M-.4 5.6l3 6.4M1.8 5.4l2.8 6M4 5.2l2.4 5.2", { fill: "none", opacity: .22, "stroke-width": .25 }, palm);
      path("M-5.4 5.2q5.8 1.6 12 -.8", { fill: "none", opacity: .4, "stroke-width": .3 }, palm);
      const pressPalm = (hold) => palm.animate([{ transform: "translate(0,0)" }, { transform: "translate(0px,1.2px) scale(.97)" }], { duration: T(hold ? 120 : 70), fill: "forwards", easing: "ease-out" });
      const releasePalm = () => palm.animate([{ transform: "translate(0px,1.2px) scale(.97)" }, { transform: "translate(0,0)" }], { duration: T(140), fill: "forwards" });

      // ---- Tim's finger on a stone (second hint) ----
      const TA = at(TIM_U), TP = { x: TA.p.x + TA.n.x * 24, y: TA.p.y + TA.n.y * 24 };
      const timG = g({ opacity: 0, transform: `translate(${f(TP.x)} ${f(TP.y)})` });
      path("M-9 3C-10 -1 -6 -3.6 -1 -3.4C5 -3.8 9.6 -1 9 2.6C8 5.6 -7 6 -9 3Z", { stroke: INK, "stroke-width": .4, fill: "none", opacity: .5, filter: "url(#pencil)" }, timG);
      const tf = g({}, timG);
      path("M-2.4 -22L-2.3 -6Q-2.3 -3.3 0 -3.3Q2.3 -3.3 2.3 -6L2.6 -22", { stroke: INK, "stroke-width": .45, fill: "rgba(8,7,5,.92)", opacity: .85 }, tf);
      path("M-1.2 -5.4Q0 -4.6 1.2 -5.4L1.1 -7.6Q0 -8.2 -1.1 -7.6Z", { stroke: INK, "stroke-width": .3, fill: "none", opacity: .6 }, tf);
      path("M-1.6 -11.6q1.6 .9 3.2 0M-1.4 -12.8q1.4 .6 2.8 0M-1.8 -18.6q1.8 .8 3.6 0", { stroke: INK, "stroke-width": .25, fill: "none", opacity: .45 }, tf);
      let timOn = false;
      const timTap = (long, dur) => {
        if (!timOn) return;
        tf.animate([{ transform: "translateY(-3px)" }, { transform: "translateY(0)", offset: .2 }, { transform: "translateY(0)", offset: .85 }, { transform: "translateY(-3px)" }], { duration: T(long ? dur + 120 : 220) });
        const e = path("M-4.2 -5.4q-1.6 1.4 0 3M4.2 -5.4q1.6 1.4 0 3", { stroke: INK, "stroke-width": .3, fill: "none" }, timG);
        e.animate([{ opacity: .9, transform: "scale(.7)" }, { opacity: 0, transform: "scale(1.8)" }], { duration: T(long ? dur + 300 : 500), easing: "ease-out" }).onfinish = () => e.remove();
      };

      // ---------- waves along the cable ----------
      // packet: u0, dir, t0, dur (0 for a knock, else ms of drag), amp
      const packets = [];
      const SPEED = 1.1; // cable lengths per second
      let tickPhase = 0, tickGoal = 0, raf = 0, tremble = 0, last = performance.now();
      const ripple = (u, size = 1) => {
        const { p, n } = at(u);
        const e = path(`M${f(p.x - n.x * 3.4 - 2)} ${f(p.y - n.y * 3.4)}q2 -1.4 4 0M${f(p.x + n.x * 3.4 - 2)} ${f(p.y + n.y * 3.4)}q2 1.4 4 0`, {}, ripples);
        e.style.transformOrigin = `${f(p.x)}px ${f(p.y)}px`; e.style.transformBox = "view-box";
        e.animate([{ opacity: .9, transform: "scale(.6)" }, { opacity: 0, transform: `scale(${1.3 + size})` }], { duration: T(650), easing: "ease-out" }).onfinish = () => e.remove();
      };
      const draw = now => {
        const dt = Math.min(100, now - last); last = now;
        tickPhase += (tickGoal - tickPhase) * (1 - Math.exp(-dt / 380));
        for (let k = packets.length - 1; k >= 0; k--) if (now - packets[k].t0 > packets[k].dur + 1500) packets.splice(k, 1);
        const off = new Float32Array(N + 1), lit = new Float32Array(N + 1);
        for (let i = 0; i <= N; i++) {
          const u = i / N; let o = 0, l = 0;
          for (const q of packets) {
            const age = (now - q.t0) / 1000, head = q.u + q.dir * SPEED * age;
            const tail = q.dur ? head - q.dir * SPEED * Math.min(age, q.dur / 1000) : head;
            const lo = Math.min(head, tail) - .05, hi = Math.max(head, tail) + .05;
            if (u < lo || u > hi) continue;
            const fade = Math.max(0, 1 - age / 1.25);
            if (q.dur) { o += q.amp * fade * Math.sin(u * 240 + now / 16) * .45; l = Math.max(l, fade * .7); }
            else { const x = (u - head) / .03; const e = Math.exp(-x * x); o += q.amp * fade * e * Math.cos(x * 2); l = Math.max(l, fade * e); }
          }
          o += tremble * Math.sin(u * 170 + now / 13) * .35;
          off[i] = o * (.4 + u * .6); lit[i] = l;
        }
        let L = "", R = "", E1 = "", E2 = "", tk = "", gl = "";
        const pts = [];
        for (let i = 0; i <= N; i++) {
          const u = i / N, p = base[i], n = nrm[i], w = width(u) / 2, o = off[i];
          const cx = p.x + n.x * o, cy = p.y + n.y * o; pts.push([cx, cy]);
          const lx = cx + n.x * (w + jit[i][0]), ly = cy + n.y * (w + jit[i][0]), rx = cx - n.x * (w + jit[i][1]), ry = cy - n.y * (w + jit[i][1]);
          L += (i ? "L" : "M") + f(lx) + " " + f(ly); R = "L" + f(rx) + " " + f(ry) + R;
          E1 += (i ? "L" : "M") + f(lx) + " " + f(ly); E2 += (i ? "L" : "M") + f(rx) + " " + f(ry);
        }
        // armour ticks drift backwards when we step forward along the cable
        for (let k = 0; k < 40; k++) {
          const u = ((k / 40 - tickPhase) % 1 + 1) % 1, i = Math.round(u * N), [cx, cy] = pts[i], n = nrm[i], t = tan[i], w = width(u) / 2;
          tk += `M${f(cx + n.x * w - t.x * w * .6)} ${f(cy + n.y * w - t.y * w * .6)}L${f(cx - n.x * w + t.x * w * .6)} ${f(cy - n.y * w + t.y * w * .6)}`;
        }
        let on = false;
        for (let i = 0; i <= N; i++) {
          if (lit[i] > .12) { gl += (on ? "L" : "M") + f(pts[i][0]) + " " + f(pts[i][1]); on = true; } else on = false;
        }
        body.setAttribute("d", L + R + "Z"); edge.setAttribute("d", E1 + E2); ticks.setAttribute("d", tk);
        glowN.setAttribute("d", gl); glowW.setAttribute("d", gl);
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);

      // ---------- sound: Vera's stone ahead (panned), the hero's palm in the middle ----------
      let closeness = 0; // grows with each step
      const knockSnd = vera => {
        const lv = vera ? .26 + closeness * .1 : .42, pan = vera ? VERA_PAN : 0;
        MG.click(ctx, lv, .04); MG.tone(ctx, vera ? 300 : 120, .12, vera ? .07 + closeness * .02 : .2, vera ? "square" : "triangle", pan);
        MG.tone(ctx, vera ? 1400 : 700, .06, vera ? .02 : .03, "sine", pan);
      };
      const scrape = vera => {
        const pan = vera ? VERA_PAN : 0;
        const t = setInterval(() => MG.click(ctx, (vera ? .05 + closeness * .02 : .08) + Math.random() * .05, .03), 30);
        const hum = () => MG.tone(ctx, vera ? 240 + Math.random() * 40 : 90, .3, vera ? .03 : .06, "sawtooth", pan);
        hum(); const t2 = setInterval(hum, 240);
        return () => { clearInterval(t); clearInterval(t2); };
      };

      // ---------- Vera's patterns ----------
      const SHORT_MS = 120, LONG_MS = 720, GAP_MS = 440;
      const timers = new Set();
      const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, T(ms)); timers.add(t); return t; };
      let playing = null;
      const playPattern = (pat, speed = 1, cheerful = false) => new Promise(res => {
        let k = 0, stopScrape = null, cancelled = false, t = null;
        const next = () => {
          if (cancelled) return;
          if (k >= pat.length) { playing = null; res(true); return; }
          const long = pat[k++] === "-", dur = T((long ? LONG_MS : SHORT_MS) / speed);
          packets.push({ u: 1, dir: -1, t0: performance.now(), dur: long ? dur : 0, amp: (long ? 1 : 1.8) * (1 + closeness * .25) });
          knockSnd(true);
          if (long) stopScrape = scrape(true);
          if (!cheerful) timTap(long, dur);
          t = setTimeout(() => { if (stopScrape) { stopScrape(); stopScrape = null; } t = setTimeout(next, T((cheerful ? 70 + Math.random() * 90 : GAP_MS) / speed)); }, dur);
        };
        playing = { cancel() { cancelled = true; clearTimeout(t); if (stopScrape) stopScrape(); playing = null; res(false); } };
        next();
      });

      // ---------- game flow ----------
      let stage = 0, misses = 0, phase = "listen"; // listen | input | judge | over
      let input = "", loopTimer = null, judgeTimer = null;
      const speedNow = () => misses ? .7 : 1;
      const listen = (ms) => {
        clearTimeout(loopTimer);
        phase = "listen";
        loopTimer = setTimeout(async () => {
          if (phase !== "listen") return;
          await playPattern(PATTERNS[stage], speedNow());
          if (phase === "listen") listen(4600);
        }, T(ms));
      };

      const hints = MG.hints(ctx, [
        ["tim", "Это морзянка. Не читай, просто повтори."],
        ["tim", "Слушай её. Вот так."],
      ], null);
      const hintWatch = setInterval(() => {
        if (hints.shown >= 2 && !timOn) {
          timOn = true; timG.animate([{ opacity: 0 }, { opacity: 1 }], { duration: T(700), fill: "forwards" });
          // Tim knocks the current pattern right away, quietly, on his stone
          let k = 0; const pat = PATTERNS[stage];
          const step = () => { if (k >= pat.length || phase === "over") return; const long = pat[k++] === "-"; timTap(long, T(LONG_MS)); later(step, (long ? LONG_MS : SHORT_MS) + GAP_MS + 120); };
          later(step, 900);
        }
      }, 200);

      const judge = async () => {
        clearTimeout(judgeTimer);
        if (phase !== "input") return;
        phase = "judge";
        const ok = input === PATTERNS[stage];
        svg.dataset.state = `${stage}:${misses}:${input}:${ok ? "ok" : "miss"}`;
        input = "";
        await new Promise(res => later(res, 650));
        if (phase === "over") return;
        if (ok) {
          stage++; misses = 0; hints.poke();
          if (stage >= PATTERNS.length) {
            phase = "over"; hints.stop(); closeness = 1;
            // Vera answers with a quick happy rattle
            await playPattern(".-..-.-...-.", 1.4, true);
            later(() => ctx.done("ok"), 1300);
            return;
          }
          // a step forward along the cable: the frame slides, Vera is closer
          closeness = stage / 2; tickGoal += .3; ctx.vibrate(10);
          world.animate([{ transform: `translate(${-14 * (stage - 1)}px,${10 * (stage - 1)}px)` }, { transform: `translate(${-14 * stage}px,${10 * stage}px)` }], { duration: T(1400), easing: "ease-in-out", fill: "forwards" });
          listen(1700);
          return;
        }
        misses++;
        if (misses >= 2) {
          // silence. They will follow the cable by touch.
          phase = "over"; hints.stop();
          later(() => { tremble = .2; }, 300); later(() => { tremble = 0; }, 800);
          later(() => svg.animate([{ opacity: 1 }, { opacity: .35 }], { duration: T(1800), fill: "forwards" }), 900);
          later(() => ctx.done("fail"), 2900);
          return;
        }
        listen(700);
      };

      let press = null, stopMyScrape = null;
      const down = ev => {
        if (press || phase === "over" || phase === "judge") return;
        ev.preventDefault(); svg.setPointerCapture(ev.pointerId);
        if (playing) playing.cancel();
        clearTimeout(loopTimer); clearTimeout(judgeTimer);
        phase = "input"; hints.poke();
        press = { id: ev.pointerId, t: ev.timeStamp || performance.now() };
        knockSnd(false); ctx.vibrate(18); ripple(PALM_U, .8); pressPalm(false);
        packets.push({ u: PALM_U, dir: 1, t0: performance.now(), dur: 0, amp: 1.8 });
        // past 350 ms a knock becomes a long one: the palm slides along the cable
        press.longT = setTimeout(() => {
          if (!press) return;
          press.long = true; stopMyScrape = scrape(false); tremble = .25; pressPalm(true);
          press.wave = { u: PALM_U, dir: 1, t0: performance.now(), dur: 1e7, amp: 1 }; packets.push(press.wave);
          ctx.vibrate(80);
        }, T(350));
      };
      const up = ev => {
        if (!press || ev.pointerId !== press.id) return;
        try { svg.releasePointerCapture(ev.pointerId); } catch (e) {}
        const ms = (ev.timeStamp || performance.now()) - press.t;
        clearTimeout(press.longT); if (stopMyScrape) stopMyScrape(); stopMyScrape = null; tremble = 0;
        if (press.wave) press.wave.dur = performance.now() - press.wave.t0;
        press = null; releasePalm();
        // under 250 ms is short, over 350 long; the gap between goes to the nearer one
        input += ms < T(300) ? "." : "-";
        svg.dataset.state = `${stage}:${misses}:${input}`;
        if (input.length >= PATTERNS[stage].length) judge();
        else judgeTimer = setTimeout(judge, T(2300));
      };
      svg.addEventListener("pointerdown", down);
      svg.addEventListener("pointerup", up);
      svg.addEventListener("pointercancel", up);

      listen(1500);

      return () => {
        phase = "over"; hints.stop(); clearInterval(hintWatch); clearTimeout(loopTimer); clearTimeout(judgeTimer);
        if (playing) playing.cancel();
        if (press) clearTimeout(press.longT);
        if (stopMyScrape) stopMyScrape();
        timers.forEach(clearTimeout); timers.clear(); cancelAnimationFrame(raf);
        svg.removeEventListener("pointerdown", down); svg.removeEventListener("pointerup", up); svg.removeEventListener("pointercancel", up);
      };
    },
  };
})();
