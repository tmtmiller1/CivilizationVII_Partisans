// pt-history.test.mjs - the record of risings other mods read: open, close, the age change, the cap, a bad blob.
import test from "node:test";
import assert from "node:assert/strict";
import { closeAll, closeChapter, normHistory, openChapter, readHistory } from "../ui/pt-history.js";
import { emptyState, normalizeState, rolloverAge } from "../ui/pt-state.js";

const entry = (over = {}) => ({ at: "3,4", name: "Mutsu", owner: 0, cause: "flip", from: 1, ip: 9, start: 12, ...over });

test("a chapter opens with an id, closes once, and readers get copies", () => {
  const s = emptyState(1);
  const id = openChapter(s, entry());
  assert.equal(id, 1);
  assert.equal(openChapter(s, entry({ at: "5,5", cause: "misery", from: undefined })), 2);
  assert.equal(closeChapter(s, id, 15, "dispersed"), true);
  assert.equal(closeChapter(s, id, 20, "time"), false, "the first ending stands");
  const out = readHistory(s);
  assert.deepEqual(out[0], { id: 1, at: "3,4", name: "Mutsu", owner: 0, cause: "flip", from: 1, ip: 9, start: 12, end: 15, outcome: "dispersed" });
  assert.equal(out[1].end, undefined, "the second is still running");
  out[0].name = "changed";
  assert.equal(s.history[0].name, "Mutsu", "a reader's copy can't change the record");
});

test("the age change closes what's open and keeps the history", () => {
  const s = emptyState(1);
  s.cities["3,4"] = { owner: 0, M: 4, T: 2, cooling: 0, risings: [{ cause: "flip", I: 1, start: 12, ip: 9, units: [], joiners: [], hid: 1 }] };
  openChapter(s, entry());
  rolloverAge(s, 2, 30);
  assert.equal(s.cities["3,4"].risings.length, 0);
  assert.deepEqual([s.history[0].end, s.history[0].outcome], [30, "age"]);
  closeAll(s, 40);
  assert.equal(s.history[0].end, 30, "an ended chapter keeps its turn");
});

test("the history survives a save and load, and a bad blob loses only the bad rows", () => {
  const s = emptyState(1);
  openChapter(s, entry());
  s.cities["3,4"] = { owner: 0, M: 0, T: 0, cooling: 0, risings: [{ cause: "flip", I: 1, start: 12, ip: 9, units: [], joiners: [], hid: 1 }] };
  const back = normalizeState(JSON.parse(JSON.stringify(s)), 1);
  assert.deepEqual(back.history, s.history);
  assert.equal(back.cities["3,4"].risings[0].hid, 1);
  assert.equal(back.nextId, 2);
  assert.equal(openChapter(back, entry()), 2, "ids keep counting after a load");
  assert.deepEqual(normHistory([null, { at: 1 }, { id: 3, at: "1,1", cause: "misery", owner: 2, start: 5 }, "x"]).map((c) => c.id), [3]);
});

test("past the cap the oldest ended chapters go first and a running one stays", () => {
  const s = emptyState(1);
  const first = openChapter(s, entry());
  for (let i = 0; i < 305; i++) { const id = openChapter(s, entry({ start: 20 + i })); closeChapter(s, id, 21 + i, "time"); }
  assert.equal(s.history.length, 300);
  assert.ok(s.history.some((c) => c.id === first), "the running chapter is kept");
});
