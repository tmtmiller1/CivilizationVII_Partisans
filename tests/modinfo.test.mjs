// modinfo.test.mjs - every file the modinfo ships exists, every ui module is listed, and the settings keeper comes first.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const modinfo = fs.readFileSync(path.join(root, "partisans.modinfo"), "utf8");

test("every listed file exists", () => {
  for (const m of modinfo.matchAll(/<Item(?: locale="[^"]+")?>([^<]+)<\/Item>/g)) assert.ok(fs.existsSync(path.join(root, m[1])), m[1]);
});

test("every ui module is imported in the game group, and the keeper is the first UIScript of each group", () => {
  const ui = fs.readdirSync(path.join(root, "ui")).filter((f) => f.endsWith(".js"));
  const game = modinfo.slice(modinfo.indexOf('id="partisans-game"'));
  for (const f of ui) if (f !== "settings-keeper.js") assert.ok(game.includes(`<Item>ui/${f}</Item>`), f);
  for (const group of modinfo.split("<UIScripts>").slice(1)) {
    assert.match(group, /^\s*(?:<!--[^]*?-->\s*)?<Item>ui\/settings-keeper\.js<\/Item>/);
  }
});

test("the version, id and AffectsSavedGames are set", () => {
  assert.match(modinfo, /<Mod id="tower-partisans"/);
  assert.match(modinfo, /<Version>\d+\.\d+\.\d+<\/Version>/);
  assert.match(modinfo, /<AffectsSavedGames>1<\/AffectsSavedGames>/);
});

test("the muster rows load after the mod's other game data, so leaders other mods add get them", () => {
  const order = (id) => Number(new RegExp(`id="${id}"[^]*?<LoadOrder>(-?\\d+)</LoadOrder>`).exec(modinfo)[1]);
  const group = modinfo.slice(modinfo.indexOf('id="partisans-game-muster"'));
  assert.ok(group.slice(0, group.indexOf("</ActionGroup>")).includes("<Item>data/partisans-muster.sql</Item>"));
  assert.equal(modinfo.match(/data\/partisans-muster\.sql/g).length, 1, "listed once");
  assert.ok(order("partisans-game-muster") > order("partisans-game"));
});

test("the script's version is the modinfo's", () => {
  const script = fs.readFileSync(path.join(root, "ui", "pt-bootstrap.js"), "utf8");
  assert.equal(/const VERSION = "([^"]+)"/.exec(script)[1], /<Version>([^<]+)<\/Version>/.exec(modinfo)[1]);
});
