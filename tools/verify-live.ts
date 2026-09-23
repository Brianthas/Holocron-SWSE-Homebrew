// Proves the running Foundry client loaded this build, in two independent reads:
//   1. the served file: http://localhost:30000/systems/holocron/holocron.mjs contains dist's build id
//   2. the running code: CONFIG.HOLOCRON.buildId in the client equals it
// Prints both results on success as well as failure. Set FOUNDRY_URL to override the server.
import { readFileSync } from "node:fs";
import { evaluate } from "./lib/cdp.ts";

const server = process.env["FOUNDRY_URL"] ?? "http://localhost:30000";
const { buildId } = JSON.parse(readFileSync("dist/build.json", "utf8")) as { buildId: string };
console.log(`verify-live: dist build ${buildId}`);

let ok = true;

const served = await fetch(`${server}/systems/holocron/holocron.mjs`, { cache: "no-store" });
const servedText = served.ok ? await served.text() : "";
const servedMatches = servedText.includes(buildId);
console.log(`verify-live: served holocron.mjs (HTTP ${served.status}) ${servedMatches ? "contains" : "does NOT contain"} this build id`);
ok &&= servedMatches;

try {
  const result = (await evaluate(
    "JSON.stringify({system: game.system?.id, version: game.system?.version, build: CONFIG.HOLOCRON?.buildId ?? null})",
  )) as string;
  const client = JSON.parse(result) as { system: string; version: string; build: string | null };
  const clientMatches = client.build === buildId;
  console.log(`verify-live: client runs system ${client.system} ${client.version}, build ${client.build} (${clientMatches ? "matches" : "does NOT match"})`);
  ok &&= clientMatches;
} catch (error) {
  console.log(`verify-live: client check failed: ${(error as Error).message}`);
  ok = false;
}

if (!ok) {
  console.error("verify-live: FAILED; reload the world after building, then run again");
  process.exit(1);
}
console.log("verify-live: OK");
