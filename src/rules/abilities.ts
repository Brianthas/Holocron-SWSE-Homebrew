import type { AbilityKey } from "../config/abilities.ts";
import { SIZE_ABILITY_ADJUSTMENTS, type SizeKey } from "../config/sizes.ts";

/** Ability modifier: (score - 10) / 2, rounded down (core rulebook Table 1-1). */
export const abilityMod = (score: number): number => Math.floor((score - 10) / 2);

/**
 * An ability score: the score set at creation, the species' fixed adjustments for its size, the +2
 * to one ability every species grants, and the level increases (+1 each) taken for that ability.
 */
export function abilityScore(
  ability: AbilityKey,
  { base, size, speciesChoice, increases }: { base: number; size: SizeKey; speciesChoice: AbilityKey | null; increases: number },
): number {
  const fixed = SIZE_ABILITY_ADJUSTMENTS[size]?.[ability] ?? 0;
  return base + fixed + (speciesChoice === ability ? 2 : 0) + increases;
}
