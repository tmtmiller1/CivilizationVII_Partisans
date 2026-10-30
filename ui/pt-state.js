// pt-state.js - Partisans: the one saved record, Partisans_v1 (SPEC 9). It lives in the game's configuration store,
// so it survives save and load and the age transition; it's sanitised on load so a corrupt blob can't throw into the
// pass. The age rules (what clears when the age changes) are here too, as a pure function.

import { closeAll, normHistory } from "./pt-history.js";

const STATE_KEY = "Partisans_v1";
const VERSION = 1;
const MAX_CITIES = 4096;
const MAX_PENDING = 256;

/**
 * @typedef {Object} Rising
 * @property {string} cause "flip" | "enclave" | "misery"
 * @property {number} I intensity
 * @property {number} start the turn the band landed
 * @property {number} ip the independent that owns the band
 * @property {{owner:number, id:number}[]} units the band's units as placed
 * @property {{ip:number, units:{owner:number, id:number}[]}[]} joiners neighbours that sent fighters
 * @property {number} [hid] the rising's chapter in the history
 */
/**
 * @typedef {Object} CityRecord
 * @property {number} owner
 * @property {number} M misery turns
 * @property {number} T enclave tension
 * @property {number} cooling the turn cooling ends, or 0
 * @property {Rising[]} risings active risings (at most one in practice)
 */
/**
 * @typedef {Object} Pending
 * @property {string} at "x,y"
 * @property {number} owner
 * @property {string} cause
 * @property {number} I
 * @property {number} dueTurn
 * @property {"brewing"|"muster"} stage
 * @property {number} [from] the civ that lost the settlement (flip)
 * @property {number} [pFlip] the chance that was rolled (flip; neighbours join at the same chance)
 */
/**
 * @typedef {Object} State
 * @property {number} v
 * @property {number} age
 * @property {Record<string, CityRecord>} cities
 * @property {Record<string, {ip:number, age:number, mustered:boolean}>} rebels keyed by civ player id
 * @property {Pending[]} pending
 * @property {number[]} [musterSnapshot] the alive independents before a muster's turn roll
 * @property {{turn:number, at?:string, cause?:string, outcome:string, reason?:string}[]} log
 * @property {import("./pt-history.js").Chapter[]} history every rising this game, across ages
 * @property {number} nextId the next chapter id
 * @property {string} [lastPass] "age:turn" of the last turn pass, so a turn is counted once
 */

/** @param {*} v @param {number} fallback @returns {number} */
function num(v, fallback) { return typeof v === "number" && isFinite(v) ? v : fallback; }

/** @param {number} age @returns {State} */
export function emptyState(age) {
  return { v: VERSION, age: num(age, 0), cities: {}, rebels: {}, pending: [], log: [], history: [], nextId: 1 };
}

/** @param {*} u @returns {{owner:number, id:number}|null} */
function normUnit(u) {
  if (!u || typeof u !== "object") return null;
  const owner = Math.floor(num(u.owner, NaN));
  const id = Math.floor(num(u.id, NaN));
  return isFinite(owner) && isFinite(id) ? { owner, id } : null;
}

/** @param {*} r @returns {Rising|null} */
function normRising(r) {
  if (!r || typeof r !== "object" || typeof r.cause !== "string") return null;
  const ip = Math.floor(num(r.ip, NaN));
  if (!isFinite(ip)) return null;
  const units = Array.isArray(r.units) ? r.units.map(normUnit).filter(Boolean) : [];
  const joiners = Array.isArray(r.joiners) ? r.joiners.map((j) => j && typeof j === "object" ? {
    ip: Math.floor(num(j.ip, -1)), units: (Array.isArray(j.units) ? j.units : []).map(normUnit).filter(Boolean)
  } : null).filter((j) => j && j.ip >= 0) : [];
  const out = { cause: r.cause, I: num(r.I, 0.5), start: Math.floor(num(r.start, 0)), ip, units, joiners };
  if (typeof r.hid === "number" && isFinite(r.hid)) out.hid = Math.floor(r.hid);
  return out;
}

/** @param {*} c @returns {CityRecord|null} */
function normCity(c) {
  if (!c || typeof c !== "object") return null;
  const risings = Array.isArray(c.risings) ? c.risings.map(normRising).filter(Boolean) : [];
  return { owner: Math.floor(num(c.owner, -1)), M: Math.max(0, Math.floor(num(c.M, 0))),
    T: Math.max(0, num(c.T, 0)), cooling: Math.max(0, Math.floor(num(c.cooling, 0))), risings };
}

/** @param {*} p @returns {Pending|null} */
function normPending(p) {
  if (!p || typeof p !== "object" || typeof p.at !== "string" || !/^-?\d+,-?\d+$/.test(p.at)) return null;
  if (typeof p.cause !== "string" || (p.stage !== "brewing" && p.stage !== "muster")) return null;
  const out = { at: p.at, owner: Math.floor(num(p.owner, -1)), cause: p.cause, I: num(p.I, 0.5),
    dueTurn: Math.floor(num(p.dueTurn, 0)), stage: p.stage };
  return pendingExtras(out, p);
}

