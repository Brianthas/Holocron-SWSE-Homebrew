// Runs a live check (tools/checks/<name>.page.js) inside the running Foundry client and prints every
// result, passed and failed. Exits 1 if any fails or the page refuses (wrong world). Run verify:live
// first, so the checks run against this build. Usage: node tools/checks/run.ts <name>
import { readFileSync } from "node:fs";
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
const page = readFileSync(new URL(`./${name}.page.js`, import.meta.url), "utf8");
const report = JSON.parse((await evaluate(page, 60000)) as string) as Report;

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
