// pt-pass.test.mjs - the pass against the stub world: misery climbs and rises, the band is placed and recorded, a
// muster is detected, risings end, and the due-turn re-check of a flip.
import test from "node:test";
import assert from "node:assert/strict";
import { makeWorld, addPlayer, addCamp, antiquityUnits, setRelation, slotCard } from "./_world.mjs";
import { emptyState } from "../ui/pt-state.js";
import { CONFIG, CONFIG_DEFAULTS } from "../ui/pt-config.js";
import { runPass, __test } from "../ui/pt-pass.js";
import { resetSettings } from "../ui/pt-settings.js";
import { resetUnitCache } from "../ui/pt-units.js";
import { resetNotices } from "../ui/pt-notify.js";
import { MARKER } from "../ui/pt-muster.js";
import { scanCamps } from "../ui/pt-engine.js";

function setup(opt = {}) {
  const w = makeWorld({ local: 0, turn: 10, players: [
    { id: 0, kind: "major", cities: [{ x: 10, y: 10, capital: true, happiness: 5 }, { x: 20, y: 10, happiness: opt.happiness ?? -12, population: 3 }] },
    { id: 1, kind: "major", cities: [{ x: 30, y: 20, capital: true }] },
    { id: 20, kind: "independent" }
  ] });
  antiquityUnits(w);
  w.constructibleDefs.set(MARKER, { ConstructibleType: MARKER, ConstructibleClass: "BUILDING" });
  resetSettings();
  resetUnitCache();
  resetNotices();
  CONFIG.placementWaitMs = 1;
  const ctx = { state: emptyState(100), rand: () => 0.99, camps: () => scanCamps(), placements: { attempts: 0, refused: 0 } };
  return { w, ctx };
}

test.after(() => { CONFIG.placementWaitMs = CONFIG_DEFAULTS.placementWaitMs; });

test("misery counts a turn per pass at -10 or worse, and the first roll comes at the need", async () => {
  const { w, ctx } = setup();
  for (let i = 0; i < 19; i++) { await runPass(ctx); w.turn++; }
  assert.equal(ctx.state.cities["20,10"].M, 19);
  assert.equal(ctx.state.cities["10,10"].M, 0, "the happy capital stays at 0");
  assert.equal(w.requests.length, 0, "nothing sent yet");
  ctx.rand = () => 0.05;   // under the 0.10 chance at M = 20
  const r = await runPass(ctx);
  assert.equal(r.requests, 1);
  assert.equal(r.outcomes[0], "mustering", "no rebel people yet: the muster marker goes down");
  assert.equal(ctx.state.cities["20,10"].M, 10, "halved at the rising");
  assert.ok(w.requests.some((q) => q.kind === "CREATE_ELEMENT" && q.args.Type === MARKER && q.args.Location.x === 20), "marker placed");
  assert.deepEqual(ctx.state.musterSnapshot, [20]);
  assert.equal(ctx.state.pending[0].stage, "muster");
  assert.equal(JSON.parse(w.store.Partisans_v1).pending.length, 1, "saved");
});

