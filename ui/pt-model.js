// pt-model.js - Partisans: the rules, as pure functions. Nothing here touches the engine or the DOM, so every formula
// and default in SPEC sections 3 to 6 is pinned by tests/pt-model.test.mjs. The pass (pt-pass.js) reads the game,
// calls these, and acts on what they return.

/** @param {number} v @param {number} lo @param {number} hi @returns {number} */
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// 3.1 flip unrest

/**
 * The chance a culture-flipped settlement rises against its new owner. Most flips are people who wanted to join, so
 * it's rare: nothing between allies or friends, a few in a hundred at neutral, about one in three at war.
 * @param {*} cfg @param {{lvl:number, war:boolean, ally:boolean}} rel how the civ that lost it and the civ that
 *   gained it stand with each other, both sides read @returns {number} 0..1
 */
export function flipChance(cfg, { lvl, war, ally }) {
  if (ally) return 0;
  if (war) return cfg.flipChanceAtWar;
  const level = Number.isFinite(lvl) ? lvl : 0;
  if (level >= cfg.flipLevelFriendly) return 0;
  if (level <= cfg.flipLevelHostile) return cfg.flipChanceHostile;
  if (level <= cfg.flipLevelUnfriendly) return cfg.flipChanceUnfriendly;
  return cfg.flipChanceNeutral;
}

/** @param {{lvl:number, war:boolean}} rel @returns {number} intensity 0..1 */
export function flipIntensity({ lvl, war }) {
  const level = Number.isFinite(lvl) ? lvl : 0;
  return clamp(0.4 + 0.4 * Math.max(0, -level) / 100 + (war ? 0.2 : 0), 0, 1);
}

/** The brewing delay in turns, 1 + floor(rand * 3) with the defaults. @param {*} cfg @param {number} rand 0..1 */
export function brewDelay(cfg, rand) {
  const span = cfg.brewDelayMax - cfg.brewDelayMin + 1;
  return cfg.brewDelayMin + Math.floor(clamp(rand, 0, 0.999999) * span);
}

// 3.2 enclave tension

/**
 * One turn's change in enclave tension. Unrest comes from how the host treats the community, through its treatment
 * card (Emigration's protective or suspicion cards), set against how the host stands with the community's homeland:
 * a protective card lets it settle even in wartime; with no card, only a war with the homeland builds it; under a
 * suspicion card a war builds it fast, and a hostile or unfriendly peace builds it too.
 * @param {*} cfg @param {{lvl:number, war:boolean}} rel the host's standing with the homeland
 * @param {"protect"|"suspect"|null} stance the host's treatment card @returns {number}
 */
export function enclaveDelta(cfg, { lvl, war }, stance) {
  const level = Number.isFinite(lvl) ? lvl : 0;
  if (stance === "protect") return -cfg.enclaveSettle;
  if (stance === "suspect") {
    if (war) return cfg.enclaveSuspectWar;
    if (level <= -60) return cfg.enclaveSuspectHostile;
    if (level <= -30) return cfg.enclaveSuspectUnfriendly;
    return -cfg.enclaveSettle;
  }
  return war ? cfg.enclavePlainWar : -cfg.enclaveSettle;
}

/**
 * One turn of enclave tension: the new total, 0 to enclaveMax, or 0 to enclavePlainCap when the host has no suspicion
 * card (tension built under one can still drain from above the cap).
 * @param {*} cfg @param {number} T @param {{lvl:number, war:boolean}} rel @param {"protect"|"suspect"|null} stance
 */
export function enclaveStep(cfg, T, rel, stance) {
  const t = Number.isFinite(T) ? T : 0;
  // Without a suspicion card a war wears on a community only so far: the chance tops out low.
  const cap = stance === "suspect" ? cfg.enclaveMax : Math.max(cfg.enclavePlainCap, Math.min(t, cfg.enclaveMax));
  return clamp(t + enclaveDelta(cfg, rel, stance), 0, Math.min(cap, cfg.enclaveMax));
}

/** @param {*} cfg @param {number} T @returns {number} the chance of a rising this turn, 0 below the floor */
export function enclaveChance(cfg, T) {
  if (T < cfg.enclaveFloor) return 0;
  return clamp((T - cfg.enclaveFloor) / cfg.enclaveSpan, 0, 1);
}

/**
 * How hard an enclave rising comes, from how long and how badly the community was treated (the tension at the roll),
 * never from how many of them live there. @param {number} T @returns {number} intensity
 */
export function enclaveIntensity(T) {
  return clamp(0.3 + (Number.isFinite(T) ? T : 0) / 60, 0.3, 0.8);
}

// 3.3 long misery

/** The turns of misery a rising needs at this game speed. @param {*} cfg @param {number} speedScale */
export function miseryNeed(cfg, speedScale) {
  const scale = Number.isFinite(speedScale) && speedScale > 0 ? speedScale : 1;
  return Math.max(1, Math.round(cfg.miseryTurns * scale));
}

