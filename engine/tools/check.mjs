#!/usr/bin/env node
// Проверка сценария «Частота 7».
// node /mnt/project-files/game/tools/check.mjs [папка сценария]   (по умолчанию /mnt/project-files/story/script)
// Флаги: --quiet (только ошибки), --routes (показать путь до каждой концовки)
import { loadStory, DEFAULT_SCRIPT } from "./load.mjs";
import { staticCheck, explore, coverage, sampleRuns } from "./analyze.mjs";
import { freshPersist } from "../src/runtime.js";

const args = process.argv.slice(2);
const dir = args.find(a => !a.startsWith("--")) || DEFAULT_SCRIPT;
const quiet = args.includes("--quiet"), showRoutes = args.includes("--routes");
const say = (...s) => console.log(...s);

let parsed;
try { parsed = loadStory(dir); } catch (e) { say("ОШИБКА:", e.message); process.exit(2); }
const { story } = parsed;
const errors = [...parsed.errors], warnings = [...parsed.warnings];

const st = staticCheck(story);
errors.push(...st.errors); warnings.push(...st.warnings);

say(`Сценарий: ${dir}`);
say(`Узлов ${Object.keys(story.nodes).length}, картинок ${Object.keys(story.images).length}, находок ${Object.keys(story.docs).length}, мини-игр ${Object.keys(story.games).length}, концовок ${Object.keys(story.endings).length}.`);

const routeText = r => r.map(v => v.t === "choice" ? `${v.node}: «${v.text}»` : v.t === "timeout" ? `${v.node}: (время вышло)` : v.t === "game" ? `${v.node}: ${v.id} → ${v.outcome}` : `${v.node}: оставить ${v.drop}`).join("\n      ");

