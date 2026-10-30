// pt-rising.js - Partisans: one rising, from the gates to the band on the map (SPEC 4, 5, 6). The caller has decided
// a settlement should rise and why; this picks who fights, builds the band, places it, lets neighbours join a flip
// rising, records it and tells the player. Every step that can't go on is logged with its reason.

import { openChapter } from "./pt-history.js";
import { CONFIG } from "./pt-config.js";
import { bandMix, bandSize, chooseOwner, joinPlan, miseryNeed, risingGate, scaledTurns } from "./pt-model.js";
import { activeCounts, cityRecord, logEvent } from "./pt-state.js";
import { ageType, aliveIndependentIds, cityAtKey, cityName, civAdjective, declareWarOn, distance, gameTurn,
  hostilityName,
  independentName, isAliveMajor, isHostile, isMultiplayer, isVillage, localId, parseKey, player, sleep, safe,
  turnAgainst } from "./pt-engine.js";
import { unitsForNow } from "./pt-units.js";
import { placeBand } from "./pt-placement.js";
import { markerAvailable, placeMarker } from "./pt-muster.js";
import { humanOf, notify, text } from "./pt-notify.js";
import { getOption } from "./pt-settings.js";
import { log } from "./pt-log.js";
import { whyLine } from "./pt-describe.js";

/**
 * @typedef {Object} Request
 * @property {string} key "x,y"
 * @property {number} owner
 * @property {"flip"|"enclave"|"misery"} cause
 * @property {number} I
 * @property {number} [from] the civ that lost the settlement (flip)
 * @property {number} [pFlip]
 * @property {boolean} [settle] a roll's hit: the cause's counter resets once the rising is past its gates
 */

/** @param {string} cause @returns {boolean} the player's switch for the cause */
function causeOn(cause) {
  if (cause === "flip") return getOption("flipRisings");
  return cause === "enclave" ? getOption("enclaveRisings") : getOption("miseryRisings");
}

/** Who hears of the rising: the human whose settlement it is or was, or -1. */
function noticeTo(req) { return humanOf(req.owner, req.from); }

/**
 * Why the gates refuse the rising, or null; a rising they let through spends its counter (settleCounters).
 * @param {import("./pt-state.js").State} state @param {Request} req @param {*} city
 */
function gateReason(state, req, city) {
  const reason = gateRefusal(state, req, city);
  if (!reason) settleCounters(state, req);
  return reason;
}

/** The gates themselves (SPEC 4). */
function gateRefusal(state, req, city) {
  const rec = state.cities[req.key];
  const counts = activeCounts(state);
  return risingGate(CONFIG, {
    multiplayer: isMultiplayer(), ownerAliveMajor: isAliveMajor(req.owner),
    capital: !!safe(() => city.isCapital, false),
    activeHere: !!(rec && rec.risings.length), coolingHere: !!(rec && rec.cooling > gameTurn()),
    activeForOwner: counts.byOwner[req.owner] || 0, activeTotal: counts.total, causeOn: causeOn(req.cause)
  });
}

/**
 * The camps near a settlement with what the owner choice needs, nearest first.
 * @param {*} ctx @param {{x:number, y:number}} c @param {number} owner
 */
function neighboursOf(ctx, c, owner) {
  return ctx.camps().map((camp) => ({ ip: camp.ip, d: distance(camp.x, camp.y, c.x, c.y),
    camp: { x: camp.x, y: camp.y }, hostile: isHostile(camp.ip, owner), village: isVillage(camp.ip) }))
    .sort((a, b) => a.d - b.d);
}

/**
 * A rising past its gates spends the pressure that rolled it: misery falls to half the need, enclave tension to 0.
 * Done here rather than at the roll, so a rising the gates refuse keeps its counter for the next turn.
 */
function settleCounters(state, req) {
  if (!req.settle) return;
  const rec = cityRecord(state, req.key, req.owner);
  if (req.cause === "misery") rec.M = Math.floor(miseryNeed(CONFIG, state.speed || 1) / 2);
  else if (req.cause === "enclave") rec.T = 0;
}

/** Put the settlement into cooling and log why the rising fizzled. */
function fizzle(state, req, reason) {
  const rec = cityRecord(state, req.key, req.owner);
  rec.cooling = gameTurn() + scaledTurns(CONFIG.coolingTurns, state.speed || 1);
  logEvent(state, { turn: gameTurn(), at: req.key, cause: req.cause, outcome: "fizzled", reason }, CONFIG.logEntries);
  log(`rising at ${req.key} (${req.cause}) fizzled: ${reason}`);
  return `fizzled: ${reason}`;
}

