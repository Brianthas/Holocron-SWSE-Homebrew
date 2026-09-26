import { ABILITIES, ABILITY_LABELS, type AbilityKey } from "../../config/abilities.ts";
import { SKILLS, SKILL_KEYS, type SkillKey } from "../../config/skills.ts";
import { REFLEX_SIZE_MODIFIER, SIZES, type SizeKey } from "../../config/sizes.ts";
import type { EffectTargets } from "../../effects/changes.ts";
import { abilityMod, abilityScore } from "../../rules/abilities.ts";
import { weaponAttack, weaponDamage } from "../../rules/attacks.ts";
import { DEFENSES, defense, maneuverDefense, reflexAbilityTerm, type DefenseKey } from "../../rules/defenses.ts";
import { total, type Breakdown, type Modifier } from "../../rules/modifiers.ts";
import {
  POOLED_FORCE_MAX, carrySlots, darkSideMax, destinyMax, forcePointsPerDay, hitPointMax, hpState, languages, type HpState,
} from "../../rules/resources.ts";
import { skill } from "../../rules/skills.ts";

/** The weapon fields an attack reads. */
export interface WeaponData { category: string; group: string; damage: string }

const fields = foundry.data.fields;
const int = (initial: number, min?: number) =>
  new fields.NumberField({ required: true, nullable: false, integer: true, initial, ...(min === undefined ? {} : { min }) });
const ability = () => new fields.SchemaField({ base: int(10, 1) });
const trained = () => new fields.SchemaField({ trained: new fields.BooleanField({ initial: false }) });
const pool = () => new fields.SchemaField({ value: int(0, 0) });

function characterSchema() {
  return {
    /** Scores as set at creation, before species, level increases and effects. */
    abilities: new fields.SchemaField({ str: ability(), dex: ability(), con: ability(), int: ability(), wis: ability(), cha: ability() }),
    /** The ability that takes the species' "+2 ANY" (episode-vii species table); blank until chosen. */
    speciesChoice: new fields.StringField({ required: true, blank: true, initial: "", choices: [...ABILITIES] }),
    /**
     * The character's levels in order, one entry per level: the class item taken, the hit die result
     * for that level (unused at level 1, where the class's level-1 hit points apply), and the ability
     * increases chosen at levels 4, 8, 12, 16 and 20. Level, heroic level and hit points derive from it.
     */
    progression: new fields.ArrayField(new fields.SchemaField({
      class: new fields.StringField({ required: true, blank: false }),
      hitPoints: int(0, 0),
      increases: new fields.ArrayField(new fields.StringField({ required: true, blank: false, choices: [...ABILITIES] })),
    })),
    /** Defense points (episode-vii: 4 to assign, at most 2 to one Defense; 8 and 4 at level 10). */
    defensePoints: new fields.SchemaField({ reflex: int(0, 0), fortitude: int(0, 0), will: int(0, 0) }),
    skills: new fields.SchemaField(
      Object.fromEntries(SKILL_KEYS.map((key) => [key, trained()])) as Record<SkillKey, ReturnType<typeof trained>>,
    ),
    hp: new fields.SchemaField({ value: int(0), temp: int(0, 0) }),
    forcePoints: pool(),
    destiny: pool(),
    /** Force Points pooled from a Destiny Point, at most 3 (episode-vii, Destiny Points). */
    pooledForce: pool(),
    darkSide: pool(),
    languages: new fields.SchemaField({
      /** One of Galactic Basic, Huttese or Ryl, spoken besides the species language (INT 10+). */
      alsoSpeaks: new fields.StringField({ required: true, blank: true, initial: "" }),
      /** Specific languages the GM has granted; the system keeps no language lists (rulings.md). */
      other: new fields.StringField({ required: true, blank: true, initial: "" }),
    }),
    details: new fields.SchemaField({ biography: new fields.HTMLField() }),
  };
}

/**
 * The character. Everything below the schema is derived on every prepare and never written back.
 */
export class CharacterModel extends foundry.abstract.TypeDataModel<ReturnType<typeof characterSchema>, Actor.Implementation> {
  static override defineSchema() {
    return characterSchema();
  }

