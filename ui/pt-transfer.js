// pt-transfer.js - Partisans: what a settlement changing hands means (SPEC 3.1, 8). A transfer by culture may start
// a flip rising against the new owner, rolled once here and scheduled a few turns out so the player gets the warning
// first. A settlement taken by an independent during a rising is removed by the game: the rising ends and the player
// is told it burned.

import { closeChapter } from "./pt-history.js";
import { CONFIG } from "./pt-config.js";
import { brewDelay, flipChance, flipIntensity } from "./pt-model.js";
import { cityRecord, logEvent } from "./pt-state.js";
import { cityAtKey, cityKey, cityName, gameTurn, isAliveMajor, pairRelationship, player, safe } from "./pt-engine.js";
import { humanOf, notify, text } from "./pt-notify.js";
import { getOption } from "./pt-settings.js";
import { log } from "./pt-log.js";
import { describeBrewing } from "./pt-describe.js";

/** @param {*} transferType @returns {boolean} whether it's the engine's culture transfer */
export function isCultureTransfer(transferType) {
  const byCulture = safe(() => CityTransferTypes.BY_CULTURAL_IDENTITY, undefined);
  if (byCulture !== undefined) return transferType === byCulture;
  return transferType === "BY_CULTURAL_IDENTITY";
}

/** Whether Cultural Diffusion is in this game: it has saved state, or its console surface is here. */
export function culturalDiffusionPresent() {
  if (safe(() => !!globalThis.culturalDiffusion, false)) return true;
  const raw = safe(() => Configuration.getGame().getValue("CulturalDiffusionState_v2"), null);
  return typeof raw === "string" && raw.length > 0;
}

/**
 * The flip roll, pure given the relationship and a random number.
 * @param {{lvl:number, war:boolean, ally:boolean}} rel @param {number} rand
 * @returns {{p:number, hit:boolean, I:number}}
 */
export function rollFlip(rel, rand) {
  const p = flipChance(CONFIG, rel);
  return { p, hit: rand < p, I: flipIntensity(rel) };
}

/** Why a flip can't start a rising now, or null. @param {number} from @param {number} to */
function flipRefusal(from, to) {
  if (!getOption("flipRisings")) return "flip risings are off";
  if (!getOption("flipsFromAnyMod") && !culturalDiffusionPresent()) return "Cultural Diffusion absent and flips from other mods are off";
  if (!isAliveMajor(from) || !isAliveMajor(to) || from === to) return "not between two alive majors";
  return null;
}

/** Whether Cultural Diffusion has said its flip notice carries Partisans' unrest line (see flipOutlook). */
export function cdTellsUnrest() {
  return safe(() => globalThis.culturalDiffusion?.tellsPartisanUnrest === true, false);
}

/**
 * What another mod's flip notice can say about a settlement that just changed hands by culture: null when its people
 * aren't arming, else the turns until the partisans take the field and a line in the player's language.
 * @param {import("./pt-state.js").State} state @param {string} key "x,y"
 * @returns {{turns:number, from:number, owner:number, line:string}|null}
 */
export function flipOutlook(state, key) {
  const p = (state && state.pending || []).find((q) => q.at === key && q.cause === "flip" && q.stage === "brewing");
  if (!p) return null;
  const city = safe(() => cityAtKey(key), null);
  return { turns: Math.max(0, p.dueTurn - gameTurn()), from: p.from ?? -1, owner: p.owner,
    line: text("LOC_PT_FLIP_OUTLOOK", city ? cityName(city) : "") };
}

/**
 * Schedule the brewing rising and warn the player when the settlement is or was theirs.
 * @param {import("./pt-state.js").State} state @param {{city:*, key:string, from:number, to:number}} f
 * @param {{p:number, I:number}} roll @param {() => number} rand
 */
