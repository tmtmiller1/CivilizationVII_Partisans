// pt-state.test.mjs - the saved record: shape, sanitising, the age rollover and the counts.
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeState, rolloverAge, cityRecord, logEvent, activeCounts, emptyState, loadState, saveState, STATE } from "../ui/pt-state.js";

test("a fresh state has the spec's shape", () => {
  assert.deepEqual(emptyState(7), { v: 1, age: 7, cities: {}, rebels: {}, pending: [], log: [], history: [], nextId: 1 });
});

test("a corrupt blob sanitises to the shape, dropping what can't be read", () => {
  const s = normalizeState({
    age: "x", cities: { "3,4": { owner: 2, M: -3, T: "t", cooling: 1.9, risings: [{ cause: "flip", I: 0.7, start: 3, ip: 9, units: [{ owner: 9, id: 1 }, "bad"], joiners: [{ ip: 5, units: [] }] }, { cause: 1 }] },
      "bad key": { owner: 1 }, "1,1": null },
    rebels: { "2": { ip: 9, age: 7, mustered: 1 }, x: { ip: 1 } },
    pending: [{ at: "3,4", owner: 2, cause: "flip", I: 0.5, dueTurn: 9, stage: "brewing", from: 1, pFlip: 0.25 }, { at: "3,4", stage: "odd", cause: "flip" }, null],
    log: [{ turn: 1, outcome: "x" }, 5]
  }, 7);
  assert.equal(s.age, 7);
  assert.deepEqual(Object.keys(s.cities), ["3,4"]);
  assert.deepEqual(s.cities["3,4"], { owner: 2, M: 0, T: 0, cooling: 1, risings: [{ cause: "flip", I: 0.7, start: 3, ip: 9, units: [{ owner: 9, id: 1 }], joiners: [{ ip: 5, units: [] }] }] });
  assert.deepEqual(s.rebels, { "2": { ip: 9, age: 7, mustered: true } });
  assert.deepEqual(s.pending, [{ at: "3,4", owner: 2, cause: "flip", I: 0.5, dueTurn: 9, stage: "brewing", from: 1, pFlip: 0.25 }]);
  assert.deepEqual(s.log, [{ turn: 1, outcome: "x" }]);
  assert.deepEqual(normalizeState("garbage", 1), emptyState(1));
});

test("the age rollover clears rebels, pending and risings, halves M and T, clears cooling", () => {
  const s = emptyState(1);
  s.cities["1,1"] = { owner: 0, M: 9, T: 7, cooling: 30, risings: [{ cause: "misery", I: 1, start: 1, ip: 9, units: [], joiners: [] }] };
  s.rebels["0"] = { ip: 9, age: 1, mustered: true };
  s.pending.push({ at: "1,1", owner: 0, cause: "flip", I: 1, dueTurn: 2, stage: "brewing" });
  s.musterSnapshot = [1, 2];
  rolloverAge(s, 2);
  assert.equal(s.age, 2);
  assert.deepEqual(s.rebels, {});
  assert.deepEqual(s.pending, []);
  assert.equal(s.musterSnapshot, undefined);
  assert.deepEqual(s.cities["1,1"], { owner: 0, M: 4, T: 3, cooling: 0, risings: [] });
});

test("cityRecord starts at zero and follows the owner; the log keeps the last 50; counts per owner", () => {
  const s = emptyState(1);
  const r = cityRecord(s, "2,2", 3);
  assert.deepEqual(r, { owner: 3, M: 0, T: 0, cooling: 0, risings: [] });
  cityRecord(s, "2,2", 4);
  assert.equal(s.cities["2,2"].owner, 4);
  for (let i = 0; i < 60; i++) logEvent(s, { turn: i, outcome: "x" });
  assert.equal(s.log.length, 50);
  assert.equal(s.log[0].turn, 10);
  s.cities["2,2"].risings.push({ cause: "misery", I: 1, start: 1, ip: 9, units: [], joiners: [] });
  s.cities["5,5"] = { owner: 4, M: 0, T: 0, cooling: 0, risings: [{ cause: "flip", I: 1, start: 1, ip: 9, units: [], joiners: [] }] };
  s.cities["6,6"] = { owner: 1, M: 0, T: 0, cooling: 0, risings: [] };
  assert.deepEqual(activeCounts(s), { byOwner: { 4: 2 }, total: 2 });
});

test("load and save go through the game's configuration store under Partisans_v1", () => {
  const store = {};
  globalThis.Configuration = { getGame: () => ({ getValue: (k) => store[k] ?? null }), editGame: () => ({ setValue: (k, v) => { store[k] = v; } }) };
  assert.deepEqual(loadState(3), emptyState(3));
  const s = emptyState(3);
  cityRecord(s, "1,2", 0).M = 4;
  assert.ok(saveState(s) > 0);
  assert.equal(STATE.KEY, "Partisans_v1");
  assert.equal(loadState(3).cities["1,2"].M, 4);
  store.Partisans_v1 = "{not json";
  assert.deepEqual(loadState(3), emptyState(3));
  delete globalThis.Configuration;
});

test("the last pass's age and turn survive a save, and a malformed one is dropped", () => {
  assert.equal(normalizeState({ lastPass: "-5:12" }, 7).lastPass, "-5:12");
  assert.equal(normalizeState({ lastPass: "12" }, 7).lastPass, undefined);
  assert.equal(normalizeState({ lastPass: 12 }, 7).lastPass, undefined);
});