/** @param {*} src @returns {Record<string, CityRecord>} */
function normCities(src) {
  const out = {};
  let n = 0;
  for (const [key, value] of Object.entries(src || {})) {
    if (n++ >= MAX_CITIES || !/^-?\d+,-?\d+$/.test(key)) continue;
    const c = normCity(value);
    if (c) out[key] = c;
  }
  return out;
}

/** @param {*} src @param {number} age @returns {State["rebels"]} */
function normRebels(src, age) {
  const out = {};
  for (const [key, value] of Object.entries(src || {})) {
    if (!/^\d+$/.test(key) || !value || typeof value !== "object") continue;
    out[key] = { ip: Math.floor(num(value.ip, -1)), age: num(value.age, age), mustered: !!value.mustered };
  }
  return out;
}

/** The optional fields a pending rising carries: who lost it, the rolled chance, the homeland, the misery numbers. */
function pendingExtras(out, p) {
  if (typeof p.from === "number") out.from = Math.floor(p.from);
  if (typeof p.pFlip === "number") out.pFlip = p.pFlip;
  if (typeof p.homeland === "number") out.homeland = Math.floor(p.homeland);
  if (typeof p.policy === "string" && /^TRADITION_[A-Z0-9_]+$/.test(p.policy)) out.policy = p.policy;
  if (p.detail && typeof p.detail === "object") {
    out.detail = { happiness: num(p.detail.happiness, 0), turns: Math.max(0, Math.floor(num(p.detail.turns, 0))) };
  }
  return out;
}

/** Coerce a parsed blob into a clean state. @param {*} s @param {number} age @returns {State} */
export function normalizeState(s, age) {
  const out = emptyState(age);
  if (!s || typeof s !== "object") return out;
  out.age = num(s.age, out.age);
  out.cities = normCities(s.cities);
  out.rebels = normRebels(s.rebels, out.age);
  out.pending = (Array.isArray(s.pending) ? s.pending : []).map(normPending).filter(Boolean).slice(0, MAX_PENDING);
  if (Array.isArray(s.musterSnapshot)) out.musterSnapshot = s.musterSnapshot.filter((v) => typeof v === "number");
  out.log = (Array.isArray(s.log) ? s.log : []).filter((e) => e && typeof e === "object").slice(-50);
  out.history = normHistory(s.history);
  out.nextId = Math.max(Math.floor(num(s.nextId, 1)), ...out.history.map((c) => c.id + 1), 1);
  if (typeof s.lastPass === "string" && /^-?\d+:-?\d+$/.test(s.lastPass)) out.lastPass = s.lastPass;
  return out;
}

/**
 * What the age change does (SPEC 9): the independents are gone, so rebels, pending and every active rising go; M
 * and T are halved; cooling clears. Mutates and returns the state.
 * The history stays: open chapters close with the outcome "age".
 * @param {State} state @param {number} age @param {number} [turn] the turn the age ended @returns {State}
 */
export function rolloverAge(state, age, turn) {
  closeAll(state, Math.floor(num(turn, 0)));
  state.age = age;
  state.rebels = {};
  state.pending = [];
  delete state.musterSnapshot;
  for (const c of Object.values(state.cities)) {
    c.M = Math.floor(c.M / 2);
    c.T = Math.floor(c.T / 2);
    c.cooling = 0;
    c.risings = [];
  }
  return state;
}

/**
 * The record for a settlement, created at zero when new.
 * @param {State} state @param {string} key @param {number} owner
 */
export function cityRecord(state, key, owner) {
  let c = state.cities[key];
  if (!c) c = state.cities[key] = { owner, M: 0, T: 0, cooling: 0, risings: [] };
  c.owner = owner;
  return c;
}

/** Append a log entry, keeping the last `cap`. @param {State} state @param {*} entry @param {number} cap */
export function logEvent(state, entry, cap = 50) {
  state.log.push(entry);
  if (state.log.length > cap) state.log.splice(0, state.log.length - cap);
}

/**
 * How many risings are active against an owner, and in all.
 * @param {State} state @returns {{byOwner:Record<number,number>, total:number}}
 */
export function activeCounts(state) {
  const byOwner = {};
  let total = 0;
  for (const c of Object.values(state.cities)) {
    if (!c.risings.length) continue;
    byOwner[c.owner] = (byOwner[c.owner] || 0) + c.risings.length;
    total += c.risings.length;
  }
  return { byOwner, total };
}

// engine boundary

/** @returns {string|null} */
function readRaw() {
  try {
    const g = Configuration?.getGame?.();
    const v = g && typeof g.getValue === "function" ? g.getValue(STATE_KEY) : null;
    return typeof v === "string" && v.length ? v : null;
  } catch (_e) {
    return null;
  }
}

/** The saved state, or a fresh one. @param {number} age @returns {State} */
export function loadState(age) {
  try {
    const raw = readRaw();
    if (raw) return normalizeState(JSON.parse(raw), age);
  } catch (_e) { /* a bad blob reads as empty */ }
  return emptyState(age);
}

/** Save the state. @param {State} state @returns {number} the blob's length, 0 when nothing was written */
export function saveState(state) {
  try {
    const blob = JSON.stringify(normalizeState(state, state.age));
    const e = Configuration?.editGame?.();
    if (e && typeof e.setValue === "function") { e.setValue(STATE_KEY, blob); return blob.length; }
  } catch (_e) { /* no store */ }
  return 0;
}

export const STATE = { KEY: STATE_KEY, VERSION };
