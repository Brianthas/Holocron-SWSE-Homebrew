import { total, untyped, type Breakdown, type Modifier } from "./modifiers.ts";

export const DEFENSES = ["reflex", "fortitude", "will"] as const;
export type DefenseKey = (typeof DEFENSES)[number];

export const DEFENSE_LABELS: Record<DefenseKey, string> = { reflex: "Reflex", fortitude: "Fortitude", will: "Will" };

export interface DefenseInputs {
  heroicLevel: number;
  /** The ability term: DEX for Reflex, CON for Fortitude, WIS for Will. */
  ability: { label: string; mod: number };
  /** Defense points assigned to this defense (episode-vii: they replace the class bonus). */
  points: number;
  /** Size modifier; Reflex only (core rulebook p145). */
  size?: number;
  /** Bonuses from effects: feats, talents, equipment. */
  bonuses?: readonly Modifier[];
}

/**
 * A defense: 10 + heroic level + ability modifier + Defense points (+ size for Reflex) + bonuses
 * (core rulebook p145, with episode-vii's Defense points in place of the class bonus).
 */
export function defense({ heroicLevel, ability, points, size = 0, bonuses = [] }: DefenseInputs): Breakdown {
  return total([
    untyped("Base", 10),
    untyped("Heroic level", heroicLevel),
    untyped(ability.label, ability.mod),
    untyped("Defense points", points),
    ...(size ? [untyped("Size", size)] : []),
    ...bonuses,
  ]);
}
