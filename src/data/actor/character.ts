import { ABILITIES, ABILITY_LABELS, type AbilityKey } from "../../config/abilities.ts";
import { SKILLS, SKILL_KEYS, type SkillKey } from "../../config/skills.ts";
import { REFLEX_SIZE_MODIFIER, SIZES, type SizeKey } from "../../config/sizes.ts";
import { abilityMod, abilityScore } from "../../rules/abilities.ts";
import { DEFENSES, defense, type DefenseKey } from "../../rules/defenses.ts";
import type { Breakdown, Modifier } from "../../rules/modifiers.ts";
import { skill } from "../../rules/skills.ts";

const fields = foundry.data.fields;
const int = (initial: number, min?: number) =>
  new fields.NumberField({ required: true, nullable: false, integer: true, initial, ...(min === undefined ? {} : { min }) });
const ability = () => new fields.SchemaField({ base: int(10, 1) });
const trained = () => new fields.SchemaField({ trained: new fields.BooleanField({ initial: false }) });

function characterSchema() {
  return {
    /** Scores as set at creation, before species and level increases. */
    abilities: new fields.SchemaField({ str: ability(), dex: ability(), con: ability(), int: ability(), wis: ability(), cha: ability() }),
    /** The ability that takes the species' "+2 ANY" (episode-vii species table); blank until chosen. */
    speciesChoice: new fields.StringField({ required: true, blank: true, initial: "", choices: [...ABILITIES] }),
    /** Defense points (episode-vii: 4 to assign, at most 2 to one Defense; 8 and 4 at level 10). */
    defensePoints: new fields.SchemaField({ reflex: int(0, 0), fortitude: int(0, 0), will: int(0, 0) }),
    skills: new fields.SchemaField(
      Object.fromEntries(SKILL_KEYS.map((key) => [key, trained()])) as Record<SkillKey, ReturnType<typeof trained>>,
    ),
    hp: new fields.SchemaField({ value: int(0), temp: int(0, 0) }),
    details: new fields.SchemaField({ biography: new fields.HTMLField() }),
  };
}

/**
 * The character. Everything below the schema is derived on every prepare and never written back:
 * ability scores, level, base attack bonus, and each Defense and skill as a labelled breakdown.
 */
export class CharacterModel extends foundry.abstract.TypeDataModel<ReturnType<typeof characterSchema>, Actor.Implementation> {
  static override defineSchema() {
    return characterSchema();
  }

  declare size: SizeKey;
  declare level: number;
  declare heroicLevel: number;
  declare bab: number;
  declare scores: Record<AbilityKey, { value: number; mod: number }>;
  /** Labelled bonuses from Active Effects, by selector ("defense.reflex"); filled by the bonus change type. */
  declare modifiers: Record<string, Modifier[]>;
  declare defenses: Record<DefenseKey, Breakdown>;
  declare skillTotals: Record<SkillKey, Breakdown>;

  override prepareBaseData(): void {
    this.modifiers = {};
  }

  override prepareDerivedData(): void {
    const items = this.parent.items;
    const species = items.find((i) => i.type === "species");
    const size = String((species?.system as { size?: string } | undefined)?.size ?? "medium");
    this.size = (SIZES as readonly string[]).includes(size) ? (size as SizeKey) : "medium";

    let level = 0;
    let heroicLevel = 0;
    for (const item of items) {
      if (item.type !== "class") continue;
      const cls = item.system as { levels?: number; heroic?: boolean };
      level += cls.levels ?? 0;
      if (cls.heroic) heroicLevel += cls.levels ?? 0;
    }
    this.level = level;
    this.heroicLevel = heroicLevel;
    // "All Heroic and Prestige Classes have BAB equal to Level" (episode-vii). Nonheroic BAB is M2.
    this.bab = heroicLevel;

    const choice = this.speciesChoice === "" ? null : (this.speciesChoice as AbilityKey);
    this.scores = Object.fromEntries(ABILITIES.map((a) => {
      const value = abilityScore(a, { base: this.abilities[a].base, size: this.size, speciesChoice: choice, increases: 0 });
      return [a, { value, mod: abilityMod(value) }];
    })) as Record<AbilityKey, { value: number; mod: number }>;

    // Effects in the "derived" phase read the scores and levels above and add labelled bonuses.
    this.parent.applyActiveEffects("derived");

    const DEFENSE_ABILITY: Record<DefenseKey, AbilityKey> = { reflex: "dex", fortitude: "con", will: "wis" };
    this.defenses = Object.fromEntries(DEFENSES.map((d) => {
      const a = DEFENSE_ABILITY[d];
      return [d, defense({
        heroicLevel: this.heroicLevel,
        ability: { label: ABILITY_LABELS[a], mod: this.scores[a].mod },
        points: this.defensePoints[d],
        size: d === "reflex" ? REFLEX_SIZE_MODIFIER[this.size] : 0,
        bonuses: this.modifiers[`defense.${d}`] ?? [],
      })];
    })) as Record<DefenseKey, Breakdown>;

    this.skillTotals = Object.fromEntries(SKILL_KEYS.map((key) => {
      const a = SKILLS[key].ability;
      return [key, skill({
        level: this.level,
        trained: this.skills[key].trained,
        ability: { label: ABILITY_LABELS[a], mod: this.scores[a].mod },
        bonuses: this.modifiers[`skill.${key}`] ?? [],
      })];
    })) as Record<SkillKey, Breakdown>;
  }
}
