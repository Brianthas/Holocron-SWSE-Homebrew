/** One labelled term of a total: a base value, an ability modifier, a feat's bonus. */
export interface Modifier {
  label: string;
  value: number;
  /** Bonus type ("competence", "morale"), or null for an untyped term. */
  type: string | null;
  /** When the bonus applies ("while fighting defensively"); a conditional bonus is shown, never totalled. */
  condition?: string | null;
}

export interface Breakdown {
  total: number;
  /** The terms that count, in the order they were given. */
  applied: Modifier[];
  /** Typed bonuses beaten by a higher bonus of the same type. */
  suppressed: Modifier[];
  /** Conditional bonuses: listed with the total, applied at the table. */
  situational: Modifier[];
}

/**
 * Totals a list of modifiers. Bonuses of the same type do not stack: the highest applies, and the
 * first of equal ones. Untyped bonuses stack (rulings.md, Combat). Penalties are summed; typed
 * penalties are not ruled on yet. Conditional bonuses stay out of the total (Bryan's fork, v1.4.9:
 * "conditional bonuses show as situational notes, never in the total").
 */
export function total(modifiers: readonly Modifier[]): Breakdown {
  const always = modifiers.filter((m) => !m.condition);
  const best = new Map<string, Modifier>();
  for (const m of always) {
    if (m.type === null || m.value < 0) continue;
    const current = best.get(m.type);
    if (!current || m.value > current.value) best.set(m.type, m);
  }
  const counts = (m: Modifier) => m.type === null || m.value < 0 || best.get(m.type) === m;
  const applied = always.filter(counts);
  return {
    total: applied.reduce((sum, m) => sum + m.value, 0),
    applied,
    suppressed: always.filter((m) => !counts(m)),
    situational: modifiers.filter((m) => m.condition),
  };
}

export const untyped = (label: string, value: number): Modifier => ({ label, value, type: null });
