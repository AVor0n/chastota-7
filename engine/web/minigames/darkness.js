// Mini-game "darkness" (Темнота): find three chalk arrows on the cave walls by the light under the finger.
// One gesture: drag the light (a tap strikes a new match when the old one is out).
// params: light = lamp | lantern | match | none (anything else plays as lantern); compass (0/1).
// none: no light at all, Vera leads by voice and only a faint chalk shimmer answers the finger.
(() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rng = seed => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const INKC = "233,225,210", RED = "176,42,31";

  function pencil(g, pts, r, { w = 1.5, a = .8, col = "38,34,27", jit = 1 } = {}) {
    for (let k = 0; k < 2; k++) {
      g.beginPath();
      pts.forEach(([x, y], i) => { const X = x + (r() - .5) * jit * 2, Y = y + (r() - .5) * jit * 2; i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
      g.strokeStyle = `rgba(${col},${a * (k ? .5 : 1)})`; g.lineWidth = w * (k ? .7 : 1); g.stroke();
    }
  }
  const seg = (x1, y1, x2, y2, n = 6) => Array.from({ length: n + 1 }, (_, i) => [x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n]);

  // a pencil cave wall for when the scene has no picture yet
  function caveWall(w, h) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), r = rng(1234);
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#9f9685"); bg.addColorStop(.35, "#c9bfab"); bg.addColorStop(.7, "#c3b9a5"); bg.addColorStop(1, "#968d7c");
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.lineCap = "round"; g.lineJoin = "round";
    const blob = pts => { g.beginPath(); const n = pts.length; for (let k = 0; k <= n; k++) { const p = pts[k % n], q = pts[(k + 1) % n], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; k ? g.quadraticCurveTo(p[0], p[1], mx, my) : g.moveTo(mx, my); } g.closePath(); };
    // limestone layers: wavy bands across the wall, some of them hatched darker
    const lines = [];
    for (let y = -h * .05; y < h * 1.05; y += h * (.025 + .03 * r())) {
      const ph = r() * 6, amp = h * (.004 + .01 * r()), tilt = (r() - .5) * h * .04;
      lines.push(Array.from({ length: 25 }, (_, i) => [w * i / 24, y + tilt * i / 24 + amp * Math.sin(i * .7 + ph) + (r() - .5) * 3]));
    }
    for (let i = 0; i < lines.length - 1; i++) {
      if (r() < .45) {
        const A = lines[i], B = lines[i + 1], dark = .06 + .16 * r();
        g.save(); g.beginPath(); A.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); [...B].reverse().forEach(([x, y]) => g.lineTo(x, y)); g.closePath(); g.clip();
        for (let x = -h * .1; x < w + h * .1; x += 2.5 + r() * 2.5) {
          g.strokeStyle = `rgba(38,34,27,${dark * (.4 + .6 * r())})`; g.lineWidth = .7 + r() * .7;
          g.beginPath(); g.moveTo(x, A[0][1] - h * .05); g.lineTo(x + h * .06, A[0][1] + h * .12); g.stroke();
        }
        g.restore();
      }
      g.strokeStyle = `rgba(38,34,27,${.2 + .35 * r()})`; g.lineWidth = .8 + r() * 1.2;
      g.beginPath(); lines[i].forEach(([x, y], k) => { if (r() < .12) g.moveTo(x, y); else k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    }
    // rounded boulders and bulges, shaded from the lower right
    for (let i = 0; i < 16; i++) {
      const cx = r() * w, cy = h * (.15 + .8 * r()), rad = w * (.06 + .12 * r()), n = 8;
      const pts = Array.from({ length: n }, (_, k) => { const a = k / n * 6.283, q = rad * (.75 + .35 * r()); return [cx + Math.cos(a) * q, cy + Math.sin(a) * q * .7]; });
      const sh = g.createRadialGradient(cx - rad * .35, cy - rad * .3, rad * .1, cx, cy, rad * 1.1);
      sh.addColorStop(0, "rgba(214,206,190,.55)"); sh.addColorStop(.6, "rgba(120,112,98,.25)"); sh.addColorStop(1, "rgba(40,36,30,.5)");
      blob(pts); g.fillStyle = sh; g.fill();
      g.save(); blob(pts); g.clip();
      for (let k = 0; k < 26; k++) { // contour hatching on the shadow side
        const a = .2 + r() * 1.6, q = rad * (.55 + .4 * r());
        g.strokeStyle = `rgba(38,34,27,${.1 + .15 * r()})`; g.lineWidth = .8;
        g.beginPath(); g.arc(cx - rad * .2, cy - rad * .15, q, a, a + .5 + r() * .5); g.stroke();
      }
      g.restore();
      blob(pts); g.strokeStyle = `rgba(30,27,21,${.45 + .3 * r()})`; g.lineWidth = 1.4; g.stroke();
    }
    // cracks
    for (let i = 0; i < 22; i++) {
      let x = r() * w, y = r() * h, a = 1.2 + (r() - .5) * 1.5;
      g.strokeStyle = `rgba(30,27,21,${.35 + .4 * r()})`; g.lineWidth = .8 + r() * 1.2; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 12; k++) { a += (r() - .5) * .9; x += Math.cos(a) * w * .018; y += Math.sin(a) * w * .018; g.lineTo(x, y); }
      g.stroke();
    }
    // stalactites from the vault, a drop on each tip
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = h * .12 * r(), L = w * (.04 + .09 * r()), b = L * .2;
      g.fillStyle = `rgba(38,34,27,${.3 + .3 * r()})`; g.beginPath(); g.moveTo(x - b, y); g.quadraticCurveTo(x - b * .3, y + L * .6, x, y + L); g.quadraticCurveTo(x + b * .3, y + L * .6, x + b, y); g.closePath(); g.fill();
      g.fillStyle = "rgba(245,240,230,.7)"; g.beginPath(); g.arc(x, y + L + 2, 1.7, 0, 7); g.fill();
    }
    // wet sheen and paper grain
    for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * h; g.strokeStyle = `rgba(250,246,236,${.15 + .2 * r()})`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 2, y + 6 + r() * 10); g.stroke(); }
    for (let i = 0; i < w * h / 50; i++) { g.fillStyle = `rgba(40,34,26,${r() * .08})`; g.fillRect(r() * w, r() * h, 1.4, 1.4); }
    return c;
  }

  // a chalk arrow: several dry strokes, pointing along (dx, dy)
  function chalkArrow(g, x, y, dx, dy, L, seed, a) {
    const r = rng(seed), px = -dy, py = dx;
    const tail = [x - dx * L / 2, y - dy * L / 2], tip = [x + dx * L / 2, y + dy * L / 2];
    g.lineCap = "round";
    for (let k = 0; k < 4; k++) {
      const o = (r() - .5) * 3;
      pencil(g, seg(tail[0] + px * o, tail[1] + py * o, tip[0] + px * o, tip[1] + py * o, 5), r, { w: 1.6 + r() * 1.4, a: a * (.35 + .4 * r()), col: "243,238,226", jit: 1.2 });
      for (const sgn of [-1, 1]) {
        const hx = tip[0] - dx * L * .32 + px * sgn * L * .22, hy = tip[1] - dy * L * .32 + py * sgn * L * .22;
        pencil(g, seg(tip[0], tip[1], hx + (r() - .5) * 3, hy + (r() - .5) * 3, 3), r, { w: 1.4 + r(), a: a * (.4 + .4 * r()), col: "243,238,226", jit: 1 });
      }
    }
  }

  MINIGAMES.darkness = {
    start(ctx) {
      const P = ctx.params || {}, fast = !!ctx.fast;
      const kind = ["lamp", "lantern", "match", "none"].includes(P.light) ? P.light : "lantern";
      const hasCompass = String(P.compass) === "1";
      const LIMIT = fast ? 8 : 90, BURN = fast ? 1 : 15, ZOOM = 1.6;

      const box = ctx.box, oldTouch = box.style.touchAction;
      box.style.background = "#050403"; box.style.touchAction = "none";
      const cv = document.createElement("canvas");
      cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none";
      box.prepend(cv);
      const g = cv.getContext("2d");
      const V = document.createElement("canvas"), vg = V.getContext("2d");

      // the picture of the cave, or a pencil wall when there is none
      const si = ctx.sceneImage && ctx.sceneImage();
      const src = si && si.tagName === "IMG" && si.naturalWidth ? si : null;
      let wall = null;

      // the way: four camera stops over a picture enlarged ZOOM times; arrows point from one stop to the next
      const R = Math.random, flip = R() < .5;
      const stops = [[0, .85], [.55, .6], [.05, .3], [.92, .04]].map(([x, y]) => [flip ? 1 - x : x, clamp(y + (R() - .5) * .1, 0, 1)]);
      const arrows = [];

      let W = 0, H = 0, dpr = 1, WW = 0, WH = 0, world = null;
      const camAt = k => [stops[k][0] * (WW - W), stops[k][1] * (WH - H)];
      const fit = () => {
        const rc = box.getBoundingClientRect();
        if (rc.width === W && rc.height === H) return;
        W = rc.width; H = rc.height; dpr = Math.min(1.5, window.devicePixelRatio || 1);
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        WW = W * ZOOM; WH = H * ZOOM;
        world = document.createElement("canvas"); world.width = Math.round(WW * dpr); world.height = Math.round(WH * dpr);
        const wg = world.getContext("2d"), pic = src || (wall = wall || caveWall(720, 1280));
        const k = Math.max(world.width / pic.width, world.height / pic.height), pw = pic.width * k, ph = pic.height * k;
        wg.drawImage(pic, (world.width - pw) / 2, (world.height - ph) / 2, pw, ph);
        // a few of Vera's tally marks, so not every white scratch on the wall is an arrow
        const r = rng(77); wg.setTransform(dpr, 0, 0, dpr, 0, 0); wg.lineCap = "round";
        for (let i = 0; i < 9; i++) {
          const x = WW * (.05 + .9 * r()), y = WH * (.1 + .8 * r());
          for (let s = 0; s < 4 + (r() * 2 | 0); s++) pencil(wg, seg(x + s * 5, y, x + s * 5 + 1, y + 13, 2), r, { w: 1.4, a: .5, col: "243,238,226" });
        }
        if (!arrows.length) for (let k = 0; k < 3; k++) {
          const [ax, ay] = camAt(k), [bx, by] = camAt(k + 1), dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1, side = dx >= 0 ? 1 : -1;
          const sx = W * (.5 + side * (.2 + .13 * R())), sy = H * (.28 + .32 * R());
          arrows.push({ x: (ax + sx) / WW, y: (ay + sy) / WH, dx: dx / d, dy: dy / d, seed: 100 + k * 17, glow: 0 });
        }
      };

      let t = 0, mode = "play", endAt = 0, found = 0, seen = 0, raf = 0, last = performance.now(), finished = false;
      let cam = [0, 0], camFrom = null, camTo = null, camT0 = 0, camDur = fast ? .2 : 2.4, nextStep = 0;
      const L = { x: 0, y: 0, tx: 0, ty: 0, set: false };
      let matches = kind === "match" ? 5 : 0, burn = 0, flare = 0, lightOn = kind !== "none", nextVera = fast ? .1 : 2, lastVera = "", lastVeraT = -99;
      let dripHint = false, nextDrip = 1.5, drips = [];

      const hints = MG.hints(ctx, [
        ["asya", "Стрелки мелом. Она метила дорогу."],
        (() => { const a = ["leva"]; Object.defineProperty(a, 1, { get: () => { dripHint = true; nextDrip = t + .2; return `Капает ${sideWord()}.`; } }); return a; })(),
      ]);
      const target = () => arrows[Math.min(found, 2)];
      const scr = a => [a.x * WW - cam[0], a.y * WH - cam[1]];
      // where the arrow will be once the walk to the current stop ends (hints and drips must not lie mid-walk)
      const scrAfter = a => { const c = camTo || cam; return [a.x * WW - c[0], a.y * WH - c[1]]; };
      const sideWord = () => { const a = target(); if (!a) return "справа"; return scrAfter(a)[0] >= W / 2 ? "справа" : "слева"; };
      const paused = () => ctx.paused ? ctx.paused() : !!document.querySelector("#pause.open, #settings.open, #bag.open");

      function strike() {
        if (kind !== "match" || lightOn || matches <= 0 || mode !== "play") return;
        matches--; burn = 0; lightOn = true; flare = 1;
        MG.click(ctx, .3, .22); setTimeout(() => MG.click(ctx, .15, .4), 90);
      }
      const move = ev => {
        const rc = box.getBoundingClientRect();
        // the light sits a little above the fingertip so the finger does not cover it
        L.tx = ev.clientX - rc.left; L.ty = ev.clientY - rc.top - (kind === "none" ? 0 : W * .1);
        if (!L.set) { L.x = L.tx; L.y = L.ty; L.set = true; }
      };
      const onDown = ev => {
        if (ev.target.closest && ev.target.closest("button")) return;
        ev.preventDefault(); if (paused()) return;
        try { box.setPointerCapture(ev.pointerId); } catch (e) {}
        move(ev); strike();
      };
      const onMove = ev => { if (ev.buttons || ev.pointerType === "touch") move(ev); };
      box.addEventListener("pointerdown", onDown); box.addEventListener("pointermove", onMove);

      function lightRadius() {
        const base = kind === "lamp" ? .3 : kind === "lantern" ? .23 : .14;
        let r = W * base, k = 1;
        if (kind === "lamp") { const low = smooth(LIMIT * .55, LIMIT, t); r *= 1 - .25 * low; k = 1 - low * .35 * (Math.sin(t * 31) > .7 - low ? 1 : 0); }
        if (kind === "lantern") k = .93 + .05 * Math.sin(t * 5.3) + .02 * Math.sin(t * 13.1);
        if (kind === "match") {
          k = .85 + .1 * Math.sin(t * 17) + .05 * Math.sin(t * 41);
          r *= 1 + .5 * flare; if (burn > BURN - 3) r *= clamp((BURN - burn) / 3, .35, 1);
        }
        if (!lightOn) return [0, 0];
        if (mode === "fail") { const f = smooth(endAt - .4, endAt - 2.6, t); r *= .3 + .7 * f; k *= f * (Math.sin(t * 23) > .2 ? 1 : .5); }
        return [r, k];
      }
      function tint() {
        if (kind === "lamp") { const low = smooth(LIMIT * .55, LIMIT, t); return `rgb(${242 + 13 * low},${238 - 20 * low},${226 - 90 * low})`; }
        return kind === "lantern" ? "rgb(255,226,182)" : "rgb(255,212,160)";
      }

      function drip(right) {
        const x = right ? W * (.62 + .3 * R()) : W * (.08 + .3 * R());
        drips.push({ x, y0: H * (.14 + .12 * R()), t0: t, bright: dripHint ? 1 : .45 });
        const pan = right ? .8 : -.8, lv = dripHint ? .06 : .025;
        MG.tone(ctx, 1500 + R() * 700, .14, lv, "sine", pan);
        setTimeout(() => MG.tone(ctx, 900 + R() * 300, .2, lv * .6, "sine", pan), 70);
      }
      // without light Vera leads the way by voice; the side is heard as well
      function vera(line) {
        const a = target(); if (!a) return;
        const [ax, ay] = scr(a), fx = L.set ? L.x : W / 2, fy = L.set ? L.y : H / 2, dx = ax - fx, dy = ay - fy;
        if (!line) line = Math.hypot(dx, dy) < W * .16 ? "Сюда. Тут, под рукой." : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "Правее." : "Левее.") : (dy < 0 ? "Выше, по стене." : "Ниже.");
        nextVera = t + (fast ? .5 : 6);
        if (line === lastVera && t - lastVeraT < 12) return; // she does not nag with the same word
        lastVera = line; lastVeraT = t; ctx.hint("vera", line);
        const pan = clamp(dx / W * 2.2, -1, 1);
        MG.tone(ctx, 300, .3, .05, "triangle", pan); setTimeout(() => MG.tone(ctx, 360, .35, .04, "triangle", pan), 170);
      }
      function foundArrow() {
        const a = arrows[found]; a.glow = 1; found++; seen = 0; hints.poke();
        const pan = clamp((scr(a)[0] / W - .5) * 2, -1, 1);
        MG.click(ctx, .1, .08); MG.tone(ctx, 660, .7, .05, "sine", pan); setTimeout(() => MG.tone(ctx, 990, .9, .04, "sine", pan), 140);
        ctx.vibrate && ctx.vibrate(15);
        // walk to the next part of the passage
        camFrom = cam.slice(); camTo = camAt(found); camT0 = t + (fast ? .05 : .8); nextStep = camT0;
        if (kind === "none" && found < 3) { nextVera = camT0 + camDur + (fast ? .1 : 1.5); setTimeout(() => { if (!finished) vera("Здесь ступенька. Держись за стену."); }, fast ? 10 : 900); }
        if (found >= 3) { mode = "ok"; endAt = camT0 + camDur + (fast ? .1 : .8); hints.stop(); }
      }

      function drawCompass(cx, cy, rr) {
        const r = rng(41 + Math.floor(t * 5)), a = target();
        g.fillStyle = "rgba(8,7,5,.6)"; g.beginPath(); g.arc(cx, cy, rr * 1.08, 0, 7); g.fill();
        pencil(g, Array.from({ length: 25 }, (_, i) => [cx + Math.cos(i / 24 * 6.283) * rr, cy + Math.sin(i / 24 * 6.283) * rr]), r, { w: 1.4, a: .45, col: INKC });
        for (let i = 0; i < 8; i++) { const q = i / 8 * 6.283, k = i % 2 ? .86 : .78; pencil(g, seg(cx + Math.cos(q) * rr * k, cy + Math.sin(q) * rr * k, cx + Math.cos(q) * rr * .96, cy + Math.sin(q) * rr * .96, 1), r, { w: 1, a: .4, col: INKC }); }
        let ang = -Math.PI / 2;
        if (a) { const [x, y] = scr(a); ang = Math.atan2(y - H / 2, x - W / 2); }
        ang += .08 * Math.sin(t * 2.1);
        const sx = Math.cos(ang), sy = Math.sin(ang);
        pencil(g, seg(cx - sx * rr * .6, cy - sy * rr * .6, cx, cy, 3), r, { w: 1.4, a: .3, col: INKC });
        pencil(g, seg(cx, cy, cx + sx * rr * .72, cy + sy * rr * .72, 3), r, { w: 3.2, a: .85, col: INKC });  // pointing end: bold pencil, not red (red is the 7 and Vera only)
      }
      function drawMatchbox(x, y) {
        // the box and the matches left, as little sticks; it breathes when the light is out
        const r = rng(51 + Math.floor(t * 5)), call = !lightOn && matches > 0 && mode === "play";
        const a = call ? .55 + .35 * Math.sin(t * 4) : .4, w = W * .1, h = w * .62;
        pencil(g, [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], r, { w: 1.4, a, col: INKC });
        pencil(g, seg(x + w * .12, y + h * .5, x + w * .88, y + h * .5, 4), r, { w: .8, a: a * .6, col: INKC });
        for (let i = 0; i < matches; i++) {
          const sx = x - w * .18 - i * W * .022;
          pencil(g, seg(sx, y + h, sx + 1, y + h * .1, 3), r, { w: 1.1, a, col: INKC });
          g.fillStyle = `rgba(${INKC},${a})`; g.beginPath(); g.arc(sx + 1, y + h * .1, 2.2, 0, 7); g.fill();
        }
      }

      function frame(now) {
        raf = requestAnimationFrame(frame);
        let dt = clamp((now - last) / 1000, 0, .1); last = now;
        if (paused()) dt = 0;
        fit();
        if (!L.set) { L.x = L.tx = W / 2; L.y = L.ty = H * .55; }
        t += dt;

        // camera walk between stops, in small steps
        if (camTo && t >= camT0) {
          const k = smooth(0, 1, (t - camT0) / camDur);
          cam = [camFrom[0] + (camTo[0] - camFrom[0]) * k, camFrom[1] + (camTo[1] - camFrom[1]) * k];
          if (t >= nextStep && k < 1) { nextStep = t + .42; MG.click(ctx, .06, .05); }
          if (k >= 1) camTo = null;
        } else if (!camTo && found === 0) cam = camAt(0);

        L.x += (L.tx - L.x) * Math.min(1, dt * 14); L.y += (L.ty - L.y) * Math.min(1, dt * 14);
        flare = Math.max(0, flare - dt * 2.5);
        if (kind === "match" && lightOn && mode === "play") {
          burn += dt;
          if (burn >= BURN) {
            lightOn = false; MG.click(ctx, .05, .2);
            if (matches <= 0) { mode = "fail"; endAt = t + (fast ? .2 : 1.5); hints.stop(); }
          }
        }
        if (mode === "play" && t >= LIMIT) { mode = "fail"; endAt = t + (fast ? .3 : 2.8); hints.stop(); }
        if ((mode === "ok" || mode === "fail") && t >= endAt && !finished) { finished = true; ctx.done(mode); }

        const [rad, inten] = lightRadius();
        // is the current arrow in the light? hold it there for a moment
        if (kind === "none" && mode === "play" && !camTo && found < 3 && L.set) {
          const [ax, ay] = scr(arrows[found]), d = Math.hypot(ax - L.x, ay - L.y);
          if (d < W * .1) { seen += dt; if (seen >= (fast ? .05 : .8)) foundArrow(); } else seen = Math.max(0, seen - dt * .5);
        }
        if (kind === "none" && mode === "play" && !camTo && t >= nextVera) vera();
        if (mode === "play" && !camTo && found < 3 && rad > 0) {
          const [ax, ay] = scr(arrows[found]), d = Math.hypot(ax - L.x, ay - L.y);
          if (d < rad * .62 && inten > .3) { seen += dt; if (seen >= (fast ? .05 : .6)) foundArrow(); } else seen = Math.max(0, seen - dt * .5);
        }
        if (t >= nextDrip && mode !== "fail") {
          const a = target(), right = dripHint && a ? scrAfter(a)[0] >= W / 2 : R() < .5;
          drip(right); nextDrip = t + (dripHint ? 1.4 + R() * .6 : 2.5 + R() * 3.5);
        }

        // ---------- paint ----------
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.fillStyle = "#050403"; g.fillRect(0, 0, W, H);
        if (rad > 1 && world) {
          const s = Math.ceil(rad * 2 * dpr), x0 = L.x - rad, y0 = L.y - rad;
          if (V.width !== s) { V.width = s; V.height = s; }
          vg.setTransform(1, 0, 0, 1, 0, 0); vg.globalCompositeOperation = "source-over"; vg.globalAlpha = 1;
          vg.fillStyle = "#050403"; vg.fillRect(0, 0, s, s);
          vg.drawImage(world, (cam[0] + x0) * dpr, (cam[1] + y0) * dpr, s, s, 0, 0, s, s);
          vg.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
          for (let i = 0; i <= Math.min(found, 2); i++) {
            const a = arrows[i], [ax, ay] = scr(a);
            if (Math.hypot(ax - L.x, ay - L.y) > rad + W * .12) continue;
            chalkArrow(vg, ax, ay, a.dx, a.dy, W * .16, a.seed + Math.floor(t * 3) % 2, .85 + .15 * a.glow);
            if (a.glow > 0) { a.glow = Math.max(0, a.glow - dt * .6); }
          }
          vg.setTransform(1, 0, 0, 1, 0, 0);
          vg.globalCompositeOperation = "multiply"; vg.fillStyle = tint(); vg.fillRect(0, 0, s, s);
          // soft edge of the light
          vg.globalCompositeOperation = "destination-in";
          const gr = vg.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
          gr.addColorStop(0, `rgba(0,0,0,${inten})`); gr.addColorStop(.5, `rgba(0,0,0,${inten * .85})`); gr.addColorStop(.82, `rgba(0,0,0,${inten * .3})`); gr.addColorStop(1, "rgba(0,0,0,0)");
          vg.fillStyle = gr; vg.fillRect(0, 0, s, s);
          vg.globalCompositeOperation = "source-over";
          g.drawImage(V, x0, y0, rad * 2, rad * 2);
          // the arrow that was just found keeps a faint chalk glow
          for (const a of arrows) if (a.glow > 0) {
            const [ax, ay] = scr(a), q = g.createRadialGradient(ax, ay, 0, ax, ay, W * .14);
            q.addColorStop(0, `rgba(243,238,226,${.18 * a.glow})`); q.addColorStop(1, "rgba(243,238,226,0)");
            g.fillStyle = q; g.fillRect(ax - W * .14, ay - W * .14, W * .28, W * .28);
          }
          if (kind === "match") { // the flame itself
            const fy = L.y + rad * .1, q = g.createRadialGradient(L.x, fy, 0, L.x, fy, 7 + 6 * flare);
            q.addColorStop(0, `rgba(255,246,220,${.9 * inten})`); q.addColorStop(1, "rgba(255,200,140,0)");
            g.fillStyle = q; g.beginPath(); g.arc(L.x, fy, 7 + 6 * flare, 0, 7); g.fill();
          }
        }
        if (kind === "none" && L.set && mode !== "fail") { // only the chalk near the finger glimmers
          const near = Math.min(found, 2);
          for (let i = 0; i <= near; i++) {
            const a = arrows[i], [ax, ay] = scr(a), d = Math.hypot(ax - L.x, ay - L.y), q = 1 - smooth(W * .05, W * .2, d);
            const fl = .7 + .3 * Math.sin(t * 9 + i) * Math.sin(t * 5.3);
            if (q > .01 || a.glow > 0) chalkArrow(g, ax, ay, a.dx, a.dy, W * .16, a.seed + Math.floor(t * 4) % 3, Math.max(.32 * q * fl, .3 * a.glow));
            if (a.glow > 0) a.glow = Math.max(0, a.glow - dt * .6);
          }
          const r = rng(Math.floor(t * 8));
          for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(243,238,226,${.12 * r()})`; g.fillRect(L.x + (r() - .5) * W * .12, L.y + (r() - .5) * W * .12, 1.5, 1.5); }
          g.strokeStyle = `rgba(${INKC},.1)`; g.lineWidth = 1; g.beginPath(); g.arc(L.x, L.y, W * .06, 0, 7); g.stroke();
        }
        // drops catch a glint even in the dark
        for (let i = drips.length - 1; i >= 0; i--) {
          const d = drips[i], age = t - d.t0;
          if (age > .9) { drips.splice(i, 1); continue; }
          const y = d.y0 + age * age * H * .9, a = d.bright * (1 - age / .9) * .7;
          g.strokeStyle = `rgba(${INKC},${a})`; g.lineWidth = 1.3;
          g.beginPath(); g.moveTo(d.x, y - 7); g.lineTo(d.x, y); g.stroke();
        }
        // a faint ring under the finger, so touching the dark still answers
        if (!lightOn && kind === "match" && L.set) {
          g.strokeStyle = `rgba(${INKC},.12)`; g.lineWidth = 1; g.beginPath(); g.arc(L.x, L.y + W * .1, W * .05, 0, 7); g.stroke();
        }
        if (mode === "ok" && t > endAt - .8) { g.fillStyle = `rgba(5,4,3,${smooth(endAt - .8, endAt, t)})`; g.fillRect(0, 0, W, H); }
        if (kind === "match") drawMatchbox(W * .8, H * .15);
        if (hasCompass) drawCompass(W * .84, H * .64, W * .09);
      }
      raf = requestAnimationFrame(frame);
      if (window.__ch7 && window.__ch7.game) Object.assign(window.__ch7.game, {
        probe: () => ({ t, mode, found, kind, matches, lightOn, cam, arrow: arrows[found] ? scr(arrows[found]) : null, L: [L.x, L.y], rad: lightRadius()[0], W, H }),
        warp: s => { t += s; },
      });

      return () => {
        finished = true; cancelAnimationFrame(raf); hints.stop();
        box.removeEventListener("pointerdown", onDown); box.removeEventListener("pointermove", onMove);
        box.style.touchAction = oldTouch; cv.remove();
      };
    },
  };
})();
