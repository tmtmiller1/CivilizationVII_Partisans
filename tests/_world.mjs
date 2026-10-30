// _world.mjs - a stub of the engine surface pt-engine.js reads, for the tests. One call to makeWorld() installs the
// globals; every write the mod sends is recorded in world.requests and, for CREATE_ELEMENT units, landed at once.

/** Hex distance on the game's odd-row offset grid, with wrap in x. */
export function hexDistance(w, x1, y1, x2, y2) {
  const cube = (x, y) => { const q = x - (y - (y & 1)) / 2; return [q, y, -q - y]; };
  const dxs = [x2 - x1, x2 - x1 - w, x2 - x1 + w];
  let best = Infinity;
  for (const dx of dxs) {
    const [aq, ar, as] = cube(x1, y1), [bq, br, bs] = cube(x1 + dx, y2);
    best = Math.min(best, Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs)));
  }
  return best;
}

/**
 * @param {{width?:number, height?:number, turn?:number, age?:number, local?:number, players?:*[], store?:Record<string,string>,
 *   multiplayer?:boolean, speed?:number, progress?:number}} [opt]
 */
export function makeWorld(opt = {}) {
  const world = {
    width: opt.width ?? 40, height: opt.height ?? 30, turn: opt.turn ?? 5, age: opt.age ?? 100, local: opt.local ?? 0,
    players: new Map(), store: { ...(opt.store || {}) }, requests: [], slotted: new Set(), traditionDefs: new Set(), multiplayer: !!opt.multiplayer,
    speed: opt.speed ?? 100, progress: opt.progress ?? 0.1, nextUnit: 100, notifications: [], refuse: new Set(),
    plotOwner: new Map(), constructibles: new Map(), water: new Set(), districts: new Map(), hostility: new Map(), levelChanges: [], stray: new Map(),
    relations: new Map(), wars: new Set(), allies: new Set(), unitTable: [], tagTable: [], constructibleDefs: new Map(),
    lagReads: 0, lagged: []
  };
  for (const p of opt.players || []) addPlayer(world, p);
  install(world);
  return world;
}

/** @param {*} world @param {{id:number, kind:"major"|"independent"|"minor", alive?:boolean, cities?:*[], units?:*[], suzerain?:boolean, civ?:string, adjective?:string}} p */
export function addPlayer(world, p) {
  const player = { id: p.id, kind: p.kind, alive: p.alive !== false, cities: [], units: [], suzerain: !!p.suzerain,
    civ: p.civ || `CIVILIZATION_${p.id}`, adjective: p.adjective || `Adj${p.id}`, name: p.name || `Civ${p.id}` };
  world.players.set(p.id, player);
  for (const c of p.cities || []) addCity(world, p.id, c);
  for (const u of p.units || []) addUnit(world, p.id, u);
  return player;
}

export function addCity(world, owner, c) {
  const player = world.players.get(owner);
  const city = { owner, x: c.x, y: c.y, name: c.name || `City${c.x}_${c.y}`, population: c.population ?? 3,
    capital: !!c.capital, happiness: c.happiness ?? 5, plots: c.plots || ring1(world, c.x, c.y), constructibles: [],
    id: { owner, id: c.id ?? (c.x * 1000 + c.y), type: 1 } };
  player.cities.push(city);
  for (const [x, y] of city.plots) world.plotOwner.set(`${x},${y}`, owner);
  world.districts.set(`${c.x},${c.y}`, "CITY_CENTER");
  return city;
}

function ring1(world, x, y) {
  const out = [[x, y]];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const px = (x + dx + world.width) % world.width, py = y + dy;
    if (py >= 0 && py < world.height && hexDistance(world.width, x, y, px, py) === 1) out.push([px, py]);
  }
  return out;
}

export function addUnit(world, owner, u) {
  const unit = { owner, id: u.id ?? world.nextUnit++, x: u.x, y: u.y, type: u.type || "UNIT_WARRIOR" };
  world.players.get(owner).units.push(unit);
  return unit;
}

export function addCamp(world, ip, x, y, type = "IMPROVEMENT_VILLAGE") {
  world.plotOwner.set(`${x},${y}`, ip);
  world.constructibles.set(`${x},${y}`, [{ type, owner: ip, id: x * 1000 + y }]);
}

