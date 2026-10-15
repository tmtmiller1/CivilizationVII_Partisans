// pt-lab.js - the in-game steps behind the acceptance checks (docs/DESIGN.md section 12). Eval this file into the
// game page once (it defines globalThis.PTL), then start a step with PTL.start("<step>", args) and read it back with
// PTL.read("<step>"): the bench's eval gives up after 10 s and most steps wait on the engine for longer. p.sh does
// both. Everything here reads the mod through its console surface, globalThis.__towerPartisans.
(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const safe = (f, d = null) => { try { return f(); } catch (e) { return d === null ? `THREW ${e && e.message}` : d; } };
  const PT = () => globalThis.__towerPartisans;
  const local = () => GameContext.localPlayerID;
  const req = (kind, args) => Game.PlayerOperations.sendRequest(local(), kind, args);
  const leaderOf = (pid) => safe(() => GameInfo.Leaders.lookup(Players.get(pid).leaderType).LeaderType);
  const typeName = (h) => safe(() => { const r = GameInfo.Constructibles.lookup(h) || GameInfo.Units.lookup(h); return r ? (r.ConstructibleType || r.UnitType) : h; });
  const cityAt = (x, y) => { const id = safe(() => MapCities.getCity(x, y), null); return id ? Cities.get(id) : null; };
  const name = (c) => safe(() => Locale.compose(c.name));

  function buildingsIn(city) {
    return safe(() => city.Constructibles.getIds().map((id) => ({ type: typeName(Constructibles.getByComponentID(id)?.type), owner: id.owner, id: id.id })), []);
  }
  function cityReport(x, y) {
    const c = cityAt(x, y);
    if (!c) return { exists: false };
    return { exists: true, owner: c.owner, name: name(c), pop: c.population, capital: c.isCapital, town: c.isTown,
      happiness: safe(() => c.Happiness.netHappinessPerTurn), buildings: buildingsIn(c).map((b) => b.type),
      transfer: safe(() => Object.entries(CityTransferTypes).find(([, v]) => v === c.mostRecentTranseferType)?.[0] ?? c.mostRecentTranseferType),
      defence: safe(() => Districts.getAtLocation({ x, y })?.getDamage?.()) };
  }
  function unitsOf(pid) { return safe(() => Players.get(pid).Units.getUnits().map((u) => ({ t: typeName(u.type), x: u.location.x, y: u.location.y, id: u.id.id })), []); }
  function player(pid) {
    const p = Players.get(pid);
    if (!p) return { pid, missing: true };
    return { pid, leader: leaderOf(pid), alive: p.isAlive, major: p.isMajor, indep: p.isIndependent, minor: p.isMinor,
      name: safe(() => Locale.compose(p.civilizationName)), units: unitsOf(pid).length,
      cities: safe(() => p.Cities.getCities().map((c) => ({ x: c.location.x, y: c.location.y, name: name(c), pop: c.population, cap: c.isCapital })), []),
      suzerain: safe(() => p.Influence?.hasSuzerain), hostileToLocal: safe(() => Game.IndependentPowers.getIndependentHostility(pid, local())),
      relLocal: safe(() => Players.get(local()).Diplomacy.getRelationshipLevel(pid)), warLocal: safe(() => Players.get(local()).Diplomacy.isAtWarWith(pid)) };
  }
  const events = [];
  for (const n of ["CityTransfered", "CityRemovedFromMap", "UnitAddedToMap", "UnitRemovedFromMap", "CombatResult", "DistrictDamageChanged",
    "NotificationAdded", "PlayerTurnActivated", "DiplomacyEventStarted", "ConstructibleAddedToMap", "ConstructibleRemovedFromMap"]) {
    try { engine.on(n, (d) => events.push({ t: Game.turn, n, d: safe(() => JSON.parse(JSON.stringify(d)), {}) })); } catch (_) {}
  }
  const summary = () => { const s = PT()?.state(); return s && { age: s.age, cities: Object.fromEntries(Object.entries(s.cities).filter(([, c]) => c.M || c.T || c.cooling || c.risings.length).map(([k, c]) => [k, { owner: c.owner, M: c.M, T: c.T, cooling: c.cooling, risings: c.risings.map((r) => ({ cause: r.cause, ip: r.ip, start: r.start, units: r.units.length, joiners: r.joiners.map((j) => [j.ip, j.units.length]) })) }])), rebels: s.rebels, pending: s.pending, log: s.log.slice(-8) }; };

  const steps = {
    // Who is in the game, and the mod's state.
    async survey() {
      return { turn: Game.turn, local: local(), age: safe(() => GameInfo.Ages.lookup(Game.age).AgeType), version: PT()?.version, multiplayer: PT()?.multiplayer,
        majors: Players.getAliveMajorIds().map(player), independents: Players.getAliveIndependentIds().map(player), camps: PT()?.camps(), state: summary() };
    },
    // Flip the city at (x, y) to `toPid`'s leader by culture with the probe marker, then take the marker out. Reports
    // the transfer, what the mod rolled, and its pending list.
    async flip({ x, y, toPid, watchMs = 6000 }) {
      const type = `BUILDING_PTPROBE_CULT_${leaderOf(toPid)}`;
      const c = cityAt(x, y);
      if (!c) return { err: `no city at ${x},${y}` };
      if (!GameInfo.Constructibles.lookup(type)) return { err: `no constructible ${type}: probe mod not loaded?` };
      const from = c.owner;
      const n0 = events.length;
      req("CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: type, Location: { x, y }, Owner: from });
      const t0 = Date.now(); let flippedMs = null;
      while (Date.now() - t0 < watchMs) { await sleep(100); if (cityAt(x, y)?.owner === toPid) { flippedMs = Date.now() - t0; break; } }
      await sleep(1200);
      for (const b of buildingsIn(cityAt(x, y)).filter((b) => String(b.type).startsWith("BUILDING_PTPROBE_CULT_"))) req("DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: b.owner, LocalID: b.id });
      await sleep(1500);
      return { from, to: toPid, flippedMs, city: cityReport(x, y), events: events.slice(n0).filter((e) => e.n === "CityTransfered" || e.n === "NotificationAdded"), state: summary() };
    },
    // -15 Happiness in the city at (x, y) (probe marker), or take it out with off: true.
    async misery({ x, y, off = false, deep = false }) {
      const c = cityAt(x, y);
      if (!c) return { err: `no city at ${x},${y}` };
      const type = deep ? "BUILDING_PTPROBE_UNH2" : "BUILDING_PTPROBE_UNH";
      if (off) for (const b of buildingsIn(c).filter((b) => String(b.type).startsWith("BUILDING_PTPROBE_UNH"))) req("DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: b.owner, LocalID: b.id });
      else req("CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: type, Location: { x, y }, Owner: c.owner });
      await sleep(2500);
      return cityReport(x, y);
    },
    // Found the local player's first settlement where its settler stands (a turn-1 lab game has none).
    async found() {
      const settler = Players.get(local()).Units.getUnits().find((u) => /SETTLER|FOUNDER/.test(GameInfo.Units.lookup(u.type)?.UnitType || ""));
      if (!settler) return { err: "no settler" };
      const at = { x: settler.location.x, y: settler.location.y };
      Game.UnitOperations.sendRequest(settler.id, UnitOperationTypes.FOUND_CITY, {});
      await sleep(5000);
      return { at, city: cityReport(at.x, at.y) };
    },
    // A town for `pid` (default the local player) on free land `dist` to `dist + 2` tiles from (x, y).
    async town({ pid, x, y, dist = 4 }) {
      const owner = pid ?? local();
      const W = GameplayMap.getGridWidth(), H = GameplayMap.getGridHeight();
      const spots = [];
      for (let dy = -dist - 2; dy <= dist + 2; dy++) for (let dx = -dist - 2; dx <= dist + 2; dx++) {
        const px = (x + dx + W) % W, py = y + dy;
        if (py < 0 || py >= H) continue;
        const d = GameplayMap.getPlotDistance(x, y, px, py);
        if (d < dist || d > dist + 2 || GameplayMap.isWater(px, py) || GameplayMap.isImpassable(px, py)) continue;
        if (safe(() => MapCities.getCity(px, py), null) || (MapUnits.getUnits(px, py) || []).length) continue;
        spots.push({ x: px, y: py, d });
      }
      spots.sort((a, b) => a.d - b.d);
      const had = new Set(Players.get(owner).Cities.getCities().map((c) => c.id.id));
      for (const s of spots.slice(0, 12)) {
        // Skip spots within 3 of any settlement: the engine refuses those and a nearby town would be mistaken for the new one.
        if (Players.getAliveMajorIds().some((pid) => Players.get(pid).Cities.getCities().some((c) => GameplayMap.getPlotDistance(c.location.x, c.location.y, s.x, s.y) <= 3))) continue;
        req("CREATE_ELEMENT", { Kind: "CITY", Location: { x: s.x, y: s.y }, Owner: owner });
        await sleep(2200);
        const near = Players.get(owner).Cities.getCities().find((c) => !had.has(c.id.id));
        if (near) return { x: near.location.x, y: near.location.y, owner: near.owner, name: name(near) };
      }
      return { err: "no plot took a town" };
    },
    // A National Park on a settlement's own plots, placed as National Parks places one (a rural district, then the
    // improvement): the founding tile and `land` more tiles of the 16-tile land marker. Reads back the mod's relief.
    async park({ x, y, land = 3 }) {
      const c = cityAt(x, y);
      if (!c) return { err: `no city at ${x},${y}` };
      const plots = [];
      for (const i of c.getPurchasedPlots()) { const l = GameplayMap.getLocationFromIndex(i); if (!(l.x === x && l.y === y)) plots.push({ x: l.x, y: l.y }); }
      const free = plots.filter((p) => !GameplayMap.isWater(p.x, p.y) && !(MapConstructibles.getConstructibles(p.x, p.y) || []).length && !safe(() => Districts.getAtLocation(p), null));
      const placed = [];
      const types = ["IMPROVEMENT_NATIONAL_PARK", ...Array(land).fill("IMPROVEMENT_NATIONAL_PARK_LAND_16")];
      for (let i = 0; i < types.length && i < free.length; i++) {
        const p = free[i];
        req("CREATE_ELEMENT", { Kind: "DISTRICT", Type: "DISTRICT_RURAL", Location: p, Parent: c.id, Owner: c.owner });
        await sleep(800);
        req("CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: types[i], Location: p, Owner: c.owner });
        await sleep(1200);
        const got = (MapConstructibles.getConstructibles(p.x, p.y) || []).map((id) => typeName(Constructibles.getByComponentID(id)?.type));
        placed.push({ at: [p.x, p.y], asked: types[i], got });
      }
      await sleep(1500);
      return { placed, relief: PT().relief(`${x},${y}`), city: cityReport(x, y) };
    },
    // Another mod's saved key, parsed: key({ name: "EmigrationQuarters_v1" }).
    async key({ name }) {
      const raw = Configuration.getGame().getValue(name);
      return { length: raw ? String(raw).length : 0, value: safe(() => JSON.parse(raw), raw) };
    },
    // A rising now, through the mod's own pipeline: rise({ key: "x,y", cause, I, from }).
    async rise({ key, cause = "misery", I = 0.6, from }) {
      const n0 = events.length;
      const t0 = Date.now();
      const outcome = await PT().rise(key, cause, I, from);
      return { outcome, ms: Date.now() - t0, placements: PT().placements(), state: summary(),
        events: events.slice(n0).filter((e) => e.n === "UnitAddedToMap" || e.n === "NotificationAdded" || e.n === "ConstructibleAddedToMap" || e.n === "ConstructibleRemovedFromMap") };
    },
    // Run the pass now (as the turn start would).
    async pass() { const t0 = Date.now(); const r = await PT().runNow(); return { r, ms: Date.now() - t0, state: summary() }; },
    // Relations between a and b: level delta through the engine's writable call (W), or war (local player only).
    async relation({ a, b, delta, war }) {
      if (typeof delta === "number") safe(() => Players.get(a).Diplomacy.changeRelationshipLevel(b, delta));
      let can = null;
      if (war) {
        const args = { Player1: local(), Player2: b, Type: DiplomacyActionTypes.DIPLOMACY_ACTION_DECLARE_WAR };
        can = safe(() => JSON.parse(JSON.stringify(Game.PlayerOperations.canStart(local(), PlayerOperationTypes.DECLARE_WAR, args, false))));
        Game.PlayerOperations.sendRequest(local(), PlayerOperationTypes.DECLARE_WAR, args);
      }
      await sleep(2000);
      const d = Players.get(a).Diplomacy;
      return { level: safe(() => d.getRelationshipLevel(b)), name: safe(() => d.getRelationshipLevelName(b)), war: safe(() => d.isAtWarWith(b)), ally: safe(() => d.hasAllied(b)), can };
    },
    // What stands around the cities at `at`: [[x, y], ...], the independents' units within 6 tiles, and the state.
    async watch({ at }) {
      return { turn: Game.turn, cities: at.map(([x, y]) => ({ x, y, ...cityReport(x, y),
        near: Players.getAliveIndependentIds().flatMap((ip) => unitsOf(ip).filter((u) => GameplayMap.getPlotDistance(x, y, u.x, u.y) <= 6).map((u) => ({ ip, ...u, d: GameplayMap.getPlotDistance(x, y, u.x, u.y) }))) })),
        independents: Players.getAliveIndependentIds().map(player), placements: PT()?.placements(), state: summary(),
        combat: events.filter((e) => e.n === "CombatResult" || e.n === "DistrictDamageChanged").slice(-10) };
    },
    async events({ n = 60, only } = {}) { return events.filter((e) => !only || only.includes(e.n)).slice(-n); },
    async state() { return PT()?.state(); },
    // Make the mod's rolls deterministic: setRandom({ seed }), a fixed { value }, or Math.random again with { seed: null }.
    // A suzerain for an independent (it becomes a city-state): suzerain({ ip, pid }).
    async suzerain({ ip, pid }) {
      safe(() => Players.get(ip).Influence.setSuzerain(pid));
      await sleep(1500);
      return player(ip);
    },
    async setRandom({ seed, value }) {
      if (typeof value === "number") { PT().setRandom(() => value); return `fixed ${value}`; }
      if (seed == null) { PT().setRandom(null); return "random"; }
      // mulberry32: every seed's first value is well spread, unlike a plain LCG's.
      let s = seed >>> 0;
      PT().setRandom(() => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; });
      return `seeded ${seed}`;
    },
    async reload() { UI.reloadUI(); return "reloading"; },
    // Slot or unslot one of the local player's policy cards: card({ type: "TRADITION_EMIG_SUSPECT_EXPLORATION" }).
    // Unlocks it first when the Culture surface offers unlockTradition; reports what the engine says at each step.
    async card({ type, on = true }) {
      const row = safe(() => GameInfo.Traditions.lookup(type), null);
      if (!row || typeof row !== "object") return { type, known: false };
      const culture = Players.get(local()).Culture;
      const h = Database.makeHash(type);
      const unlock = safe(() => (typeof culture.unlockTradition === "function" ? (culture.unlockTradition(h), "called") : "absent"));
      await sleep(400);
      const args = { TraditionType: row.$index, Action: on ? PlayerOperationParameters.Activate : PlayerOperationParameters.Deactivate };
      const can = safe(() => Game.PlayerOperations.canStart(local(), PlayerOperationTypes.CHANGE_TRADITION, args, false));
      if (can && can.Success) safe(() => Game.PlayerOperations.sendRequest(local(), PlayerOperationTypes.CHANGE_TRADITION, args));
      await sleep(1500);
      return { type, unlock, unlocked: safe(() => culture.getUnlockedTraditions().includes(h)), can,
        active: safe(() => culture.isTraditionActive(h)), slots: safe(() => culture.getNumCultureSlots()) };
    },
    // Put units for the local player on free land next to (x, y): a garrison for the band-size check.
    async garrison({ x, y, type = "UNIT_WARRIOR", n = 1 }) {
      const before = unitsOf(local()).length;
      const placed = [];
      for (let dy = -1; dy <= 1 && placed.length < n; dy++) for (let dx = -1; dx <= 1 && placed.length < n; dx++) {
        if (dx === 0 && dy === 0) continue;
        const px = x + dx, py = y + dy;
        if (GameplayMap.getPlotDistance(x, y, px, py) !== 1 || GameplayMap.isWater(px, py) || (MapUnits.getUnits(px, py) || []).length) continue;
        req("CREATE_ELEMENT", { Kind: "UNIT", Type: type, Location: { x: px, y: py }, Owner: local() });
        await sleep(900);
        if (unitsOf(local()).length > before + placed.length) placed.push([px, py]);
      }
      return { placed };
    },
  };

  const out = (globalThis.PTL && globalThis.PTL.out) || {};
  globalThis.PTL = {
    out, steps, player, cityReport, events,
    start(name, args) {
      out[name] = { running: true };
      steps[name](args || {}).then((r) => { out[name] = { done: true, r }; }, (e) => { out[name] = { done: true, err: String(e && e.stack || e) }; });
      return `started ${name}`;
    },
    read(name) { return JSON.stringify(out[name] ?? null); },
  };
  return "PTL ready";
})();
