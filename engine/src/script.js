// Parser of the «Частота 7» script format (see ../SCRIPT-FORMAT.md).
// Input: { "setup.md": text, "scenes/a.md": text, "images.md": ..., "docs.md": ..., "minigames.md": ... }.
// Output: { story, errors, warnings }. Nodes compile to flat op lists with jumps, so a save is just (node, pc).
import { parseExpr } from "./expr.js";

export const COMMANDS = {
  image: 1, black: 1, pan: 1, focus: 1, shake: 1, flash: 1, text: 1, video: 1, anim: 1,
  music: 1, amb: 1, sfx: 1, radio: 1, silence: 1, vibrate: 1,
  chapter: 1, wait: 1, toast: 1, doc: 1, game: 1, ending: 1, timer: 1, key: 1,
};
export const ANIMS = ["fire", "lamp", "water", "fog", "stars", "wind", "dust", "fireflies", "rain", "glitch", "still", "beacon"];
const PANS = ["left", "right", "up", "down", "in", "out", "off"];
const ID = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseScript(files) {
  const errors = [], warnings = [];
  const story = {
    start: null, chars: {}, names: {}, vars: {}, persist: {}, items: {}, slots: 6, endings: {},
    nodes: {}, images: {}, docs: {}, games: {},
  };
  const err = (f, ln, msg) => errors.push(`${f}:${ln}: ${msg}`);
  const warn = (f, ln, msg) => warnings.push(`${f}:${ln}: ${msg}`);
  // gender variants [boy|girl] and stray brackets
  const checkText = (t, f, ln) => {
    let depth = 0;
    for (const c of t) { if (c === "[") depth++; else if (c === "]") depth--; if (depth < 0 || depth > 1) break; }
    if (depth !== 0) { err(f, ln, `незакрытая или лишняя квадратная скобка: «${t}»`); return; }
    for (const m of t.matchAll(/\[([^\]]*)\]/g)) if (m[1].split("|").length !== 2) err(f, ln, `в «[${m[1]}]» должно быть два варианта через |, для внука и для внучки`);
  };
  const expr = (src, f, ln) => { try { return parseExpr(src.trim()); } catch (e) { err(f, ln, e.message); return { k: "lit", v: false }; } };

  // ---------- setup.md ----------
  const setup = files["setup.md"];
  if (setup == null) err("setup.md", 0, "нет файла setup.md");
  else {
    let sec = null;
    setup.split(/\r?\n/).forEach((raw, i) => {
      const ln = i + 1, line = raw.trim();
      if (!line || line.startsWith("//")) return;
      let m;
      if ((m = line.match(/^##\s*(.+)$/))) {
        const h = m[1].toLowerCase();
        if (h.startsWith("персонаж")) sec = "chars";
        else if (h.startsWith("переменн")) sec = "vars";
        else if (h.startsWith("памят")) sec = "persist";
        else if (h.startsWith("предмет")) { sec = "items"; const n = h.match(/(\d+)/); if (n) story.slots = +n[1]; }
        else if (h.startsWith("концовк")) sec = "endings";
        else { err("setup.md", ln, `неизвестный раздел «${m[1]}»`); sec = null; }
        return;
      }
      if ((m = line.match(/^start\s*=\s*(\S+)$/))) { story.start = m[1]; return; }
      if (!sec) { err("setup.md", ln, "строка вне раздела"); return; }
      if (sec === "vars" || sec === "persist") {
        m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^|]+?)\s*(\|.*)?$/);
        if (!m) { err("setup.md", ln, `ожидалось «id = значение»: ${line}`); return; }
        const v = m[2] === "true" ? true : m[2] === "false" ? false : Number(m[2]);
        if (typeof v === "number" && isNaN(v)) { err("setup.md", ln, `значение должно быть числом или true/false: ${m[2]}`); return; }
        if (story.vars[m[1]] !== undefined || story.persist[m[1]] !== undefined) err("setup.md", ln, `переменная ${m[1]} объявлена дважды`);
        story[sec][m[1]] = v; return;
      }
      const parts = line.split("|").map(s => s.trim());
      const id = parts[0];
      if (!ID.test(id)) { err("setup.md", ln, `плохой id «${id}»`); return; }
      if (sec === "chars") {
        if (!parts[1]) { err("setup.md", ln, "нет имени персонажа"); return; }
        story.chars[id] = { name: parts[1], radio: /radio/.test(parts[2] || "") };
        story.names[parts[1].toLowerCase()] = id;
      } else if (sec === "items") {
        if (!parts[1]) { err("setup.md", ln, "нет названия предмета"); return; }
        const desc = parts.slice(2).join(" | ");
        const pocket = /^\(карман\)/i.test(desc);
        story.items[id] = { name: parts[1], desc: desc.replace(/^\(карман\)\s*/i, ""), pocket };
      } else if (sec === "endings") {
        if (!parts[1]) { err("setup.md", ln, "нет названия концовки"); return; }
        story.endings[id] = { title: parts[1], line: parts[2] || "" };
      }
    });
    if (!story.start) err("setup.md", 0, "не задан start = узел");
  }

  // ---------- statements: assignments and items ----------
  function stmt(src, f, ln) {
    src = src.trim(); let m;
    if ((m = src.match(/^(take|drop)\s+([A-Za-z_][A-Za-z0-9_]*)$/))) return { k: m[1], id: m[2], ln, f };
    if ((m = src.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(\+=|-=|=)\s*(.+)$/))) return { k: "set", v: m[1], o: m[2], e: expr(m[3], f, ln), ln, f };
    err(f, ln, `не понимаю действие «${src}» (нужно «x = 1», «x += 1», «take id», «drop id»)`);
    return null;
  }

  function parseArgs(name, rest, f, ln) {
    const a = { raw: rest };
    const words = rest.split(/\s+/).filter(Boolean);
    switch (name) {
      case "image": a.id = words[0]; a.how = words[1] || "fade"; if (!a.id || !ID.test(a.id)) err(f, ln, "@image: нужен id картинки"); if (!["fade", "cut", "slow"].includes(a.how)) err(f, ln, `@image: «${a.how}», а можно fade, cut, slow`); break;
      case "video": case "sfx": case "doc": case "ending": a.id = words[0]; if (!a.id || !ID.test(a.id)) err(f, ln, `@${name}: нужен id`); break;
      case "music": case "amb": a.id = words[0]; if (!a.id || !ID.test(a.id)) err(f, ln, `@${name}: нужен id или stop`); { const fm = rest.match(/fade=(\d+(?:\.\d+)?)/); if (fm) a.fade = +fm[1]; } break;
      case "pan": a.dir = words[0]; a.sec = words[1] ? +words[1] : null; if (!PANS.includes(a.dir)) err(f, ln, `@pan: ${PANS.join(", ")}`); break;
      case "focus": {
        if (words[0] === "off") { a.off = true; break; }
        const m = rest.match(/^(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*(\d+(?:\.\d+)?)?$/);
        if (!m) err(f, ln, "@focus: нужно «x%,y% увеличение» или off"); else { a.x = +m[1]; a.y = +m[2]; a.zoom = m[3] ? +m[3] : 1.6; }
        break;
      }
      case "text": a.pos = words[0]; if (!["top", "bottom"].includes(a.pos)) err(f, ln, "@text: top или bottom"); break;
      case "radio": case "wait": a.n = +words[0]; if (isNaN(a.n)) err(f, ln, `@${name}: нужно число`); break;
      case "chapter": { const m = rest.match(/^(\S+)\s+(.+)$/); if (!m) err(f, ln, "@chapter: номер и название"); else { a.num = m[1]; a.title = m[2]; } break; }
      case "toast": a.text = rest; if (!rest) err(f, ln, "@toast: нужен текст"); break;
      case "anim": {
        a.fx = [];
        for (const part of rest.split(";").map(s => s.trim()).filter(Boolean)) {
          const [kind, ...opts] = part.split(/\s+/);
          if (!ANIMS.includes(kind)) { err(f, ln, `@anim: неизвестный эффект «${kind}», есть: ${ANIMS.join(", ")}`); continue; }
          const fx = { kind };
          for (const o of opts) {
            let m;
            if ((m = o.match(/^at=(\d+(?:\.\d+)?)%,(\d+(?:\.\d+)?)%$/))) { fx.x = +m[1]; fx.y = +m[2]; }
            else if ((m = o.match(/^(below|above)=(\d+(?:\.\d+)?)%$/))) fx[m[1]] = +m[2];
            else if ((m = o.match(/^x=(\d+(?:\.\d+)?)%\.\.(\d+(?:\.\d+)?)%$/))) { fx.x0 = +m[1]; fx.x1 = +m[2]; }
            else if ((m = o.match(/^rect=(\d+(?:\.\d+)?)%,(\d+(?:\.\d+)?)%,(\d+(?:\.\d+)?)%,(\d+(?:\.\d+)?)%$/))) fx.rect = [+m[1], +m[2], +m[3], +m[4]];
            else if (o === "dense" || o === "light") fx.level = o;
            else if (o === "morse" && kind === "beacon") fx.morse = true;
            else err(f, ln, `@anim ${kind}: непонятный параметр «${o}»`);
          }
          if ((kind === "fire" || kind === "lamp" || kind === "beacon") && fx.x == null) err(f, ln, `@anim ${kind}: нужна точка at=x%,y%`);
          if (kind === "water" && fx.below == null && !fx.rect) fx.below = 65;
          a.fx.push(fx);
        }
        break;
      }
    }
    return a;
  }

  // ---------- scenes ----------
  const sceneFiles = Object.keys(files).filter(k => k.startsWith("scenes/") && k.endsWith(".md")).sort();
  if (!sceneFiles.length) err("scenes/", 0, "нет ни одного файла сцен");
  for (const f of sceneFiles) {
    let node = null, ifStack = [], choicesOpen = null, pendingTimer = null, pendingKey = null;
    const finish = () => {
      if (!node) return;
      if (ifStack.length) err(f, ifStack[ifStack.length - 1].ln, "@if без @end");
      for (const top of ifStack) { if (top.jf >= 0) node.ops[top.jf].to = node.ops.length; top.ends.forEach(j => node.ops[j].to = node.ops.length); }
      ifStack = []; choicesOpen = null;
      if (pendingTimer) { err(f, pendingTimer.ln, "@timer без выборов после него"); pendingTimer = null; }
      if (pendingKey) { err(f, pendingKey.ln, "@key без выборов после него"); pendingKey = null; }
    };
    const push = op => {
      if (choicesOpen) err(f, op.ln, "после выборов в узле ничего не должно быть, начните новый узел «# id»");
      node.ops.push(op); return node.ops.length - 1;
    };
    const lines = files[f].split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const ln = i + 1; let line = lines[i].trim();
      if (!line || line.startsWith("//")) continue;
      let m;
      if ((m = line.match(/^#\s+(\S+)\s*$/))) {
        finish();
        if (!ID.test(m[1])) err(f, ln, `плохой id узла «${m[1]}» (латиница, цифры, _)`);
        if (story.nodes[m[1]]) err(f, ln, `узел ${m[1]} уже есть в ${story.nodes[m[1]].file}:${story.nodes[m[1]].line}`);
        node = story.nodes[m[1]] = { id: m[1], file: f, line: ln, ops: [] };
        continue;
      }
      if (line.startsWith("#")) { err(f, ln, "заголовок узла пишется «# id» латиницей"); continue; }
      if (!node) { err(f, ln, "текст до первого узла «# id»"); continue; }

      // choices
      if (line.startsWith("* ")) {
        if (ifStack.length) err(f, ln, "выборы не могут стоять внутри @if, используйте [if ...] на строке выбора");
        if (!choicesOpen) { choicesOpen = { op: "choices", items: [], timer: pendingTimer, key: !!pendingKey, ln }; pendingTimer = null; pendingKey = null; node.ops.push(choicesOpen); }
        let rest = line.slice(2).trim(); const ch = { ln, f };
        while ((m = rest.match(/^\[(if|need|once|spot|key)\b\s*([^\]]*)\]\s*/))) {
          if (m[1] === "if") ch.if = expr(m[2], f, ln);
          else if (m[1] === "need") ch.need = expr(m[2], f, ln);
          else if (m[1] === "once") ch.once = true;
          else if (m[1] === "key") ch.key = true;
          else ch.spot = m[2].trim();
          rest = rest.slice(m[0].length);
        }
        const arrow = rest.lastIndexOf("->");
        if (arrow < 0) { err(f, ln, "у выбора нет «-> цель»"); continue; }
        ch.target = rest.slice(arrow + 2).trim();
        rest = rest.slice(0, arrow).trim();
        if (!ID.test(ch.target)) err(f, ln, `плохая цель выбора «${ch.target}»`);
        ch.effects = [];
        if ((m = rest.match(/\{([^}]*)\}\s*$/))) {
          ch.effects = m[1].split(";").map(s => s.trim()).filter(Boolean).map(s => stmt(s, f, ln)).filter(Boolean);
          rest = rest.slice(0, m.index).trim();
        }
        if ((m = rest.match(/^["«„“](.*)["»“”]$/))) { ch.speech = true; rest = m[1].trim(); }
        if (!rest) err(f, ln, "у выбора нет текста");
        ch.text = rest; checkText(rest, f, ln);
        if (choicesOpen.items.length >= 4) err(f, ln, "больше 4 выборов в одном блоке");
        if (choicesOpen.key) ch.key = true;
        choicesOpen.items.push(ch);
        continue;
      }
      if (choicesOpen) { err(f, ln, "после выборов в узле ничего не должно быть, начните новый узел «# id»"); continue; }

      // block conditions
      if ((m = line.match(/^@if\s+(.+)$/))) { const at = push({ op: "jf", e: expr(m[1], f, ln), to: -1, ln }); ifStack.push({ ln, jf: at, ends: [] }); continue; }
      if ((m = line.match(/^@elif\s+(.+)$/)) || line === "@else") {
        const top = ifStack[ifStack.length - 1];
        if (!top) { err(f, ln, `${line.split(" ")[0]} без @if`); continue; }
        if (top.jf < 0) { err(f, ln, "после @else не может быть @elif/@else"); continue; }
        top.ends.push(push({ op: "jmp", to: -1, ln }));
        node.ops[top.jf].to = node.ops.length;
        top.jf = m ? push({ op: "jf", e: expr(m[1], f, ln), to: -1, ln }) : -1;
        continue;
      }
      if (line === "@end") {
        const top = ifStack.pop();
        if (!top) { err(f, ln, "@end без @if"); continue; }
        if (top.jf >= 0) node.ops[top.jf].to = node.ops.length;
        top.ends.forEach(j => node.ops[j].to = node.ops.length);
        continue;
      }

      // single-line condition prefix
      let cond = null;
      if ((m = line.match(/^\[if\s+([^\]]+)\]\s*/))) { cond = expr(m[1], f, ln); line = line.slice(m[0].length); if (!line) { err(f, ln, "после [if ...] пусто"); continue; } }
      const ops = [];
      if ((m = line.match(/^@(\w+)\s*(.*)$/))) {
        const name = m[1], rest = m[2].trim();
        if (!COMMANDS[name]) { err(f, ln, `неизвестная команда @${name}`); continue; }
        if (name === "key") {
          if (rest) err(f, ln, "@key пишется без параметров");
          if (cond) err(f, ln, "@key не может быть условным");
          pendingKey = { ln }; continue;
        }
        if (name === "timer") {
          const t = rest.match(/^(\d+(?:\.\d+)?)\s*->\s*(\S+)$/);
          if (!t) { err(f, ln, "@timer: «секунды -> узел»"); continue; }
          if (cond) err(f, ln, "@timer не может быть условным");
          pendingTimer = { sec: +t[1], target: t[2], ln }; continue;
        }
        if (name === "game") {
          const g = rest.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*([^>]*?)\s*->\s*(.+)$/);
          if (!g) { err(f, ln, "@game: «id параметры -> ok:узел, fail:узел»"); continue; }
          const params = {}; for (const p of g[2].split(/\s+/).filter(Boolean)) { const kv = p.split("="); if (kv.length !== 2) err(f, ln, `@game: параметр «${p}» пишется как ключ=значение`); else params[kv[0]] = isNaN(+kv[1]) ? kv[1] : +kv[1]; }
          const outcomes = {};
          for (const o of g[3].split(",").map(s => s.trim()).filter(Boolean)) { const kv = o.split(":").map(s => s.trim()); if (kv.length !== 2 || !ID.test(kv[1])) err(f, ln, `@game: исход «${o}» пишется как ok:узел`); else outcomes[kv[0]] = kv[1]; }
          ops.push({ op: "game", id: g[1], params, outcomes, ln });
        } else if (name === "ending") {
          ops.push({ op: "ending", id: rest.split(/\s+/)[0], ln });
        } else {
          ops.push({ op: "cmd", name, a: parseArgs(name, rest, f, ln), ln });
        }
      } else if (line.startsWith("~")) {
        const s = stmt(line.slice(1), f, ln); if (s) ops.push({ op: "set", st: s, ln });
      } else if ((m = line.match(/^->\s*(\S+)$/))) {
        ops.push({ op: "goto", target: m[1], ln });
      } else if (line.startsWith(">")) {
        ops.push({ op: "text", kind: "thought", text: line.slice(1).trim(), ln });
      } else if ((m = line.match(/^([А-ЯЁA-Z][^:()]{0,24}?)\s*(?:\(([^)]*)\))?\s*:\s+(.+)$/)) && story.names[m[1].trim().toLowerCase()]) {
        ops.push({ op: "text", kind: "line", who: story.names[m[1].trim().toLowerCase()], manner: m[2] ? m[2].trim() : null, text: m[3].trim(), ln, ...(m[2] && /в\s+эфире/i.test(m[2]) ? { radio: true } : {}) });
      } else {
        if ((m = line.match(/^([А-ЯЁ][а-яё]{1,14})\s*(?:\([^)]*\))?\s*:\s/))) warn(f, ln, `«${m[1]}:» похоже на реплику, но такого персонажа нет в setup.md`);
        ops.push({ op: "text", kind: "narr", text: line, ln });
      }
      for (const op of ops) {
        if (op.op === "text") checkText(op.text, f, ln);
        if (op.op === "cmd" && op.name === "toast") checkText(op.a.text, f, ln);
        if (op.op === "text" && op.text.length > 220) warn(f, ln, `строка длинная (${op.text.length} знаков), лучше разбить`);
        if (cond) { push({ op: "jf", e: cond, to: node.ops.length + 2, ln }); }
        push(op);
      }
    }
    finish();
  }

  // ---------- images.md / docs.md / minigames.md ----------
  function blocks(name, kindWord) {
    const text = files[name]; if (text == null) return [];
    const out = []; let cur = null;
    text.split(/\r?\n/).forEach((raw, i) => {
      const ln = i + 1, line = raw.trimEnd();
      if (line.trim().startsWith("//")) return;
      const m = line.match(/^#\s+(.+)$/);
      if (m) {
        let h = m[1].trim();
        if (kindWord) { if (!h.startsWith(kindWord + " ")) { err(name, ln, `заголовок пишется «# ${kindWord} id | Название»`); cur = null; return; } h = h.slice(kindWord.length + 1).trim(); }
        const [id, title] = h.split("|").map(s => s.trim());
        if (!ID.test(id)) err(name, ln, `плохой id «${id}»`);
        cur = { id, title: title || "", body: [], ln }; out.push(cur); return;
      }
      if (cur) cur.body.push(line); else if (line.trim()) err(name, ln, "текст до первого заголовка");
    });
    return out;
  }
  // docs.md and images.md may also be split into docs/*.md and images/*.md
  const group = (name, kindWord) => [name, ...Object.keys(files).filter(k => k.startsWith(name.replace(/\.md$/, "/")) && k.endsWith(".md")).sort()]
    .flatMap(f => blocks(f, kindWord).map(b => ({ ...b, f })));
  const dupe = (map, b, what) => { if (map[b.id]) err(b.f, b.ln, `${what} ${b.id} уже описана выше`); };
  for (const b of group("images.md", null)) {
    dupe(story.images, b, "картинка");
    const motion = b.body.find(l => /^\s*Движение\s*:/i.test(l));
    story.images[b.id] = { desc: b.body.join("\n").trim(), motion: motion ? motion.replace(/^\s*Движение\s*:/i, "").trim() : "" };
  }
  for (const b of group("docs.md", "doc")) {
    dupe(story.docs, b, "находка");
    const paras = b.body.join("\n").trim().split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
    const kind = b.id.startsWith("journal") ? "journal" : b.id.startsWith("letter") ? "letter" : b.id.startsWith("tape") ? "tape" : "paper";
    story.docs[b.id] = { title: b.title, kind, paras };
    paras.forEach(p => checkText(p, b.f, b.ln));
    if (!paras.length) err(b.f, b.ln, `находка ${b.id} пустая`);
  }
  for (const b of blocks("minigames.md", "game")) {
    const body = b.body.join("\n");
    const om = body.match(/Исходы\s*:\s*(.+)/i), pm = body.match(/Параметры\s*:\s*(.+)/i);
    const outcomes = om ? om[1].split(/[,;]/).map(s => (s.trim().match(/^[A-Za-z_][A-Za-z0-9_]*/) || [""])[0]).filter(Boolean) : [];
    if (!outcomes.length) err("minigames.md", b.ln, `у мини-игры ${b.id} нет строки «Исходы: ok, fail»`);
    story.games[b.id] = { title: b.title, desc: body.trim(), outcomes, params: pm ? pm[1].trim() : "" };
  }
  return { story, errors, warnings };
}
