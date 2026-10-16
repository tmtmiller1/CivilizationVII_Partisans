# Partisans: design

Status: built 2026-10-15 from the spec of 2026-10-14 (`mod_ideas_tested/partisans/SPEC.md` in the workspace), whose
engine facts come from probes run that day on game version 1.5.0. This page is the spec's successor: the rules as
built, the engine facts they rest on, the decisions the build made where the spec left room, and the acceptance
checks with what was watched. Section 12 is the record of the checks: six lab games on 2026-10-15 (Antiquity,
Exploration twice and Modern with every other mod off; Exploration twice with the usual Tower set; a short Antiquity
through the age transition). Blocked for the lab: a flip between allies and the alliance read (A3, V1: no script can
form an alliance) and a network game (A17: the lab only starts single-player games); the table says why. Still open:
war declared during the brewing delay (unmet civs can't declare war; the same re-check was watched with relations
worsened instead), a friendly rebel people against an AI civ (every rebel people against an AI spawned hostile), an
Emigration enclave rising (no enclave formed in 21 turns), and the bench's resident-memory reading with one
replicate.

Marks: **W** watched in game (with the date), **C** read from code or data, **V** verified during the build.

## 1. What the player gets

When a settlement's people have a reason to rise, armed partisans appear in the countryside around it and fight
under the game's own independent-power AI. They raid, besiege and, if nobody answers them, take the settlement,
which the game then removes from the map (W 2026-10-14). Putting them down is ordinary combat.

Three things start a rising: a settlement won over by a rival's culture (Cultural Diffusion), a recognised enclave
mistreated by its host (Emigration), and long misery (any game). A National Park calms its settlement's countryside.
The same rules run for every major civ, AI included; city-states, independents and capitals never rise.

## 2. The engine facts

