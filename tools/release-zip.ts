// Builds the release zip for the version in static/system.json: dist/ without its packs, the packs
// compiled fresh from packs/_source (the running world holds dist/packs open), CREDITS.md and
// LICENSE, in one folder holocron-vX.Y.Z/. Reads the zip back and checks its entries. Pushing, the
// tag and the GitHub release are separate steps.
//
//   node tools/release-zip.ts <staging-dir>     (run npm run build first)

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compilePack } from "@foundryvtt/foundryvtt-cli";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const staging = process.argv[2];
if (!staging) {
  console.error("usage: node tools/release-zip.ts <staging-dir>");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(join(ROOT, "static/system.json"), "utf8")) as { version: string; download: string; packs: { name: string; path: string }[] };
const built = JSON.parse(readFileSync(join(ROOT, "dist/system.json"), "utf8")) as { version: string };
if (built.version !== manifest.version) {
  console.error(`dist/system.json is ${built.version}, static/system.json ${manifest.version}: run npm run build`);
  process.exit(1);
}
const name = `holocron-v${manifest.version}`;
if (!manifest.download.endsWith(`/v${manifest.version}/${name}.zip`)) {
  console.error(`system.json download URL does not name v${manifest.version}/${name}.zip: ${manifest.download}`);
  process.exit(1);
}
execFileSync(process.execPath, [join(ROOT, "tools/convert/validate.ts")], { stdio: "inherit" });

const folder = join(staging, name);
if (existsSync(folder)) {
  console.error(`${folder} exists; remove it or pick another staging directory`);
  process.exit(1);
}
mkdirSync(folder, { recursive: true });
for (const entry of readdirSync(join(ROOT, "dist"))) {
  if (entry !== "packs") cpSync(join(ROOT, "dist", entry), join(folder, entry), { recursive: true });
}
for (const pack of manifest.packs) await compilePack(join(ROOT, "packs/_source", pack.name), join(folder, pack.path));
for (const file of ["CREDITS.md", "LICENSE"]) cpSync(join(ROOT, file), join(folder, file));

const zip = join(staging, `${name}.zip`);
execFileSync("C:/Windows/System32/tar.exe", ["-a", "-c", "-f", zip, "-C", staging, name]);
const entries = execFileSync("C:/Windows/System32/tar.exe", ["-t", "-f", zip], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
const top = new Set(entries.map((e) => e.split("/")[1]).filter(Boolean));
const missing = ["system.json", "holocron.mjs", "holocron.css", "CREDITS.md", "LICENSE", "lang", "packs"].filter((e) => !top.has(e));
const packDirs = new Set(entries.filter((e) => e.startsWith(`${name}/packs/`)).map((e) => e.split("/")[2]).filter(Boolean));
const undeclared = [...packDirs].filter((p) => !manifest.packs.some((m) => m.name === p));
const absent = manifest.packs.filter((p) => !packDirs.has(p.name)).map((p) => p.name);
console.log(`${zip}: ${entries.length} entries; top level: ${[...top].sort().join(", ")}; packs: ${[...packDirs].sort().join(", ")}`);
if (missing.length || undeclared.length || absent.length || entries.some((e) => e.includes("_source"))) {
  console.error(`zip problem: missing ${missing.join(", ") || "none"}; undeclared packs ${undeclared.join(", ") || "none"}; absent packs ${absent.join(", ") || "none"}`);
  process.exit(1);
}
console.log(`release-zip: ${name}.zip ready`);
