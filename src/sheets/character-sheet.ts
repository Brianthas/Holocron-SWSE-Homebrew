import { ABILITIES, ABILITY_LABELS, type AbilityKey } from "../config/abilities.ts";
import { SIZE_ABILITY_ADJUSTMENTS } from "../config/sizes.ts";
import { SKILLS, SKILL_KEYS, type SkillKey } from "../config/skills.ts";
import type { CharacterModel, WeaponData } from "../data/actor/character.ts";
import { askCritical, damageTypeOf, rollAttack, rollDamage } from "../dice/attack.ts";
import { checkDialog, rollCheck, useSecondWind } from "../dice/check.ts";
import { actionTag, readyAllPowers, rollPower } from "../dice/force.ts";
import { postItem } from "../dice/item-card.ts";
import { addItem } from "./add-item.ts";
import { askChoice, choiceListOf, nameWithChoice } from "./choice.ts";
import { CompendiumBrowser, type BrowseTarget } from "../apps/browser.ts";
import { FORCE_DESCRIPTORS, type ForceDescriptorKey } from "../config/force.ts";
import { featureSlots, forcePowersKnown } from "../rules/force.ts";
import { accessGroups, accessibleTrees } from "../rules/talent-access.ts";
import { progressionSlots, type Pick, type SlotKind } from "../rules/slots.ts";
import { BANNED_TREES, TRADITIONS } from "../config/talents.ts";
import { describeChange, type ChangeLike } from "../effects/describe.ts";
import { fillChoice } from "../effects/selectors.ts";
import { STANCE_BONUS, toggleStance } from "../effects/stance.ts";
import {
  ABILITY_INCREASE_LEVELS, defensePointLimits, POINT_BUY_BUDGET, POINT_BUY_MAX, pointBuyCost, pointBuySpent, speciesChoiceAllowed,
} from "../rules/build.ts";
import { DEFENSES, DEFENSE_LABELS, type DefenseKey } from "../rules/defenses.ts";
import { nextCarry, nextSize, SLOT_LABELS, type Carry, type SlotSize } from "../rules/inventory.ts";
import { averageHitDie, hpEntry } from "../rules/resources.ts";
import { breakdownHtml, signed } from "./breakdown.ts";