| Need | How | Mark |
| --- | --- | --- |
| Units owned by an independent | `CREATE_ELEMENT {Kind:"UNIT", Type, Location, Owner: <independent>}`, sent as the local player | W 2026-10-14 |
| Where they land | Free land; some plots refuse for reasons not pinned. Place, re-read the owner's unit list, try the next plot | W 2026-10-14 |
| A rebel people per civ | `EFFECT_PLAYER_SPAWN_TRIBE_NEAR` (`TribeType TRIBE_CRISIS`, `NumCities 1`) on a leader-trait modifier gated by `REQUIREMENT_PLAYER_HAS_CONSTRUCTIBLE`: a marker building in one of the civ's settlements spawns one new independent at the next turn roll, camped in an encampment 3 to 6 tiles from one of its settlements, with a starting band | W 2026-10-14 |
| One rebel people per civ per age; markers left in place fire again at the next age | | W 2026-10-14 |
| Rebel camps by script | `CREATE_ELEMENT` of an encampment lands nowhere | W 2026-10-14 |
| Hostility | Set per independent, the same toward every major, not predictable. Read through `Game.IndependentPowers.getIndependentRelationship` against `IndependentRelationship.HOSTILE`, with the hostility name as the fallback | W (hostility), C (the enum, from the game's unit-flag source) |
| Friendly independents' units loiter and never attack | | W 2026-10-14 |
| Making one hostile | `DECLARE_WAR {Player1: local, Player2: ip}`; the local player only | W 2026-10-14 |
| A settlement taken by independents is removed from the map | | W 2026-10-14 |
| Suzerainty | `Players.get(ip).Influence.hasSuzerain`; a suzerain makes a village a city-state | W 2026-10-14 |
| Happiness, relationship, war | `city.Happiness.netHappinessPerTurn`, `Diplomacy.getRelationshipLevel`, `isAtWarWith` | W 2026-10-14 |
| Alliance | `Diplomacy.hasAllied` | C, V1 below |
| Culture flips | `CityTransfered {fromPlayer, transferType, cityID}` for every transfer, AI-to-AI included; `transferType` matches `CityTransferTypes.BY_CULTURAL_IDENTITY` | W 2026-10-14 |
| Emigration's state | `EmigrationQuarters_v1`, `EmigrationEthnos_v1` readable from script | W 2026-10-14 (readable), C (fields), V2 below |
| National Parks | Park tiles are constructibles, readable per plot through `MapConstructibles` | C |
| Unit candidates | `Units` rows by `Domain`, `CoreClass`, `TraitType` and the combat tags | W 2026-10-14 (Exploration and Modern lists) |
| Game speed | `GameSpeeds.CostMultiplier` through `Configuration.getGame().gameSpeedType`; 100 at Standard, 150 Epic, 300 Marathon, 67 Quick, 50 Online | C (the compiled database), V3 below |
| Persistence | `Configuration.editGame().setValue` survives save, load and the age transition | W (Canals, Cultural Diffusion) |
| The crash to avoid | The city-level army spawn effect crashes the game as the marker lands | W 2026-10-14; `tests/pt-data.test.mjs` fails if it appears anywhere |

## 3. The model

The numbers live in `ui/pt-config.js`; the rules are pure functions in `ui/pt-model.js`, each pinned by
`tests/pt-model.test.mjs`. Every settlement of every alive major keeps three numbers in the saved state, keyed by its
centre plot `"x,y"`, so a settlement keeps its record after changing hands.

### 3.1 Flip unrest

On `CityTransfered` with the culture transfer type, with `L` the civ that lost the settlement and `R` the one that
gained it, both alive majors:

```
lvl  = the worse of L's level toward R and R's toward L;  war, ally = either side reads it
p    = ally ? 0 : war ? 0.35 : lvl >= 30 ? 0 : lvl <= -60 ? 0.15 : lvl <= -30 ? 0.08 : 0.03
I   = clamp(0.4 + 0.4 * max(0, -lvl) / 100 + (war ? 0.2 : 0), 0, 1)
```

Most people who come over by culture wanted to, so a rising after a flip is rare and needs bad blood between the two
civs: allies and friends never, neutral 0.03, unfriendly 0.08, hostile 0.15, at war 0.35. One roll at the flip; on a
hit a rising is scheduled 1 to 3 turns out and the local player is told at once when the settlement is or was theirs.
On the due turn relations are re-read: if they're worse, a second roll at the higher chance decides whether the rising
holds (a miss settles it); if the two civs are allies now, the people stand down. Cultural Diffusion applies the
flip's diplomatic penalty; Partisans adds none. With Cultural Diffusion absent, culture transfers from any mod still
count unless the "flips from any mod" option is off.

### 3.2 Enclave tension

For a settlement holding a recognised enclave (an `EmigrationQuarters_v1` record whose `owner` is the settlement's
owner and whose `recognized` isn't false), with `H` the host and `O` the homeland (the record's `civ` when it's an
alive major, else the alive major playing the record's `originCiv`, else the largest foreign share in the
settlement's `EmigrationEthnos_v1` entry):

`card` is the host's community treatment card, read from Emigration's Traditions by name
(`TRADITION_EMIG_PROTECT_*`, `TRADITION_EMIG_SUSPECT_*`) with `Culture.isTraditionActive`; both slotted cancel to none,
and a card the database doesn't know reads as not slotted.

```
card protect:  dT = -1                                         (settles, war or not)
card suspect:  dT = war ? 3 : lvl <= -60 ? 2 : lvl <= -30 ? 1 : -1
no card:       dT = war ? 1 : -1, and T never climbs past 14   (chance tops out at 0.10)
T  = clamp(T + dT, 0, 30)
chance per turn = (T - 10) / 40 from T >= 10   (0 at 10, 0.1 at 14, 0.5 at 30)
on a hit: I = clamp(0.3 + T / 60, 0.3, 0.8), T = 0; the request and the rising's chapter carry the card
```

The rule is the owner's call made on two things: the treatment card and how the host stands with the homeland. A
war with the homeland is the trigger; the card sets how hard it bites. A card-free war wears on a community only so
far, so most wars pass without an enclave rising; a suspicion card is a choice with a real risk. Intensity comes from
how long the treatment went on, never from the community's size or share of the settlement. The notice's reason
names the host's card ("under Oaths of Loyalty, the families in Mutsu with roots in Greece have been treated as
suspects") or the war, and the title names the place, never the community. A settlement without an enclave loses 1
tension a turn. Tone: an enclave rising is the host's mistreatment of a community, never the community's disloyalty
(Emigration's guardrail); nothing penalises the homeland. The cards themselves, and what they do without Partisans,
belong to Emigration.

### 3.3 Long misery

```
h_eff = netHappinessPerTurn + parkRelief
M += 1 when h_eff <= -10;  M = max(0, M - 2) when h_eff > -5;  otherwise M holds
need = round(20 * speedScale)
chance per turn = min(0.5, 0.10 + 0.02 * (M - need)) from M >= need
on a hit: I = clamp(-h_eff / 30, 0.3, 1), M = floor(need / 2)
```

### 3.4 Park relief

With the option on, in ages that have parks, the Happiness a settlement's park tiles pay (founding tile 4, land 1,
land at 8 tiles 1, at 16 and 24 tiles 2) is read from the constructible types on its plots and added to `h_eff`.
Wilderness Areas pay Influence and give nothing. Partisans never place a unit on a park or Wilderness Area tile.

## 4. Gates

Checked in order when a rising is about to start, each refusal logged with its reason: not a network game; the
owner an alive major; not a capital; no rising active there; not cooling (20 turns after a rising ends); fewer than
2 active against the owner and 6 on the map; the cause's option on.

## 5. Who fights

1. The owner's rebel people this age, if it's alive and reads hostile.
2. If the owner is the local player and the rebel people reads friendly: declare war on it, re-read, use it.
3. Else the nearest alive independent village (no suzerain) hostile to the owner with a camp within 12 tiles.
4. Else, if the owner hasn't mustered this age: place the muster marker in the settlement, remember the alive
   independents, and come back next turn. At that pass the new encampment people is the owner's rebels (two civs
   mustering the same turn each get the people nearest their settlements); the marker is removed the same turn; if
   nothing appeared, the rising fizzles and the owner counts as mustered.
5. Else the rising fizzles ("no hostile people") and the settlement cools.

## 6. The band

```
size  = clamp(1 + round(3 * I) + floor(population / 8), 1, bandCap[age])   caps: Antiquity 3, Exploration 3, Modern 2
mix   = two melee to one ranged, melee first; skirmish only where the age has no ranged candidate
tier  = age progress < 0.40 ? 1 : < 0.75 ? 2 : 3, or the highest the age has below that
```

Candidates are read from the loaded database once per boot: land, military, no civ trait, tagged melee, ranged or
skirmish, grouped by tier. Placement tries ring 3, then 4, then 2, unowned plots first, then the settlement's own,
then any; never water, impassable, a unit, a settlement, an urban district, a wonder, a park tile or a plot Cultural
Diffusion has a write pending on. Each unit is sent, the owner's unit list re-read after 900 ms, and the next plot
tried on a refusal; at most 16 attempts, then one more read for a late unit. A band that lands nothing fizzles.
Within a ring the plots go in map order, lowest row first, so the band lands on whichever side of the settlement
has the lower rows; nothing in the order looks at where the owner's capital is (see section 11).

After a flip rising lands, independent villages within 6 tiles that are hostile to the owner and aren't the band's
owner may join: chance `p * (1 - d / 7)` each, at most two, sending 2 units within 3 tiles and 1 beyond, placed on
the ring-2 and ring-3 plots nearest their camp.

## 7. The muster marker

`data/partisans-muster.sql`, written by `scripts/gen-data.mjs` and pinned by `tests/pt-data.test.mjs`: a trait per
major leader from the `Leaders` table (so DLC leaders are covered), one hidden building `BUILDING_PARTISANS_MUSTER`
(cost 1, no population, existing district only, a trait no civ has, never offered), and per leader a modifier
`COLLECTION_OWNER` / `EFFECT_PLAYER_SPAWN_TRIBE_NEAR` (`TRIBE_CRISIS`, `NumCities 1`, `RunOnce 0`, `Permanent 1`)
gated on `REQUIREMENT_PLAYER_HAS_CONSTRUCTIBLE`. A sweep at boot and at each age start removes any stray marker.

## 8. What the player sees

Notifications in the game's train, one type per kind: Unrest (a flip rising brewing), the rising itself, Fighters
join, Rising over, Settlement burned. One notification tells a rising, the rebels' arrival included. Its title names
the place: "Partisan uprising near Mutsu", or "Partisan Greek loyalists near Mutsu" when the settlement was taken
from Greece by culture (an enclave rising stays an uprising: it is about how the community is treated). Its one line
says why: the misery turns and the settlement's Happiness, the flip and how the two civs stand, or the enclave and
how its host and homeland stand. A click on any of the mod's notifications moves the camera to the settlement,
through a handler registered on the train's model for the mod's types (the engine ignores a location given from
script). The local player hears about settlements that are or were theirs; AI-versus-AI risings only reach the log.
A Partisans section in the City Details panel's growth tab lists the rising's state, the misery turns of the need,
and the enclave tension. (A banner pill was built and dropped on 2026-10-15: under the 1.5.0 banner it pushed the
settlement's name up and crowded it.)

## 9. State

One key, `Partisans_v1`: `{ v, age, cities: { "x,y": { owner, M, T, cooling, risings } }, rebels: { pid: { ip,
age, mustered } }, pending: [ { at, owner, cause, I, dueTurn, stage, from?, pFlip? } ], musterSnapshot?, log }`.
Written once per pass (and again after the risings it starts finish), read at boot. When the saved age differs from
the game's, rebels, pending and risings clear, M and T halve, cooling clears. `Game.turn` restarts each age, and so
do the turns stored.

## 10. Decisions the build made

- **Flip odds, the owner's call (2026-10-15)**: most people who come over by culture wanted to, so a flip rising is
  rare and rests on how the two civs get on, read from both sides. This replaces the spec's 0.25 neutral / 0.90 war
  table (section 3.1).
- **Enclave risings, the owner's call (2026-10-15)**: the host's treatment card and its standing with the homeland
  decide it, with a war with the homeland as the trigger; the community's share of the settlement plays no part, and
  Emigration's `contested` flag is no longer read. The cards live in Emigration (section 3.2).
- **One notice for a flip and its unrest**: when Cultural Diffusion sets `tellsPartisanUnrest`, its "has joined"
  notice carries Partisans' line through `flipOutlook()` and Partisans sends no unrest notice for that flip.
- **A whole-game record of risings** (`history` in `Partisans_v1`, at most 300, kept across ages) feeds the
  `risings()` read API, so Demographics and Emigration can tell the story after the units are gone.
- **The due-turn re-check** (spec 3.1, A2b): a second roll only when relations got worse, at the higher chance; an
  alliance calls the rising off; unchanged or better relations hold the rising without a roll, so a neutral flip's
  rate stays the 0.03 that A1 checks.
- **Camps** are found by one scan of the map's plots owned by independents, cached per turn and only run when a
  rising or a muster needs it, so the bookkeeping pass stays cheap.
- **A friendly rebel people against an AI civ** falls through to a hostile neighbour or a fizzle; the mod never
  declares war on behalf of an AI (the engine refuses requests sent as another player).
- **The misery counter of a settlement that leaves the map** is dropped with its record; a settlement that changes
  hands keeps its counters under its new owner.
- **Each placed unit is checked on its plot** (watched 2026-10-15): for a village that hadn't met the settlement's
  owner, `CREATE_ELEMENT` created the units next to the village's own camp, eleven tiles from the settlement, and the
  owner's unit list alone read them as landed. A unit that comes up anywhere but the plot asked for is removed with
  `DESTROY_ELEMENT` and the plot counts as refused.
- **A late unit still counts** (block 1 L2, 2026-10-16): Heijo's band landed "2 of 3 units for 6 (rebel), 14
  refusal(s)" while three turns rolled during its 17-second placement (the pass for turn 21 finished at turn 24).
  Every other landing in the watch logs took 0 refusals with no turn rolling during it, except overnight L5's Asuka
  landing (6 refusals, one turn rolled). The read was strict: a unit read anywhere but the plot just asked for was
  removed, so one the engine created a read late, on the plot asked for one attempt earlier, was destroyed as a
  stray. A new unit on any plot the band asked for now counts; one more read after the attempts picks up a last late
  unit, and any beyond the band's size is removed. Only a unit of a type the band asked for is removed as a stray; the
  independent's own units (one it trains on its turn) are left alone. Pinned by two tests in `pt-pass.test.mjs` (a
  world that answers a read late; a scout of the independent's own), both failing on the old read. Not yet watched
  in a game.
- **Capitals don't roll.** A capital's misery and tension counters are kept for the panel, but the per-turn roll is
  skipped: the rising gate would refuse it anyway, and a hit would only halve the counter for nothing (watched at Ise
  once it had become the capital).
- **The neighbour rolls are logged** ("neighbours of x,y: 11@4 hostile ...; joining: 11x1"), so a miss can be told
  from a village out of range.
- **An empty city read keeps the records.** Behind the age-start screen `Cities.getCities()` returned nothing for
  every player; the pass only drops a record whose settlement is gone when it read at least one settlement.
- **A refused brewing rising is dropped**, not re-queued: the Unrest notice went out, the gate (a cap, a capital) said
  no, and the settlement cools.

## 11. Known limits

- A band's units are the independent's: the mod can't move them, and the independent AI decides when they attack.
  Ordinary independents' units loitered by a town for three turns in the probes; the rebel people's attacked.
- Rebels can't hold a settlement; one they take is removed by the game.
- **A band can take the owner's capital.** "Capitals never rise" is the rising gate: a rising never starts at a
  capital. Once a band has landed it goes wherever the independent AI sends it, and a nearby capital with nobody in
  it is as open as any other settlement. Block 1 L2 (2026-10-16, Antiquity seed 4242, fast setup, Settler,
  usual set): Mutsu's 3-unit band from turn 2 took the ungarrisoned population-1 capital Heian-Kyo, about 4 tiles
  away, at turn 7, and the game removed it; A9's earlier run saw the crisis tribe's own band take Heian-Kyo too.
  The Mutsu rising was forced at turn 1 by the probe; a natural misery rising needs 20 turns at -10, by which time a
  capital usually has a garrison. **The owner's call (2026-10-16): option 1, words only.** The README, the
  Civilopedia's "A Rising" page (every language), the Workshop text and the changelog now say the band lands around
  the settlement that rose, city or town, and can go on to attack other settlements nearby, the capital included.
  Options 2 to 5 (landing plots ordered away from the capital, plots near it skipped, a grace window while it's
  empty, a warning in the notice) weren't built; they're in `tools/plans/watch2-block1-parallel-fix-notes.md`,
  section 5.
- **The muster needs a free independent slot** (watched 2026-10-15, `engine-closed.md`). The crisis spawn fired at
  Antiquity turn 6 and at Exploration turn 1, and spawned nothing in Exploration from turn 4 on, with or without
  other mods, once the age's independents (two per major civ) were all on the map. So in the Exploration and Modern
  Ages a civ that has no rebel people yet gets one only if a rising happens before the independents spawn, which is
  the first turn or two; later, a rising against it uses a hostile independent village within 12 tiles, or fizzles
  with "muster spawned nothing" and the civ counts as mustered for the age. Antiquity's pool had room at turn 6.
  Whether an independent a civ disperses frees its slot wasn't watched.
- Network games: no writes. The City Details section shows what an earlier single-player session saved.
- The alliance read and Emigration's record fields were read from code; V1 and V2 below say what was watched.

## 12. Acceptance checks

Each check is run in a seeded lab game (`tower-bench lab start --seed 4242`), every other mod off, then again with
the usual set. The table records what was watched; a check that couldn't be watched stays open and says why. The
vanilla Antiquity session: 2026-10-15, game 1.5.0, seed 4242, six majors, turns 1 to 41, with the throwaway probe mod
(`devtools/probe-mod`) for culture flips and unhappiness. Zoom Tilt Rotate registered itself at launch and was on;
it only touches the camera. Settlements were founded by script (the lab game starts with a settler and no city).

| # | Check | Vanilla (Antiquity, 2026-10-15) | With mods |
| --- | --- | --- | --- |
| A1 | Neutral flip, 400 seeded rolls, rate 0.01 to 0.06 | 400 seeded rolls through the mod's own `flipChance` (mulberry32 seeds 1 to 400): 15 at level 0 (0.038), 37 at -30 (0.093), 65 at -60 (0.163), 141 at war (0.353), none at +40. Earlier odds (0.25 neutral) were watched in game at level 3, chance 0.225 | Watched 2026-10-15 (Exploration, seed 4242, usual mods): the mod's flip roll read 0.03 at level 0 and 0.15 at -70 |
| A2 | Flip between hostile civs: brews, notice, band 3 tiles out 1 to 3 turns later | Thái Bình flipped from Đại Việt (level -60): chance 0.75 under the spec's old odds table (today's table gives 0.15 at that level), hit, Unrest notice at once, due in 2 turns; at the due turn 3 of 3 units landed on ring 3, 0 refusals, Rising notice | Naju (level -70): chance 0.83 under the old table (0.15 today), notice, 3 of 3 on ring 3 next turn, 0 refusals. Today's table was watched in the integration session: 0.03 at level 0, 0.15 at -70 |
| A2b | War during the brewing delay: the due-turn re-roll uses the war chance | War couldn't be declared: the civs hadn't met ("You have not met the Diplomatic Action target Leader"), and `Diplomacy.forceDeclareWar` did nothing. The same code path was watched with relations worsened instead: Hà Tĩnh flipped at level 3, relations then set to -57; the pass logged "relations worse (chance 0.72 over 0.23), re-roll holds" and the band landed. Those two numbers are the spec's old odds table; today's gives 0.08 over 0.03 for the same levels, through the same re-roll. The war chance itself (0.35, `ui/pt-config.js`) is pinned by the unit tests. Open for a game where the civs have met | Not repeated |
| A3 | Flip between allies: no rising | Blocked: an alliance needs two civs that met in play and an AI that agrees to it. The engine refuses a request sent as another player (section 10), so a script can't make an AI propose or accept one, and a meeting made by script early in a lab game doesn't give two civs a relationship (`engine-closed.md`). It needs a long natural game where two civs ally, or the player allying an AI by hand. The chance 0 for allies is pinned by the unit tests (V1 below) | Blocked, as vanilla |
| A4 | First rising with no rebel people: marker, one new encampment people next turn, marker gone, band placed (needs a free independent slot, section 11) | Antiquity turn 6, Dazaifu (61,16), with the neighbour range set to 0 for this one rising: "muster marker placed", `BUILDING_PARTISANS_MUSTER` read in the city; at the next turn roll a new independent (player 24) appeared camped in an encampment at (65,17), 4 tiles from Dazaifu; "rebel people 24 belongs to player 0"; marker gone from the city; 3 of 3 units on ring 3, 0 refusals; "Rebels gather near Dazaifu" and the Rising notice | Exploration turn 6 and 19: the marker stood, nothing spawned (the pool was full, as in vanilla at turn 4); Modern vanilla turn 1 fired |
| A5 | Rebel people friendly, target the local player: war declared, reads hostile, attacks | Watched in the vanilla Exploration session (below): rebel people 6 read friendly, the mod declared war on it, it then read hostile, "The rebels near Heijo have declared themselves against you" went out and 3 of 3 units landed on ring 3. In this Antiquity session the rebel people spawned hostile, so the branch didn't run here | Not run. Seed 4242 in Exploration gave a friendly rebel people in vanilla; the same start with the usual set is the check |
| A6 | Rebel people friendly, target an AI: a hostile neighbour or a logged fizzle | Open: every rebel people against an AI civ spawned hostile. Against an AI the mod never declares war (section 10), so the check is a watch of the hand-off to a hostile neighbour or the logged fizzle. The neighbour step itself was watched (Heijo: village 21 at 11 tiles took the band, "The Teouma people have taken the rebels' side") | |
| A7 | Unsuzerained village 4 tiles from a flipped settlement, hostile to the new owner: its units appear between the two | Spártā flipped to us 4 tiles from village 11: "neighbours of 56,27: 21@4 hostile, 11@4 hostile; joining: 21x1, 11x1"; village 11's warrior landed at (57,29), between its camp (58,31) and the town; village 21's at (58,24), toward its camp | Naju: village 16 at 4 tiles took the band itself (the neighbour step); village 14 at 4 tiles was friendly and sent nothing |
| A8 | The same village with a suzerain: nothing from it | Village 18 given Greece as suzerain (`setSuzerain`): it read `isMinor`, no longer independent. Hà Tĩnh flipped 4 tiles from it: "neighbours of 65,21: 24@4 hostile; joining: none"; nothing from 18 | Not repeated |
| A8b | What joined neighbours' units do over 10 turns | Village 11's units besieged Spártā (district damage 21, 51, 76, 100 over turns 12 to 14) and took it at turn 15; the game removed it ("Spártā was burned by partisans"). Village 21's units hovered 3 to 6 tiles out. Earlier, village 21's band placed at Heijo (the neighbour step) moved about for two turns, then the rebel people's band from Dazaifu took Heijo at turn 8 | Village 16's 3-unit band took the ungarrisoned population-1 Naju two turns after landing |
| A9 | -10 or worse for 20 turns: chance starts at 0.10 and grows; rises within 20 more turns | Ise under the -15 marker: M climbed 1 a turn, reached 20 at turn 25 while cooling from an earlier rising, rolled from turn 26: 0.12, 0.14, 0.16, 0.18, 0.20, 0.22, 0.24, then "0.26, rises" at turn 33 (8 rolls). The rising was then refused as "capital": the rebels had taken the undefended Heian-Kyo and Ise had become the capital. The pass now skips the roll for a capital (section 10). The band after a misery hit was watched through the same pipeline at Dazaifu and Hitachi | The counter climbed 1 a turn on both towns under the -25 marker (the park run); the roll wasn't reached in 6 turns |
| A10 | Exploration settlement with a 16-tile National Park: relief counted | needs National Parks | Watched (second with-mods run below): relief 8 on a six-tile park; the park town's counter held at 2 while the control climbed 3, 4, 5 |
| A11 | Emigration enclave, host at war with the homeland: tension 3 a turn, a rising within about 8 turns, mistreatment text | needs Emigration | Open: no enclave formed in 21 turns of the with-mods game, so no tension could be watched; the reader's record shape is V2 |
| A12 | Pop-3 settlement with one garrison survives a default band 5+ turns, each age | Antiquity: Hitachi (pop 4, one Warrior garrison, at the map's top edge so only two ring-2 plots were open): a 2-unit rebel band sat 2 tiles out for two turns, then dispersed by turn 16 without touching the town. Dazaifu (pop 3, one Warrior) fell at turn 12, 5 turns after its 3-unit band landed, but with a second 3-unit band (village 21's, from the burned Heijo) at its walls. Ungarrisoned pop-1 towns fell in 4 to 7 turns. Exploration and Modern: see their sessions below, both pass; `bandCap` unchanged (3, 3, 2) | Not repeated |
| A13 | A rising never starts at a capital (the band, once landed, can still attack one: section 11) | "rising at 65,13 (misery) refused: capital" at turn 5; again at Ise (turn 33) once it had become the capital | Not repeated; the gate is the same code |
| A14 | Age transition with an active rising and a muster | Watched (the short-age session below): cleared at the first pass, no marker in any city, no independent alive at the new age's first turn; the new age's first turn roll couldn't be driven | not run |
| A15 | Save and reload mid-rising: counters, pending and the rebel mapping restore | `UI.reloadUI()` at turn 18 with risings active: cities, rebels, pending and age identical before and after; the boot line read the 7 records back. Three deploy reloads earlier kept the Dazaifu rising (start turn 7) through to its end. A full save-and-load from the main menu wasn't driven from the bench; the steps for it are in `devtools/README.md` | Three deploy reloads in the with-mods games kept the records (boot lines read them back) |
| A16 | 40-turn run, every cause on, AI civs: no crash, the pass under 30 ms | Turns 1 to 41: 40 passes logged, 16 at 0 ms, 21 at 1 ms, 3 at 2 ms of bookkeeping; no script errors in UI.log; no new crash report. The bench's `cost` run: see below | 21 turns with the set on: passes 2 to 7 ms, no script error from any mod |
| A17 | Multiplayer: no writes | Blocked for the bench: `lab start` only starts a single-player Play Now game, and the bench refuses to change a multiplayer one. A LAN game hosted from script did start with `isNetworkMultiplayer` true on 2026-09-24 (`engine-closed.md`), so a person hosting one LAN game and reading the mod's boot line ("in a network game: reads only, no risings") would settle it. The multiplayer gate (`risingGate`) and the boot path that skips the listeners are pinned by the unit tests | Blocked, as vanilla |
| V1 | `Diplomacy.hasAllied` reads true for an alliance | Blocked, as A3: it read false for every pair, since none of them were allies, and a script can't form an alliance | Blocked, as vanilla |
| V2 | Emigration's record fields and the origin-to-player map | | Watched: `EmigrationEthnos_v1` raw `{ cities: { \"x,y\": { owner, byCiv, total, name, seenTurn } }, passTurn }`; `EmigrationQuarters_v1` `{ v, data: { tiles, candidacy, age, count, lastTurn, formed } }`; the `tiles` record fields stay read from code (no enclave formed) |
| V3 | The game speed multiplier column | `GameSpeeds.CostMultiplier`, read from the compiled database 2026-10-15; applied in `speedScale` | |
| V4 | Placement refusals under 25% across A2 to A7, no rising lost to them | After the location check (section 10): 16 attempts, 0 refusals across the Dazaifu, Thái Bình, Spártā, Hà Tĩnh and Hitachi bands. Before it, an unmet village's units came up by its own camp 11 tiles off (8 refusals of 14 attempts at Ise) | |

### The vanilla Exploration session

2026-10-15, seed 4242, Exploration start (every civ begins with a population-19 capital and no independents on the
map at turn 1), turns 1 to 21, the mod and the probe only.

- **A4 again, and A5.** A rising at a new town with the neighbour range at 0: the marker went down, and at the turn
  roll a new independent (player 6) appeared in an encampment at (59,16) with 3 Swordsmen and a Scout. It read
  friendly. The mod declared war on it ("declared war on rebel people 6; it now reads
  LOC_INDEPENDENT_RELATIONSHIP_HOSTILE"), the notice "The rebels near Heijo have declared themselves against you"
  went out, and 3 of 3 units landed on ring 3: two Swordsmen and a Heavy Archer, the age's tier-1 candidates read by
  tag (age progress under 0.40). 0 refusals.
- **A12 in Exploration.** Two runs next to the rebel camp failed in 2 to 3 turns: the camp's own band (3 Swordsmen
  and a Scout at first, 9 units by turn 8, since the crisis tribe respawns) joined the placed band against a
  population-4 and then a population-3 town, each with one Swordsman garrison. The run that answers the check was 12
  tiles from every camp: Hitachi (49,26), population 3, one Swordsman, against the default 3-unit band placed on ring
  3. The town took no damage for six turns (15 to 20); the archer was gone by turn 16, one Swordsman by turn 19; the
  garrison was lost by turn 21 and the town took its first damage (31) that turn. Pass; `bandCap` for Exploration
  stays 3. The real danger to a settlement is the rebel people's camp band when the engine places the camp next to
  it, which the mod doesn't size.
- Placement: 18 attempts, 0 refusals across the three bands.

### The with-mods Exploration session

2026-10-15, seed 4242, Exploration start, turns 1 to 21, with Cultural Diffusion, Emigration, National Parks, Tower
Settings Keeper, Geographic Labels, Numpad Unit Movement, Build Wonders Over Antiquated Buildings, Canals, Dams,
Strategic Resources That Matter, Universal Auto Explore, All Display Options, Demographics and Readable Tooltips
(their `Mods/` copies), plus the probe. Every partner read as present at turn 1 (`globalThis.culturalDiffusion`,
`globalThis.__towerNationalPark`, the two Emigration keys), and no script error from any mod in `UI.log`.

- **V2.** `EmigrationEthnos_v1` is a raw object `{ cities: { "x,y": { owner, byCiv, total, name, seenTurn } },
  passTurn }`, `byCiv` keyed by player id; `EmigrationQuarters_v1` is `{ v: 1, data: { tiles, candidacy, age, count,
  lastTurn, formed } }`. Both shapes are what the reader expects. No enclave formed in 21 turns, so the `tiles`
  record fields (`owner`, `civ`, `originCiv`, `contested`, `recognized`) stay read from Emigration's code.
- **A10, the relief read.** A park placed on Heijo's plots as National Parks places one (a rural district, then the
  improvement): the founding tile and three 16-tile land markers read a relief of 10 (4 + 3 × 2) through the console
  surface, and the park's own Happiness took the town from -8 to +3 with the -15 marker in place. At the next turn
  National Parks' sweep registered the founding tile as a one-tile park and removed the three unregistered land
  markers, so the relief read 4 from then on. Neither town reached the misery line (-8 with one marker; a second
  marker was refused), so the counter's stop wasn't watched; the arithmetic is pinned by the tests. A run with a
  deeper marker and a park grown through National Parks' own `createPark` and `addTile` is still to do.
