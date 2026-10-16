// scripts/check-esm.mjs
//
// Static checks that `node --check` doesn't make, run by `npm run check`. GameFace links every module of an action
// group at load, so each of these takes the whole mod down in game while every file still passes on its own:
//
// - a duplicate named export in one module (`export function foo` plus a later `export { foo }`);
// - an import whose target file doesn't exist ("./pt-x.js" or "/partisans/ui/pt-x.js");
// - a named import the target module doesn't export.
//
// Imports from the game's own modules ("/core/...", "/base-standard/...") are skipped. The modinfo listing of each
// module is checked by tests/modinfo.test.mjs. Exits non-zero with a report on any problem.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uiDir = path.join(root, "ui");
const MODULE_PREFIX = "/partisans/";
const NAME = "[A-Za-z_$][\\w$]*";

const errors = [];

/** The named exports of one module's source, reporting any name exported twice. */
function exportsOf(src, file) {
  const seen = new Set();
  const add = (name) => {
    if (!name) return;
    if (seen.has(name)) errors.push(`${file}: duplicate export of "${name}"`);
    seen.add(name);
  };
  const declared = new RegExp(`^\\s*export\\s+(?:async\\s+)?(?:function\\*?|const|let|var|class)\\s+(${NAME})`, "gm");
  for (const m of src.matchAll(declared)) add(m[1]);
  if (/^\s*export\s+default\b/m.test(src)) add("default");
  for (const m of src.matchAll(/export\s*\{([^}]*)\}(?!\s*from)/g)) {
    for (const part of m[1].split(",").map((p) => p.trim()).filter(Boolean)) {
      const alias = part.match(new RegExp(`\\bas\\s+(${NAME})`));
      add(alias ? alias[1] : part.split(/\s+/)[0]);
    }
  }
  return seen;
}

/** The file an import specifier names inside this mod, or null for the game's own modules. */
function targetOf(spec, fromFile) {
  if (spec.startsWith("./") || spec.startsWith("../")) return path.resolve(path.dirname(fromFile), spec);
  if (spec.startsWith(MODULE_PREFIX)) return path.join(root, spec.slice(MODULE_PREFIX.length));
  return null;
}

/** The names one import clause asks for: `{ a, b as c }` gives a and b, `X` gives default, `* as m` none. */
function namesAsked(clause) {
  const names = [];
  const braces = clause.match(/\{([^}]*)\}/);
  if (braces) {
    for (const part of braces[1].split(",").map((p) => p.trim()).filter(Boolean)) names.push(part.split(/\s+/)[0]);
  }
  const head = clause.replace(/\{[^}]*\}/, "").replace(/\*\s+as\s+\S+/, "").replace(/,/g, " ").trim();
  if (head) names.push("default");
  return names;
}

function checkImports(src, file, exportsByFile) {
  const rel = path.relative(root, file);
  for (const m of src.matchAll(/^\s*import\s+([^'"]*?)\s+from\s+["']([^"']+)["']/gm)) {
    const target = targetOf(m[2], file);
    if (!target) continue;
    if (!fs.existsSync(target)) {
      errors.push(`${rel}: import target not found -> ${m[2]}`);
      continue;
    }
    const exported = exportsByFile.get(target) ?? exportsOf(fs.readFileSync(target, "utf8"), path.relative(root, target));
    for (const name of namesAsked(m[1])) {
      if (!exported.has(name)) errors.push(`${rel}: imports "${name}" from ${m[2]}, which doesn't export it`);
    }
  }
}

const files = fs.readdirSync(uiDir).filter((f) => f.endsWith(".js")).map((f) => path.join(uiDir, f));
const exportsByFile = new Map(files.map((f) => [f, exportsOf(fs.readFileSync(f, "utf8"), path.relative(root, f))]));
for (const f of files) checkImports(fs.readFileSync(f, "utf8"), f, exportsByFile);

if (errors.length) {
  console.error("ESM integrity check FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`ESM integrity OK (${files.length} modules)`);