if (!parsed.errors.length && story.nodes[story.start]) {
  // all choices with [if] / [need], to tell which ones never show up or never open
  const conds = [];
  for (const n of Object.values(story.nodes)) for (const op of n.ops) if (op.op === "choices")
    for (const ch of op.items) if (ch.if || ch.need) conds.push({ key: `${n.id}:${ch.ln}`, at: `${n.file}:${ch.ln}`, if: !!ch.if, need: !!ch.need });

  // exhaustive search while it fits, then many novelty-seeking playthroughs on top
  const search = persist => {
    const ex = explore(story, { persist, limit: 100000, seconds: 40 });
    const cv = coverage(story, ex.truncated ? { persist, walks: 20000, seconds: 60 } : { persist, walks: 500, seconds: 10 });
    const merge = (a, b) => new Set([...a, ...b]);
    const endings = {}, endingRoutes = { ...cv.endingRoutes, ...ex.endingRoutes };
    for (const id of Object.keys(story.endings)) if (ex.endings[id] || cv.endings[id]) endings[id] = [ex.endings[id] || 0, cv.endings[id] || 0];
    return { ex, cv, endings, endingRoutes, visited: merge(ex.visitedNodes, cv.visitedNodes), shown: merge(ex.shownChoices, cv.shownChoices), opened: merge(ex.openedNeeds, cv.openedNeeds) };
  };
  const report = (r, label) => {
    const { ex, cv } = r;
    for (const e of ex.errors.slice(0, 20)) errors.push(`перебор${label}: ${e.msg}\n      путь: ${routeText(e.route) || "(сразу со старта)"}`);
    for (const e of cv.errors.slice(0, 10)) errors.push(`прохождения${label}: ${e.msg}\n      путь: ${routeText(e.route) || "(сразу со старта)"}`);
    for (const s of cv.stuck.slice(0, 10)) errors.push(`прохождения${label}: узел ${s.node}: все выборы скрыты или закрыты, игрок застрял\n      путь: ${routeText(s.route)}`);
    for (const [node, rt] of ex.traps.slice(0, 20)) errors.push(`перебор${label}: из узла ${node} нельзя дойти ни до одной концовки (замкнутый круг)\n      путь: ${routeText(rt)}`);
    for (const l of cv.loops) warnings.push(`прохождения${label}: игра шла очень долго без концовки, возможно замкнутый круг около ${l.node}\n      последние шаги: ${routeText(l.route)}`);
  };

  const r1 = search(null);
  say(`\nПервое прохождение: полный перебор ${r1.ex.states} состояний${r1.ex.truncated ? " (обрезан по лимиту: веток слишком много, дальше проверяют прохождения)" : " (все ветки)"}, ${r1.cv.walks} прохождений с упором на непройденное.`);
  report(r1, "");

  // second run: everything from the first run is remembered
  const p = freshPersist(); p.run = 1;
  for (const id of Object.keys(r1.endings)) p.endings[id] = 1;
  for (const id of r1.visited) p.ever[id] = 1;
  const r2 = search(p);
  report(r2, " (повторное прохождение)");

  const all = Object.keys(story.nodes);
  const onlyReplay = all.filter(id => !r1.visited.has(id) && r2.visited.has(id));
  for (const id of all.filter(id => !r1.visited.has(id) && !r2.visited.has(id))) {
    const n = story.nodes[id];
    warnings.push(`${n.file}:${n.line}: узел ${id} не открывается ни в одной ветке`);
  }
  for (const c of conds) {
    const shown = r1.shown.has(c.key) || r2.shown.has(c.key);
    if (c.if && !shown) warnings.push(`${c.at}: этот выбор не появляется ни в одной ветке (условие [if] всегда ложно)`);
    else if (c.need && shown && !r1.opened.has(c.key) && !r2.opened.has(c.key)) warnings.push(`${c.at}: этот выбор всегда закрыт ([need] не выполняется ни в одной ветке)`);
  }
  const partial = r1.ex.truncated || r2.ex.truncated;
  for (const id of Object.keys(story.endings)) if (!r1.endings[id] && !r2.endings[id])
    (partial ? warnings : errors).push(`концовка ${id} ${partial ? "не найдена ни перебором, ни прохождениями" : "недостижима ни в одной ветке"}`);

  say("\nКонцовки (состояний при переборе / раз в прохождениях):");
  for (const id of Object.keys(story.endings)) {
    const a = r1.endings[id], b = r2.endings[id];
    say(`  ${id} «${story.endings[id].title}»: ${a ? `${a[0]} / ${a[1]}` : b ? `только при повторе: ${b[0]} / ${b[1]}` : "НЕ НАЙДЕНА"}`);
    const rt = r1.endingRoutes[id] || r2.endingRoutes[id];
    if (showRoutes && rt) say(`      ${routeText(rt)}`);
  }
  if (onlyReplay.length) say(`\nОткрывается только при повторном прохождении: ${onlyReplay.join(", ")}`);

  const runs = sampleRuns(story);
  const mins = runs.filter(r => r.ending).map(r => r.minutes).sort((a, b) => a - b);
  if (mins.length) say(`\nДлина партии по 300 случайным прохождениям: от ${Math.round(mins[0])} до ${Math.round(mins[mins.length - 1])} мин, обычно ~${Math.round(mins[mins.length >> 1])} мин.`);
} else {
  say("\nПеребор веток пропущен: сначала исправьте ошибки разметки.");
}

const miss = st.info;
if (!quiet) {
  if (miss.missingImages.length) say(`\nНет файлов картинок (art/scenes/<id>.jpg): ${miss.missingImages.join(", ")}`);
  if (miss.missingAudio.length) say(`Нет звуков (audio/...mp3): ${miss.missingAudio.join(", ")}`);
  if (miss.missingVideo.length) say(`Нет видео (art/video/<id>.mp4): ${miss.missingVideo.join(", ")}`);
  if (miss.missingIcons.length) say(`Нет значков предметов (art/items/<id>.png): ${miss.missingIcons.join(", ")}`);
}
if (warnings.length && !quiet) { say(`\nПредупреждения (${warnings.length}):`); warnings.forEach(w => say("  " + w)); }
if (errors.length) { say(`\nОШИБКИ (${errors.length}):`); errors.forEach(e => say("  " + e)); process.exit(1); }
say("\nОшибок нет.");
