// Fails when any tracked or new (not ignored) text file holds a character from
// tools/lib/text-check.ts. Reports every hit as file:line:column, and prints the file count on
// success too, so a clean run can be told apart from a run that read nothing.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { findTextProblems } from "./lib/text-check.ts";

const TEXT_EXTENSIONS = new Set([
  ".ts", ".mts", ".js", ".mjs", ".json", ".hbs", ".html", ".scss", ".css", ".md", ".yml", ".yaml", ".txt",
]);
const TEXT_NAMES = new Set(["LICENSE", ".gitignore"]);

const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
const files = listed.filter((file) => TEXT_EXTENSIONS.has(extname(file)) || TEXT_NAMES.has(file));

let failures = 0;
for (const file of files) {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // listed but deleted in the working tree
  }
  const allowDashes = file.startsWith("docs/rules/");
  for (const problem of findTextProblems(text, { allowDashes })) {
    failures += 1;
    const hex = problem.codePoint.toString(16).toUpperCase().padStart(4, "0");
    console.error(`${file}:${problem.line}:${problem.column} ${problem.reason} (U+${hex})`);
  }
}

if (failures > 0) {
  console.error(`lint-text: ${failures} problem(s) in ${files.length} files`);
  process.exit(1);
}
console.log(`lint-text: ${files.length} files clean`);
