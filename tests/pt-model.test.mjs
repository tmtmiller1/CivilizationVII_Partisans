// pt-model.test.mjs - every formula and default in SPEC sections 3 to 6, pinned.
import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG_DEFAULTS as cfg } from "../ui/pt-config.js";
import * as m from "../ui/pt-model.js";

test("3.1 flip chance by relationship: rare, and only where there's bad blood", () => {
  const p = (lvl, war = false, ally = false) => m.flipChance(cfg, { lvl, war, ally });
  assert.equal(p(60), 0, "helpful: the people wanted to join");
  assert.equal(p(30), 0, "friendly: the people wanted to join");
  assert.equal(p(0), 0.03, "neutral");
  assert.equal(p(-30), 0.08, "unfriendly");
  assert.equal(p(-60), 0.15, "hostile");
  assert.equal(p(-100), 0.15, "worse than hostile stays at hostile");
  assert.equal(p(-60, true), 0.35, "at war");
  assert.equal(p(-60, true, true), 0, "allied: never");
  assert.equal(p(NaN), 0.03, "an unreadable level reads neutral");
});

test("3.1 flip intensity and brewing delay", () => {
  assert.equal(m.flipIntensity({ lvl: 0, war: false }), 0.4);
  assert.ok(Math.abs(m.flipIntensity({ lvl: -50, war: false }) - 0.6) < 1e-9);
  assert.equal(m.flipIntensity({ lvl: -100, war: true }), 1);
  assert.equal(m.flipIntensity({ lvl: 40, war: false }), 0.4, "good relations add nothing");
  assert.equal(m.brewDelay(cfg, 0), 1);
  assert.equal(m.brewDelay(cfg, 0.34), 2);
  assert.equal(m.brewDelay(cfg, 0.99), 3);
  assert.equal(m.brewDelay(cfg, 1), 3, "a roll of exactly 1 stays in range");
});

test("3.2 enclave tension follows the host's treatment card and its standing with the homeland", () => {
  const step = (T, lvl, war, stance = null) => m.enclaveStep(cfg, T, { lvl, war }, stance);
  assert.equal(step(0, 0, true, "suspect"), 3, "suspicion card at war: +3");
  assert.equal(step(0, -60, false, "suspect"), 2, "suspicion card, hostile peace: +2");
  assert.equal(step(0, -30, false, "suspect"), 1, "suspicion card, unfriendly peace: +1");
  assert.equal(step(5, 0, false, "suspect"), 4, "suspicion card, ordinary peace: settles");
  assert.equal(step(0, 0, true), 1, "no card at war: +1");
  assert.equal(step(5, -60, false), 4, "no card, hostile peace: settles");
  assert.equal(step(14, 0, true), 14, "no card: capped low");
  assert.equal(step(20, 0, true), 20, "no card: what a suspicion card built stays, it doesn't climb");
  assert.equal(step(20, 0, false), 19, "and drains in peace");
  assert.equal(step(5, -100, true, "protect"), 4, "protective card: settles even at war");
  assert.equal(step(0, 0, false), 0, "never below 0");
  assert.equal(step(29, 0, true, "suspect"), 30, "capped at enclaveMax");
  assert.equal(m.enclaveChance(cfg, 9), 0);
  assert.equal(m.enclaveChance(cfg, 10), 0);
  assert.equal(m.enclaveChance(cfg, 14), 0.1, "the most a card-free war reaches");
  assert.equal(m.enclaveChance(cfg, 30), 0.5);
  assert.ok(Math.abs(m.enclaveIntensity(12) - 0.5) < 1e-9, "from the tension, not the community's size");
  assert.equal(m.enclaveIntensity(0), 0.3, "floor");
  assert.equal(m.enclaveIntensity(30), 0.8, "cap");
});

