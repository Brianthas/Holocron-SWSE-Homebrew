import { ABILITIES, ABILITY_LABELS } from "../config/abilities.ts";
import { SKILLS, SKILL_KEYS } from "../config/skills.ts";
import type { CharacterModel } from "../data/actor/character.ts";
import { rollAttack, rollDamage } from "../dice/attack.ts";
import { rangedAttack, rangedDamage } from "../rules/attacks.ts";
import { DEFENSES, DEFENSE_LABELS } from "../rules/defenses.ts";
import type { Breakdown } from "../rules/modifiers.ts";

/**
 * F1's throwaway character sheet: enough to show the derived numbers with their breakdowns and to
 * roll an attack and its damage. The signed-off sheet (mockup 1) replaces it in M1.
 */

const signed = (n: number) => (n < 0 ? `${n}` : `+${n}`);
const escape = (s: string) => foundry.utils.escapeHTML(s);

/** A breakdown as tooltip HTML: each counted term, then any typed bonus that did not stack. */
export function breakdownHtml(title: string, b: Breakdown): string {
  const rows = b.applied.map((m) => `<tr><td>${escape(m.label)}</td><td>${signed(m.value)}</td></tr>`).join("");
  const unused = b.suppressed.map((m) => `<tr class="suppressed"><td>${escape(m.label)} (does not stack)</td><td>${signed(m.value)}</td></tr>`).join("");
  return `<div class="holocron-breakdown"><strong>${escape(title)} ${b.total}</strong><table>${rows}${unused}</table></div>`;
}

const { HandlebarsApplicationMixin } = foundry.applications.api;

// @ts-expect-error fvtt-types beta: TS2321 on HandlebarsApplicationMixin(ActorSheetV2), reported once
// per compile on the first such class checked; types/probes.ts explains.
export class DebugSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["holocron", "debug-sheet"],
    position: { width: 460, height: 600 },
    window: { resizable: true },
    actions: { attack: DebugSheet.#attack, damage: DebugSheet.#damage },
  };

  static override PARTS = {
    body: { template: "systems/holocron/templates/debug-sheet.hbs" },
  };

  override async _prepareContext(options: foundry.applications.sheets.ActorSheetV2.RenderOptions) {
    const context = await super._prepareContext(options);
    const actor = this.actor as Actor.Implementation;
    const system = actor.system as CharacterModel;
    const weapons = actor.items.filter((i) => i.type === "weapon").map((w) => {
      const attack = rangedAttack({ bab: system.bab, dexMod: system.scores.dex.mod });
      const { damage } = w.system as { damage: string };
      return {
        id: w.id,
        name: w.name,
        attack: signed(attack.total),
        attackTooltip: breakdownHtml("Attack", attack),
        damage: rangedDamage({ dice: damage, dexMod: system.scores.dex.mod, heroicLevel: system.heroicLevel }).formula,
      };
    });
    return Object.assign(context, {
      name: actor.name,
      level: system.level,
      bab: signed(system.bab),
      size: system.size,
      abilities: ABILITIES.map((a) => ({ label: ABILITY_LABELS[a], value: system.scores[a].value, mod: signed(system.scores[a].mod) })),
      defenses: DEFENSES.map((d) => ({
        key: d,
        label: DEFENSE_LABELS[d],
        total: system.defenses[d].total,
        tooltip: breakdownHtml(DEFENSE_LABELS[d], system.defenses[d]),
      })),
      skills: SKILL_KEYS.map((k) => ({
        key: k,
        label: SKILLS[k].label,
        trained: system.skills[k].trained,
        total: signed(system.skillTotals[k].total),
        tooltip: breakdownHtml(SKILLS[k].label, system.skillTotals[k]),
      })),
      weapons,
      feats: actor.items.filter((i) => i.type === "feat").map((f) => ({ id: f.id, name: f.name })),
    });
  }

  static async #attack(this: DebugSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const actor = this.actor as Actor.Implementation;
    const weapon = actor.items.get(target.dataset["itemId"] ?? "");
    if (weapon) await rollAttack(actor, weapon);
  }

  static async #damage(this: DebugSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const actor = this.actor as Actor.Implementation;
    const weapon = actor.items.get(target.dataset["itemId"] ?? "");
    if (weapon) await rollDamage(actor, weapon);
  }
}
