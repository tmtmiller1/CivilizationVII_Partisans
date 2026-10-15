// pt-ui.test.mjs - the pure part of the panel section.
import test from "node:test";
import assert from "node:assert/strict";
import { panelLines } from "../ui/pt-panel.js";
import { emptyState } from "../ui/pt-state.js";

function stateWith() {
  const s = emptyState(100);
  s.cities["1,1"] = { owner: 0, M: 14, T: 12, cooling: 0, risings: [{ cause: "flip", I: 1, start: 1, ip: 9, units: [{ owner: 9, id: 1 }, { owner: 9, id: 2 }], joiners: [{ ip: 5, units: [{ owner: 5, id: 3 }] }] }] };
  s.cities["2,2"] = { owner: 0, M: 3, T: 0, cooling: 25, risings: [] };
  s.pending.push({ at: "3,3", owner: 0, cause: "flip", I: 0.5, dueTurn: 9, stage: "brewing" });
  return s;
}

test("the panel lists the status, the misery turns of the need and the tension", () => {
  const s = stateWith();
  assert.deepEqual(panelLines(s, "1,1", 10), [
    { key: "LOC_PT_PANEL_RISING", args: [3] },
    { key: "LOC_PT_PANEL_MISERY", args: [14, 20] },
    { key: "LOC_PT_PANEL_TENSION", args: [12] }
  ]);
  assert.deepEqual(panelLines(s, "3,3", 10)[0], { key: "LOC_PT_PANEL_BREWING", args: [] });
  assert.deepEqual(panelLines(s, "2,2", 10), [
    { key: "LOC_PT_PANEL_COOLING", args: [15] },
    { key: "LOC_PT_PANEL_MISERY", args: [3, 20] },
    { key: "LOC_PT_PANEL_TENSION", args: [0] }
  ]);
  assert.deepEqual(panelLines(s, "2,2", 30)[0], { key: "LOC_PT_PANEL_MISERY", args: [3, 20] }, "cooling over: no status line");
  s.speed = 1.5;
  assert.deepEqual(panelLines(s, "9,9", 1), [{ key: "LOC_PT_PANEL_MISERY", args: [0, 30] }, { key: "LOC_PT_PANEL_TENSION", args: [0] }]);
  assert.deepEqual(panelLines(null, "1,1", 1), [{ key: "LOC_PT_PANEL_CALM", args: [] }]);
});