/** Start a muster: place the marker, remember the independents, and ask the pass to come back next turn. */
function muster(state, req, city) {
  if (!markerAvailable() || !placeMarker(city)) return fizzle(state, req, "muster marker unavailable");
  state.rebels[req.owner] = { ip: -1, age: state.age, mustered: true };
  state.musterSnapshot = aliveIndependentIds();
  state.pending.push({ at: req.key, owner: req.owner, cause: req.cause, I: req.I, dueTurn: gameTurn() + 1,
    stage: "muster", ...(req.from != null ? { from: req.from } : {}), ...(req.pFlip != null ? { pFlip: req.pFlip } : {}),
    ...(req.detail ? { detail: req.detail } : {}), ...(req.homeland != null ? { homeland: req.homeland } : {}),
    ...(typeof req.policy === "string" ? { policy: req.policy } : {}) });
  logEvent(state, { turn: gameTurn(), at: req.key, cause: req.cause, outcome: "mustering" }, CONFIG.logEntries);
  log(`rising at ${req.key}: muster marker placed for player ${req.owner}; the rebel people arrives at the turn roll`);
  return "mustering";
}

/** What the state knows of the owner's rebel people this age, or null. */
function rebelInfo(state, owner) {
  const rebel = state.rebels[owner];
  if (!rebel || rebel.age !== state.age || rebel.ip < 0 || !player(rebel.ip)) return null;
  return { ip: rebel.ip, alive: !!player(rebel.ip).isAlive, hostile: isHostile(rebel.ip, owner) };
}

/**
 * A friendly rebel people turned against its civ (SPEC 5.2): its standing with the civ drops to hostile, for any
 * civ; the local player's own war request is the fallback. True when it reads hostile afterwards.
 */
async function declareOnRebels(req, city, ip) {
  if (!turnAgainst(ip, req.owner) && req.owner === localId()) declareWarOn(ip);
  await sleep(1500);
  const hostile = isHostile(ip, req.owner);
  log(`turned rebel people ${ip} against player ${req.owner}; it now reads ${hostilityName(ip, req.owner)}`);
  if (hostile && noticeTo(req) >= 0) notify("rising", text("LOC_PT_DECLARED", cityName(city)), undefined, undefined, noticeTo(req));
  return hostile;
}

/**
 * Who fights (SPEC 5), taking the declare-war and muster actions on the way.
 * @returns {Promise<{ip:number, step:string}|string>} the owner, or the outcome text when there is none
 */
async function pickOwner(ctx, state, req, city) {
  const rebel = state.rebels[req.owner];
  const info = rebelInfo(state, req.owner);
  const r = { rebel: info, neighbours: neighboursOf(ctx, parseKey(req.key), req.owner),
    mustered: !!(rebel && rebel.mustered && rebel.age === state.age) };
  let choice = chooseOwner(CONFIG, r);
  if (choice.step === "declare") {
    choice = await declareOnRebels(req, city, choice.ip) ? { step: "rebel", ip: choice.ip }
      : chooseOwner(CONFIG, { ...r, rebel: null });
  }
  if (choice.step === "muster") return muster(state, req, city);
  if (choice.step === "none") return fizzle(state, req, "no hostile people");
  return { ip: choice.ip, step: choice.step };
}

/** Neighbours join a flip rising (SPEC 6.6). */
async function joinNeighbours(ctx, state, req, rising, city) {
  const center = parseKey(req.key);
  const near = neighboursOf(ctx, center, req.owner).filter((n) => n.d <= CONFIG.joinRange);
  const plan = joinPlan(CONFIG, req.pFlip || 0, near, rising.ip, near.map(() => ctx.rand()));
  log(`neighbours of ${req.key}: ${near.map((n) => `${n.ip}@${n.d}${n.hostile ? " hostile" : ""}${n.village ? "" : " city-state"}`).join(", ") || "none"}; `
    + `joining: ${plan.map((j) => `${j.ip}x${j.k}`).join(", ") || "none"}`);
  const picks = unitsForNow();
  for (const j of plan) {
    const camp = near.find((n) => n.ip === j.ip).camp;
    const placed = await placeBand(center, req.owner, j.ip, bandMix(j.k, picks), { rings: [2, 3], towards: camp });
    if (!placed.units.length) { log(`neighbour ${j.ip} sent nobody: no plot took a unit`); continue; }
    rising.joiners.push({ ip: j.ip, units: placed.units });
    log(`neighbour ${j.ip} (${independentName(j.ip)}) sent ${placed.units.length} fighter(s) to ${req.key}`);
    if (noticeTo(req) >= 0) notify("join", text("LOC_PT_JOIN", independentName(j.ip), cityName(city)), undefined, center, noticeTo(req));
  }
}