function scheduleFlip(state, f, roll, rand) {
  const delay = brewDelay(CONFIG, rand());
  const req = { at: f.key, owner: f.to, cause: "flip", I: roll.I, dueTurn: gameTurn() + delay, stage: "brewing",
    from: f.from, pFlip: roll.p };
  state.pending.push(req);
  const to = humanOf(f.to, f.from);
  if (to < 0) return;
  // Cultural Diffusion folds this into its own "has joined" notice when it says so, so the player gets one notice.
  if (cdTellsUnrest()) { log(`brewing at ${f.key}: Cultural Diffusion's flip notice carries the unrest`); return; }
  notify("brewing", describeBrewing(req, f.city, delay).join("[N]"),
    text("LOC_PT_NOTIFY_BREWING_TITLE_CITY", cityName(f.city)), f.city.location, to);
}

/**
 * A culture flip: roll, and on a hit schedule a brewing rising.
 * @param {import("./pt-state.js").State} state @param {*} city @param {number} from @param {number} to
 * @param {() => number} rand @returns {{p:number, hit:boolean}|null}
 */
export function onCultureFlip(state, city, from, to, rand) {
  const key = cityKey(city);
  const refusal = key ? flipRefusal(from, to) : "unreadable settlement";
  if (refusal) { log(`flip of ${key || "?"} ignored: ${refusal}`); return null; }
  const rel = pairRelationship(from, to);
  const roll = rollFlip(rel, rand());
  log(`flip of ${key} from ${from} to ${to}: level ${rel.lvl}${rel.war ? ", at war" : ""}${rel.ally ? ", allied" : ""}, `
    + `chance ${roll.p.toFixed(2)}, ${roll.hit ? "rises" : "stays quiet"}`);
  logEvent(state, { turn: gameTurn(), at: key, cause: "flip", outcome: roll.hit ? "brewing" : "quiet", p: roll.p },
    CONFIG.logEntries);
  cityRecord(state, key, to);
  if (roll.hit) scheduleFlip(state, { city, key, from, to }, roll, rand);
  return roll;
}

/**
 * A settlement with an active rising taken by an independent: the game removes it. End the rising, tell the player.
 * @param {import("./pt-state.js").State} state @param {string} key @param {string} name @param {number} from
 */
export function onSettlementLost(state, key, name, from, at) {
  const rec = state.cities[key];
  if (!rec || !rec.risings.length) return false;
  for (const r of rec.risings) if (typeof r.hid === "number") closeChapter(state, r.hid, gameTurn(), "burned");
  rec.risings = [];
  rec.cooling = 0;
  logEvent(state, { turn: gameTurn(), at: key, outcome: "burned" }, CONFIG.logEntries);
  log(`${key} (${name}) was taken by the rebels and removed`);
  const to = humanOf(from);
  if (to >= 0) notify("lost", text("LOC_PT_LOST", name), undefined, at, to);
  return true;
}

/** @param {*} data the event payload @returns {{city:*, from:number, to:number}|null} */
function readTransfer(data) {
  const cid = data && data.cityID;
  const to = cid && typeof cid.owner === "number" ? cid.owner : -1;
  const from = data && typeof data.fromPlayer === "number" ? data.fromPlayer : -1;
  const city = to >= 0 ? safe(() => Cities.get(cid), null) : null;
  return city ? { city, from, to } : null;
}

/**
 * The CityTransfered handler. Payload: { fromPlayer, transferType, cityID: { owner, id } }.
 * @param {import("./pt-state.js").State} state @param {*} data @param {() => number} rand
 * @returns {string} what happened, for the log
 */
export function onCityTransfered(state, data, rand) {
  const t = readTransfer(data);
  if (!t) return "unreadable";
  const key = cityKey(t.city);
  if (player(t.to)?.isIndependent) {
    return onSettlementLost(state, key, cityName(t.city), t.from, t.city.location) ? "burned" : "independent capture";
  }
  if (isCultureTransfer(data.transferType)) return onCultureFlip(state, t.city, t.from, t.to, rand) ? "flip" : "flip ignored";
  const rec = state.cities[key];
  if (rec) rec.owner = t.to;
  return "other transfer";
}
