/**
 * Choice feats and talents: what each one's choice offers. Replicates the behaviour of the SWSE fork's
 * choice dialog (module/choice/choice.mjs, read 2026-11-03), not its code. `from` says where the
 * options come from, and every list leaves out the choices already taken for itself:
 *
 * - "proficient": weapon groups the character is proficient with
 * - "notProficient": weapon groups it is not proficient with
 * - "exotic": exotic weapons it is not proficient with (the house weapon table has none)
 * - "trainedSkills": its trained skills
 * - "lightsaberForms": Lightsaber Forms talents it does not have
 * - list keys: the choices taken for those lists; with two keys, the choices taken for both
 *
 * `fork` is the fork's option name, which the converter maps from. Greater Penetrating Attack has no
 * case in the fork's dialog, so it offered nothing; here it draws from Penetrating Attack, as the
 * other Greater talents draw from their base (Bryan, 2026-11-03; rulings.md, Talent trees).
 */
export type ChoiceSource = "proficient" | "notProficient" | "exotic" | "trainedSkills" | "lightsaberForms" | readonly string[];

export const CHOICE_LISTS = {
  weaponFocus: { fork: "AVAILABLE_WEAPON_FOCUS", from: "proficient" },
  doubleAttack: { fork: "AVAILABLE_DOUBLE_ATTACK", from: "proficient" },
  devastatingAttack: { fork: "AVAILABLE_DEVASTATING_ATTACK", from: "proficient" },
  weaponSpecialization: { fork: "AVAILABLE_WEAPON_SPECIALIZATION", from: ["weaponFocus"] },
  greaterWeaponFocus: { fork: "AVAILABLE_GREATER_WEAPON_FOCUS", from: ["weaponFocus"] },
  autofireSweep: { fork: "AVAILABLE_AUTOFIRE_SWEEP", from: ["weaponFocus"] },
  autofireAssault: { fork: "AVAILABLE_AUTOFIRE_ASSAULT", from: ["weaponFocus"] },
  halt: { fork: "AVAILABLE_HALT", from: ["weaponFocus"] },
  penetratingAttack: { fork: "AVAILABLE_PENETRATING_ATTACK", from: ["weaponFocus"] },
  returnFire: { fork: "AVAILABLE_RETURN_FIRE", from: ["weaponFocus"] },
  criticalStrike: { fork: "AVAILABLE_CRITICAL_STRIKE", from: ["weaponFocus"] },
  // Homebrew in the fork (choice.mjs:303): Weapon Specialization is the only prerequisite.
  greaterWeaponSpecialization: { fork: "AVAILABLE_GREATER_WEAPON_SPECIALIZATION", from: ["weaponSpecialization"] },
  disarmingAttack: { fork: "AVAILABLE_DISARMING_ATTACK", from: ["weaponSpecialization"] },
  tripleAttack: { fork: "AVAILABLE_TRIPLE_ATTACK", from: ["doubleAttack"] },
  savageAttack: { fork: "AVAILABLE_SAVAGE_ATTACK", from: ["doubleAttack"] },
  relentlessAttack: { fork: "AVAILABLE_RELENTLESS_ATTACK", from: ["doubleAttack"] },
  greaterDevastatingAttack: { fork: "AVAILABLE_GREATER_DEVASTATING_ATTACK", from: ["devastatingAttack", "greaterWeaponFocus"] },
  greaterPenetratingAttack: { fork: "AVAILABLE_GREATER_PENETRATING_ATTACK", from: ["penetratingAttack"] },
  weaponProficiency: { fork: "AVAILABLE_WEAPON_PROFICIENCIES", from: "notProficient" },
  exoticWeaponProficiency: { fork: "AVAILABLE_EXOTIC_WEAPON_PROFICIENCY", from: "exotic" },
  skillFocus: { fork: "AVAILABLE_SKILL_FOCUS", from: "trainedSkills" },
  exceptionalSkill: { fork: "AVAILABLE_EXCEPTIONAL_SKILL", from: "trainedSkills" },
  lightsaberForms: { fork: "AVAILABLE_LIGHTSABER_FORMS", from: "lightsaberForms" },
} as const satisfies Record<string, { fork: string; from: ChoiceSource }>;

export type ChoiceListKey = keyof typeof CHOICE_LISTS;
export const CHOICE_LIST_KEYS = Object.keys(CHOICE_LISTS) as ChoiceListKey[];
