import { ABILITY_LABELS, type AbilityKey } from "../config/abilities.ts";
import { SKILLS, type SkillKey } from "../config/skills.ts";
import { WEAPON_GROUPS, type WeaponGroupKey } from "../config/weapons.ts";
import { CHOICE_TOKEN } from "./selectors.ts";

/**
 * A change in words, for the Effects tab: "+1 attack with Lightsabers", "+2 species bonus to Will
 * Defense against Mind-Affecting effects". Written from the change itself, so the text cannot drift
 * from what the change does. A key or type it does not know reads as the raw key and value.
 */
export interface ChangeLike { key: string; type: string; value: unknown; bonusType?: string; condition?: string }

const DEFENSE_TEXT: Record<string, string> = { reflex: "Reflex Defense", fortitude: "Fortitude Defense", will: "Will Defense" };
const FIXED_TEXT: Record<string, string> = {
  dt: "Damage Threshold", "hp.max": "HP", speed: "speed", "healing.received": "healing received", forcePoints: "Force Points per day",
  secondWind: "Second Wind uses", "languages.int": "INT for languages", "slots.light": "Light slots", "slots.kit": "Kit slots",
};
const FLAG_TEXT: Record<string, string> = { extendedCapacity: "Light and Kit slots doubled" };

/** What a bonus or dice change applies to, or null for a key outside the grammar's known shapes. */
function target(key: string): string | null {
  if (key in FIXED_TEXT) return FIXED_TEXT[key] ?? null;
  const [head, rest = "", group] = key.split(".");
  if (head === "ability") return ABILITY_LABELS[rest as AbilityKey] ?? null;
  if (head === "defense") return DEFENSE_TEXT[rest] ?? null;
  // A choice feat whose choice is not set yet still names what it will apply to.
  if (head === "skill") return rest === "all" ? "all skills" : rest === CHOICE_TOKEN ? "the chosen skill" : SKILLS[rest as SkillKey]?.label ?? null;
  if (head === "attack" || head === "damage") {
    if (rest === "all") return head;
    if (rest === "group") return `${head} with ${group === CHOICE_TOKEN ? "the chosen group" : WEAPON_GROUPS[group as WeaponGroupKey] ?? group}`;
    return `${rest} ${head}`;
  }
  return null;
}

/** A number with its sign; a formula other than "@level" is shown as written. */
function amount(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? (n < 0 ? String(n) : `+${n}`) : `+(${String(value)})`;
}

export function describeChange(change: ChangeLike): string {
  const when = change.condition ? ` ${change.condition}` : "";
  if (change.type === "bonus") {
    const on = target(change.key);
    if (!on) return `${change.key} ${amount(change.value)}`;
    const typed = change.bonusType ? ` ${change.bonusType} bonus to` : "";
    // "@level" is the only formula in the packs (Toughness's hit points).
    if (change.value === "@level") return `+1${typed} ${on} per level${when}`;
    return `${amount(change.value)}${typed} ${on}${when}`;
  }
  if (change.type === "dice") {
    const n = Number(change.value);
    const on = target(change.key);
    return `${n < 0 ? n : `+${n}`} ${Math.abs(n) === 1 ? "die" : "dice"} of ${on ?? change.key}${when}`;
  }
  if (change.type === "grant") {
    const value = String(change.value ?? "");
    if (change.key === "flag") return FLAG_TEXT[value] ?? value;
    if (change.key === "skill.trained") return `Trained in ${SKILLS[value as SkillKey]?.label ?? value}`;
    if (change.key.startsWith("proficiency.")) return `Proficient with ${value}`;
  }
  return `${change.key} ${String(change.value)}`;
}