  declare size: SizeKey;
  declare level: number;
  declare heroicLevel: number;
  declare bab: number;
  /** Levels per class item id, from the progression. */
  declare classLevels: Record<string, number>;
  declare scores: Record<AbilityKey, { value: number; mod: number; breakdown: Breakdown }>;
  /** What Active Effects add, by selector or kind; filled by the change types in src/effects/changes.ts. */
  declare modifiers: EffectTargets["modifiers"];
  declare grants: EffectTargets["grants"];
  declare dice: EffectTargets["dice"];
  declare defenses: Record<DefenseKey, Breakdown>;
  /** DT+5: the Defense against forced movement, grapple and disarm. */
  declare maneuver: Breakdown;
  declare skillTotals: Record<SkillKey, Breakdown>;
  declare hpMax: Breakdown;
  declare hpState: HpState;
  declare forcePointsPerDay: Breakdown;
  declare destinyMax: number;
  declare pooledForceMax: number;
  declare darkSideMax: number;
  declare languageTier: ReturnType<typeof languages>;
  declare slots: ReturnType<typeof carrySlots>;
  /** Problems derivation found in the data, e.g. a progression entry naming a class item that is gone. */
  declare problems: string[];

  override prepareBaseData(): void {
    this.modifiers = {};
    this.grants = {};
    this.dice = {};
    this.problems = [];
  }

  /** Whether a skill is trained: marked on the sheet, or granted by an effect (a species trait, a feat). */
  isTrained(key: SkillKey): boolean {
    return this.skills[key].trained || (this.grants["skill.trained"] ?? []).some((g) => g.value === key);
  }

  hasFlag(flag: string): boolean {
    return (this.grants["flag"] ?? []).some((g) => g.value === flag);
  }

  /** The bonuses an attack or damage roll with this weapon collects: all, melee or ranged, its group. */
  weaponModifiers(roll: "attack" | "damage", weapon: { category: string; group: string }): Modifier[] {
    return [`${roll}.all`, `${roll}.${weapon.category}`, ...(weapon.group ? [`${roll}.group.${weapon.group}`] : [])]
      .flatMap((selector) => this.modifiers[selector] ?? []);
  }

  /** Extra damage dice of the weapon's size, from damage.* dice changes. */
  weaponExtraDice(weapon: { category: string; group: string }): number {
    return ["damage.all", `damage.${weapon.category}`, ...(weapon.group ? [`damage.group.${weapon.group}`] : [])]
      .flatMap((selector) => this.dice[selector] ?? []).reduce((n, d) => n + d.value, 0);
  }

  /** Ranged weapons use DEX; melee weapons STR until the per-weapon ability choice exists (src/rules/attacks.ts). */
  private weaponAbility(weapon: WeaponData) {
    const a: AbilityKey = weapon.category === "ranged" ? "dex" : "str";
    return { label: ABILITY_LABELS[a], mod: this.scores[a].mod };
  }

  attackFor(weapon: WeaponData): Breakdown {
    return weaponAttack({ bab: this.bab, ability: this.weaponAbility(weapon), bonuses: this.weaponModifiers("attack", weapon) });
  }

  damageFor(weapon: WeaponData): { flat: Breakdown; formula: string } {
    return weaponDamage({
      dice: weapon.damage,
      ability: this.weaponAbility(weapon),
      heroicLevel: this.heroicLevel,
      bonuses: this.weaponModifiers("damage", weapon),
      extraDice: this.weaponExtraDice(weapon),
    });
  }

