/**
 * Carrying (episode-vii, Equipment). Items take Light or Kit slots by size; only carried items use
 * them. "You can carry another Kit in your two hands": one Kit-size item in hands uses no slot.
 * "Integrated Equipment takes up twice as many slots." Worn armor and installed droid systems
 * use none (their size is "none").
 */

export const SLOT_SIZES = ["light", "twoLight", "kit", "twoKits", "none"] as const;
export const CARRY_STATES = ["carried", "hands", "stowed"] as const;
export type SlotSize = (typeof SLOT_SIZES)[number];
export type Carry = (typeof CARRY_STATES)[number];

const UNITS: Record<SlotSize, { light: number; kit: number }> = {
  light: { light: 1, kit: 0 },
  twoLight: { light: 2, kit: 0 },
  kit: { light: 0, kit: 1 },
  twoKits: { light: 0, kit: 2 },
  none: { light: 0, kit: 0 },
};

export const SLOT_LABELS: Record<SlotSize, string> = { light: "Light", twoLight: "2 Light", kit: "Kit", twoKits: "2 Kits", none: "" };

export interface CarriedItem { slot: SlotSize; carry: Carry; quantity?: number; integrated?: boolean }

/** Light and Kit slots the carried items use. */
export function slotsUsed(items: readonly CarriedItem[]): { light: number; kit: number } {
  let light = 0;
  let kit = 0;
  for (const item of items) {
    if (item.carry !== "carried") continue;
    const units = UNITS[item.slot] ?? UNITS.light;
    const count = (item.quantity ?? 1) * (item.integrated ? 2 : 1);
    light += units.light * count;
    kit += units.kit * count;
  }
  return { light, kit };
}

/**
 * An equipment item's size, cycled by hand: none, Light, Kit, none (the SWSE fork's equipment tab).
 * Gear the house tables do not list converts as "none", and the player sets it.
 */
export function nextSize(current: SlotSize): SlotSize {
  return current === "none" ? "light" : current === "light" ? "kit" : "none";
}

/** The carry state after Carried, In hands, Stowed: a single Kit goes to the hands if they are free. */
export function nextCarry(current: Carry, slot: SlotSize, handsTaken: boolean): Carry {
  if (current === "carried") return slot === "kit" && !handsTaken ? "hands" : "stowed";
  if (current === "hands") return "stowed";
  return "carried";
}
