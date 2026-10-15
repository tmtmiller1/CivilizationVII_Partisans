// pt-settings.test.mjs - the options slice beside other mods', and the store's known misbehaviour.
import test from "node:test";
import assert from "node:assert/strict";
import { getOption, setOption, resetSettings, DEFAULTS } from "../ui/pt-settings.js";

function fakeStore(initial = {}, alias = null) {
  const data = { ...initial };
  globalThis.localStorage = { getItem: (k) => (alias != null ? alias : (k in data ? data[k] : null)), setItem: (k, v) => { data[k] = String(v); } };
  return data;
}

test("defaults: every cause on, flips from any mod on, parks calm on, debug off", () => {
  fakeStore();
  resetSettings();
  assert.deepEqual(DEFAULTS, { flipRisings: true, enclaveRisings: true, miseryRisings: true, flipsFromAnyMod: true, parksCalm: true, debug: false });
  for (const k of Object.keys(DEFAULTS)) assert.equal(getOption(k), DEFAULTS[k]);
});

test("saved in our own slice beside another mod's, and read back", () => {
  const data = fakeStore({ modSettings: JSON.stringify({ "other-mod": { a: 1 } }) });
  resetSettings();
  assert.equal(setOption("miseryRisings", false), true);
  const root = JSON.parse(data.modSettings);
  assert.deepEqual(root["other-mod"], { a: 1 });
  assert.equal(root["tower-partisans"].miseryRisings, false);
  resetSettings();
  assert.equal(getOption("miseryRisings"), false);
  assert.equal(setOption("notAnOption", true), false);
});

test("a read that returns another key's blob is never written back; the value is kept for the session", () => {
  const data = fakeStore({}, JSON.stringify({ v: 2, history: [1] }));
  resetSettings();
  assert.equal(setOption("parksCalm", false), false);
  assert.equal(data.modSettings, undefined);
  assert.equal(getOption("parksCalm"), false);
});

test("a read that throws refuses the write", () => {
  globalThis.localStorage = { getItem: () => { throw new Error("getItem"); }, setItem: () => { throw new Error("setItem"); } };
  resetSettings();
  assert.equal(setOption("flipRisings", false), false);
  assert.equal(getOption("flipRisings"), false);
});
