// Validates packs/_source (tools/convert/lib/validate.ts). Prints how many documents, effects and
// changes it read per pack, so a clean run can be told apart from one that read nothing, then every
// problem. Exits 1 on any problem.
//
//   node tools/convert/validate.ts

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePacks, type PackFile } from "./lib/validate.ts";

const ROOT = fileURLToPath(new URL("../../packs/_source", import.meta.url));
const files: PackFile[] = [];
const unreadable: string[] = [];
for (const pack of readdirSync(ROOT).sort()) {
  const json = readdirSync(join(ROOT, pack)).filter((f) => f.endsWith(".json")).sort();
  if (!json.length) unreadable.push(`${pack}: no documents`);
  for (const file of json) {
    try {
      files.push({ pack, file, doc: JSON.parse(readFileSync(join(ROOT, pack, file), "utf8")) });
    } catch (err) {
      unreadable.push(`${pack}/${file}: ${String(err)}`);
    }
  }
}

const { problems, effects, changes } = validatePacks(files);
const perPack = new Map<string, number>();
for (const { pack } of files) perPack.set(pack, (perPack.get(pack) ?? 0) + 1);
for (const [pack, count] of perPack) console.log(`${pack}: ${count}`);
console.log(`read ${files.length} documents in ${perPack.size} packs, ${effects} effects, ${changes} changes`);
for (const problem of [...unreadable, ...problems]) console.error(`PROBLEM ${problem}`);
if (unreadable.length || problems.length) {
  console.error(`packs:validate: ${unreadable.length + problems.length} problem(s)`);
  process.exit(1);
}
console.log("packs:validate: clean");
