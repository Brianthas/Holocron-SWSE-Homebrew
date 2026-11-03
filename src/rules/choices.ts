import { CHOICE_LISTS, type ChoiceListKey } from "../config/choices.ts";
import { WEAPON_GROUPS, WEAPON_GROUP_KEYS, type WeaponGroupKey } from "../config/weapons.ts";

/** What the options read off a character. Weapon groups and skills are keys; forms are talent names. */
export interface ChoiceState {
  /** Weapon groups the character is proficient with: its classes' and its Weapon Proficiency choices. */
  proficient: ReadonlySet<string>;
  /** The choices already taken for each list. */
  taken: ReadonlyMap<string, readonly string[]>;
  trainedSkills: readonly { key: string; label: string }[];
  /** The Lightsaber Forms tree's talents, and the ones the character has. */
  forms: readonly string[];
  formsHeld: ReadonlySet<string>;
}
export interface ChoiceOption { value: string; label: string }

const group = (key: string): ChoiceOption => ({ value: key, label: WEAPON_GROUPS[key as WeaponGroupKey] ?? key });

/** The options a choice list offers this character, leaving out the choices already taken for it. */
export function choiceOptions(list: ChoiceListKey, state: ChoiceState): ChoiceOption[] {
  const from = CHOICE_LISTS[list].from;
  const taken = new Set(state.taken.get(list) ?? []);
  let options: ChoiceOption[];
  if (from === "proficient") options = WEAPON_GROUP_KEYS.filter((g) => state.proficient.has(g)).map(group);
  else if (from === "notProficient") options = WEAPON_GROUP_KEYS.filter((g) => !state.proficient.has(g)).map(group);
  else if (from === "exotic") options = [];
  else if (from === "trainedSkills") options = state.trainedSkills.map((s) => ({ value: s.key, label: s.label }));
  else if (from === "lightsaberForms") options = state.forms.filter((f) => !state.formsHeld.has(f)).map((f) => ({ value: f, label: f }));
  else {
    // The choices taken for every list named: Greater Devastating Attack needs both bases.
    const [first, ...rest] = from.map((key) => new Set(state.taken.get(key) ?? []));
    const values = [...(first ?? [])].filter((v) => rest.every((s) => s.has(v)));
    options = values.map((v) => (WEAPON_GROUPS[v as WeaponGroupKey] ? group(v) : { value: v, label: v }));
  }
  return options.filter((o) => !taken.has(o.value));
}
