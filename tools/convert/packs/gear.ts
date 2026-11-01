// Weapons and armor. The fork's 34 weapons and 4 armors are the house tables' items; each value is
// checked against the table cells read from the episode-vii snapshot (lib/rules-tables.ts), and the
// table wins where the two differ. The three gloves are unarmed gear ("+1 Die Unarmed"), not
// weapons: they wait until the sheet tracks what is worn and applies one pair.

import { WEAPON_GROUPS } from "../../../src/config/weapons.ts";
import { bonus, attachEffect, type ChangeOut } from "../lib/changes.ts";
import { cleanDescription, textNotIn } from "../lib/html.ts";
import { slugify } from "../lib/ids.ts";
import { checkKeys, itemDoc, readPack, type OutputDoc, type Report, type SourceDoc } from "../lib/pack.ts";
import { armorTable, weaponTable } from "../lib/rules-tables.ts";

const GROUP_BY_HEADING = new Map(Object.entries(WEAPON_GROUPS).map(([key, label]) => [label.toUpperCase(), key]));
const SLOT_BY_SIZE: Record<string, string> = { "Light": "light", "2 Light": "twoLight", "Kit": "kit", "2 Kits": "twoKits" };
const DAMAGE_TYPES = ["Physical", "Energy", "Stun", "Ion", "Sonic", "Burn"];
const MELEE_GROUPS = new Set(["advancedMelee", "lightsabers"]);
/** Unarmed gear, held. */
const GLOVES = new Set(["Combat Gloves", "Power Gloves", "Shock Gloves"]);
/** episode-vii, Weapons: "Ranged weapons, including grenades, use DEX"; the fork rules them thrown as well (v1.4.0). */
const THROWN_BY_RULING = new Set(["Grenade"]);

const changesOf = (doc: SourceDoc) => {
  const raw = doc.system["changes"];
  return (Array.isArray(raw) ? raw : Object.values((raw ?? {}) as object)) as { key: string; value: unknown }[];
};
/** The description, with the table's special properties added when the fork's text lacks them. */
const describe = (doc: SourceDoc, special: string, report: Report, pack: string) => {
  const cleaned = cleanDescription(String(doc.system["description"] ?? ""));
  report.sections(pack, doc, cleaned);
  const missing = special && special !== "-" && textNotIn(special, cleaned.html).length;
  if (missing) report.note("table text added to a description", `${doc.name}: ${special}`);
  return { html: missing ? `${cleaned.html}<p>${special}</p>` : cleaned.html, sourceBook: cleaned.sourceBook };
};

export function convertWeapons(report: Report): OutputDoc[] {
  const PACK = "weapon";
  const table = new Map(weaponTable().map((row) => [row.name, row]));
  const out: OutputDoc[] = [];
  const seen = new Set<string>();
  for (const doc of readPack(PACK)) {
    const row = table.get(doc.name);
    if (!row) { report.problem(PACK, doc, "not in the house weapon table"); continue; }
    seen.add(doc.name);
    if (GLOVES.has(doc.name)) { report.exclude(PACK, doc, "held: unarmed gear, applied with worn gear and the one-pair rule (M1)"); continue; }
    const fail = (message: string) => report.problem(PACK, doc, message);
    // kitSlotCost and lightSlotCost repeat the table's size; size is the item's own size category.
    checkKeys(PACK, { ...doc, effects: [] }, {
      mapped: ["description", "changes", "subtype", "damageDie", "damageType", "kitSlotCost", "lightSlotCost", "size"],
      constant: { cost: "0", quantity: 1 },
    }, report);

    const group = GROUP_BY_HEADING.get(row.group);
    if (!group) { fail(`table group ${row.group}`); continue; }
    const slot = SLOT_BY_SIZE[row.size];
    if (!slot) { fail(`table size ${row.size}`); continue; }
    const forkSlots = Number(doc.system["kitSlotCost"] ?? 0) ? `${doc.system["kitSlotCost"]} kit` : `${doc.system["lightSlotCost"] ?? 1} light`;
    const tableSlots = { light: "1 light", twoLight: "2 light", kit: "1 kit", twoKits: "2 kit" }[slot];
    if (forkSlots !== tableSlots) report.note("slot from the table, where the fork differs", `${doc.name}: fork ${forkSlots}, table ${row.size}`);

    const forkDie = String(doc.system["damageDie"] ?? "");
    if (!`${row.damage} ${row.special}`.includes(forkDie)) fail(`damage ${forkDie} is not in the table's "${row.damage}" / "${row.special}"`);
    const named = DAMAGE_TYPES.filter((t) => row.damage.includes(t));
    const damageTypes = row.damage.includes("Varies")
      ? DAMAGE_TYPES.filter((t) => String(doc.system["damageType"] ?? "").includes(t))
      : named;
    if (!damageTypes.length) fail(`no damage type in "${row.damage}"`);
    const stunEffect = (doc.effects as { name: string }[]).some((e) => e.name === "Stun");
    if (stunEffect !== row.damage.includes("or Stun")) fail(`fork Stun setting ${stunEffect}, table "${row.damage}"`);

    const special = row.special;
    const twoHanded = /Requires two-hands/.test(special);
    const forkGrip = String(changesOf(doc).find((c) => c.key === "grip")?.value ?? "");
    if (forkGrip === "two handed" && !twoHanded) report.note("two-handed from the table, where the fork differs", `${doc.name}: fork "two handed", table "${row.damage}" (double weapons use STR or DEX as two single-handed weapons)`);
    const thrown = /Can be thrown/.test(special) || THROWN_BY_RULING.has(doc.name);
    for (const change of changesOf(doc)) {
      if (change.key === "grip") continue;
      if (change.key === "thrown") { if (!thrown) fail("fork thrown, table not"); continue; }
      if (change.key === "dualWieldPenaltyReduction") { report.note("dropped: dual-wielding penalty reduction is in the description", doc.name); continue; }
      fail(`unmapped change ${change.key}`);
    }
    const halfOnMiss = /(^|\. )Half damage on a miss/.test(special);
    const area = /foot line/.test(special);
    if (/burst is at -5/.test(special)) report.note("burst at -5 is an option the attacker takes, not the area flag", doc.name);

    const subtype = String(doc.system["subtype"] ?? "");
    const category = MELEE_GROUPS.has(group) || subtype === "Simple Melee Weapons" ? "melee" : "ranged";
    const { html, sourceBook } = describe(doc, special, report, PACK);
    out.push(itemDoc(`${PACK}:${slugify(doc.name)}`, doc.name, "weapon", {
      description: html, category, group, damage: forkDie, damageTypes, twoHanded, thrown, halfOnMiss, area, slot, carry: "carried",
    }, doc, { sourceBook }));
  }
  for (const name of table.keys()) if (!seen.has(name)) report.problems.push({ pack: PACK, name, message: "in the house weapon table but not in the fork" });
  return out;
}

