import { ABILITIES } from "../config/abilities.ts";
import { SKILL_KEYS } from "../config/skills.ts";
import { WEAPON_GROUP_KEYS } from "../config/weapons.ts";

/**
 * The closed set of selectors a bonus can name. A statistic collects the selectors that apply to it:
 * an attack with a pistol reads attack.all, attack.ranged and attack.group.pistols. Anything outside
 * this grammar is rejected by the validator and ignored, loudly, at prepare time, so a misspelled
 * key can never pass as a bonus that silently does nothing.
 */
const alternatives = (xs: readonly string[]) => xs.join("|");
const GRAMMAR: RegExp[] = [
  new RegExp(`^ability\\.(${alternatives(ABILITIES)})$`),
  /^defense\.(reflex|fortitude|will)$/,
  /^dt$/,
  /^hp\.max$/,
  new RegExp(`^skill\\.(all|${alternatives(SKILL_KEYS)})$`),
  new RegExp(`^(attack|damage)\\.(all|melee|ranged|unarmed|group\\.(${alternatives(WEAPON_GROUP_KEYS)}))$`),
  /^speed$/,
  /^healing\.received$/,
  /^forcePoints$/,
  /^secondWind$/,
  /^languages\.int$/,
  /^slots\.(light|kit)$/,
];

export const isSelector = (key: string): boolean => GRAMMAR.some((re) => re.test(key));

/**
 * A choice feat's change names "{choice}" where its weapon group or skill goes ("attack.group.{choice}",
 * "skill.{choice}"); the handler fills it from the item's stored choice. A key with the token is
 * never itself a selector, so an unfilled one cannot reach a statistic.
 */
export const CHOICE_TOKEN = "{choice}";
/** Whether a key is a selector once its token is filled with a value that position takes. */
export const isChoiceSelector = (key: string): boolean =>
  key.includes(CHOICE_TOKEN) && isSelector(key.replace(CHOICE_TOKEN, key.startsWith("skill.") ? SKILL_KEYS[0] ?? "" : WEAPON_GROUP_KEYS[0] ?? ""));
/** The key with the item's choice filled in; null while the item has no choice. */
export const fillChoice = (key: string, choice: string): string | null =>
  !key.includes(CHOICE_TOKEN) ? key : choice ? key.replace(CHOICE_TOKEN, choice) : null;

/**
 * Grants: facts a document gives a character, as a kind and a value. The kinds are closed; the
 * values are checked where each kind is read (a skill key, a weapon group key).
 */
export const GRANT_KINDS = ["proficiency.weapon", "proficiency.armor", "skill.trained", "flag"] as const;
export type GrantKind = (typeof GRANT_KINDS)[number];
export const isGrantKind = (key: string): key is GrantKind => (GRANT_KINDS as readonly string[]).includes(key);

/** The "flag" grants the character reads: "extendedCapacity" doubles carrying (episode-vii). */
export const GRANT_FLAGS = ["extendedCapacity"] as const;
export type GrantFlag = (typeof GRANT_FLAGS)[number];
