// pt-engine.js - Partisans: every read of the engine, and the few requests it sends. The GameFace API can be absent
// or throw, so each read is guarded and degrades to a neutral value; every player id goes through Players.get before
// any other accessor (an invalid id crashes some engine calls). Nothing here decides anything: the rules are in
// pt-model.js, the sequence in pt-pass.js.

import { dlog } from "./pt-log.js";

/** @param {() => *} fn @param {*} fallback @returns {*} */
export function safe(fn, fallback) { try { return fn(); } catch (_e) { return fallback; } }

/** @param {number} ms @returns {Promise<void>} */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @returns {number} the local player's id, or -1 */
export function localId() { return safe(() => { const id = GameContext.localPlayerID; return typeof id === "number" ? id : -1; }, -1); }

/** @returns {number} */
export function gameTurn() { return safe(() => (typeof Game.turn === "number" ? Game.turn : 0), 0); }

/** @returns {number} the age's hash, 0 when unreadable */
export function ageHash() { return safe(() => (typeof Game.age === "number" ? Game.age : 0), 0); }

/** @returns {string} the age type, "AGE_ANTIQUITY" and so on, or "" */
export function ageType() { return safe(() => String(GameInfo.Ages.lookup(Game.age).AgeType), ""); }

/** @returns {boolean} whether this is a network game, where the mod writes nothing */
export function isMultiplayer() { return !!safe(() => Configuration.getGame().isNetworkMultiplayer, false); }

/** @returns {number} the game speed's cost multiplier, 100 at Standard */
export function speedMultiplier() {
  return safe(() => Number(GameInfo.GameSpeeds.lookup(Configuration.getGame().gameSpeedType).CostMultiplier), 100);
}

/** @returns {number} how far the age has run, 0..1 */
export function ageProgress() {
  return safe(() => {
    const m = Game.AgeProgressManager;
    const max = m.getMaxAgeProgressionPoints();
    return max > 0 ? Math.max(0, Math.min(1, m.getCurrentAgeProgressionPoints() / max)) : 0;
  }, 0);
}

// players

/** @param {number} pid @returns {*} the player, or null when the id is invalid */
export function player(pid) {
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid < 0) return null;
  return safe(() => Players.get(pid), null) || null;
}

/** @param {number} pid @returns {boolean} */
export function isAliveMajor(pid) { const p = player(pid); return !!(p && p.isAlive && p.isMajor); }

/** @returns {number[]} */
export function aliveMajorIds() {
  return safe(() => Players.getAliveMajorIds(), null)
    || safe(() => Players.getAliveIds().filter((id) => isAliveMajor(id)), []);
}

/** @returns {number[]} */
export function aliveIndependentIds() {
  return safe(() => Players.getAliveIndependentIds(), null)
    || safe(() => Players.getAliveIds().filter((id) => player(id)?.isIndependent), []);
}

/**
 * How `a` stands with `b`, read from `a`'s side.
 * @param {number} a @param {number} b @returns {{lvl:number, war:boolean, ally:boolean}}
 */
export function relationship(a, b) {
  const d = player(a)?.Diplomacy;
  if (!d || !player(b)) return { lvl: 0, war: false, ally: false };
  return { lvl: safe(() => Number(d.getRelationshipLevel(b)), 0) || 0,
    war: !!safe(() => d.isAtWarWith(b), false), ally: !!safe(() => d.hasAllied(b), false) };
}

/**
 * How two civs stand with each other, both sides read: the worse level, and a war or alliance seen from either side.
 * @param {number} a @param {number} b @returns {{lvl:number, war:boolean, ally:boolean}}
 */
export function pairRelationship(a, b) {
  const x = relationship(a, b), y = relationship(b, a);
  return { lvl: Math.min(x.lvl, y.lvl), war: x.war || y.war, ally: x.ally || y.ally };
}

/** An independent that is still a village: nobody's suzerain has made it a city-state. @param {number} ip */
export function isVillage(ip) {
  const p = player(ip);
  return !!(p && p.isAlive && p.isIndependent && !safe(() => p.Influence.hasSuzerain, false));
}

/** Whether an independent reads hostile to a civ. @param {number} ip @param {number} pid @returns {boolean} */
export function isHostile(ip, pid) {
  if (!player(ip) || !player(pid)) return false;
  const rel = safe(() => Game.IndependentPowers.getIndependentRelationship(ip, pid), null);
  const hostileValue = safe(() => IndependentRelationship.HOSTILE, undefined);
  if (rel != null && hostileValue !== undefined) return rel === hostileValue;
  const name = safe(() => String(Game.IndependentPowers.getIndependentHostility(ip, pid)), "");
  return /HOSTILE/i.test(name);
}

/** @param {number} ip @param {number} pid @returns {string} the hostility's name, for the log */
export function hostilityName(ip, pid) {
  if (!player(ip) || !player(pid)) return "?";
  return safe(() => String(Game.IndependentPowers.getIndependentHostility(ip, pid)), "?");
}

