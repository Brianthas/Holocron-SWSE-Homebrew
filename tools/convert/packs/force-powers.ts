// Force powers. The fork stores a power's fields as Active Effect changes on the item (survey,
// 2026-10-17): action, target, rollType, tag (descriptors), check ("DC:text", one per band),
// cumulative, takeMultipleTimes, shortDescription, and on one power each healing and
// lightsaberKineticCombat. Every change key is mapped, checked, or dropped with its reason here; any
// other key or value fails the run.

import { FORCE_DESCRIPTORS, type ForceDescriptorKey } from "../../../src/config/force.ts";
import { cleanDescription } from "../lib/html.ts";
import { slugify } from "../lib/ids.ts";
import { checkKeys, itemDoc, readPack, type OutputDoc, type Report, type SourceDoc } from "../lib/pack.ts";
import { REMOVED_POWERS } from "../rules.ts";

const PACK = "force-powers";
const DESCRIPTOR_BY_LABEL = new Map(Object.entries(FORCE_DESCRIPTORS).map(([key, label]) => [label as string, key as ForceDescriptorKey]));
/** Categories that name no descriptor: the pack itself, and Move Object's "Optional Rules". */
const PLAIN_CATEGORIES = new Set(["Force Powers", "Optional Rules"]);

interface Change { key: string; value: unknown }
export interface Band { dc: number; text: string }

const changesOf = (doc: SourceDoc): Change[] => {
  const raw = doc.system["changes"];
  return (Array.isArray(raw) ? raw : Object.values((raw ?? {}) as object)) as Change[];
};

/** "15:The target heals..." to { dc: 15, text: "The target heals..." }; null when it is not that shape. */
export function parseBand(value: unknown): Band | null {
  const match = /^(\d+):([\s\S]*)$/.exec(String(value));
  return match ? { dc: Number(match[1]), text: (match[2] ?? "").trim() } : null;
}

export function convertForcePowers(report: Report): OutputDoc[] {
  const out: OutputDoc[] = [];
  for (const doc of readPack(PACK)) {
    const removed = REMOVED_POWERS.get(doc.name);
    if (removed) {
      report.exclude(PACK, doc, `removed (${removed})`);
      continue;
    }
    checkKeys(PACK, doc, { mapped: ["description", "changes", "categories"], constant: { cost: "0" } }, report);
    const fail = (message: string) => report.problem(PACK, doc, message);

    let action = "";
    let target = "";
    let cumulative = false;
    const descriptors: ForceDescriptorKey[] = [];
    const bands: Band[] = [];
    const healingDcs: number[] = [];
    for (const change of changesOf(doc)) {
      const { key, value } = change;
      switch (key) {
        case "action": action = String(value).trim(); break;
        case "target": target = String(value).trim(); break;
        case "cumulative":
          if (typeof value !== "boolean") fail(`cumulative is ${JSON.stringify(value)}`);
          cumulative = value === true;
          break;
        case "tag": {
          const descriptor = DESCRIPTOR_BY_LABEL.get(String(value));
          if (descriptor) descriptors.push(descriptor);
          else fail(`unknown tag ${JSON.stringify(value)}`);
          break;
        }
        case "check": {
          const band = parseBand(value);
          if (band) bands.push(band);
          else fail(`check is not "DC:text": ${JSON.stringify(value).slice(0, 80)}`);
          break;
        }
        // Every power rolls Use the Force; the model's default.
        case "rollType": if (value !== "Use the Force") fail(`rollType ${JSON.stringify(value)}`); break;
        // Any power can be known more than once: copies.
        case "takeMultipleTimes": if (value !== "true") fail(`takeMultipleTimes ${JSON.stringify(value)}`); break;
        // A flattened copy of the description.
        case "shortDescription": break;
        // Vital Transfer's healing amounts; its check bands state the same amounts (checked below).
        case "healing": {
          const band = parseBand(value);
          if (band) healingDcs.push(band.dc);
          else fail(`healing is not "DC:formula": ${JSON.stringify(value)}`);
          break;
        }
        // A switch the fork's own code reads for Kinetic Combat; nothing here uses it yet.
        case "lightsaberKineticCombat": report.note("dropped lightsaberKineticCombat", doc.name); break;
        default: fail(`unmapped change ${key}: ${JSON.stringify(value).slice(0, 80)}`);
      }
    }
    for (const dc of healingDcs) if (!bands.some((b) => b.dc === dc)) fail(`healing at DC ${dc} has no check band`);

    // Categories repeat the tags as "<tag> Force Powers"; one that does not is reported.
    for (const { value } of (doc.system["categories"] ?? []) as { value: string }[]) {
      if (PLAIN_CATEGORIES.has(value)) continue;
      const descriptor = DESCRIPTOR_BY_LABEL.get(value.replace(/ Force Powers$/, ""));
      if (!descriptor || !descriptors.includes(descriptor)) fail(`category ${JSON.stringify(value)} is not one of its tags`);
    }

    const cleaned = cleanDescription(String(doc.system["description"] ?? ""));
    report.sections(PACK, doc, cleaned);
    const { html, sourceBook } = cleaned;
    if (!bands.length && /\bDC\s*\d+/.test(html)) report.note("powers with a DC in the text but no bands", doc.name);
    bands.sort((a, b) => a.dc - b.dc);
    out.push(itemDoc(`${PACK}:${slugify(doc.name)}`, doc.name, "forcePower",
      { description: html, descriptors: [...new Set(descriptors)].sort(), action, target, skill: "useTheForce", bands, cumulative, copies: 1, ready: 1 },
      doc, { sourceBook }));
  }
  return out;
}
