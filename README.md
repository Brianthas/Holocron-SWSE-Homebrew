# Holocron: Saga Edition

A Star Wars Saga Edition system for Foundry VTT v14, built on the Episode VII house rules. Early
development: not yet playable.

## Development

Requires Node 24 and Foundry 14.368.

```
npm install
npm run build        # vite build into dist/
npm run link         # junction Foundry's systems/holocron to dist/
npm run verify:live  # confirm the running client loaded this build
npm run verify:f1       # F1 acceptance checks in the holocron-testing world
npm run verify:effects  # effect change types, read off the rendered sheet
npm run verify:models   # every item type embeds; armor and DT+5 on the sheet
npm run verify:resources # levels, hit points, Force Points, languages, slots
npm run verify:rest     # the sheet's Rest and the GM's New Day
npm run verify:expiry   # effects lasting 1 and 2 rounds end on the right round
npm run verify:feats    # converted feats from packs/_source, read off the sheet
npm run verify:talents  # converted talents from packs/_source, read off the sheet
npm run verify:species  # converted species: size, abilities, Reflex, the Killik size choice
npm run verify:classes  # converted classes embed; level-1 HP and BAB; Jedi Master's access
npm run verify:gear     # converted weapons and armor: attack, damage, worn armor's Reflex and STR
npm run verify:droids   # converted droid systems embed; the Translator Unit installed and removed
npm run verify:packs    # the built compendiums load, and every item embeds and prepares cleanly
npm run verify:sheet    # the character sheet, driven through its own controls
npm run verify:browser  # the compendium browser: search, filters, Add from a sheet, drag onto one
npm run verify:cards    # attack and damage cards, with forced dice: results, DR, immunity, Apply and Undo
```

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run packs:build` run in
CI on every push.

`link` looks for Foundry's data folder at `%LOCALAPPDATA%/FoundryVTT/Data`; set `FOUNDRY_DATA` to
use another. `verify:live` needs Foundry started with `--remote-debugging-port=9222` and a world
open. The `verify:` checks in `tools/checks/` refuse any world but `holocron-testing`: each creates
its own test documents there, marked with a `flags.holocron` fixture flag, and deletes the previous
run's. Their characters open the debug sheet (`flags.core.sheetClass`), whose layout the engine
checks read; `verify:sheet`, `verify:browser` and `verify:cards` drive the character sheet. `verify:rest` also creates one player user, since New Day only rests player-owned
characters.

### Content

`npm run packs:convert` builds `packs/_source` from the SWSE fork's `packs/_source`, read from a
checkout beside this repo (or `FORK_PACKS`). Converted so far: Force powers, techniques,
secrets, regimens, feats, talents, species, classes, weapons, armor, equipment and droid systems. Ids are derived from each item's pack and name, so a rebuild never changes them; the
fork's id is kept in `flags.holocron.sourceId`. The run fails on a source field it has no mapping
for, on a duplicate id, and on a file in an output pack it did not write (`--prune` deletes those).
`tools/convert/out/report.json` lists every document left out, with the rule that removes it.

`npm run packs:validate` checks `packs/_source` as it stands, converted or edited by hand: ids,
keys and file names; item types against `system.json`; one system shape per type; every effect
change against the change types, phases, selectors and grants the engine reads, and its bonus type
against the item's own text; references between packs (a class's trees, talents and starting feat,
a technique's power); the base classes against the house class table; and no text the description
cleanup removes. It prints how many documents, effects and changes it read. `test/validate.test.ts`
breaks one document per test and expects the one problem that names it. It also checks that
`system.json` declares exactly the packs in `packs/_source`, each in one pack folder: Foundry drops
a pack it cannot read with only a warning in the server log.

`npm run packs:build` runs the validator, compiles each declared pack into `dist/packs` (LevelDB,
with `@foundryvtt/foundryvtt-cli`), and reads every pack back against its source counts. It
builds nothing on a validation problem. A running world holds its packs open, so the build stops at
the first pack with "Foundry has this pack open" and changes nothing; rebuild with the world shut
down. `foundry-console-tools/relaunch-world.mjs holocron-testing --build-packs Holocron` shuts the
world down, builds and launches it again. A world needs a relaunch, not a reload, to pick up a pack
added to `system.json`.

`verify:packs` loads every pack from the running client, checks its documents and effects against
`packs/_source`, and embeds every item on scratch level-1 Jedi, 200 items each. With armor worn and
droid systems installed, every effect change must reach the character's modifiers, grants or dice,
with no Holocron console error.

Types come from fvtt-types (v14 beta). `types/probes.ts` checks the handful of Foundry APIs the
system depends on and fails typecheck when those types change.
