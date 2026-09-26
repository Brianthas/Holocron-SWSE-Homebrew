import { SIZES, type SizeKey } from "../config/sizes.ts";
import { total, untyped, type Breakdown, type Modifier } from "./modifiers.ts";

/**
 * Force Points per day (episode-vii, The Force): 1 at levels 1-5, 2 at 6-10, 3 at 11-15, 4 at 16-20;
 * Force Sensitivity and Force Boon add theirs as bonuses (+1 and +2; rulings.md, The Force).
 */
export function forcePointsPerDay(level: number, bonuses: readonly Modifier[] = []): Breakdown {
  const byLevel = level < 1 ? 0 : Math.min(4, Math.ceil(level / 5));
  return total([untyped(`Level ${level}`, byLevel), ...bonuses]);
}

/** "You can have a maximum number of Destiny Points equal to the amount of Force Points per day you receive." */
export const destinyMax = (forcePointsPerDay: number): number => forcePointsPerDay;

/** Force Points turned from a Destiny Point: "The maximum of Force Points you can pool this way cannot exceed 3." */
export const POOLED_FORCE_MAX = 3;

/** "The maximum Dark Side Score a character can possess is equal to half their Wisdom score (rounded up)." */
export const darkSideMax = (wisdomScore: number): number => Math.ceil(wisdomScore / 2);

/** Taking the average instead of rolling a level's hit die: floor(die / 2) + 1 (rulings.md, Hit points). */
export const averageHitDie = (die: number): number => Math.floor(die / 2) + 1;

/**
 * Maximum hit points: the starting class's level-1 hit points, each later level's die result, the CON
 * modifier once per level, and bonuses such as Toughness (rulings.md, Hit points and healing).
 */
export function hitPointMax({ firstLevel, firstLabel, laterRolls, conMod, bonuses = [] }: {
  firstLevel: number;
  firstLabel: string;
  laterRolls: readonly number[];
  conMod: number;
  bonuses?: readonly Modifier[];
}): Breakdown {
  const levels = laterRolls.length + 1;
  return total([
    untyped(firstLabel, firstLevel),
    ...(laterRolls.length ? [untyped(`Levels 2 to ${levels}`, laterRolls.reduce((a, b) => a + b, 0))] : []),
    untyped(`CON x ${levels}`, conMod * levels),
    ...bonuses,
  ]);
}

export type HpState = "healthy" | "staggered" | "dying" | "dead";

/**
 * Staggered "when at exactly 0 HP" (episode-vii, Healing); dying below 0, down to and including minus
 * the maximum; dead below that (rulings.md, Hit points and healing: Death).
 */
export function hpState(value: number, max: number): HpState {
  if (value > 0) return "healthy";
  if (value === 0) return "staggered";
  return value < -max ? "dead" : "dying";
}

/**
 * What a character understands and may speak besides their species language, by INT (episode-vii,
 * Languages table). Linguist counts INT as 4 higher, a Primitive species as 4 lower; both arrive as
 * bonuses. Characters always understand and speak their species language, so below the table's first
 * row nothing is added.
 */
export function languages(intScore: number, bonuses: readonly Modifier[] = []): { effectiveInt: Breakdown; understands: string; speaks: string } {
  const effectiveInt = total([untyped("INT", intScore), ...bonuses]);
  const n = effectiveInt.total;
  const trade = "Galactic Basic, Huttese, or Ryl";
  const understands = n >= 20 ? "Commons, Rares, and Secrets" : n >= 16 ? "Commons and Rares" : n >= 12 ? "Commons, including Binary"
    : n >= 8 ? trade : "Species language only";
  const speaks = n >= 10 ? `one of ${trade}` : "Species language only";
  return { effectiveInt, understands, speaks };
}

/**
 * Carrying (episode-vii, Equipment): Light slots equal to the STR score; Kit slots equal to the STR
 * modifier + 1, minimum 1, plus one Kit carried in two hands. Small and smaller lose one Kit slot per
 * size category below Medium (never below 0); Large and larger are "case by case", so the GM adds
 * slots as bonuses. Extended Capacity doubles both totals.
 */
export function carrySlots({ strScore, strMod, size, extendedCapacity, lightBonuses = [], kitBonuses = [] }: {
  strScore: number;
  strMod: number;
  size: SizeKey;
  extendedCapacity: boolean;
  lightBonuses?: readonly Modifier[];
  kitBonuses?: readonly Modifier[];
}): { light: Breakdown; kit: Breakdown; handsKit: number } {
  const below = Math.max(0, SIZES.indexOf("medium") - SIZES.indexOf(size));
  const kitBase = Math.max(1, strMod + 1);
  const double = (b: Breakdown, label: string): Breakdown => (extendedCapacity ? total([...b.applied, untyped(label, b.total)]) : b);
  const light = double(total([untyped("STR score", strScore), ...lightBonuses]), "Extended Capacity");
  const kit = double(total([
    untyped("STR modifier + 1, minimum 1", kitBase),
    ...(below ? [untyped(`${size[0]?.toUpperCase()}${size.slice(1)}`, -Math.min(below, kitBase))] : []),
    ...kitBonuses,
  ]), "Extended Capacity");
  return { light, kit, handsKit: 1 };
}
