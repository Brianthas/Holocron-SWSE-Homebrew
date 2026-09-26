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
npm run verify:f1    # F1 acceptance checks in the holocron-testing world
```

`npm run typecheck`, `npm run lint` and `npm test` run in CI on every push.

`link` looks for Foundry's data folder at `%LOCALAPPDATA%/FoundryVTT/Data`; set `FOUNDRY_DATA` to
use another. `verify:live` needs Foundry started with `--remote-debugging-port=9222` and a world
open. `verify:f1` refuses any world but `holocron-testing`: it creates and deletes its own test
characters and scene there, marked `flags.holocron.f1Fixture`.

Types come from fvtt-types (v14 beta). `types/probes.ts` checks the handful of Foundry APIs the
system depends on and fails typecheck when those types change.