test("at the next pass the new encampment people is the civ's rebels, the marker goes, and the band lands", async () => {
  const { w, ctx } = setup();
  ctx.state.cities["20,10"] = { owner: 0, M: 25, T: 0, cooling: 0, risings: [] };
  ctx.rand = () => 0.05;
  await runPass(ctx);
  assert.equal(ctx.state.pending[0].stage, "muster");
  // The turn rolls: the engine spawns a rebel people camped near the civ.
  w.turn++;
  addPlayer(w, { id: 24, kind: "independent" });
  addCamp(w, 24, 23, 14, "IMPROVEMENT_ENCAMPMENT");
  w.hostility.set("24:0", "HOSTILE");
  ctx.rand = () => 0.99;
  const r = await runPass(ctx);
  assert.deepEqual(ctx.state.rebels["0"], { ip: 24, age: 100, mustered: true });
  assert.equal(r.outcomes[0], "rising");
  const rec = ctx.state.cities["20,10"];
  assert.equal(rec.risings.length, 1);
  assert.equal(rec.risings[0].ip, 24);
  assert.equal(rec.risings[0].units.length, 2, "I 0.4 at -12 happiness, pop 3: 1 + round(1.2) = 2");
  const placed = w.requests.filter((q) => q.kind === "CREATE_ELEMENT" && q.args.Kind === "UNIT");
  assert.deepEqual(placed.map((q) => q.args.Type), ["UNIT_WARRIOR", "UNIT_WARRIOR"]);
  for (const q of placed) assert.equal(w.hexDistanceCheck ?? globalThis.GameplayMap.getPlotDistance(20, 10, q.args.Location.x, q.args.Location.y), 3, "ring 3 first");
  assert.equal(w.requests.filter((q) => q.kind === "DESTROY_ELEMENT").length, 1, "marker removed");
  assert.equal(ctx.state.pending.length, 0);
  const notices = w.notifications.filter((n) => n.pid === 0);
  assert.equal(notices.length, 1, "one notification for the rising, the rebels' arrival included");
  assert.equal(notices[0].Type, "NOTIFICATION_PT_RISING");
  assert.match(notices[0].Message, /LOC_PT_NOTIFY_RISING_TITLE_CITY\|City20_10/);
  assert.match(notices[0].Summary, /LOC_PT_WHY_MISERY\|City20_10/);
  assert.equal(ctx.state.history.length, 1, "the rising opens a chapter");
  assert.deepEqual(ctx.state.history[0], { id: 1, at: "20,10", name: "City20_10", owner: 0, cause: "misery", ip: 24, start: w.turn, age: "AGE_ANTIQUITY" });
  assert.equal(rec.risings[0].hid, 1);
});

test("a rising ends when its units are gone, and the settlement cools for 20 turns", async () => {
  const { w, ctx } = setup({ happiness: 5 });
  ctx.state.cities["20,10"] = { owner: 0, M: 0, T: 0, cooling: 0, risings: [{ cause: "misery", I: 0.5, start: 5, ip: 20, units: [{ owner: 20, id: 7 }], joiners: [], hid: 1 }] };
  ctx.state.history = [{ id: 1, at: "20,10", name: "City20_10", owner: 0, cause: "misery", ip: 20, start: 5 }];
  w.players.get(20).units.push({ owner: 20, id: 7, x: 1, y: 1, type: "UNIT_WARRIOR" });
  await runPass(ctx);
  assert.equal(ctx.state.cities["20,10"].risings.length, 1, "still standing");
  w.players.get(20).units = [];
  await runPass(ctx);
  assert.equal(ctx.state.cities["20,10"].risings.length, 0);
  assert.equal(ctx.state.cities["20,10"].cooling, w.turn + 20);
  assert.equal(w.notifications.at(-1).Type, "NOTIFICATION_PT_ENDED");
  assert.deepEqual([ctx.state.history[0].end, ctx.state.history[0].outcome], [w.turn, "dispersed"], "the chapter closes");
  // Time also ends it.
  ctx.state.cities["20,10"] = { owner: 0, M: 0, T: 0, cooling: 0, risings: [{ cause: "misery", I: 0.5, start: w.turn - 20, ip: 20, units: [{ owner: 20, id: 7 }], joiners: [] }] };
  w.players.get(20).units.push({ owner: 20, id: 7, x: 1, y: 1, type: "UNIT_WARRIOR" });
  await runPass(ctx);
  assert.equal(ctx.state.cities["20,10"].risings.length, 0);
});

