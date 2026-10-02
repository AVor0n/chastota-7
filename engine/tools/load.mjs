// Reads a script folder (story/script by default) into the { relative path: text } map the parser wants.
import fs from "node:fs";
import path from "node:path";
import { parseScript } from "../src/script.js";

export const ROOT = "/mnt/project-files";
export const DEFAULT_SCRIPT = path.join(ROOT, "story/script");

export function readScriptDir(dir) {
  const files = {};
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name), r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else if (e.name.endsWith(".md")) files[r] = fs.readFileSync(p, "utf8");
    }
  };
  walk(dir, "");
  return files;
}

export function loadStory(dir = DEFAULT_SCRIPT) {
  if (!fs.existsSync(dir)) throw new Error(`нет папки ${dir}`);
  return parseScript(readScriptDir(dir));
}
