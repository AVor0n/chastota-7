// Story runtime: walks the compiled ops, keeps variables, backpack and what the screen shows.
// No DOM here, so the same code drives the game in the browser and the branch explorer in tools/check.mjs.
import { evalExpr } from "./expr.js";

const clone = o => JSON.parse(JSON.stringify(o));

export function freshPersist() { return { run: 0, vars: {}, endings: {}, ever: {} }; }

export class Runtime {
  constructor(story, persist) {
    this.story = story;
    this.persist = persist || freshPersist();
    for (const [k, v] of Object.entries(story.persist)) if (!(k in this.persist.vars)) this.persist.vars[k] = v;
    this.state = null; this.snapshot = null;
  }

  // ---------- life cycle ----------
  newGame() {
    this.persist.run++;
    this.state = {
      node: null, pc: 0, queue: [], vars: clone(this.story.vars), items: [], seen: {}, read: {}, found: [], once: {},
      view: { img: null, how: "fade", fx: [], pan: null, focus: null, text: "bottom", music: null, amb: null, radio: 0, chapter: null },
      log: [], wait: null, ended: null, pvars: {},
    };
    this.enter(this.story.start);
  }
  load(snap) { this.state = clone(snap); this.state.pvars ||= {}; this.snapshot = clone(this.state); }
  // What a playthrough leaves for the next ones (nodes passed, memory variables) is written to persist only when it
  // ends, or when the player starts over (retire the unfinished one). Until then it lives in the state, so going back
  // to a save never sees anything from the part of the run that was replayed.
  commit(s = this.state) {
    for (const id in s.seen) this.persist.ever[id] = 1;
    Object.assign(this.persist.vars, s.pvars || {});
  }
  retire(snap) { if (snap && !snap.ended) this.commit(snap); }
  save() { return this.snapshot; }

  enter(id) {
    const s = this.state;
    if (!this.story.nodes[id]) throw new Error(`нет узла ${id}`);
    s.node = id; s.pc = 0; s.seen[id] = 1;
    this.snapshot = clone(s);
  }

