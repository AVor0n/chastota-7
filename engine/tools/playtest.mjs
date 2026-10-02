#!/usr/bin/env node
// Прогон игры в настоящем браузере на экране телефона: кратчайший путь к каждой концовке, случайные прохождения,
// проверка «выйти в меню и продолжить». Нажимает те же кнопки, что игрок.
// node tools/playtest.mjs [--script папка] [--dist папка] [--random N] [--shots папка] [--jobs N]
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium, devices } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { loadStory, ROOT, DEFAULT_SCRIPT } from "./load.mjs";
import { freshPersist } from "../src/runtime.js";
import { explore, coverage, randomRoute, imageCover } from "./analyze.mjs";

const GAME = path.join(ROOT, "game");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const scriptDir = path.resolve(GAME, opt("--script", DEFAULT_SCRIPT));
const dist = path.resolve(GAME, opt("--dist", "dist"));
const nRandom = +opt("--random", 12);
const jobs = +opt("--jobs", 1);
const shots = opt("--shots", null);
// --files 01,02: only the pictures of these scene files (by name prefix), for a re-run after edits in a few chapters
const onlyFiles = opt("--files", null);
const port = 8170 + Math.floor(Math.random() * 20);

const { story } = loadStory(scriptDir);
// shortest known route to every ending: exhaustive search while it fits, novelty-seeking playthroughs beyond that
const ex = explore(story, { limit: 60000, seconds: 30 });
const cv = coverage(story, { walks: 5000, seconds: ex.truncated ? 40 : 5 });
const best = { ...cv.endingRoutes };
for (const [id, r] of Object.entries(ex.endingRoutes)) if (!best[id] || r.length <= best[id].length) best[id] = r;
// endings that open only on a second playthrough: same search with the first run remembered
const replayPersist = (() => { const p = freshPersist(); p.run = 1; for (const id of Object.keys(best)) p.endings[id] = 1; for (const id of new Set([...ex.visitedNodes, ...cv.visitedNodes])) p.ever[id] = 1; return p; })();
const replayRoutes = {};
if (Object.keys(story.endings).some(id => !best[id])) {
  const cv2 = coverage(story, { persist: replayPersist, walks: 5000, seconds: 20 });
  for (const [id, r] of Object.entries(cv2.endingRoutes)) if (!best[id]) replayRoutes[id] = r;
}
const routes = Object.entries(best).map(([id, r]) => ({ name: `кратчайший путь к «${id}»`, route: r, expect: id }));
for (const [id, r] of Object.entries(replayRoutes)) routes.push({ name: `путь к «${id}» при повторном прохождении`, route: r, expect: id, persist: replayPersist });
routes.forEach(r => { r.shoot = true; });
let wantImgs = null;
if (onlyFiles) {
  const pre = onlyFiles.split(",").map(x => "scenes/" + x.trim());
  wantImgs = new Set();
  for (const n of Object.values(story.nodes)) if (pre.some(p => n.file.startsWith(p))) for (const op of n.ops) if (op.op === "cmd" && op.name === "image") wantImgs.add(op.a.id);
  wantImgs = [...wantImgs];
  routes.length = 0;
  console.log(`Только файлы ${onlyFiles}: кадров ${wantImgs.length}`);
}
// with --shots: extra playthroughs so that every picture is captured at least once
let coverMissing = [];
if (shots) {
  const c1 = imageCover(story, { seconds: 40, want: wantImgs });
  c1.routes.forEach((r, i) => routes.push({ name: `все кадры, прохождение #${i + 1}`, route: r.route, expect: r.ending, shoot: true, dir: `cover-${i + 1}` }));
  coverMissing = c1.missing;
  if (coverMissing.length) {
    const c2 = imageCover(story, { persist: replayPersist, seconds: 20, want: coverMissing });
    c2.routes.forEach((r, i) => routes.push({ name: `все кадры, повторное прохождение #${i + 1}`, route: r.route, expect: r.ending, shoot: true, persist: replayPersist, dir: `cover-replay-${i + 1}` }));
    coverMissing = c2.missing;
  }
}
// random playthroughs that wander for too long in a hub are replaced by the next seed
for (let s = 1, n = 0; n < nRandom && s < nRandom * 20; s++) {
  const r = randomRoute(story, s);
  if (!r.ending || r.route.length > 1500) continue;
  routes.push({ name: `случайное прохождение #${++n} (решений ${r.route.length})`, route: r.route, expect: r.ending });
}

// own process group, so the server under npx goes away with it
const server = spawn("http-server", [dist, "-p", String(port), "-s", "-c-1"], { stdio: "ignore", detached: true });
const stopServer = () => { try { process.kill(-server.pid); } catch (e) {} };
process.on("exit", stopServer);
for (let i = 0; i < 100; i++) {   // wait until the server answers
  if (await fetch(`http://localhost:${port}/`).then(r => r.ok, () => false)) break;
  await new Promise(r => setTimeout(r, 200));
}
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

