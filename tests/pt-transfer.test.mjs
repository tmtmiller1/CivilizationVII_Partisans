// pt-transfer.test.mjs - the flip roll and the CityTransfered handler against the stub world.
import test from "node:test";
import assert from "node:assert/strict";
import { makeWorld, setRelation } from "./_world.mjs";
import { emptyState } from "../ui/pt-state.js";
import { flipOutlook, onCityTransfered, isCultureTransfer, rollFlip, onSettlementLost } from "../ui/pt-transfer.js";
import { resetSettings, setOption } from "../ui/pt-settings.js";
import { resetNotices } from "../ui/pt-notify.js";

function world() {
  const w = makeWorld({ local: 0, players: [
    { id: 0, kind: "major", cities: [{ x: 10, y: 10, capital: true }, { x: 20, y: 10 }] },
    { id: 1, kind: "major", cities: [{ x: 30, y: 10, capital: true }] },
    { id: 9, kind: "independent" }
  ] });
  resetSettings();
  resetNotices();
  return w;
}

test("the engine's culture transfer type is recognised, by enum or by name", () => {
  world();
  assert.equal(isCultureTransfer(7), true);
  assert.equal(isCultureTransfer(1), false);
  delete globalThis.CityTransferTypes;
  assert.equal(isCultureTransfer("BY_CULTURAL_IDENTITY"), true);
});

test("the roll uses the banded chance and intensity", () => {
  assert.deepEqual(rollFlip({ lvl: 0, war: false, ally: false }, 0.02), { p: 0.03, hit: true, I: 0.4 });
  assert.deepEqual(rollFlip({ lvl: 0, war: false, ally: false }, 0.3), { p: 0.03, hit: false, I: 0.4 });
  assert.equal(rollFlip({ lvl: -60, war: true, ally: false }, 0.34).hit, true);
});

test("a culture flip to the local player schedules a brewing rising and a notice", () => {
  const w = world();
  setRelation(w, 1, 0, { lvl: -30 });
  const state = emptyState(100);
  const out = onCityTransfered(state, { fromPlayer: 1, transferType: 7, cityID: { owner: 0, id: 20010, type: 1 } }, () => 0.05);
  assert.equal(out, "flip");
  assert.equal(state.pending.length, 1);
  const p = state.pending[0];
  assert.equal(p.at, "20,10");
  assert.equal(p.owner, 0);
  assert.equal(p.from, 1);
  assert.equal(p.stage, "brewing");
  assert.equal(p.pFlip, 0.08);
  assert.equal(p.dueTurn, w.turn + 1, "rand 0.05 gives the shortest delay");
  assert.equal(w.notifications.length, 1);
  assert.equal(w.notifications[0].Type, "NOTIFICATION_PT_BREWING");
  assert.match(w.notifications[0].Summary, /LOC_PT_WHY_FLIP\|City20_10\|Adj1/);
  assert.match(w.notifications[0].Message, /LOC_PT_NOTIFY_BREWING_TITLE_CITY\|City20_10/);
});

test("a flip between allies, a missed roll, a non-culture transfer and a switched-off cause schedule nothing", () => {
  const w = world();
  const state = emptyState(100);
  const ev = { fromPlayer: 1, transferType: 7, cityID: { owner: 0, id: 20010, type: 1 } };
  setRelation(w, 1, 0, { ally: true });
  assert.equal(onCityTransfered(state, ev, () => 0), "flip");
  assert.equal(state.pending.length, 0, "allies: chance 0");
  setRelation(w, 1, 0, { lvl: 40 });
  onCityTransfered(state, ev, () => 0);
  assert.equal(state.pending.length, 0, "friends: the people wanted to join");
  setRelation(w, 1, 0, { lvl: 0 });
  onCityTransfered(state, ev, () => 0.9);
  assert.equal(state.pending.length, 0, "a miss");
  assert.equal(onCityTransfered(state, { ...ev, transferType: 1 }, () => 0), "other transfer");
  setOption("flipRisings", false);
  assert.equal(onCityTransfered(state, ev, () => 0), "flip ignored");
  assert.equal(w.notifications.length, 0);
});

test("the flip roll reads both civs: the worse side's level counts", () => {
  const w = world();
  const state = emptyState(100);
  const ev = { fromPlayer: 1, transferType: 7, cityID: { owner: 0, id: 20010, type: 1 } };
  setRelation(w, 1, 0, { lvl: 40 });
  w.relations.set("0:1", -60);   // only the civ that gained it reads hostile
  onCityTransfered(state, ev, () => 0.1);
  assert.equal(state.pending.length, 1, "the gainer is hostile to the loser: 0.15");
  assert.equal(state.pending[0].pFlip, 0.15);
});

test("Cultural Diffusion's flip notice can carry the unrest: the outlook, and no second notice", () => {
  const w = world();
  setRelation(w, 1, 0, { lvl: -30 });
  const state = emptyState(100);
  const ev = { fromPlayer: 1, transferType: 7, cityID: { owner: 0, id: 20010, type: 1 } };
  assert.equal(flipOutlook(state, "20,10"), null, "nothing brewing yet");
  globalThis.culturalDiffusion = { tellsPartisanUnrest: true };
  try {
    onCityTransfered(state, ev, () => 0.05);
    assert.equal(state.pending.length, 1, "the rising is still scheduled");
    assert.equal(w.notifications.length, 0, "Cultural Diffusion tells the player, so Partisans doesn't");
    const o = flipOutlook(state, "20,10");
    assert.deepEqual({ ...o, line: undefined }, { turns: 1, from: 1, owner: 0, line: undefined });
    assert.match(o.line, /LOC_PT_FLIP_OUTLOOK\|City20_10/);
  } finally { delete globalThis.culturalDiffusion; }
});

test("a settlement an independent takes during a rising ends it and tells the player who lost it", () => {
  const w = world();
  const state = emptyState(100);
  state.cities["20,10"] = { owner: 0, M: 0, T: 0, cooling: 0, risings: [{ cause: "misery", I: 1, start: 1, ip: 9, units: [], joiners: [], hid: 4 }] };
  state.history.push({ id: 4, at: "20,10", name: "City20_10", owner: 0, cause: "misery", ip: 9, start: 1 });
  w.players.get(0).cities[1].owner = 9;
  const out = onCityTransfered(state, { fromPlayer: 0, transferType: 1, cityID: { owner: 9, id: 20010, type: 1 } }, () => 0);
  assert.equal(out, "burned");
  assert.deepEqual([state.history[0].end, state.history[0].outcome], [w.turn, "burned"]);
  assert.equal(state.cities["20,10"].risings.length, 0);
  assert.equal(w.notifications[0].Type, "NOTIFICATION_PT_LOST");
  assert.equal(onSettlementLost(state, "1,1", "X", 0), false, "nothing to end");
});
