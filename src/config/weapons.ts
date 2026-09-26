/**
 * Weapon groups, as the episode-vii weapon tables divide them. Only the weapons in those tables
 * exist (rulings.md, Equipment). The Bow and the Grenade are in the Simple Weapons table, so the
 * fork's "Simple Melee Weapons", "Simple Ranged Weapons" and "Grenades" are all Simple Weapons here.
 */
export const WEAPON_GROUPS = {
  simple: "Simple Weapons",
  advancedMelee: "Advanced Melee Weapons",
  lightsabers: "Lightsabers",
  pistols: "Pistols",
  rifles: "Rifles",
  heavyWeapons: "Heavy Weapons",
} as const;

export type WeaponGroupKey = keyof typeof WEAPON_GROUPS;
export const WEAPON_GROUP_KEYS = Object.keys(WEAPON_GROUPS) as WeaponGroupKey[];