/** Slot one of a civ's policy cards; the card exists in the database from then on. */
export function slotCard(world, pid, type) {
  world.traditionDefs.add(type);
  world.slotted.add(`${pid}:${type}`);
}

export function setRelation(world, a, b, { lvl = 0, war = false, ally = false } = {}) {
  world.relations.set(`${a}:${b}`, lvl);
  world.relations.set(`${b}:${a}`, lvl);
  if (war) { world.wars.add(`${a}:${b}`); world.wars.add(`${b}:${a}`); } else { world.wars.delete(`${a}:${b}`); world.wars.delete(`${b}:${a}`); }
  if (ally) { world.allies.add(`${a}:${b}`); world.allies.add(`${b}:${a}`); } else { world.allies.delete(`${a}:${b}`); world.allies.delete(`${b}:${a}`); }
}

function cityObject(world, c) {
  return {
    owner: c.owner, location: { x: c.x, y: c.y }, name: c.name, population: c.population, isCapital: c.capital, id: c.id,
    Happiness: { netHappinessPerTurn: c.happiness },
    getPurchasedPlots: () => c.plots.map(([x, y]) => y * world.width + x),
    Constructibles: { getIds: () => c.constructibles.map((k) => ({ owner: c.owner, id: k.id, _type: k.type })) }
  };
}

function playerObject(world, p) {
  return {
    id: p.id, isAlive: p.alive, isHuman: !!p.human, isMajor: p.kind === "major", isIndependent: p.kind === "independent", isMinor: p.kind === "minor",
    civilizationName: p.name, civilizationAdjective: p.adjective, civilizationType: p.civ,
    Cities: { getCities: () => p.cities.map((c) => cityObject(world, c)) },
    Units: { getUnitIds: () => { landLagged(world, p.id); return p.units.map((u) => ({ owner: p.id, id: u.id })); }, getUnits: () => p.units.map((u) => ({ ...u, id: { owner: p.id, id: u.id }, location: { x: u.x, y: u.y } })) },
    Diplomacy: {
      getRelationshipLevel: (b) => world.relations.get(`${p.id}:${b}`) ?? 0,
      isAtWarWith: (b) => world.wars.has(`${p.id}:${b}`),
      hasAllied: (b) => world.allies.has(`${p.id}:${b}`)
    },
    Influence: { hasSuzerain: p.suzerain },
    Culture: { isTraditionActive: (h) => world.slotted.has(`${p.id}:${h}`) }
  };
}

function constructibleAt(world, x, y) {
  const list = world.constructibles.get(`${x},${y}`) || [];
  for (const p of world.players.values()) for (const c of p.cities) {
    if (c.x === x && c.y === y) return list.concat(c.constructibles.map((k) => ({ ...k, owner: p.id })));
  }
  return list;
}

/** Count one read of an owner's units against each lagged unit of theirs, and land those whose time has come. */
function landLagged(world, owner) {
  for (const l of world.lagged.filter((q) => q.owner === owner)) {
    if (--l.reads > 0) continue;
    world.lagged.splice(world.lagged.indexOf(l), 1);
    addUnit(world, owner, { x: l.x, y: l.y, type: l.type });
  }
}

function handleRequest(world, kind, args) {
  world.requests.push({ kind, args });
  if (kind === "CREATE_ELEMENT" && args.Kind === "UNIT") {
    const key = `${args.Location.x},${args.Location.y}`;
    if (world.refuse.has(key)) return;
    const at = world.stray.get(args.Owner) || args.Location;   // an owner in `stray` gets its units at that spot instead
    // With `lagReads` set the engine answers late: the unit lands only after that many reads of the owner's unit list.
    if (world.lagReads > 0) world.lagged.push({ owner: args.Owner, x: at.x, y: at.y, type: args.Type, reads: world.lagReads });
    else addUnit(world, args.Owner, { x: at.x, y: at.y, type: args.Type });
  }
  if (kind === "DESTROY_ELEMENT" && args.Kind === "UNIT") {
    const p = world.players.get(args.Owner);
    if (p) p.units = p.units.filter((u) => u.id !== args.LocalID);
  }
  if (kind === "CREATE_ELEMENT" && args.Kind === "CONSTRUCTIBLE") {
    for (const p of world.players.values()) for (const c of p.cities) {
      if (c.x === args.Location.x && c.y === args.Location.y) c.constructibles.push({ type: args.Type, id: world.nextUnit++ });
    }
  }
  if (kind === "DESTROY_ELEMENT" && args.Kind === "CONSTRUCTIBLE") {
    for (const p of world.players.values()) for (const c of p.cities) c.constructibles = c.constructibles.filter((k) => k.id !== args.LocalID);
  }
  if (kind === "DECLARE_WAR") world.hostility.set(`${args.Player2}:${args.Player1}`, "HOSTILE");
}

