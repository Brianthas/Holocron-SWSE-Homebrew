// Classes. The fork's classes are the baseline (Bryan, 2026-11-01: "use swse homebrew edition for
// baselines"), and its own house-rules pass already gives most classes the house trees. This applies
// what the fork flattens: the house class table is asserted, banned trees come off every class, and
// the three classes that "may select talents from any Force Tradition, with some limitations" keep
// only their named trees plus GM-approval access (rulings.md, Classes).
//
// A class's trees: the "<Class> Talent Trees" groups its changes and level effects provide, then
// every tree whose talents list that group. Dropped, each with its reason: per-level BAB ("All Heroic
// and Prestige Classes have BAB equal to Level"), class Defense bonuses ("There is no longer default
// class bonus to Defenses per class"), class skills and feat lists, class Force Points, and
// prerequisites ("The only prerequisites for ANY Prestige Class are having Heroic Levels and
// roleplay justification"), all episode-vii, Classes and Prestige Classes.

import { WEAPON_GROUPS } from "../../../src/config/weapons.ts";
import { isFanContent } from "../lib/changes.ts";
import { cleanDescription } from "../lib/html.ts";
import { slugify } from "../lib/ids.ts";
import { checkKeys, itemDoc, readPack, type OutputDoc, type Report, type SourceDoc } from "../lib/pack.ts";
import { talentTreeGroups } from "./talents.ts";

const PACK = "classes";
const BASE = ["Jedi", "Noble", "Smuggler", "Soldier"];
/** NPC, beast, follower and droid classes come with M2. */
const HELD = new Set(["Aggressive Follower", "Defensive Follower", "Utility Follower", "Beast", "Nonheroic", "Independent Droid"]);
/** episode-vii, Jedi: "The following talent trees have been banned"; "Zeison Sha Warrior" is the Zeison Sha tree. */
export const BANNED_TREES = new Set(["Agent of Ossus", "Aing-Tii Monk", "Iron Knight", "White Current Adept", "Zeison Sha"]);

/** The house class table (episode-vii, Classes), which the fork's values must match. */
const HOUSE_TABLE: Record<string, { hp: number; die: number; skills: number; weapons: string[]; feat: string }> = {
  Jedi: { hp: 30, die: 10, skills: 4, weapons: ["Advanced Melee Weapons", "Lightsabers", "Pistols", "Simple Weapons"], feat: "Force Sensitivity" },
  Noble: { hp: 18, die: 6, skills: 6, weapons: ["Advanced Melee Weapons", "Pistols", "Simple Weapons"], feat: "Linguist" },
  Smuggler: { hp: 24, die: 8, skills: 5, weapons: ["Advanced Melee Weapons", "Pistols", "Rifles", "Simple Weapons"], feat: "Quick Draw" },
  Soldier: { hp: 30, die: 10, skills: 4, weapons: ["Advanced Melee Weapons", "Pistols", "Rifles", "Simple Weapons"], feat: "Armor Proficiency" },
};

/**
 * The three classes that "may select talents from any Force Tradition, with some limitations": the
 * trees episode-vii names for them, and the single talents they "gain access to ... independent from"
 * their banned trees (episode-vii, Prestige Classes; rulings.md, Talent trees: Zeison Sha).
 */
const ANY_TRADITION: Record<string, { trees: string[]; talents: string[] }> = {
  "Force Disciple": { trees: [], talents: ["Many Shades of the Force", "Telekinetic Vigilance"] },
  "Jedi Master": { trees: ["Duelist", "Jedi Archivist", "Jedi Instructor", "Lightsaber Forms"], talents: ["Many Shades of the Force", "Telekinetic Vigilance"] },
  "Sith Lord": { trees: ["Believer Disciple", "Duelist", "Lightsaber Forms", "Sith Alchemy", "Sith Commander", "Krath"], talents: ["Many Shades of the Force", "Telekinetic Vigilance"] },
};

