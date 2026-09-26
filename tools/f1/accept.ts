// Runs F1's acceptance checks in the live client (tools/f1/accept.page.js) and prints every check,
// passed and failed. Exits 1 if any fails or the page refuses (wrong world). Run verify:live first,
// so the checks run against this build.
import { readFileSync } from "node:fs";
import { evaluate } from "../lib/cdp.ts";

interface Report {
  refused?: string;
  world?: string;
  build?: string;
  results?: { name: string; pass: boolean; detail: unknown }[];
}

const page = readFileSync(new URL("./accept.page.js", import.meta.url), "utf8");
const report = JSON.parse((await evaluate(page, 60000)) as string) as Report;

if (report.refused) {
  console.error(`f1-accept: refused: ${report.refused}; open the holocron-testing world first`);
  process.exit(1);
}
const results = report.results ?? [];
console.log(`f1-accept: world ${report.world}, build ${report.build}`);
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}  ${JSON.stringify(r.detail)}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`f1-accept: ${results.length - failed} passed, ${failed} failed`);
if (failed || results.length === 0) process.exit(1);