- **A2 and A7 with mods.** Naju (Goryeo, 4 tiles from village 16, relations -70): chance 0.83, the Unrest notice,
  and next turn 3 of 3 units for village 16 (the neighbour step, within range), 0 refusals; village 14 at 4 tiles was
  friendly and didn't join. Village 16's band took the ungarrisoned population-1 town two turns later.
- **A4 with mods: the muster didn't fire, and vanilla Exploration at turn 4 showed why.** Three musters (two for the
  local player, one for Goryeo on the far side of the map) each
  placed the marker, read back in the city before the turn roll, and spawned nothing at the roll; the alive
  independents stayed players 6 to 17, no encampment appeared. In vanilla the muster fired at Antiquity turn 6 and
  Exploration turn 1. The suspect is the independent pool rather than the mod set: Exploration gives two
  independents per major civ (`INDEPENDENT_NUM_PER_MAJOR` 2), players 6 to 17 for six majors, all alive from turn
  2, and the vanilla Exploration muster took slot 6 before the regular independents spawned. The probes of
  2026-10-14 mustered at the start of each age. Dispersing a village by script didn't land (its camp refused
  `DESTROY_ELEMENT`), so the slot couldn't be freed here; the vanilla Exploration muster at turn 4 (twelve
  independents alive, no other mod) spawned nothing either, so it's the engine's pool, recorded in `engine-closed.md`
  and in section 11.
