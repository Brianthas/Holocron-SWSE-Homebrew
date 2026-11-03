import { ABILITIES, ABILITY_LABELS, type AbilityKey } from "../config/abilities.ts";
import { SIZE_ABILITY_ADJUSTMENTS } from "../config/sizes.ts";
import { SKILLS, SKILL_KEYS, type SkillKey } from "../config/skills.ts";
import type { CharacterModel, WeaponData } from "../data/actor/character.ts";
import { rollAttack, rollDamage } from "../dice/attack.ts";
import { checkDialog, rollCheck, useSecondWind } from "../dice/check.ts";
import { actionTag, readyAllPowers, rollPower } from "../dice/force.ts";
import { FORCE_DESCRIPTORS, type ForceDescriptorKey } from "../config/force.ts";
import { featureSlots, forcePowersKnown } from "../rules/force.ts";
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
      attack: CharacterSheet.#attack, damage: CharacterSheet.#damage, pip: CharacterSheet.#pip,
      toggleMode: CharacterSheet.#toggleMode, abilityStep: CharacterSheet.#abilityStep, abilityEntry: CharacterSheet.#abilityEntry,
      speciesPick: CharacterSheet.#speciesPick, defenseStep: CharacterSheet.#defenseStep, toggleTrained: CharacterSheet.#toggleTrained,
      levelUpStart: CharacterSheet.#levelUpStart, levelUpCancel: CharacterSheet.#levelUpCancel, levelClass: CharacterSheet.#levelClass,
      levelHp: CharacterSheet.#levelHp, removeLevel: CharacterSheet.#removeLevel, increasePick: CharacterSheet.#increasePick,
      increaseSave: CharacterSheet.#increaseSave, cycleCarry: CharacterSheet.#cycleCarry, toggleWorn: CharacterSheet.#toggleWorn,
      toggleInstalled: CharacterSheet.#toggleInstalled, deleteItem: CharacterSheet.#deleteItem, cycleSize: CharacterSheet.#cycleSize,
      rollSkill: CharacterSheet.#rollSkill, secondWind: CharacterSheet.#secondWind,
      darkSide: CharacterSheet.#darkSide, powerPip: CharacterSheet.#powerPip, readyPowers: CharacterSheet.#readyPowers,
      removeCopy: CharacterSheet.#removeCopy, rollPower: CharacterSheet.#rollPower, expand: CharacterSheet.#expand, browse: CharacterSheet.#browse,
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
    notes: { template: `${TEMPLATES}/notes.hbs`, scrollable: [""] },
  };

  static override TABS = {
    primary: { tabs: [{ id: "play" }, { id: "force" }, { id: "build" }, { id: "inventory" }, { id: "notes" }], initial: "play", labelPrefix: "HOLOCRON.Sheet.Tab" },
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
        };
      }),
      levelUp: await this.#levelUpContext(),
      inventory: this.#inventoryContext(droid),
      force: await this.#forceContext(),
      talents: actor.items.filter((i) => i.type === "talent").map((t) => ({ id: t.id, name: t.name, tree: (t.system as { tree?: string }).tree ?? "", action: (t.system as { action?: string }).action ?? "" }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      feats: actor.items.filter((i) => i.type === "feat").map((f) => ({ id: f.id, name: f.name })).sort((a, b) => a.name.localeCompare(b.name)),
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

  static async #damage(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const weapon = this.actor.items.get(target.dataset["itemId"] ?? "");
    if (weapon) await rollDamage(this.actor as Actor.Implementation, weapon as Item.Implementation);
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
        id: p.id, name: p.name, copies: d.copies, expanded: this.#expanded.has(p.id ?? ""),
        pips: Array.from({ length: d.copies }, (_, i) => ({ index: i, number: i + 1, on: i < d.ready })),
        tags: d.descriptors.map((k) => FORCE_DESCRIPTORS[k]), action: actionTag(d.action), actionTitle: d.action,
        description: await enrich(d.description),
      };
    }));
    const copies = powers.reduce((n, p) => n + p.copies, 0);
    const known = forcePowersKnown(trainings, s.scores.int.mod);

    // Technique and secret slots: each class's slot levels reached by the levels taken in it.
    const classes = Object.entries(s.classLevels).map(([id, levels]) => ({ levels, system: actor.items.get(id)?.system as { techniqueLevels?: number[]; secretLevels?: number[] } | undefined }));
    const feature = async (key: "techniques" | "secrets", category: string, slotKey: "techniqueLevels" | "secretLevels", label: string, plural: string, pack: string, empty: string) => {
      const list = items("feature").filter((f) => (f.system as { category?: string }).category === category);
      const slots = featureSlots(classes.map((c) => ({ levels: c.levels, slotLevels: c.system?.[slotKey] ?? [] })));
      return {
        key, label, plural, pack, empty, slots, count: list.length, over: list.length > slots,
        items: await Promise.all(list.map(async (f) => ({
          id: f.id, name: f.name, power: (f.system as { power?: string }).power ?? "", expanded: this.#expanded.has(f.id ?? ""),
          description: await enrich((f.system as { description?: string }).description ?? ""),
        }))),
      };
    };
    const features = [
      await feature("techniques", "forceTechnique", "techniqueLevels", "Force Techniques", "techniques", "holocron.force-techniques", "None yet. Force Adept, Jedi Knight, Sith Apprentice and Imperial Legionnaire earn one at each even class level."),
      await feature("secrets", "forceSecret", "secretLevels", "Force Secrets", "secrets", "holocron.force-secrets", "None yet. Force Disciple, Jedi Master and Sith Lord earn one at each of class levels 2 to 5."),
    ];

    // One line naming what is still to choose, opening the first such compendium.
    const waiting = [
      { n: known - copies, noun: "Force power", pack: "holocron.force-powers" },
      ...features.map((f) => ({ n: f.slots - f.count, noun: f.key === "techniques" ? "Force technique" : "Force secret", pack: f.pack })),
    ].filter((w) => w.n > 0);
    const pending = waiting.length ? { pack: waiting[0]?.pack, text: `${waiting.map((w) => `${w.n} ${w.noun}${w.n === 1 ? "" : "s"}`).join(" and ")} to choose` } : null;

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
    progression.push({ class: itemId, hitPoints, increases: [] });
    this.#levelUp = null;
    await this.actor.update({ "system.progression": progression } as never);
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
   * A character has one species: a dropped species replaces the one it has. The new one is created
   * first and the old one removed after, so a failed drop leaves the character as it was.
   */
  override async _onDropItem(event: DragEvent, item: Item.Implementation) {
    // A power the character knows gains a copy, ready (mockup 3: "adds a copy of a power already known").
    if (item.type === "forcePower" && item.parent !== this.actor) {
      const known = this.actor.items.find((i) => i.type === "forcePower" && i.name === item.name);
      if (known) {
        if (!this.isEditable) return null;
        const d = known.system as unknown as { copies: number; ready: number };
        await known.update({ "system.copies": d.copies + 1, "system.ready": d.ready + 1 } as never);
        return known as Item.Implementation;
      }
    }
    const old = item.type === "species" ? this.actor.items.filter((i) => i.type === "species" && i.id !== item.id) : [];
    const created = await super._onDropItem(event, item);
    if (created && old.length && created.parent === this.actor) await this.actor.deleteEmbeddedDocuments("Item", old.map((i) => i.id ?? ""));
    return created;
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
    if (item?.type !== "forcePower") return;
    const actor = this.actor as Actor.Implementation;
    const choice = event.shiftKey ? { advantage: false, other: 0 } : await checkDialog(actor, "useTheForce");
    if (choice) await rollPower(actor, item as Item.Implementation, choice);
  }

  static async #expand(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const id = target.dataset["itemId"] ?? "";
    if (!this.#expanded.delete(id)) this.#expanded.add(id);
    await this.render();
  }

  /** Opens a compendium to drag from, until the compendium browser is built. */
  static async #browse(this: CharacterSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const pack = game.packs?.get(target.dataset["pack"] ?? "");
    if (pack) await pack.render({ force: true } as never);
    else ui.notifications?.warn(`Holocron: compendium ${target.dataset["pack"]} is not loaded.`);
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