export function convertArmor(report: Report): OutputDoc[] {
  const PACK = "armor";
  const table = new Map(armorTable().map((row) => [row.name, row]));
  const out: OutputDoc[] = [];
  for (const doc of readPack(PACK)) {
    const row = table.get(doc.name);
    if (!row) { report.problem(PACK, doc, "not in the house armor table"); continue; }
    const fail = (message: string) => report.problem(PACK, doc, message);
    checkKeys(PACK, doc, {
      mapped: ["description", "changes", "armorDexterityOverride", "armorFlatCheckPenalty", "armorFlatSpeedPenalty", "damageReduction", "strengthBonus"],
      constant: { cost: "0", quantity: 1, subtype: "Armor" },
    }, report);
    for (const change of changesOf(doc)) if (!(change.key === "armorType" && change.value === "Armor")) fail(`unmapped change ${change.key}`);

    const reflex = row.dexterity === "STR instead of DEX" ? { ability: "str", flat: 0 } : { ability: "", flat: Number(row.dexterity) };
    const forkDex = doc.system["armorDexterityOverride"];
    if (String(forkDex) !== (reflex.ability || String(reflex.flat))) fail(`Reflex term: fork ${JSON.stringify(forkDex)}, table "${row.dexterity}"`);
    const dr = /Damage Reduction (\d+)\/(\S+)/.exec(row.special);
    const damageReduction = dr ? Number(dr[1]) : 0;
    const drBypass = dr && dr[2] !== "-" ? (dr[2] ?? "").toLowerCase() : "";
    if (Number(doc.system["damageReduction"] ?? 0) !== damageReduction) fail(`DR: fork ${String(doc.system["damageReduction"])}, table "${row.special}"`);
    // "All armors reduce your speed by 5 feet and have an Armor Check Penalty of 2", except Mesh's
    // "No Speed or Armor Check Penalties" (episode-vii, Armor).
    const noPenalties = /No Speed or Armor Check Penalties/.test(row.special);
    const speedPenalty = noPenalties ? 0 : 5;
    const armorCheckPenalty = noPenalties ? 0 : 2;
    if (Number(doc.system["armorFlatSpeedPenalty"] ?? 0) !== speedPenalty || Number(doc.system["armorFlatCheckPenalty"] ?? 0) !== armorCheckPenalty) {
      fail(`penalties: fork ${String(doc.system["armorFlatSpeedPenalty"])}/${String(doc.system["armorFlatCheckPenalty"])}, table ${speedPenalty}/${armorCheckPenalty}`);
    }
    const changes: ChangeOut[] = [];
    const strength = /\+(\d+) Strength Score/.exec(row.special);
    if (strength) changes.push(bonus("ability.str", Number(strength[1])));
    if (Number(doc.system["strengthBonus"] ?? 0) !== Number(strength?.[1] ?? 0)) fail(`strength: fork ${String(doc.system["strengthBonus"])}, table "${row.special}"`);
    report.note("Beskar upgrade not modelled (Mandalorians only, episode-vii, Armor)", `${doc.name}: ${row.beskar}`);

    const { html, sourceBook } = describe(doc, "", report, PACK);
    const seed = `${PACK}:${slugify(doc.name)}`;
    const item = itemDoc(seed, doc.name, "armor", { description: html, reflex, damageReduction, drBypass, speedPenalty, armorCheckPenalty, worn: false }, doc, { sourceBook });
    attachEffect(item, seed, changes);
    out.push(item);
  }
  return out;
}