- Pass bookkeeping with every mod on: 2 to 7 ms a turn across 18 turns.

### The vanilla Modern session

2026-10-15, seed 4242, Modern start, turns 1 to 16, the mod and the probe only.

- **A4 at the age's first turn.** With no independents on the map yet, a rising at a new town put the marker down and
  the turn roll spawned the rebel people (player 6) in an encampment at (59,16) with four Line Infantry and a
  Scout, hostile; the marker was gone and 2 of 2 Line Infantry landed on ring 3 (the Modern cap of 2, tier 1 at age
  progress under 0.40), 0 refusals. The regular independents (players 7 to 17) spawned at the same roll.
- **A12 in Modern.** A first run 4 tiles from the camp was lost in two turns to the camp's own band of eight Line
  Infantry, as in Exploration. The run that answers the check was 16 tiles from the camp: Heijo (64,32), population
  3, one Line Infantry garrison, against the 2-unit band on ring 3. No damage over seven turns (10 to 16); the band
  loitered 3 to 6 tiles out and drifted away, the garrison stood. Pass; `bandCap` for Modern stays 2.
- Placement: 12 attempts, 0 refusals across three bands.
- Across the three ages, what takes a settlement is the rebel people's camp band, which the engine sizes and
  respawns: Antiquity a Warrior and a Scout growing to eleven units by turn 33, Exploration three Swordsmen and a
  Scout growing to nine by turn 8, Modern four Line Infantry and a Scout growing to eight by turn 3. Every
  ungarrisoned town within about four tiles of a camp fell in two to four turns. The mod's own bands of two or three
  units never took a garrisoned town.