/** @param {number} pid @returns {string} */
export function civName(pid) {
  const p = player(pid);
  return p ? safe(() => Locale.compose(p.civilizationName), "") || `player ${pid}` : `player ${pid}`;
}

/** @param {number} pid @returns {string} the civ's adjective ("Greek"), or its name */
export function civAdjective(pid) {
  const p = player(pid);
  const adj = p ? safe(() => Locale.compose(p.civilizationAdjective), "") : "";
  return adj || civName(pid);
}

/** @param {number} ip @returns {string} the independent people's name */
export function independentName(ip) {
  if (!player(ip)) return `independent ${ip}`;
  return safe(() => String(Game.IndependentPowers.independentName(ip)), "") || civName(ip);
}

// cities

/** @param {*} city @returns {string} "x,y" of its centre, "" when unreadable */
export function cityKey(city) {
  const l = city && city.location;
  return l && typeof l.x === "number" && typeof l.y === "number" ? `${l.x},${l.y}` : "";
}

/** @param {string} key @returns {{x:number, y:number}|null} */
export function parseKey(key) {
  const m = /^(-?\d+),(-?\d+)$/.exec(String(key));
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

/** @param {number} x @param {number} y @returns {*} the city whose centre is here, or null */
export function cityAt(x, y) {
  const id = safe(() => MapCities.getCity(x, y), null);
  return id ? safe(() => Cities.get(id), null) : null;
}

/** @param {string} key @returns {*} */
export function cityAtKey(key) { const l = parseKey(key); return l ? cityAt(l.x, l.y) : null; }

/** @param {*} city @returns {string} */
export function cityName(city) { return safe(() => Locale.compose(city.name), "") || cityKey(city); }

/** Every settlement of every alive major, each with what the pass needs. */
export function majorSettlements() {
  const out = [];
  for (const pid of aliveMajorIds()) {
    const p = player(pid);
    for (const city of safe(() => p.Cities.getCities(), []) || []) {
      const key = cityKey(city);
      if (!key) continue;
      out.push({ city, key, owner: pid, capital: !!safe(() => city.isCapital, false),
        population: safe(() => Number(city.population), 0) || 0,
        happiness: safe(() => Number(city.Happiness.netHappinessPerTurn), 0) || 0 });
    }
  }
  return out;
}

/** @param {*} city @returns {{x:number, y:number}[]} every plot the settlement owns, its centre included */
export function cityPlots(city) {
  const plots = [];
  for (const i of safe(() => city.getPurchasedPlots(), []) || []) {
    const l = safe(() => GameplayMap.getLocationFromIndex(i), null);
    if (l && typeof l.x === "number") plots.push({ x: l.x, y: l.y });
  }
  const c = city && city.location;
  if (c && !plots.some((p) => p.x === c.x && p.y === c.y)) plots.push({ x: c.x, y: c.y });
  return plots;
}

// plots

/** @returns {number} */
export function mapWidth() { return safe(() => GameplayMap.getGridWidth(), 0); }
/** @returns {number} */
export function mapHeight() { return safe(() => GameplayMap.getGridHeight(), 0); }

/** @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 @returns {number} */
export function distance(x1, y1, x2, y2) { return safe(() => GameplayMap.getPlotDistance(x1, y1, x2, y2), 9999); }

/** The plots exactly `r` tiles from a centre. @param {{x:number, y:number}} c @param {number} r */
export function ring(c, r) {
  const w = mapWidth(), h = mapHeight();
  const out = [];
  if (!w || !h) return out;
  for (let dy = -r; dy <= r; dy++) {
    const y = c.y + dy;
    if (y < 0 || y >= h) continue;
    for (let dx = -r; dx <= r; dx++) {
      const x = ((c.x + dx) % w + w) % w;
      if (distance(c.x, c.y, x, y) !== r) continue;
      out.push({ x, y, ring: r, index: safe(() => GameplayMap.getIndexFromLocation({ x, y }), y * w + x) });
    }
  }
  return out;
}

/** @param {number} x @param {number} y @returns {string[]} the constructible types on a plot */
export function constructibleTypesAt(x, y) {
  return (safe(() => MapConstructibles.getConstructibles(x, y), []) || []).map((id) =>
    safe(() => String(GameInfo.Constructibles.lookup(Constructibles.getByComponentID(id).type).ConstructibleType), "")
  ).filter(Boolean);
}

/** @param {number} x @param {number} y @returns {string|null} "RURAL" / "URBAN" / "CITY_CENTER" / "WONDER" / ... */
export function districtKindAt(x, y) {
  const d = safe(() => Districts.getAtLocation({ x, y }), null);
  if (!d) return null;
  const types = safe(() => DistrictTypes, null);
  if (!types) return "UNKNOWN";
  for (const k of Object.keys(types)) if (types[k] === d.type) return k;
  return "UNKNOWN";
}

/**
 * Whether a plot can take a partisan unit at all: land, passable, nobody on it, no settlement, no urban district or
 * wonder. Parks and pending writes are the caller's checks.
 * @param {number} x @param {number} y @returns {boolean}
 */
export function plotOpen(x, y) {
  if (safe(() => GameplayMap.isWater(x, y), true) || safe(() => GameplayMap.isImpassable(x, y), true)) return false;
  if ((safe(() => MapUnits.getUnits(x, y), []) || []).length) return false;
  if (safe(() => MapCities.getCity(x, y), null)) return false;
  const kind = districtKindAt(x, y);
  if (kind && kind !== "RURAL" && kind !== "WILDERNESS") return false;
  return !constructibleTypesAt(x, y).some((t) => safe(() => GameInfo.Constructibles.lookup(t).ConstructibleClass, "") === "WONDER");
}

/** @param {number} x @param {number} y @returns {number} the plot's owner, -1 when nobody's */
export function plotOwner(x, y) { const o = safe(() => GameplayMap.getOwner(x, y), -1); return typeof o === "number" ? o : -1; }

/**
 * Every village and encampment on the map, with its owner. A full scan, so the pass caches it per turn.
 * @returns {{ip:number, x:number, y:number, type:string}[]}
 */
export function scanCamps() {
  const w = mapWidth(), h = mapHeight();
  const out = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const owner = plotOwner(x, y);
      if (owner < 0 || !player(owner)?.isIndependent) continue;
      for (const t of constructibleTypesAt(x, y)) {
        if (t === "IMPROVEMENT_VILLAGE" || t === "IMPROVEMENT_ENCAMPMENT") out.push({ ip: owner, x, y, type: t });
      }
    }
  }
  return out;
}

