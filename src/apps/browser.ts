import { DROID_SYSTEM_GROUPS, type DroidSystemGroupKey } from "../config/droids.ts";
import { FORCE_DESCRIPTORS, type ForceDescriptorKey } from "../config/force.ts";
import { FORCE_SENSITIVITY_TREES } from "../config/talents.ts";
import { WEAPON_GROUPS, type WeaponGroupKey } from "../config/weapons.ts";
import { actionTag } from "../dice/force.ts";
import { SLOT_LABELS, type SlotSize } from "../rules/inventory.ts";
import { addItem } from "../sheets/add-item.ts";
import { accessibleTrees, accessibleTreesFor, type AccessInput } from "../rules/talent-access.ts";
import { SLOT_KIND_LABELS, type SlotKind } from "../rules/slots.ts";
import { prereqHtml, traditionTreeMap, unmet, type PrereqCharacter, type PrereqNode } from "../rules/prerequisites.ts";
import { ABILITIES } from "../config/abilities.ts";
import { SKILLS, SKILL_KEYS } from "../config/skills.ts";
import type { CharacterModel } from "../data/actor/character.ts";

/**
 * The compendium browser (mockup 3): Talents, Feats, Force, Equipment and Species, with search and
 * filters over the system's compendiums. Rows drag onto a sheet. Opened from a sheet's Browse button
 * it adds to that character: Add puts the item on the sheet, as a drop does (sheets/add-item.ts).
 * Opened from a Build tab level slot it takes one pick, which records the slot it filled; feats and
 * talents have Add only from a slot.
 */

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const TEMPLATES = "systems/holocron/templates/browser";

type Tab = "talents" | "feats" | "force" | "equipment" | "species";
type ForceSub = "powers" | "techniques" | "secrets";
type EquipSub = "weapons" | "armor" | "equipment" | "droid";
/** What Add puts on the character: one kind of row. */
export type BrowseTarget = ForceSub | EquipSub | "species";

interface Row { uuid: string; name: string; [key: string]: unknown }
/** A result row as the template shows it; `line` is HTML; `add` shows Add instead of Drag. */
interface RowView {
  uuid: string; name: string; tags: string[]; cost: string; costTitle: string; badges: { cls: string; text: string }[];
  line: string; open: boolean; description: string; add: boolean;
}
interface Data {
  talents: (Row & { tree: string; prereq: string; nodes: PrereqNode | null })[];
  traditionTrees: Map<string, string>;
  feats: (Row & { prereq: string; repeatable: boolean })[];
  powers: (Row & { tags: string[]; action: string; actionTitle: string })[];
  techniques: (Row & { power: string; repeatable: boolean })[];
  secrets: (Row & { power: string; repeatable: boolean })[];
  weapons: (Row & { group: string; size: string })[];
  armor: Row[];
  equipment: (Row & { size: string })[];
  droid: (Row & { group: string })[];
  species: (Row & { size: string; rarity: string; droid: boolean; traits: string[] })[];
  classes: { name: string; base: boolean; trees: string[] }[];
}

const TAB_LABELS: Record<Tab, string> = { talents: "Talents", feats: "Feats", force: "Force", equipment: "Equipment", species: "Species" };
const TARGET_TAB: Record<BrowseTarget, Tab> = {
  powers: "force", techniques: "force", secrets: "force", weapons: "equipment", armor: "equipment", equipment: "equipment", droid: "equipment", species: "species",
};
const TARGET_NOUN: Record<BrowseTarget, string> = {
  powers: "Force powers", techniques: "Force techniques", secrets: "Force secrets", weapons: "inventory", armor: "inventory", equipment: "inventory", droid: "droid systems", species: "species",
};
/** A level slot the browser fills (rules/slots.ts), with the class whose level earned it. */
export interface Slot { level: number; kind: SlotKind; cls: string }
/** The rows Add can serve: a Browse target's, or the feats and talents a level slot takes. */
type RowKind = BrowseTarget | "feats" | "talents";
const SLOT_ROWS: Record<SlotKind, RowKind> = {
  speciesFeat: "feats", feat: "feats", classFeat: "feats", talent: "talents", power: "powers", technique: "techniques", secret: "secrets",
};
const ROW_TAB: Record<RowKind, Tab> = { ...TARGET_TAB, feats: "feats", talents: "talents" };
/** Species rarity groups, in order (the species rarity page); droids are their own group (Bryan). */
const RARITY_GROUPS: [string, string][] = [["common", "Common"], ["rare", "Rare"], ["droid", "Droids"], ["", "Not on the rarity page"], ["denied", "Denied (GM)"]];
const SIZE_GROUPS = ["Small", "Medium", "Large"];
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

let loading: Promise<Data> | null = null;

