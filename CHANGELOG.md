# Changelog

All notable changes to the Partisans mod for Civilization VII. The format follows
[Keep a Changelog](https://keepachangelog.com/) and Semantic Versioning. The Steam Workshop change note for each
release is generated from the matching section below by `scripts/steam-changelog.mjs`.

## [1.0.2] - 2026-10-17

### Changed
- License: from this version the mod is under the Tower Mod License 1.0, in LICENSE. You can still play it, read the
  code and change your own copy for your own games. Reuploading it, reusing its code in other projects and using it
  to train AI need my written permission. Earlier versions stay under MIT, and `ui/settings-keeper.js` stays MIT so
  other mods can keep embedding it.

### Added
- Carries Civilopedia History Corrections. With Civilopedia Expanded: Independents on, six East Asian history pages
  in the Civilopedia (Goguryeo, the Oirat, two Ryukyu pages, Nanzhao and Balhae) give each side where historians in
  different countries disagree, and a few factual errors are fixed. With it off, the game's pages stay as they are.

## [1.0.1] - 2026-10-17

### Changed
- With Emigration 3.6.0, a host's immigration stance sets an enclave's unrest: a Pro-Immigration Stance lets it
  settle even in wartime, an Anti-Immigration Stance builds it fast at war. The separate treatment cards of
  Emigration 3.5.0 still count in a save that holds one.

## [1.0.0] - 2026-10-16

First release. When a settlement's people have a reason to rise, armed partisans appear in the countryside around it
and fight under the game's own independent-power AI: they raid, besiege and, if nobody answers them, take the
settlement, which the game then removes from the map.

- Three things start a rising. A settlement won over by a rival's culture (with Cultural Diffusion) may rise against
  its new owner, though that's rare: never between allies or friends, about one time in three at war. A recognised
  enclave (with Emigration) may take up arms against how it's treated: a war with the community's homeland is the
  trigger, and the host's treatment card from Emigration sets the risk. Any settlement that stays at -10 Happiness or
  worse for twenty turns may rise, with the chance growing each turn.
- Each civilization gets its own rebel people once per age, camped a few tiles from one of its settlements; later
  risings use the same people. Rebels that happen to be friendly declare themselves against you when a rising starts.
  Hostile independent villages near a culture flip may send fighters of their own.
- The band lands two to four tiles out from the settlement that rose, city or town. From there the game's
  independent AI decides where it goes: it can attack that settlement or move on to other settlements nearby, your
  capital included.
- A notification titled with the place ("Partisan uprising near Mutsu", or "Partisan Greek loyalists near Mutsu"
  after a culture flip) says why the people rose, and a click on it jumps there. A Partisans section in the City
  Details panel shows the settlement's misery turns and enclave tension.
- Other mods can read every rising this game through `globalThis.__towerPartisans.risings()`: Demographics draws
  them on its conflict timeline, and Emigration names the uprising refugees flee.
- With National Parks, in the Exploration and Modern Ages, a settlement's park tiles calm its countryside.
- Options under Mods: each cause on or off, culture flips from other mods on or off, the park relief on or off.
  Settings keep their values between launches (Tower Settings Keeper on board).
- A rebel people can only appear while the game has room for another independent people: in the Exploration and
  Modern Ages that room is gone a turn or two into the age, so a civilization without rebels by then gets its risings
  from a hostile village within twelve tiles, or they fizzle.
- Capitals, city-states and independent peoples never rise. Single-player and hotseat; in a network game the mod
  only shows what an earlier session recorded.
- Eleven languages besides English.