### The short-age Antiquity session (the transition)

2026-10-15, seed 4242, Antiquity with the age ending at 20 points (`devtools/probe-short-age`), the mod and the
probes only. At turn 19: two active risings (Heijo since turn 5 and Kamakura since turn 18, both the local
player's rebel people 24), and a muster marker placed in a Đại Việt town. The marker fired at the roll into turn 20,
still in Antiquity: player 25 appeared as Đại Việt's rebel people, the marker was removed and a band of 3 landed (1
refusal). The age ended at turn 20.

- At Exploration turn 1 the mod booted with its 8 records and 0 pending; before its first pass the saved age was
  still Antiquity's. No `BUILDING_PARTISANS_MUSTER` stood in any settlement; the alive independents read empty (every
  Antiquity independent gone, as watched 2026-10-14).
- The first pass logged "new age: rebels, pending and risings cleared; misery and tension halved": the age became
  Exploration's, `rebels` and `pending` empty, 0 risings, cooling 0. Every record was then dropped because the city
  lists read empty behind the age-start screen; the pass now keeps every record when the read is empty (section 10),
  pinned by `tests/pt-pass.test.mjs`.
- The lab can't clear the age-start screen from script (the turn stayed blocked by `NOTIFICATION_AGE_TRANSITION`), so
  the new age's first turn roll wasn't driven; with no marker standing, the engine has nothing to fire (a marker left
  in place is what re-spawns a people, watched 2026-10-14).

