import { SIZES } from "../../config/sizes.ts";

// Item models for the F1 slice: the fields the character's derivation reads. F2 widens them.

const fields = foundry.data.fields;

function speciesSchema() {
  return {
    description: new fields.HTMLField(),
    size: new fields.StringField({ required: true, blank: false, initial: "medium", choices: [...SIZES] }),
  };
}
export class SpeciesModel extends foundry.abstract.TypeDataModel<ReturnType<typeof speciesSchema>, Item.Implementation> {
  static override defineSchema() {
    return speciesSchema();
  }
}

function classSchema() {
  return {
    description: new fields.HTMLField(),
    /** Levels taken in this class. */
    levels: new fields.NumberField({ required: true, nullable: false, integer: true, min: 1, initial: 1 }),
    /** Counts toward heroic level: base and prestige classes (episode-vii), not nonheroic or beast. */
    heroic: new fields.BooleanField({ initial: true }),
    hitDie: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 6 }),
  };
}
export class ClassModel extends foundry.abstract.TypeDataModel<ReturnType<typeof classSchema>, Item.Implementation> {
  static override defineSchema() {
    return classSchema();
  }
}

function featSchema() {
  return { description: new fields.HTMLField() };
}
export class FeatModel extends foundry.abstract.TypeDataModel<ReturnType<typeof featSchema>, Item.Implementation> {
  static override defineSchema() {
    return featSchema();
  }
}

function weaponSchema() {
  return {
    description: new fields.HTMLField(),
    category: new fields.StringField({ required: true, blank: false, initial: "ranged", choices: ["melee", "ranged"] }),
    /** Weapon group, as the house weapon tables name it: "Pistols", "Rifles", "Lightsabers". */
    group: new fields.StringField({ required: true, blank: true, initial: "" }),
    /** Damage dice, e.g. "3d6". */
    damage: new fields.StringField({ required: true, blank: false, initial: "1d6" }),
    damageTypes: new fields.ArrayField(new fields.StringField({ required: true, blank: false })),
  };
}
export class WeaponModel extends foundry.abstract.TypeDataModel<ReturnType<typeof weaponSchema>, Item.Implementation> {
  static override defineSchema() {
    return weaponSchema();
  }
}
