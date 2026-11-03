// Runs a live check (tools/checks/<name>.page.js) inside the running Foundry client and prints every
// result, passed and failed. Exits 1 if any fails or the page refuses (wrong world). Run verify:live
// first, so the checks run against this build. Usage: node tools/checks/run.ts <name>
import { readdirSync, readFileSync } from "node:fs";
import { evaluate } from "../lib/cdp.ts";

interface Report {
  refused?: string;
  world?: string;
  build?: string;
  results?: { name: string; pass: boolean; detail: unknown }[];
}

const name = process.argv[2];
if (!name) {
  console.error("usage: node tools/checks/run.ts <name>   (runs tools/checks/<name>.page.js)");
  process.exit(1);
}
// A page that reads converted content names the files in a "// pack-docs: feats/toughness, ..."
// line; their JSON replaces the "= __PACK_DOCS__" assignment, keyed by that path. The replacer is a
// function so a "$" in the data is not read as a replacement pattern.
const source = readFileSync(new URL(`./${name}.page.js`, import.meta.url), "utf8");
const wanted = /^\/\/ pack-docs: (.+)$/m.exec(source)?.[1]?.split(",").map((s) => s.trim()) ?? [];
const docs = Object.fromEntries(wanted.map((path) => [path, JSON.parse(readFileSync(new URL(`../../packs/_source/${path}.json`, import.meta.url), "utf8"))]));
// "= __PACK_COUNTS__" becomes each source pack's document and effect counts, read off packs/_source.
const sourceRoot = new URL("../../packs/_source/", import.meta.url);
const counts = () => Object.fromEntries(readdirSync(sourceRoot).map((pack) => {
  const files = readdirSync(new URL(`${pack}/`, sourceRoot)).filter((f) => f.endsWith(".json"));
  const effects = files.reduce((n, f) => n + (JSON.parse(readFileSync(new URL(`${pack}/${f}`, sourceRoot), "utf8")) as { effects: unknown[] }).effects.length, 0);
  return [pack, { items: files.length, effects }];
}));
let page = wanted.length ? source.replace("= __PACK_DOCS__", () => `= ${JSON.stringify(docs)}`) : source;
if (page.includes("= __PACK_COUNTS__")) page = page.replace("= __PACK_COUNTS__", () => `= ${JSON.stringify(counts())}`);
// The pack probe embeds every compendium item and the sheet check drives every control; the
// others answer well inside a minute.
const report = JSON.parse((await evaluate(page, ["packs", "sheet", "browser"].includes(name) ? 300000 : 60000)) as string) as Report;

if (report.refused) {
  console.error(`${name}: refused: ${report.refused}; open the holocron-testing world first`);
  process.exit(1);
}
const results = report.results ?? [];
console.log(`${name}: world ${report.world}, build ${report.build}`);
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}  ${JSON.stringify(r.detail)}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`${name}: ${results.length - failed} passed, ${failed} failed`);
if (failed || results.length === 0) process.exit(1);
