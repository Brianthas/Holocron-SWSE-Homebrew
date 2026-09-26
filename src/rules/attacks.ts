import { total, untyped, type Breakdown, type Modifier } from "./modifiers.ts";

interface AbilityTerm { label: string; mod: number }

/**
 * An attack roll's bonus: base attack bonus + the attack ability's modifier + bonuses (core rulebook
 * p144). Ranged weapons use DEX (episode-vii: "Ranged weapons, including grenades, use DEX for attack
 * and damage"); melee weapons use STR, or DEX where the character chooses it (episode-vii: "Melee
 * weapons can use STR or DEX for attack and damage").
 */
export function weaponAttack({ bab, ability, bonuses = [] }: { bab: number; ability: AbilityTerm; bonuses?: readonly Modifier[] }): Breakdown {
  return total([untyped("Base attack bonus", bab), untyped(ability.label, ability.mod), ...bonuses]);
}

/**
 * A weapon's damage: weapon dice (plus any extra dice of the same size) + the damage ability's
 * modifier + half heroic level, rounded down, + bonuses (core rulebook p144; episode-vii, as above;
 * rulings.md: half level is added to damage on attacks). Returns the flat part as a breakdown and the
 * roll formula; zero terms are left out.
 */
export function weaponDamage({ dice, ability, heroicLevel, bonuses = [], extraDice = 0 }: {
  dice: string;
  ability: AbilityTerm;
  heroicLevel: number;
  bonuses?: readonly Modifier[];
  extraDice?: number;
}): { flat: Breakdown; formula: string } {
  const flat = total([untyped(ability.label, ability.mod), untyped("Half heroic level", Math.floor(heroicLevel / 2)), ...bonuses]);
  const terms = flat.applied.filter((m) => m.value !== 0).map((m) => (m.value > 0 ? ` + ${m.value}` : ` - ${-m.value}`));
  return { flat, formula: `${addDice(dice, extraDice)}${terms.join("")}` };
}

/** "3d6" with one extra die is "4d6". A die expression that is not "NdM" cannot take extra dice. */
export function addDice(dice: string, extra: number): string {
  if (!extra) return dice;
  const match = /^(\d+)d(\d+)$/.exec(dice.trim());
  if (!match) throw new Error(`cannot add ${extra} dice to "${dice}"`);
  return `${Number(match[1]) + extra}d${match[2]}`;
}