// the driver runs inside the page: it watches what the game waits for and answers like a player
const DRIVER = async ({ route, interruptAt }) => {
  const c = window.__ch7, sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms = 4000) => { const t = performance.now(); while (!fn()) { if (performance.now() - t > ms) return false; await sleep(10); } return true; };
  let k = 0, lastImg = null, lastChoiceImg = null, interrupted = false; const trace = [];
  // the save holds the state at the entry of a node: decisions taken after it was written are made again after "continue"
  let kEnter = 0, snap = null;
  // screenshots wait until a crossfade is over, so every shot shows one picture
  // the choice timer stands still while a shot is taken: a slow shot must not decide for the player
  const shot = async (name, meta) => { if (!window.__shot) return; c.freeze = true; try { await until(() => !c.sceneBusy, 8000); await sleep(150); await window.__shot(`${String(k).padStart(3, "0")}-${name}`, meta); } finally { c.freeze = false; } };
  const note = () => { const s = `${c.want}|${c.rt && c.rt.state.node}|${c.last && c.last.t}|k=${k}`; if (trace[trace.length - 1] !== s) { trace.push(s); if (trace.length > 12) trace.shift(); } };
  const t0 = performance.now();
  while (performance.now() - t0 < (window.__shot ? 20 * 60000 : 60000) + route.length * 1000) {
    await sleep(8); note();
    if (c.saved !== snap) { snap = c.saved; kEnter = k; }
    if (c.error) return { error: "ошибка движка: " + c.error, k };
    const w = c.want; if (!w) continue;
    const st = c.rt && c.rt.state;
    // the picture actually on screen, not the runtime view: the runtime reads the next event before the tap
    const sh = c.shown;
    if (sh && sh.img !== lastImg && w === "tap") { lastImg = sh.img; await sleep(window.__shot ? 1200 : 0); await shot(`${sh.node}-${lastImg || "black"}`, { node: sh.node, img: lastImg, what: "кадр" }); }
    if (st && w === "choices" && window.__shot && c.shown.img !== lastChoiceImg) { lastChoiceImg = c.shown.img; c.freeze = true; await sleep(600); await shot(`${st.node}-choices`, { node: st.node, img: c.shown.img, what: "выбор" }); }
    if (interruptAt != null && k === interruptAt && !interrupted && w === "tap") {
      interrupted = true; c.backToTitle(); await sleep(50); k = kEnter; c.enterGame(false); await until(() => c.mode === "game" && c.want, 8000); continue;
    }
    if (w === "tap") { document.getElementById("tap").click(); continue; }
    if (w === "chapter") { document.getElementById("chapter").click(); continue; }
    if (w === "doc" && window.__shot && !c.__docShot) { c.__docShot = true; await sleep(900); await shot(`${st.node}-doc`, { node: st.node, img: c.shown.img, what: "находка" }); }
    if (w === "doc") { c.__docShot = false; document.querySelector("#doc [data-close]").click(); await until(() => c.want !== "doc"); continue; }
    if (w === "ending") { if (window.__shot) { await sleep(3000); await shot(`ending-${c.last && c.last.id}`, { node: st.node, img: c.shown.img, what: "концовка" }); } return { ending: c.last && c.last.id, k, node: st.node }; }
    const d = route[k];
    if (!d) return { error: `путь кончился, а игра ждёт «${w}» в узле ${st.node}`, k };
    if (d.node && d.node !== st.node) return { error: `рассинхрон: ожидался узел ${d.node}, в игре ${st.node}`, k };
    if (w === "choices") {
      if (d.t === "timeout") { k++; if (!await until(() => c.want !== "choices", 40000)) return { error: `таймер выбора не сработал в ${st.node}`, k }; continue; }
      if (d.t !== "choice") return { error: `ожидалось ${d.t}, а игра показывает выбор в ${st.node}`, k };
      const b = document.querySelector(`#choices button[data-i="${d.i}"]`);
      if (!b) return { error: `нет кнопки выбора «${d.text}» в ${st.node} (есть: ${[...document.querySelectorAll("#choices button")].map(x => x.dataset.i + ":" + x.textContent).join(", ")}; вещи: ${st.items})`, k };
      if (b.classList.contains("locked")) return { error: `выбор «${d.text}» закрыт в ${st.node}`, k };
      const seq = c.wantSeq; b.click(); k++;
      if (!await until(() => c.wantSeq !== seq)) return { error: `выбор не сработал в ${st.node}`, k };
      continue;
    }
    if (w === "game") { if (d.t !== "game") return { error: `ожидалось ${d.t}, а началась мини-игра ${c.game.id}`, k }; if (window.__shot) { await sleep(2500); await shot(`${st.node}-game-${c.game.id}`, { node: st.node, img: c.shown.img, what: `мини-игра ${c.game.id}` }); } c.game.done(d.outcome); k++; await until(() => c.want !== "game"); continue; }
    if (w === "full") {
      if (d.t !== "full") return { error: `ожидалось ${d.t}, а рюкзак полон в ${st.node}`, k };
      const b = document.querySelector(`#fullList button[data-id="${d.drop}"]`);
      if (!b) return { error: `в окне «рюкзак полон» нет ${d.drop}`, k };
      b.click(); k++; await until(() => c.want !== "full"); continue;
    }
  }
  return { error: `зависло: игра ждёт «${c.want}» в узле ${c.rt && c.rt.state.node}; последние состояния: ${trace.join(" → ")}`, k };
};

