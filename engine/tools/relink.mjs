// Rebuilds only the page of an existing build with the current engine code, keeping its story data and assets.
// node tools/relink.mjs --from dist --out dir   (for an engine fix while the script is being edited)
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./load.mjs";
const GAME = path.join(ROOT, "game");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const from = path.resolve(GAME, opt("--from", "dist")), out = path.resolve(GAME, opt("--out", "dist-relink"));
const old = fs.readFileSync(path.join(from, "index.html"), "utf8");
const a = old.indexOf("const STORY = ") + "const STORY = ".length, b = old.indexOf(";\n</script>", a);
const data = JSON.parse(old.slice(a, b).replace(/<\\\//g, "</"));
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
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "index.html"), html);
console.log(`Страница пересобрана: ${path.join(out, "index.html")} (${Math.round(html.length / 1024)} КБ), версия сценария ${data.version}.`);
