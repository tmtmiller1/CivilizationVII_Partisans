// pt-emigration.js - Partisans: what it reads of Emigration. Two keys in the game's configuration store:
// EmigrationQuarters_v1 (the enclave records, keyed by the host settlement's centre "x,y") and EmigrationEthnos_v1
// (each settlement's population by origin civ, keyed the same way), and which of Emigration's treatment cards a host
// has slotted. All read only; Partisans never imports Emigration's files or writes its keys. With Emigration absent
// everything reads as empty.

import { safe } from "./pt-engine.js";

const QUARTERS_KEY = "EmigrationQuarters_v1";
const ETHNOS_KEY = "EmigrationEthnos_v1";

/** @param {string} key @returns {*} the stored payload: the `data` of a {v, data} envelope, or the raw object */
function readKey(key) {
  const raw = safe(() => Configuration.getGame().getValue(key), null);
  if (typeof raw !== "string" || !raw.length) return null;
  const parsed = safe(() => JSON.parse(raw), null);
  if (!parsed || typeof parsed !== "object") return null;
  return parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;
}

/** Whether Emigration has written anything this game. @returns {boolean} */
export function emigrationPresent() {
  return readKey(QUARTERS_KEY) !== null || readKey(ETHNOS_KEY) !== null;
}

/**
 * The recognised enclave records whose host is `owner`.
 * @param {number} owner
 * @returns {{at:string, civ:number, originCiv:string|null}[]}
 */
export function enclavesOf(owner) {
  const q = readKey(QUARTERS_KEY);
  const tiles = objectOf(q && q.tiles);
  const out = [];
  for (const [at, rec] of Object.entries(tiles)) {
    // An established enclave that isn't recognised yet has no stance and builds no tension.
    const r = objectOf(rec);
    if (r.owner !== owner || r.recognized === false) continue;
    out.push({ at, civ: typeof r.civ === "number" ? r.civ : -1,
      originCiv: typeof r.originCiv === "string" ? r.originCiv : null });
  }
  return out;
}

/** @param {*} v @returns {Record<string, *>} the value when it's an object, else an empty one */
function objectOf(v) { return v && typeof v === "object" ? v : {}; }

/**
 * A settlement's population by origin, as Emigration last recorded it.
 * @param {string} at "x,y" @returns {{byCiv:Record<string, number>, total:number}|null}
 */
export function compositionAt(at) {
  const c = objectOf(objectOf(readKey(ETHNOS_KEY)).cities)[at];
  const byCiv = c ? objectOf(c.byCiv) : null;
  if (!byCiv || !Object.keys(byCiv).length) return null;
  let total = typeof c.total === "number" && c.total > 0 ? c.total : 0;
  if (!total) for (const v of Object.values(byCiv)) total += Number(v) || 0;
  return { byCiv, total };
}

/**
 * Emigration's cards that set how a host treats the communities in its cities, by name: since Emigration 3.6.0 the
 * Pro-Immigration Stance protects and the Anti-Immigration Stance watches; the separate treatment cards of 3.5.0
 * still count in a save that holds one. They exist in the game's data only when Emigration is on and in that card's
 * age; a card the database doesn't know reads as not slotted.
 */
const TREATMENT = Object.freeze({
  protect: [
    "TRADITION_EMIG_OPEN_BORDERS_ANTIQUITY", "TRADITION_EMIG_OPEN_BORDERS_EXPLORATION", "TRADITION_EMIG_OPEN_BORDERS_MODERN",
    "TRADITION_EMIG_PROTECT_ANTIQUITY", "TRADITION_EMIG_PROTECT_EXPLORATION", "TRADITION_EMIG_PROTECT_MODERN"
  ],
  suspect: [
    "TRADITION_EMIG_CLOSED_BORDERS_ANTIQUITY", "TRADITION_EMIG_CLOSED_BORDERS_EXPLORATION", "TRADITION_EMIG_CLOSED_BORDERS_MODERN",
    "TRADITION_EMIG_SUSPECT_ANTIQUITY", "TRADITION_EMIG_SUSPECT_EXPLORATION", "TRADITION_EMIG_SUSPECT_MODERN"
  ]
});

/** @param {*} culture @param {string[]} types @returns {string|null} the first of the types slotted */
function slotted(culture, types) {
  for (const type of types) {
    if (!safe(() => GameInfo.Traditions.lookup(type), null)) continue;
    if (safe(() => culture.isTraditionActive(Database.makeHash(type)), false)) return type;
  }
  return null;
}

/**
 * The treatment card a civ has slotted: "protect", "suspect", or null for neither or both (they cancel).
 * @param {number} pid @returns {{stance:"protect"|"suspect"|null, type:string|null}}
 */
export function treatmentOf(pid) {
  const culture = safe(() => Players.get(pid).Culture, null);
  if (!culture) return { stance: null, type: null };
  const p = slotted(culture, TREATMENT.protect);
  const s = slotted(culture, TREATMENT.suspect);
  if (p && !s) return { stance: "protect", type: p };
  if (s && !p) return { stance: "suspect", type: s };
  return { stance: null, type: null };
}

/**
 * The largest foreign share in a settlement, as a fallback homeland when a record names none.
 * @param {string} at @param {number} owner @returns {{pid:number, share:number}|null}
 */
export function largestForeign(at, owner) {
  const c = compositionAt(at);
  if (!c || !c.total) return null;
  let best = null;
  for (const [k, v] of Object.entries(c.byCiv)) {
    const pid = Number(k);
    if (!Number.isInteger(pid) || pid === owner) continue;
    const share = (Number(v) || 0) / c.total;
    if (!best || share > best.share) best = { pid, share };
  }
  return best;
}

export const KEYS = { QUARTERS_KEY, ETHNOS_KEY };