test("a capital never rolls, a settlement in cooling doesn't roll, and the rising gate refuses a capital anyway", async () => {
  const { ctx } = setup({ happiness: 5 });
  ctx.state.cities["10,10"] = { owner: 0, M: 40, T: 0, cooling: 0, risings: [] };
  ctx.state.cities["20,10"] = { owner: 0, M: 40, T: 0, cooling: 99, risings: [] };
  ctx.rand = () => 0;
  const r = await runPass(ctx);
  assert.equal(r.requests, 0);
  assert.equal(ctx.state.cities["10,10"].M, 38, "the capital's counter is kept, not burned by a roll");
  const { runRising } = await import("../ui/pt-rising.js");
  assert.equal(await runRising(ctx, ctx.state, { key: "10,10", owner: 0, cause: "misery", I: 0.6 }), "refused: capital");
});

test("the due-turn re-check: worse relations roll again at the higher chance; an alliance stands the people down", () => {
  const { w, ctx } = setup();
  setRelation(w, 1, 0, { lvl: -30 });
  const p = { at: "20,10", owner: 0, cause: "flip", I: 0.5, dueTurn: 10, stage: "brewing", from: 1, pFlip: 0.08 };
  assert.equal(__test.recheckFlip(ctx, p), true, "unchanged: holds without a roll");
  setRelation(w, 1, 0, { lvl: -30, war: true });
  ctx.rand = () => 0.95;
  assert.equal(__test.recheckFlip(ctx, p), false, "at war: re-rolled at 0.35 and missed");
  ctx.rand = () => 0.2;
  assert.equal(__test.recheckFlip(ctx, p), true);
  assert.equal(p.pFlip, 0.35);
  assert.equal(p.I, 0.7, "war adds to the intensity");
  setRelation(w, 1, 0, { ally: true });
  assert.equal(__test.recheckFlip(ctx, p), false, "allied: called off");
});

test("the age rollover clears the risings and halves the counters; a network game writes nothing", async () => {
  const { w, ctx } = setup();
  ctx.state.cities["20,10"] = { owner: 0, M: 10, T: 6, cooling: 50, risings: [{ cause: "misery", I: 0.5, start: 5, ip: 20, units: [], joiners: [] }] };
  w.age = 200;
  await runPass(ctx);
  assert.equal(ctx.state.age, 200);
  assert.equal(ctx.state.cities["20,10"].risings.length, 0);
  assert.equal(ctx.state.cities["20,10"].M, 6, "halved to 5, then one more turn of misery");
  assert.equal(ctx.state.cities["20,10"].T, 3);
  assert.equal(ctx.state.cities["20,10"].cooling, 0);
});

test("an empty city read keeps every record; a settlement that is gone is dropped", async () => {
  const { w, ctx } = setup();
  ctx.state.cities["20,10"] = { owner: 0, M: 7, T: 2, cooling: 0, risings: [] };
  ctx.state.cities["40,20"] = { owner: 0, M: 3, T: 0, cooling: 0, risings: [] };
  const cities = new Map([...w.players].map(([id, p]) => [id, p.cities]));
  for (const p of w.players.values()) p.cities = [];
  await runPass(ctx);
  assert.equal(ctx.state.cities["20,10"].M, 7, "nothing read, nothing dropped");
  assert.equal(ctx.state.cities["40,20"].M, 3);
  for (const [id, c] of cities) w.players.get(id).cities = c;
  await runPass(ctx);
  assert.equal(ctx.state.cities["40,20"], undefined, "no settlement there: dropped");
  assert.equal(ctx.state.cities["20,10"].M, 8);
});

test("the pass bookkeeping is quick", async () => {
  const { w, ctx } = setup();
  for (let i = 2; i < 12; i++) addPlayer(w, { id: i, kind: "major", cities: [{ x: 3 * i, y: 20 + (i % 5), happiness: -11 }, { x: 3 * i, y: 5, happiness: 2 }] });
  const r = await runPass(ctx);
  assert.ok(r.ms < 30, `${r.ms} ms`);
});

