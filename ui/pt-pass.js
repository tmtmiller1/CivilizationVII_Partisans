// pt-pass.js - Partisans: the once-a-turn pass (SPEC 3, 7.2, 9), run at the start of the local player's turn
// for every major settlement on the map. In order: the age rollover; the rebel peoples the markers spawned;
// risings that have run their course; every settlement's misery and enclave counters, with their rolls; the
// brewing risings that are due; then the save. The bookkeeping is synchronous and timed; the risings it starts wait
// on the engine.

import { CONFIG } from "./pt-config.js";
import { enclaveChance, enclaveIntensity, enclaveStep, flipChance, miseryChance, miseryIntensity, miseryNeed,
  miseryStep, scaledTurns, speedScale } from "./pt-model.js";
import { activeCounts, cityRecord, logEvent, rolloverAge, saveState } from "./pt-state.js";
import { closeChapter } from "./pt-history.js";
import { ageHash, cityAtKey, cityName, gameTurn, isAliveMajor, localId, majorSettlements, pairRelationship, player,
  relationship, speedMultiplier, unitsAlive, safe } from "./pt-engine.js";
import { emigrationPresent, enclavesOf, largestForeign, treatmentOf } from "./pt-emigration.js";
import { parkReliefFor } from "./pt-parks.js";
import { matchRebels, newRebelPeoples, removeMarkers, sweepMarkers } from "./pt-muster.js";
import { runRising } from "./pt-rising.js";
import { notify, text } from "./pt-notify.js";
import { getOption } from "./pt-settings.js";
import { log, dlog } from "./pt-log.js";

/** @param {import("./pt-state.js").State} state */
function rolloverIfNewAge(state) {
  const age = ageHash();
  if (state.age === age) return false;
  rolloverAge(state, age, gameTurn());
  sweepMarkers();
  log(`new age: rebels, pending and risings cleared; misery and tension halved`);
  return true;
}

/** The rebel peoples that appeared at the turn roll, matched to the civs that mustered (SPEC 7.2). */
function collectMusters(ctx, state, due) {
  const owners = [...new Set(due.map((p) => p.owner))];
  const matched = matchRebels(newRebelPeoples(state.musterSnapshot || [], ctx.camps()), owners);
  delete state.musterSnapshot;
  const requests = [];
  for (const p of due) {
    const city = cityAtKey(p.at);
    if (city) removeMarkers(city);
    const ip = matched[p.owner];
    if (ip === undefined) {
      logEvent(state, { turn: gameTurn(), at: p.at, cause: p.cause, outcome: "fizzled", reason: "muster spawned nothing" },
        CONFIG.logEntries);
      log(`muster for player ${p.owner} spawned nothing; rising at ${p.at} fizzles`);
      cityRecord(state, p.at, p.owner).cooling = gameTurn() + scaledTurns(CONFIG.coolingTurns, state.speed);
      continue;
    }
    state.rebels[p.owner] = { ip, age: state.age, mustered: true };
    // The rebels' arrival is told in the rising's own notice, one notification for the event.
    log(`rebel people ${ip} belongs to player ${p.owner}`);
    requests.push({ key: p.at, owner: p.owner, cause: p.cause, I: p.I, from: p.from, pFlip: p.pFlip,
      detail: p.detail, homeland: p.homeland, policy: p.policy });
  }
  return requests;
}

/** End the risings whose band is gone or whose time is up. */
function expireRisings(state) {
  const turn = gameTurn();
  const limit = scaledTurns(CONFIG.risingTurns, state.speed);
  for (const [key, rec] of Object.entries(state.cities)) {
    const keep = [];
    for (const r of rec.risings) {
      const units = r.units.concat(...r.joiners.map((j) => j.units));
      const alive = unitsAlive(units);
      if (alive > 0 && turn < r.start + limit) keep.push(r);
      else endRising(state, key, rec, r, alive ? "time" : "dispersed");
    }
    rec.risings = keep;
  }
}

/** A rising is over: cooling starts, its chapter closes, and the owner hears of it when it's the local player. */
function endRising(state, key, rec, r, reason) {
  const turn = gameTurn();
  rec.cooling = turn + scaledTurns(CONFIG.coolingTurns, state.speed);
  if (typeof r.hid === "number") closeChapter(state, r.hid, turn, reason);
  logEvent(state, { turn, at: key, cause: r.cause, outcome: "ended", reason }, CONFIG.logEntries);
  const city = cityAtKey(key);
  log(`rising at ${key} over (${reason})`);
  if (city && rec.owner === localId()) notify("ended", text("LOC_PT_ENDED", cityName(city)), undefined, city.location);
}

/**
 * Whether a settlement may roll for a rising now: not a capital (capitals never rise, so a roll would only burn the
 * counter), nothing active, not cooling, the civ and map under their caps.
 */
function mayRoll(state, rec, s) {
  const counts = activeCounts(state);
  return !s.capital && !rec.risings.length && rec.cooling <= gameTurn()
    && (counts.byOwner[s.owner] || 0) < CONFIG.maxActivePerCiv && counts.total < CONFIG.maxActiveTotal;
}

/** The misery counter and its roll (SPEC 3.3). */
function stepMisery(ctx, state, s, rec, requests) {
  const relief = getOption("parksCalm") ? parkReliefFor(s.city) : 0;
  const hEff = s.happiness + relief;
  rec.M = miseryStep(CONFIG, rec.M, hEff);
  const need = miseryNeed(CONFIG, state.speed);
  if (!getOption("miseryRisings") || !mayRoll(state, rec, s)) return;
  const chance = miseryChance(rec.M, need);
  if (chance <= 0) return;
  const hit = ctx.rand() < chance;
  log(`misery roll at ${s.key}: ${rec.M} of ${need} turns, chance ${chance.toFixed(2)}, ${hit ? "rises" : "holds"}`);
  if (hit) {
    requests.push({ key: s.key, owner: s.owner, cause: "misery", I: miseryIntensity(hEff),
      detail: { happiness: s.happiness, turns: rec.M } });
    rec.M = Math.floor(need / 2);
  }
}

