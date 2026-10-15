// pt-describe.test.mjs - the "why" line a notice carries, and the relation words it uses.
import test from "node:test";
import assert from "node:assert/strict";
import { makeWorld, setRelation } from "./_world.mjs";
import { relationKey, whyLine, describeBrewing } from "../ui/pt-describe.js";

test("relation words by level, war first", () => {
  assert.equal(relationKey({ lvl: 50, war: true }), "LOC_PT_REL_WAR");
  assert.equal(relationKey({ lvl: -60, war: false }), "LOC_PT_REL_HOSTILE");
  assert.equal(relationKey({ lvl: -30, war: false }), "LOC_PT_REL_UNFRIENDLY");
  assert.equal(relationKey({ lvl: 0, war: false }), "LOC_PT_REL_NEUTRAL");
  assert.equal(relationKey({ lvl: 30, war: false }), "LOC_PT_REL_FRIENDLY");
});

test("why: misery numbers, the flip's relations, and the live happiness when a rising carries no numbers", () => {
  const w = makeWorld({ players: [{ id: 0, kind: "major", cities: [{ x: 20, y: 10, happiness: -14 }] }, { id: 1, kind: "major" }] });
  const city = globalThis.Cities.get({ owner: 0, id: 20010 });
  assert.equal(whyLine({ cause: "misery", detail: { happiness: -12.4, turns: 21 } }, city), "LOC_PT_WHY_MISERY|City20_10|-12|21");
  assert.equal(whyLine({ cause: "misery" }, city), "LOC_PT_WHY_MISERY|City20_10|-14|0");
  setRelation(w, 1, 0, { lvl: -70 });
  assert.deepEqual(describeBrewing({ cause: "flip", owner: 0, from: 1 }, city, 2),
    ["LOC_PT_WHY_FLIP|City20_10|Adj1|LOC_PT_REL_HOSTILE", "LOC_PT_WHEN|City20_10|2"]);
});

test("why, for an enclave: the host's card when one was in force, else the war; never the community's name", () => {
  const w = makeWorld({ players: [{ id: 0, kind: "major", cities: [{ x: 20, y: 10 }] }, { id: 1, kind: "major" }] });
  const city = globalThis.Cities.get({ owner: 0, id: 20010 });
  w.traditionDefs.add("TRADITION_EMIG_SUSPECT_EXPLORATION");
  assert.equal(whyLine({ cause: "enclave", owner: 0, homeland: 1, policy: "TRADITION_EMIG_SUSPECT_EXPLORATION" }, city),
    "LOC_PT_WHY_ENCLAVE_POLICY|LOC_TRADITION_EMIG_SUSPECT_EXPLORATION_NAME|City20_10|Civ1");
  assert.equal(whyLine({ cause: "enclave", owner: 0, homeland: 1 }, city), "LOC_PT_WHY_ENCLAVE_WAR|City20_10|Civ1");
  assert.equal(whyLine({ cause: "enclave", owner: 0, homeland: 1, policy: "TRADITION_GONE" }, city),
    "LOC_PT_WHY_ENCLAVE_WAR|City20_10|Civ1", "a card the database doesn't know falls back to the war");
});
