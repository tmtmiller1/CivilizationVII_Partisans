# Compatibility

What Partisans reads of other mods and the engine, and what it defines. Each line says whether it was read from code
or watched in the game. Partisans never copies, imports or runs another mod's files, and writes none of their state.

## Reads of other mods' state

| Mod | What is read | How | Status |
| --- | --- | --- | --- |
| Cultural Diffusion | Whether it's in the game | `Configuration.getGame().getValue("CulturalDiffusionState_v2")` non-empty, or `globalThis.culturalDiffusion` | Read from code |
| Cultural Diffusion | Plots with a write pending | The `pending` map inside `CulturalDiffusionState_v2`, keyed `"x,y"`; those plots never take a partisan | Read from code |
| Cultural Diffusion | A settlement changing hands by culture | Only the engine's `CityTransfered` event with `transferType` = `BY_CULTURAL_IDENTITY`; nothing of the mod's own | Watched 2026-10-14 (the event, with the probe marker) |
| Emigration | Recognised enclaves | `EmigrationQuarters_v1`: `data.tiles["x,y"]` with `owner`, `civ`, `originCiv`, `recognized` | Read from code (`ui/emigration-quarter-state.js`); the key is readable from script, watched 2026-10-14 |
| Emigration | A settlement's population by origin | `EmigrationEthnos_v1`: `data.cities["x,y"].byCiv` keyed by player id, `total` | Read from code (`ui/emigration-composition.js`) |
| Emigration | The host's community treatment card | `Players.get(pid).Culture.isTraditionActive(Database.makeHash(type))` for `TRADITION_EMIG_PROTECT_{ANTIQUITY,EXPLORATION,MODERN}` and `TRADITION_EMIG_SUSPECT_*`, each only when `GameInfo.Traditions.lookup(type)` finds it | Watched 2026-10-15 (Antiquity, seed 4242, Emigration's working copy): the suspicion card slotted and `isTraditionActive` read true; tension climbed under Watched Quarters and settled with no card and under Guest Right (`DESIGN.md`, the integration session). A card during a war with the homeland isn't watched yet |
| Cultural Diffusion | Whether its flip notice carries the unrest | `globalThis.culturalDiffusion.tellsPartisanUnrest === true`; then Partisans sends no unrest notice of its own for that flip | Watched 2026-10-15 from Cultural Diffusion's side (Antiquity, seed 4242, the usual set, its `docs/DESIGN.md`): Partisans didn't send a notice of its own, and the "has joined" notice carried its line. The settlement flip is on Cultural Diffusion's local main, not released yet |
| National Parks | Park tiles | The constructible types on a settlement's plots, `IMPROVEMENT_NATIONAL_PARK*` and `IMPROVEMENT_WILDERNESS_AREA*`, through `MapConstructibles` | Read from code (`data/national-parks*.xml`) |
| Mod Commons | A pending-plot registry, if it ever exposes one | `globalThis.ModCommons.pendingPlots` | Read from code; nothing exposes it today |
| Tower Settings Keeper | Carried on board as `ui/settings-keeper.js`, unchanged | | Watched in the other Tower mods |

With a partner absent, its term is zero: no enclave tension without Emigration, no park relief without National
Parks, and culture flips still count unless the "flips from any mod" option is off.

## Engine surfaces

