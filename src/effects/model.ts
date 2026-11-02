const fields = foundry.data.fields;

/** Foundry's rule for a change type: dot-delimited alphanumeric parts, or "custom.{number}". */
function validChangeType(type: string): boolean {
  if (type.length < 3) throw new Error("must be at least three characters long");
  if (!/^custom\.-?\d+$/.test(type) && !type.split(".").every((s) => /^[a-z0-9]+$/i.test(s))) {
    throw new Error('must be dot-delimited alphanumeric parts or "custom.{number}"');
  }
  return true;
}

/**
 * Foundry's change schema (key, type, value, phase, priority; common/data/active-effect.mjs), which a
 * system may extend so long as type, phase and priority keep their definitions, plus two fields a
 * "bonus" change reads: its bonus type (blank for untyped) and its condition (blank for always).
 */
function effectSchema() {
  return {
    changes: new fields.ArrayField(new fields.SchemaField({
      key: new fields.StringField({ required: true }),
      type: new fields.StringField({ required: true, blank: false, initial: "add", validate: validChangeType }),
      value: new fields.AnyField({ required: true, nullable: true, initial: "" }),
      phase: new fields.StringField({ required: true, blank: false, initial: "initial" }),
      priority: new fields.NumberField(),
      bonusType: new fields.StringField({ required: true, blank: true, initial: "" }),
      condition: new fields.StringField({ required: true, blank: true, initial: "" }),
    })),
  };
}

export class HolocronEffectModel extends foundry.abstract.TypeDataModel<ReturnType<typeof effectSchema>, ActiveEffect.Implementation> {
  static override defineSchema() {
    return effectSchema();
  }

  /**
   * Armor applies its effects only while worn (Power Armor's +2 Strength), a droid system only while
   * installed (a Translator Unit's +4 INT for languages). Core reads
   * `system.isSuppressed ?? duration.expired` (ActiveEffect#isSuppressed), so this returns
   * undefined, not false, whenever it has nothing to suppress: false would hide an expired duration.
   */
  get isSuppressed(): true | undefined {
    const item = this.parent?.parent;
    if (item?.documentName !== "Item") return undefined;
    if (item.type === "armor" && (item.system as { worn?: boolean }).worn !== true) return true;
    if (item.type === "droidSystem" && (item.system as { installed?: boolean }).installed !== true) return true;
    return undefined;
  }
}
