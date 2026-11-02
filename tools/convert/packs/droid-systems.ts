// Droid systems: the fork's droid-system pack, plus the droid accessories it keeps in its equipment
// pack (Hardened Systems, Translator Units). The fork's design is kept: a system is installed or
// removed, and only an installed one counts. Fields its own code never reads (locomotion speed,
// appendage counts and types) are dropped until droids are built (M2).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DROID_SYSTEM_GROUPS, type DroidSystemGroupKey } from "../../../src/config/droids.ts";
import { attachEffect, bonus } from "../lib/changes.ts";
import { cleanDescription } from "../lib/html.ts";
import { idFor, slugify } from "../lib/ids.ts";
import { checkKeys, itemDoc, readPack, type OutputDoc, type Report, type SourceDoc } from "../lib/pack.ts";

const PACK = "droid-systems";
const GROUP_BY_LABEL = new Map(Object.entries(DROID_SYSTEM_GROUPS).map(([key, label]) => [label as string, key as DroidSystemGroupKey]));
/** "Droid Accessories (Sensor Systems)" and "Processor Systems" both name a group. */
const groupOf = (subtype: string) => GROUP_BY_LABEL.get(subtype.replace(/^Droid Accessories \((.*)\)$/, "$1"));

/** Left out, each with the decision behind it. */
const EXCLUDED: Record<string, string> = {
  "Shield Expansion Module": 'Bryan, 2026-09-24: "No personal shields" (episode-vii, Equipment)',
};
/** The book's four Translator Units, replaced by the house unit (Bryan, 2026-11-01). */
const BOOK_TRANSLATORS = /^Translator Unit \(DC \d+\)$/;
/**
 * The snapshot page whose Translator Unit entry is the item's text and price. The droids page gives
 * 10 000 credits and 100-credit packs; the house rules page wins (rulings.md, Content).
 */
const TRANSLATOR_PAGE = "episode-vii";

/**
 * The house Translator Unit, read from the snapshot: the "Translator Units cost N credits ..." list
 * item and its three sub-items, one paragraph each. +4 INT for languages, as Linguist gives.
 */
function houseTranslator(report: Report): OutputDoc {
  const page = fileURLToPath(new URL(`../../../docs/rules/${TRANSLATOR_PAGE}.html`, import.meta.url));
  const html = readFileSync(page, "utf8").replaceAll("&#160;", " ");
  const entry = /<li>(Translator Units cost[^<]*)<ul>([\s\S]*?)<\/ul>/.exec(html);
  const cost = entry ? /cost ([\d ]+) credits/.exec(entry[1] ?? "")?.[1]?.replaceAll(" ", "") : undefined;
  if (!entry || !cost) throw new Error(`no Translator Unit entry with a price in ${TRANSLATOR_PAGE}.html`);
  const lines = [entry[1] ?? "", ...[...(entry[2] ?? "").matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1] ?? "")].map((t) => t.trim());
  if (lines.length !== 4) throw new Error(`Translator Unit entry in ${TRANSLATOR_PAGE}.html has ${lines.length} lines, expected 4`);
  const seed = `${PACK}:translator-unit`;
  const id = idFor(seed);
  report.note("house droid systems", `Translator Unit: ${TRANSLATOR_PAGE}, Droids (Bryan, 2026-11-01: "use the house translator unit")`);
  const item: OutputDoc = {
    _id: id, _key: `!items!${id}`, name: "Translator Unit", type: "droidSystem", effects: [], folder: null, sort: 0,
    system: { description: lines.map((t) => `<p>${t}</p>`).join(""), group: "translator", cost, requires: "", installed: false },
    flags: { holocron: { sourceBook: "" } },
  };
  attachEffect(item, seed, [bonus("languages.int", 4)]);
  return item;
}

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
  if (BOOK_TRANSLATORS.test(doc.name)) { report.exclude(sourcePack, doc, "replaced by the house Translator Unit (Bryan, 2026-11-01)"); return null; }
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
  out.push(houseTranslator(report));
  return out;
}
