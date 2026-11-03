/**
 * The picks each level earns (mockup 1's Progression slots), from the level-up guide's table: a
 * feat at odd total levels, a talent every level, and a class feat at even levels of a base class
 * (the count resets for a second class; prestige classes get none). Level 1 adds a species feat for
 * a species with the Bonus Feat trait. Force power slots come from Force Training taken at the level,
 * and technique and secret slots from the class's techniqueLevels and secretLevels.
 */
export type SlotKind = "speciesFeat" | "feat" | "classFeat" | "talent" | "power" | "technique" | "secret";
export const SLOT_KIND_LABELS: Record<SlotKind, string> = {
  speciesFeat: "Species feat", feat: "Feat", classFeat: "Class feat", talent: "Talent", power: "Force power", technique: "Force technique", secret: "Force secret",
};
/** Slot kinds a feat fills. */
export const FEAT_SLOTS: readonly SlotKind[] = ["speciesFeat", "feat", "classFeat"];

export interface LevelInfo { level: number; classLevel: number; base: boolean; techniqueLevels: readonly number[]; secretLevels: readonly number[] }
/** An item that filled a slot: the level and kind it records. */
export interface Pick { id: string; name: string; level: number; kind: SlotKind; tree?: string }
export interface SlotView { kind: SlotKind; label: string; filled: { id: string; name: string; tree: string } | null }

export function levelSlotKinds(info: LevelInfo, speciesBonusFeat: boolean): SlotKind[] {
  const kinds: SlotKind[] = [];
  if (info.level === 1 && speciesBonusFeat) kinds.push("speciesFeat");
  if (info.level % 2 === 1) kinds.push("feat");
  if (info.base && info.classLevel % 2 === 0) kinds.push("classFeat");
  kinds.push("talent");
  if (info.techniqueLevels.includes(info.classLevel)) kinds.push("technique");
  if (info.secretLevels.includes(info.classLevel)) kinds.push("secret");
  return kinds;
}

/**
 * Every level's slots, filled from the picks recorded at that level in the order they were made. A
 * Force Training picked at a level gives that level `powersPerTraining` power slots, filled in order
 * from the powers the character knows, one slot per copy. A pick with no slot left at its level still
 * shows, so nothing taken disappears from the list.
 */
export function progressionSlots(levels: readonly LevelInfo[], picks: readonly Pick[], opts: { speciesBonusFeat: boolean; powersPerTraining: number; powers: readonly { id: string; name: string }[] }): SlotView[][] {
  const queue = [...opts.powers];
  return levels.map((info) => {
    const here = picks.filter((p) => p.level === info.level);
    const used = new Set<string>();
    const take = (kind: SlotKind) => {
      const pick = here.find((p) => p.kind === kind && !used.has(p.id));
      if (pick) used.add(pick.id);
      return pick ? { id: pick.id, name: pick.name, tree: pick.tree ?? "" } : null;
    };
    const slots: SlotView[] = levelSlotKinds(info, opts.speciesBonusFeat && info.level === 1).map((kind) => ({ kind, label: SLOT_KIND_LABELS[kind], filled: take(kind) }));
    for (const extra of here.filter((p) => !used.has(p.id) && p.kind !== "power")) {
      used.add(extra.id);
      slots.push({ kind: extra.kind, label: SLOT_KIND_LABELS[extra.kind], filled: { id: extra.id, name: extra.name, tree: extra.tree ?? "" } });
    }
    const trainings = here.filter((p) => FEAT_SLOTS.includes(p.kind) && p.name === "Force Training").length;
    for (let i = 0; i < trainings * opts.powersPerTraining; i++) {
      const power = queue.shift();
      slots.push({ kind: "power", label: SLOT_KIND_LABELS.power, filled: power ? { id: power.id, name: power.name, tree: "" } : null });
    }
    return slots;
  });
}
