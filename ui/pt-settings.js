// pt-settings.js - Partisans: the player's options, kept across games.
//
// One slice of the shared "modSettings" localStorage key, as National Parks keeps its own. The game's localStorage
// is unreliable and every other mod's options live in the same key, so a write never risks them: a read that doesn't
// look like a settings root is never written back, an empty read is read again before it's believed, and a read that
// throws or doesn't parse refuses the write (the value is then kept in memory for this session). Only this mod's
// slice is written, and only the options changed this session are laid over what is stored. Loads in the main menu
// and in a game, with no game globals. A read costs a few milliseconds, so the result is cached.
"use strict";

const ROOT_KEY = "modSettings";
const SLICE = "tower-partisans";
export const DEFAULTS = Object.freeze({
  flipRisings: true, enclaveRisings: true, miseryRisings: true, flipsFromAnyMod: true, parksCalm: true, debug: false
});

let memory = null;
let changed = {};

function safe(fn, fallback) { try { return fn(); } catch (_e) { return fallback; } }

const THREW = {};
function readRaw() {
  try {
    let raw = localStorage.getItem(ROOT_KEY);
    if (!raw) raw = localStorage.getItem(ROOT_KEY);   // a first read can come back empty
    return raw || null;
  } catch (_e) {
    return THREW;
  }
}

function readRoot() {
  const raw = readRaw();
  if (raw === THREW) return { root: null, ok: false };
  if (!raw) return { root: {}, ok: true };
  const root = safe(() => JSON.parse(raw), null);
  if (!root || typeof root !== "object" || Array.isArray(root)) return { root: null, ok: false };
  const shaped = Object.keys(root).every((k) => !!root[k] && typeof root[k] === "object" && !Array.isArray(root[k]));
  return shaped ? { root, ok: true } : { root: null, ok: false };
}

/** The cached settings object. @returns {Record<string, boolean>} */
export function settings() {
  if (memory) return memory;
  const { root } = readRoot();
  const slice = root && root[SLICE];
  memory = { ...DEFAULTS, ...(slice && typeof slice === "object" ? slice : {}), ...changed };
  return memory;
}

function persist() {
  const { root, ok } = readRoot();
  if (!ok) return false;
  // Over the slice as stored now, not as first read: a first read that missed it must not put the defaults back.
  root[SLICE] = { ...DEFAULTS, ...root[SLICE], ...changed };
  return safe(() => { localStorage.setItem(ROOT_KEY, JSON.stringify(root)); return true; }, false);
}

/**
 * Set one option. @param {string} key @param {boolean} value @returns {boolean} whether it was written to the store
 */
export function setOption(key, value) {
  if (!(key in DEFAULTS)) return false;
  settings()[key] = !!value;
  changed[key] = !!value;
  return persist();
}

/** @param {string} key @returns {boolean} */
export function getOption(key) {
  const v = settings()[key];
  return typeof v === "boolean" ? v : !!DEFAULTS[key];
}

/** Test hook: forget the cached settings. */
export function resetSettings() { memory = null; changed = {}; }
