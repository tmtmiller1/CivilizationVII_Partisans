// pt-history.js - Partisans: the record of every rising in this game, kept across ages so another mod (Demographics'
// conflict timeline, Emigration's refugee labels) can read the whole story. Each entry opens when a band lands and
// closes when the rising is dispersed, runs out of time, burns the settlement, or the age ends. The record lives in
// Partisans_v1 next to the rest of the state; readers get copies through the console surface's risings().

const MAX_ENTRIES = 300;
/** The optional text fields a chapter keeps, each with the shape it must have. */
const TEXT_FIELDS = [["outcome", /^[a-z]+$/], ["policy", /^TRADITION_[A-Z0-9_]+$/], ["age", /^AGE_[A-Z0-9_]+$/]];

/**
 * @typedef {Object} Chapter
 * @property {number} id unique in this game
 * @property {string} at the settlement's centre, "x,y"
 * @property {string} name the settlement's name when the rising began (it may be gone later)
 * @property {number} owner the civ the people rose against
 * @property {string} cause "flip" | "enclave" | "misery"
 * @property {number} [from] the civ that lost the settlement by culture (flip)
 * @property {number} [homeland] the community's homeland (enclave)
 * @property {string} [policy] the host's treatment card in force when it rose (enclave), a TraditionType
 * @property {number} ip the independent people that fielded the band
 * @property {number} start the turn the band landed (Game.turn, which restarts every age)
 * @property {string} [age] the age it began in, an AgeType such as "AGE_EXPLORATION"
 * @property {number} [end] the turn it ended
 * @property {string} [outcome] "dispersed" | "time" | "burned" | "age"
 */

/** @param {*} v @returns {number|undefined} */
function int(v) { return typeof v === "number" && isFinite(v) ? Math.floor(v) : undefined; }

/** @param {*} e @returns {boolean} the fields every chapter needs are there */
function readable(e) {
  return !!e && typeof e === "object" && typeof e.at === "string" && typeof e.cause === "string"
    && [e.id, e.owner, e.start].every((v) => int(v) !== undefined);
}

/** @param {*} e @returns {Chapter|null} */
export function normChapter(e) {
  if (!readable(e)) return null;
  const out = { id: int(e.id), at: e.at, name: typeof e.name === "string" ? e.name.slice(0, 80) : "", owner: int(e.owner),
    cause: e.cause, ip: int(e.ip) ?? -1, start: int(e.start) };
  for (const k of ["from", "homeland", "end"]) if (int(e[k]) !== undefined) out[k] = int(e[k]);
  for (const [k, re] of TEXT_FIELDS) if (typeof e[k] === "string" && re.test(e[k])) out[k] = e[k];
  return out;
}

/** @param {*} list @returns {Chapter[]} */
export function normHistory(list) {
  return (Array.isArray(list) ? list : []).map(normChapter).filter(Boolean).slice(-MAX_ENTRIES);
}

/**
 * Open a chapter for a rising that just landed; returns its id.
 * @param {{history:Chapter[], nextId?:number}} state
 * @param {Omit<Chapter, "id">} entry
 */
export function openChapter(state, entry) {
  if (!Array.isArray(state.history)) state.history = [];
  const id = Math.max(state.nextId || 1, ...state.history.map((c) => c.id + 1));
  state.nextId = id + 1;
  const c = normChapter({ ...entry, id });
  if (!c) return -1;
  state.history.push(c);
  // The oldest closed chapters go first; an open one is never dropped while the rising runs.
  while (state.history.length > MAX_ENTRIES) {
    const i = state.history.findIndex((h) => h.end !== undefined);
    state.history.splice(i < 0 ? 0 : i, 1);
  }
  return id;
}

/**
 * Close an open chapter. Closing one that's already closed keeps its first ending.
 * @param {{history:Chapter[]}} state @param {number} id @param {number} end @param {string} outcome
 */
export function closeChapter(state, id, end, outcome) {
  const c = (state.history || []).find((h) => h.id === id);
  if (!c || c.end !== undefined) return false;
  c.end = end;
  c.outcome = outcome;
  return true;
}

/** Close every open chapter, for the age change. @param {{history:Chapter[]}} state @param {number} end */
export function closeAll(state, end, outcome = "age") {
  for (const c of state.history || []) if (c.end === undefined) { c.end = end; c.outcome = outcome; }
}

/** Copies for readers outside the mod. @param {{history:Chapter[]}} state @returns {Chapter[]} */
export function readHistory(state) {
  return (state && state.history || []).map((c) => ({ ...c }));
}
