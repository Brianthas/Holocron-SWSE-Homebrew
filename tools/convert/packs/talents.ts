// Talents. Each sits in a tree folder, and its system.talentTree repeats the folder's name (all
// 1398, survey 2026-11-01). The fork stores mechanics as changes on the item: 45 keys. Each key
// below is mapped to a Holocron change, read into a field, or dropped with its reason; any other
// key fails the run. Tree access does not come from pack data (Holocron CLAUDE.md), so categories,
// possibleProviders and bonusTalentTree are dropped; the trees each class reaches are rulings.

import { SKILLS } from "../../../src/config/skills.ts";
import { WEAPON_GROUPS } from "../../../src/config/weapons.ts";
import {
  attachEffect, bonus, dice, dropped, exact, flatOrSwap, grant, isFanContent, number, runChanges, shortDescriptionCarry,
  type ChangeOut, type Context, type Mapper, type Prerequisite,
} from "../lib/changes.ts";
import { cleanDescription } from "../lib/html.ts";
import { idFor, slugify } from "../lib/ids.ts";
import { checkKeys, itemDoc, readPack, type OutputDoc, type Report, type SourceDoc } from "../lib/pack.ts";

const PACK = "talents";

/** "Lightsaber Combat Talent Tree" to "Lightsaber Combat". */
export const treeName = (folderName: string): string => folderName.replace(/ Talent Tree$/, "");

/**
 * The name without a tree suffix the wiki adds where names repeat across trees: "Charm Beast
 * (Beastwarden Talent Tree)" is Charm Beast in the Beastwarden tree. Only the talent's own tree is
 * stripped, so "Weapon Specialization (Lightsabers)" keeps its bracket.
 */
export const plainName = (name: string, folderName: string): string => name.replace(` (${folderName})`, "");

const GROUP_BY_LABEL = new Map(Object.entries(WEAPON_GROUPS).map(([key, label]) => [label as string, key]));
/** A talent naming a weapon group ("Lightsabers") gets the bonus; "#payload#" is a choice, dropped. */
const groupBonus = (selector: "attack" | "damage", amount: number, source: string): Mapper => (value, ctx) => {
  if (value === "#payload#") return ctx.drop(CHOICE);
  const group = GROUP_BY_LABEL.get(String(value));
  if (!group) return ctx.fail(`no weapon group ${JSON.stringify(value)}`);
  ctx.changes.push(bonus(`${selector}.group.${group}`, amount));
  ctx.drop(`${source} (mapped)`);
};

const STR_SKILLS = Object.entries(SKILLS).filter(([, s]) => s.ability === "str").map(([key]) => key);

/** Changes the house rules give a talent that the fork's data does not. */
export const HOUSE_CHANGES: Record<string, { changes: ChangeOut[]; source: string }> = {
  "Murderous Arts": {
    changes: [dice("damage.all", 1)],
    source: 'episode-vii, New Prestige Classes: "Murderous Arts, which has no prerequisites, has the effect of +1 die, unless you have Mark in which case it is +2 dice." (the Mark half is not applied)',
  },
};

const CHOICE = "choice talent: its change needs the chosen weapon or skill in its selector, which the grammar does not have yet";
const CARD = "applied by the card or dialog that uses it";
const CONDITIONAL = "conditional: applies only in a situation the sheet cannot see";