  // ---------- expressions ----------
  get env() {
    const s = this.state, p = this.persist, story = this.story;
    return {
      get: n => {
        if (n in s.vars) return s.vars[n];
        if (n in story.persist) return s.pvars && n in s.pvars ? s.pvars[n] : p.vars[n];
        if (n === "run") return p.run;
        throw new Error(`неизвестная переменная ${n}`);
      },
      call: (f, a) => {
        if (f === "has") return s.items.includes(a);
        if (f === "seen") return !!s.seen[a];
        if (f === "ever") return !!(p.ever[a] || s.seen[a]);
        if (f === "read") return !!s.read[a];
        if (f === "ending") return !!p.endings[a];
        return false;
      },
    };
  }
  test(e) { return !!evalExpr(e, this.env); }
  fmt(text) {
    const f = this.state && this.state.vars.hero_f === true;
    return text.replace(/\[([^\]|]*)\|([^\]]*)\]/g, (_, a, b) => f ? b : a);
  }

  // ---------- statements ----------
  // returns an event if the statement needs the player (full backpack), else null
  exec(st) {
    const s = this.state;
    if (st.k === "set") {
      const v = evalExpr(st.e, this.env);
      const persistent = !(st.v in s.vars) && st.v in this.story.persist;
      if (!persistent && !(st.v in s.vars)) throw new Error(`неизвестная переменная ${st.v}`);
      const store = persistent ? (s.pvars ||= {}) : s.vars;
      const old = persistent ? (st.v in store ? store[st.v] : this.persist.vars[st.v]) : store[st.v];
      store[st.v] = st.o === "=" ? v : st.o === "+=" ? old + v : old - v;
      return null;
    }
    if (st.k === "drop") { s.items = s.items.filter(x => x !== st.id); return null; }
    if (st.k === "take") {
      if (s.items.includes(st.id)) return null;
      const it = this.story.items[st.id];
      if ((it && it.pocket) || this.slotted().length < this.story.slots) { s.items.push(st.id); return { t: "took", id: st.id }; }
      s.full = st.id;
      return { t: "full", item: st.id, items: this.slotted() };
    }
    throw new Error("bad statement");
  }
  // items that take a place in the backpack (pocket things do not)
  slotted() { return this.state.items.filter(id => !(this.story.items[id] && this.story.items[id].pocket)); }
  // the player decides what stays behind when the backpack is full: drop = an item id, or the new item's id to leave it
  resolveFull(drop) {
    const s = this.state, id = s.full; delete s.full;
    if (drop !== id) { s.items = s.items.filter(x => x !== drop); s.items.push(id); }
  }

  // ---------- stepping ----------
  // Next thing to show. Commands come back as events too; the UI applies them and calls step() again.
  step() {
    const s = this.state;
    if (s.ended) return { t: "ending", id: s.ended };
    if (s.full) return { t: "full", item: s.full, items: this.slotted() };
    for (let guard = 0; guard < 5000; guard++) {
      const op = s.queue.length ? s.queue.shift() : this.story.nodes[s.node].ops[s.pc++];
      if (!op) throw new Error(`узел ${s.node} кончился без выхода`);
      switch (op.op) {
        case "jf": if (!this.test(op.e)) s.pc = op.to; break;
        case "jmp": s.pc = op.to; break;
        case "goto": this.enter(op.target); break;
        case "set": { const ev = this.exec(op.st); if (ev) return ev; break; }
        case "text": {
          const ev = { t: "text", kind: op.kind, who: op.who || null, manner: op.manner ? this.fmt(op.manner) : null, text: this.fmt(op.text), radio: !!op.radio };
          // the journal: every line shown, numbered, so the page knows which of them are already on screen
          ev.n = s.logN = (s.logN || 0) + 1;
          s.log.push({ n: ev.n, who: ev.kind === "say" ? "hero" : ev.who, kind: ev.kind, manner: ev.manner, text: ev.text, radio: ev.radio || undefined }); if (s.log.length > 240) s.log.shift();
          return ev;
        }
        case "cmd": { this.applyView(op.name, op.a); return { t: "cmd", name: op.name, a: op.name === "toast" ? { ...op.a, text: this.fmt(op.a.text) } : op.a }; }
        case "choices": {
          s.pc--; // stay on the choices until the player picks
          return { t: "choices", items: this.visibleChoices(op), timer: op.timer };
        }
        case "game": s.pc--; return { t: "game", id: op.id, params: op.params, outcomes: Object.keys(op.outcomes) };
        case "ending": {
          s.ended = op.id; this.persist.endings[op.id] = (this.persist.endings[op.id] || 0) + 1; this.commit();
          return { t: "ending", id: op.id };
        }
      }
    }
    throw new Error(`узел ${s.node}: бесконечный цикл без показа текста`);
  }

  applyView(name, a) {
    const v = this.state.view;
    switch (name) {
      case "image": v.img = a.id; v.how = a.how; v.fx = []; v.pan = null; v.focus = null; v.text = "bottom"; break;
      case "black": v.img = null; v.fx = []; v.pan = null; v.focus = null; v.text = "bottom"; break;
      case "anim": v.fx = a.fx; break;
      case "pan": v.pan = a.dir === "off" ? null : { dir: a.dir, sec: a.sec }; break;
      case "focus": v.focus = a.off ? null : { x: a.x, y: a.y, zoom: a.zoom }; break;
      case "text": v.text = a.pos; break;
      case "music": v.music = a.id === "stop" ? null : a.id; break;
      case "amb": v.amb = a.id === "stop" ? null : a.id; break;
      case "radio": v.radio = a.n; break;
      case "silence": v.music = null; v.amb = null; v.radio = 0; break;
      case "chapter": {
        v.chapter = { num: a.num, title: a.title };
        const s = this.state; s.logN = (s.logN || 0) + 1; s.log.push({ n: s.logN, kind: "chapter", num: a.num, title: a.title }); break;
      }
      case "doc": this.state.read[a.id] = 1; if (!this.state.found.includes(a.id)) this.state.found.push(a.id); break;
    }
  }

  currentOp() { return this.story.nodes[this.state.node].ops[this.state.pc]; }

  visibleChoices(op) {
    const s = this.state, out = [];
    op.items.forEach((ch, i) => {
      if (ch.once && s.once[`${s.node}:${ch.ln}`]) return;
      if (ch.if && !this.test(ch.if)) return;
      out.push({ i, text: this.fmt(ch.text), speech: !!ch.speech, locked: !!(ch.need && !this.test(ch.need)), spot: ch.spot || null, key: !!ch.key });
    });
    return out;
  }

  choose(i) {
    const s = this.state, op = this.currentOp();
    if (!op || op.op !== "choices") throw new Error("сейчас нет выбора");
    const ch = op.items[i];
    if (ch.once) s.once[`${s.node}:${ch.ln}`] = 1;
    s.pc++;
    s.queue = [];
    if (ch.speech) s.queue.push({ op: "text", kind: "say", text: ch.text });
    for (const st of ch.effects) s.queue.push({ op: "set", st });
    s.queue.push({ op: "goto", target: ch.target });
  }
  timeout() {
    const op = this.currentOp();
    this.state.pc++; this.state.queue = [{ op: "goto", target: op.timer.target }];
  }
  gameResult(outcome) {
    const op = this.currentOp();
    if (!op || op.op !== "game") throw new Error("сейчас нет мини-игры");
    const target = op.outcomes[outcome];
    if (!target) throw new Error(`у мини-игры ${op.id} нет исхода ${outcome}`);
    this.state.pc++; this.state.queue = [{ op: "goto", target }];
  }
}
