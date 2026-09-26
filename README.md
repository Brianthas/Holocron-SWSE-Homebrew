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
```

`npm run typecheck`, `npm run lint` and `npm test` run in CI on every push.

`link` looks for Foundry's data folder at `%LOCALAPPDATA%/FoundryVTT/Data`; set `FOUNDRY_DATA` to
use another. `verify:live` needs Foundry started with `--remote-debugging-port=9222` and a world
open. The `verify:` checks in `tools/checks/` refuse any world but `holocron-testing`: each creates
its own test documents there, marked with a `flags.holocron` fixture flag, and deletes the previous
run's. `verify:rest` also creates one player user, since New Day only rests player-owned
characters.

Types come from fvtt-types (v14 beta). `types/probes.ts` checks the handful of Foundry APIs the
system depends on and fails typecheck when those types change.