### The with-mods Exploration session, second run (the park)

2026-10-15, the same set, the probe with a -25 marker. Two towns under the marker, both at -19 Happiness, climbed
one misery turn a turn (M 2 at turn 3). A park was then built on the first through National Parks' own functions
(`createPark`, `ensureMarkers`, `addTile`): six tiles, the most the settlement's eligible land allowed. The relief
read 8 (4 for the founding tile, 1 per land tile below the 8-tile level), the park's own Happiness took the town from
-24 to -13, so the misery check saw -5. Over the next three turns the park town's counter held at 2 while the
control's went 3, 4, 5. A10 passes on the counter stopping; the 16-tile size wasn't reachable on that land.

### The integration session (2026-10-15, Exploration, seed 4242, usual mods on)

- Flip odds through the mod's own flip path at a fixed miss: level 0 both ways read chance 0.03; after grievances took
  both sides to -70 it read 0.15. War couldn't be set: the two civs hadn't met.
- A forced hit scheduled a brewing rising, and `flipOutlook("56,21")` returned `{ turns: 1, from: 1, owner: 0 }` with
  the line "Not everyone wanted this. Partisans are gathering near Dazaifu." in English from the game's text
  database. The muster then fizzled (no room for another independent people, the known Exploration limit).
- A misery rising at Hakata, borrowed from the hostile village 13, opened chapter 1 in `risings()` with the
  settlement's name; with its three units removed, the next pass closed it as `dispersed`, and the chapter was still
  there after a UI reload.
