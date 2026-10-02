// Static checks and the full branch walk over a parsed story.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { exprRefs } from "../src/expr.js";
import { Runtime, freshPersist } from "../src/runtime.js";
import { ROOT } from "./load.mjs";

const AUDIO_DIRS = { music: "music", amb: "amb", sfx: "sfx" };

// ---------- static checks ----------
export function staticCheck(story) {
  const errors = [], warnings = [], info = {};
  const where = (n, op) => `${n.file}:${op ? op.ln : n.line}`;
  const declared = v => v in story.vars || v in story.persist || v === "run";
  const used = { images: new Set(), docs: new Set(), games: new Set(), endings: new Set(), audio: { music: new Set(), amb: new Set(), sfx: new Set() }, video: new Set(), items: new Set() };

  if (story.start && !story.nodes[story.start]) errors.push(`setup.md: стартового узла ${story.start} нет`);
  if (story.vars.hero_f === undefined) warnings.push("setup.md: не объявлена hero_f, варианты [внук|внучка] всегда будут первыми");

  const checkExpr = (e, at) => {
    if (!e) return;
    const r = exprRefs(e);
    for (const v of r.vars) if (!declared(v)) errors.push(`${at}: переменная ${v} не объявлена в setup.md`);
    for (const [f, a] of r.calls) {
      if (f === "has" && !story.items[a]) errors.push(`${at}: has(${a}) — такого предмета нет в setup.md`);
      if ((f === "seen" || f === "ever") && !story.nodes[a]) errors.push(`${at}: ${f}(${a}) — такого узла нет`);
      if (f === "read" && !story.docs[a]) errors.push(`${at}: read(${a}) — такой находки нет в docs.md`);
      if (f === "ending" && !story.endings[a]) errors.push(`${at}: ending(${a}) — такой концовки нет в setup.md`);
    }
  };
  const checkStmt = (st, at) => {
    if (st.k === "set") { if (!(st.v in story.vars || st.v in story.persist)) errors.push(`${at}: переменная ${st.v} не объявлена в setup.md`); checkExpr(st.e, at); }
    else { if (!story.items[st.id]) errors.push(`${at}: ${st.k} ${st.id} — такого предмета нет в setup.md`); used.items.add(st.id); }
  };
  const target = (t, at) => { if (!story.nodes[t]) errors.push(`${at}: перехода некуда, узла ${t} нет`); };

  const edges = {};
  for (const n of Object.values(story.nodes)) {
    edges[n.id] = new Set();
    n.ops.forEach(op => {
      const at = where(n, op);
      if (op.op === "jf") checkExpr(op.e, at);
      if (op.op === "set") checkStmt(op.st, at);
      if (op.op === "goto") { target(op.target, at); edges[n.id].add(op.target); }
      if (op.op === "ending") { if (!story.endings[op.id]) errors.push(`${at}: концовки ${op.id} нет в setup.md`); used.endings.add(op.id); }
      if (op.op === "game") {
        // mini-games that read docs themselves: reel shows tape_* as subtitles, cipher decodes journal_last
        for (const id of Object.keys(story.docs)) if ((op.id === "reel" && id.startsWith("tape_")) || (op.id === "cipher" && id === "journal_last")) used.docs.add(id);
        used.games.add(op.id);
        const g = story.games[op.id];
        if (!g) errors.push(`${at}: мини-игра ${op.id} не описана в minigames.md`);
        else {
          for (const o of g.outcomes) if (!op.outcomes[o]) errors.push(`${at}: у мини-игры ${op.id} не указан исход ${o}`);
          for (const o of Object.keys(op.outcomes)) if (!g.outcomes.includes(o)) errors.push(`${at}: у мини-игры ${op.id} нет исхода ${o} (есть: ${g.outcomes.join(", ")})`);
        }
        for (const t of Object.values(op.outcomes)) { target(t, at); edges[n.id].add(t); }
      }
      if (op.op === "choices") {
        if (op.timer) { target(op.timer.target, at); edges[n.id].add(op.timer.target); }
        for (const ch of op.items) {
          const cat = `${n.file}:${ch.ln}`;
          checkExpr(ch.if, cat); checkExpr(ch.need, cat); ch.effects.forEach(st => checkStmt(st, cat));
          target(ch.target, cat); edges[n.id].add(ch.target);
        }
        if (op.items.every(c => c.once)) errors.push(`${at}: все выборы с [once], после них игрок застрянет; оставьте выход без [once]`);
      }
      if (op.op === "cmd") {
        const a = op.a;
        if (op.name === "image") { used.images.add(a.id); if (!story.images[a.id]) errors.push(`${at}: картинки ${a.id} нет в images.md`); }
        if (op.name === "doc") { used.docs.add(a.id); if (!story.docs[a.id]) errors.push(`${at}: находки ${a.id} нет в docs.md`); }
        if (op.name === "video") used.video.add(a.id);
        if (AUDIO_DIRS[op.name] && a.id !== "stop") used.audio[op.name].add(a.id);
      }
    });
    // falling off the end: walk the node's own control flow, both sides of every condition
    const seen = new Set(), stack = [0];
    while (stack.length) {
      const pc = stack.pop(); if (pc < 0 || seen.has(pc)) continue; seen.add(pc);
      if (pc >= n.ops.length) { errors.push(`${n.file}:${n.line}: узел ${n.id} может кончиться без выхода (нет выбора, «-> узел» или @ending в конце)`); break; }
      const op = n.ops[pc];
      if (op.op === "goto" || op.op === "ending" || op.op === "choices" || op.op === "game") continue;
      if (op.op === "jmp") { stack.push(op.to); continue; }
      if (op.op === "jf") stack.push(op.to);
      stack.push(pc + 1);
    }
    if (!n.ops.some(op => op.op === "cmd" && (op.name === "image" || op.name === "black")) && n.id === story.start) warnings.push(`${where(n)}: в стартовом узле нет @image`);
  }

  // static reachability
  const reach = new Set();
  if (story.nodes[story.start]) { const st = [story.start]; while (st.length) { const id = st.pop(); if (reach.has(id)) continue; reach.add(id); for (const t of edges[id] || []) if (story.nodes[t]) st.push(t); } }
  for (const n of Object.values(story.nodes)) if (!reach.has(n.id)) warnings.push(`${n.file}:${n.line}: на узел ${n.id} нет переходов со старта`);

  for (const id of Object.keys(story.images)) if (!used.images.has(id)) warnings.push(`images.md: картинка ${id} описана, но нигде не показывается`);
  for (const id of Object.keys(story.docs)) if (!used.docs.has(id)) warnings.push(`docs.md: находка ${id} нигде не показывается`);
  for (const id of Object.keys(story.endings)) if (!used.endings.has(id)) errors.push(`setup.md: концовка ${id} нигде не вызывается`);
  for (const id of Object.keys(story.items)) if (!used.items.has(id)) warnings.push(`setup.md: предмет ${id} нигде не берут`);

  // files that are not there yet
  const exists = p => fs.existsSync(path.join(ROOT, p));
  info.missingImages = [...used.images].filter(id => !exists(`art/scenes/${id}.jpg`));
  info.missingAudio = Object.entries(used.audio).flatMap(([k, set]) => [...set].filter(id => !exists(`audio/${AUDIO_DIRS[k]}/${id}.mp3`)).map(id => `${k}/${id}`));
  info.missingVideo = [...used.video].filter(id => !exists(`art/video/${id}.mp4`));
  info.missingIcons = Object.keys(story.items).filter(id => !exists(`art/items/${id}.png`));
  info.used = used;
  return { errors, warnings, info };
}

