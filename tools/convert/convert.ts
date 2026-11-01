// Converts the SWSE fork's packs into packs/_source. Deterministic: a second run with the same
// input writes the same bytes. Fails (exit 1) on any problem: an unmapped key, a duplicate id, or a
// file in an output pack that this run did not write. Pass --prune to delete those files, which the
// report names one by one.
//
//   node tools/convert/convert.ts [--prune]

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { slugify } from "./lib/ids.ts";
import { Report, type OutputDoc } from "./lib/pack.ts";
import { convertFeats } from "./packs/feats.ts";
import { convertForceFeatures } from "./packs/force-features.ts";
import { convertForcePowers } from "./packs/force-powers.ts";

const OUT = fileURLToPath(new URL("../../packs/_source", import.meta.url));
const REPORT = fileURLToPath(new URL("./out/report.json", import.meta.url));
const prune = process.argv.includes("--prune");
const report = new Report();

const powers = convertForcePowers(report);
const packs = new Map<string, OutputDoc[]>([
  ["force-powers", powers], ...convertForceFeatures(powers.map((p) => p.name), report), ["feats", convertFeats(report)],
]);

const stale: { pack: string; file: string }[] = [];
const written: Record<string, number> = {};
const ids = new Map<string, string>();
for (const [pack, docs] of packs) {
  const dir = join(OUT, pack);
  mkdirSync(dir, { recursive: true });
  const expected = new Set<string>();
  for (const doc of docs) {
    const file = `${slugify(doc.name)}.json`;
    const clash = ids.get(doc._id);
    if (clash) report.problems.push({ pack, name: doc.name, message: `id ${doc._id} also used by ${clash}` });
    ids.set(doc._id, `${pack}/${doc.name}`);
    if (expected.has(file)) report.problems.push({ pack, name: doc.name, message: `two documents write ${file}` });
    expected.add(file);
    const text = `${JSON.stringify(doc, null, 2)}\n`;
    const path = join(dir, file);
    if (!existsSync(path) || readFileSync(path, "utf8") !== text) writeFileSync(path, text);
  }
  written[pack] = expected.size;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && !expected.has(f))) stale.push({ pack, file });
}

if (stale.length && prune) {
  for (const { pack, file } of stale) unlinkSync(join(OUT, pack, file));
  report.note("pruned", stale.map(({ pack, file }) => `${pack}/${file}`).join(", "));
} else {
  for (const { pack, file } of stale) report.problems.push({ pack, name: file, message: "not written by this run (rerun with --prune to delete it)" });
}

mkdirSync(join(REPORT, ".."), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify({ written, excluded: report.excluded, problems: report.problems, notes: report.notes }, null, 2)}\n`);
for (const [pack, count] of Object.entries(written)) console.log(`${pack}: ${count} written`);
for (const e of report.excluded) console.log(`excluded ${e.pack}/${e.name}: ${e.reason}`);
for (const p of report.problems) console.log(`PROBLEM ${p.pack}/${p.name}: ${p.message}`);
console.log(`report: ${REPORT}`);
if (report.problems.length) process.exit(1);