- Second run, same seed, with the Emigration and Demographics working copies live: Emigration's Exploration cards
  loaded with their names (Charter of Communities, Oaths of Loyalty, Consular Protection), all in the policy slot,
  unlocked on Economics and Diplomatic Service; the Antiquity cards weren't in the Exploration database, as intended.
  A rising at Hitachi carried `age: "AGE_EXPLORATION"`; after one turn Demographics had saved it with its chart turn,
  year and owner, and the War Timeline drew it as a hatched bar from turn 5 to Present. Its name label laid out at
  zero size because it was italic (the UI engine draws italic text at zero height, engine-closed.md); the italic is
  gone from the source, not yet watched.
- Antiquity run, same seed, the three working copies live: after the first civic and a Classical Republic, the
  suspicion card slotted (`CHANGE_TRADITION` accepted, `isTraditionActive` true). With a test enclave record at Heijo
  whose homeland was hostile (-70), Partisans' pass took the tension from 0 to 2 with Watched Quarters slotted; with
  no card it settled from 2 to 1; with Guest Right it settled from 5 to 4. The cards' own yields showed: Guest Right
  took Influence from 10 to 11, Watched Quarters took the capital's Production from 5 to 6. A misery rising mustered
  its own rebel people and landed; the War Timeline then showed "Heijo Uprising" beside its hatched bar (the italic
  fix, watched), and the Chronicle read "Heijo Uprising broke out. Years of unhappiness in Heijo." under a Risings
  filter.
