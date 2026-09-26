// Prints every distinct change key in tools/convert/out/survey.json across the surveyed packs, with
// the number of documents using it, the packs it appears in, its modes, and one example value.
// Run tools/convert/survey.ts first.
import { readFileSync } from "node:fs";

interface KeyEntry { key: string; docs: number; modes: number[]; examples: string[] }
const survey = JSON.parse(readFileSync("tools/convert/out/survey.json", "utf8")) as Record<string, { changeKeys: KeyEntry[] }>;
const merged = new Map<string, { docs: number; packs: string[]; modes: Set<number>; example: string }>();
for (const [pack, r] of Object.entries(survey)) {
  for (const k of r.changeKeys) {
    const m = merged.get(k.key) ?? { docs: 0, packs: [], modes: new Set<number>(), example: k.examples[0] ?? "" };
    m.docs += k.docs;
    m.packs.push(`${pack}:${k.docs}`);
    k.modes.forEach((x) => m.modes.add(x));
    merged.set(k.key, m);
  }
}
const rows = [...merged].sort((a, b) => b[1].docs - a[1].docs);
console.log(`${rows.length} distinct change keys`);
for (const [key, m] of rows) console.log(`${m.docs}\t${key}\t[${[...m.modes]}]\t${m.packs.join(" ")}\t${m.example.slice(0, 90)}`);