/**
 * The character sheet signed off as mockup 1, built in slices: the sidebar (hit points, Second
 * Wind, Defenses, Force Points, Destiny, pooled Force, quick rolls), the header band, and the Play,
 * Force, Build, Inventory and Notes tabs. Tabs that are not built yet are left out rather than shown empty.
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
const CLASS_PACK = "holocron.classes";
/** What can be pinned, and what its chip does (mockup 1: "Pin anything from Play or Force"). */
const PIN_HINTS = { weapon: "Attack", forcePower: "Roll Use the Force", talent: "Use", feature: "Use" } as const;
const CARRY_LABELS: Record<Carry, string> = { carried: "Carried", hands: "In hands", stowed: "Stowed" };
/** The class a new level goes to: one the character has (item id) or one from the Classes compendium (uuid). */
interface ClassRef { name: string; die: number; itemId?: string; uuid?: string }
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
      attack: CharacterSheet.#attack, damage: CharacterSheet.#damage, cycleDamageType: CharacterSheet.#cycleDamageType, pip: CharacterSheet.#pip,
      toggleMode: CharacterSheet.#toggleMode, abilityStep: CharacterSheet.#abilityStep, abilityEntry: CharacterSheet.#abilityEntry,
      speciesPick: CharacterSheet.#speciesPick, defenseStep: CharacterSheet.#defenseStep, toggleTrained: CharacterSheet.#toggleTrained,
      levelUpStart: CharacterSheet.#levelUpStart, levelUpCancel: CharacterSheet.#levelUpCancel, levelClass: CharacterSheet.#levelClass,
      levelHp: CharacterSheet.#levelHp, removeLevel: CharacterSheet.#removeLevel, increasePick: CharacterSheet.#increasePick,
      increaseSave: CharacterSheet.#increaseSave, cycleCarry: CharacterSheet.#cycleCarry, toggleWorn: CharacterSheet.#toggleWorn,
      toggleInstalled: CharacterSheet.#toggleInstalled, deleteItem: CharacterSheet.#deleteItem, cycleSize: CharacterSheet.#cycleSize,
      rollSkill: CharacterSheet.#rollSkill, secondWind: CharacterSheet.#secondWind,
      darkSide: CharacterSheet.#darkSide, powerPip: CharacterSheet.#powerPip, readyPowers: CharacterSheet.#readyPowers,
      removeCopy: CharacterSheet.#removeCopy, rollPower: CharacterSheet.#rollPower, expand: CharacterSheet.#expand, browse: CharacterSheet.#browse,
      toggleStance: CharacterSheet.#toggleStance, deleteEffect: CharacterSheet.#deleteEffect,
      togglePin: CharacterSheet.#togglePin, usePin: CharacterSheet.#usePin, useItem: CharacterSheet.#useItem,
      toggleTree: CharacterSheet.#toggleTree, unaddTree: CharacterSheet.#unaddTree, addTree: CharacterSheet.#addTree,
      fillSlot: CharacterSheet.#fillSlot, chooseFor: CharacterSheet.#chooseFor,
    },
  };

  static override PARTS = {
    sidebar: { template: `${TEMPLATES}/sidebar.hbs`, scrollable: [""] },
    band: { template: `${TEMPLATES}/band.hbs` },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    play: { template: `${TEMPLATES}/play.hbs`, scrollable: [""] },
    force: { template: `${TEMPLATES}/force.hbs`, scrollable: [""] },
    build: { template: `${TEMPLATES}/build.hbs`, scrollable: [""] },
    inventory: { template: `${TEMPLATES}/inventory.hbs`, scrollable: [""] },
    effects: { template: `${TEMPLATES}/effects.hbs`, scrollable: [""] },
    notes: { template: `${TEMPLATES}/notes.hbs`, scrollable: [""] },
  };

  static override TABS = {
    primary: { tabs: [{ id: "play" }, { id: "force" }, { id: "build" }, { id: "inventory" }, { id: "effects" }, { id: "notes" }], initial: "play", labelPrefix: "HOLOCRON.Sheet.Tab" },
  };

  /** Play or Edit (mockup 1's padlock). Edit unlocks build data; Play keeps the numbers that change in play editable. */
  #editMode = false;
  /** A level being taken: choosing its class, then (after level 1) its hit points. */
  #levelUp: null | { step: "class" } | { step: "hp"; ref: ClassRef } = null;
  /** Abilities picked so far for a level's +1 and +1, by level. */
  #increasePicks = new Map<number, AbilityKey[]>();
  /** Force tab rows shown open, by item id. */
  #expanded = new Set<string>();

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
    const pins = new Set(s.pins);
    // A choice feat or talent added before the picker existed, or by a GM, has no choice yet.
    const needsChoice = (i: { type: string; system: unknown }) => Boolean(choiceListOf(i)) && !(i.system as { choice?: string }).choice;
    const levelSlots = this.#levelSlotsContext(editMode);
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
      secondWind: {
        value: s.secondWind.value, max: s.secondWindMax.total, tooltip: breakdownHtml("Second Wind per day", s.secondWindMax),
        heals: s.healing.die ? `1d${s.healing.die} ${signed(s.healing.flat.total).replace(/^([+-])/, "$1 ")}` : "",
        healsTooltip: breakdownHtml(`Heals 1d${s.healing.die} +`, s.healing.flat),
        hidden: s.hpState === "dying" || s.hpState === "dead",
        canUse: s.secondWind.value > 0 && s.healing.die > 0 && this.isEditable,
      },
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
        const data = w.system as WeaponData & { damageTypes?: string[]; damageType?: string };
        const attack = s.attackFor(data);
        const type = damageTypeOf(data);
        const types = data.damageTypes ?? [];
        return {
          id: w.id, name: w.name, attack: signed(attack.total), attackTooltip: breakdownHtml("Attack", attack), damage: s.damageFor(data).formula,
          type, typeClass: type.toLowerCase(), switchable: types.length > 1, types: types.join(", "), pinned: pins.has(w.id ?? ""),
        };
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
      progression: s.progression.map((entry, i) => {
        const cls = actor.items.get(entry.class);
        const level = i + 1;
        const picks = this.#increasePicks.get(level) ?? [];
        const due = ABILITY_INCREASE_LEVELS.includes(level) && entry.increases.length < 2;
        return {
          level,
          className: cls?.name ?? "Missing class",
          classLevel: s.progression.slice(0, level).filter((e) => e.class === entry.class).length,
          hitPoints: i === 0 ? `${(cls?.system as { hpFirstLevel?: number } | undefined)?.hpFirstLevel ?? 0} (level 1)` : `${entry.hitPoints} (1d${(cls?.system as { hitDie?: number } | undefined)?.hitDie ?? "?"})`,
          increases: entry.increases.map((a) => ABILITY_LABELS[a as AbilityKey] ?? a).join(", "),
          increaseDue: due,
          increaseOptions: due ? ABILITIES.map((a) => ({ key: a, label: ABILITY_LABELS[a], picked: picks.includes(a) })) : [],
          increaseReady: picks.length === 2,
          isLast: i === s.progression.length - 1,
          slots: levelSlots[i] ?? [],
        };
      }),
      levelUp: await this.#levelUpContext(),
      inventory: this.#inventoryContext(droid),
      force: await this.#forceContext(),
      treeAccess: await this.#treeAccessContext(),
      effects: this.#effectsContext(),
      pins: this.#pinsContext(),
      stancePinned: pins.has("stance"),
      talents: actor.items.filter((i) => i.type === "talent").map((t) => ({
        id: t.id, name: nameWithChoice(t), tree: (t.system as { tree?: string }).tree ?? "", action: (t.system as { action?: string }).action ?? "",
        pinned: pins.has(t.id ?? ""), needsChoice: needsChoice(t),
      })).sort((a, b) => a.name.localeCompare(b.name)),
      feats: actor.items.filter((i) => i.type === "feat").map((f) => ({ id: f.id, name: nameWithChoice(f), needsChoice: needsChoice(f) })).sort((a, b) => a.name.localeCompare(b.name)),
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
    // Right-click on a pinnable row pins or unpins it. The window element outlives renders, so the
    // listener is added once.
    if ((options as { isFirstRender?: boolean }).isFirstRender) {
      this.element.addEventListener("contextmenu", (event) => {
        const row = (event.target as HTMLElement).closest<HTMLElement>("[data-pin-id]");
        if (!row || row.classList.contains("pin-chip")) return;
        event.preventDefault();
        void this.#pin(row.dataset["pinId"] ?? "");
      });
    }
    // A class from the compendium is chosen from a select, which reports a change rather than a click.
    const classSelect = this.element.querySelector<HTMLSelectElement>("select.level-class");
    classSelect?.addEventListener("change", async () => {
      const option = classSelect.selectedOptions[0];
      if (!option?.value) return;
      await this.#chooseClass({ name: option.text, die: Number(option.dataset["die"]) || 0, uuid: option.value });
    });
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

  /** Damage with no attack card: the sheet cannot know whether it was a critical, so it asks (mockup 2). */
  static async #damage(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const weapon = this.actor.items.get(target.dataset["itemId"] ?? "");
    if (!weapon) return;
    const crit = await askCritical(weapon.name);
    if (crit !== null) await rollDamage(this.actor as Actor.Implementation, weapon as Item.Implementation, { crit });
  }

  /** The Play tab's damage-type tag steps through the weapon's types (mockup 1: the blaster's Energy / Stun). */
  static async #cycleDamageType(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const weapon = this.actor.items.get(target.dataset["itemId"] ?? "");
    const data = weapon?.system as { damageTypes?: string[]; damageType?: string } | undefined;
    const types = data?.damageTypes ?? [];
    if (!weapon || types.length < 2) return;
    const next = types[(types.indexOf(damageTypeOf(data ?? {})) + 1) % types.length];
    await weapon.update({ system: { damageType: next } } as never);
  }

  /** Capacity, and the gear lists by type. Droid systems show only for a droid species (mockup 1). */
  #inventoryContext(droid: boolean) {
    const s = this.actor.system as CharacterModel;
    const bar = (used: number, b: { total: number }, label: string) => ({
      used, total: b.total, over: used > b.total, percent: b.total > 0 ? Math.min(100, Math.round((used / b.total) * 100)) : used ? 100 : 0, tooltip: breakdownHtml(label, b as never),
    });
    const of = (type: string) => this.actor.items.filter((i) => i.type === type).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    const carried = (i: Item.Implementation) => {
      const sys = i.system as { slot?: SlotSize; carry?: Carry; quantity?: number; integrated?: boolean };
      return { id: i.id, name: i.name, size: SLOT_LABELS[sys.slot ?? "light"], quantity: sys.quantity, integrated: sys.integrated === true, carry: sys.carry ?? "carried", carryLabel: CARRY_LABELS[sys.carry ?? "carried"] };
    };
    return {
      light: bar(s.slotsUsed.light, s.slots.light, "Light slots"),
      kit: bar(s.slotsUsed.kit, s.slots.kit, "Kit slots"),
      weapons: of("weapon").map((i) => carried(i as Item.Implementation)),
      equipment: of("equipment").map((i) => carried(i as Item.Implementation)),
      armor: of("armor").map((i) => ({ id: i.id, name: i.name, worn: (i.system as { worn?: boolean }).worn === true })),
      droidSystems: droid ? of("droidSystem").map((i) => ({ id: i.id, name: i.name, installed: (i.system as { installed?: boolean }).installed === true })) : null,
      credits: s.credits,
    };
  }

  /** The level-up row: the classes to choose from, or the hit point choice for the chosen class. */
  async #levelUpContext() {
    const state = this.#levelUp;
    if (!state || !this.isEditable) return null;
    const s = this.actor.system as CharacterModel;
    const next = s.level + 1;
    if (state.step === "hp") {
      const average = averageHitDie(state.ref.die);
      return { step: "hp", level: next, name: state.ref.name, die: state.ref.die, average, conMod: signed(s.scores.con.mod) };
    }
    const taken = Object.keys(s.classLevels).map((id) => {
      const item = this.actor.items.get(id);
      return { id, name: item?.name ?? id, nextLevel: (s.classLevels[id] ?? 0) + 1 };
    });
    const takenNames = new Set(taken.map((t) => t.name));
    const pack = game.packs?.get(CLASS_PACK);
    const index = pack ? await pack.getIndex({ fields: ["system.category", "system.hitDie"] }) : [];
    const others = [...index].filter((e) => !takenNames.has(e.name ?? ""))
      .map((e) => {
        const system = (e as { system?: { category?: string; hitDie?: number } }).system;
        return { uuid: e.uuid, name: e.name ?? "", die: system?.hitDie ?? 0, base: system?.category === "base" };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return { step: "class", level: next, taken, base: others.filter((o) => o.base), prestige: others.filter((o) => !o.base), packMissing: !pack };
  }

  /**
   * The Force tab: Use the Force, the Dark Side track (set by hand; Fallen at the maximum), powers
   * with their ready copies, and techniques and secrets against the slots the class levels give.
   */
  async #forceContext() {
    const actor = this.actor as Actor.Implementation;
    const s = actor.system as CharacterModel;
    const enrich = (html: string) => foundry.applications.ux.TextEditor.implementation.enrichHTML(html, { relativeTo: actor });
    const byName = (a: Item.Implementation, b: Item.Implementation) => (a.name ?? "").localeCompare(b.name ?? "");
    const items = (type: string) => (actor.items.filter((i) => i.type === type) as Item.Implementation[]).sort(byName);

    const trainings = actor.items.filter((i) => i.type === "feat" && i.name === "Force Training").length;
    const perTraining = forcePowersKnown(1, s.scores.int.mod);
    const powers = await Promise.all(items("forcePower").map(async (p) => {
      // The description carries the power's target and DC table (every converted power with bands).
      const d = p.system as unknown as { descriptors: ForceDescriptorKey[]; action: string; description: string; copies: number; ready: number };
      return {
        id: p.id, name: p.name, copies: d.copies, expanded: this.#expanded.has(p.id ?? ""), pinned: s.pins.includes(p.id ?? ""),
        pips: Array.from({ length: d.copies }, (_, i) => ({ index: i, number: i + 1, on: i < d.ready })),
        tags: d.descriptors.map((k) => FORCE_DESCRIPTORS[k]), action: actionTag(d.action), actionTitle: d.action,
        description: await enrich(d.description),
      };
    }));
    const copies = powers.reduce((n, p) => n + p.copies, 0);
    const known = forcePowersKnown(trainings, s.scores.int.mod);

    // Technique and secret slots: each class's slot levels reached by the levels taken in it.
    const classes = Object.entries(s.classLevels).map(([id, levels]) => ({ levels, system: actor.items.get(id)?.system as { techniqueLevels?: number[]; secretLevels?: number[] } | undefined }));
    const feature = async (key: "techniques" | "secrets", category: string, slotKey: "techniqueLevels" | "secretLevels", label: string, plural: string, empty: string) => {
      const list = items("feature").filter((f) => (f.system as { category?: string }).category === category);
      const slots = featureSlots(classes.map((c) => ({ levels: c.levels, slotLevels: c.system?.[slotKey] ?? [] })));
      return {
        key, label, plural, empty, slots, count: list.length, over: list.length > slots,
        items: await Promise.all(list.map(async (f) => ({
          id: f.id, name: f.name, power: (f.system as { power?: string }).power ?? "", expanded: this.#expanded.has(f.id ?? ""), pinned: s.pins.includes(f.id ?? ""),
          description: await enrich((f.system as { description?: string }).description ?? ""),
        }))),
      };
    };
    const features = [
      await feature("techniques", "forceTechnique", "techniqueLevels", "Force Techniques", "techniques", "None yet. Force Adept, Jedi Knight, Sith Apprentice and Imperial Legionnaire earn one at each even class level."),
      await feature("secrets", "forceSecret", "secretLevels", "Force Secrets", "secrets", "None yet. Force Disciple, Jedi Master and Sith Lord earn one at each of class levels 2 to 5."),
    ];

    // One line naming what is still to choose, opening the browser on the first of them.
    const waiting = [
      { n: known - copies, noun: "Force power", target: "powers" },
      ...features.map((f) => ({ n: f.slots - f.count, noun: f.key === "techniques" ? "Force technique" : "Force secret", target: f.key })),
    ].filter((w) => w.n > 0);
    const pending = waiting.length ? { target: waiting[0]?.target, text: `${waiting.map((w) => `${w.n} ${w.noun}${w.n === 1 ? "" : "s"}`).join(" and ")} to choose` } : null;

    const max = s.darkSideMax;
    const value = Math.min(s.darkSide.value, max);
    return {
      utf: { total: signed(s.skillTotals.useTheForce.total), tooltip: breakdownHtml("Use the Force", s.skillTotals.useTheForce) },
      darkSide: {
        value, max, fallen: max > 0 && value >= max,
        tooltip: `<div class="tip-title">Dark Side maximum ${max}</div><div class="tip-foot">Half of WIS ${s.scores.wis.value}, rounded up.</div>`,
        // Shade per pip from its position on the track (Bryan's fork design, mockup 1).
        pips: Array.from({ length: max + 1 }, (_, i) => {
          const t = max > 0 ? i / max : 0;
          const curve = 1 - (1 - t) ** 2;
          const depth = (curve + t) / 2;
          return { value: i, on: i <= value, current: i === value, shade: `hsl(0 ${Math.round(curve * 100)}% ${Math.round(100 - depth * 72)}%)` };
        }),
      },
      known: {
        copies, max: known, over: copies > known,
        tooltip: `<div class="tip-title">Force powers known ${known}</div><table><tr><td>Force Training &times; ${trainings}</td><td></td></tr><tr><td>1 + INT mod each (at least 1)</td><td>${trainings} &times; ${perTraining}</td></tr></table>`,
      },
      powers, features, pending,
    };
  }

  /**
   * The Talent tree access card: the Jedi tradition, each group's trees (removable in Edit mode),
   * trees added by hand, and the banned list. The trees to add are every tree in the Talents
   * compendium the character cannot already use.
   */
  async #treeAccessContext() {
    const s = this.actor.system as CharacterModel;
    const input = s.accessInput;
    const effective = accessibleTrees(input);
    const tradition = TRADITIONS[input.tradition];
    const index = await game.packs?.get("holocron.talents")?.getIndex({ fields: ["system.tree"] } as never);
    const allTrees = [...new Set([...(index ?? [])].map((e) => (e as { system?: { tree?: string } }).system?.tree ?? "").filter(Boolean))].sort();
    return {
      total: effective.size,
      jedi: input.classes.some((c) => c.name === "Jedi"),
      traditions: Object.entries(TRADITIONS).map(([value, t]) => ({ value, label: t.species ? `${t.label} (${t.species} only)` : t.label, selected: value === input.tradition })),
      traditionLabel: tradition?.label ?? "",
      picks: tradition?.pick?.map((value) => ({ value, selected: value === input.traditionTree })) ?? null,
      pickChosen: Boolean(tradition?.pick?.includes(input.traditionTree)),
      species: tradition?.species ?? "",
      groups: accessGroups(input).map((g) => ({ label: g.label, trees: g.trees.map((name) => ({ name, removed: input.removed.includes(name) })) })),
      added: input.added,
      banned: [...BANNED_TREES].join(", "),
      addable: allTrees.filter((t) => !effective.has(t)),
    };
  }

  /**
   * Pinned chips, in pin order. Only ids that still name an item (or "stance") become chips, so a
   * deleted item drops out; each chip says what clicking it does, which is what its row's main button does.
   */
  #pinsContext() {
    const s = this.actor.system as CharacterModel;
    return s.pins.flatMap((id) => {
      if (id === "stance") return [{ id, name: "Defensive Stance", hint: "Enter or leave the stance" }];
      const item = this.actor.items.get(id);
      if (!item || !(item.type in PIN_HINTS)) return [];
      return [{ id, name: item.name, hint: PIN_HINTS[item.type as keyof typeof PIN_HINTS] }];
    });
  }

  /**
   * The Effects tab: Defensive Stance, effects on the character itself with their time left, and the
   * effects its items carry. Each effect's text is written from its changes (effects/describe.ts).
   */
  #effectsContext() {
    const actor = this.actor as Actor.Implementation;
    // A choice feat's "{choice}" is shown filled with the item's choice, as the effect applies it.
    const text = (e: ActiveEffect.Implementation) => {
      const choice = ((e.parent as { system?: { choice?: string } } | null)?.system?.choice) ?? "";
      return ((e.system as unknown as { changes?: ChangeLike[] }).changes ?? []).map((c) => describeChange({ ...c, key: fillChoice(c.key, choice) ?? c.key })).join("; ");
    };
    const own = actor.effects.contents as ActiveEffect.Implementation[];
    const stance = own.find((e) => e.getFlag("holocron", "stance"));
    const remaining = (e: ActiveEffect.Implementation) => {
      const d = e.duration as unknown as { remaining: number; label: string };
      const expiry = (e._source as { duration?: { expiry?: string | null } }).duration?.expiry;
      if (Number.isFinite(d.remaining)) return d.label;
      const event = expiry ? (ActiveEffect.EXPIRY_EVENTS as Record<string, string>)[expiry] : undefined;
      return event ? `Until ${game.i18n?.localize(event) ?? event}` : "";
    };
    const items: { id: string; name: string; text: string; inactive: string }[] = [];
    for (const item of actor.items) {
      for (const e of item.effects as unknown as ActiveEffect.Implementation[]) {
        if (!e.transfer) continue;
        items.push({ id: e.id ?? "", name: e.name === item.name ? item.name : `${item.name}: ${e.name}`, text: text(e), inactive: e.disabled ? "Disabled" : e.isSuppressed ? "Not in use" : "" });
      }
    }
    return {
      stance: { on: Boolean(stance), text: `${signed(STANCE_BONUS)} to all Defenses` },
      timed: own.filter((e) => e !== stance).map((e) => ({ id: e.id, name: e.name, text: text(e), remaining: remaining(e), expired: (e.duration as unknown as { expired?: boolean }).expired === true }))
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
      items: items.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /** Records the chosen class; level 1 is taken at once (its hit points are the class's), later levels ask for hit points. */
  async #chooseClass(ref: ClassRef): Promise<void> {
    if ((this.actor.system as CharacterModel).progression.length === 0) {
      this.#levelUp = null;
      await this.#takeLevel(ref, 0);
      return;
    }
    this.#levelUp = { step: "hp", ref };
    await this.render();
  }

  /**
   * Each level's slots (rules/slots.ts), filled from the items that record the slot they filled. A
   * base class's starting feat shows as granted at that class's first level; the feat item it names
   * is granted, not a pick, so a slot it once filled shows empty again (rulings.md, Classes).
   */
  #levelSlotsContext(editMode: boolean) {
    const actor = this.actor as Actor.Implementation;
    const s = actor.system as CharacterModel;
    const counts = new Map<string, number>();
    const levels = s.progression.map((entry, i) => {
      const cls = actor.items.get(entry.class);
      const sys = cls?.system as { category?: string; techniqueLevels?: number[]; secretLevels?: number[]; startingFeat?: string } | undefined;
      const classLevel = (counts.get(entry.class) ?? 0) + 1;
      counts.set(entry.class, classLevel);
      return {
        info: { level: i + 1, classLevel, base: sys?.category === "base", techniqueLevels: sys?.techniqueLevels ?? [], secretLevels: sys?.secretLevels ?? [] },
        className: cls?.name ?? "", startingFeat: sys?.category === "base" && classLevel === 1 ? sys.startingFeat ?? "" : "",
      };
    });
    const granted = new Map<number, Item.Implementation>();
    for (const l of levels) {
      const feat = l.startingFeat ? actor.items.find((i) => i.type === "feat" && i.name === l.startingFeat) as Item.Implementation | undefined : undefined;
      if (feat) granted.set(l.info.level, feat);
    }
    const grantedIds = new Set([...granted.values()].map((i) => i.id));
    const picks: Pick[] = actor.items.contents.flatMap((i) => {
      const slot = i.getFlag("holocron", "slot");
      if (!slot || grantedIds.has(i.id) || !["feat", "talent", "feature"].includes(i.type)) return [];
      return [{ id: i.id ?? "", name: nameWithChoice(i), level: slot.level, kind: slot.kind as SlotKind, tree: (i.system as { tree?: string }).tree ?? "" }];
    });
    const species = actor.items.find((i) => i.type === "species");
    const speciesBonusFeat = ((species?.system as { traits?: { name: string }[] } | undefined)?.traits ?? []).some((t) => t.name === "Bonus Feat");
    const powers = actor.items.filter((i) => i.type === "forcePower").sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
      .flatMap((p) => Array.from({ length: (p.system as { copies?: number }).copies ?? 1 }, () => ({ id: p.id ?? "", name: p.name ?? "" })));
    const slots = progressionSlots(levels.map((l) => l.info), picks, { speciesBonusFeat, powersPerTraining: forcePowersKnown(1, s.scores.int.mod), powers });
    return slots.map((row, i) => {
      const level = levels[i];
      const startingFeat = level ? granted.get(level.info.level) : undefined;
      return [
        ...(startingFeat ? [{ label: "Starting feat", granted: true, filled: { name: startingFeat.name, tree: "" }, kind: "", level: i + 1, cls: "", canFill: false }] : []),
        ...row.map((slot) => ({ ...slot, granted: false, level: i + 1, cls: level?.className ?? "", canFill: editMode && !slot.filled })),
      ];
    });
  }

  /** Adds the level: the class item from the compendium if the character does not have it, then the progression entry. */
  async #takeLevel(ref: ClassRef, hitPoints: number): Promise<void> {
    let itemId = ref.itemId;
    if (!itemId && ref.uuid) {
      const source = await fromUuid(ref.uuid) as Item.Implementation | null;
      if (!source) return void ui.notifications?.error(`Holocron: ${ref.name} is not in the Classes compendium.`);
      const [created] = await this.actor.createEmbeddedDocuments("Item", [source.toObject()]);
      itemId = created?.id ?? undefined;
    }
    if (!itemId) return;
    const progression = (this.actor.system as CharacterModel).toObject().progression;
    const first = !progression.some((e) => e.class === itemId);
    progression.push({ class: itemId, hitPoints, increases: [] });
    this.#levelUp = null;
    await this.actor.update({ "system.progression": progression } as never);
    if (first) await this.#grantStartingFeat(itemId);
  }

  /** "A base class grants its starting feat ... at its level 1" (rulings.md, Classes): added from the Feats compendium unless the character has it. */
  async #grantStartingFeat(classId: string): Promise<void> {
    const sys = this.actor.items.get(classId)?.system as { category?: string; startingFeat?: string } | undefined;
    const name = sys?.category === "base" ? sys.startingFeat ?? "" : "";
    if (!name || this.actor.items.some((i) => i.type === "feat" && i.name === name)) return;
    const pack = game.packs?.get("holocron.feats");
    const entry = pack?.index.getName(name);
    const feat = entry ? await fromUuid(entry.uuid) as Item.Implementation | null : null;
    if (feat) await this.actor.createEmbeddedDocuments("Item", [feat.toObject()]);
    else ui.notifications?.warn(`Holocron: the starting feat ${name} is not in the Feats compendium.`);
  }

  static async #levelUpStart(this: CharacterSheet): Promise<void> {
    if (!this.isEditable) return;
    this.#levelUp = { step: "class" };
    await this.render();
  }

  static async #levelUpCancel(this: CharacterSheet): Promise<void> {
    this.#levelUp = null;
    await this.render();
  }

  /** A class the character already has. */
  static async #levelClass(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const item = this.actor.items.get(target.dataset["classId"] ?? "");
    if (item?.type !== "class") return;
    await this.#chooseClass({ name: item.name ?? "", die: (item.system as { hitDie?: number }).hitDie ?? 0, itemId: item.id ?? undefined });
  }

  /** Hit points for the new level: the average, or a roll posted to chat (rulings.md, Hit points and healing). */
  static async #levelHp(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const state = this.#levelUp;
    if (state?.step !== "hp") return;
    const { ref } = state;
    let hitPoints = averageHitDie(ref.die);
    if (target.dataset["mode"] === "roll") {
      const roll = await new Roll(`1d${ref.die}`).evaluate();
      const level = (this.actor.system as CharacterModel).level + 1;
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor as Actor.Stored }), flavor: `Level ${level} hit points (${ref.name})` });
      hitPoints = roll.total ?? hitPoints;
    }
    await this.#takeLevel(ref, hitPoints);
  }

  /** Removes the last level. Its class item stays on the character. */
  static async #removeLevel(this: CharacterSheet): Promise<void> {
    if (!this.isEditable) return;
    const progression = (this.actor.system as CharacterModel).toObject().progression;
    if (!progression.length) return;
    progression.pop();
    await this.actor.update({ "system.progression": progression } as never);
  }

  /** Picks or unpicks an ability for a level's +1 and +1: two different abilities. */
  static async #increasePick(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const level = Number(target.dataset["level"]);
    const a = target.dataset["ability"] as AbilityKey;
    if (!ABILITY_INCREASE_LEVELS.includes(level) || !ABILITIES.includes(a)) return;
    const picks = this.#increasePicks.get(level) ?? [];
    const next = picks.includes(a) ? picks.filter((x) => x !== a) : picks.length < 2 ? [...picks, a] : picks;
    this.#increasePicks.set(level, next);
    await this.render();
  }

  static async #increaseSave(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const level = Number(target.dataset["level"]);
    const picks = this.#increasePicks.get(level) ?? [];
    const progression = (this.actor.system as CharacterModel).toObject().progression;
    const entry = progression[level - 1];
    if (!entry || picks.length !== 2 || picks[0] === picks[1]) return;
    entry.increases = [...picks];
    this.#increasePicks.delete(level);
    await this.actor.update({ "system.progression": progression } as never);
  }

  /** A skill check: the dialog (Normal or a Force Point's advantage, other modifier); Shift+click rolls straight away. */
  static async #rollSkill(this: CharacterSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
    const key = target.dataset["skill"] as SkillKey | undefined;
    if (!key || !SKILL_KEYS.includes(key)) return;
    const actor = this.actor as Actor.Implementation;
    const choice = event.shiftKey ? { advantage: false, other: 0 } : await checkDialog(actor, key);
    if (choice) await rollCheck(actor, key, choice);
  }

  static async #secondWind(this: CharacterSheet): Promise<void> {
    if (this.isEditable) await useSecondWind(this.actor as Actor.Implementation);
  }

  /** Carried, then In hands (one Kit, if the hands are free), then Stowed (episode-vii, Equipment). */
  static async #cycleCarry(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const item = this.actor.items.get(target.dataset["itemId"] ?? "");
    if (!item || !["weapon", "equipment"].includes(item.type)) return;
    const sys = item.system as { slot: SlotSize; carry: Carry };
    const handsTaken = this.actor.items.some((i) => i.id !== item.id && (i.system as { carry?: Carry }).carry === "hands");
    await item.update({ "system.carry": nextCarry(sys.carry, sys.slot, handsTaken) } as never);
  }

  /** Edit mode: an equipment item's size, none, Light, Kit (src/rules/inventory.ts, nextSize). */
  static async #cycleSize(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    if (!this.#editMode) return;
    const item = this.actor.items.get(target.dataset["itemId"] ?? "");
    if (item?.type === "equipment") await item.update({ "system.slot": nextSize((item.system as { slot: SlotSize }).slot) } as never);
  }

  static async #toggleWorn(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const item = this.actor.items.get(target.dataset["itemId"] ?? "");
    if (item?.type === "armor") await item.update({ "system.worn": !(item.system as { worn?: boolean }).worn } as never);
  }

  static async #toggleInstalled(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const item = this.actor.items.get(target.dataset["itemId"] ?? "");
    if (item?.type === "droidSystem") await item.update({ "system.installed": !(item.system as { installed?: boolean }).installed } as never);
  }

  /** Removes an item, after Foundry's own confirmation. Edit mode only. */
  static async #deleteItem(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    if (!this.#editMode || !this.isEditable) return;
    const item = this.actor.items.get(target.dataset["itemId"] ?? "");
    if (item) await item.deleteDialog();
  }

  /**
   * A Force power, species or choice feat or talent from elsewhere goes through addItem (a copy, a
   * replacement, the choice dialog); the rest drop as Foundry drops them.
   */
  override async _onDropItem(event: DragEvent, item: Item.Implementation) {
    if ((item.type === "forcePower" || item.type === "species" || choiceListOf(item)) && item.parent !== this.actor) {
      return this.isEditable ? addItem(this.actor as Actor.Implementation, item) : null;
    }
    return super._onDropItem(event, item);
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

  /** Edit mode: a derived tree is removed, or a removed one restored. */
  static async #toggleTree(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const tree = target.dataset["tree"] ?? "";
    if (!this.#editMode || !this.isEditable || !tree) return;
    const removed = (this.actor.system as CharacterModel).talentAccess.removed;
    await this.actor.update({ "system.talentAccess.removed": removed.includes(tree) ? removed.filter((t) => t !== tree) : [...removed, tree] } as never);
  }

  static async #unaddTree(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const tree = target.dataset["tree"] ?? "";
    if (!this.#editMode || !this.isEditable || !tree) return;
    const added = (this.actor.system as CharacterModel).talentAccess.added;
    await this.actor.update({ "system.talentAccess.added": added.filter((t) => t !== tree) } as never);
  }

  /** Edit mode: adds the tree chosen in the card's select (Bryan: no note, no badge; mockup 1). */
  static async #addTree(this: CharacterSheet): Promise<void> {
    const tree = this.element.querySelector<HTMLSelectElement>("select.add-tree")?.value ?? "";
    if (!this.#editMode || !this.isEditable || !tree) return;
    const added = (this.actor.system as CharacterModel).talentAccess.added;
    if (!added.includes(tree)) await this.actor.update({ "system.talentAccess.added": [...added, tree] } as never);
  }

  /** Pins or unpins a row; a new pin goes last. */
  async #pin(id: string): Promise<void> {
    if (!this.isEditable || !id) return;
    const pins = [...(this.actor.system as CharacterModel).pins];
    const at = pins.indexOf(id);
    if (at >= 0) pins.splice(at, 1);
    else pins.push(id);
    await this.actor.update({ "system.pins": pins } as never);
  }

  static async #togglePin(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    await this.#pin(target.dataset["pinId"] ?? "");
  }

  /** A chip does what its row's main button does: Attack, roll the power, Use, or the stance. */
  static async #usePin(this: CharacterSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
    const id = target.dataset["pinId"] ?? "";
    if (id === "stance") return CharacterSheet.#toggleStance.call(this);
    const item = this.actor.items.get(id);
    if (!item) return;
    const actor = this.actor as Actor.Implementation;
    if (item.type === "weapon") await rollAttack(actor, item as Item.Implementation);
    else if (item.type === "forcePower") await this.#powerRoll(item as Item.Implementation, event.shiftKey);
    else await postItem(actor, item as Item.Implementation);
  }

  static async #useItem(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const item = this.actor.items.get(target.dataset["itemId"] ?? "");
    if (item) await postItem(this.actor as Actor.Implementation, item as Item.Implementation);
  }

  static async #toggleStance(this: CharacterSheet): Promise<void> {
    if (this.isEditable) await toggleStance(this.actor as Actor.Implementation);
  }

  /** Edit mode: removes an effect on the character, after Foundry's confirmation. */
  static async #deleteEffect(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    if (!this.#editMode || !this.isEditable) return;
    const effect = this.actor.effects.get(target.dataset["effectId"] ?? "");
    if (effect) await effect.deleteDialog();
  }

  /** Sets the Dark Side score to the clicked pip; set by hand only (Bryan, mockup 1). */
  static async #darkSide(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const value = Number(target.dataset["value"]);
    const s = this.actor.system as CharacterModel;
    if (this.isEditable && Number.isInteger(value) && value >= 0 && value <= s.darkSideMax && value !== s.darkSide.value) await this.actor.update({ "system.darkSide.value": value } as never);
  }

  /** A power's ready copies: a lit pip marks one used, an empty pip marks one ready. */
  static async #powerPip(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const item = this.actor.items.get(target.dataset["itemId"] ?? "");
    if (item?.type !== "forcePower" || !this.isEditable) return;
    const d = item.system as unknown as { copies: number; ready: number };
    const lit = Number(target.dataset["index"]) < d.ready;
    const next = Math.max(0, Math.min(d.copies, d.ready + (lit ? -1 : 1)));
    if (next !== d.ready) await item.update({ "system.ready": next } as never);
  }

  static async #readyPowers(this: CharacterSheet): Promise<void> {
    if (this.isEditable) await readyAllPowers(this.actor as Actor.Implementation);
  }

  /** Edit mode: one copy fewer; the last copy removes the power, after Foundry's confirmation. */
  static async #removeCopy(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    if (!this.#editMode || !this.isEditable) return;
    const item = this.actor.items.get(target.dataset["itemId"] ?? "");
    if (item?.type !== "forcePower") return;
    const d = item.system as unknown as { copies: number; ready: number };
    if (d.copies <= 1) await item.deleteDialog();
    else await item.update({ "system.copies": d.copies - 1, "system.ready": Math.min(d.ready, d.copies - 1) } as never);
  }

  /** A power's check, through the check dialog; Shift+click rolls straight away, as skills do. */
  static async #rollPower(this: CharacterSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
    const item = this.actor.items.get(target.dataset["itemId"] ?? "");
    if (item?.type === "forcePower") await this.#powerRoll(item as Item.Implementation, event.shiftKey);
  }

  async #powerRoll(power: Item.Implementation, skipDialog: boolean): Promise<void> {
    const actor = this.actor as Actor.Implementation;
    const choice = skipDialog ? { advantage: false, other: 0 } : await checkDialog(actor, "useTheForce");
    if (choice) await rollPower(actor, power, choice);
  }

  static async #expand(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const id = target.dataset["itemId"] ?? "";
    if (!this.#expanded.delete(id)) this.#expanded.add(id);
    await this.render();
  }

  /** Edit mode: sets the choice of a choice feat or talent that has none. */
  static async #chooseFor(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    if (!this.#editMode || !this.isEditable) return;
    const item = this.actor.items.get(target.dataset["itemId"] ?? "");
    if (!item) return;
    const picked = await askChoice(this.actor as Actor.Implementation, item);
    if (picked) await item.update({ "system.choice": picked.value } as never);
  }

  /** Edit mode: an empty level slot opens the browser to fill it (mockup 3). */
  static async #fillSlot(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    if (!this.#editMode || !this.isEditable) return;
    const level = Number(target.dataset["level"]);
    const kind = target.dataset["kind"] as SlotKind;
    await CompendiumBrowser.open({ actor: this.actor as Actor.Implementation, slot: { level, kind, cls: target.dataset["class"] ?? "" } });
  }

  /** Opens the compendium browser to add to this character: Force powers, gear, a species. */
  static async #browse(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    await CompendiumBrowser.open({ actor: this.actor as Actor.Implementation, target: target.dataset["target"] as BrowseTarget });
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