test("a unit the engine puts somewhere else is removed and the plot counts as refused", async () => {
  const { w, ctx } = setup({ happiness: 5 });
  addPlayer(w, { id: 24, kind: "independent" });
  addCamp(w, 24, 23, 14, "IMPROVEMENT_ENCAMPMENT");
  w.hostility.set("24:0", "HOSTILE");
  ctx.state.rebels["0"] = { ip: 24, age: 100, mustered: true };
  w.stray.set(24, { x: 1, y: 1 });
  const { runRising } = await import("../ui/pt-rising.js");
  const out = await runRising(ctx, ctx.state, { key: "20,10", owner: 0, cause: "misery", I: 0.6 });
  assert.equal(out, "fizzled: no plot took a unit");
  assert.equal(w.players.get(24).units.length, 0, "every stray removed");
  assert.equal(w.requests.filter((q) => q.kind === "DESTROY_ELEMENT" && q.args.Kind === "UNIT").length, 16);
  assert.deepEqual(ctx.placements, { attempts: 16, refused: 16 });
});

test("a culture flip's rising is titled for the civ that lost it; misery's is an uprising", async () => {
  const { w, ctx } = setup({ happiness: 5 });
  addPlayer(w, { id: 24, kind: "independent" });
  addCamp(w, 24, 23, 14, "IMPROVEMENT_ENCAMPMENT");
  w.hostility.set("24:0", "HOSTILE");
  ctx.state.rebels["0"] = { ip: 24, age: 100, mustered: true };
  const { runRising } = await import("../ui/pt-rising.js");
  await runRising(ctx, ctx.state, { key: "20,10", owner: 0, cause: "flip", I: 0.6, from: 1, pFlip: 0 });
  assert.match(w.notifications.at(-1).Message, /^LOC_PT_NOTIFY_LOYALISTS_TITLE_CITY\|City20_10\|Adj1$/);
  ctx.state.cities["20,10"].risings = [];
  w.turn++;
  await runRising(ctx, ctx.state, { key: "20,10", owner: 0, cause: "misery", I: 0.6 });
  assert.match(w.notifications.at(-1).Message, /^LOC_PT_NOTIFY_RISING_TITLE_CITY\|City20_10$/);
});

test("enclave tension follows the host's treatment card, and a rising carries the card it rose against", async () => {
  const { w, ctx } = setup({ happiness: 5 });
  w.store.EmigrationQuarters_v1 = JSON.stringify({ v: 1, data: { tiles: { "20,10": { owner: 0, civ: 1, recognized: true } } } });
  setRelation(w, 0, 1, { lvl: -30, war: true });
  await runPass(ctx);
  assert.equal(ctx.state.cities["20,10"].T, 1, "no card at war: +1");
  slotCard(w, 0, "TRADITION_EMIG_SUSPECT_ANTIQUITY");
  w.turn++; await runPass(ctx);
  assert.equal(ctx.state.cities["20,10"].T, 4, "suspicion card at war: +3");
  slotCard(w, 0, "TRADITION_EMIG_PROTECT_ANTIQUITY");
  w.turn++; await runPass(ctx);
  assert.equal(ctx.state.cities["20,10"].T, 5, "both cards cancel: back to the card-free +1");
  w.slotted.delete("0:TRADITION_EMIG_SUSPECT_ANTIQUITY");
  w.turn++; await runPass(ctx);
  assert.equal(ctx.state.cities["20,10"].T, 4, "protective card: settles even at war");
  w.slotted.delete("0:TRADITION_EMIG_PROTECT_ANTIQUITY");
  w.slotted.add("0:TRADITION_EMIG_SUSPECT_ANTIQUITY");
  ctx.state.cities["20,10"].T = 30;
  ctx.rand = () => 0.05;
  w.turn++; const r = await runPass(ctx);
  assert.equal(r.requests, 1);
  const p = ctx.state.pending[0];
  assert.deepEqual([p.cause, p.homeland, p.policy, p.stage], ["enclave", 1, "TRADITION_EMIG_SUSPECT_ANTIQUITY", "muster"]);
  assert.equal(p.I, 0.8, "intensity from the tension at the roll");
});
