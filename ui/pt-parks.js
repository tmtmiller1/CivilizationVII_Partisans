// pt-parks.js - Partisans: what it reads of National Parks (SPEC 3.4). Park tiles are constructibles on the map, so
// the relief is read from each settlement's plots, never from National Parks' files; with the mod absent nothing is
// found and the relief is 0. Park and Wilderness Area tiles are also never used to place a unit.

import { CONFIG } from "./pt-config.js";
import { parkRelief } from "./pt-model.js";
import { constructibleTypesAt, cityPlots, safe } from "./pt-engine.js";

const PARK_PREFIXES = ["IMPROVEMENT_NATIONAL_PARK", "IMPROVEMENT_WILDERNESS_AREA"];

/** Whether a plot carries a park or Wilderness Area tile. @param {number} x @param {number} y @returns {boolean} */
export function isParkTile(x, y) {
  return constructibleTypesAt(x, y).some((t) => PARK_PREFIXES.some((p) => t.startsWith(p)));
}

/** Whether this age can have parks at all: the park improvement exists in the loaded database. */
export function parksInThisAge() {
  return !!safe(() => GameInfo.Constructibles.lookup("IMPROVEMENT_NATIONAL_PARK"), null);
}

/**
 * The Happiness a settlement's park tiles pay, counted again for the misery check (SPEC 3.4).
 * @param {*} city @returns {number}
 */
export function parkReliefFor(city) {
  if (!parksInThisAge()) return 0;
  const types = [];
  for (const p of cityPlots(city)) for (const t of constructibleTypesAt(p.x, p.y)) types.push(t);
  return parkRelief(CONFIG, types);
}