const results = [];
if (shots) { fs.rmSync(shots, { recursive: true, force: true }); fs.mkdirSync(shots, { recursive: true }); }
const missing = new Set();
async function runRoute(idx, r) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  page.on("response", res => { if (res.status() >= 400) missing.add(new URL(res.url()).pathname); });
  if (r.persist) await page.addInitScript(p => { try { localStorage.setItem("ch7.persist", p); } catch (e) {} }, JSON.stringify(r.persist));
  r.shotList = [];
  if (shots && r.shoot) {
    r.dir = r.dir || `ending-${r.expect || idx}`;
    const dir = path.join(shots, r.dir); fs.mkdirSync(dir, { recursive: true });
    await page.exposeFunction("__shot", async (name, meta) => { await page.waitForTimeout(250); await page.screenshot({ path: path.join(dir, name + ".jpg"), type: "jpeg", quality: 72 }); r.shotList.push({ file: `${r.dir}/${name}.jpg`, ...meta }); });
  }
  await page.goto(`http://localhost:${port}/?dev&fast${shots ? "&shots" : ""}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ch7 && window.__ch7.mode === "title", null, { timeout: 20000 });
  await page.evaluate(() => { window.__ch7.wake(); window.__ch7.enterGame(true); });
  const interruptAt = idx === 0 && r.route.length > 2 ? Math.floor(r.route.length / 2) : null;
  const res = await page.evaluate(DRIVER, { route: r.route, interruptAt }).catch(e => ({ error: e.message }));
  if (!res.error && r.expect && res.ending !== r.expect) res.error = `пришли к «${res.ending}», ожидали «${r.expect}»`;
  results[idx] = { ...r, res, errs, interrupted: interruptAt != null };
  console.log(`${res.error || errs.length ? "✗" : "✓"} ${r.name}: ${res.error || `концовка ${res.ending}, решений ${res.k}`}${interruptAt != null ? " (с выходом в меню и продолжением)" : ""}${errs.length ? `\n    ошибки страницы: ${errs.slice(0, 3).join(" | ")}` : ""}`);
  await ctx.close().catch(() => {});
}
// several pages at once (--jobs N); results keep the route order
{ let next = 0; await Promise.all(Array.from({ length: Math.max(1, jobs) }, async () => { while (next < routes.length) { const i = next++; await runRoute(i, routes[i]); } })); }
await browser.close();
stopServer();
results.splice(0, results.length, ...results.filter(Boolean));
const bad = results.filter(r => r.res.error || r.errs.length);
const miss = [...missing].filter(p => !/\.mask\.png$|\/items\//.test(p));
if (miss.length) console.log(`\nНе загрузились файлы (${miss.length}): ${miss.slice(0, 30).join(", ")}`);
if (shots) writeIndex();
console.log(`\nИтог: ${results.length - bad.length} из ${results.length} прогонов без ошибок.`);
process.exit(bad.length ? 1 : 0);

// shots/INDEX.md: for every playthrough the screenshots in order, then every picture with its first screenshot
function writeIndex() {
  const L = ["# Снимки экрана телефона (iPhone 13)", "", `Сборка: ${dist}. Снято: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`, ""];
  const firstOf = {};
  for (const r of results) {
    if (!r.shotList || !r.shotList.length) continue;
    L.push(`## ${r.name}: концовка ${r.res.ending || "—"}${r.res.error ? ` (ОШИБКА: ${r.res.error})` : ""}`, "", "| что | узел | кадр | снимок |", "|---|---|---|---|");
    for (const sh of r.shotList) {
      L.push(`| ${sh.what} | ${sh.node} | ${sh.img || "чёрный"} | ${sh.file} |`);
      if (sh.img && !firstOf[sh.img]) firstOf[sh.img] = sh.file;
    }
    L.push("");
  }
  L.push("## Кадр → первый снимок", "", "| кадр | снимок |", "|---|---|");
  for (const id of Object.keys(story.images).sort()) L.push(`| ${id} | ${firstOf[id] || "НЕ СНЯТ"} |`);
  const never = (wantImgs || Object.keys(story.images)).filter(id => !firstOf[id]);
  L.push("", never.length ? `Не попали на снимки: ${never.join(", ")}.` : (wantImgs ? `Все ${wantImgs.length} кадров файлов ${onlyFiles} есть на снимках.` : "Все кадры из images.md есть на снимках."));
  fs.writeFileSync(path.join(shots, "INDEX.md"), L.join("\n") + "\n");
  console.log(`Снимки: ${shots} (указатель INDEX.md), кадров не снято: ${never.length}`);
}
