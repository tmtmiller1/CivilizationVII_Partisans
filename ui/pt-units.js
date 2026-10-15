// pt-units.js - Partisans: which unit types a band is made of (SPEC 6.3, 6.4). Read from the loaded database by tag
// and tier, never hand-named, once per boot; the tier follows the age's progress for every civ, since the engine
// gives no working "can build" read for an AI.

import { CONFIG } from "./pt-config.js";
import { unitCandidates, pickTier, tierFor } from "./pt-model.js";
import { ageProgress, safe } from "./pt-engine.js";

/** @type {ReturnType<typeof unitCandidates>|null} */
let cached = null;

/** @param {*} table a GameInfo table @returns {*[]} its rows */
function rows(table) {
  if (!table) return [];
  const arr = safe(() => Array.from(table), null);
  if (arr && arr.length) return arr;
  const out = [];
  const n = safe(() => table.length, 0) || 0;
  for (let i = 0; i < n; i++) { const r = safe(() => table[i], null); if (r) out.push(r); }
  return out;
}

/** The candidates by role and tier, read once. @returns {ReturnType<typeof unitCandidates>} */
export function candidates() {
  if (!cached) {
    cached = unitCandidates(rows(safe(() => GameInfo.Units, null)), rows(safe(() => GameInfo.TypeTags, null)));
  }
  return cached;
}

/** The unit types for a band now: one per role at the age's tier. */
export function unitsForNow() {
  return pickTier(candidates(), tierFor(CONFIG, ageProgress()));
}

/** Test hook. */
export function resetUnitCache() { cached = null; }