/** "Only trees my classes grant": off at first, remembered per player (plan, Compendium browser). */
const ONLY_MINE = "browserOnlyMine";
/** "Only talents I qualify for": off at first, remembered per player (mockup 3, item 3). */
const ONLY_QUALIFIED = "browserOnlyQualified";
export function registerBrowserSettings(): void {
  game.settings.register("holocron", ONLY_MINE, { scope: "client", config: false, type: Boolean, default: false });
  game.settings.register("holocron", ONLY_QUALIFIED, { scope: "client", config: false, type: Boolean, default: false });
}
const escape = (s: string) => foundry.utils.escapeHTML(s);
const ABILITY_NAMES = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" } as const;

/** What the prerequisite check reads off a character (rules/prerequisites.ts). */
function prereqCharacter(actor: Actor.Implementation, traditionTrees: Map<string, string>): PrereqCharacter {
  const s = actor.system as CharacterModel;
  const items = actor.items;
  const classItems = Object.keys(s.classLevels).map((id) => items.get(id)).filter((i) => i?.type === "class");
  return {
    talents: items.filter((i) => i.type === "talent").map((i) => ({ name: i.name ?? "", tree: (i.system as { tree?: string }).tree ?? "", choice: (i.system as { choice?: string }).choice ?? "" })),
    feats: items.filter((i) => i.type === "feat").map((i) => ({ name: i.name ?? "", choice: (i.system as { choice?: string }).choice ?? "" })),
    bab: s.bab,
    level: s.level,
    trained: new Set(SKILL_KEYS.filter((k) => s.isTrained(k)).map((k) => SKILLS[k].label)),
    scores: Object.fromEntries(ABILITIES.map((a) => [ABILITY_NAMES[a], s.scores[a].value])),
    powers: new Set(items.filter((i) => i.type === "forcePower").map((i) => i.name ?? "")),
    techniques: items.filter((i) => i.type === "feature" && (i.system as { category?: string }).category === "forceTechnique").length,
    secrets: items.filter((i) => i.type === "feature" && (i.system as { category?: string }).category === "forceSecret").length,
    unlockedTrees: accessibleTrees(s.accessInput),
    weaponGroups: new Set(classItems.flatMap((i) => (i?.system as { weaponProficiencies?: string[] } | undefined)?.weaponProficiencies ?? [])),
    traditionTrees,
  };
}

/** Every pack's index, read once per client with only the fields the browser filters on. */
async function loadData(): Promise<Data> {
  const index = async (pack: string, fields: string[]) => {
    const p = game.packs?.get(`holocron.${pack}`);
    return p ? [...await p.getIndex({ fields } as never)] as unknown as ({ uuid: string; name: string; system: Record<string, unknown> })[] : [];
  };
  const sys = <T>(e: { system?: Record<string, unknown> }, path: string, fallback: T): T => (foundry.utils.getProperty(e.system ?? {}, path) as T | undefined) ?? fallback;
  const base = (e: { uuid: string; name: string }) => ({ uuid: e.uuid, name: e.name });
  const [talents, feats, powers, techniques, secrets, weapons, armor, equipment, droid, species, classes] = await Promise.all([
    index("talents", ["system.tree", "system.prerequisite.text", "system.prerequisite.nodes"]),
    index("feats", ["system.prerequisite.text", "system.repeatable"]),
    index("force-powers", ["system.descriptors", "system.action"]),
    index("force-techniques", ["system.power", "system.repeatable"]),
    index("force-secrets", ["system.power", "system.repeatable"]),
    index("weapons", ["system.group", "system.slot"]),
    index("armor", []),
    index("equipment", ["system.slot"]),
    index("droid-systems", ["system.group"]),
    index("species", ["system.size", "system.rarity", "system.droid", "system.traits"]),
    index("classes", ["system.category", "system.talentTrees"]),
  ]);
  const byName = <T extends { name: string }>(rows: T[]) => rows.sort((a, b) => a.name.localeCompare(b.name));
  const talentRows = byName(talents.map((e) => ({ ...base(e), tree: sys(e, "tree", ""), prereq: sys(e, "prerequisite.text", ""), nodes: sys<PrereqNode | null>(e, "prerequisite.nodes", null) })));
  return {
    talents: talentRows,
    traditionTrees: traditionTreeMap(talentRows),
    feats: byName(feats.map((e) => ({ ...base(e), prereq: sys(e, "prerequisite.text", ""), repeatable: sys(e, "repeatable", false) }))),
    powers: byName(powers.map((e) => ({
      ...base(e), tags: sys<ForceDescriptorKey[]>(e, "descriptors", []).map((k) => FORCE_DESCRIPTORS[k] ?? k),
      action: actionTag(sys(e, "action", "")), actionTitle: sys(e, "action", ""),
    }))),
    techniques: byName(techniques.map((e) => ({ ...base(e), power: sys(e, "power", ""), repeatable: sys(e, "repeatable", false) }))),
    secrets: byName(secrets.map((e) => ({ ...base(e), power: sys(e, "power", ""), repeatable: sys(e, "repeatable", false) }))),
    weapons: byName(weapons.map((e) => ({ ...base(e), group: WEAPON_GROUPS[sys<WeaponGroupKey>(e, "group", "simple")] ?? "", size: SLOT_LABELS[sys<SlotSize>(e, "slot", "none")] ?? "" }))),
    armor: byName(armor.map(base)),
    equipment: byName(equipment.map((e) => ({ ...base(e), size: SLOT_LABELS[sys<SlotSize>(e, "slot", "none")] ?? "" }))),
    droid: byName(droid.map((e) => ({ ...base(e), group: DROID_SYSTEM_GROUPS[sys<DroidSystemGroupKey>(e, "group", "" as DroidSystemGroupKey)] ?? "" }))),
    species: byName(species.map((e) => ({
      ...base(e), size: capitalise(sys(e, "size", "medium")), rarity: sys(e, "rarity", ""), droid: sys(e, "droid", false),
      traits: sys<{ name: string }[]>(e, "traits", []).map((t) => t.name).filter(Boolean),
    }))),
    classes: classes.map((e) => ({ name: e.name, base: sys<string>(e, "category", "") === "base", trees: sys<string[]>(e, "talentTrees", []) })),
  };
}