// units

/** @param {number} pid @returns {number[]} */
export function unitIds(pid) {
  const p = player(pid);
  return p ? (safe(() => p.Units.getUnitIds(), []) || []).map((u) => u.id) : [];
}

/** Where a unit stands, or null when it's gone. @param {number} owner @param {number} id */
export function unitLocation(owner, id) {
  const p = player(owner);
  const u = p && (safe(() => p.Units.getUnits(), []) || []).find((x) => x.id && x.id.id === id);
  const l = u && u.location;
  return l && typeof l.x === "number" ? { x: l.x, y: l.y } : null;
}

/** Remove a unit the mod created somewhere it didn't ask for. @param {{owner:number, id:number}} unit */
export function destroyUnit(unit) {
  return request("DESTROY_ELEMENT", { Kind: "UNIT", Owner: unit.owner, LocalID: unit.id });
}

/** How many of a band's units still stand. @param {{owner:number, id:number}[]} units @returns {number} */
export function unitsAlive(units) {
  const byOwner = new Map();
  let alive = 0;
  for (const u of units) {
    if (!byOwner.has(u.owner)) byOwner.set(u.owner, new Set(unitIds(u.owner)));
    if (byOwner.get(u.owner).has(u.id)) alive++;
  }
  return alive;
}

// requests, all sent as the local player (the route the engine accepts)

/** @param {string} kind @param {*} args @returns {boolean} whether the request was sent */
function request(kind, args) {
  const me = localId();
  if (me < 0) return false;
  dlog(`request ${kind} ${JSON.stringify(args)}`);
  return safe(() => { Game.PlayerOperations.sendRequest(me, kind, args); return true; }, false);
}

/** @param {string} type @param {{x:number, y:number}} at @param {number} owner */
export function createUnit(type, at, owner) {
  return request("CREATE_ELEMENT", { Kind: "UNIT", Type: type, Location: { x: at.x, y: at.y }, Owner: owner });
}

/** @param {string} type @param {{x:number, y:number}} at @param {number} owner */
export function createConstructible(type, at, owner) {
  return request("CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: type, Location: { x: at.x, y: at.y }, Owner: owner });
}

/** @param {{owner:number, id:number}} cid the constructible's component id */
export function destroyConstructible(cid) {
  return request("DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: cid.owner, LocalID: cid.id });
}

/** The local player declares war on an independent (the game's own "war on an independent from the map"). */
export function declareWarOn(ip) {
  const me = localId();
  if (me < 0 || !player(ip)) return false;
  const type = safe(() => DiplomacyActionTypes.DIPLOMACY_ACTION_DECLARE_WAR, "DIPLOMACY_ACTION_DECLARE_WAR");
  const kind = safe(() => PlayerOperationTypes.DECLARE_WAR, "DECLARE_WAR");
  return request(kind, { Player1: me, Player2: ip, Type: type });
}

/** The constructibles of a given type in a city, with their component ids. @param {*} city @param {string} type */
export function constructiblesOfType(city, type) {
  const out = [];
  for (const id of safe(() => city.Constructibles.getIds(), []) || []) {
    const t = safe(() => String(GameInfo.Constructibles.lookup(Constructibles.getByComponentID(id).type).ConstructibleType), "");
    if (t === type) out.push({ owner: id.owner, id: id.id });
  }
  return out;
}

/** @returns {boolean} whether the engine's events are reachable */
export function engineReady() { return safe(() => typeof engine !== "undefined" && typeof engine.on === "function", false); }
