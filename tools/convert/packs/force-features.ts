// Force techniques, secrets and regimens become feature items. The fork's documents carry a name and
// a description and nothing else: categories is always the pack's own name, cost is "0" or absent,
// isSupplied is false, and every other key is empty (survey, 2026-10-17).

import { cleanDescription } from "../lib/html.ts";
import { slugify } from "../lib/ids.ts";
import { checkKeys, itemDoc, readPack, type OutputDoc, type Report } from "../lib/pack.ts";
import { REMOVED_POWERS } from "../rules.ts";

const PACKS = [
  { pack: "force-techniques", category: "forceTechnique", label: "Force Techniques" },
  { pack: "force-secrets", category: "forceSecret", label: "Force Secrets" },
  { pack: "force-regimens", category: "forceRegimen", label: "Force Regimens" },
] as const;

/**
 * The power a technique improves: the first link in its text that names a Force power, else the
 * longest power name inside its own name. Blank for a technique that improves no single power.
 */
export function techniquePower(name: string, links: string[], powers: Iterable<string>): string {
  const known = new Set(powers);
  const linked = links.find((text) => known.has(text));
  if (linked) return linked;
  return [...known].filter((power) => name.includes(power)).sort((a, b) => b.length - a.length)[0] ?? "";
}

export function convertForceFeatures(powerNames: string[], report: Report): Map<string, OutputDoc[]> {
  const out = new Map<string, OutputDoc[]>();
  // Removed powers count as names here, so a technique of one is recognised and left out.
  const powers = [...powerNames, ...REMOVED_POWERS.keys()];
  for (const { pack, category, label } of PACKS) {
    const docs: OutputDoc[] = [];
    for (const doc of readPack(pack)) {
      checkKeys(pack, doc, { mapped: ["description"], constant: { categories: [{ value: label }], cost: "0" } }, report);
      const cleaned = cleanDescription(String(doc.system["description"] ?? ""));
      report.sections(pack, doc, cleaned);
      const { html, sourceBook, links } = cleaned;
      const power = category === "forceTechnique" ? techniquePower(doc.name, links, powers) : "";
      const removed = REMOVED_POWERS.get(power);
      if (removed) {
        report.exclude(pack, doc, `improves ${power}, removed (${removed})`);
        continue;
      }
      if (category === "forceTechnique") report.note("technique powers", `${doc.name}: ${power || "(none)"}`);
      // The text is the source for repeating: only Force Power Mastery says so. The core errata
      // took the repeat clause out of Force Point Recovery, and the fork's text already lacks it.
      const repeatable = /multiple times|more than once/i.test(html);
      docs.push(itemDoc(`${pack}:${slugify(doc.name)}`, doc.name, "feature", { description: html, category, power, repeatable }, doc, { sourceBook }));
    }
    out.set(pack, docs);
  }
  return out;
}
