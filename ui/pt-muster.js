// pt-muster.js - Partisans: the muster marker (SPEC 7). A hidden building placed in one of a civ's settlements makes
// the game spawn that civ's rebel people at the next turn roll (the crisis's own rebel effect, on a leader trait
// gated on the marker). The marker is removed the same turn the people appears, or every new age would open with a
// fresh one; a sweep at load and at each age start clears any stray.

import { aliveIndependentIds, cityPlots, constructiblesOfType, createConstructible, destroyConstructible,
  distance, majorSettlements, safe } from "./pt-engine.js";
import { log } from "./pt-log.js";

export const MARKER = "BUILDING_PARTISANS_MUSTER";

/** @returns {boolean} whether the marker exists in the loaded database */
export function markerAvailable() { return !!safe(() => GameInfo.Constructibles.lookup(MARKER), null); }

/** Place the marker in a settlement for its owner. @param {*} city @returns {boolean} */
export function placeMarker(city) {
  const l = city && city.location;
  return !!l && createConstructible(MARKER, { x: l.x, y: l.y }, city.owner);
}

/** Remove every marker in a settlement. @param {*} city @returns {number} markers sent for removal */
export function removeMarkers(city) {
  let n = 0;
  for (const cid of constructiblesOfType(city, MARKER)) if (destroyConstructible(cid)) n++;
  return n;
}

/** Remove every marker on the map. @returns {number} */
export function sweepMarkers() {
  let n = 0;
  for (const s of majorSettlements()) n += removeMarkers(s.city);
  if (n) log(`sweep: ${n} stray muster marker(s) removed`);
  return n;
}

/**
 * The independents that appeared since the snapshot and live in an encampment: the rebel peoples the markers spawned.
 * @param {number[]} snapshot the alive independents before the turn roll
 * @param {{ip:number, x:number, y:number, type:string}[]} camps the map's camps now
 * @returns {{ip:number, camp:{x:number, y:number}}[]}
 */
export function newRebelPeoples(snapshot, camps) {
  const before = new Set(snapshot);
  const out = [];
  for (const ip of aliveIndependentIds()) {
    if (before.has(ip)) continue;
    const camp = camps.find((c) => c.ip === ip && c.type === "IMPROVEMENT_ENCAMPMENT");
    if (camp) out.push({ ip, camp: { x: camp.x, y: camp.y } });
  }
  return out;
}

/**
 * Which civ each new rebel people belongs to: the one whose settlements are nearest its camp (SPEC 7.2).
 * @param {{ip:number, camp:{x:number, y:number}}[]} peoples
 * @param {number[]} owners the civs that mustered
 * @returns {Record<number, number>} owner -> ip
 */
export function matchRebels(peoples, owners) {
  const nearest = (camp, owner) => {
    let best = 9999;
    for (const s of majorSettlements()) {
      if (s.owner !== owner) continue;
      for (const p of cityPlots(s.city)) best = Math.min(best, distance(camp.x, camp.y, p.x, p.y));
    }
    return best;
  };
  const out = {};
  const taken = new Set();
  for (const owner of owners) {
    let pick = null;
    for (const p of peoples) {
      if (taken.has(p.ip)) continue;
      const d = nearest(p.camp, owner);
      if (!pick || d < pick.d) pick = { ip: p.ip, d };
    }
    if (pick) { out[owner] = pick.ip; taken.add(pick.ip); }
  }
  return out;
}
