// Points Foundry's systems/holocron at this repo's dist/ with a directory junction, so every build
// is what Foundry loads and nothing is copied. Refuses to touch a real folder or a link that points
// elsewhere. The Foundry data folder defaults to %LOCALAPPDATA%/FoundryVTT/Data; set FOUNDRY_DATA
// to override.
import { existsSync, lstatSync, readFileSync, readlinkSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const dataDir = process.env["FOUNDRY_DATA"] ?? join(process.env["LOCALAPPDATA"] ?? "", "FoundryVTT", "Data");
const target = join(dataDir, "systems", "holocron");
const source = resolve("dist");

if (!existsSync(join(source, "system.json"))) {
  console.error(`link: ${source} has no system.json; run npm run build first`);
  process.exit(1);
}
if (!existsSync(join(dataDir, "systems"))) {
  console.error(`link: ${join(dataDir, "systems")} does not exist; set FOUNDRY_DATA`);
  process.exit(1);
}

const same = (a: string, b: string) => resolve(a).toLowerCase() === resolve(b).toLowerCase();

// lstat, not exists: a junction whose target is missing still occupies the path.
const stat = (() => {
  try {
    return lstatSync(target);
  } catch {
    return null;
  }
})();

if (stat) {
  if (!stat.isSymbolicLink()) {
    console.error(`link: ${target} is a real folder, not a link; move it aside by hand first`);
    process.exit(1);
  }
  const current = readlinkSync(target);
  if (!same(current, source)) {
    console.error(`link: ${target} already points at ${current}, not ${source}`);
    process.exit(1);
  }
  console.log(`link: ${target} already points at ${source}`);
} else {
  symlinkSync(source, target, "junction");
  console.log(`link: created junction ${target} -> ${source}`);
}

// Read system.json back through the link, so the report is about what Foundry will read.
const throughLink = readFileSync(join(target, "system.json"));
const direct = readFileSync(join(source, "system.json"));
if (!throughLink.equals(direct)) {
  console.error("link: system.json read through the link differs from dist/system.json");
  process.exit(1);
}
console.log(`link: system.json through the link matches dist (${direct.length} bytes)`);