export class CompendiumBrowser extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: "holocron-browser",
    classes: ["holocron", "hc-browser"],
    position: { width: 1040, height: 740 },
    window: { title: "Compendium Browser", resizable: true },
    actions: {
      // Not "tab": ApplicationV2 handles that action itself (application.mjs, #onClickAction).
      showTab: CompendiumBrowser.#onTab, seg: CompendiumBrowser.#seg, group: CompendiumBrowser.#group, open: CompendiumBrowser.#open,
      add: CompendiumBrowser.#add, clear: CompendiumBrowser.#clear, classTag: CompendiumBrowser.#onClassTag, tag: CompendiumBrowser.#tagToggle,
      traitAdd: CompendiumBrowser.#traitAdd, traitRemove: CompendiumBrowser.#traitRemove, done: CompendiumBrowser.#done,
    },
  };

  static override PARTS = {
    head: { template: `${TEMPLATES}/head.hbs` },
    filters: { template: `${TEMPLATES}/filters.hbs`, scrollable: [""] },
    results: { template: `${TEMPLATES}/results.hbs`, scrollable: [""] },
  };

  /** The one browser window; a sheet's Browse button reopens it with its own target. */
  static #instance: CompendiumBrowser | null = null;

  static async open(options: { tab?: Tab; actor?: Actor.Implementation | null; target?: BrowseTarget | null; slot?: Slot | null } = {}): Promise<CompendiumBrowser> {
    const app = (CompendiumBrowser.#instance ??= new CompendiumBrowser());
    app.#reset(options);
    await app.render({ force: true });
    return app;
  }

  #tab: Tab = "talents";
  #forceSub: ForceSub = "powers";
  #equipSub: EquipSub = "weapons";
  #actor: Actor.Implementation | null = null;
  #target: BrowseTarget | null = null;
  /** A level slot being filled: one pick, then the window closes. */
  #slot: Slot | null = null;
  #q = "";
  #treeQ = "";
  #trees = new Set<string>();
  #order: "tree" | "name" = "tree";
  #classTag: string | null = null;
  #sources = new Set<string>();
  #collapsed = new Set<string>();
  #opened = new Set<string>();
  #descriptions = new Map<string, string>();
  #sizes = new Set<string>();
  #kind: "Living" | "Droid" | null = null;
  #traits = new Set<string>();
  #traitQ = "";
  #showDenied = false;
  #speciesGroup: "rarity" | "size" = "rarity";
  /** The input to give focus back to after a render, by name. */
  #refocus: string | null = null;

  #reset({ tab, actor = null, target = null, slot = null }: { tab?: Tab; actor?: Actor.Implementation | null; target?: BrowseTarget | null; slot?: Slot | null }): void {
    this.#actor = actor;
    this.#target = target;
    this.#slot = slot;
    const slotRows = slot ? SLOT_ROWS[slot.kind] : null;
    this.#tab = tab ?? (slotRows ? ROW_TAB[slotRows] : target ? TARGET_TAB[target] : "talents");
    if (slotRows === "powers" || slotRows === "techniques" || slotRows === "secrets") this.#forceSub = slotRows;
    if (target === "powers" || target === "techniques" || target === "secrets") this.#forceSub = target;
    if (target === "weapons" || target === "armor" || target === "equipment" || target === "droid") this.#equipSub = target;
    this.#q = ""; this.#treeQ = ""; this.#trees.clear(); this.#classTag = null; this.#sources.clear(); this.#opened.clear();
    this.#sizes.clear(); this.#kind = null; this.#traits.clear(); this.#traitQ = "";
  }

  /** The character the browser marks taken items for: its target, else the user's own character. */
  get #character(): Actor.Implementation | null {
    return this.#actor ?? (game.user?.character as Actor.Implementation | null | undefined) ?? null;
  }

  /**
   * The trees the character can use (the Build tab's Talent tree access card), or null with no
   * character. From a talent slot, only the trees that slot's class may use (core rulebook p54).
   */
  #mine(): Set<string> | null {
    const system = this.#character?.system as { accessInput?: AccessInput } | undefined;
    if (!system?.accessInput) return null;
    return this.#slot?.kind === "talent" ? accessibleTreesFor(system.accessInput, this.#slot.cls) : accessibleTrees(system.accessInput);
  }

  #has(type: string, name: string): number {
    return this.#character?.items.filter((i) => i.type === type && i.name === name).length ?? 0;
  }

  #match(...texts: string[]): boolean {
    const q = this.#q.trim().toLowerCase();
    return !q || texts.some((t) => t.toLowerCase().includes(q));
  }

  /** The trees a class tag shows: the class's own, or Force Sensitivity's. */
  #tagTrees(data: Data): Set<string> | null {
    if (!this.#classTag) return null;
    if (this.#classTag === "Force Sensitivity") return new Set(FORCE_SENSITIVITY_TREES);
    return new Set(data.classes.find((c) => c.name === this.#classTag)?.trees ?? []);
  }

  /** Whether rows of this kind get Add: the kind the sheet's Browse button or level slot asked for. */
  #canAdd(kind: RowKind): boolean {
    const wanted = this.#slot ? SLOT_ROWS[this.#slot.kind] : this.#target;
    return wanted === kind && Boolean(this.#actor?.isOwner);
  }

  override async _prepareContext(options: object) {
    const context = await super._prepareContext(options as never);
    const data = await (loading ??= loadData());
    const target = this.#target;
    const onTargetTab = target && TARGET_TAB[target] === this.#tab && (this.#tab !== "force" || this.#forceSub === target) && (this.#tab !== "equipment" || this.#equipSub === target);
    const slot = this.#slot;
    // A slot takes one pick, so its button abandons it; the add-many modes keep what was added (mockup 3).
    const banner = slot && this.#actor ? `Filling ${this.#actor.name}'s level ${slot.level} ${SLOT_KIND_LABELS[slot.kind].toLowerCase()}. Pick one and press Add.`
      : onTargetTab && this.#actor ? `Adding to ${this.#actor.name}'s ${TARGET_NOUN[target]}. Add as many as you like, then press Done.` : null;
    return Object.assign(context, {
      data, tab: this.#tab, forceSub: this.#forceSub, equipSub: this.#equipSub,
      tabs: (Object.keys(TAB_LABELS) as Tab[]).map((t) => ({ id: t, label: TAB_LABELS[t], active: t === this.#tab })),
      banner, bannerButton: slot ? "Cancel" : "Done",
    });
  }

  override async _preparePartContext(partId: string, context: object, options: object) {
    const prepared = await super._preparePartContext(partId, context as never, options as never) as Record<string, unknown>;
    const data = prepared["data"] as Data;
    if (partId === "filters") Object.assign(prepared, this.#filtersContext(data));
    if (partId === "results") Object.assign(prepared, this.#resultsContext(data));
    return prepared;
  }

  #filtersContext(data: Data) {
    const seg = (key: string, current: string, options: [string, string][]) => ({ key, options: options.map(([value, label]) => ({ value, label, on: value === current })) });
    const common = { q: this.#q };
    if (this.#tab === "talents") {
      const taken = (t: { name: string }) => this.#has("talent", t.name) > 0;
      const tagged = this.#tagTrees(data);
      const trees = [...new Set(data.talents.map((t) => t.tree))].sort();
      const treeQ = this.#treeQ.trim().toLowerCase();
      const mine = this.#mine();
      return {
        ...common, treeQ: this.#treeQ, treesPicked: this.#trees.size,
        hasCharacter: Boolean(mine), onlyMine: Boolean(mine) && game.settings.get("holocron", ONLY_MINE),
        onlyQualified: Boolean(mine) && game.settings.get("holocron", ONLY_QUALIFIED),
        classTags: [...data.classes.filter((c) => c.base).map((c) => c.name).sort(), "Force Sensitivity"].map((c) => ({ name: c, on: this.#classTag === c })),
        prestige: data.classes.filter((c) => !c.base).map((c) => c.name).sort().map((c) => ({ name: c, selected: this.#classTag === c })),
        classTag: this.#classTag,
        trees: trees.filter((t) => (!treeQ || t.toLowerCase().includes(treeQ)) && (!tagged || tagged.has(t)))
          .map((t) => ({ name: t, checked: this.#trees.has(t), mine: mine?.has(t) ?? false, count: data.talents.filter((x) => x.tree === t && !taken(x)).length })),
        order: seg("order", this.#order, [["tree", "By tree"], ["name", "A to Z"]]),
      };
    }
    if (this.#tab === "force") {
      const tags = [...new Set(data.powers.flatMap((p) => p.tags))].sort();
      return {
        ...common, sub: seg("forceSub", this.#forceSub, [["powers", "Powers"], ["techniques", "Techniques"], ["secrets", "Secrets"]]),
        descriptors: this.#forceSub === "powers" ? tags.map((t) => ({ name: t, checked: this.#sources.has(t), count: data.powers.filter((p) => p.tags.includes(t)).length })) : [],
      };
    }
    if (this.#tab === "equipment") {
      const droidCharacter = this.#character?.items.some((i) => i.type === "species" && (i.system as { droid?: boolean }).droid === true) ?? false;
      const options: [string, string][] = [["weapons", "Weapons"], ["armor", "Armor"], ["equipment", "Equipment"], ...(droidCharacter || this.#equipSub === "droid" ? [["droid", "Droid systems"] as [string, string]] : [])];
      const grouped = this.#equipSub === "weapons" ? data.weapons : this.#equipSub === "droid" ? data.droid : null;
      const groups = grouped ? [...new Set(grouped.map((r) => r.group).filter(Boolean))].sort() : [];
      return {
        ...common, sub: seg("equipSub", this.#equipSub, options), groupLabel: this.#equipSub === "droid" ? "System type" : "Weapon group",
        groups: groups.map((g) => ({ name: g, checked: this.#sources.has(g), count: grouped?.filter((r) => r.group === g).length ?? 0 })),
      };
    }
    if (this.#tab === "species") {
      const pool = this.#speciesPool(data);
      const q = this.#traitQ.trim().toLowerCase();
      const allTraits = [...new Set(pool.flatMap((s) => s.traits))].sort();
      // Up to eight unpicked traits matching the search, those starting with it first (mockup 3, v47).
      const suggestions = q ? allTraits.filter((t) => !this.#traits.has(t) && t.toLowerCase().includes(q))
        .sort((a, b) => Number(b.toLowerCase().startsWith(q)) - Number(a.toLowerCase().startsWith(q)) || a.localeCompare(b)).slice(0, 8) : [];
      return {
        ...common,
        sizes: SIZE_GROUPS.map((z) => ({ name: z, on: this.#sizes.has(z), count: pool.filter((s) => s.size === z).length })),
        kinds: (["Living", "Droid"] as const).map((k) => ({ name: k, on: this.#kind === k, count: pool.filter((s) => s.droid === (k === "Droid")).length })),
        group: seg("speciesGroup", this.#speciesGroup, [["rarity", "Rarity"], ["size", "Size"]]),
        traitsPicked: [...this.#traits], traitQ: this.#traitQ, traitQuery: Boolean(q),
        suggestions: suggestions.map((t) => ({ name: t, count: pool.filter((s) => s.traits.includes(t)).length })),
        showDenied: this.#showDenied, isGM: game.user?.isGM ?? false,
      };
    }
    return common;
  }

  /** Denied species "do not even exist for our purposes" (species rarity page); the GM's switch shows them (rulings.md, Content). */
  #speciesPool(data: Data) {
    return data.species.filter((s) => this.#showDenied || s.rarity !== "denied");
  }

  #row(r: Row, extra: { tags?: string[]; cost?: string; costTitle?: string; badges?: { cls: string; text: string }[]; line?: string; kind?: RowKind; addable?: boolean }): RowView {
    const open = this.#opened.has(r.uuid);
    return {
      uuid: r.uuid, name: r.name, tags: extra.tags ?? [], cost: extra.cost ?? "", costTitle: extra.costTitle ?? "", badges: extra.badges ?? [], line: extra.line ?? "",
      open, description: open ? this.#descriptions.get(r.uuid) ?? "" : "",
      add: Boolean(extra.kind && extra.addable !== false && this.#canAdd(extra.kind)),
    };
  }

  #resultsContext(data: Data) {
    type Group = { label: string; count: number; collapsed: boolean; head: boolean; mine: boolean; warn: string; rows: RowView[] };
    const groups: Group[] = [];
    const group = (label: string, rows: Group["rows"], head = true, mine = false, warn = "") => {
      if (!rows.length) return;
      const collapsed = head && this.#collapsed.has(label) && !this.#q;
      groups.push({ label, count: rows.length, collapsed, head, mine, warn, rows: collapsed ? [] : rows });
    };
    let count: string;

    if (this.#tab === "talents") {
      const tagged = this.#tagTrees(data);
      const mine = this.#mine();
      const onlyMine = Boolean(mine) && game.settings.get("holocron", ONLY_MINE);
      // Unmet prerequisites are marked, never blocked (mockup 3); with no character nothing is marked.
      const pc = this.#character ? prereqCharacter(this.#character, data.traditionTrees) : null;
      const missing = new Map(data.talents.map((t) => [t.uuid, pc ? unmet(t.nodes, pc) : []]));
      const onlyQualified = Boolean(pc) && game.settings.get("holocron", ONLY_QUALIFIED);
      const list = data.talents.filter((t) => this.#match(t.name, t.tree) && (!tagged || tagged.has(t.tree)) && (!this.#trees.size || this.#trees.has(t.tree))
        && (!onlyMine || mine?.has(t.tree)) && (!onlyQualified || !missing.get(t.uuid)?.length) && !this.#has("talent", t.name));
      // From a talent slot a tree the slot's class may not use is marked; Add still works (warn, never block).
      const outside = (tree: string) => (this.#slot?.kind === "talent" && mine && !mine.has(tree) ? `Not a ${this.#slot.cls} tree` : "");
      const row = (t: Data["talents"][number]) => {
        const miss = missing.get(t.uuid) ?? [];
        const warn = this.#order === "name" ? outside(t.tree) : "";
        return this.#row(t, {
          tags: this.#order === "name" ? [t.tree] : [],
          badges: [...(miss.length ? [{ cls: "unmet", text: "Prereq not met" }] : []), ...(warn ? [{ cls: "warn", text: warn }] : [])],
          line: t.prereq ? `Needs: ${prereqHtml(t.prereq, miss, escape)}` : "", kind: "talents",
        });
      };
      count = `${list.length} talents${this.#classTag ? ` · in ${this.#classTag} trees` : ""}${onlyMine ? " · in your trees" : ""}${onlyQualified ? " · you qualify for" : ""}`;
      if (this.#order === "name") group("", list.map(row), false);
      else {
        // Trees the character can use come first, each marked Yours (mockup 3).
        const trees = [...new Set(list.map((t) => t.tree))].sort((a, b) => Number(mine?.has(b) ?? 0) - Number(mine?.has(a) ?? 0) || a.localeCompare(b));
        for (const tree of trees) group(tree, list.filter((t) => t.tree === tree).map(row), true, mine?.has(tree) ?? false, outside(tree));
      }
    } else if (this.#tab === "feats") {
      // A taken feat is hidden unless it can be taken again (mockup 3, Feats).
      const list = data.feats.filter((f) => this.#match(f.name) && (f.repeatable || !this.#has("feat", f.name)));
      count = `${list.length} feats`;
      group("", list.map((f) => this.#row(f, { badges: this.#has("feat", f.name) ? [{ cls: "taken", text: "Taken, can repeat" }] : [], line: f.prereq ? `Needs: ${prereqHtml(f.prereq, [], escape)}` : "", kind: "feats" })), false);
    } else if (this.#tab === "force" && this.#forceSub === "powers") {
      const list = data.powers.filter((p) => this.#match(p.name) && (!this.#sources.size || p.tags.some((t) => this.#sources.has(t))));
      count = `${list.length} Force powers`;
      group("", list.map((p) => {
        const copies = this.#character?.items.find((i) => i.type === "forcePower" && i.name === p.name)?.system as { copies?: number } | undefined;
        const n = copies?.copies ?? 0;
        return this.#row(p, { tags: p.tags, cost: p.action, costTitle: p.actionTitle, badges: n ? [{ cls: "taken", text: `Known, ${n} ${n === 1 ? "copy" : "copies"}` }] : [], kind: "powers" });
      }), false);
    } else if (this.#tab === "force") {
      const kind = this.#forceSub;
      const source = kind === "techniques" ? data.techniques : data.secrets;
      const takenCount = (name: string) => this.#character?.items.filter((i) => i.type === "feature" && i.name === name).length ?? 0;
      // A taken technique or secret is hidden unless it can be taken again (Force Power Mastery).
      const list = source.filter((t) => this.#match(t.name) && (t.repeatable || !takenCount(t.name)));
      const row = (t: (typeof list)[number]) => this.#row(t, { tags: t.power ? [t.power] : [], badges: takenCount(t.name) ? [{ cls: "taken", text: "Taken, can repeat" }] : [], kind });
      count = `${list.length} Force ${kind}`;
      if (kind === "techniques") {
        // Grouped by the power a technique improves: powers the character knows first (mockup 3, v45).
        const known = new Set(this.#character?.items.filter((i) => i.type === "forcePower").map((i) => i.name) ?? []);
        const label = (t: (typeof list)[number]) => (!t.power ? "Use the Force and general" : known.has(t.power) ? "For powers you know" : "For other powers");
        for (const g of ["For powers you know", "Use the Force and general", "For other powers"]) group(g, list.filter((t) => label(t) === g).map(row));
      } else group("", list.map(row), false);
    } else if (this.#tab === "equipment") {
      const sub = this.#equipSub;
      const rows: (Row & { group?: string; size?: string })[] = data[sub];
      const list = rows.filter((r) => this.#match(r.name) && (!this.#sources.size || (sub !== "weapons" && sub !== "droid") || this.#sources.has(r.group ?? "")));
      count = `${list.length} ${{ weapons: "weapons", armor: "armor", equipment: "items", droid: "droid systems" }[sub]}`;
      group("", list.map((r) => this.#row(r, { tags: [r.group, r.size].filter((t): t is string => Boolean(t)), kind: sub })), false);
    } else {
      const current = this.#character?.items.find((i) => i.type === "species")?.name;
      const list = this.#speciesPool(data).filter((s) => this.#match(s.name, ...s.traits) && (!this.#sizes.size || this.#sizes.has(s.size))
        && (!this.#kind || s.droid === (this.#kind === "Droid")) && [...this.#traits].every((t) => s.traits.includes(t)));
      const rarityLabel = (s: Data["species"][number]) => (s.droid ? "Droids" : RARITY_GROUPS.find(([k]) => k === s.rarity)?.[1] ?? "");
      const row = (s: Data["species"][number]) => this.#row(s, {
        tags: [s.size, ...(this.#speciesGroup === "size" && !s.droid ? [rarityLabel(s)] : [])],
        badges: s.name === current ? [{ cls: "taken", text: `${this.#character?.name}'s species` }] : [],
        line: escape(s.traits.join(" · ")), kind: "species", addable: s.name !== current,
      });
      count = `${list.length} species`;
      if (this.#speciesGroup === "size") {
        for (const z of SIZE_GROUPS) group(z, list.filter((s) => !s.droid && s.size === z).map(row));
        group("Droids", list.filter((s) => s.droid).map(row));
      } else for (const [, label] of RARITY_GROUPS) group(label, list.filter((s) => rarityLabel(s) === label).map(row));
    }
    return { count, groups, empty: groups.length === 0 };
  }

  override async _onRender(context: object, options: object): Promise<void> {
    await super._onRender(context as never, options as never);
    const root = this.element;
    // Searches re-render as the user types; the input gets its focus and caret back.
    if (this.#refocus) {
      const input = root.querySelector<HTMLInputElement>(`input[name="${this.#refocus}"]`);
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
      this.#refocus = null;
    }
    if (!(options as { isFirstRender?: boolean }).isFirstRender) return;
    root.addEventListener("input", (event) => {
      const input = event.target as HTMLInputElement;
      const name = input.name;
      if (name === "q") { this.#q = input.value; this.#refocus = name; void this.render({ parts: ["filters", "results"] }); }
      else if (name === "treeQ") { this.#treeQ = input.value; this.#refocus = name; void this.render({ parts: ["filters"] }); }
      else if (name === "traitQ") { this.#traitQ = input.value; this.#refocus = name; void this.render({ parts: ["filters"] }); }
    });
    root.addEventListener("change", async (event) => {
      const input = event.target as HTMLInputElement | HTMLSelectElement;
      const set = input.name === "tree" ? this.#trees : input.name === "source" ? this.#sources : null;
      if (set && input instanceof HTMLInputElement) {
        if (input.checked) set.add(input.value); else set.delete(input.value);
      } else if (input.name === "prestige") await this.#setClassTag(input.value || null, true);
      else if (input.name === "showDenied" && input instanceof HTMLInputElement) this.#showDenied = input.checked;
      else if (input.name === "onlyMine" && input instanceof HTMLInputElement) await game.settings.set("holocron", ONLY_MINE, input.checked);
      else if (input.name === "onlyQualified" && input instanceof HTMLInputElement) await game.settings.set("holocron", ONLY_QUALIFIED, input.checked);
      else return;
      await this.render({ parts: ["filters", "results"] });
    });
    // Enter in the trait search adds its first suggestion.
    root.addEventListener("keydown", (event) => {
      const input = event.target as HTMLInputElement;
      if (input.name !== "traitQ" || event.key !== "Enter") return;
      event.preventDefault();
      const first = root.querySelector<HTMLElement>('[data-action="traitAdd"]')?.dataset["value"];
      if (first) this.#addTrait(first);
    });
    // Rows drag onto a sheet as compendium items.
    root.addEventListener("dragstart", (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>("[data-uuid]");
      if (row) event.dataTransfer?.setData("text/plain", JSON.stringify({ type: "Item", uuid: row.dataset["uuid"] }));
    });
  }

  /** A class tag drops tree ticks outside its trees, so the two filters never contradict (mockup 3). */
  async #setClassTag(name: string | null, fromSelect = false): Promise<void> {
    this.#classTag = !fromSelect && this.#classTag === name ? null : name;
    const tagged = this.#tagTrees(await (loading ??= loadData()));
    if (tagged) for (const t of [...this.#trees]) if (!tagged.has(t)) this.#trees.delete(t);
  }

  #addTrait(name: string): void {
    this.#traits.add(name);
    this.#traitQ = "";
    this.#refocus = "traitQ";
    void this.render({ parts: ["filters", "results"] });
  }

  static async #onTab(this: CompendiumBrowser, _event: PointerEvent, target: HTMLElement): Promise<void> {
    this.#tab = target.dataset["tab"] as Tab;
    this.#q = ""; this.#sources.clear();
    await this.render();
  }

  /** A segmented switch: Force type, equipment type, order, species grouping. */
  static async #seg(this: CompendiumBrowser, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const key = target.dataset["key"];
    const value = target.dataset["value"] ?? "";
    if (key === "forceSub") this.#forceSub = value as ForceSub;
    else if (key === "equipSub") this.#equipSub = value as EquipSub;
    else if (key === "order") this.#order = value as "tree" | "name";
    else if (key === "speciesGroup") this.#speciesGroup = value as "rarity" | "size";
    if (key === "forceSub" || key === "equipSub") { this.#sources.clear(); this.#q = ""; }
    await this.render();
  }

  static async #group(this: CompendiumBrowser, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const label = target.dataset["group"] ?? "";
    if (!this.#collapsed.delete(label)) this.#collapsed.add(label);
    await this.render({ parts: ["results"] });
  }

  /** A row's name opens its text, read from the compendium the first time. */
  static async #open(this: CompendiumBrowser, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const uuid = target.dataset["uuid"] ?? "";
    if (this.#opened.delete(uuid)) return void this.render({ parts: ["results"] });
    if (!this.#descriptions.has(uuid)) {
      const doc = await fromUuid(uuid) as Item.Implementation | null;
      const html = (doc?.system as { description?: string } | undefined)?.description ?? "";
      this.#descriptions.set(uuid, await foundry.applications.ux.TextEditor.implementation.enrichHTML(html));
    }
    this.#opened.add(uuid);
    await this.render({ parts: ["results"] });
  }

  static async #add(this: CompendiumBrowser, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const actor = this.#actor;
    if (!actor?.isOwner) return;
    const source = await fromUuid(target.dataset["uuid"] ?? "") as Item.Implementation | null;
    if (!source) return;
    // An item filling a slot records it; a Force power slot is filled by copies and records nothing.
    const slot = this.#slot;
    const extra = slot && slot.kind !== "power" ? { flags: { holocron: { slot: { level: slot.level, kind: slot.kind } } } } : {};
    const added = await addItem(actor, source, extra);
    if (added) ui.notifications?.info(`${source.name} added to ${actor.name}.`);
    // A slot and a species are one pick (mockup 3); the other targets add as many as wanted.
    if (slot || this.#target === "species") await this.close();
    else await this.render({ parts: ["results"] });
  }

  static async #clear(this: CompendiumBrowser): Promise<void> {
    this.#q = ""; this.#treeQ = ""; this.#trees.clear(); this.#classTag = null; this.#sources.clear();
    this.#sizes.clear(); this.#kind = null; this.#traits.clear(); this.#traitQ = "";
    await this.render();
  }

  static async #onClassTag(this: CompendiumBrowser, _event: PointerEvent, target: HTMLElement): Promise<void> {
    await this.#setClassTag(target.dataset["value"] ?? null);
    await this.render();
  }

  /** Species size and type tags: sizes combine, the type is one at a time. */
  static async #tagToggle(this: CompendiumBrowser, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const value = target.dataset["value"] ?? "";
    if (target.dataset["key"] === "size") { if (!this.#sizes.delete(value)) this.#sizes.add(value); }
    else this.#kind = this.#kind === value ? null : (value as "Living" | "Droid");
    await this.render({ parts: ["filters", "results"] });
  }

  static async #traitAdd(this: CompendiumBrowser, _event: PointerEvent, target: HTMLElement): Promise<void> {
    this.#addTrait(target.dataset["value"] ?? "");
  }

  static async #traitRemove(this: CompendiumBrowser, _event: PointerEvent, target: HTMLElement): Promise<void> {
    this.#traits.delete(target.dataset["value"] ?? "");
    await this.render({ parts: ["filters", "results"] });
  }

  static async #done(this: CompendiumBrowser): Promise<void> {
    await this.close();
  }
}
