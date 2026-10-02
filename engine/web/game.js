// «Частота 7»: screens around the game (loading, title menu, settings, pause) and the game loop itself.
// Story data comes from the build as STORY; the runtime (src/runtime.js) decides what happens, this file shows it.

(() => {
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const DEV = qs.has("dev"), FAST = qs.has("fast");
  const stage = $("stage");
  // a tap near an edge can scroll the overflow:hidden stage on some browsers; keep it pinned
  stage.addEventListener("scroll", () => { if (stage.scrollTop || stage.scrollLeft) { stage.scrollTop = 0; stage.scrollLeft = 0; } });
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const assetUrl = p => "assets/" + p;
  const sleep = ms => new Promise(r => setTimeout(r, FAST ? Math.min(ms, 30) : ms));
  const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let waiting = null; // what the game waits for from the player: tap, choices, ...
  const want = w => { waiting = w; if (typeof updateBack === "function") updateBack(); if (DEV && window.__ch7) { window.__ch7.want = w; window.__ch7.wantSeq++; } };
  const inline = s => esc(s).replace(/_([^_]+)_/g, "<em>$1</em>");

  // ---------- storage (may be missing in private mode) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("ch7." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("ch7." + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem("ch7." + k); } catch (e) {} },
  };
  const settings = Object.assign({ music: .8, fx: .6, fs: 4.4, speed: "type", vibro: true }, store.get("settings", {}));
  const saveSettings = () => store.set("settings", settings);
  let persist = store.get("persist", null);
  let save = store.get("save", null);
  // a save from an older build is kept while it still fits the story (it is the state at the start of a node);
  // otherwise it is dropped and the player starts over, endings and memory stay
  if (save && save.v !== STORY.version) save = fitSave(save.snap) ? { v: STORY.version, snap: save.snap } : null;
  function fitSave(s) {
    try {
      if (!s || s.ended || s.pc !== 0 || !STORY.nodes[s.node]) return false;
      if ((s.queue || []).some(op => op.op === "goto" && !STORY.nodes[op.target])) return false;
      if ((s.items || []).some(id => !STORY.items[id])) return false;
      if (s.view && s.view.img && !STORY.images[s.view.img]) s.view.img = null;
      for (const k in STORY.vars) if (!(k in s.vars)) s.vars[k] = STORY.vars[k];
      return true;
    } catch (e) { return false; }
  }

  const audio = new AudioEngine(assetUrl);
  audio.vol = { music: settings.music, fx: settings.fx };
  const vibrate = ms => { if (settings.vibro && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} };

  // ---------- device: phone only, portrait only ----------
  const isDesktop = () => !DEV && matchMedia("(hover: hover) and (pointer: fine)").matches && !("ontouchstart" in window) && navigator.maxTouchPoints === 0;
  const isLandscape = () => innerWidth > innerHeight * 1.05 && !isDesktop();
  function checkDevice() {
    $("desk").classList.toggle("gone", !isDesktop());
    $("rotate").classList.toggle("gone", !isLandscape());
    if (isLandscape() && mode === "game") pauseGame(true);
  }
  addEventListener("resize", checkDevice);
  document.addEventListener("visibilitychange", () => { audio.suspend(document.hidden); if (document.hidden && mode === "game") pauseGame(true); });

  // ---------- title animation (approved, unchanged) ----------
  const tcanvas = $("tgl");
  let tgl, tUT, tReady = false;
  const t0 = performance.now(), now = () => (performance.now() - t0) / 1000;
  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
  async function startTitleGL() {
    tgl = tcanvas.getContext("webgl", { antialias: false });
    if (!tgl) return;
    const gl = tgl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, TITLE_VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, TITLE_FS));
    gl.linkProgram(prog); gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, "a"); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const [img, mask] = await Promise.all([loadImg(assetUrl("title/koster.jpg")), loadImg(assetUrl("title/mask.png"))]);
    const tex = (im, unit) => {
      const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    };
    tex(img, 0); tex(mask, 1);
    gl.uniform1i(gl.getUniformLocation(prog, "uImg"), 0); gl.uniform1i(gl.getUniformLocation(prog, "uMask"), 1);
    gl.uniform2fv(gl.getUniformLocation(prog, "uStars"), new Float32Array(TITLE_STARS.flat()));
    tUT = gl.getUniformLocation(prog, "uT"); tReady = true;
  }

  // ---------- one animation loop for both canvases ----------
  let mode = "load"; // load | title | game
  let scene = null;
  function frame() {
    if (mode !== "game" && tReady && !document.hidden) {
      const dpr = Math.min(devicePixelRatio || 1, 2), w = Math.round(tcanvas.clientWidth * dpr), h = Math.round(tcanvas.clientHeight * dpr);
      if (w && h) {
        if (tcanvas.width !== w || tcanvas.height !== h) { tcanvas.width = w; tcanvas.height = h; }
        tgl.viewport(0, 0, w, h); tgl.uniform1f(tUT, reduce ? 0 : now()); tgl.drawArrays(tgl.TRIANGLE_STRIP, 0, 4);
      }
    }
    if (mode === "game" && scene && !document.hidden) scene.frame();
    requestAnimationFrame(frame);
  }

  // ---------- loading: the needle tunes to 7 while pictures load ----------
  const dial = $("dial");
  const sx = n => 20.5 + (n - 1) * 33.2;
  (function drawDial() {
    let s = "";
    for (let n = 1; n <= 9; n++) s += `<text x="${sx(n)}" y="33" text-anchor="middle" font-family="Caveat, cursive" font-weight="700" font-size="${n === 7 ? 21 : 17}" fill="${n === 7 ? "#b02a1f" : "#2a241c"}" opacity="${n === 7 ? 1 : .8}">${n}</text>`;
    s += `<g id="needle" filter="url(#pencil)"><path d="M0 8V63" stroke="#1e1a14" stroke-width="2.2" stroke-linecap="round"/><path d="M2.6 10V63" stroke="#1e1a14" stroke-width="1.4" opacity=".18"/></g>`;
    dial.innerHTML = s;
  })();
  async function boot() {
    checkDevice();
    requestAnimationFrame(frame);
    const needle = dial.querySelector("#needle");
    let progress = 0;
    const tasks = [
      document.fonts ? document.fonts.ready : Promise.resolve(),
      startTitleGL().catch(() => {}),
      loadImg(assetUrl("title/paper.jpg")).catch(() => {}),
    ];
    let done = 0; tasks.forEach(p => p.then(() => { done++; }));
    const start = performance.now(), minT = FAST ? 50 : 3200;
    await new Promise(res => {
      const step = () => {
        const tk = Math.min(1, (performance.now() - start) / minT);
        progress = Math.min(tk, (done + tk) / (tasks.length + 1) + .0001, 1);
        const k = done === tasks.length ? tk : Math.min(tk, .85);
        const e = 1 - Math.pow(1 - k, 3);
        const wob = (1 - k) * (Math.sin(performance.now() / 90) * 3 + Math.sin(performance.now() / 37) * 1.5);
        needle.setAttribute("transform", `translate(${sx(1) + (sx(7) - sx(1)) * e + wob} 0)`);
        if (k < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    $("loadCap").textContent = "есть сигнал";
    await sleep(900);
    $("load").classList.add("gone");
    mode = "title";
    // pictures of the first scenes load in the background while the player looks at the title
    scene = new SceneView($("sgl"), { assetUrl, reduce });
    if (STORY.preload) scene.preload(STORY.preload);
  }

  // ---------- title and menu ----------
  let awake = false;
  function buildMenu() {
    const m = $("menu");
    const items = save
      ? [["Продолжить", "go"], ["Начать заново", "restart", 1], ["Настройки", "settings", 1], ["Об игре", "about", 1]]
      : [["Начать", "go"], ["Настройки", "settings", 1], ["Об игре", "about", 1]];
    m.innerHTML = "";
    items.forEach(([label, act, minor], i) => {
      const b = document.createElement("button"); b.textContent = label; b.dataset.act = act;
      if (minor) b.className = "minor";
      b.style.animationDelay = (i * .18) + "s"; b.classList.add("in");
      m.append(b);
    });
    m.classList.toggle("gone", !awake);
    $("lowshade").classList.toggle("gone", !awake);
  }
  function wake() {
    if (awake) return; awake = true;
    audio.start();
    audio.loop("music", "title", 2.5, assetUrl("title/amb-1.mp3")); audio.radio(0, "title");
    $("hint").classList.add("gone"); $("mute").classList.remove("gone");
    buildMenu();
  }
  $("titleScreen").addEventListener("click", () => { if (mode === "title" && !awake) wake(); });
  $("menu").onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    e.stopPropagation(); audio.ui("ui_tap");
    const a = b.dataset.act;
    if (a === "go") enterGame(false);
    if (a === "restart") openCard("restart");
    if (a === "settings") openSheet("settings");
    if (a === "about") openSheet("about");
  };
  $("restartYes").onclick = e => { e.stopPropagation(); closeAll(); save = null; store.del("save"); enterGame(true); };

  let muted = false;
  $("mute").onclick = e => {
    e.stopPropagation(); muted = !muted; audio.setMuted(muted);
    $("mute").querySelectorAll(".w").forEach(p => p.toggleAttribute("hidden", muted));
    $("mute").querySelector(".x").toggleAttribute("hidden", !muted);
    $("mute").setAttribute("aria-label", muted ? "Включить звук" : "Выключить звук");
  };

  // ---------- sheets and cards ----------
  const open = [];
  function openSheet(id, onClose) {
    if (mode === "title") stage.classList.add("dim");
    $(id).style.zIndex = 30 + open.length; // a sheet opened from another one (settings or journal from pause) lies on top
    $(id).classList.add("open"); open.push({ id, onClose }); audio.ui("ui_open");
    if (id === "settings") typeSample();
  }
  function openCard(id, onClose) {
    if (mode === "title") stage.classList.add("dim");
    $(id).classList.remove("gone"); open.push({ id, onClose, card: true });
  }
  function closeTop() {
    const top = open.pop(); if (!top) return;
    if (top.card) $(top.id).classList.add("gone"); else { $(top.id).classList.remove("open"); audio.ui("ui_close"); }
    if (!open.length) stage.classList.remove("dim");
    if (top.onClose) top.onClose();
  }
  function closeAll() { while (open.length) closeTop(); }
  stage.addEventListener("click", e => { if (e.target.closest("[data-close]")) { e.stopPropagation(); closeTop(); } });

  // settings
  const paint = r => r.style.setProperty("--v", r.value + "%");
  $("vMusic").value = settings.music * 100; $("vFx").value = settings.fx * 100;
  ["vMusic", "vFx"].forEach(id => {
    const r = $(id); paint(r);
    r.oninput = () => { paint(r); const k = id === "vMusic" ? "music" : "fx"; settings[k] = r.value / 100; audio.setVolume(k, settings[k]); saveSettings(); };
  });
  function pickRow(row, attr, value, fn) {
    row.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x.dataset[attr] === String(value))));
    row.onclick = e => { const b = e.target.closest("button"); if (!b) return; row.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); fn(b.dataset[attr]); saveSettings(); };
  }
  const applyFs = () => stage.style.setProperty("--fs", settings.fs + "cqw");
  applyFs();
  let typeTimer;
  const SAMPLE = "Так будет выглядеть текст в игре. Читай в своём темпе: следующая строка появится, когда коснёшься экрана.";
  function typeSample() {
    clearInterval(typeTimer); const el = $("sample");
    if (settings.speed === "now" || reduce) { el.textContent = SAMPLE; return; }
    let i = 0; el.textContent = "";
    typeTimer = setInterval(() => { el.textContent = SAMPLE.slice(0, ++i); if (i >= SAMPLE.length) clearInterval(typeTimer); }, 34);
  }
  pickRow($("sizes"), "fs", settings.fs, v => { settings.fs = +v; applyFs(); typeSample(); });
  pickRow($("speeds"), "sp", settings.speed, v => { settings.speed = v; typeSample(); });
  $("vibro").setAttribute("aria-pressed", String(settings.vibro));
  $("vibro").onclick = () => { settings.vibro = !settings.vibro; $("vibro").setAttribute("aria-pressed", String(settings.vibro)); saveSettings(); if (settings.vibro) vibrate(18); };

  // ---------- into the game ----------
  let rt = null, session = 0, paused = false;
  function enterGame(fresh) {
    closeAll();
    $("title").classList.add("gone"); $("menu").classList.add("gone"); $("lowshade").classList.add("gone"); $("mute").classList.add("gone");
    stage.classList.add("enter"); audio.boost = .05;
    audio.loop("music", null, 4);
    setTimeout(() => { audio.boost = 0; startGame(fresh || !save); }, FAST ? 30 : 4600);
  }
  function backToTitle() {
    session++; closeAll(); hideGameLayers();
    mode = "title"; paused = false;
    $("game").classList.add("hidden"); $("titleScreen").classList.remove("hidden");
    stage.classList.remove("enter");
    $("title").classList.remove("gone");
    audio.loop("amb", null, 1.5); audio.loop("music", "title", 2.5, assetUrl("title/amb-1.mp3")); audio.radio(0, "title");
    awake = true; $("mute").classList.remove("gone"); buildMenu();
  }

  function startGame(fresh) {
    rt = new Runtime(STORY, persist || undefined);
    persist = rt.persist;
    $("titleScreen").classList.add("hidden"); $("game").classList.remove("hidden");
    stage.classList.remove("enter");
    mode = "game"; paused = false;
    hideGameLayers(); clearText();
    back = null; $("choices").classList.remove("away"); $("more").classList.remove("away");
    if (!fresh && save) { rt.load(save.snap); restoreView(rt.state.view); }
    else { if (save) rt.retire(save.snap); rt.newGame(); scene.toBlack(0); }
    lastN = rt.state.logN || 0;
    store.set("persist", persist);
    updateBag();
    run(++session);
  }
  // the picture on screen right now (the runtime state can already be a step ahead: the next event is read before the tap)
  let shown = { img: null, node: null };
  function restoreView(v) {
    shown = { img: v.img, node: rt.state.node };
    if (v.img) scene.show(v.img, "fade"); else scene.toBlack(.5);
    scene.setFx(v.fx); if (v.pan) scene.pan(v.pan.dir, v.pan.sec); if (v.focus) scene.focus(v.focus);
    setTextPos(v.text);
    audio.loop("music", v.music); audio.loop("amb", v.amb); audio.radio(v.radio || 0);
  }
  function hideGameLayers() {
    ["chapter", "ending", "mini", "video"].forEach(id => $(id).classList.add("gone"));
    $("choices").innerHTML = ""; $("toast").classList.remove("on");
  }

  let lastSnap = null;
  function autosave() {
    if (rt.snapshot !== lastSnap && !rt.state.ended) { lastSnap = rt.snapshot; save = { v: STORY.version, snap: rt.snapshot }; store.set("save", save); }
    store.set("persist", persist);
  }

  // ---------- the loop ----------
  async function run(my) {
    const alive = () => my === session;
    let ev = null;
    try {
      for (;;) {
        if (!alive()) return;
        if (!ev) ev = rt.step();
        autosave();
        const cur = ev; ev = null;
        if (DEV) window.__ch7.last = cur;
        switch (cur.t) {
          case "text": {
            await showText(cur, alive);
            ev = rt.step(); // choices right after the last line appear without an extra tap
            if (ev.t !== "choices") await waitTap(alive);
            break;
          }
          case "cmd": await applyCmd(cur, alive); break;
          case "took": { const it = STORY.items[cur.id]; toast(`${it && it.pocket ? "в кармане" : "в рюкзаке"}: ${it ? it.name.toLowerCase() : cur.id}`); vibrate(12); audio.ui("item_get"); updateBag(); break; }
          case "choices": { const r = await showChoices(cur, alive); if (!alive()) return; if (r === "timeout") rt.timeout(); else rt.choose(r); updateBag(); break; }
          case "full": { const d = await askFull(cur, alive); if (!alive()) return; rt.resolveFull(d); updateBag(); break; }
          case "game": { const o = await playGame(cur, alive); if (!alive()) return; rt.gameResult(o); break; }
          case "ending": await showEnding(cur, alive); return;
        }
      }
    } catch (e) {
      console.error(e);
      if (DEV) window.__ch7.error = String(e && e.stack || e);
      showText({ kind: "narr", text: "Что-то сломалось в сценарии. Игра сохранена до этой сцены." }, alive);
    }
  }

  // ---------- text ----------
  const tb = $("textbox"), lineEl = $("line"), whoEl = $("who");
  let typing = null;
  function clearText() { lineEl.innerHTML = ""; whoEl.innerHTML = ""; tb.className = "textbox"; $("more").classList.remove("on"); }
  function setTextPos(pos) { $("game").classList.toggle("top", pos === "top"); setShade(); }
  // a denser shade under the text where the picture is dark and busy there (measured at build time)
  function setShade() {
    const g = $("game"), b = (STORY.assets.busy || {})[rt && rt.state.view.img] || "";
    g.classList.toggle("dense", b.includes(g.classList.contains("top") ? "t" : "b"));
  }
  function charName(id) { const c = STORY.chars[id]; return c ? c.name : id; }
  async function showText(ev, alive) {
    if (ev.n) lastN = ev.n;
    $("choices").innerHTML = ""; tb.style.bottom = "";
    const radio = ev.radio || (ev.who && STORY.chars[ev.who] && STORY.chars[ev.who].radio);
    tb.className = "textbox " + (ev.kind === "thought" ? "thought" : ev.kind === "say" ? "say" : "") + (radio ? " radio" : "");
    const name = ev.kind === "line" ? charName(ev.who) : ev.kind === "say" && STORY.chars.hero ? STORY.chars.hero.name : "";
    whoEl.innerHTML = name ? `<span>${esc(name)}</span>${ev.manner ? `<i>${esc(ev.manner)}</i>` : ""}` : "";
    // every letter is its own span so the line can appear letter by letter without reflowing
    const html = inline(ev.text);
    const tmp = document.createElement("div"); tmp.innerHTML = html;
    const chars = [];
    const wrap = node => {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          for (const ch of n.textContent) { const s = document.createElement("span"); s.textContent = ch; s.className = "h"; chars.push(s); frag.append(s); }
          n.replaceWith(frag);
        } else wrap(n);
      }
    };
    wrap(tmp);
    lineEl.innerHTML = ""; lineEl.append(...tmp.childNodes);
    $("more").classList.remove("on");
    if (radio) audio.boost = .03;
    if (settings.speed === "now" || FAST || reduce) chars.forEach(s => s.classList.remove("h"));
    else {
      await new Promise(res => {
        let i = 0, ticks = 0;
        const speed = radio ? 42 : 28;
        typing = { finish: () => { chars.forEach(s => s.classList.remove("h")); clearInterval(timer); typing = null; res(); } };
        const timer = setInterval(() => {
          if (!alive()) { clearInterval(timer); typing = null; res(); return; }
          for (let k = 0; k < 2 && i < chars.length; k++) chars[i++].classList.remove("h");
          if (++ticks % 2 === 0 && chars[i - 1] && chars[i - 1].textContent.trim()) audio.tick();
          if (i >= chars.length) typing.finish();
        }, speed * 2);
      });
    }
    audio.boost = 0;
  }
  let tapWaiter = null;
  function waitTap(alive) {
    $("more").classList.add("on"); want("tap");
    return new Promise(res => { tapWaiter = () => { tapWaiter = null; want(null); $("more").classList.remove("on"); res(); }; });
  }
  $("tap").addEventListener("click", () => {
    if (swiped) { swiped = false; return; }
    if (paused) return;
    if (back) { stepForward(); return; }
    if (typing) typing.finish();
    else if (tapWaiter) tapWaiter();
  });

  // ---------- looking back: earlier lines of the chapter, read-only (choices stay made) ----------
  let lastN = 0;      // number of the journal line on screen
  let back = null;    // { lines, k, saved } while the player looks at earlier lines
  let swiped = false;
  function chapterLines() {
    const log = (rt && rt.state.log || []).filter(e => !(e.n > lastN));
    let from = 0;
    for (let i = log.length - 1; i >= 0; i--) if (log[i].kind === "chapter") { from = i + 1; break; }
    return log.slice(from).filter(e => e.kind !== "chapter");
  }
  function updateBack() {
    const can = mode === "game" && (waiting === "tap" || waiting === "choices") && (back ? back.k > 0 : chapterLines().length > 1);
    $("backBtn").classList.toggle("on", !!can);
  }
  function lineHtml(e) {
    const name = e.kind === "line" ? charName(e.who) : e.kind === "say" && STORY.chars.hero ? STORY.chars.hero.name : "";
    return { cls: e.kind === "thought" ? "thought" : e.kind === "say" ? "say" : "", radio: e.radio || (e.who && STORY.chars[e.who] && STORY.chars[e.who].radio),
      who: name ? `<span>${esc(name)}</span>${e.manner ? `<i>${esc(e.manner)}</i>` : ""}` : "", text: inline(e.text) };
  }
  function showPast() {
    const h = lineHtml(back.lines[back.k]);
    tb.className = "textbox past " + h.cls + (h.radio ? " radio" : "");
    whoEl.innerHTML = h.who; lineEl.innerHTML = h.text; tb.style.bottom = "";
    updateBack();
  }
  function stepBack() {
    if (mode !== "game" || paused || (waiting !== "tap" && waiting !== "choices")) return;
    if (typing) typing.finish();
    if (!back) {
      const lines = chapterLines(); if (lines.length < 2) return;
      back = { lines, k: lines.length - 1, saved: { cls: tb.className, who: whoEl.innerHTML, line: lineEl.innerHTML, bottom: tb.style.bottom } };
      $("choices").classList.add("away"); $("more").classList.add("away");
    }
    if (back.k === 0) return;
    back.k--; audio.ui("ui_back"); showPast();
  }
  function stepForward() {
    if (!back) return;
    back.k++;
    if (back.k < back.lines.length - 1) { showPast(); return; }
    const s = back.saved; back = null;
    tb.className = s.cls; whoEl.innerHTML = s.who; lineEl.innerHTML = s.line; tb.style.bottom = s.bottom;
    $("choices").classList.remove("away"); $("more").classList.remove("away");
    updateBack();
  }
  function leaveBack() { if (back) { back.k = back.lines.length - 2; stepForward(); } }
  $("backBtn").addEventListener("click", e => { e.stopPropagation(); stepBack(); });
  // a swipe to the right over the scene is the same step back
  (() => {
    let x0 = null, y0 = 0;
    $("tap").addEventListener("pointerdown", e => { x0 = e.clientX; y0 = e.clientY; });
    $("tap").addEventListener("pointerup", e => {
      if (x0 == null) return;
      const dx = e.clientX - x0, dy = e.clientY - y0, w = $("game").clientWidth; x0 = null;
      if (dx > w * .18 && Math.abs(dy) < Math.abs(dx) * .6) { swiped = true; setTimeout(() => { swiped = false; }, 400); stepBack(); }
    });
  })();

  // the journal: every line of this chapter on a paper sheet
  function openJournal() {
    if (!rt || mode !== "game") return;
    leaveBack();
    const was = paused; paused = true;
    const lines = chapterLines(), ch = rt.state.view.chapter;
    $("journalChap").textContent = ch ? `Глава ${ch.num}. ${ch.title}` : "";
    $("journalList").innerHTML = lines.length ? lines.map(e => {
      const h = lineHtml(e);
      return `<p class="${h.cls}">${h.who ? `<b>${h.who}</b>` : ""}${h.cls === "say" ? `«${h.text}»` : h.text}</p>`;
    }).join("") : `<p class="none">Пока пусто.</p>`;
    openSheet("journal", () => { paused = was; });
    requestAnimationFrame(() => { const j = $("journal"); j.scrollTop = j.scrollHeight; });
  }
  $("logBtn").addEventListener("click", e => { e.stopPropagation(); if (!paused) openJournal(); });

  // ---------- choices ----------
  function showChoices(ev, alive) {
    const box = $("choices"); box.innerHTML = ""; box.className = "choices";
    $("more").classList.remove("on");
    return new Promise(res => {
      let done = false, timer = null;
      const finish = r => { if (done) return; done = true; want(null); clearTimeout(timer); res(r); };
      want("choices");
      if (ev.timer) {
        // the time runs only while the player is actually in the scene (not in the backpack, pause or a hidden tab)
        const bar = document.createElement("div"); bar.className = "timer"; box.append(bar);
        const sec = FAST && !qs.has("shots") ? .2 : ev.timer.sec;
        let left = sec, last = performance.now();
        const tick = () => {
          const t = performance.now(), dt = (t - last) / 1000; last = t;
          if (!alive() || done) return;
          if (!paused && !back && !document.hidden && !(DEV && window.__ch7 && window.__ch7.freeze)) left -= dt;
          bar.style.transform = `scaleX(${Math.max(0, left / sec)})`;
          if (left <= 0) { box.classList.add("done"); timer = setTimeout(() => finish("timeout"), 300); return; }
          timer = setTimeout(tick, 50);
        };
        tick();
      }
      ev.items.forEach((c, k) => {
        const b = document.createElement("button"); b.className = "underline" + (c.locked ? " locked" : ""); b.dataset.i = c.i;
        b.innerHTML = `<span>${inline(c.speech ? `«${c.text}»` : c.text)}</span>`;
        b.style.animationDelay = (k * .12) + "s";
        b.onclick = e => {
          e.stopPropagation();
          if (done || paused) return;
          if (c.locked) { vibrate(8); b.animate([{ transform: "translateX(0)" }, { transform: "translateX(1.2cqw)" }, { transform: "translateX(-1cqw)" }, { transform: "translateX(0)" }], { duration: 260 }); return; }
          b.classList.add("picked"); box.classList.add("done"); vibrate(10);
          // a quiet pencil tick for most choices, the ringing one only for the few that change the story
          audio.ui(c.key && (STORY.assets.sfx || []).includes("ui_choice_key") ? "ui_choice_key" : "ui_choice");
          setTimeout(() => { box.innerHTML = ""; finish(c.i); }, FAST ? 10 : 520);
        };
        box.append(b);
      });
      // lift the last line above the choices
      requestAnimationFrame(() => { if (!$("game").classList.contains("top")) tb.style.bottom = `calc(${box.offsetHeight}px + 7cqh + env(safe-area-inset-bottom))`; });
    });
  }

  // ---------- backpack ----------
  let bagTab = "items", bagSel = null;
  function updateBag() {
    if (!rt) return;
    $("bagCount").textContent = rt.slotted().length || "";
  }
  function renderBag() {
    const s = rt.state;
    const slots = $("slots"); slots.innerHTML = "";
    const inBag = rt.slotted(), pocket = s.items.filter(id => !inBag.includes(id));
    for (let k = 0; k < STORY.slots; k++) {
      const id = inBag[k];
      const b = document.createElement("button"); b.className = "slot" + (id ? "" : " empty");
      if (id) {
        const it = STORY.items[id];
        b.setAttribute("aria-pressed", String(bagSel === id)); b.setAttribute("aria-label", it.name);
        if (STORY.assets && !STORY.assets.icons.includes(id)) b.textContent = it.name;
        else { const img = new Image(); img.alt = ""; img.src = assetUrl(`items/${id}.png`); img.onerror = () => { b.textContent = it.name; }; b.append(img); }
        b.onclick = () => { bagSel = id; renderBag(); };
      }
      slots.append(b);
    }
    $("pocket").innerHTML = pocket.length ? `<span>в кармане</span>` : "";
    for (const id of pocket) { const b = document.createElement("button"); b.className = "pick"; b.textContent = STORY.items[id].name; b.setAttribute("aria-pressed", String(bagSel === id)); b.onclick = () => { bagSel = id; renderBag(); }; $("pocket").append(b); }
    const it = bagSel && s.items.includes(bagSel) ? STORY.items[bagSel] : null;
    $("itemDesc").innerHTML = it ? `<b>${esc(it.name)}</b>${inline(rt.fmt(it.desc))}` : s.items.length ? "Коснись вещи, чтобы рассмотреть." : "Пока пусто.";
    const f = $("bagFound"); f.innerHTML = "";
    if (!s.found.length) f.innerHTML = "<p>Пока ничего не найдено.</p>";
    for (const id of s.found) {
      const d = STORY.docs[id]; if (!d) continue;
      const b = document.createElement("button"); b.textContent = d.title || id;
      b.onclick = () => showDoc(id);
      f.append(b);
    }
    $("bagItems").classList.toggle("hidden", bagTab !== "items"); $("bagFound").classList.toggle("hidden", bagTab !== "found");
    $("bagTabs").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tab === bagTab)));
  }
  $("bagTabs").onclick = e => { const b = e.target.closest("button"); if (b) { bagTab = b.dataset.tab; renderBag(); } };
  $("bagBtn").onclick = e => { e.stopPropagation(); if (!rt || paused) return; renderBag(); paused = true; openSheet("bag", () => { paused = false; }); };

  function askFull(ev, alive) {
    audio.ui("item_full");
    const name = id => STORY.items[id] ? STORY.items[id].name : id;
    $("fullText").textContent = `Что оставить здесь, чтобы взять «${name(ev.item).toLowerCase()}»?`;
    const list = $("fullList"); list.innerHTML = "";
    return new Promise(res => {
      [...ev.items, ev.item].forEach(id => {
        const b = document.createElement("button"); b.dataset.id = id;
        b.textContent = id === ev.item ? `${name(id)} — не брать` : name(id);
        b.onclick = e => { e.stopPropagation(); want(null); $("full").classList.add("gone"); open.splice(open.findIndex(o => o.id === "full"), 1); res(id); };
        list.append(b);
      });
      openCard("full"); want("full");
    });
  }

  // ---------- documents ----------
  function showDoc(id, onClose) {
    const d = STORY.docs[id]; if (!d) { onClose && onClose(); return; }
    const el = $("doc"); el.className = "sheet doc " + d.kind;
    $("docTitle").textContent = d.title || "";
    $("docBody").innerHTML = d.paras.map(p => `<p>${inline(rt.fmt(p))}</p>`).join("");
    el.scrollTop = 0;
    openSheet("doc", onClose);
  }

  // ---------- commands ----------
  const toastEl = $("toast"); let toastTimer;
  function toast(text) {
    toastEl.innerHTML = inline(text); toastEl.classList.add("on");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("on"), FAST ? 50 : 2800);
  }
  async function applyCmd(ev, alive) {
    const a = ev.a;
    switch (ev.name) {
      case "image": shown = { img: a.id, node: rt.state.node }; scene.show(a.id, a.how); setTextPos("bottom"); if (a.how === "cut") vibrate(15); preloadAhead(); break;
      case "black": shown = { img: null, node: rt.state.node }; clearText(); setTextPos("bottom"); scene.toBlack(1.2); break;
      case "anim": scene.setFx(a.fx); break;
      case "pan": scene.pan(a.dir === "off" ? null : a.dir, a.sec); break;
      case "focus": scene.focus(a.off ? null : a); break;
      case "shake": scene.doShake(); vibrate(40); break;
      case "flash": scene.doFlash(); break;
      case "text": setTextPos(a.pos); clearText(); break;
      case "music": audio.loop("music", a.id === "stop" ? null : a.id, a.fade || 2.5); break;
      case "amb": audio.loop("amb", a.id === "stop" ? null : a.id, a.fade || 2.5); break;
      case "sfx": audio.sfx(a.id); break;
      case "radio": audio.radio(a.n); break;
      case "silence": audio.silence(); break;
      case "vibrate": vibrate(60); break;
      case "toast": toast(a.text); break;
      case "wait": clearText(); await sleep(a.n * 1000); break;
      case "chapter": {
        clearText();
        $("chapNum").textContent = /^\d+$/.test(a.num) ? `глава ${a.num}` : a.num; $("chapTitle").textContent = a.title;
        $("chapter").classList.remove("gone");
        want("chapter"); await Promise.race([sleep(3400), waitTapOnce($("chapter"))]); want(null);
        $("chapter").classList.add("gone"); await sleep(600);
        break;
      }
      case "doc": if (!rt.state.found.slice(0, -1).includes(a.id)) audio.ui("clue_found"); else audio.ui("paper_unfold");
        await new Promise(res => { paused = true; want("doc"); showDoc(a.id, () => { paused = false; want(null); res(); }); }); break;
      case "video": await playVideo(a.id, alive); break;
    }
  }
  function waitTapOnce(el) { return new Promise(res => el.addEventListener("click", res, { once: true })); }
  function preloadAhead() {
    // pictures used by the nodes one or two steps ahead
    const s = rt.state, ids = new Set(), seen = new Set();
    const visit = (id, depth) => {
      const n = STORY.nodes[id]; if (!n || seen.has(id)) return; seen.add(id);
      for (const op of n.ops) {
        if (op.op === "cmd" && op.name === "image") ids.add(op.a.id);
        if (depth < 2) {
          if (op.op === "goto") visit(op.target, depth + 1);
          if (op.op === "choices") op.items.forEach(c => visit(c.target, depth + 1));
          if (op.op === "game") Object.values(op.outcomes).forEach(t => visit(t, depth + 1));
        }
      }
    };
    visit(s.node, 0);
    scene.preload([...ids]);
  }
  async function playVideo(id, alive) {
    const box = $("video"), v = box.querySelector("video");
    v.src = assetUrl(`video/${id}.mp4`);
    box.classList.remove("gone");
    try { await v.play(); } catch (e) { box.classList.add("gone"); return; }
    await Promise.race([new Promise(r => v.onended = r), waitTapOnce(box), new Promise(r => v.onerror = r)]);
    box.classList.add("gone"); v.pause();
  }

  // ---------- mini-games ----------
  let skipGame = null;
  async function playGame(ev, alive) {
    clearText();
    const def = (window.MINIGAMES || {})[ev.id];
    const box = $("mini"), area = $("miniArea"), acts = $("miniActs");
    area.innerHTML = ""; acts.innerHTML = "";
    $("miniTitle").textContent = (STORY.games[ev.id] && STORY.games[ev.id].title) || "";
    box.classList.remove("gone");
    let resolve; const result = new Promise(r => resolve = r);
    let finished = false;
    const done = o => { if (finished) return; finished = true; resolve(ev.outcomes.includes(o) ? o : ev.outcomes[ev.outcomes.length - 1]); };
    skipGame = () => done((def && def.skip) || "fail");
    if (DEV) { window.__ch7.game = { id: ev.id, params: ev.params, outcomes: ev.outcomes, done }; want("game"); }
    let stop = null;
    if (def) {
      stop = def.start({ area, acts, box, params: ev.params, state: rt.state, story: STORY, audio, scene, vibrate, sleep, hint: (who, text) => miniHint(who, text), done, fast: FAST && !qs.has("shots"), assetUrl, fmt: t => rt.fmt(t), paused: () => paused, sceneImage: () => scene.cur ? scene.cur.img : null });
    } else {
      // a mini-game the engine does not know yet: let the player pick the outcome
      area.innerHTML = `<p class="note">Здесь будет мини-игра «${esc(ev.id)}».</p>`;
      for (const o of ev.outcomes) { const b = document.createElement("button"); b.className = "hand"; b.textContent = o; b.onclick = () => done(o); acts.append(b); }
    }
    const o = await result;
    if (typeof stop === "function") stop();
    skipGame = null;
    if (DEV) { window.__ch7.game = null; want(null); }
    await sleep(400);
    box.classList.add("gone"); box.classList.remove("solidhint"); hideMiniHint(); box.style.background = ""; box.style.backdropFilter = box.style.webkitBackdropFilter = "";
    return o;
  }
  function miniHint(who, text) {
    let el = $("miniHint");
    if (!el) { el = document.createElement("div"); el.id = "miniHint"; el.className = "textbox"; el.style.zIndex = 24; el.innerHTML = '<div class="who"></div><p class="line"></p>'; $("game").append(el); }
    el.querySelector(".who").innerHTML = who ? `<span>${esc(charName(who))}</span>` : "";
    el.querySelector(".line").innerHTML = inline(rt.fmt(text));
    el.style.opacity = 1;
  }
  function hideMiniHint() { const el = $("miniHint"); if (el) el.style.opacity = 0; }

  // ---------- ending ----------
  async function showEnding(ev, alive) {
    const e = STORY.endings[ev.id] || { title: ev.id, line: "" };
    save = null; store.del("save"); store.set("persist", persist);
    clearText(); audio.loop("amb", null, 4);
    await sleep(1200);
    $("endTitle").textContent = e.title; $("endLine").innerHTML = inline(rt.fmt(e.line));
    const total = Object.keys(STORY.endings).length, got = Object.keys(persist.endings).filter(k => STORY.endings[k]).length;
    $("endTally").textContent = `открыто концовок: ${got} из ${total}`;
    $("ending").classList.remove("gone"); want("ending");
    await waitTapOnce($("endMenu")); want(null);
    backToTitle();
  }

  // ---------- pause ----------
  function pauseGame(auto) {
    if (mode !== "game" || paused) return;
    paused = true;
    const pm = $("pause").querySelector(".pausemenu");
    let sk = pm.querySelector('[data-act="skip"]');
    if (skipGame && !sk) { sk = document.createElement("button"); sk.dataset.act = "skip"; sk.textContent = "Пропустить испытание"; pm.insertBefore(sk, pm.lastElementChild); }
    if (!skipGame && sk) sk.remove();
    openSheet("pause", () => { paused = false; });
  }
  $("pauseBtn").onclick = e => { e.stopPropagation(); pauseGame(); };
  $("pause").addEventListener("click", e => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    e.stopPropagation();
    const a = b.dataset.act;
    if (a === "resume") closeTop();
    if (a === "journal") openJournal();
    if (a === "settings") openSheet("settings");
    if (a === "home") { closeAll(); backToTitle(); }
    if (a === "skip") { closeTop(); if (skipGame) skipGame(); }
  });

  // ---------- desktop QR ----------
  if (window.makeQR) { try { $("qr").innerHTML = makeQR(location.href.split("?")[0]); } catch (e) { $("qr").remove(); } } else $("qr").remove();

  // ---------- test hooks ----------
  if (DEV) {
    window.__ch7 = {
      get rt() { return rt; }, get mode() { return mode; }, get paused() { return paused; }, get sceneBusy() { return scene.busy(); }, get saved() { return save && save.snap; }, get shown() { return shown; },
      get scene() { return scene; }, story: STORY, wake, enterGame, backToTitle, last: null, error: null, game: null, want: null, wantSeq: 0,
    };
  }
  boot();
})();
