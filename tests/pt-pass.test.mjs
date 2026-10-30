// pt-pass.test.mjs - the pass against the stub world: misery climbs and rises, the band is placed and recorded, a
// muster is detected, risings end, and the due-turn re-check of a flip.
import test from "node:test";
import assert from "node:assert/strict";
import { makeWorld, addPlayer, addCamp, addUnit, antiquityUnits, setRelation, slotCard } from "./_world.mjs";
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
  // Under c8 (which sets NODE_V8_COVERAGE) the instrumented pass ran 35 ms once with the other test files running
  // alongside; the 30 ms budget is held by the plain `npm test` run in verify.
  const budget = process.env.NODE_V8_COVERAGE ? 120 : 30;
  assert.ok(r.ms < budget, `${r.ms} ms`);
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

test("a unit the engine creates late still counts when it stands on a plot the band asked for", async () => {
  // Watched 2026-10-16 (block 1 L2): with three turns rolling during the placement, Heijo's band landed 2 of 3 after
  // 14 refusals. Each unit here shows up one read late, as when the engine answers after the turn roll.
  const { w, ctx } = setup({ happiness: 5 });
  addPlayer(w, { id: 24, kind: "independent" });
  addCamp(w, 24, 23, 14, "IMPROVEMENT_ENCAMPMENT");
  w.hostility.set("24:0", "HOSTILE");
  ctx.state.rebels["0"] = { ip: 24, age: 100, mustered: true };
  w.lagReads = 2;
  const { runRising } = await import("../ui/pt-rising.js");
  const out = await runRising(ctx, ctx.state, { key: "20,10", owner: 0, cause: "misery", I: 0.6 });
  assert.equal(out, "rising");
  const rising = ctx.state.cities["20,10"].risings[0];
  assert.equal(rising.units.length, 3, "the full band");
  assert.equal(w.players.get(24).units.length, 3, "the one that landed after the band was full is removed");
  assert.equal(w.requests.filter((q) => q.kind === "DESTROY_ELEMENT" && q.args.Kind === "UNIT").length, 1);
  assert.deepEqual(ctx.placements, { attempts: 4, refused: 1 });
});

