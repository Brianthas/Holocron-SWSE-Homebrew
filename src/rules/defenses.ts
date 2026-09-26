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

/** Worn armor, as far as Reflex is concerned: its name and what replaces the DEX term. */
export interface ArmorTerm { name: string; ability: { label: string; mod: number } | null; flat: number }

/**
 * Reflex's ability term. Armor gives no armor bonus to Reflex; worn, it replaces the DEX term: Assault
 * Armor with the STR modifier, Battle 4, Mesh 5, Power 4 (rulings.md, Combat; house armor table).
 */
export function reflexAbilityTerm(dex: { label: string; mod: number }, armor: ArmorTerm | null): { label: string; mod: number } {
  if (!armor) return dex;
  return armor.ability ? { label: `${armor.name} (${armor.ability.label})`, mod: armor.ability.mod } : { label: armor.name, mod: armor.flat };
}

/**
 * DT+5, the Defense against forced movement, grapple and disarm: Fortitude + 5, with no size term,
 * plus any bonuses to DT (rulings.md, Combat; episode-vii: "Damage Threshold at +5 is the Defense
 * used to oppose various combat maneuvers").
 */
export function maneuverDefense(fortitude: number, bonuses: readonly Modifier[] = []): Breakdown {
  return total([untyped("Fortitude", fortitude), untyped("DT+5", 5), ...bonuses]);
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
