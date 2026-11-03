import { ABILITIES, ABILITY_LABELS, type AbilityKey } from "../config/abilities.ts";
import { SIZE_ABILITY_ADJUSTMENTS } from "../config/sizes.ts";
import { SKILLS, SKILL_KEYS, type SkillKey } from "../config/skills.ts";
import type { CharacterModel, WeaponData } from "../data/actor/character.ts";
import { rollAttack, rollDamage } from "../dice/attack.ts";
import {
  defensePointLimits, POINT_BUY_BUDGET, POINT_BUY_MAX, pointBuyCost, pointBuySpent, speciesChoiceAllowed,
} from "../rules/build.ts";
import { DEFENSES, DEFENSE_LABELS, type DefenseKey } from "../rules/defenses.ts";
import { hpEntry } from "../rules/resources.ts";
import { breakdownHtml, signed } from "./breakdown.ts";

/**
 * The character sheet signed off as mockup 1, built in slices. This slice: the sidebar (hit points,
 * Second Wind, Defenses, Force Points, Destiny, pooled Force, quick rolls), the header band, and the
 * Play, Build and Notes tabs. Tabs that are not built yet are left out rather than shown empty.
 */

const { HandlebarsApplicationMixin } = foundry.applications.api;
const TEMPLATES = "systems/holocron/templates/sheet";
/** The sidebar's three pip resources: their stored value and how their maximum is derived. */
const PIP_RESOURCES = {
  forcePoints: { label: "Force Points", max: (s: CharacterModel) => s.forcePointsPerDay.total },
  destiny: { label: "Destiny Points", max: (s: CharacterModel) => s.destinyMax },
  pooledForce: { label: "Pooled FP", max: (s: CharacterModel) => s.pooledForceMax },
} as const;
type PipResource = keyof typeof PIP_RESOURCES;
const QUICK_ROLLS: SkillKey[] = ["perception", "useTheForce", "initiative"];
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// @ts-expect-error fvtt-types beta: TS2321 on HandlebarsApplicationMixin(ActorSheetV2), reported once
// per compile on the first such class checked; types/probes.ts explains.
export class CharacterSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["holocron", "hc-sheet"],
    position: { width: 900, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      attack: CharacterSheet.#attack, damage: CharacterSheet.#damage, pip: CharacterSheet.#pip,
      toggleMode: CharacterSheet.#toggleMode, abilityStep: CharacterSheet.#abilityStep, abilityEntry: CharacterSheet.#abilityEntry,
      speciesPick: CharacterSheet.#speciesPick, defenseStep: CharacterSheet.#defenseStep, toggleTrained: CharacterSheet.#toggleTrained,
    },
  };

  static override PARTS = {
    sidebar: { template: `${TEMPLATES}/sidebar.hbs`, scrollable: [""] },
    band: { template: `${TEMPLATES}/band.hbs` },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    play: { template: `${TEMPLATES}/play.hbs`, scrollable: [""] },
    build: { template: `${TEMPLATES}/build.hbs`, scrollable: [""] },
    notes: { template: `${TEMPLATES}/notes.hbs`, scrollable: [""] },
  };

  static override TABS = {
    primary: { tabs: [{ id: "play" }, { id: "build" }, { id: "notes" }], initial: "play", labelPrefix: "HOLOCRON.Sheet.Tab" },
  };

  /** Play or Edit (mockup 1's padlock). Edit unlocks build data; Play keeps the numbers that change in play editable. */
  #editMode = false;

  override async _prepareContext(options: foundry.applications.sheets.ActorSheetV2.RenderOptions) {
    const context = await super._prepareContext(options);
    const actor = this.actor as Actor.Implementation;
    const s = actor.system as CharacterModel;
    const max = s.hpMax.total;
    const species = actor.items.find((i) => i.type === "species");
    const droid = (species?.system as { droid?: boolean } | undefined)?.droid === true;
    const editMode = this.#editMode && this.isEditable;
    const buy = s.abilityEntry === "buy";
    const spent = pointBuySpent(ABILITIES.map((a) => s.abilities[a].base));
    const increases = s.progression.flatMap((entry) => entry.increases);
    const limits = defensePointLimits(s.level);
    const pointsSpent = DEFENSES.reduce((n, d) => n + s.defensePoints[d], 0);
    // marked: trained by hand, which Edit mode toggles; trained also counts skills an effect grants.
    const skill = (k: SkillKey) => ({ key: k, label: SKILLS[k].label, trained: s.isTrained(k), marked: s.skills[k].trained, total: signed(s.skillTotals[k].total), tooltip: breakdownHtml(SKILLS[k].label, s.skillTotals[k]) });
    return Object.assign(context, {
      img: actor.img,
      name: actor.name,
      speciesName: species?.name ?? "No species",
      sizeLabel: capitalise(s.size),
      classLine: Object.entries(s.classLevels).map(([id, n]) => `${actor.items.get(id)?.name ?? "Missing class"} ${n}`).join(" / "),
      level: s.level,
      bab: signed(s.bab),
      hp: {
        value: s.hp.value, max, temp: s.hp.temp, state: s.hpState, stateLabel: capitalise(s.hpState),
        percent: max > 0 ? Math.max(0, Math.min(100, Math.round((s.hp.value / max) * 100))) : 0,
        tooltip: breakdownHtml("Hit points", s.hpMax),
      },
      secondWind: { value: s.secondWind.value, max: s.secondWindMax.total, tooltip: breakdownHtml("Second Wind per day", s.secondWindMax) },
      defenses: [
        ...DEFENSES.map((d) => ({ key: d, label: DEFENSE_LABELS[d], total: s.defenses[d].total, tooltip: breakdownHtml(DEFENSE_LABELS[d], s.defenses[d]) })),
        { key: "maneuver", label: "DT+5", total: s.maneuver.total, tooltip: breakdownHtml("DT+5", s.maneuver) },
      ],
      pips: (Object.keys(PIP_RESOURCES) as PipResource[]).map((key) => {
        const value = s[key].value;
        const cap = PIP_RESOURCES[key].max(s);
        return { key, label: PIP_RESOURCES[key].label, value, max: cap, pips: Array.from({ length: Math.max(cap, value) }, (_, i) => ({ index: i, on: i < value })) };
      }),
      forcePointsTooltip: breakdownHtml("Force Points per day", s.forcePointsPerDay),
      quickRolls: QUICK_ROLLS.map(skill),
      skills: SKILL_KEYS.map(skill),
      attacks: actor.items.filter((i) => i.type === "weapon").map((w) => {
        const data = w.system as WeaponData & { damageTypes?: string[] };
        const attack = s.attackFor(data);
        const type = data.damageTypes?.[0] ?? "";
        return { id: w.id, name: w.name, attack: signed(attack.total), attackTooltip: breakdownHtml("Attack", attack), damage: s.damageFor(data).formula, type, typeClass: type.toLowerCase() };
      }),
      editMode,
      abilityBuy: buy,
      pointBuy: { spent: spent ?? "-", budget: POINT_BUY_BUDGET, over: spent === null || spent > POINT_BUY_BUDGET, percent: spent === null ? 100 : Math.max(0, Math.min(100, (spent / POINT_BUY_BUDGET) * 100)) },
      abilities: ABILITIES.map((a) => {
        const base = s.abilities[a].base;
        const fixed = SIZE_ABILITY_ADJUSTMENTS[s.size]?.[a] ?? 0;
        const chosen = s.speciesChoice === a;
        const nextCost = base >= POINT_BUY_MAX ? null : (pointBuyCost(base + 1) ?? 0) - (pointBuyCost(base) ?? 0);
        const ups = increases.filter((x) => x === a).length;
        return {
          key: a, label: ABILITY_LABELS[a], base, value: s.scores[a].value, mod: signed(s.scores[a].mod), tooltip: breakdownHtml(ABILITY_LABELS[a], s.scores[a].breakdown),
          fixed: fixed ? signed(fixed) : "", chosen, speciesShown: fixed + (chosen ? 2 : 0) ? signed(fixed + (chosen ? 2 : 0)) : "",
          pickAllowed: speciesChoiceAllowed(a, s.size, droid), levelUps: ups ? signed(ups) : "",
          canRaise: nextCost !== null, canLower: base > 1, nextCostHint: nextCost === null ? `${POINT_BUY_MAX} is the most point buy allows` : `Next point costs ${nextCost}`,
        };
      }),
      speciesUnplaced: s.speciesChoice === "",
      defensePoints: {
        spent: pointsSpent, total: limits.total, each: limits.each,
        rows: DEFENSES.map((d) => ({
          key: d, label: DEFENSE_LABELS[d], points: s.defensePoints[d], total: s.defenses[d].total,
          canRaise: s.defensePoints[d] < limits.each && pointsSpent < limits.total, canLower: s.defensePoints[d] > 0,
        })),
      },
      trained: { marked: s.trainedSkillsMarked, allowed: s.trainedSkillsAllowed.total, over: s.trainedSkillsMarked > s.trainedSkillsAllowed.total, tooltip: breakdownHtml("Trained skills", s.trainedSkillsAllowed) },
      languages: {
        speaks: s.languageTier.speaks, alsoSpeaks: s.languages.alsoSpeaks, other: s.languages.other,
        speakOptions: ["Galactic Basic", "Huttese", "Ryl"].map((l) => ({ value: l, selected: s.languages.alsoSpeaks === l })),
      },
      understands: { shown: s.languageTier.understands, tooltip: breakdownHtml("INT for languages", s.languageTier.effectiveInt) },
      problems: s.problems,
      biography: {
        source: s.details.biography ?? "",
        enriched: await foundry.applications.ux.TextEditor.implementation.enrichHTML(s.details.biography ?? "", { relativeTo: actor }),
      },
      editable: this.isEditable,
    });
  }

  /** Each tab part gets its own tab entry, whose cssClass carries "active". */
  override async _preparePartContext(partId: string, context: object, options: object) {
    const prepared = await super._preparePartContext(partId, context as never, options as never);
    const tabs = (prepared as { tabs?: Record<string, unknown> }).tabs;
    return Object.assign(prepared, { tab: tabs?.[partId] });
  }

  /** The hit point box takes a total, -n or +n (hpEntry); anything else puts the value back. */
  override async _onRender(context: object, options: foundry.applications.sheets.ActorSheetV2.RenderOptions): Promise<void> {
    await super._onRender(context as never, options);
    this.element.dataset["mode"] = this.#editMode && this.isEditable ? "edit" : "play";
    const input = this.element.querySelector<HTMLInputElement>("input.hp-input");
    input?.addEventListener("change", async () => {
      const actor = this.actor as Actor.Implementation;
      const current = (actor.system as CharacterModel).hp.value;
      const next = hpEntry(input.value, current);
      if (next === null || next === current) input.value = String(current);
      else await actor.update({ system: { hp: { value: next } } });
    });
  }

  static async #attack(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const weapon = this.actor.items.get(target.dataset["itemId"] ?? "");
    if (weapon) await rollAttack(this.actor as Actor.Implementation, weapon as Item.Implementation);
  }

  static async #damage(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const weapon = this.actor.items.get(target.dataset["itemId"] ?? "");
    if (weapon) await rollDamage(this.actor as Actor.Implementation, weapon as Item.Implementation);
  }

  static async #toggleMode(this: CharacterSheet): Promise<void> {
    if (!this.isEditable) return;
    this.#editMode = !this.#editMode;
    await this.render();
  }

  /** Point buy's steppers: 1 to 18 (rulings.md, Character creation); entered scores use the inputs instead. */
  static async #abilityStep(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const a = target.dataset["ability"] as AbilityKey | undefined;
    if (!a || !ABILITIES.includes(a)) return;
    const base = (this.actor.system as CharacterModel).abilities[a].base;
    const next = base + Number(target.dataset["delta"]);
    if (next >= 1 && next <= POINT_BUY_MAX && next !== base) await this.actor.update({ [`system.abilities.${a}.base`]: next });
  }

  static async #abilityEntry(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const mode = target.dataset["mode"];
    if (mode === "buy" || mode === "enter") await this.actor.update({ "system.abilityEntry": mode } as never);
  }

  /** Moves the species' +2 to this ability, where the rule allows it (episode-vii, Species). */
  static async #speciesPick(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const a = target.dataset["ability"] as AbilityKey | undefined;
    const s = this.actor.system as CharacterModel;
    const species = this.actor.items.find((i) => i.type === "species");
    const droid = (species?.system as { droid?: boolean } | undefined)?.droid === true;
    if (!a || !ABILITIES.includes(a) || !speciesChoiceAllowed(a, s.size, droid) || s.speciesChoice === a) return;
    await this.actor.update({ "system.speciesChoice": a } as never);
  }

  /** Defense points within the level's limits (episode-vii, Classes). */
  static async #defenseStep(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const d = target.dataset["defense"] as DefenseKey | undefined;
    if (!d || !DEFENSES.includes(d)) return;
    const s = this.actor.system as CharacterModel;
    const limits = defensePointLimits(s.level);
    const next = s.defensePoints[d] + Number(target.dataset["delta"]);
    const others = DEFENSES.filter((x) => x !== d).reduce((n, x) => n + s.defensePoints[x], 0);
    if (next >= 0 && next <= limits.each && others + next <= limits.total) await this.actor.update({ [`system.defensePoints.${d}`]: next });
  }

  /** Marks or clears a trained skill. Over the allowance is shown, not blocked. */
  static async #toggleTrained(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const k = target.dataset["skill"] as SkillKey | undefined;
    if (!k || !SKILL_KEYS.includes(k)) return;
    const s = this.actor.system as CharacterModel;
    await this.actor.update({ [`system.skills.${k}.trained`]: !s.skills[k].trained });
  }

  /** A lit pip spends one, an empty pip restores one (mockup 1, sidebar pips). */
  static async #pip(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const key = target.dataset["resource"] as PipResource | undefined;
    if (!key || !(key in PIP_RESOURCES)) return;
    const s = this.actor.system as CharacterModel;
    const value = s[key].value;
    const lit = Number(target.dataset["index"]) < value;
    const next = Math.max(0, Math.min(PIP_RESOURCES[key].max(s), value + (lit ? -1 : 1)));
    if (next !== value) await this.actor.update({ [`system.${key}.value`]: next });
  }
}
