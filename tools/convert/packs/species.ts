// Species. The fork's species carry no size or ability fields: each links trait documents in the
// traits pack by name (providedItems), and its size is one of those traits. The fork's house-rules
// pass already took out the ability and walking-speed traits the size table replaces ("The
// following adjustments replace any relevant factors for species", episode-vii, Species); any left
// are dropped here with that reason. The 14 droid models choose their size when built and wait for
// the droid rules (M2).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { addEffect, isFanContent, type ChangeOut } from "../lib/changes.ts";
import { cleanDescription, textNotIn } from "../lib/html.ts";
import { slugify } from "../lib/ids.ts";
import { checkKeys, itemDoc, readPack, type OutputDoc, type Report, type SourceDoc } from "../lib/pack.ts";
import { traitChanges } from "./traits.ts";

const PACK = "species";
const SIZE_TRAITS: Record<string, string> = { Small: "small", Medium: "medium", Large: "large" };
/** Traits the size table replaces, and traits that are bookkeeping rather than traits. */
const REPLACED = /^(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) \([+-]\d+\)$|^(Base|Walking) Speed \(\d+\)$/;
const NOT_TRAITS = new Set(["Web Enhancements"]);
/** Species whose size the rulings set instead of the fork's data. */
const SIZE_RULINGS: Record<string, { choices: string[]; replaces: string[]; source: string }> = {
  "Killik": {
    choices: ["small", "medium", "large"],
    replaces: ["Variable Size"],
    source: "rulings.md, Content: Killik size, Small to Large, chosen at creation",
  },
};

