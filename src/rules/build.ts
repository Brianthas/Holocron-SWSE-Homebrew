import type { AbilityKey } from "../config/abilities.ts";
import type { SizeKey } from "../config/sizes.ts";
import { total, type Breakdown, type Modifier } from "./modifiers.ts";

/**
 * Point buy (rulings.md, Character creation): "25 point buy with Pathfinder costs: 8 -2, 9 -1, 10 0,
 * 11 1, 12 2, 13 3, 14 5, 15 7, 16 10, 17 13, 18 17. A score below 8 refunds the same as 8."
 * test/build.test.ts reads the ruling's line and checks this table against it.
 */
export const POINT_BUY_BUDGET = 25;
export const POINT_BUY_MAX = 18;
export const POINT_BUY_COST: Readonly<Record<number, number>> = { 8: -2, 9: -1, 10: 0, 11: 1, 12: 2, 13: 3, 14: 5, 15: 7, 16: 10, 17: 13, 18: 17 };

/** A bought score's cost; below 8 costs what 8 does. Null above 18, which point buy cannot reach. */
export function pointBuyCost(score: number): number | null {
  if (score > POINT_BUY_MAX) return null;
  return POINT_BUY_COST[Math.max(8, score)] ?? null;
}

/** Points spent on a set of bought scores; null if any score is past point buy's maximum. */
export function pointBuySpent(scores: readonly number[]): number | null {
  let spent = 0;
  for (const score of scores) {
    const cost = pointBuyCost(score);
    if (cost === null) return null;
    spent += cost;
  }
  return spent;
}

/**
 * Defense points (episode-vii, Classes): "all Heroic Characters are granted 4 points which they may
 * assign to whichever Defenses they wish, to a maximum of 2 to a single Defense. At level 10 this
 * increases to 8 points and 4 maximum to a single Defense."
 */
export function defensePointLimits(level: number): { total: number; each: number } {
  return level >= 10 ? { total: 8, each: 4 } : { total: 4, each: 2 };
}

/**
 * The species' "+2 ANY": "Small species may not have their 'any' apply to Dexterity. Small Droids are
 * the exception which may." (episode-vii, Species).
 */
export function speciesChoiceAllowed(ability: AbilityKey, size: SizeKey, droid: boolean): boolean {
  return !(ability === "dex" && size === "small" && !droid);
}

/**
 * Trained skills a character may have (rulings.md, Skills): the class taken at level 1, the
 * Intelligence modifier, species features (Bonus Trained Skill traits, Primitive +1) and Skill
 * Training feats. Never below 0.
 */
export function trainedSkillsAllowed({ firstClass, intMod, bonusTraits, primitive, skillTraining }: {
  firstClass: { name: string; skills: number } | null;
  intMod: number;
  bonusTraits: number;
  primitive: boolean;
  skillTraining: number;
}): Breakdown {
  const terms: Modifier[] = [];
  if (firstClass) terms.push({ label: firstClass.name, value: firstClass.skills, type: null });
  terms.push({ label: "INT", value: intMod, type: null });
  if (bonusTraits) terms.push({ label: "Bonus Trained Skill", value: bonusTraits, type: null });
  if (primitive) terms.push({ label: "Primitive", value: 1, type: null });
  if (skillTraining) terms.push({ label: "Skill Training", value: skillTraining, type: null });
  const sum = total(terms);
  return sum.total >= 0 ? sum : { ...sum, total: 0 };
}