test("3.3 misery counter, need, chance and intensity", () => {
  assert.equal(m.miseryStep(cfg, 0, -10), 1, "at the line counts");
  assert.equal(m.miseryStep(cfg, 5, -9), 5, "between the line and recovery holds");
  assert.equal(m.miseryStep(cfg, 5, -4), 3, "above recovery drops 2");
  assert.equal(m.miseryStep(cfg, 1, 10), 0, "never below 0");
  assert.equal(m.miseryNeed(cfg, 1), 20);
  assert.equal(m.miseryNeed(cfg, 1.5), 30, "Epic");
  assert.equal(m.miseryNeed(cfg, 0.67), 13, "Quick");
  assert.equal(m.miseryChance(19, 20), 0);
  assert.equal(m.miseryChance(20, 20), 0.1);
  assert.equal(m.miseryChance(25, 20), 0.2);
  assert.equal(m.miseryChance(60, 20), 0.5, "capped");
  assert.equal(m.miseryIntensity(-15), 0.5);
  assert.equal(m.miseryIntensity(-3), 0.3, "floor");
  assert.equal(m.miseryIntensity(-40), 1, "cap");
});

test("3.4 park relief from park tile types", () => {
  assert.equal(m.parkRelief(cfg, []), 0);
  assert.equal(m.parkRelief(cfg, ["IMPROVEMENT_NATIONAL_PARK", "IMPROVEMENT_NATIONAL_PARK_LAND", "IMPROVEMENT_FARM"]), 5);
  assert.equal(m.parkRelief(cfg, ["IMPROVEMENT_NATIONAL_PARK_LAND_16", "IMPROVEMENT_NATIONAL_PARK_LAND_24"]), 4);
  assert.equal(m.parkRelief(cfg, ["IMPROVEMENT_WILDERNESS_AREA", "IMPROVEMENT_WILDERNESS_AREA_LAND"]), 0, "wilderness pays no happiness");
});

test("4 gates in the spec's order", () => {
  const ok = { multiplayer: false, ownerAliveMajor: true, capital: false, activeHere: false, coolingHere: false,
    activeForOwner: 0, activeTotal: 0, causeOn: true };
  assert.equal(m.risingGate(cfg, ok), null);
  assert.equal(m.risingGate(cfg, { ...ok, multiplayer: true }), "multiplayer");
  assert.equal(m.risingGate(cfg, { ...ok, ownerAliveMajor: false }), "owner not an alive major");
  assert.equal(m.risingGate(cfg, { ...ok, capital: true }), "capital");
  assert.equal(m.risingGate(cfg, { ...ok, activeHere: true }), "rising active here");
  assert.equal(m.risingGate(cfg, { ...ok, coolingHere: true }), "cooling");
  assert.equal(m.risingGate(cfg, { ...ok, activeForOwner: 2 }), "owner at the per-civ cap");
  assert.equal(m.risingGate(cfg, { ...ok, activeTotal: 6 }), "map at the cap");
  assert.equal(m.risingGate(cfg, { ...ok, causeOn: false }), "cause switched off");
  assert.equal(m.risingGate(cfg, { ...ok, multiplayer: true, capital: true }), "multiplayer", "first failure wins");
});