function install(world) {
  const g = globalThis;
  g.GameContext = { get localPlayerID() { return world.local; } };
  g.IndependentRelationship = { HOSTILE: 2, NEUTRAL: 1, FRIENDLY: 0, NOT_APPLICABLE: -1 };
  g.CityTransferTypes = { BY_CULTURAL_IDENTITY: 7, BY_COMBAT: 1, BY_GIFT: 3 };
  g.DistrictTypes = { RURAL: 1, URBAN: 2, CITY_CENTER: 3, WONDER: 4, WILDERNESS: 5 };
  g.DiplomacyActionTypes = { DIPLOMACY_ACTION_DECLARE_WAR: "DIPLOMACY_ACTION_DECLARE_WAR" };
  g.PlayerOperationTypes = { DECLARE_WAR: "DECLARE_WAR" };
  g.Game = {
    get turn() { return world.turn; }, get age() { return world.age; },
    AgeProgressManager: { getCurrentAgeProgressionPoints: () => world.progress * 100, getMaxAgeProgressionPoints: () => 100 },
    PlayerOperations: { sendRequest: (_me, kind, args) => handleRequest(world, kind, args) },
    IndependentPowers: {
      getIndependentRelationship: (ip, pid) => (world.hostility.get(`${ip}:${pid}`) === "HOSTILE" ? 2 : 0),
      getIndependentHostility: (ip, pid) => world.hostility.get(`${ip}:${pid}`) || "FRIENDLY",
      // The standing behind the stance: 3 friendly, 0 hostile; a drop to 0 reads hostile (watched 2026-10-29).
      getIndependentPlayerLevel: (ip, pid) => (world.hostility.get(`${ip}:${pid}`) === "HOSTILE" ? 0 : 3),
      changeIndependentPlayerLevel: (ip, pid, delta) => {
        world.levelChanges.push([ip, pid, delta]);
        if (delta < 0) world.hostility.set(`${ip}:${pid}`, "HOSTILE"); else world.hostility.delete(`${ip}:${pid}`);
      },
      independentName: (ip) => `People${ip}`
    },
    Notifications: { send: (n, pid) => world.notifications.push({ ...n, pid }), getIdsForPlayer: () => [], find: () => null, dismiss: () => {} },
    getHash: (s) => s
  };
  g.GameInfo = {
    Ages: { lookup: (h) => ({ AgeType: h === 100 ? "AGE_ANTIQUITY" : h === 200 ? "AGE_EXPLORATION" : "AGE_MODERN" }) },
    GameSpeeds: { lookup: () => ({ CostMultiplier: world.speed }) },
    Constructibles: { lookup: (t) => world.constructibleDefs.get(t) || (typeof t === "string" ? { ConstructibleType: t, ConstructibleClass: "IMPROVEMENT" } : null) },
    Civilizations: { lookup: (t) => ({ CivilizationType: t }) },
    Traditions: { lookup: (t) => (world.traditionDefs.has(t) ? { TraditionType: t, Name: `LOC_${t}_NAME` } : null) },
    Units: world.unitTable, TypeTags: world.tagTable
  };
  g.Database = { makeHash: (s) => s };
  g.Players = {
    get: (pid) => { const p = world.players.get(pid); return p ? playerObject(world, p) : null; },
    getAliveIds: () => [...world.players.values()].filter((p) => p.alive).map((p) => p.id),
    getAliveMajorIds: () => [...world.players.values()].filter((p) => p.alive && p.kind === "major").map((p) => p.id),
    getAliveIndependentIds: () => [...world.players.values()].filter((p) => p.alive && p.kind === "independent").map((p) => p.id)
  };
  g.Configuration = {
    getGame: () => ({ getValue: (k) => world.store[k] ?? null, isNetworkMultiplayer: world.multiplayer, gameSpeedType: 1 }),
    editGame: () => ({ setValue: (k, v) => { world.store[k] = v; } })
  };
  g.GameplayMap = {
    getGridWidth: () => world.width, getGridHeight: () => world.height,
    getPlotDistance: (x1, y1, x2, y2) => hexDistance(world.width, x1, y1, x2, y2),
    getIndexFromLocation: (l) => l.y * world.width + l.x,
    getLocationFromIndex: (i) => ({ x: i % world.width, y: Math.floor(i / world.width) }),
    isWater: (x, y) => world.water.has(`${x},${y}`), isImpassable: () => false,
    getOwner: (x, y) => world.plotOwner.get(`${x},${y}`) ?? -1
  };
  g.MapCities = { getCity: (x, y) => { for (const p of world.players.values()) for (const c of p.cities) if (c.x === x && c.y === y) return c.id; return null; } };
  g.Cities = { get: (id) => { for (const p of world.players.values()) for (const c of p.cities) if (c.id.id === id.id && c.owner === id.owner) return cityObject(world, c); return null; } };
  g.MapUnits = { getUnits: (x, y) => { const out = []; for (const p of world.players.values()) for (const u of p.units) if (u.x === x && u.y === y) out.push({ owner: p.id, id: u.id }); return out; } };
  g.Districts = { getAtLocation: (l) => { const k = world.districts.get(`${l.x},${l.y}`); return k ? { type: g.DistrictTypes[k] } : null; } };
  g.MapConstructibles = { getConstructibles: (x, y) => constructibleAt(world, x, y).map((c) => ({ owner: c.owner, id: c.id, _type: c.type })) };
  g.Constructibles = { getByComponentID: (id) => ({ type: id._type }) };
  g.Locale = { compose: (key, ...args) => (typeof key === "string" ? [key, ...args].join("|") : String(key)) };
  g.Units = { get: () => null };
  g.engine = { on: () => {}, off: () => {} };
  g.localStorage = { getItem: () => null, setItem: () => {} };
  g.Controls = undefined;
}

