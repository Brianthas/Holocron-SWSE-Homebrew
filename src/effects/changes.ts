import type { Modifier } from "../rules/modifiers.ts";
import { isGrantKind, isSelector, type GrantKind } from "./selectors.ts";

/**
 * Holocron's Active Effect change types. None writes data: each adds to a collection on the actor's
 * model that the statistics read when they total, so everything an effect does shows in a breakdown.
 *
 *   bonus  key: a selector ("defense.reflex"), value: a number; bonusType and condition optional.
 *   grant  key: a grant kind ("skill.trained"), value: what is granted ("stealth").
 *   dice   key: a damage selector ("damage.unarmed"), value: extra dice of the weapon's size.
 *
 * All three run in the "derived" phase, which CharacterModel.prepareDerivedData applies once
 * ability scores and levels exist. A change naming a key outside the grammar is reported and skipped.
 */
export interface Grant { value: string; label: string }
export interface ExtraDice { value: number; label: string }

/** The collections the handlers fill, reset by the character model on every prepare. */
export interface EffectTargets {
  modifiers: Record<string, Modifier[]>;
  grants: Partial<Record<GrantKind, Grant[]>>;
  dice: Record<string, ExtraDice[]>;
}

interface Change {
  key: string;
  value: unknown;
  bonusType?: string;
  condition?: string;
  effect?: { name?: string };
}
type Target = { system?: unknown; name?: string };

export function registerChanges(): void {
  CONFIG.ActiveEffect.phases["derived"] = {
    label: "Derived",
    hint: "After ability scores and levels, before Defenses, skills and attacks are totalled.",
  };
  const register = (type: "bonus" | "grant" | "dice", label: string, handler: (target: Target, change: Change) => void) => {
    CONFIG.ActiveEffect.changeTypes[type] = { label, defaultPriority: 20, handler: handler as never, render: null };
  };
  register("bonus", "Bonus", applyBonus);
  register("grant", "Grant", applyGrant);
  register("dice", "Extra dice", applyDice);
}

const targets = (target: Target) => {
  const system = target.system as Partial<EffectTargets> | undefined;
  return system?.modifiers && system.grants && system.dice ? (system as EffectTargets) : null;
};
const report = (target: Target, change: Change, problem: string) =>
  console.error(`holocron | ${change.effect?.name ?? "an effect"} on ${target.name ?? "a document"}: ${problem} (key "${change.key}", value ${JSON.stringify(change.value)})`);
const label = (change: Change) => change.effect?.name ?? "Effect";

function applyBonus(target: Target, change: Change): void {
  const t = targets(target);
  if (!t) return; // an Item target, or an actor type with no statistics
  if (!isSelector(change.key)) return report(target, change, "not a bonus selector");
  const value = Number(change.value);
  if (!Number.isFinite(value)) return report(target, change, "value is not a number");
  (t.modifiers[change.key] ??= []).push({
    label: label(change),
    value,
    type: change.bonusType || null,
    condition: change.condition || null,
  });
}

function applyGrant(target: Target, change: Change): void {
  const t = targets(target);
  if (!t) return;
  if (!isGrantKind(change.key)) return report(target, change, "not a grant kind");
  const value = String(change.value ?? "").trim();
  if (!value) return report(target, change, "grants nothing");
  (t.grants[change.key] ??= []).push({ value, label: label(change) });
}

function applyDice(target: Target, change: Change): void {
  const t = targets(target);
  if (!t) return;
  if (!change.key.startsWith("damage.") || !isSelector(change.key)) return report(target, change, "not a damage selector");
  const value = Number(change.value);
  if (!Number.isInteger(value) || value === 0) return report(target, change, "value is not a whole number of dice");
  (t.dice[change.key] ??= []).push({ value, label: label(change) });
}
