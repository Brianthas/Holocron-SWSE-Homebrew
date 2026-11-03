import { ABILITIES, ABILITY_LABELS } from "../config/abilities.ts";
import { SKILLS, SKILL_KEYS } from "../config/skills.ts";
import type { CharacterModel, WeaponData } from "../data/actor/character.ts";
import { rollAttack, rollDamage } from "../dice/attack.ts";
import { longRest } from "../rest.ts";
import { DEFENSES, DEFENSE_LABELS } from "../rules/defenses.ts";
import { breakdownHtml, signed } from "./breakdown.ts";

/**
 * F1's character sheet, kept as a development view: every derived number with its breakdown, and
 * the buttons the live checks in tools/checks drive. Their fixtures open it through
 * flags.core.sheetClass; players get the character sheet (character-sheet.ts).
 */

const { HandlebarsApplicationMixin } = foundry.applications.api;

export class DebugSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["holocron", "debug-sheet"],
    position: { width: 460, height: 600 },
    window: { resizable: true },
    actions: { attack: DebugSheet.#attack, damage: DebugSheet.#damage, rest: DebugSheet.#rest },
  };

  static override PARTS = {
    body: { template: "systems/holocron/templates/debug-sheet.hbs" },
  };

  override async _prepareContext(options: foundry.applications.sheets.ActorSheetV2.RenderOptions) {
    const context = await super._prepareContext(options);
    const actor = this.actor as Actor.Implementation;
    const system = actor.system as CharacterModel;
    const weapons = actor.items.filter((i) => i.type === "weapon").map((w) => {
      const data = w.system as WeaponData;
      const attack = system.attackFor(data);
      return {
        id: w.id,
        name: w.name,
        attack: signed(attack.total),
        attackTooltip: breakdownHtml("Attack", attack),
        damage: system.damageFor(data).formula,
      };
    });
    return Object.assign(context, {
      name: actor.name,
      level: system.level,
      resources: [
        { key: "hp", label: "Hit points", shown: `${system.hp.value} / ${system.hpMax.total}`, tooltip: breakdownHtml("Hit points", system.hpMax) },
        { key: "hpState", label: "State", shown: system.hpState, tooltip: "" },
        { key: "forcePoints", label: "Force Points per day", shown: `${system.forcePointsPerDay.total}`, tooltip: breakdownHtml("Force Points per day", system.forcePointsPerDay) },
        { key: "forcePointsLeft", label: "Force Points left", shown: `${system.forcePoints.value} / ${system.forcePointsPerDay.total}`, tooltip: "" },
        { key: "secondWind", label: "Second Wind", shown: `${system.secondWind.value} / ${system.secondWindMax.total}`, tooltip: breakdownHtml("Second Wind per day", system.secondWindMax) },
        { key: "destiny", label: "Destiny Points, most", shown: `${system.destinyMax}`, tooltip: "" },
        { key: "darkSide", label: "Dark Side", shown: `${system.darkSide.value} / ${system.darkSideMax}`, tooltip: "" },
        { key: "understands", label: "Understands", shown: system.languageTier.understands, tooltip: breakdownHtml("INT for languages", system.languageTier.effectiveInt) },
        { key: "slots", label: "Light / Kit slots", shown: `${system.slots.light.total} / ${system.slots.kit.total}`, tooltip: breakdownHtml("Kit slots", system.slots.kit) },
      ],
      problems: system.problems,
      bab: signed(system.bab),
      size: system.size,
      abilities: ABILITIES.map((a) => ({ label: ABILITY_LABELS[a], value: system.scores[a].value, mod: signed(system.scores[a].mod) })),
      defenses: [
        ...DEFENSES.map((d) => ({
          key: d,
          label: DEFENSE_LABELS[d],
          total: system.defenses[d].total,
          tooltip: breakdownHtml(DEFENSE_LABELS[d], system.defenses[d]),
        })),
        { key: "maneuver", label: "DT+5", total: system.maneuver.total, tooltip: breakdownHtml("DT+5", system.maneuver) },
      ],
      skills: SKILL_KEYS.map((k) => ({
        key: k,
        label: SKILLS[k].label,
        trained: system.isTrained(k),
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

  static async #rest(this: DebugSheet): Promise<void> {
    await longRest(this.actor as Actor.Implementation);
  }

  static async #damage(this: DebugSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const actor = this.actor as Actor.Implementation;
    const weapon = actor.items.get(target.dataset["itemId"] ?? "");
    if (weapon) await rollDamage(actor, weapon);
  }
}