/** The homeland of an enclave record: the origin player if it's an alive major, else the civ playing originCiv. */
function homelandOf(rec, owner) {
  if (isAliveMajor(rec.civ)) return rec.civ;
  if (rec.originCiv) {
    for (const pid of safe(() => Players.getAliveMajorIds(), []) || []) {
      if (safe(() => GameInfo.Civilizations.lookup(player(pid).civilizationType).CivilizationType, "") === rec.originCiv) return pid;
    }
  }
  const foreign = largestForeign(rec.at, owner);
  return foreign && isAliveMajor(foreign.pid) ? foreign.pid : -1;
}

/** Enclave tension and its roll: the host's treatment card against its standing with the homeland. */
function stepEnclave(ctx, state, s, rec, requests) {
  const enclave = enclavesOf(s.owner).find((e) => e.at === s.key);
  if (!enclave) { rec.T = Math.max(0, rec.T - 1); return; }
  const homeland = homelandOf(enclave, s.owner);
  if (homeland < 0) return;
  const rel = relationship(s.owner, homeland);
  const card = treatmentOf(s.owner);
  rec.T = enclaveStep(CONFIG, rec.T, rel, card.stance);
  if (!getOption("enclaveRisings") || !mayRoll(state, rec, s)) return;
  const chance = enclaveChance(CONFIG, rec.T);
  if (chance > 0 && ctx.rand() < chance) {
    const I = enclaveIntensity(rec.T);
    rec.T = 0;
    requests.push({ key: s.key, owner: s.owner, cause: "enclave", I, homeland, policy: card.type || undefined });
  }
}

/**
 * Every major settlement's counters; records of settlements that no longer exist are dropped. Behind the age-start
 * screen the city lists read empty (watched 2026-10-15), so an empty read keeps every record.
 */
function stepSettlements(ctx, state, requests) {
  const seen = new Set();
  const emigration = emigrationPresent();
  const settlements = majorSettlements();
  for (const s of settlements) {
    seen.add(s.key);
    const rec = cityRecord(state, s.key, s.owner);
    stepMisery(ctx, state, s, rec, requests);
    if (emigration) stepEnclave(ctx, state, s, rec, requests);
  }
  if (!settlements.length) return;
  for (const key of Object.keys(state.cities)) {
    if (seen.has(key) || cityAtKey(key)) continue;
    dlog(`record ${key} dropped: no settlement there`);
    delete state.cities[key];
  }
}

/** The brewing risings that are due, with the due-turn re-check of a flip's relations (SPEC 3.1). */
function dueBrewing(ctx, state, requests) {
  const turn = gameTurn();
  const keep = [];
  for (const p of state.pending) {
    if (p.stage !== "brewing" || p.dueTurn > turn) { keep.push(p); continue; }
    if (p.cause === "flip" && typeof p.from === "number" && !recheckFlip(ctx, p)) continue;
    requests.push({ key: p.at, owner: p.owner, cause: p.cause, I: p.I, from: p.from, pFlip: p.pFlip });
  }
  state.pending = keep;
}

/** Relations re-read on the due turn: worse means a second roll at the higher chance; an alliance stands them down. */
function recheckFlip(ctx, p) {
  const rel = pairRelationship(p.from, p.owner);
  const now = flipChance(CONFIG, rel);
  if (rel.ally) { log(`brewing at ${p.at} called off: the civs are allied now`); return false; }
  if (now <= (p.pFlip || 0)) return true;
  const hit = ctx.rand() < now;
  log(`brewing at ${p.at}: relations worse (chance ${now.toFixed(2)} over ${(p.pFlip || 0).toFixed(2)}), `
    + `re-roll ${hit ? "holds" : "settles"}`);
  if (hit) { p.pFlip = now; p.I = Math.min(1, p.I + (rel.war ? 0.2 : 0)); }
  return hit;
}

/**
 * Run the pass. Resolves when every rising it started has finished with the engine.
 * @param {{state:import("./pt-state.js").State, rand:()=>number, camps:()=>*[],
 *   placements:{attempts:number, refused:number}}} ctx
 * @returns {Promise<{ms:number, requests:number, outcomes:string[]}>}
 */
export async function runPass(ctx) {
  const t0 = Date.now();
  const state = ctx.state;
  state.speed = speedScale(speedMultiplier());
  rolloverIfNewAge(state);
  const turn = gameTurn();
  const musters = state.pending.filter((p) => p.stage === "muster" && p.dueTurn <= turn);
  state.pending = state.pending.filter((p) => !musters.includes(p));
  const requests = musters.length ? collectMusters(ctx, state, musters) : [];
  expireRisings(state);
  stepSettlements(ctx, state, requests);
  dueBrewing(ctx, state, requests);
  const ms = Date.now() - t0;
  saveState(state);
  dlog(`pass turn ${turn}: ${ms} ms, ${requests.length} rising request(s)`);
  const outcomes = [];
  for (const req of requests) outcomes.push(await runRising(ctx, state, req));
  if (requests.length) saveState(state);
  return { ms, requests: requests.length, outcomes };
}

export const __test = { recheckFlip, mayRoll, homelandOf };