/**
 * Record a landed band and log it.
 * @param {import("./pt-state.js").State} state @param {Request} req
 * @param {{ip:number, step:string}} owner @param {{units:*[], refused:number, wanted:number}} placed
 * @param {string} name the settlement's name, kept in the rising's chapter
 */
function recordRising(state, req, owner, placed, name) {
  const rising = { cause: req.cause, I: req.I, start: gameTurn(), ip: owner.ip, units: placed.units, joiners: [] };
  rising.hid = openChapter(state, { at: req.key, name, owner: req.owner, cause: req.cause, from: req.from,
    homeland: req.homeland, policy: req.policy, ip: owner.ip, start: rising.start, age: ageType() });
  cityRecord(state, req.key, req.owner).risings.push(rising);
  logEvent(state, { turn: gameTurn(), at: req.key, cause: req.cause, outcome: "rising", ip: owner.ip,
    units: placed.units.length }, CONFIG.logEntries);
  log(`rising at ${req.key} (${req.cause}, I ${req.I.toFixed(2)}): ${placed.units.length} of ${placed.wanted} units `
    + `for ${owner.ip} (${owner.step}), ${placed.refused} refusal(s)`);
  return rising;
}

/**
 * Tell the local player, when the settlement is or was theirs: "Partisans rise near Mutsu", why, and a click that
 * takes the camera there.
 */
function noticeRising(req, city) {
  const to = noticeTo(req);
  if (to < 0) return;
  // A settlement taken by culture rises for the civ that lost it: "Partisan Greek loyalists near Mutsu". Misery and
  // enclave risings are an uprising; an enclave's is about how it's treated, not loyalty to its homeland.
  const title = req.cause === "flip" && player(req.from)
    ? text("LOC_PT_NOTIFY_LOYALISTS_TITLE_CITY", cityName(city), civAdjective(req.from))
    : text("LOC_PT_NOTIFY_RISING_TITLE_CITY", cityName(city));
  notify("rising", whyLine(req, city), title, parseKey(req.key), to);
}

/** The placement tally the harness reads for the refusal rate (SPEC 12, V4). */
function countPlacement(ctx, placed) {
  ctx.placements.attempts += placed.attempts;
  ctx.placements.refused += placed.refused;
}

/**
 * Run one rising to its end. The caller saves the state afterwards.
 * @param {{camps:()=>*[], rand:()=>number, placements:{attempts:number, refused:number}}} ctx
 * @param {import("./pt-state.js").State} state @param {Request} req
 * @returns {Promise<string>} the outcome, for the log and the harness
 */
export async function runRising(ctx, state, req) {
  const city = cityAtKey(req.key);
  if (!city || city.owner !== req.owner) {
    log(`rising at ${req.key} dropped: the settlement is gone or changed hands`);
    return "dropped";
  }
  const reason = gateReason(state, req, city);
  if (reason) { log(`rising at ${req.key} (${req.cause}) refused: ${reason}`); return `refused: ${reason}`; }
  const owner = await pickOwner(ctx, state, req, city);
  if (typeof owner === "string") return owner;
  const types = bandMix(bandSize(CONFIG, req.I, safe(() => Number(city.population), 0), ageType()), unitsForNow());
  if (!types.length) return fizzle(state, req, "no unit candidates in this age");
  const placed = await placeBand(parseKey(req.key), req.owner, owner.ip, types);
  countPlacement(ctx, placed);
  if (!placed.units.length) return fizzle(state, req, "no plot took a unit");
  const rising = recordRising(state, req, owner, { ...placed, wanted: types.length }, cityName(city));
  noticeRising(req, city);
  return req.cause === "flip" ? joinNeighbours(ctx, state, req, rising, city).then(() => "rising") : "rising";
}
