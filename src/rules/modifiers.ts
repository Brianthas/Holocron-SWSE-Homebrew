/** One labelled term of a total: a base value, an ability modifier, a feat's bonus. */
export interface Modifier {
  label: string;
  value: number;
  /** Bonus type ("competence", "morale"), or null for an untyped term. */
  type: string | null;
}

export interface Breakdown {
  total: number;
  /** The terms that count, in the order they were given. */
  applied: Modifier[];
  /** Typed bonuses beaten by a higher bonus of the same type. */
  suppressed: Modifier[];
}

/**
 * Totals a list of modifiers. Bonuses of the same type do not stack: the highest applies, and the
 * first of equal ones. Untyped bonuses stack (rulings.md, Combat). Penalties are summed; typed
 * penalties are not ruled on yet.
 */
export function total(modifiers: readonly Modifier[]): Breakdown {
  const best = new Map<string, Modifier>();
  for (const m of modifiers) {
    if (m.type === null || m.value < 0) continue;
    const current = best.get(m.type);
    if (!current || m.value > current.value) best.set(m.type, m);
  }
  const counts = (m: Modifier) => m.type === null || m.value < 0 || best.get(m.type) === m;
  const applied = modifiers.filter(counts);
  return {
    total: applied.reduce((sum, m) => sum + m.value, 0),
    applied,
    suppressed: modifiers.filter((m) => !counts(m)),
  };
}

export const untyped = (label: string, value: number): Modifier => ({ label, value, type: null });