test("5 owner order: rebel, declare, neighbour, muster, none", () => {
  const base = { rebel: null, targetIsLocal: false, neighbours: [], mustered: false };
  assert.deepEqual(m.chooseOwner(cfg, { ...base, rebel: { ip: 9, alive: true, hostile: true } }), { step: "rebel", ip: 9 });
  assert.deepEqual(m.chooseOwner(cfg, { ...base, rebel: { ip: 9, alive: true, hostile: false }, targetIsLocal: true }), { step: "declare", ip: 9 });
  const near = [{ ip: 5, d: 8, hostile: true, village: true }, { ip: 6, d: 3, hostile: true, village: true }];
  assert.deepEqual(m.chooseOwner(cfg, { ...base, rebel: { ip: 9, alive: true, hostile: false }, neighbours: near }), { step: "neighbour", ip: 6 });
  assert.deepEqual(m.chooseOwner(cfg, { ...base, neighbours: [{ ip: 5, d: 13, hostile: true, village: true }] }), { step: "muster" }, "outside borrowRange");
  assert.deepEqual(m.chooseOwner(cfg, { ...base, neighbours: [{ ip: 5, d: 2, hostile: false, village: true }] }), { step: "muster" }, "friendly neighbours don't count");
  assert.deepEqual(m.chooseOwner(cfg, { ...base, neighbours: [{ ip: 5, d: 2, hostile: true, village: false }] }), { step: "muster" }, "a city-state never");
  assert.deepEqual(m.chooseOwner(cfg, { ...base, mustered: true }), { step: "none" });
  assert.deepEqual(m.chooseOwner(cfg, { ...base, rebel: { ip: 9, alive: false, hostile: true }, mustered: true }), { step: "none" }, "a dead rebel people is no owner");
});

test("6.1 band size and caps per age", () => {
  assert.equal(m.bandSize(cfg, 0.4, 3, "AGE_ANTIQUITY"), 2, "1 + round(1.2) + 0");
  assert.equal(m.bandSize(cfg, 1, 16, "AGE_ANTIQUITY"), 3, "capped at 3");
  assert.equal(m.bandSize(cfg, 1, 16, "AGE_MODERN"), 2, "capped at 2");
  assert.equal(m.bandSize(cfg, 0, 0, "AGE_EXPLORATION"), 1, "never below 1");
  assert.equal(m.bandSize(cfg, 1, 0, "AGE_UNKNOWN"), 2, "an unknown age takes the smallest cap");
});

test("6.2 mix: two melee to one ranged, skirmish only without ranged", () => {
  const c = { melee: "M", ranged: "R", skirmish: "S" };
  assert.deepEqual(m.bandMix(4, c), ["M", "M", "R", "M"]);
  assert.deepEqual(m.bandMix(3, { ...c, ranged: null }), ["M", "M", "S"]);
  assert.deepEqual(m.bandMix(3, { melee: "M", ranged: null, skirmish: null }), ["M", "M", "M"]);
  assert.deepEqual(m.bandMix(2, { melee: null, ranged: "R", skirmish: null }), ["R", "R"]);
  assert.deepEqual(m.bandMix(2, { melee: null, ranged: null, skirmish: null }), []);
});

test("6.3 tier by age progress", () => {
  assert.equal(m.tierFor(cfg, 0), 1);
  assert.equal(m.tierFor(cfg, 0.39), 1);
  assert.equal(m.tierFor(cfg, 0.4), 2);
  assert.equal(m.tierFor(cfg, 0.75), 3);
  assert.equal(m.tierFor(cfg, NaN), 1);
});

