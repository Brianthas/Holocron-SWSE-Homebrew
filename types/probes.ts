// Type canary for the Foundry declarations (fvtt-types). Checked by `npm run typecheck`, never
// bundled. Each probe pairs a line that must type-check with a @ts-expect-error line that must
// fail; an unused @ts-expect-error is itself an error, so a probe that stops checking fails too.
// When an fvtt-types update fixes the ActorSheetV2 defect below, its suppression goes unused and
// typecheck fails here: remove the suppression in this file and in src/sheets.

export {};

// 1. v14 Active Effect change types and phases, registered in foundry-config.d.ts.
CONFIG.ActiveEffect.changeTypes["bonus"] = { label: "Bonus", defaultPriority: 20, handler: null, render: null };
CONFIG.ActiveEffect.phases["derived"] = { label: "Derived", hint: "After base values" };
// @ts-expect-error defaultPriority must be a number
CONFIG.ActiveEffect.changeTypes["bonus"] = { label: "Bad", defaultPriority: "high" };

// 2. applyActiveEffects takes a phase string in v14.
declare const actor: Actor.Implementation;
actor.applyActiveEffects("derived");
// @ts-expect-error a number is not a phase
actor.applyActiveEffects(3);

// 3. TypeDataModel schema inference.
const fields = foundry.data.fields;
function defineSchema() {
  return {
    abilities: new fields.SchemaField({
      str: new fields.SchemaField({ base: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 10 }) }),
    }),
  };
}
class ProbeModel extends foundry.abstract.TypeDataModel<ReturnType<typeof defineSchema>, Actor.Implementation> {
  static override defineSchema() {
    return defineSchema();
  }
  probe(): number {
    const base: number = this.abilities.str.base;
    // @ts-expect-error base is a number, not a string
    const wrong: string = this.abilities.str.base;
    return base + wrong.length;
  }
}
void ProbeModel;

// 4. ApplicationV2 actor sheet. fvtt-types 14.366 beta reports TS2321 (excessive stack depth) on
// a subclass of HandlebarsApplicationMixin(ActorSheetV2), even an empty one; the ItemSheetV2 and
// ApplicationV2 forms compile. The checker reports it once per compile, on the first such class it
// meets, and src/ is checked before types/: so the suppression sits on src/sheets/debug-sheet.ts
// and this class compiles clean behind it. When fvtt-types fixes the defect, that suppression goes
// unused and typecheck fails there. If src/ ever has no actor sheet, move the suppression back here.
// Members stay typed either way, which the two inner checks prove.
const { HandlebarsApplicationMixin } = foundry.applications.api;
class ProbeActorSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static override PARTS: Record<string, foundry.applications.api.HandlebarsApplicationMixin.HandlebarsTemplatePart> = {
    body: { template: "systems/holocron/templates/probe.hbs" },
  };
  probe(): string {
    const name: string = this.actor.name;
    // @ts-expect-error actor.name is a string, not a number
    const wrong: number = this.actor.name;
    return name + wrong;
  }
}
void ProbeActorSheet;

// 5. Globals.
const title: string = game.i18n.localize("HOLOCRON.Title");
const value: unknown = foundry.utils.getProperty({ a: { b: 1 } }, "a.b");
const roll = new Roll("1d20 + 5");
// @ts-expect-error Roll#total is a number or undefined, not a string
const totalText: string = roll.total;
void [title, value, totalText];
