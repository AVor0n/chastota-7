#!/usr/bin/env node
// Сборка игры в одну папку, которую можно открыть в браузере телефона.
// node tools/build.mjs [--script папка] [--out папка] [--force]
//   по умолчанию: сценарий /mnt/project-files/story/script, результат /mnt/project-files/game/dist
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { execFileSync } from "node:child_process";
// ffmpeg writes to local disk first: writing straight into the shared folder sometimes fails mid-file
function ffmpegTo(dst, args) {
  const tmp = path.join(os.tmpdir(), `ch7-${process.pid}-${path.basename(dst)}`);
  try { execFileSync("ffmpeg", args(tmp)); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(tmp, dst); }
  finally { fs.rmSync(tmp, { force: true }); }
}
import { loadStory, ROOT, DEFAULT_SCRIPT } from "./load.mjs";
import { staticCheck } from "./analyze.mjs";

const GAME = path.join(ROOT, "game");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const scriptDir = path.resolve(GAME, opt("--script", DEFAULT_SCRIPT));
const out = path.resolve(GAME, opt("--out", "dist"));
const force = args.includes("--force");

const { story, errors } = loadStory(scriptDir);
const st = staticCheck(story);
const all = [...errors, ...st.errors];
if (all.length && !force) { console.log("Сценарий с ошибками, сначала node tools/check.mjs:\n  " + all.slice(0, 20).join("\n  ")); process.exit(1); }

