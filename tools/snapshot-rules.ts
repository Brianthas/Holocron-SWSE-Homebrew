// Snapshots the Episode VII house-rules pages into docs/rules/, so rule citations in code and tests
// point at a fixed copy. The page content is kept verbatim (scripts removed) under a header naming
// the source, the fetch date and the licence. Re-run before each milestone and diff the result.
import { mkdirSync, writeFileSync } from "node:fs";

const PAGES = ["episode-vii", "level-up-guide"];
const START = '<div id="page-content">';
const END_MARKERS = ['id="wad-tier3-below-content"', 'id="page-info-break"', 'id="page-options-container"'];

mkdirSync("docs/rules", { recursive: true });
const date = new Date().toISOString().slice(0, 10);

for (const page of PAGES) {
  const url = `https://tovec.wikidot.com/${page}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const html = await response.text();
  const start = html.indexOf(START);
  if (start < 0) throw new Error(`${url}: no page-content div`);
  const ends = END_MARKERS.map((marker) => html.indexOf(marker, start)).filter((i) => i > start);
  if (ends.length === 0) throw new Error(`${url}: no end marker after page-content`);
  const end = html.lastIndexOf("<div", Math.min(...ends));
  const content = html
    .slice(start, end)
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<!--\s*wikidot[\s\S]*?-->/g, "")
    .trim();

  const header = [
    "<!--",
    `Source: ${url}`,
    `Fetched: ${date}`,
    "Content by tovec, licensed under Creative Commons Attribution-ShareAlike 3.0 (per the page footer).",
    "Verbatim copy for rule citations; regenerate with npm run rules:snapshot.",
    "-->",
  ].join("\n");
  const file = `docs/rules/${page}.html`;
  writeFileSync(file, `${header}\n${content}\n`);
  console.log(`snapshot: ${file} (${content.length} chars)`);
}
