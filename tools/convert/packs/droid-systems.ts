// Droid systems: the fork's droid-system pack, plus the droid accessories it keeps in its equipment
// pack (Hardened Systems, Translator Units). The fork's design is kept: a system is installed or
// removed, and only an installed one counts. Fields its own code never reads (locomotion speed,
// appendage counts and types) are dropped until droids are built (M2).

import { DROID_SYSTEM_GROUPS, type DroidSystemGroupKey } from "../../../src/config/droids.ts";
import { cleanDescription } from "../lib/html.ts";
import { slugify } from "../lib/ids.ts";
import { checkKeys, itemDoc, readPack, type OutputDoc, type Report, type SourceDoc } from "../lib/pack.ts";

const PACK = "droid-systems";
const GROUP_BY_LABEL = new Map(Object.entries(DROID_SYSTEM_GROUPS).map(([key, label]) => [label as string, key as DroidSystemGroupKey]));
/** "Droid Accessories (Sensor Systems)" and "Processor Systems" both name a group. */
const groupOf = (subtype: string) => GROUP_BY_LABEL.get(subtype.replace(/^Droid Accessories \((.*)\)$/, "$1"));

/** Left out, each with the decision behind it. */
const EXCLUDED: Record<string, string> = {
  "Shield Expansion Module": 'Bryan, 2026-09-24: "No personal shields" (episode-vii, Equipment)',
};
/** The book's four Translator Units; the house rules give one unit at 5000 credits and +4 INT for languages. Held for Bryan. */
const HELD_TRANSLATORS = /^Translator Unit \(DC \d+\)$/;

/** Change and field keys, each read or dropped with its reason. */
const DROPPED: Record<string, string> = {
  droidPart: "a classification flag the fork's code never reads",
  seeAlso: "the wiki's navigation",
  carryCapacityMultiplier: "Extra Legs' x1.5 carrying; text until droids are built",
  actsAsForProficiency: "a Heuristic Processor counts as a Basic Processor; text until droids are built",
  damageThresholdHardenedMultiplier: "Hardened Systems' DT multiplier; droid stats come with M2",
  healthHardenedMultiplier: "Hardened Systems' hit point multiplier; droid stats come with M2",
  translateDC: "a Translator Unit's DC, which the fork's code never reads",
  cargoCapacity: "the Repulsor-Assisted Lifting System's x3 lift; text until droids are built",
};

const changesOf = (doc: SourceDoc) => {
  const raw = doc.system["changes"];
  return (Array.isArray(raw) ? raw : Object.values((raw ?? {}) as object)) as { key: string; value: unknown }[];
};

function convertOne(doc: SourceDoc, sourcePack: string, report: Report): OutputDoc | null {
  if (EXCLUDED[doc.name]) { report.exclude(sourcePack, doc, EXCLUDED[doc.name] ?? ""); return null; }
  if (HELD_TRANSLATORS.test(doc.name)) { report.exclude(sourcePack, doc, "held: the house rules make Translator Units one 5000-credit unit giving +4 INT for languages; Bryan to decide"); return null; }
  const subtype = String(doc.system["subtype"] ?? "");
  const group = groupOf(subtype);
  if (!group) { report.problem(sourcePack, doc, `no droid system group for "${subtype}"`); return null; }
  // weight, availability and source are text; baseSpeedScalable, appendages, appendageType and
  // droidUnarmedDamageScalable wait for droids (M2).
  checkKeys(sourcePack, doc, {
    mapped: ["description", "changes", "subtype", "cost", "source", "weight", "availability", "requires", "prerequisite", "baseSpeedScalable", "appendages", "appendageType", "droidUnarmedDamageScalable", "seeAlso"],
    constant: { quantity: 1 },
  }, report);
  for (const change of changesOf(doc)) {
    const reason = DROPPED[change.key];
    if (reason) report.note(`dropped: ${reason}`, doc.name);
    else report.problem(sourcePack, doc, `unmapped change ${change.key}`);
  }
  for (const field of ["baseSpeedScalable", "appendages", "appendageType", "droidUnarmedDamageScalable"]) {
    if (doc.system[field]) report.note("dropped: droid build fields, read when droids are built (M2)", `${doc.name}: ${field} ${JSON.stringify(doc.system[field])}`);
  }
  const cleaned = cleanDescription(String(doc.system["description"] ?? ""));
  report.sections(sourcePack, doc, cleaned);
  // The fork writes a requirement as a requires string (droid systems) or, on the Hardened Systems
  // in its equipment pack, a prerequisite whose children are the sizes and whose text is the item's
  // only description ("Droids of Large or greater size can be designed ...").
  const prerequisite = doc.system["prerequisite"] as { text?: string; children?: { text?: string }[] } | undefined;
  let description = cleaned.html;
  let requires = String(doc.system["requires"] ?? "");
  if (prerequisite) {
    if (description || requires) report.problem(sourcePack, doc, "a prerequisite beside a description or requires; read it before mapping");
    description = `<p>${prerequisite.text ?? ""}</p>`;
    requires = (prerequisite.children ?? []).map((c) => c.text ?? "").join(" or ");
  }
  return itemDoc(`${PACK}:${slugify(doc.name)}`, doc.name, "droidSystem", {
    description, group, cost: String(doc.system["cost"] ?? ""), requires,
    installed: false,
  }, doc, { sourceBook: String(doc.system["source"] ?? "") || cleaned.sourceBook });
}

export function convertDroidSystems(report: Report): OutputDoc[] {
  const out: OutputDoc[] = [];
  for (const doc of readPack("droid-system")) {
    const item = convertOne(doc, "droid-system", report);
    if (item) out.push(item);
  }
  for (const doc of readPack("equipment").filter((d) => String(d.system["subtype"] ?? "").startsWith("Droid Accessories"))) {
    const item = convertOne(doc, "equipment", report);
    if (item) out.push(item);
  }
  return out;
}