export const TALENT_KEYS: Record<string, Mapper> = {
  takeMultipleTimes: (value, ctx) => {
    const n = number(value);
    if (value === true || value === "true") ctx.repeatable = true;
    else if (n !== null && n > 1) { ctx.repeatable = true; ctx.maxTimes = n; }
    else ctx.fail(`takeMultipleTimes ${JSON.stringify(value)}`);
  },
  takeMultipleTimesMax: (value, ctx) => {
    const n = number(value);
    if (n === null || n < 2) return ctx.fail(`takeMultipleTimesMax ${JSON.stringify(value)}`);
    ctx.maxTimes = n;
  },
  // Force of Will: "You gain a +2 insight bonus to your Will Defense"; the ally half is a table call.
  willDefenseBonus: (value, ctx) => flatOrSwap("defense.will", ctx.name === "Force of Will" ? "insight" : "")(value, ctx),
  reflexDefenseBonus: flatOrSwap("defense.reflex"),
  fortitudeDefenseBonus: flatOrSwap("defense.fortitude"),
  // Amounts from the talents' own text: Greater Weapon Focus "+1 bonus on melee attack rolls",
  // Weapon Specialization and Greater Weapon Specialization "+2 bonus on melee damage rolls".
  greaterWeaponFocus: groupBonus("attack", 1, "Greater Weapon Focus +1"),
  weaponSpecialization: groupBonus("damage", 2, "Weapon Specialization +2"),
  greaterWeaponSpecialization: groupBonus("damage", 2, "Greater Weapon Specialization +2"),
  // Tough as Nails: "You can catch a Second Wind one extra time per day."
  bonusSecondWind: exact("1", (_v, ctx) => ctx.changes.push(bonus("secondWind", 1))),
  // Cargo Hauler: "+5 bonus on Strength-based Skill Checks" and "double your Carrying Capacity".
  skillBonus: exact("str:5", (_v, ctx) => { for (const skill of STR_SKILLS) ctx.changes.push(bonus(`skill.${skill}`, 5)); }),
  carryCapacityMultiplier: exact("2", (_v, ctx) => ctx.changes.push(grant("flag", "extendedCapacity"))),
  skillReRoll: dropped("rerolls are text until the roll dialog applies them"),
  skillSubstitution: dropped(`skill substitution is ${CARD}`),
  skillSubstitutionAlways: dropped(`skill substitution is ${CARD}`),
  action: dropped("a summary of the description; the activation cost is in the text"),
  note: dropped("a summary of the description"),
  // Usually a flattened copy of the description; shortDescriptionCarry checks it below.
  shortDescription: () => undefined,
  actsAs: dropped("names the same talent in another tree; decided with the shared names"),
  rollable: dropped(`Dueling Stance's checks are ${CARD}`),
  createFollower: dropped("followers are not modelled yet"),
  followerProvides: dropped("followers are not modelled yet"),
  followerCreationProvides: dropped("followers are not modelled yet"),
  armoredDefense: dropped("worn armor replaces the DEX term of Reflex, so there is no armor bonus to apply (episode-vii, Equipment)"),
  improvedArmoredDefense: dropped("worn armor replaces the DEX term of Reflex, so there is no armor bonus to apply (episode-vii, Equipment)"),
  lightsaberDefense: dropped(`Lightsaber Defense is a Swift Action bonus, ${CARD}`),
  lightsabersDamageStat: dropped("an attack ability choice, made per attack on the sheet"),
  lightsaberAtaru: dropped("an attack ability choice, made per attack on the sheet"),
  lightsaberNobleFencing: dropped("an attack ability choice, made per attack on the sheet"),
  telekineticProdigy: dropped(`a Force power option, ${CARD}`),
  redirectedShotBonus: dropped(`a Redirection Stance option, ${CARD}`),
  dualWieldPenaltyReduction: dropped(`an attack option, ${CARD}`),
  sneakAttack: dropped(CONDITIONAL),
  sentinelStrike: dropped(CONDITIONAL),
  spacehound: dropped("gravity and starship weapons are not modelled"),
  devastatingAttack: dropped(CHOICE),
  disarmingAttack: dropped(CHOICE),
  exceptionalSkill: dropped(CHOICE),
  greaterDevastatingAttack: dropped(CHOICE),
  greaterPenetratingAttack: dropped(CHOICE),
  penetratingAttack: dropped(CHOICE),
};

/**
 * Talents the house rules allow that the fork does not have, written from the ruling's text. Who
 * may take one is the class's access (rulings.md, Talent trees), not the item's.
 */
export const HOUSE_TALENTS = [
  {
    name: "Telekinetic Vigilance",
    tree: "Zeison Sha",
    description: "<p><b>Prerequisite:</b> Intercept</p><p>You can return the Intercept Force Power to your Force Power Suite as a Swift Action, without spending a Force Point.</p>",
    prerequisite: { text: "Intercept", nodes: { text: "Intercept", requirement: "Intercept", type: "FORCE POWER" } },
    sourceBook: "Star Wars Saga Edition Jedi Academy Training Manual",
    source: "rulings.md, Talent trees: Zeison Sha (Bryan, from tovec, 2026-11-01)",
  },
];

function houseTalent(entry: (typeof HOUSE_TALENTS)[number], report: Report): OutputDoc {
  const seed = `${PACK}:${slugify(entry.tree)}:${slugify(entry.name)}`;
  const id = idFor(seed);
  report.note("house talents", `${entry.tree}/${entry.name}: ${entry.source}`);
  return {
    _id: id, _key: `!items!${id}`, name: entry.name, type: "talent", effects: [], folder: null, sort: 0,
    system: { description: entry.description, tree: entry.tree, prerequisite: entry.prerequisite, repeatable: false, maxTimes: 0, choice: "", action: "" },
    flags: { holocron: { sourceBook: entry.sourceBook } },
  };
}

/** Effects the fork embeds on a talent, each read and dropped by name. */
const EMBEDDED_EFFECTS: Record<string, string> = {
  "Spacehound": "Low Gravity, a disabled status effect; gravity is not modelled",
};