test("6.4 candidates by tag, never hand-named, and the tier pick falls back downward", () => {
  const units = [
    { UnitType: "UNIT_WARRIOR", Domain: "DOMAIN_LAND", CoreClass: "CORE_CLASS_MILITARY", TraitType: null, Tier: 1 },
    { UnitType: "UNIT_SLINGER", Domain: "DOMAIN_LAND", CoreClass: "CORE_CLASS_MILITARY", TraitType: null, Tier: 1 },
    { UnitType: "UNIT_SPEARMAN", Domain: "DOMAIN_LAND", CoreClass: "CORE_CLASS_MILITARY", TraitType: null, Tier: 2 },
    { UnitType: "UNIT_HOPLITE", Domain: "DOMAIN_LAND", CoreClass: "CORE_CLASS_MILITARY", TraitType: "TRAIT_X", Tier: 1 },
    { UnitType: "UNIT_GALLEY", Domain: "DOMAIN_SEA", CoreClass: "CORE_CLASS_MILITARY", TraitType: null, Tier: 1 },
    { UnitType: "UNIT_SCOUT", Domain: "DOMAIN_LAND", CoreClass: "CORE_CLASS_RECON", TraitType: null, Tier: 1 }
  ];
  const tags = [
    { Type: "UNIT_WARRIOR", Tag: "UNIT_CLASS_MELEE" }, { Type: "UNIT_SLINGER", Tag: "UNIT_CLASS_RANGED" },
    { Type: "UNIT_SPEARMAN", Tag: "UNIT_CLASS_MELEE" }, { Type: "UNIT_HOPLITE", Tag: "UNIT_CLASS_MELEE" },
    { Type: "UNIT_GALLEY", Tag: "UNIT_CLASS_MELEE" }, { Type: "UNIT_SCOUT", Tag: "UNIT_CLASS_RECON" }
  ];
  const c = m.unitCandidates(units, tags);
  assert.deepEqual(c.melee, { 1: ["UNIT_WARRIOR"], 2: ["UNIT_SPEARMAN"] });
  assert.deepEqual(c.ranged, { 1: ["UNIT_SLINGER"] });
  assert.deepEqual(c.skirmish, {});
  assert.deepEqual(m.pickTier(c, 3), { melee: "UNIT_SPEARMAN", ranged: "UNIT_SLINGER", skirmish: null, tier: 3 });
  assert.deepEqual(m.pickTier(c, 1), { melee: "UNIT_WARRIOR", ranged: "UNIT_SLINGER", skirmish: null, tier: 1 });
});

test("6.5 placement order: ring 3, 4, 2; unowned, own, other; then plot index; capped at 16", () => {
  const plots = [
    { index: 5, ring: 2, owner: -1 }, { index: 1, ring: 3, owner: 7 }, { index: 2, ring: 3, owner: -1 },
    { index: 9, ring: 4, owner: 3 }, { index: 3, ring: 3, owner: -1 }, { index: 8, ring: 5, owner: -1 }, { index: 0, ring: 3, owner: 3 }
  ];
  const order = m.placementOrder(cfg, plots, 3).map((p) => p.index);
  assert.deepEqual(order, [2, 3, 0, 1, 9, 5]);
  const many = Array.from({ length: 30 }, (_, i) => ({ index: i, ring: 3, owner: -1 }));
  assert.equal(m.placementOrder(cfg, many, 3).length, 16);
});

test("6.6 neighbours join by distance and the flip chance, at most two", () => {
  const near = [{ ip: 1, d: 2, hostile: true, village: true }, { ip: 2, d: 4, hostile: true, village: true },
    { ip: 3, d: 5, hostile: true, village: true }, { ip: 4, d: 1, hostile: false, village: true }, { ip: 5, d: 1, hostile: true, village: false }];
  // p 0.9: chances 0.9*(1-2/7)=0.64, 0.9*(1-4/7)=0.39, 0.9*(1-5/7)=0.26
  assert.deepEqual(m.joinPlan(cfg, 0.9, near, 99, [0.5, 0.3, 0.1, 0, 0]), [{ ip: 1, k: 2 }, { ip: 2, k: 1 }]);
  assert.deepEqual(m.joinPlan(cfg, 0.9, near, 1, [0, 0, 0, 0, 0]), [{ ip: 2, k: 1 }, { ip: 3, k: 1 }], "the band's owner never joins itself");
  assert.deepEqual(m.joinPlan(cfg, 0.9, [{ ip: 1, d: 7, hostile: true, village: true }], 99, [0]), [], "outside joinRange");
  assert.deepEqual(m.joinPlan(cfg, 0, near, 99, [0, 0, 0, 0, 0]), [], "no chance, no joiners");
});

test("6.7 game speed scale and scaled turns", () => {
  assert.equal(m.speedScale(100), 1);
  assert.equal(m.speedScale(300), 3);
  assert.equal(m.speedScale("x"), 1);
  assert.equal(m.scaledTurns(20, 0.5), 10);
  assert.equal(m.scaledTurns(1, 0.1), 1);
});