// ---------- branch walk ----------
// Two searches over the same decisions (choices, timer running out, mini-game outcomes, what to leave when the backpack is full):
// explore() is exhaustive breadth-first up to a state limit, coverage() is many novelty-seeking playthroughs that scale to a long story.
// Only the parts of state that can change the story go into the state key, and keys are kept as short hashes.

function storyRefs(story) {
  const seenRefs = new Set(), readRefs = new Set();
  const scan = e => { if (!e) return; const r = exprRefs(e); for (const [f, a] of r.calls) { if (f === "seen" || f === "ever") seenRefs.add(a); if (f === "read") readRefs.add(a); } };
  for (const n of Object.values(story.nodes)) for (const op of n.ops) {
    if (op.op === "jf") scan(op.e);
    if (op.op === "set" && op.st.e) scan(op.st.e);
    if (op.op === "choices") for (const ch of op.items) { scan(ch.if); scan(ch.need); ch.effects.forEach(st => st.e && scan(st.e)); }
  }
  return { seenRefs: [...seenRefs], readRefs: [...readRefs] };
}

// runs until the player has to decide; marks every node passed on the way (also nodes without any text)
function advance(rt, visited) {
  for (;;) {
    const ev = rt.step();
    for (const id in rt.state.seen) visited.add(id);
    if (ev.t === "text" || ev.t === "cmd" || ev.t === "took") continue;
    return ev;
  }
}