/**
 * One turn of the misery counter (SPEC 3.3).
 * @param {*} cfg @param {number} M @param {number} hEff net happiness plus park relief @returns {number}
 */
export function miseryStep(cfg, M, hEff) {
  const m = Number.isFinite(M) ? M : 0;
  if (hEff <= cfg.miseryLine) return m + 1;
  if (hEff > cfg.miseryRecover) return Math.max(0, m - 2);
  return m;
}

/** @param {number} M @param {number} need @returns {number} the chance of a rising this turn */
export function miseryChance(M, need) {
  if (M < need) return 0;
  return Math.min(0.5, 0.10 + 0.02 * (M - need));
}

/** @param {number} hEff @returns {number} intensity */
export function miseryIntensity(hEff) {
  return clamp(-hEff / 30, 0.3, 1);
}

// 3.4 park relief

/**
 * The Happiness a settlement's park tiles pay, from the park constructible types on its plots.
 * @param {*} cfg @param {string[]} types every constructible type on the settlement's plots @returns {number}
 */
export function parkRelief(cfg, types) {
  let relief = 0;
  for (const t of types) relief += cfg.parkRelief[t] || 0;
  return relief;
}

// 4 gates

/**
 * Whether a rising may start, and if not why (SPEC 4). Checked in the spec's order.
 * @param {*} cfg
 * @param {{multiplayer:boolean, ownerAliveMajor:boolean, capital:boolean, activeHere:boolean, coolingHere:boolean,
 *   activeForOwner:number, activeTotal:number, causeOn:boolean}} g
 * @returns {string|null} the reason it may not, or null when it may
 */
export function risingGate(cfg, g) {
  if (g.multiplayer) return "multiplayer";
  if (!g.ownerAliveMajor) return "owner not an alive major";
  if (g.capital) return "capital";
  if (g.activeHere) return "rising active here";
  if (g.coolingHere) return "cooling";
  if (g.activeForOwner >= cfg.maxActivePerCiv) return "owner at the per-civ cap";
  if (g.activeTotal >= cfg.maxActiveTotal) return "map at the cap";
  if (!g.causeOn) return "cause switched off";
  return null;
}

// 5 owner

/**
 * Which independent fights (SPEC 5), from what the pass read. Pure: the declare-war and the muster are actions the
 * caller takes on the "declare" and "muster" answers.
 * @param {*} cfg
 * @param {{rebel:{alive:boolean, hostile:boolean}|null, targetIsLocal:boolean, neighbours:{ip:number, d:number,
 *   hostile:boolean, village:boolean}[], mustered:boolean}} r
 * @returns {{step:"rebel"|"declare"|"neighbour"|"muster"|"none", ip?:number}}
 */
export function chooseOwner(cfg, r) {
  if (r.rebel && r.rebel.alive && r.rebel.hostile) return { step: "rebel", ip: r.rebel.ip };
  if (r.rebel && r.rebel.alive && r.targetIsLocal) return { step: "declare", ip: r.rebel.ip };
  const near = r.neighbours.filter((n) => n.hostile && n.village && n.d <= cfg.borrowRange)
    .sort((a, b) => a.d - b.d || a.ip - b.ip)[0];
  if (near) return { step: "neighbour", ip: near.ip };
  if (!r.mustered) return { step: "muster" };
  return { step: "none" };
}

// 6 band

/** @param {*} cfg @param {number} I @param {number} population @param {string} ageType @returns {number} */
export function bandSize(cfg, I, population, ageType) {
  const pop = Number.isFinite(population) ? population : 0;
  const base = 1 + Math.round(3 * clamp(I, 0, 1)) + Math.floor(pop / 8);
  const cap = cfg.bandCap[ageType] || Math.min(...Object.values(cfg.bandCap));
  return clamp(base, 1, cap);
}

/**
 * Two melee to one ranged, starting with melee; skirmish units only if the age has no ranged candidate.
 * @param {number} size @param {{melee:string|null, ranged:string|null, skirmish:string|null}} c
 * @returns {string[]} unit types in placement order, empty when no candidate exists
 */
export function bandMix(size, c) {
  const second = c.ranged || c.skirmish;
  const out = [];
  for (let i = 0; i < size; i++) {
    const wantRanged = i % 3 === 2;
    const type = wantRanged ? (second || c.melee) : (c.melee || second);
    if (type) out.push(type);
  }
  return out;
}

/** The tier the age's progress allows. @param {*} cfg @param {number} f progress 0..1 @returns {1|2|3} */
export function tierFor(cfg, f) {
  const p = Number.isFinite(f) ? f : 0;
  return p < cfg.tierBreaks[0] ? 1 : p < cfg.tierBreaks[1] ? 2 : 3;
}

const COMBAT_TAGS = { melee: "UNIT_CLASS_MELEE", ranged: "UNIT_CLASS_RANGED", skirmish: "UNIT_CLASS_SKIRMISH" };

