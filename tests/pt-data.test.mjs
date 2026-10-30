// pt-data.test.mjs - the generated data: the muster rows are what SPEC 7.1 says, and the effect that crashes the
// game appears nowhere in the mod.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("the city army effect appears nowhere in the mod", () => {
  const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (["node_modules", ".git", "dist", "tests"].includes(e.name) ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)]);
  const offenders = walk(".").filter((f) => /\.(sql|xml|js|mjs|modinfo)$/.test(f) && read(f).includes("SPAWN_TRIBE_" + "ARMY"));
  assert.deepEqual(offenders, []);
});

test("the room rows raise the spare independent slots to 1 and leave a higher value alone", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const run = (rows) => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE GlobalParameters (Name TEXT PRIMARY KEY NOT NULL, Value TEXT NOT NULL)");
    for (const [n, v] of rows) db.prepare("INSERT INTO GlobalParameters VALUES (?, ?)").run(n, v);
    db.exec(read("data/partisans-room.sql"));
    return db.prepare("SELECT Value FROM GlobalParameters WHERE Name = 'INDEPENDENT_EXTRAS_PER_MAJOR'").all().map((r) => r.Value);
  };
  assert.deepEqual(run([["INDEPENDENT_EXTRAS_PER_MAJOR", "0.0"]]), ["1"], "Exploration and Modern");
  assert.deepEqual(run([]), ["1"], "no row");
  assert.deepEqual(run([["INDEPENDENT_EXTRAS_PER_MAJOR", "1"]]), ["1"], "Antiquity");
  assert.deepEqual(run([["INDEPENDENT_EXTRAS_PER_MAJOR", "3"]]), ["3"], "another mod's higher value");
});

test("the muster SQL is what the generator writes now", () => {
  const before = read("data/partisans-muster.sql");
  execFileSync(process.execPath, [path.join(root, "scripts/gen-data.mjs")], { stdio: "ignore" });
  assert.equal(read("data/partisans-muster.sql"), before, "run npm run gen-data and commit the result");
});

test("the muster rows: traits from Leaders, one hidden building, the player-level spawn, RunOnce 0 and Permanent 1", () => {
  const sql = read("data/partisans-muster.sql");
  assert.match(sql, /INSERT INTO LeaderTraits .*SELECT LeaderType, 'TRAIT_PARTISANS_' \|\| LeaderType FROM \(SELECT LeaderType FROM Leaders WHERE IsMajorLeader = 1\)/);
  assert.match(sql, /INSERT INTO Buildings .*'BUILDING_PARTISANS_MUSTER', 0, 0, 1, 'TRAIT_PARTISANS_NONE'/);
  assert.match(sql, /'IGNORE_DISTRICT_PLACEMENT_CAP'/);
  assert.match(sql, /'DISTRICT_CITY_CENTER'/);
  assert.match(sql, /'COLLECTION_OWNER', 'EFFECT_PLAYER_SPAWN_TRIBE_NEAR'/);
  assert.match(sql, /INSERT INTO Modifiers[^;]*SELECT ModifierId, 'MODIFIER_PARTISANS_SPAWN_TRIBE_NEAR', 0, 1, 'RS_' \|\| ModifierId/);
  assert.match(sql, /'REQUIREMENT_PLAYER_HAS_CONSTRUCTIBLE'/);
  assert.match(sql, /'ConstructibleType', 'BUILDING_PARTISANS_MUSTER'/);
  assert.match(sql, /'TribeType', 'TRIBE_CRISIS'/);
  assert.match(sql, /'NumCities', '1'/);
  assert.match(sql, /INSERT INTO TraitModifiers .*SELECT 'TRAIT_PARTISANS_' \|\| Owner, ModifierId/);
  const effects = [...sql.matchAll(/EFFECT_[A-Z_]+/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(effects)], ["EFFECT_PLAYER_SPAWN_TRIBE_NEAR"], "only the one effect");
});

test("every notification type has a row, a sound and an icon, and the script names the same types", () => {
  const types = read("data/partisans-notifications.xml").match(/Type="(NOTIFICATION_PT_[A-Z]+)" Kind/g).map((s) => s.split('"')[1]);
  const notif = read("data/partisans-notifications.xml");
  const icons = read("data/partisans-notification-icons.xml");
  const script = read("ui/pt-notify.js");
  assert.equal(types.length, 5);
  for (const t of types) {
    assert.match(notif, new RegExp(`<Row NotificationType="${t}" SeverityType=`));
    assert.match(notif, new RegExp(`<Row NotificationType="${t}" Context="Add"`));
    assert.match(icons, new RegExp(`<ID>${t}</ID>`));
    assert.ok(script.includes(`"${t}"`), `${t} in pt-notify.js`);
  }
});