/**
 * The fork's tree groups ("Jedi Talent Trees", "Force Tradition Talent Trees"): each group, and the
 * trees whose non-fan talents list it in categories or possibleProviders. Classes provide groups.
 */
export function talentTreeGroups(): Map<string, Set<string>> {
  const all = readPack(PACK);
  const folders = new Map(all.filter((d) => String(d["_key"]).startsWith("!folders!")).map((f) => [f._id, f.name]));
  const groups = new Map<string, Set<string>>();
  for (const talent of all.filter((d) => !String(d["_key"]).startsWith("!folders!") && !isFanContent(d))) {
    const tree = treeName(folders.get(talent.folder ?? "") ?? "");
    const tags = [
      ...((talent.system["categories"] ?? []) as { value?: string }[]).map((c) => c.value ?? ""),
      ...((talent.system["possibleProviders"] ?? []) as unknown[]).map(String),
    ];
    for (const tag of tags.filter((t) => / Talent Trees$/.test(t))) (groups.get(tag) ?? groups.set(tag, new Set()).get(tag))?.add(tree);
  }
  return groups;
}

export function convertTalents(report: Report): OutputDoc[] {
  const all = readPack(PACK);
  const folders = new Map(all.filter((d) => String(d["_key"]).startsWith("!folders!")).map((f) => [f._id, f.name]));
  const out: OutputDoc[] = [];
  for (const doc of all.filter((d) => !String(d["_key"]).startsWith("!folders!"))) {
    const folder = folders.get(doc.folder ?? "");
    if (!folder || doc.system["talentTree"] !== folder) {
      report.problem(PACK, doc, `tree folder ${JSON.stringify(folder)} and talentTree ${JSON.stringify(doc.system["talentTree"])} disagree`);
      continue;
    }
    if (isFanContent(doc)) {
      report.exclude(PACK, doc, `Homebrew Content or a fan creator's tag (rulings.md, Content); tree ${folder}`);
      continue;
    }
    const embedded = EMBEDDED_EFFECTS[doc.name];
    const source: SourceDoc = embedded ? { ...doc, effects: [] } : doc;
    if (embedded) report.note(`dropped: ${embedded}`, doc.name);
    // talentTreeUrl is the wiki page; textDescription repeats the description as text (Dueling and
    // Redirection Stance); providedItems are the lightsaber forms' equipped-weapon traits and Stolen
    // Form's choice, all read off the description at the table.
    checkKeys(PACK, source, {
      mapped: ["description", "changes", "categories", "possibleProviders", "choices", "prerequisite", "source", "talentTree", "talentTreeUrl", "bonusTalentTree", "textDescription", "providedItems"],
      constant: { cost: "0" },
    }, report);
    const ctx: Context = {
      name: doc.name, changes: [], repeatable: false, maxTimes: 0,
      drop: (reason) => report.note(`dropped: ${reason}`, doc.name),
      fail: (message) => report.problem(PACK, doc, message),
    };
    runChanges(doc, TALENT_KEYS, ctx);
    const house = HOUSE_CHANGES[doc.name];
    if (house) {
      ctx.changes.push(...house.changes);
      report.note("house changes", `${doc.name}: ${house.source}`);
    }

    const cleaned = cleanDescription(String(doc.system["description"] ?? ""));
    report.sections(PACK, doc, cleaned);
    const name = plainName(doc.name, folder);
    if (name !== doc.name) report.note("shared names", `${name}: ${treeName(folder)}`);
    const tree = treeName(folder);
    const prerequisite = (doc.system["prerequisite"] ?? null) as Prerequisite | null;
    const seed = `${PACK}:${slugify(tree)}:${slugify(name)}`;
    const item = itemDoc(seed, name, "talent", {
      description: shortDescriptionCarry(doc, report, PACK) + cleaned.html,
      tree,
      prerequisite: { text: prerequisite?.text ?? "", nodes: prerequisite && Object.keys(prerequisite).length ? prerequisite : null },
      repeatable: ctx.repeatable,
      maxTimes: ctx.maxTimes,
      choice: "",
      action: "",
    }, doc, { sourceBook: String(doc.system["source"] ?? "") || cleaned.sourceBook });
    attachEffect(item, seed, ctx.changes);
    out.push(item);
  }
  for (const entry of HOUSE_TALENTS) {
    if (out.some((t) => t.name === entry.name && t.system["tree"] === entry.tree)) report.problems.push({ pack: PACK, name: entry.name, message: "house talent also converted from the fork" });
    out.push(houseTalent(entry, report));
  }
  return out;
}