/** @param {{Type:string, Tag:string}[]} tags @returns {Map<string, Set<string>>} the combat tags per unit type */
function combatTagsByType(tags) {
  const wanted = new Set(Object.values(COMBAT_TAGS));
  const out = new Map();
  for (const t of tags) {
    if (!wanted.has(t.Tag)) continue;
    if (!out.has(t.Type)) out.set(t.Type, new Set());
    out.get(t.Type).add(t.Tag);
  }
  return out;
}

/** @param {*} u a Units row @returns {boolean} a land, military, non-unique unit */
function isOrdinaryLandMilitary(u) {
  return u.Domain === "DOMAIN_LAND" && u.CoreClass === "CORE_CLASS_MILITARY" && !u.TraitType;
}

/**
 * The partisan unit candidates by role and tier (SPEC 6.4), never hand-named.
 * @param {{UnitType:string, Domain:string, CoreClass:string, TraitType:string|null, Tier:number}[]} units
 * @param {{Type:string, Tag:string}[]} tags
 * @returns {Record<"melee"|"ranged"|"skirmish", Record<number, string[]>>}
 */
export function unitCandidates(units, tags) {
  const tagsOf = combatTagsByType(tags);
  const out = { melee: {}, ranged: {}, skirmish: {} };
  for (const u of units) {
    const set = tagsOf.get(u.UnitType);
    if (!set || !isOrdinaryLandMilitary(u)) continue;
    const tier = Number(u.Tier) || 1;
    for (const [role, tag] of Object.entries(COMBAT_TAGS)) {
      if (set.has(tag)) (out[role][tier] = out[role][tier] || []).push(u.UnitType);
    }
  }
  for (const role of Object.keys(out)) for (const t of Object.keys(out[role])) out[role][t].sort();
  return out;
}

/**
 * One unit type per role at the wanted tier, or the highest tier below it the age has.
 * @param {ReturnType<typeof unitCandidates>} cands @param {number} tier
 * @returns {{melee:string|null, ranged:string|null, skirmish:string|null, tier:number}}
 */
export function pickTier(cands, tier) {
  const pick = (role) => {
    for (let t = tier; t >= 1; t--) if (cands[role][t] && cands[role][t].length) return cands[role][t][0];
    return null;
  };
  const chosen = { melee: pick("melee"), ranged: pick("ranged"), skirmish: pick("skirmish"), tier };
  return chosen;
}

/**
 * The placement order (SPEC 6.5): ring 3, then 4, then 2; within a ring by preference (unowned, then the settlement's
 * own, then anything), then by plot index. Plots the caller already filtered out (water, units, districts, parks,
 * pending writes) aren't here.
 * @param {*} cfg @param {{index:number, ring:number, owner:number}[]} plots @param {number} cityOwner
 * @returns {{index:number, ring:number, owner:number}[]}
 */
export function placementOrder(cfg, plots, cityOwner) {
  const pref = (p) => (p.owner < 0 ? 0 : p.owner === cityOwner ? 1 : 2);
  const ringRank = (r) => { const i = cfg.placementRings.indexOf(r); return i < 0 ? 99 : i; };
  return plots.filter((p) => cfg.placementRings.includes(p.ring))
    .sort((a, b) => ringRank(a.ring) - ringRank(b.ring) || pref(a) - pref(b) || a.index - b.index)
    .slice(0, cfg.placementAttempts);
}

/**
 * Which neighbours send fighters after a flip rising (SPEC 6.6), given one random number per neighbour.
 * @param {*} cfg @param {number} pFlip
 * @param {{ip:number, d:number, hostile:boolean, village:boolean}[]} neighbours camps within joinRange, nearest first
 * @param {number} bandOwner @param {number[]} rolls
 * @returns {{ip:number, k:number}[]} at most cfg.maxJoiners
 */
export function joinPlan(cfg, pFlip, neighbours, bandOwner, rolls) {
  const out = [];
  neighbours.forEach((n, i) => {
    if (out.length >= cfg.maxJoiners || n.ip === bandOwner || !n.hostile || !n.village || n.d > cfg.joinRange) return;
    const chance = pFlip * (1 - n.d / (cfg.joinRange + 1));
    if ((rolls[i] ?? 1) < chance) out.push({ ip: n.ip, k: n.d <= 3 ? 2 : 1 });
  });
  return out;
}

// 6.7 game speed

/** @param {number} costMultiplier the GameSpeeds row's CostMultiplier (Standard 100) @returns {number} */
export function speedScale(costMultiplier) {
  const m = Number(costMultiplier);
  return Number.isFinite(m) && m > 0 ? m / 100 : 1;
}

/** Turns scaled to the game speed, at least 1. @param {number} turns @param {number} scale */
export function scaledTurns(turns, scale) {
  return Math.max(1, Math.round(turns * (Number.isFinite(scale) && scale > 0 ? scale : 1)));
}
