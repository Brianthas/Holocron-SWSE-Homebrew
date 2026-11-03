import { ABILITIES } from "../../config/abilities.ts";
import { CHOICE_LIST_KEYS } from "../../config/choices.ts";
import { DROID_SYSTEM_GROUP_KEYS } from "../../config/droids.ts";
import { FORCE_DESCRIPTOR_KEYS } from "../../config/force.ts";
import { SIZES } from "../../config/sizes.ts";
import { WEAPON_GROUP_KEYS } from "../../config/weapons.ts";
import { CARRY_STATES, SLOT_SIZES } from "../../rules/inventory.ts";

// Item models. The converter fills them from the fork's packs; fields hold what the house tables and
// the fork's data carry, and the character's derivation reads them.

const fields = foundry.data.fields;
const int = (initial: number, min?: number) =>
  new fields.NumberField({ required: true, nullable: false, integer: true, initial, ...(min === undefined ? {} : { min }) });
const text = (initial = "") => new fields.StringField({ required: true, blank: true, initial });
const strings = () => new fields.ArrayField(new fields.StringField({ required: true, blank: false }));
const choiceList = () => new fields.StringField({ required: true, blank: true, initial: "", choices: ["", ...CHOICE_LIST_KEYS] });

/** A prerequisite as the fork stores it: the printed text, and the parsed tree the checker walks. */
const prerequisite = () => new fields.SchemaField({
  text: text(),
  nodes: new fields.ObjectField({ required: false, nullable: true, initial: null }),
});

/** Where a carried item is: carried (uses slots), in hands (one Kit rides free), stowed (no slots). */
const carry = () => new fields.StringField({ required: true, blank: false, initial: "carried", choices: [...CARRY_STATES] });
/** Inventory size from the house tables: Light, 2 Light, Kit, 2 Kits; worn and installed use none. */
const slot = () => new fields.StringField({ required: true, blank: false, initial: "light", choices: [...SLOT_SIZES] });

function speciesSchema() {
  return {
    description: new fields.HTMLField(),
    size: new fields.StringField({ required: true, blank: false, initial: "medium", choices: [...SIZES] }),
    /** Sizes a character of this species picks from at creation (Killik); empty for a fixed size. */
    sizeChoices: new fields.ArrayField(new fields.StringField({ required: true, blank: false, choices: [...SIZES] })),
    /** From the species rarity page: common, rare or denied; blank for a species it does not list. */
    rarity: new fields.StringField({ required: true, blank: true, initial: "", choices: ["common", "rare", "denied"] }),
    /** Droids have CON, heal as organics and are immune to Stun (episode-vii, Droids). */
    droid: new fields.BooleanField({ initial: false }),
    /** The species' traits as text; their mechanics are effects on the species item. */
    traits: new fields.ArrayField(new fields.SchemaField({ name: text(), description: text() })),
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
    // Levels taken are not stored here: the character's progression lists each level's class.
    category: new fields.StringField({ required: true, blank: false, initial: "base", choices: ["base", "prestige", "nonheroic", "beast"] }),
    /** Counts toward heroic level: base and prestige classes, including Agent, Engineer and Operative (episode-vii). */
    heroic: new fields.BooleanField({ initial: true }),
    hitDie: int(6, 4),
    /** Base classes: hit points at level 1 (house class table), before CON. */
    hpFirstLevel: int(0, 0),
    /** Base classes: trained skills at level 1, before INT (house class table). */
    trainedSkills: int(0, 0),
    weaponProficiencies: new fields.ArrayField(new fields.StringField({ required: true, blank: false, choices: [...WEAPON_GROUP_KEYS] })),
    startingFeat: text(),
    talentTrees: strings(),
    /** Single talents open to the class outside their trees (Many Shades of the Force; rulings.md, Talent trees). */
    talents: strings(),
    /** May take a talent from any other Force Tradition tree, one at a time, with GM approval (rulings.md, Classes). */
    traditionApproval: new fields.BooleanField({ initial: false }),
    /** Class levels that give a Force technique or secret (core rulebook Tables 12-6 to 12-13; Legacy Era 3-3). */
    techniqueLevels: new fields.ArrayField(new fields.NumberField({ required: true, nullable: false, integer: true, min: 1 })),
    secretLevels: new fields.ArrayField(new fields.NumberField({ required: true, nullable: false, integer: true, min: 1 })),
  };
}
export class ClassModel extends foundry.abstract.TypeDataModel<ReturnType<typeof classSchema>, Item.Implementation> {
  static override defineSchema() {
    return classSchema();
  }
}