const GROUP_KEY = new Map(Object.entries(WEAPON_GROUPS).map(([key, label]) => [label as string, key]));
/** The fork's proficiency names: "Simple Weapons" and "Advanced Melee" for the house table's groups. */
const FORK_WEAPON = new Map([["Advanced Melee", "Advanced Melee Weapons"], ["Simple Weapons", "Simple Weapons"], ["Lightsabers", "Lightsabers"], ["Pistols", "Pistols"], ["Rifles", "Rifles"]]);

const changesOf = (x: unknown) => (Array.isArray(x) ? x : Object.values((x ?? {}) as object)) as { key: string; value: unknown }[];

/** Class change keys the house rules replace, each with the reason. */
const DROPPED_CLASS_KEYS: Record<string, string> = {
  classForcePoints: "Force Points come from level (episode-vii, Force Points)",
  classReflexDefenseBonus: "no class bonus to Defenses (episode-vii, Classes)",
  classFortitudeDefenseBonus: "no class bonus to Defenses (episode-vii, Classes)",
  classWillDefenseBonus: "no class bonus to Defenses (episode-vii, Classes)",
  classSkill: "no list of skills per class (episode-vii, Classes)",
  classFeat: "proficiencies and the starting feat come from the house class table",
  weaponProficiency: "proficiencies come from the house class table",
  isFollowerTemplate: "followers come with M2",
};
/** Level-effect keys: BAB is level, trees and feats come from the level-up guide, features are text. */
const LEVEL_KEYS_DROPPED: Record<string, string> = {
  baseAttackBonus: "BAB equal to level (episode-vii, Classes)",
  providedTrait: "class features are text until the sheet applies them",
};