/** The species rarity page: each list is the line after its lead-in sentence; Human and the "very common" line are Common. */
export function readRarity(html: string): Map<string, "common" | "rare" | "denied"> {
  const lines = html.replace(/<[^>]+>/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  const listAfter = (lead: string) => {
    const at = lines.findIndex((l) => l.startsWith(lead));
    if (at < 0) throw new Error(`species rarity: no line starts "${lead}"`);
    return (lines[at + 1] ?? "").split(",").map((s) => s.trim().replace(/\.$/, "")).filter(Boolean);
  };
  const veryCommon = (lines.find((l) => l.startsWith("Caamasi,")) ?? "").replace(/ are also very common.*$/, "").split(",").map((s) => s.trim());
  const rarity = new Map<string, "common" | "rare" | "denied">();
  for (const name of ["Human", ...veryCommon, ...listAfter("The following Species are common enough")]) rarity.set(name, "common");
  for (const name of listAfter("The following Species are Rare")) rarity.set(name, "rare");
  for (const name of listAfter("The following Species for all intents")) rarity.set(name, "denied");
  return rarity;
}

const changesOf = (doc: SourceDoc) => {
  const raw = doc.system["changes"];
  return (Array.isArray(raw) ? raw : Object.values((raw ?? {}) as object)) as { key: string; value: unknown }[];
};

export function convertSpecies(report: Report): OutputDoc[] {
  const rarityPage = readFileSync(fileURLToPath(new URL("../../../docs/rules/species-rarity.html", import.meta.url)), "utf8");
  const rarity = readRarity(rarityPage);
  const traitDocs = new Map(readPack("traits").filter((d) => !String(d["_key"]).startsWith("!folders!")).map((t) => [t.name, t]));
  const out: OutputDoc[] = [];
  const listed = new Set<string>();
  for (const doc of readPack(PACK)) {
    if (isFanContent(doc)) {
      report.exclude(PACK, doc, "Homebrew Content or a fan creator's tag (rulings.md, Content)");
      continue;
    }
    if (changesOf(doc).some((c) => c.key === "isDroid")) {
      report.exclude(PACK, doc, "held: a droid model, built with the droid rules (M2)");
      continue;
    }
    // categories repeat the trait names; choices are the near-human and Killik size dialogs, which
    // the sheet replaces.
    checkKeys(PACK, doc, { mapped: ["description", "changes", "categories", "choices", "providedItems"], constant: { cost: "0" } }, report);
    for (const change of changesOf(doc)) {
      if (change.key === "maySpeak") report.note("dropped: languages are the species language plus the INT table (rulings.md, Languages)", doc.name);
      else report.problem(PACK, doc, `unmapped change ${change.key}: ${JSON.stringify(change.value).slice(0, 80)}`);
    }
    const ruling = SIZE_RULINGS[doc.name];
    // The fork's choice dialogs: a default option (Human's) is the species as printed, so its traits
    // count; a choice with no default is the player's, made on the sheet; ability options are
    // replaced by the size table's "+2 ANY"; Killik's size choice is replaced by its ruling.
    type Link = { name: string; type: string };
    const links: Link[] = [...((doc.system["providedItems"] ?? []) as Link[])];
    for (const choice of (doc.system["choices"] ?? []) as { description?: string; options?: { name: string; isDefault?: boolean; providedItems?: Link[] }[] }[]) {
      const options = choice.options ?? [];
      const byDefault = options.find((o) => o.isDefault);
      const abilityOnly = options.every((o) => (o.providedItems ?? []).every((p) => REPLACED.test(p.name)));
      if (ruling) report.note("dropped: the fork's size choice, replaced by a ruling", doc.name);
      else if (abilityOnly) report.note("dropped: replaced by the size table (episode-vii, Species)", `${doc.name}: ${choice.description ?? "choice"}`);
      else if (byDefault) links.push(...(byDefault.providedItems ?? []));
      else report.note("species choices left to the sheet", `${doc.name}: ${choice.description ?? ""} ${options.map((o) => o.name).join(" / ")}`);
    }

    let size = "";
    const traits: { name: string; description: string }[] = [];
    const traitEffects: { name: string; changes: ChangeOut[] }[] = [];
    const cleanedSpecies = cleanDescription(String(doc.system["description"] ?? ""));
    for (const link of links) {
      if (link.type === "feat") { report.note("dropped: species feats are granted on the sheet (M1); the trait names them", `${doc.name}: ${link.name}`); continue; }
      if (link.type !== "trait") { report.problem(PACK, doc, `provided ${link.type} "${link.name}" on a living species`); continue; }
      const sized = SIZE_TRAITS[link.name];
      if (sized) { size = sized; continue; }
      if (REPLACED.test(link.name)) { report.note("dropped: replaced by the size table (episode-vii, Species)", `${doc.name}: ${link.name}`); continue; }
      if (NOT_TRAITS.has(link.name) || ruling?.replaces.includes(link.name)) { report.note("dropped: not a trait, or replaced by a ruling", `${doc.name}: ${link.name}`); continue; }
      const traitDoc = traitDocs.get(link.name) ?? traitDocs.get(link.name.replace(/ \(.*\)$/, ""));
      const description = traitDoc ? cleanDescription(String(traitDoc.system["description"] ?? "")).html : "";
      if (!traitDoc) report.note("traits with no trait document (name only)", `${doc.name}: ${link.name}`);
      // A trait named for the species holds its flavour text; kept only if the description lacks it.
      if (link.name === doc.name || link.name === doc.name.replace(/ \(.*\)$/, "")) {
        if (textNotIn(description, cleanedSpecies.html).length) report.problem(PACK, doc, `species-name trait "${link.name}" holds text the description lacks`);
        continue;
      }
      traits.push({ name: link.name, description });
      traitEffects.push({ name: link.name, changes: traitChanges(link.name, traitDoc, description, doc, report) });
    }
    if (ruling) {
      report.note("size rulings", `${doc.name}: ${ruling.source}`);
      size = "medium";
    }
    if (!size) { report.problem(PACK, doc, "no size trait"); continue; }
    const r = rarity.get(doc.name) ?? rarity.get(doc.name.replace(/ \(.*\)$/, ""));
    if (r) listed.add(rarity.has(doc.name) ? doc.name : doc.name.replace(/ \(.*\)$/, ""));
    else report.note("species the rarity page does not list", doc.name);
    report.sections(PACK, doc, cleanedSpecies);
    const seed = `${PACK}:${slugify(doc.name)}`;
    const item = itemDoc(seed, doc.name, "species", {
      description: cleanedSpecies.html, size, sizeChoices: ruling?.choices ?? [], rarity: r ?? "", droid: false, traits,
    }, doc, { sourceBook: cleanedSpecies.sourceBook });
    for (const effect of traitEffects) addEffect(item, `${seed}:trait:${slugify(effect.name)}`, effect.name, effect.changes);
    out.push(item);
  }
  for (const name of rarity.keys()) if (!listed.has(name)) report.note("rarity page names with no species", name);
  return out;
}