function featSchema() {
  return {
    description: new fields.HTMLField(),
    prerequisite: prerequisite(),
    /** Can be taken more than once: Force Training, Skill Focus, Skill Training, Toughness, Weapon Focus. */
    repeatable: new fields.BooleanField({ initial: false }),
    /** What a choice feat was taken for: a weapon group or skill key ("pistols", "stealth"). */
    choice: text(),
    /** The list its choice offers (config/choices.ts); blank for a feat with no choice. */
    choiceList: choiceList(),
  };
}
export class FeatModel extends foundry.abstract.TypeDataModel<ReturnType<typeof featSchema>, Item.Implementation> {
  static override defineSchema() {
    return featSchema();
  }
}

function talentSchema() {
  return {
    description: new fields.HTMLField(),
    tree: text(),
    prerequisite: prerequisite(),
    repeatable: new fields.BooleanField({ initial: false }),
    /** For a repeatable talent with a limit (Commanding Officer: 3); 0 means no limit. */
    maxTimes: int(0, 0),
    /** What a choice talent was taken for, and the list it offers (config/choices.ts). */
    choice: text(),
    choiceList: choiceList(),
    /** The action an activated talent takes ("Standard", "Swift", "Reaction"); blank for a passive one. */
    action: text(),
  };
}
export class TalentModel extends foundry.abstract.TypeDataModel<ReturnType<typeof talentSchema>, Item.Implementation> {
  static override defineSchema() {
    return talentSchema();
  }
}

function forcePowerSchema() {
  return {
    description: new fields.HTMLField(),
    descriptors: new fields.ArrayField(new fields.StringField({ required: true, blank: false, choices: [...FORCE_DESCRIPTOR_KEYS] })),
    action: text(),
    target: text(),
    /** The skill the power rolls; Use the Force unless the power names another (Bryan's fork, v1.4.7). */
    skill: text("useTheForce"),
    /** DC bands, lowest first; a cumulative power gains every band it clears (Bryan's fork, v1.4.7). */
    bands: new fields.ArrayField(new fields.SchemaField({ dc: int(10, 0), text: text() })),
    cumulative: new fields.BooleanField({ initial: false }),
    /** Copies known, and copies ready to use (one per use, restored at the end of combat). */
    copies: int(1, 1),
    ready: int(1, 0),
  };
}
export class ForcePowerModel extends foundry.abstract.TypeDataModel<ReturnType<typeof forcePowerSchema>, Item.Implementation> {
  static override defineSchema() {
    return forcePowerSchema();
  }
}

function featureSchema() {
  return {
    description: new fields.HTMLField(),
    category: new fields.StringField({
      required: true, blank: false, initial: "classFeature",
      choices: ["forceTechnique", "forceSecret", "forceRegimen", "speciesTrait", "classFeature", "beastQuality"],
    }),
    /** A technique's power ("Move Object" for Extended Move Object); blank when it improves none. */
    power: text(),
    repeatable: new fields.BooleanField({ initial: false }),
  };
}
export class FeatureModel extends foundry.abstract.TypeDataModel<ReturnType<typeof featureSchema>, Item.Implementation> {
  static override defineSchema() {
    return featureSchema();
  }
}

