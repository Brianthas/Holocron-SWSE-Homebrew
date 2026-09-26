/** The six abilities, in sheet order. */
export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type AbilityKey = (typeof ABILITIES)[number];

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};