| Surface | Use | Status |
| --- | --- | --- |
| `CREATE_ELEMENT {Kind:"UNIT", Owner: <independent>}` sent as the local player | The band | Watched 2026-10-14 |
| `CREATE_ELEMENT` / `DESTROY_ELEMENT {Kind:"CONSTRUCTIBLE"}` | The muster marker | Watched 2026-10-14 |
| `EFFECT_PLAYER_SPAWN_TRIBE_NEAR` on a leader trait, gated on `REQUIREMENT_PLAYER_HAS_CONSTRUCTIBLE` | The rebel people | Watched 2026-10-14 |
| `Game.IndependentPowers.getIndependentPlayerLevel` / `changeIndependentPlayerLevel(ip, pid, -level)` | A friendly rebel people turned hostile to its civ, any civ | Watched 2026-10-29 |
| `DECLARE_WAR {Player1: local, Player2: <independent>}` | The same for the local player, as the fallback | Watched 2026-10-14 |
| `Game.IndependentPowers.getIndependentRelationship` / `getIndependentHostility` | Hostility reads | Read from the game's UI source (`unit-flags-independent-powers.js`) |
| `Players.get(ip).Influence.hasSuzerain` | A village against a city-state | Watched 2026-10-14 |
| `city.Happiness.netHappinessPerTurn`, `Diplomacy.getRelationshipLevel`, `isAtWarWith`, `hasAllied` | The pressures | Watched (first three), read from code (`hasAllied`) |
| `Game.Notifications.send` with the mod's `NotificationTypes` rows | The notices | Watched in Emigration and Strategic Resources |
| `Controls.decorate("panel-city-details")` | The City Details section | Read from the game's UI source; Emigration's pattern |
| `NotificationModel.manager.registerHandler` for the mod's notification types | A click on a notice moves the camera to the settlement | Watched 2026-10-15: activating the rising notice put the camera's focus exactly where a direct look at the settlement does |
| `Configuration.editGame().setValue("Partisans_v1", json)` | The saved state | Watched in the other Tower mods |

## Globals Partisans defines

| Global | Purpose |
| --- | --- |
| `globalThis.__towerPartisans` | The console surface: `version`, `state()`, `runNow()`, `rise()`, `flip()`, `sweep()`, `setRandom()`, `placements()`, `camps()`, `applySettings()`, `stop()`, and the read API below |
| `localStorage` slice `modSettings["tower-partisans"]` | The options |
| `Partisans_v1` in the game configuration store | The saved state |
| `BUILDING_PARTISANS_MUSTER`, `TRAIT_PARTISANS_<LEADER>`, `TRAIT_PARTISANS_NONE`, `MOD_PARTISANS_MUSTER_<LEADER>`, `MODIFIER_PARTISANS_SPAWN_TRIBE_NEAR`, `NOTIFICATION_PT_*` | Database rows |
| Element id `pt-city-section` | The City Details section |

## The read API other mods use

`globalThis.__towerPartisans`, present only while Partisans is loaded. Check `apiVersion >= 1` before reading.

- `risings()` returns copies of every rising this game, across ages, oldest first, at most 300:
  `{ id, at: "x,y", name, owner, cause: "flip" | "enclave" | "misery", from?, homeland?, policy?, ip, start, end?,
  outcome?: "dispersed" | "time" | "burned" | "age", age? }`. `start` and `end` are `Game.turn`, which restarts every
  age, and `age` is the AgeType the rising began in; a running rising has no `end`. `from` is the civ that lost the
  settlement by culture, `homeland` the enclave's homeland, `policy` the host's treatment card (a TraditionType) when
  one was in force. Demographics draws these on its conflict timeline and in its Chronicle; Emigration uses open ones
  to name the uprising refugees flee and a burned one for its chronicle line.
- `flipOutlook("x,y")` returns `null`, or `{ turns, from, owner, line }` for a settlement that just changed hands by
  culture and whose people are arming. `line` is ready to show: "Not everyone wanted this. Partisans are gathering
  near Mutsu." It's meant for Cultural Diffusion's "has joined" notice, read a moment after the `CityTransfered`
  event, so the player gets one notice for the flip and its unrest. Cultural Diffusion says it does this by setting
  `globalThis.culturalDiffusion.tellsPartisanUnrest = true`.

## Known interactions

- `tower-bench check` lists `globalThis.SettingsKeeper` as a global this mod shares with every other Tower mod that
  carries the Tower Settings Keeper file. That is the keeper's own protocol: the first copy to run installs itself and
  every later copy finds it and does nothing, the newest build winning. Pre-flight on 2026-10-15 read CLEAN otherwise.

- National Parks' sweep removes park land markers that aren't part of a park it registered (watched 2026-10-15),
  so the relief Partisans reads is the relief of real parks. A park National Parks founds or grows is read at once.
- A rising's units are ordinary independent units. Every other mod that reads or counts independents sees them.
- Cultural Diffusion's tile flips exclude plots with units on them; a band standing on a tile is treated like any
  other unit.
- A settlement a band takes is removed by the game, as any settlement an independent captures. Other mods' records
  keyed by that settlement go stale the way they would after any capture.