// ---------- story data for the page ----------
// drop source locations (f: "scenes/x.md") and raw command text; "f" inside expressions is a function name and stays
const strip = o => JSON.parse(JSON.stringify(o, (k, v) => (k === "raw" || (k === "f" && typeof v === "string" && v.endsWith(".md")) ? undefined : v)));
const data = {
  start: story.start, chars: story.chars, vars: story.vars, persist: story.persist, items: story.items, slots: story.slots,
  endings: story.endings, nodes: {}, docs: story.docs,
  games: Object.fromEntries(Object.entries(story.games).map(([k, g]) => [k, { title: g.title, outcomes: g.outcomes }])),
  images: {},
};
for (const [id, n] of Object.entries(story.nodes)) data.nodes[id] = { id, ops: strip(n.ops) };
data.version = crypto.createHash("sha1").update(JSON.stringify(data)).digest("hex").slice(0, 10);
// pictures of the first nodes, loaded behind the title screen
const first = [];
const walk = (id, depth, seen = new Set()) => {
  const n = story.nodes[id]; if (!n || seen.has(id) || depth > 3) return; seen.add(id);
  for (const op of n.ops) {
    if (op.op === "cmd" && op.name === "image" && !first.includes(op.a.id)) first.push(op.a.id);
    if (op.op === "goto") walk(op.target, depth + 1, seen);
    if (op.op === "choices") op.items.forEach(c => walk(c.target, depth + 1, seen));
  }
};
walk(story.start, 0);
data.preload = first.slice(0, 6);
// which optional files exist, so the page never asks for missing ones
const has = p => fs.existsSync(path.join(ROOT, p));
data.assets = {
  masks: Object.keys(story.images).filter(id => has(`art/scenes/${id}.mask.png`)),
  icons: Object.keys(story.items).filter(id => has(`art/items/${id}.png`)),
  scenes: Object.keys(story.images).filter(id => has(`art/scenes/${id}.jpg`) || has(`art/scenes/${id}.png`)),
  // interface sounds that may not exist yet (the engine falls back to another one)
  sfx: ["ui_choice_key"].filter(id => has(`audio/sfx/${id}.mp3`)),
};
// pictures whose part under the text is dark and busy: the page puts a denser shade under the text there
data.assets.busy = {};
for (const id of data.assets.scenes) {
  const src = has(`art/scenes/${id}.jpg`) ? `art/scenes/${id}.jpg` : `art/scenes/${id}.png`;
  try {
    const W = 64, H = 114, px = execFileSync("ffmpeg", ["-v", "error", "-i", path.join(ROOT, src), "-vf", `scale=${W}:${H},format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 1 << 20 });
    const busy = (y0, y1, sdMin, lcMin) => {
      let n = 0, sum = 0, sq = 0, lc = 0, ln = 0;
      for (let y = Math.floor(H * y0); y < Math.floor(H * y1); y++) for (let x = 0; x < W; x++) {
        const v = px[y * W + x]; n++; sum += v; sq += v * v;
        if (x) { lc += Math.abs(v - px[y * W + x - 1]); ln++; }
      }
      const sd = Math.sqrt(sq / n - (sum / n) ** 2), local = lc / ln;
      return local >= lcMin || (sd >= sdMin && local >= 5);
    };
    const b = busy(.6, .95, 40, 8.5), t = busy(.05, .4, 999, 12);  // tops are mostly hatched sky: only very fine detail counts there
    if (b || t) data.assets.busy[id] = (b ? "b" : "") + (t ? "t" : "");
  } catch (e) { /* no ffmpeg: plain shade everywhere */ }
}

// ---------- code ----------
const code = [
  "src/expr.js", "src/runtime.js", "web/vendor/qrcode.js", "web/qr.js", "web/title-shader.js", "web/scene.js", "web/audio.js",
  ...fs.readdirSync(path.join(GAME, "web/minigames")).filter(f => f.endsWith(".js")).sort().map(f => "web/minigames/" + f),
  "web/game.js",
].map(f => {
  let s = fs.readFileSync(path.join(GAME, f), "utf8");
  if (f.startsWith("src/")) s = s.replace(/^import .*$/gm, "").replace(/^export /gm, "");
  return `// ---- ${f} ----\n${s}`;
}).join("\n").replace(/<\/script/gi, "<\\/script");

let html = fs.readFileSync(path.join(GAME, "web/template.html"), "utf8");
html = html.replace("/*FONTS*/", () => fs.readFileSync(path.join(GAME, "web/fonts.css"), "utf8"))
  .replace("/*STORY*/", () => "const STORY = " + JSON.stringify(data).replace(/<\//g, "<\\/") + ";")
  .replace("/*CODE*/", () => code);

// ---------- assets ----------
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "assets"), { recursive: true });
fs.writeFileSync(path.join(out, "index.html"), html);
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
const A = p => path.join(out, "assets", p);
for (const [f, src] of [["koster.jpg", "art/title-final"], ["mask.png", "art/title-final"], ["amb-1.mp3", "art/title-final"], ["paper.jpg", "art/ui-screens"], ["dial-clean.jpg", "art/ui-screens"], ["desk.jpg", "art/ui-screens"]])
  copy(path.join(ROOT, src, f), A("title/" + f));

// scene pictures: jpg as is when small, otherwise re-encoded for phones
let sizes = 0;
const used = st.info.used;
for (const id of used.images) {
  for (const ext of ["jpg", "png"]) {
    const src = path.join(ROOT, "art/scenes", `${id}.${ext}`);
    if (!fs.existsSync(src)) continue;
    const dst = A(`scenes/${id}.jpg`);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (ext === "jpg" && fs.statSync(src).size < 900_000) fs.copyFileSync(src, dst);
    else ffmpegTo(dst, tmp => ["-loglevel", "error", "-y", "-i", src, "-vf", "scale='min(1080,iw)':-2", "-q:v", "4", tmp]);
    sizes += fs.statSync(dst).size;
    break;
  }
  const mask = path.join(ROOT, "art/scenes", `${id}.mask.png`);
  if (fs.existsSync(mask)) copy(mask, A(`scenes/${id}.mask.png`));
}
for (const kind of ["music", "amb", "sfx"]) for (const id of used.audio[kind]) {
  const src = path.join(ROOT, "audio", kind, `${id}.mp3`);
  if (fs.existsSync(src)) { copy(src, A(`audio/${kind}/${id}.mp3`)); sizes += fs.statSync(src).size; }
}
// every effect: the interface and the mini-games pick sounds by name, not only the script
const allSfx = path.join(ROOT, "audio/sfx");
if (fs.existsSync(allSfx)) for (const f of fs.readdirSync(allSfx)) if (f.endsWith(".mp3")) { copy(path.join(allSfx, f), A("audio/sfx/" + f)); sizes += fs.statSync(path.join(allSfx, f)).size; }
// quiet music under the mini-games
for (const id of ["puzzle"]) { const src = path.join(ROOT, "audio/music", `${id}.mp3`); if (fs.existsSync(src)) copy(src, A(`audio/music/${id}.mp3`)); }
// icons are shown small in the backpack: 256 px is plenty
for (const id of Object.keys(story.items)) {
  const src = path.join(ROOT, "art/items", `${id}.png`); if (!fs.existsSync(src)) continue;
  const out = A(`items/${id}.png`);
  try { ffmpegTo(out, tmp => ["-y", "-v", "error", "-i", src, "-vf", "scale='min(256,iw)':-1", tmp]); } catch (e) { copy(src, out); }
}
for (const id of used.video) { const src = path.join(ROOT, "art/video", `${id}.mp4`); if (fs.existsSync(src)) copy(src, A(`video/${id}.mp4`)); }
const mg = path.join(ROOT, "art/minigames");
if (fs.existsSync(mg)) for (const f of fs.readdirSync(mg)) copy(path.join(mg, f), A("minigames/" + f));

const kb = n => Math.round(n / 1024);
console.log(`Собрано: ${out}/index.html (${kb(html.length)} КБ), картинки и звук ${kb(sizes)} КБ, версия ${data.version}.`);
if (st.info.missingImages.length) console.log(`Нет картинок (будут заглушки): ${st.info.missingImages.length}`);
if (st.info.missingAudio.length) console.log(`Нет звуков (будет тихо): ${st.info.missingAudio.length}`);
