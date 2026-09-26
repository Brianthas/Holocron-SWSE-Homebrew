import { total, untyped, type Breakdown, type Modifier } from "./modifiers.ts";

/**
 * A ranged attack roll's bonus: base attack bonus + DEX modifier (core rulebook p144; episode-vii:
 * "Ranged weapons, including grenades, use DEX for attack and damage").
 */
export function rangedAttack({ bab, dexMod, bonuses = [] }: { bab: number; dexMod: number; bonuses?: readonly Modifier[] }): Breakdown {
  return total([untyped("Base attack bonus", bab), untyped("DEX", dexMod), ...bonuses]);
}

/**
 * A ranged weapon's damage: weapon dice + DEX modifier + half heroic level, rounded down (core
 * rulebook p144; episode-vii, as above; rulings.md: half level is added to damage on attacks).
 * Returns the flat part as a breakdown and the full roll formula; zero terms are left out.
 */
export function rangedDamage({ dice, dexMod, heroicLevel }: { dice: string; dexMod: number; heroicLevel: number }): {
  flat: Breakdown;
  formula: string;
} {
  const flat = total([untyped("DEX", dexMod), untyped("Half heroic level", Math.floor(heroicLevel / 2))]);
  const terms = flat.applied.filter((m) => m.value !== 0).map((m) => (m.value > 0 ? ` + ${m.value}` : ` - ${-m.value}`));
  return { flat, formula: `${dice}${terms.join("")}` };
}