export function convertClasses(report: Report): OutputDoc[] {
  const treeGroups = talentTreeGroups();
  const traditionTrees = treeGroups.get("Force Tradition Talent Trees") ?? new Set<string>();
  if (!traditionTrees.size) report.problems.push({ pack: PACK, name: "(all)", message: "no tree lists Force Tradition Talent Trees" });
  const allTrees = new Set([...treeGroups.values()].flatMap((s) => [...s]));
  const out: OutputDoc[] = [];
  for (const doc of readPack(PACK)) {
    if (isFanContent(doc)) { report.exclude(PACK, doc, "Homebrew Content or a fan creator's tag (rulings.md, Content)"); continue; }
    if (HELD.has(doc.name)) { report.exclude(PACK, doc, "held: NPC, follower, beast and droid classes come with M2"); continue; }
    const source: SourceDoc = { ...doc, effects: [] };
    // displayName, subtype and choices are the fork's dialog and labels; prerequisite: any heroic levels.
    checkKeys(PACK, source, { mapped: ["description", "changes", "prerequisite", "choices", "subtype", "displayName"], constant: { cost: "0" } }, report);
    const fail = (message: string) => report.problem(PACK, doc, message);
    const get = (key: string) => changesOf(doc.system["changes"]).filter((c) => c.key === key).map((c) => c.value);

    const groups = new Set<string>();
    const techniqueLevels: number[] = [];
    const secretLevels: number[] = [];
    for (const change of changesOf(doc.system["changes"])) {
      if (change.key === "provides") groups.add(String(change.value).replace(/:\d+$/, ""));
      else if (["levelUpHitPoints", "isHeroic", "isPrestige", "firstLevelHitPoints", "trainedSkillsFirstLevel"].includes(change.key)) continue;
      else if (DROPPED_CLASS_KEYS[change.key]) report.note(`dropped: ${DROPPED_CLASS_KEYS[change.key]}`, doc.name);
      else fail(`unmapped change ${change.key}: ${JSON.stringify(change.value).slice(0, 60)}`);
    }
    for (const effect of doc.effects as { name: string; changes?: unknown; system?: { changes?: unknown } }[]) {
      const level = Number(/^Level (\d+)$/.exec(effect.name)?.[1]);
      if (!level) { fail(`effect "${effect.name}" is not a Level N effect`); continue; }
      for (const change of changesOf(effect.changes ?? effect.system?.changes)) {
        const value = String(change.value);
        if (change.key === "provides" && /Talent Trees/.test(value)) groups.add(value.replace(/:\d+$/, ""));
        else if (change.key === "provides" && /^Force Technique/.test(value)) techniqueLevels.push(level);
        else if (change.key === "provides" && /^Force Secret/.test(value)) secretLevels.push(level);
        else if (change.key === "provides" && /^General Feats/.test(value)) continue; // the feat cadence is the level-up guide's
        else if (change.key === "provides") fail(`level ${level} provides ${value}`);
        else if (LEVEL_KEYS_DROPPED[change.key]) continue;
        else report.note("dropped: class features are text until the sheet applies them", `${doc.name}: ${change.key}`);
      }
    }

    const heroic = get("isHeroic")[0] === true || get("isHeroic")[0] === "true";
    const prestige = get("isPrestige")[0] === true || get("isPrestige")[0] === "true";
    const base = BASE.includes(doc.name);
    if (base === prestige) fail(`base ${base} but isPrestige ${prestige}`);
    const die = Number(/^1d(\d+)$/.exec(String(get("levelUpHitPoints")[0] ?? ""))?.[1]);
    if (!die) { fail(`hit die ${JSON.stringify(get("levelUpHitPoints"))}`); continue; }

    let hpFirstLevel = 0;
    let trainedSkills = 0;
    let weaponProficiencies: string[] = [];
    let startingFeat = "";
    if (base) {
      const house = HOUSE_TABLE[doc.name];
      if (!house) { fail("base class missing from the house table"); continue; }
      const forkWeapons = get("weaponProficiency").map((w) => FORK_WEAPON.get(String(w)) ?? `?${String(w)}`).sort();
      const checks: [string, unknown, unknown][] = [
        ["level-1 hit points", Number(get("firstLevelHitPoints")[0]), house.hp], ["hit die", die, house.die],
        ["trained skills", Number(get("trainedSkillsFirstLevel")[0]), house.skills], ["weapons", forkWeapons.join(", "), [...house.weapons].sort().join(", ")],
        ["starting feat", get("classFeat").includes(house.feat), true],
      ];
      for (const [what, fork, table] of checks) if (fork !== table) fail(`${what}: fork ${JSON.stringify(fork)}, house table ${JSON.stringify(table)}`);
      ({ hp: hpFirstLevel, skills: trainedSkills, feat: startingFeat } = house);
      weaponProficiencies = house.weapons.map((w) => GROUP_KEY.get(w) ?? "");
    }

    const forkTrees = [...groups].flatMap((g) => [...(treeGroups.get(g) ?? [])]);
    if (groups.size && !forkTrees.length) fail(`provides ${[...groups].join(", ")} but no tree lists it`);
    const banned = forkTrees.filter((t) => BANNED_TREES.has(t));
    if (banned.length) report.note("banned trees removed from a class", `${doc.name}: ${banned.join(", ")}`);
    let trees = forkTrees.filter((t) => !BANNED_TREES.has(t));
    const anyTradition = ANY_TRADITION[doc.name];
    if (anyTradition) {
      const unnamed = trees.filter((t) => traditionTrees.has(t) && !anyTradition.trees.includes(t));
      report.note("Force Tradition trees moved to GM approval", `${doc.name}: ${unnamed.join(", ")}`);
      trees = trees.filter((t) => !unnamed.includes(t));
      for (const t of anyTradition.trees) {
        if (!allTrees.has(t)) fail(`named tree "${t}" is not a tree`);
        else if (!trees.includes(t)) trees.push(t);
      }
    }
    const cleaned = cleanDescription(String(doc.system["description"] ?? ""));
    report.sections(PACK, doc, cleaned);
    out.push(itemDoc(`${PACK}:${slugify(doc.name)}`, doc.name, "class", {
      description: cleaned.html,
      category: base ? "base" : "prestige",
      heroic,
      hitDie: die,
      hpFirstLevel, trainedSkills, weaponProficiencies, startingFeat,
      talentTrees: [...new Set(trees)].sort(),
      talents: anyTradition?.talents ?? [],
      traditionApproval: Boolean(anyTradition),
      techniqueLevels: techniqueLevels.sort((a, b) => a - b),
      secretLevels: secretLevels.sort((a, b) => a - b),
    }, doc, { sourceBook: cleaned.sourceBook }));
  }
  return out;
}