  override prepareDerivedData(): void {
    const items = this.parent.items;
    const species = items.find((i) => i.type === "species");
    const size = String((species?.system as { size?: string } | undefined)?.size ?? "medium");
    this.size = (SIZES as readonly string[]).includes(size) ? (size as SizeKey) : "medium";

    // Levels come from the progression. An entry whose class item is missing counts toward level
    // (the level was taken) but not heroic level, and is reported.
    const classOf = (id: string) => items.get(id);
    this.classLevels = {};
    let heroicLevel = 0;
    this.progression.forEach((entry, index) => {
      const cls = classOf(entry.class);
      if (!cls || cls.type !== "class") {
        this.problems.push(`Level ${index + 1} names class item "${entry.class}", which this character does not have.`);
        return;
      }
      this.classLevels[cls.id ?? entry.class] = (this.classLevels[cls.id ?? entry.class] ?? 0) + 1;
      if ((cls.system as { heroic?: boolean }).heroic) heroicLevel += 1;
    });
    this.level = this.progression.length;
    this.heroicLevel = heroicLevel;
    // "All Heroic and Prestige Classes have BAB equal to Level" (episode-vii). Nonheroic BAB is M2.
    this.bab = heroicLevel;

    // Ability scores: base, the size's fixed adjustments, the +2 choice, level increases, and
    // "ability.*" bonuses, which are authored in the "initial" phase so they apply before this runs.
    const choice = this.speciesChoice === "" ? null : (this.speciesChoice as AbilityKey);
    const increases = this.progression.flatMap((entry) => entry.increases);
    this.scores = Object.fromEntries(ABILITIES.map((a) => {
      const base = abilityScore(a, { base: this.abilities[a].base, size: this.size, speciesChoice: choice, increases: increases.filter((x) => x === a).length });
      const breakdown = total([{ label: "Score", value: base, type: null }, ...(this.modifiers[`ability.${a}`] ?? [])]);
      return [a, { value: breakdown.total, mod: abilityMod(breakdown.total), breakdown }];
    })) as Record<AbilityKey, { value: number; mod: number; breakdown: Breakdown }>;

    // Effects in the "derived" phase read the scores and levels above and add labelled bonuses.
    this.parent.applyActiveEffects("derived");

    const DEFENSE_ABILITY: Record<DefenseKey, AbilityKey> = { reflex: "dex", fortitude: "con", will: "wis" };
    const worn = items.find((i) => i.type === "armor" && (i.system as { worn?: boolean }).worn === true);
    const armor = worn ? (() => {
      const r = (worn.system as { reflex: { ability: string; flat: number } }).reflex;
      const a = (ABILITIES as readonly string[]).includes(r.ability) ? (r.ability as AbilityKey) : null;
      return { name: worn.name, ability: a ? { label: ABILITY_LABELS[a], mod: this.scores[a].mod } : null, flat: r.flat };
    })() : null;
    this.defenses = Object.fromEntries(DEFENSES.map((d) => {
      const a = DEFENSE_ABILITY[d];
      const term = { label: ABILITY_LABELS[a], mod: this.scores[a].mod };
      return [d, defense({
        heroicLevel: this.heroicLevel,
        ability: d === "reflex" ? reflexAbilityTerm(term, armor) : term,
        points: this.defensePoints[d],
        size: d === "reflex" ? REFLEX_SIZE_MODIFIER[this.size] : 0,
        bonuses: this.modifiers[`defense.${d}`] ?? [],
      })];
    })) as Record<DefenseKey, Breakdown>;
    this.maneuver = maneuverDefense(this.defenses.fortitude.total, this.modifiers["dt"] ?? []);

    this.skillTotals = Object.fromEntries(SKILL_KEYS.map((key) => {
      const a = SKILLS[key].ability;
      return [key, skill({
        level: this.level,
        trained: this.isTrained(key),
        ability: { label: ABILITY_LABELS[a], mod: this.scores[a].mod },
        bonuses: [...(this.modifiers["skill.all"] ?? []), ...(this.modifiers[`skill.${key}`] ?? [])],
      })];
    })) as Record<SkillKey, Breakdown>;

    // Hit points: the starting class's level-1 hit points, later levels' die results, CON per level.
    const first = this.progression[0] ? classOf(this.progression[0].class) : undefined;
    this.hpMax = hitPointMax({
      firstLevel: (first?.system as { hpFirstLevel?: number } | undefined)?.hpFirstLevel ?? 0,
      firstLabel: first ? `${first.name} level 1` : "No level 1",
      laterRolls: this.progression.slice(1).map((entry) => entry.hitPoints),
      conMod: this.scores.con.mod,
      bonuses: this.modifiers["hp.max"] ?? [],
    });
    this.hpState = hpState(this.hp.value, this.hpMax.total);

    this.forcePointsPerDay = forcePointsPerDay(this.level, this.modifiers["forcePoints"] ?? []);
    this.destinyMax = destinyMax(this.forcePointsPerDay.total);
    this.pooledForceMax = POOLED_FORCE_MAX;
    this.darkSideMax = darkSideMax(this.scores.wis.value);
    this.languageTier = languages(this.scores.int.value, this.modifiers["languages.int"] ?? []);
    this.slots = carrySlots({
      strScore: this.scores.str.value,
      strMod: this.scores.str.mod,
      size: this.size,
      extendedCapacity: this.hasFlag("extendedCapacity"),
      lightBonuses: this.modifiers["slots.light"] ?? [],
      kitBonuses: this.modifiers["slots.kit"] ?? [],
    });
  }
}
