// pt-describe.js - Partisans: the "why" line a notice carries. The notice's title says where ("Partisans rise near
// Mutsu") and a click on it moves the camera there; this says why the people rose, and for a brewing rising, when.

import { cityName, civAdjective, civName, pairRelationship, safe } from "./pt-engine.js";
import { text } from "./pt-notify.js";

/** The LOC key for how two civs stand. @param {{lvl:number, war:boolean}} rel @returns {string} */
export function relationKey(rel) {
  if (rel.war) return "LOC_PT_REL_WAR";
  if (rel.lvl <= -60) return "LOC_PT_REL_HOSTILE";
  if (rel.lvl <= -30) return "LOC_PT_REL_UNFRIENDLY";
  return rel.lvl >= 30 ? "LOC_PT_REL_FRIENDLY" : "LOC_PT_REL_NEUTRAL";
}

/** The "Why" line for a rising request. @param {*} req @param {*} city @returns {string} */
export function whyLine(req, city) {
  const name = cityName(city);
  if (req.cause === "flip") {
    return text("LOC_PT_WHY_FLIP", name, civAdjective(req.from), text(relationKey(pairRelationship(req.from, req.owner))));
  }
  if (req.cause === "enclave") return enclaveWhy(req, name);
  const d = req.detail || {};
  const happiness = d.happiness ?? (Number(city?.Happiness?.netHappinessPerTurn) || 0);
  return text("LOC_PT_WHY_MISERY", name, Math.round(Number(happiness) || 0), Number(d.turns) || 0);
}

/**
 * An enclave rising's "why" names the host's treatment, never the community: its suspicion card when one was in force,
 * else the war with the homeland. @param {*} req @param {string} name
 */
function enclaveWhy(req, name) {
  const card = typeof req.policy === "string" ? safe(() => GameInfo.Traditions.lookup(req.policy), null) : null;
  if (card && card.Name) return text("LOC_PT_WHY_ENCLAVE_POLICY", text(card.Name), name, civName(req.homeland));
  return text("LOC_PT_WHY_ENCLAVE_WAR", name, civName(req.homeland));
}

/** The lines of a brewing flip rising's notice: why, and when the partisans take the field. */
export function describeBrewing(req, city, turns) {
  return [whyLine(req, city), text("LOC_PT_WHEN", cityName(city), turns)];
}
