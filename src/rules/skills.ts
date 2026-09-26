import { total, untyped, type Breakdown, type Modifier } from "./modifiers.ts";

/**
 * A skill: half level (rounded down) + 5 if trained + the ability modifier + bonuses (rulings.md,
 * Skills; Skill Focus arrives as a bonus).
 */
export function skill({ level, trained, ability, bonuses = [] }: {
  level: number;
  trained: boolean;
  ability: { label: string; mod: number };
  bonuses?: readonly Modifier[];
}): Breakdown {
  return total([
    untyped("Half level", Math.floor(level / 2)),
    ...(trained ? [untyped("Trained", 5)] : []),
    untyped(ability.label, ability.mod),
    ...bonuses,
  ]);
}
