import type { AbilityKey } from "./abilities.ts";

export const SIZES = ["fine", "diminutive", "tiny", "small", "medium", "large", "huge", "gargantuan", "colossal"] as const;
export type SizeKey = (typeof SIZES)[number];

/** Size modifier to Reflex Defense, and only Reflex (core rulebook p145). */
export const REFLEX_SIZE_MODIFIER: Record<SizeKey, number> = {
  fine: 10,
  diminutive: 5,
  tiny: 2,
  small: 1,
  medium: 0,
  large: -1,
  huge: -2,
  gargantuan: -5,
  colossal: -10,
};

/**
 * A species' fixed ability adjustments come from its size alone (episode-vii's species table): they
 * "replace any relevant factors for species and are not in addition to them". Every size also gives
 * a +2 to one ability of the player's choice, stored on the character. Sizes the table does not list
 * have no fixed adjustment.
 */
export const SIZE_ABILITY_ADJUSTMENTS: Partial<Record<SizeKey, Partial<Record<AbilityKey, number>>>> = {
  small: { dex: 2, str: -2 },
  medium: {},
  large: { str: 2, dex: -2 },
};
