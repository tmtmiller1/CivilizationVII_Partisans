# Release checklist

Partisans hasn't shipped yet: the repo has no GitHub remote and no Workshop item. It goes out together with Cultural
Diffusion, Emigration and Demographics, whose unreleased changes read it through `globalThis.__towerPartisans`, so the
four are pushed and uploaded in one sitting (the bundle prompt in the workspace's `tools/plans/next-2026-10-15/`).

## The first release, 1.0.0

1. **Gates.** `npm run release:gate` passes. The any-DLC check passes: load `data/partisans-muster.sql` into a copy of
   a freshly compiled `gameplay-copy.sqlite` with every DLC-only `Leaders`, `Civilizations`, `Units`,
   `Constructibles` and `Resources` row removed, and `PRAGMA foreign_key_check` lists the same rows as before. Last
   run on 2026-10-15 against a clean 1.5.0 compile: 19 of 38 major leaders left, 0 new rows.
2. **Date the changelog.** Rename `## [Unreleased]` in `CHANGELOG.md` to `## [1.0.0] - YYYY-MM-DD`, then run
   `node scripts/steam-changelog.mjs sync`, which adds the 1.0.0 block to `CHANGELOG.steam.txt`. `<Version>` in
   `partisans.modinfo` and `version` in `package.json` already say 1.0.0.
3. **Create the GitHub repo.** Make it public under `tmtmiller1` and leave it empty, without a README or license,
   since this repo has its own. The newer Tower mods are named like `civilizationvii_canals`, so
   `civilizationvii_partisans` fits (it was made as `CivilizationVII_Partisans`). Then:

   ```sh
   git remote add origin https://github.com/tmtmiller1/CivilizationVII_Partisans.git
   git push -u origin main
   git tag v1.0.0 && git push origin v1.0.0
   ```

   With the remote set, run `node scripts/steam-changelog.mjs sync` again: long notes link the full changelog through
   it.
4. **Build.** `./release.sh` wipes `dist/` and builds it again, so whatever is in `dist/` beforehand doesn't matter as
   long as nobody uploads it by hand. With no `steam_workshop_id.txt` it builds in new-item mode, and the change note
   is "1.0.0: first release."
5. **First upload.** `release.sh` writes the manifest without a preview line, so it's the one to use:

   ```sh
   ~/steamcmd/steamcmd.sh +login tmtmiller +workshop_build_item "$PWD/dist/workshop_item.vdf" +quit
   ```

   steamcmd asks for the password and a Steam Guard confirmation, creates the item and prints its `publishedfileid`.
   The manifest sets visibility 0, so the item is public as soon as it's created.
6. **Save the id.** `echo <publishedfileid> > steam_workshop_id.txt` at the repo root, and commit it (the other Tower
   mods track theirs). `release.sh` reads it from then on: later builds update that item, and the change note comes
   from `CHANGELOG.steam.txt`. It stays out of the zip.
7. **The Workshop page, in a browser.** Paste the description from `docs/steam-workshop-description.txt` (the upload
   leaves the page text alone), set the preview image from `docs/workshop-preview.png`, and add the screenshots from
   `docs/screenshots/`. Release captures are taken with every other mod off.
8. **Links.** Add the Workshop and GitHub links to `README.md` (Installing) and to the last line of
   `docs/steam-workshop-description.txt`, and wherever Cultural Diffusion, Emigration and Demographics name Partisans
   on their own pages.

## Later releases

Add the changes under `## [Unreleased]`, bump `<Version>` in `partisans.modinfo`, `version` in `package.json` and
`VERSION` in `ui/pt-bootstrap.js` (`tests/modinfo.test.mjs` fails until the last two match), date the section, run `node scripts/steam-changelog.mjs sync`, then `./release.sh` and the same upload command. Paste a new
description by hand only when it changed.