function weaponSchema() {
  return {
    description: new fields.HTMLField(),
    category: new fields.StringField({ required: true, blank: false, initial: "ranged", choices: ["melee", "ranged"] }),
    /** Weapon group (src/config/weapons.ts), as the house weapon tables divide them. */
    group: new fields.StringField({ required: true, blank: true, initial: "", choices: [...WEAPON_GROUP_KEYS] }),
    /** Damage dice, e.g. "3d6". */
    damage: new fields.StringField({ required: true, blank: false, initial: "1d6" }),
    damageTypes: strings(),
    /** Two-handed melee weapons use STR only and add STR x 2 to damage (episode-vii). */
    twoHanded: new fields.BooleanField({ initial: false }),
    thrown: new fields.BooleanField({ initial: false }),
    /**
     * "Half damage on a miss" (episode-vii weapon tables: Grenade, Blaster Carbine, Flamethrower,
     * Repeating Cannon). The Assault Cannon's "May deal half damage on a miss at -5" is an option the
     * attacker takes, so it is not this flag.
     */
    halfOnMiss: new fields.BooleanField({ initial: false }),
    area: new fields.BooleanField({ initial: false }),
    slot: slot(),
    carry: carry(),
  };
}
export class WeaponModel extends foundry.abstract.TypeDataModel<ReturnType<typeof weaponSchema>, Item.Implementation> {
  static override defineSchema() {
    return weaponSchema();
  }
}

function armorSchema() {
  return {
    description: new fields.HTMLField(),
    /**
     * What stands in for the DEX term of Reflex while worn (rulings.md, Combat; house armor table):
     * an ability's modifier (Assault Armor: STR) or a flat number (Battle 4, Mesh 5, Power 4).
     */
    reflex: new fields.SchemaField({
      ability: new fields.StringField({ required: true, blank: true, initial: "", choices: [...ABILITIES] }),
      flat: int(0, 0),
    }),
    damageReduction: int(0, 0),
    /** What gets through the DR: blank for nothing (2/-), or a weapon group ("lightsabers"). */
    drBypass: text(),
    speedPenalty: int(5, 0),
    armorCheckPenalty: int(2, 0),
    worn: new fields.BooleanField({ initial: false }),
  };
}
export class ArmorModel extends foundry.abstract.TypeDataModel<ReturnType<typeof armorSchema>, Item.Implementation> {
  static override defineSchema() {
    return armorSchema();
  }
}

function equipmentSchema() {
  return {
    description: new fields.HTMLField(),
    quantity: int(1, 0),
    /** Price in credits; null where it depends on the variant and the description gives it. */
    cost: new fields.NumberField({ required: true, nullable: true, integer: true, min: 0, initial: 0 }),
    slot: slot(),
    carry: carry(),
    /** "Integrated Equipment takes up twice as many slots" (episode-vii, Equipment). */
    integrated: new fields.BooleanField({ initial: false }),
  };
}
export class EquipmentModel extends foundry.abstract.TypeDataModel<ReturnType<typeof equipmentSchema>, Item.Implementation> {
  static override defineSchema() {
    return equipmentSchema();
  }
}

/**
 * A droid system: installed or removed, using no slots (Mockup 1, droid systems), following the
 * fork's design where only an installed system counts. The cost is the printed one, often a
 * formula of the droid's Cost Factor.
 */
function droidSystemSchema() {
  return {
    description: new fields.HTMLField(),
    group: new fields.StringField({ required: true, blank: false, initial: "miscellaneous", choices: [...DROID_SYSTEM_GROUP_KEYS] }),
    cost: text(),
    /** What the system needs first, as printed ("Requires Walking"). */
    requires: text(),
    installed: new fields.BooleanField({ initial: false }),
  };
}
export class DroidSystemModel extends foundry.abstract.TypeDataModel<ReturnType<typeof droidSystemSchema>, Item.Implementation> {
  static override defineSchema() {
    return droidSystemSchema();
  }
}

export const ITEM_MODELS = {
  species: SpeciesModel,
  class: ClassModel,
  feat: FeatModel,
  talent: TalentModel,
  forcePower: ForcePowerModel,
  feature: FeatureModel,
  weapon: WeaponModel,
  armor: ArmorModel,
  equipment: EquipmentModel,
  droidSystem: DroidSystemModel,
};