test("a unit of the independent's own that comes up during the placement is left alone", async () => {
  const { w, ctx } = setup({ happiness: 5 });
  addPlayer(w, { id: 24, kind: "independent" });
  addCamp(w, 24, 23, 14, "IMPROVEMENT_ENCAMPMENT");
  w.hostility.set("24:0", "HOSTILE");
  ctx.state.rebels["0"] = { ip: 24, age: 100, mustered: true };
  w.lagged.push({ owner: 24, x: 30, y: 14, type: "UNIT_SCOUT", reads: 2 });   // trained at its own camp on its turn
  const { runRising } = await import("../ui/pt-rising.js");
  await runRising(ctx, ctx.state, { key: "20,10", owner: 0, cause: "misery", I: 0.6 });
  assert.equal(ctx.state.cities["20,10"].risings[0].units.length, 3);
  assert.ok(w.players.get(24).units.some((u) => u.type === "UNIT_SCOUT" && u.x === 30), "its scout is still there");
  assert.equal(w.requests.filter((q) => q.kind === "DESTROY_ELEMENT").length, 0);
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

test("a pass marks its turn, so a second seat's turn start or a reload can tell it already ran", async () => {
  const { passedThisTurn } = await import("../ui/pt-pass.js");
  const { w, ctx } = setup();
  assert.equal(passedThisTurn(ctx.state), false);
  await runPass(ctx);
  assert.equal(passedThisTurn(ctx.state), true);
  assert.equal(JSON.parse(w.store.Partisans_v1).lastPass, "100:10", "saved with the state");
  w.turn++;
  assert.equal(passedThisTurn(ctx.state), false);
});

test("a rising the gates refuse keeps the counter that rolled it", async () => {
  const { w, ctx } = setup();
  const { runRising } = await import("../ui/pt-rising.js");
  ctx.state.cities["20,10"] = { owner: 0, M: 25, T: 0, cooling: 0, risings: [] };
  w.multiplayer = true;
  const out = await runRising(ctx, ctx.state, { key: "20,10", owner: 0, cause: "misery", I: 0.6, settle: true });
  assert.equal(out, "refused: multiplayer");
  assert.equal(ctx.state.cities["20,10"].M, 25, "kept");
  w.multiplayer = false;
  await runRising(ctx, ctx.state, { key: "20,10", owner: 0, cause: "misery", I: 0.6, settle: true });
  assert.equal(ctx.state.cities["20,10"].M, 10, "halved once past the gates");
});

test("a settlement with a rising brewing there doesn't roll for another, and this pass's hits count toward the caps", () => {
  const { ctx } = setup();
  const s = { key: "20,10", owner: 0, capital: false };
  const rec = { owner: 0, M: 25, T: 0, cooling: 0, risings: [] };
  assert.equal(__test.mayRoll(ctx.state, rec, s, []), true);
  ctx.state.pending.push({ at: "20,10", owner: 0, cause: "flip", I: 0.5, dueTurn: 12, stage: "brewing" });
  assert.equal(__test.mayRoll(ctx.state, rec, s, []), false, "brewing here");
  ctx.state.pending = [];
  assert.equal(__test.mayRoll(ctx.state, rec, s, [{ key: "20,10", owner: 0 }]), false, "asked for here this pass");
  assert.equal(__test.mayRoll(ctx.state, rec, s, [{ key: "1,1", owner: 0 }, { key: "2,2", owner: 0 }]), false, "per-civ cap");
  assert.equal(__test.mayRoll(ctx.state, rec, s, [{ key: "1,1", owner: 1 }]), true);
});

test("a rebel hideout is trimmed to the age's cap, newest first, and its band's units stay", async () => {
  const { w, ctx } = setup({ happiness: 5 });
  addPlayer(w, { id: 24, kind: "independent" });
  for (let id = 1; id <= 8; id++) addUnit(w, 24, { id, x: 23, y: 14 });
  ctx.state.rebels["0"] = { ip: 24, age: 100, mustered: true };
  ctx.state.cities["20,10"] = { owner: 0, M: 0, T: 0, cooling: 0,
    risings: [{ cause: "misery", I: 0.6, start: 10, ip: 24, units: [{ owner: 24, id: 7 }, { owner: 24, id: 8 }], joiners: [] }] };
  ctx.state.rebels["1"] = { ip: -1, age: 100, mustered: true };
  await runPass(ctx);
  assert.deepEqual(w.players.get(24).units.map((u) => u.id), [1, 2, 3, 7, 8], "three at the camp (the Antiquity cap) and the band");
});

test("a rebel people from an earlier age, or another independent, isn't trimmed", async () => {
  const { w, ctx } = setup({ happiness: 5 });
  addPlayer(w, { id: 24, kind: "independent" });
  addPlayer(w, { id: 25, kind: "independent" });
  for (let id = 1; id <= 6; id++) { addUnit(w, 24, { id, x: 23, y: 14 }); addUnit(w, 25, { id, x: 25, y: 14 }); }
  ctx.state.rebels["0"] = { ip: 24, age: 99, mustered: true };
  ctx.state.age = 100;
  await runPass(ctx);
  assert.equal(w.players.get(24).units.length, 6);
  assert.equal(w.players.get(25).units.length, 6);
});

test("after a turn roll during the placement, a unit of the band's type off the plots is the independent's own and stays", async () => {
  const { w, ctx } = setup({ happiness: 5 });
  addPlayer(w, { id: 24, kind: "independent" });
  addCamp(w, 24, 23, 14, "IMPROVEMENT_ENCAMPMENT");
  w.hostility.set("24:0", "HOSTILE");
  ctx.state.rebels["0"] = { ip: 24, age: 100, mustered: true };
  // The turn rolls while the first unit is landing, and the camp respawns a Warrior of its own.
  setTimeout(() => { w.turn++; addUnit(w, 24, { x: 23, y: 14, type: "UNIT_WARRIOR" }); }, 0);
  const { runRising } = await import("../ui/pt-rising.js");
  await runRising(ctx, ctx.state, { key: "20,10", owner: 0, cause: "misery", I: 0.6 });
  assert.equal(ctx.state.cities["20,10"].risings[0].units.length, 3);
  assert.ok(w.players.get(24).units.some((u) => u.x === 23 && u.y === 14), "the camp's Warrior is still there");
  assert.equal(w.requests.filter((q) => q.kind === "DESTROY_ELEMENT").length, 0);
});

test("hotseat: a rising in the second seat's settlement is told to that seat when its turn starts", async () => {
  const { flushNotices } = await import("../ui/pt-notify.js");
  const { w, ctx } = setup({ happiness: 5 });
  w.players.get(1).human = true;
  addPlayer(w, { id: 24, kind: "independent" });
  addCamp(w, 24, 33, 22, "IMPROVEMENT_ENCAMPMENT");
  w.hostility.set("24:1", "HOSTILE");
  ctx.state.rebels["1"] = { ip: 24, age: 100, mustered: true };
  const { addCity } = await import("./_world.mjs");
  addCity(w, 1, { x: 30, y: 26, population: 3 });
  const { runRising } = await import("../ui/pt-rising.js");
  assert.equal(await runRising(ctx, ctx.state, { key: "30,26", owner: 1, cause: "misery", I: 0.6 }), "rising");
  assert.equal(w.notifications.length, 0, "seat 0's turn: nothing for seat 1 yet");
  assert.equal(flushNotices(), 0, "nothing waits for seat 0");
  w.local = 1;
  assert.equal(flushNotices(), 1);
  assert.deepEqual(w.notifications.map((n) => n.pid), [1]);
});

test("an AI's rising tells nobody", async () => {
  const { w, ctx } = setup({ happiness: 5 });
  addPlayer(w, { id: 24, kind: "independent" });
  w.hostility.set("24:1", "HOSTILE");
  ctx.state.rebels["1"] = { ip: 24, age: 100, mustered: true };
  const { addCity } = await import("./_world.mjs");
  addCity(w, 1, { x: 30, y: 26, population: 3 });
  const { runRising } = await import("../ui/pt-rising.js");
  assert.equal(await runRising(ctx, ctx.state, { key: "30,26", owner: 1, cause: "misery", I: 0.6 }), "rising");
  w.local = 1;
  const { flushNotices } = await import("../ui/pt-notify.js");
  assert.equal(flushNotices(), 0);
  assert.equal(w.notifications.length, 0);
});

test("an AI's friendly rebel people is turned against it and fields the band", async () => {
  const { w, ctx } = setup({ happiness: 5 });
  addPlayer(w, { id: 24, kind: "independent" });
  addCamp(w, 24, 33, 22, "IMPROVEMENT_ENCAMPMENT");
  ctx.state.rebels["1"] = { ip: 24, age: 100, mustered: true };
  const { addCity } = await import("./_world.mjs");
  addCity(w, 1, { x: 30, y: 26, population: 3 });
  const { runRising } = await import("../ui/pt-rising.js");
  assert.equal(w.hostility.get("24:1"), undefined, "friendly to start");
  assert.equal(await runRising(ctx, ctx.state, { key: "30,26", owner: 1, cause: "misery", I: 0.6 }), "rising");
  assert.deepEqual(w.levelChanges, [[24, 1, -3]], "its standing with the AI dropped to 0, nobody else's");
  assert.equal(w.hostility.get("24:1"), "HOSTILE");
  assert.equal(w.hostility.get("24:0"), undefined, "still friendly to the local player");
  assert.equal(ctx.state.cities["30,26"].risings[0].ip, 24, "the band is the rebel people's");
});

test("the local player's friendly rebel people is turned the same way, with the war request as the fallback", async () => {
  const { w, ctx } = setup({ happiness: 5 });
  addPlayer(w, { id: 24, kind: "independent" });
  addCamp(w, 24, 33, 22, "IMPROVEMENT_ENCAMPMENT");
  ctx.state.rebels["0"] = { ip: 24, age: 100, mustered: true };
  const { addCity } = await import("./_world.mjs");
  addCity(w, 0, { x: 30, y: 26, population: 3 });
  const { runRising } = await import("../ui/pt-rising.js");
  assert.equal(await runRising(ctx, ctx.state, { key: "30,26", owner: 0, cause: "misery", I: 0.6 }), "rising");
  assert.deepEqual(w.levelChanges, [[24, 0, -3]]);
  assert.equal(ctx.state.cities["30,26"].risings[0].ip, 24);
  // Without the standing call, the war request still does it for the local player.
  const { w: w2, ctx: ctx2 } = setup({ happiness: 5 });
  addPlayer(w2, { id: 24, kind: "independent" });
  addCamp(w2, 24, 33, 22, "IMPROVEMENT_ENCAMPMENT");
  ctx2.state.rebels["0"] = { ip: 24, age: 100, mustered: true };
  addCity(w2, 0, { x: 30, y: 26, population: 3 });
  globalThis.Game.IndependentPowers.getIndependentPlayerLevel = () => { throw new Error("no such method"); };
  assert.equal(await runRising(ctx2, ctx2.state, { key: "30,26", owner: 0, cause: "misery", I: 0.6 }), "rising");
  assert.equal(w2.hostility.get("24:0"), "HOSTILE", "the war request did it");
  assert.equal(ctx2.state.cities["30,26"].risings[0].ip, 24);
});