function decisions(rt, ev) {
  const node = rt.state.node, out = [];
  if (ev.t === "choices") {
    for (const c of ev.items) if (!c.locked) out.push({ t: "choice", i: c.i, node, text: c.text });
    if (ev.timer) out.push({ t: "timeout", node });
  } else if (ev.t === "game") for (const o of ev.outcomes) out.push({ t: "game", outcome: o, node, id: ev.id });
  else if (ev.t === "full") for (const d of [...ev.items, ev.item]) out.push({ t: "full", drop: d, node });
  return out;
}
function apply(rt, d) {
  if (d.t === "choice") rt.choose(d.i); else if (d.t === "timeout") rt.timeout();
  else if (d.t === "game") rt.gameResult(d.outcome); else rt.resolveFull(d.drop);
}
// what the checker remembers about the choices it saw
function noteChoices(rt, ev, shown, opened) {
  if (ev.t !== "choices") return;
  const op = rt.currentOp();
  for (const c of ev.items) { const k = `${rt.state.node}:${op.items[c.i].ln}`; shown.add(k); if (!c.locked && op.items[c.i].need) opened.add(k); }
}

export function explore(story, { persist = null, limit = 150000, seconds = 60 } = {}) {
  const t0 = Date.now();
  const { seenRefs, readRefs } = storyRefs(story);
  const basePersist = JSON.stringify(persist || freshPersist());
  const rt = new Runtime(story, JSON.parse(basePersist));
  rt.newGame();
  const persistSnap = JSON.stringify(rt.persist);
  const keyOf = s => crypto.createHash("sha1").update(JSON.stringify([s.node, s.pc, s.queue, s.vars, [...s.items].sort(), seenRefs.filter(x => s.seen[x]), readRefs.filter(x => s.read[x]), s.once, s.full || null, s.ended, s.pvars || null])).digest("base64");

  const ids = new Map();          // hash -> state id
  const parent = [], via = [], edges = [], nodeOf = [], ending = [], dead = [];
  const queue = [];               // [id, serialized state]
  const visitedNodes = new Set(), shownChoices = new Set(), openedNeeds = new Set(), errors = [], endings = {};
  const add = (state, from, how) => {
    const key = keyOf(state);
    let id = ids.get(key);
    if (id === undefined) {
      id = parent.length; ids.set(key, id);
      parent.push(from); via.push(how); edges.push([]); nodeOf.push(state.node); ending.push(null); dead.push(false);
      queue.push([id, JSON.stringify(state)]);
    }
    if (from != null) edges[from].push(id);
    return id;
  };
  const route = id => { const r = []; while (id != null && via[id]) { r.unshift(via[id]); id = parent[id]; } return r; };
  add(rt.state, null, null);

  let truncated = false, head = 0;
  while (head < queue.length) {
    if (parent.length > limit || ((head & 1023) === 0 && Date.now() - t0 > seconds * 1000)) { truncated = true; break; }
    const [cur, ser] = queue[head]; queue[head++] = null;
    rt.state = JSON.parse(ser); rt.persist = JSON.parse(persistSnap);
    let ev;
    try { ev = advance(rt, visitedNodes); }
    catch (e) { errors.push({ msg: e.message, node: rt.state.node, route: route(cur) }); dead[cur] = true; continue; }
    if (ev.t === "ending") { ending[cur] = ev.id; (endings[ev.id] ||= []).push(cur); continue; }
    noteChoices(rt, ev, shownChoices, openedNeeds);
    const ds = decisions(rt, ev);
    if (!ds.length) { errors.push({ msg: `узел ${rt.state.node}: все выборы скрыты или закрыты, игрок застрял`, node: rt.state.node, route: route(cur) }); dead[cur] = true; continue; }
    const base = JSON.stringify(rt.state);
    for (const d of ds) {
      rt.state = JSON.parse(base); rt.persist = JSON.parse(persistSnap);
      try { apply(rt, d); } catch (e) { errors.push({ msg: e.message, node: d.node, route: [...route(cur), d] }); continue; }
      add(rt.state, cur, d);
    }
  }

  // states from which no ending can be reached (loops the player can't leave); only meaningful when the search finished
  const trapNodes = new Map();
  if (!truncated) {
    const rev = parent.map(() => []);
    edges.forEach((es, s) => es.forEach(t => rev[t].push(s)));
    const good = new Uint8Array(parent.length), st = [];
    ending.forEach((e, i) => { if (e) st.push(i); });
    while (st.length) { const id = st.pop(); if (good[id]) continue; good[id] = 1; rev[id].forEach(p => st.push(p)); }
    for (let i = 0; i < parent.length; i++) if (!good[i] && !dead[i] && !trapNodes.has(nodeOf[i])) trapNodes.set(nodeOf[i], route(i));
  }
  const endingRoutes = {};
  for (const [id, list] of Object.entries(endings)) endingRoutes[id] = route(list[0]);
  return {
    states: parent.length, truncated, errors, endings: Object.fromEntries(Object.entries(endings).map(([k, v]) => [k, v.length])), endingRoutes,
    visitedNodes, shownChoices, openedNeeds, traps: [...trapNodes.entries()],
  };
}

