# Contributing

Partisans is a Civilization VII mod: a game-scope UI script that keeps the risings' books and places the bands, plus
a little generated game data for the muster marker. This page covers the setup, the checks to run before you submit,
and the conventions the code follows.

## Plain JavaScript, no build step

The game loads the `.js` files in `ui/` directly as ES modules, so what ships is what you wrote, readable and
unminified. Don't add `.ts` files or a build step.

## Setup

```sh
npm install
```

## Before you submit: `npm run verify`

```sh
npm run verify
```

It has to pass with zero errors and zero warnings. It runs:

1. `eslint ui tests scripts`: correctness rules and the size limits below.
2. `node --check` on every module and script, then `scripts/check-esm.mjs`, which catches what a per-file check
   can't: a name exported twice, an import whose file doesn't exist, and a named import the target module doesn't
   export. Each of these stops the whole mod from loading in game.
3. Every `tests/*.test.mjs` under `node --test`, among them `tests/pedia-pages.test.mjs`, which walks the Civilopedia
   data the way the game does and fails on a page or chapter that would come up blank.

`npm run release:gate` runs verify and then the tests again under c8; the coverage report lands in `coverage/`.
`npm run test:pedia` runs the Civilopedia harness on its own.

## The data

`data/partisans-muster.sql` is written by `scripts/gen-data.mjs`; edit the script and run `npm run gen-data`, never the
SQL. `tests/pt-data.test.mjs` fails when the two disagree, and when the city-level army spawn effect (which crashes the
game) appears anywhere.

Every row has to load with any mix of DLC owned and on any game version, because a failed foreign key when a game is
created rolls back every mod and the game doesn't start. The per-leader rows are `INSERT ... SELECT` over the `Leaders`
table, so the rows only go to leaders the player's game has. Keep it that way: never write a row that names a DLC
leader, civilization, unit, building or resource directly.

## Style limits (enforced by ESLint)

- cyclomatic complexity ≤ 10
- max statements per function ≤ 18
- max nesting depth ≤ 4
- max parameters ≤ 5
- max lines per function ≤ 50, per file ≤ 500
- line length ≤ 120 (strings, templates, regular expressions and URLs exempt)

When a function trips a limit, pull out a small named helper rather than switching the rule off. Tests are exempt
from the length and complexity limits.

## Conventions

- The numbers live in `ui/pt-config.js` and the rules are pure functions in `ui/pt-model.js`, each pinned by
  `tests/pt-model.test.mjs`. Engine reads go through `ui/pt-engine.js` and its `safe()` wrapper; a read that throws
  gives its fallback and the pass carries on.
- Logging goes through `ui/pt-log.js`, tagged `[Partisans]`. `console.log` never reaches `UI.log`; the module writes
  with `console.error`, which does. Per-plot lines only show with `debug` on in the settings slice.
- Settings live in the `tower-partisans` slice of the shared `modSettings` `localStorage` key. Never add a top-level
  `localStorage` key. The saved game state is the one `Partisans_v1` key in the game configuration.
- Every string a player sees is a `LOC_` tag in `text/en_us/` and in all eleven other languages. `tests/i18n.test.mjs`
  checks parity, languages and placeholders; [text/README.md](text/README.md) has the workflow.
- `ui/settings-keeper.js` is the Tower Settings Keeper, copied unchanged from its own repo. Don't edit it here.
  `scripts/steam-changelog.mjs` is the same file in every Tower mod; keep it identical.
- Comments explain why (engine behaviour, workarounds), not what.
- Never copy, import or run another mod's files. Partisans reads other mods' saved state and globals only, as listed
  in [docs/compatibility.md](docs/compatibility.md).

## Trying a change in game

The game runs the copy in its `Mods/` folder, not the repo. [devtools/README.md](devtools/README.md) describes the
lab run, the harness and the throwaway probe mods.

## Releasing

See [docs/release-checklist.md](docs/release-checklist.md). `./release.sh` runs `npm run verify`, builds
`dist/partisans/` and its zip, audits the zip against an allow-list and writes the Workshop manifest. Change notes
come from `CHANGELOG.steam.txt`, which `node scripts/steam-changelog.mjs sync` keeps in step with `CHANGELOG.md`.

## License

Changes go under the same terms as the mod: the Tower Mod License 1.0 in [LICENSE](LICENSE), with `ui/settings-keeper.js` under
MIT. By sending a change, you agree I can release it under those terms.
