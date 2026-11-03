/**
 * Force powers known: each Force Training gives 1 + the INT modifier, minimum 1 (core rulebook p85,
 * with episode-vii's "Use Intelligence for 'number known' abilities, including number of Force
 * Powers for Force Training"). An INT modifier that goes up later gives one more per Force Training,
 * so the count always follows the current modifier.
 */
export function forcePowersKnown(trainings: number, intMod: number): number {
  return trainings * Math.max(1, 1 + intMod);
}

export interface Band { dc: number; text: string }

/**
 * The DC bands a Use the Force result reaches. Meeting a DC reaches it (rulings.md, General). A
 * cumulative power gets every band it reaches; any other power only the highest.
 */
export function bandsReached(bands: readonly Band[], total: number, cumulative: boolean): number[] {
  const reached = bands.map((b, i) => (total >= b.dc ? i : -1)).filter((i) => i >= 0);
  if (cumulative || !reached.length) return reached;
  const best = reached.reduce((a, b) => ((bands[b]?.dc ?? 0) > (bands[a]?.dc ?? 0) ? b : a));
  return [best];
}

/**
 * Force technique or secret slots from class levels: a class lists the class levels that give one
 * (its techniqueLevels or secretLevels), and each level the character has in that class counts.
 */
export function featureSlots(classes: readonly { levels: number; slotLevels: readonly number[] }[]): number {
  return classes.reduce((n, c) => n + c.slotLevels.filter((level) => level <= c.levels).length, 0);
}