// Many playthroughs that prefer what has not been tried yet (least-taken decision first, random among equals).
// A walk that keeps going for very long without an ending is reported as a possible loop.
export function coverage(story, { persist = null, walks = 3000, seconds = 40, maxSteps = 4000, seed = 11 } = {}) {
  let x = seed; const rnd = k => { x = (x + 0x6D2B79F5) | 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) % k; };
  const taken = new Map(), visitedNodes = new Set(), shownChoices = new Set(), openedNeeds = new Set();
  const errors = [], loops = [], stuck = [], endings = {}, endingRoutes = {};
  const t0 = Date.now(); let n = 0;
  const basePersist = JSON.stringify(persist || freshPersist());
  for (; n < walks && Date.now() - t0 < seconds * 1000; n++) {
    const rt = new Runtime(story, JSON.parse(basePersist)); rt.newGame();
    const route = []; let done = false;
    try {
      for (let steps = 0; steps < maxSteps; steps++) {
        const ev = advance(rt, visitedNodes);
        if (ev.t === "ending") {
          endings[ev.id] = (endings[ev.id] || 0) + 1;
          if (!endingRoutes[ev.id] || endingRoutes[ev.id].length > route.length) endingRoutes[ev.id] = route.slice();
          done = true; break;
        }
        noteChoices(rt, ev, shownChoices, openedNeeds);
        const ds = decisions(rt, ev);
        if (!ds.length) { if (stuck.length < 20) stuck.push({ node: rt.state.node, route: route.slice() }); done = true; break; }
        // novelty first, a little randomness so equal counts spread out
        const key = d => `${d.node}|${d.t}|${d.i ?? d.outcome ?? d.drop ?? ""}`;
        let best = [], bestN = Infinity;
        for (const d of ds) { const c = taken.get(key(d)) || 0; if (c < bestN) { bestN = c; best = [d]; } else if (c === bestN) best.push(d); }
        const d = rnd(4) === 0 ? ds[rnd(ds.length)] : best[rnd(best.length)];
        taken.set(key(d), (taken.get(key(d)) || 0) + 1);
        route.push(d); apply(rt, d);
      }
      if (!done && loops.length < 10) loops.push({ node: rt.state.node, route: route.slice(process.env.FULLROUTE ? 0 : -12) });
    } catch (e) { if (errors.length < 30) errors.push({ msg: e.message, node: rt.state && rt.state.node, route: route.slice() }); }
  }
  return { walks: n, endings, endingRoutes, visitedNodes, shownChoices, openedNeeds, errors, loops, stuck };
}