- Every other mod off (Exploration, seed 4242, Partisans alone): the flip roll read 0.03 at neutral, a misery rising
  landed and opened its chapter with its age, the pass ran with Emigration absent, and the game log held no warning
  from the mod.
- Not watched yet: a treatment card during a war with the homeland (the civs hadn't met, so no war could be set),
  Emigration's uprising refugee label, burned-settlement line and stage readout, and Consular Protection's grievances
  (another session corrected their direction and watched the count land).
- Cultural Diffusion's combined notice was watched from its side the same day (its `docs/DESIGN.md`, the Partisans
  row of the acceptance checks; Antiquity, seed 4242, the usual set): with Partisans' roll forced to hit, Partisans
  logged "brewing at 61,15: Cultural Diffusion's flip notice carries the unrest" and didn't send a notice of its own,
  and the one notice read "Argos has joined Heian Japan. / Greece now holds 30 grievances against Heian Japan. / Not
  everyone wanted this. Partisans are gathering near Argos."

### The bench's cost run

`tower-bench cost tower-partisans --turns 20 --seed 4242 --age AGE_ANTIQUITY`, one replicate per arm, 2026-10-15:
wall time per turn 2183 ms with the mod off and 2164 ms on (difference -19 ms, noise ±25 ms, so no cost can be told
apart); JS heap 23.9 against 23.4 MB; error lines the same. The game's resident memory read 1341 MB off and 1559 MB
on, which the bench marks as a real difference; with one replicate it can't be separated from run-to-run spread, and
nothing in the mod holds that much (its state was under 10 KB). Open for a run with more replicates.

### What else the vanilla session showed

- The rebel people's camp keeps respawning its own band: player 24 had 5 units at turn 7 and 11 at turn 33, and its
  roaming band took the ungarrisoned capital Heian-Kyo (population 2) between turns 18 and 33. That is the crisis
  tribe's own behaviour (`TRIBE_CRISIS` respawn), not the mod's placements, and it is what the Civilopedia's "disperse
  the hideout" advice is about. Worth watching in longer games.
- A settlement an independent takes stayed on the map as that independent's population-1 city for a turn or two
  before it was gone (Heijo read owner 24 at turn 9).
- The per-civ cap refused two brewing flip risings at turn 10 (two were already active): the Unrest notice had gone
  out, and no rising followed. The cap was raised to 6 for the rest of the session so the join checks could run.
