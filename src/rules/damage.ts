/**
 * Attack results and damage application (mockup 2, signed off 2026-09-24; rulings.md, Combat).
 * Pure: the chat cards read the live documents and pass plain values in.
 */

/** How an attack card judged one target, or how a damage card was told to treat it. */
export type Outcome = "hit" | "crit" | "miss" | "nodefense" | "untargeted" | "selected" | "half";

/**
 * A natural 20 always hits and is a critical; a natural 1 always misses (rulings.md, Combat).
 * Otherwise the attack hits when the total equals or beats Reflex Defense; with no Reflex Defense
 * known there is no verdict.
 */
export function attackOutcome(natural: number, total: number, reflex: number | null): "hit" | "crit" | "miss" | "nodefense" {
  if (natural === 20) return "crit";
  if (natural === 1) return "miss";
  if (reflex === null) return "nodefense";
  return total >= reflex ? "hit" : "miss";
}

/** The GM's line under a target: the margin, or the die that decided it. */
export function marginText(reflex: number | null, total: number, natural: number): string {
  if (reflex === null) return "no Reflex Defense set";
  if (natural === 20 || natural === 1) return `vs Reflex ${reflex}, natural ${natural}`;
  return total >= reflex ? `vs Reflex ${reflex}, by ${total - reflex}` : `vs Reflex ${reflex}, missed by ${reflex - total}`;
}

/** What a damage roll carries into each target's row. `group` is the weapon group key. */
export interface DamageRoll { total: number; type: string; group: string; groupLabel: string; halfOnMiss: boolean }

/**
 * What the card knows about a target. `organic` is null when the target has no statblock to say;
 * `armor` is its worn armor with damage reduction, if any. `bypass` is a weapon group key, blank
 * when nothing gets through (a DR written /-).
 */
export interface DamageTarget { organic: boolean | null; armor: { name: string; dr: number; bypass: string } | null }

export interface Chip { text: string; immune?: boolean }

const halve = (n: number) => Math.floor(n / 2);

/**
 * One target's damage, with a chip for each step that changed it, in this order: a miss (none, or
 * half for a half-on-a-miss weapon) or a half chosen by hand, immunity by type ("Droids and all
 * other non-organic targets are immune to Stun Damage. Organic targets are immune to Ion Damage.",
 * episode-vii), then armor DR unless the weapon's group bypasses it. Halving comes before DR, and DR
 * applies to every type, Stun included (rulings.md, Combat).
 */
export function damageFor(target: DamageTarget, outcome: Outcome, roll: DamageRoll): { n: number; chips: Chip[] } {
  let n = roll.total;
  const chips: Chip[] = [];
  if (outcome === "miss" && !roll.halfOnMiss) return { n: 0, chips: [{ text: "Miss: no damage" }] };
  if (outcome === "miss" || outcome === "half") {
    chips.push({ text: `${outcome === "miss" ? "Miss: half" : "Half"} (${n} to ${halve(n)})` });
    n = halve(n);
  }
  if (roll.type === "Stun" && target.organic === false) return { n: 0, chips: [...chips, { text: "Droid: immune to Stun", immune: true }] };
  if (roll.type === "Ion" && target.organic === true) return { n: 0, chips: [...chips, { text: "Organic: immune to Ion", immune: true }] };
  const armor = target.armor;
  if (armor && armor.dr > 0) {
    if (armor.bypass && armor.bypass === roll.group) chips.push({ text: `${armor.name} DR ${armor.dr}: bypassed by ${roll.groupLabel.toLowerCase()}` });
    else {
      const after = Math.max(0, n - armor.dr);
      chips.push({ text: `${armor.name} DR ${armor.dr} (${n} to ${after})` });
      n = after;
    }
  }
  return { n, chips };
}

/**
 * Damage taken: temporary hit points absorb it first, the rest comes off hit points, which may go
 * below 0 (Dying, then Dead below minus the maximum; rulings.md, Death).
 */
export function takeDamage(hp: number, temp: number, n: number): { hp: number; temp: number; fromTemp: number; fromHp: number } {
  const fromTemp = Math.min(Math.max(temp, 0), n);
  const fromHp = n - fromTemp;
  return { hp: hp - fromHp, temp: temp - fromTemp, fromTemp, fromHp };
}
