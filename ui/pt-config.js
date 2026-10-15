// pt-config.js - Partisans: every number the model uses, in one place, with the spec's defaults (SPEC sections 3-6).
// The player's Options (pt-settings.js) switch causes on and off; the numbers here aren't exposed in the game.

export const CONFIG_DEFAULTS = Object.freeze({
  // 3.1 flip unrest
  // Most flips are people who wanted to join; only bad blood between the two civs makes one rise.
  flipChanceAtWar: 0.35,
  flipChanceHostile: 0.15,
  flipChanceUnfriendly: 0.08,
  flipChanceNeutral: 0.03,
  flipLevelUnfriendly: -30,
  flipLevelHostile: -60,
  flipLevelFriendly: 30,
  brewDelayMin: 1,
  brewDelayMax: 3,
  // 3.2 enclave tension
  enclaveMax: 30,
  enclaveSettle: 1,
  enclavePlainWar: 1,
  enclavePlainCap: 14,
  enclaveSuspectWar: 3,
  enclaveSuspectHostile: 2,
  enclaveSuspectUnfriendly: 1,
  enclaveFloor: 10,
  enclaveSpan: 40,
  // 3.3 long misery
  miseryLine: -10,
  miseryRecover: -5,
  miseryTurns: 20,
  // 3.4 park relief per park tile type, the Happiness those tiles pay (read from the map, never from the mod's files)
  parkRelief: Object.freeze({
    IMPROVEMENT_NATIONAL_PARK: 4,
    IMPROVEMENT_NATIONAL_PARK_LAND: 1,
    IMPROVEMENT_NATIONAL_PARK_LAND_8: 1,
    IMPROVEMENT_NATIONAL_PARK_LAND_16: 2,
    IMPROVEMENT_NATIONAL_PARK_LAND_24: 2
  }),
  // 4 gates
  coolingTurns: 20,
  risingTurns: 20,
  maxActivePerCiv: 2,
  maxActiveTotal: 6,
  // 5 owner
  borrowRange: 12,
  // 6 band
  bandCap: Object.freeze({ AGE_ANTIQUITY: 3, AGE_EXPLORATION: 3, AGE_MODERN: 2 }),
  tierBreaks: Object.freeze([0.40, 0.75]),
  placementRings: Object.freeze([3, 4, 2]),
  placementAttempts: 16,
  placementWaitMs: 900,
  joinRange: 6,
  maxJoiners: 2,
  // 9 state
  logEntries: 50
});

/** The live config: the defaults, which a devtools harness may override in a session. */
export const CONFIG = { ...CONFIG_DEFAULTS };