// Playthroughs that together show every picture at least once (greedy cover over novelty-seeking walks), for screenshots.
export function imageCover(story, { persist = null, walks = 4000, seconds = 40, seed = 23, want = null } = {}) {
  let x = seed; const rnd = k => { x = (x + 0x6D2B79F5) | 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) % k; };
  const goal = new Set(want || Object.keys(story.images));
  const taken = new Map(), runs = [], t0 = Date.now();
  const basePersist = JSON.stringify(persist || freshPersist());
  for (let n = 0; n < walks && Date.now() - t0 < seconds * 1000; n++) {
    const rt = new Runtime(story, JSON.parse(basePersist)); rt.newGame();
    const route = [], imgs = new Set(), seen = new Set();
    try {
      for (let steps = 0; steps < 3000; steps++) {
        let ev;
        for (;;) { ev = rt.step(); if (rt.state.view.img) imgs.add(rt.state.view.img); if (ev.t === "text" || ev.t === "cmd" || ev.t === "took") continue; break; }
        if (ev.t === "ending") { runs.push({ route, ending: ev.id, imgs }); break; }
        const ds = decisions(rt, ev); if (!ds.length) break;
        const key = d => `${d.node}|${d.t}|${d.i ?? d.outcome ?? d.drop ?? ""}`;
        let best = [], bestN = Infinity;
        for (const d of ds) { const c = taken.get(key(d)) || 0; if (c < bestN) { bestN = c; best = [d]; } else if (c === bestN) best.push(d); }
        const d = rnd(3) === 0 ? ds[rnd(ds.length)] : best[rnd(best.length)];
        taken.set(key(d), (taken.get(key(d)) || 0) + 1);
        route.push(d); apply(rt, d);
      }
    } catch (e) { /* the checker reports engine errors; here a broken walk is just skipped */ }
  }
  // greedy: the walk that adds the most unseen pictures, shorter first on ties
  const chosen = [], left = new Set(goal);
  while (left.size) {
    let bestRun = null, gain = 0;
    for (const r of runs) { let g = 0; for (const i of r.imgs) if (left.has(i)) g++; if (g > gain || (g === gain && g && r.route.length < bestRun.route.length)) { gain = g; bestRun = r; } }
    if (!bestRun) break;
    chosen.push(bestRun); for (const i of bestRun.imgs) left.delete(i);
  }
  return { routes: chosen, missing: [...left], walks: runs.length };
}

// ---------- reading time: random playthroughs ----------
export function sampleRuns(story, n = 300, seed = 7) {
  let x = seed; const rnd = k => { x = (x + 0x6D2B79F5) | 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) % k; };
  const out = [];
  for (let r = 0; r < n; r++) {
    const rt = new Runtime(story, freshPersist()); rt.newGame();
    let words = 0, choices = 0, games = 0, steps = 0, ending = null;
    try {
      while (steps++ < 20000) {
        const ev = rt.step();
        if (ev.t === "text") words += ev.text.split(/\s+/).length;
        else if (ev.t === "choices") { const open = ev.items.filter(c => !c.locked); if (!open.length) break; rt.choose(open[rnd(open.length)].i); choices++; }
        else if (ev.t === "game") { rt.gameResult(ev.outcomes[rnd(ev.outcomes.length)]); games++; }
        else if (ev.t === "full") { const all = [...ev.items, ev.item]; rt.resolveFull(all[rnd(all.length)]); }
        else if (ev.t === "ending") { ending = ev.id; break; }
        else if (ev.t === "cmd" && ev.name === "doc") { const d = story.docs[ev.a.id]; if (d) words += d.paras.join(" ").split(/\s+/).length; }
      }
    } catch (e) { /* reported by explore */ }
    // ~150 words a minute of lyrical prose on a phone, ~8 s per choice, ~2 min per mini-game
    out.push({ ending, minutes: words / 150 + choices * 8 / 60 + games * 2, words, choices });
  }
  return out;
}

// one random playthrough as a list of decisions (the same shape as explore() routes)
export function randomRoute(story, seed = 1, persist = null) {
  let x = seed * 9301 + 49297; const rnd = k => { x = (x + 0x6D2B79F5) | 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) % k; };
  const rt = new Runtime(story, persist ? JSON.parse(JSON.stringify(persist)) : freshPersist()); rt.newGame();
  const route = [];
  for (let steps = 0; steps < 50000; steps++) {
    const ev = rt.step();
    if (ev.t === "choices") {
      const open = ev.items.filter(c => !c.locked);
      if (ev.timer && (!open.length || rnd(5) === 0)) { route.push({ t: "timeout", node: rt.state.node }); rt.timeout(); continue; }
      if (!open.length) return { route, ending: null, stuck: rt.state.node };
      const c = open[rnd(open.length)]; route.push({ t: "choice", i: c.i, node: rt.state.node, text: c.text }); rt.choose(c.i);
    } else if (ev.t === "game") { const o = ev.outcomes[rnd(ev.outcomes.length)]; route.push({ t: "game", outcome: o, node: rt.state.node, id: ev.id }); rt.gameResult(o); }
    else if (ev.t === "full") { const all = [...ev.items, ev.item]; const d = all[rnd(all.length)]; route.push({ t: "full", drop: d, node: rt.state.node }); rt.resolveFull(d); }
    else if (ev.t === "ending") return { route, ending: ev.id };
  }
  return { route, ending: null, stuck: "loop" };
}
