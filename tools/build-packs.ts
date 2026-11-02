// Compiles packs/_source into dist/packs, one LevelDB per pack system.json declares; Foundry reads
// them through the dist junction. Runs the validator first and builds nothing on a problem, then
// reads every pack back and compares its items and effects with the source files.
//
// A running world holds each declared pack open, and compiling one fails on the LevelDB lock before
// anything is written. Rebuild with the world shut down: foundry-console-tools/relaunch-world.mjs
// <world> --build-packs shuts it down, runs this, and launches it again.
//
//   node tools/build-packs.ts

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { ClassicLevel } from "classic-level";
import { SYSTEM } from "./convert/lib/validate.ts";

const SOURCE = fileURLToPath(new URL("../packs/_source", import.meta.url));
const DIST = fileURLToPath(new URL("../dist", import.meta.url));

try {
  execFileSync(process.execPath, [fileURLToPath(new URL("./convert/validate.ts", import.meta.url))], { stdio: "inherit" });
} catch {
  console.error("packs:build: the validator found problems; nothing was built");
  process.exit(1);
}

let mismatched = 0;
for (const { name, path = `packs/${name}` } of SYSTEM.packs) {
  const src = join(SOURCE, name);
  const dest = join(DIST, path);
  const docs = readdirSync(src).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(src, f), "utf8")) as { effects: unknown[] });
  const effects = docs.reduce((n, d) => n + d.effects.length, 0);
  try {
    await compilePack(src, dest);
  } catch (err) {
    const locked = (err as { cause?: { code?: string } }).cause?.code === "LEVEL_LOCKED";
    console.error(`${name}: ${locked ? "Foundry has this pack open; shut the world down and build again" : String(err)}`);
    process.exit(1);
  }
  const db = new ClassicLevel<string, unknown>(dest, { keyEncoding: "utf8", valueEncoding: "json", createIfMissing: false });
  const keys = await db.keys().all();
  await db.close();
  const items = keys.filter((k) => k.startsWith("!items!")).length;
  const itemEffects = keys.filter((k) => k.startsWith("!items.effects!")).length;
  const ok = items === docs.length && itemEffects === effects && keys.length === items + itemEffects;
  if (!ok) mismatched++;
  console.log(`${ok ? "" : "MISMATCH "}${name}: read back ${items} of ${docs.length} items, ${itemEffects} of ${effects} effects, ${keys.length} keys`);
}
if (mismatched) {
  console.error(`packs:build: ${mismatched} pack(s) do not match their source`);
  process.exit(1);
}
console.log(`packs:build: ${SYSTEM.packs.length} packs in ${join(DIST, "packs")}`);