/** Give the world the Antiquity unit rows the candidates read. */
export function antiquityUnits(world) {
  world.unitTable.push(
    { UnitType: "UNIT_WARRIOR", Domain: "DOMAIN_LAND", CoreClass: "CORE_CLASS_MILITARY", TraitType: null, Tier: 1 },
    { UnitType: "UNIT_SLINGER", Domain: "DOMAIN_LAND", CoreClass: "CORE_CLASS_MILITARY", TraitType: null, Tier: 1 },
    { UnitType: "UNIT_SPEARMAN", Domain: "DOMAIN_LAND", CoreClass: "CORE_CLASS_MILITARY", TraitType: null, Tier: 2 },
    { UnitType: "UNIT_ARCHER", Domain: "DOMAIN_LAND", CoreClass: "CORE_CLASS_MILITARY", TraitType: null, Tier: 2 },
    { UnitType: "UNIT_PHALANX", Domain: "DOMAIN_LAND", CoreClass: "CORE_CLASS_MILITARY", TraitType: null, Tier: 3 },
    { UnitType: "UNIT_HOPLITE", Domain: "DOMAIN_LAND", CoreClass: "CORE_CLASS_MILITARY", TraitType: "TRAIT_GREEK", Tier: 1 },
    { UnitType: "UNIT_GALLEY", Domain: "DOMAIN_SEA", CoreClass: "CORE_CLASS_MILITARY", TraitType: null, Tier: 1 },
    { UnitType: "UNIT_SCOUT", Domain: "DOMAIN_LAND", CoreClass: "CORE_CLASS_RECON", TraitType: null, Tier: 1 }
  );
  world.tagTable.push(
    { Type: "UNIT_WARRIOR", Tag: "UNIT_CLASS_MELEE" }, { Type: "UNIT_SLINGER", Tag: "UNIT_CLASS_RANGED" },
    { Type: "UNIT_SPEARMAN", Tag: "UNIT_CLASS_MELEE" }, { Type: "UNIT_ARCHER", Tag: "UNIT_CLASS_RANGED" },
    { Type: "UNIT_PHALANX", Tag: "UNIT_CLASS_MELEE" }, { Type: "UNIT_HOPLITE", Tag: "UNIT_CLASS_MELEE" },
    { Type: "UNIT_GALLEY", Tag: "UNIT_CLASS_MELEE" }, { Type: "UNIT_SCOUT", Tag: "UNIT_CLASS_RECON" },
    { Type: "UNIT_WARRIOR", Tag: "UNIT_CLASS_COMBAT" }
  );
}
