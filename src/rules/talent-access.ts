import { BANNED_TREES, FORCE_SENSITIVITY_TREES, JEDI_ORDER_TREES, TRADITIONS } from "../config/talents.ts";

/**
 * Talent tree access (mockup 1's card). Each group says which class's talent slots may use it; "any"
 * serves every class (core rulebook p54: a level's talent comes from that class's trees, or the
 * Force trees with Force Sensitivity; a tree added by hand joins every class, confirmed by Bryan
 * with the GM, 2026-09-25).
 */
export interface AccessGroup { label: string; cls: string; trees: string[] }
export interface AccessInput {
  /** The classes taken, with the trees each grants (the class item's talentTrees). */
  classes: readonly { name: string; trees: readonly string[] }[];
  forceSensitive: boolean;
  tradition: string;
  traditionTree: string;
  added: readonly string[];
  removed: readonly string[];
}

/** The trees a tradition gives: its own, or the one picked where the text lists several. */
export function traditionTrees(tradition: string, traditionTree: string): string[] {
  const t = TRADITIONS[tradition] ?? TRADITIONS["jediOrder"];
  if (t?.pick) return t.pick.includes(traditionTree) ? [traditionTree] : [];
  return [...(t?.trees ?? [])];
}

export function accessGroups(input: AccessInput): AccessGroup[] {
  const groups: AccessGroup[] = [];
  if (input.forceSensitive) groups.push({ label: "Force Sensitivity", cls: "any", trees: [...FORCE_SENSITIVITY_TREES] });
  for (const c of input.classes) {
    if (c.name === "Jedi") {
      // Another tradition replaces the Jedi Order trees; the rest of the class's trees stay.
      const label = TRADITIONS[input.tradition]?.label ?? "Jedi Order";
      groups.push({ label: `Jedi: ${label}`, cls: "Jedi", trees: traditionTrees(input.tradition, input.traditionTree) });
      groups.push({ label: "Jedi: every tradition", cls: "Jedi", trees: c.trees.filter((t) => !(JEDI_ORDER_TREES as readonly string[]).includes(t)) });
    } else groups.push({ label: c.name, cls: c.name, trees: [...c.trees].sort() });
  }
  return groups;
}

/** Every tree the character may use: the groups' trees less removed and banned ones, plus added ones. */
export function accessibleTrees(input: AccessInput): Set<string> {
  const usable = (t: string) => !input.removed.includes(t) && !BANNED_TREES.has(t);
  return new Set([...accessGroups(input).flatMap((g) => g.trees).filter(usable), ...input.added]);
}

/** The trees one class's talent slot may use: its own groups, the "any" groups, and added trees. */
export function accessibleTreesFor(input: AccessInput, cls: string): Set<string> {
  const usable = (t: string) => !input.removed.includes(t) && !BANNED_TREES.has(t);
  const own = accessGroups(input).filter((g) => g.cls === cls || g.cls === "any").flatMap((g) => g.trees).filter(usable);
  return new Set([...own, ...input.added]);
}
