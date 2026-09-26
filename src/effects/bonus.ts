import type { Modifier } from "../rules/modifiers.ts";

/**
 * The "bonus" Active Effect change type. Its key is a selector ("defense.reflex", "skill.stealth")
 * and its value a number; the handler adds a labelled modifier under that selector, named after the
 * effect, and writes no data. Statistics read the modifiers when they total, so every bonus shows
 * in a breakdown. Bonus types (competence, morale) come in F2; F1's bonuses are untyped.
 *
 * Changes of this type run in the "derived" phase, which CharacterModel.prepareDerivedData applies
 * once ability scores and levels exist.
 */
export function registerEffects(): void {
  CONFIG.ActiveEffect.phases["derived"] = {
    label: "Derived",
    hint: "After ability scores and levels, before Defenses and skills are totalled.",
  };
  CONFIG.ActiveEffect.changeTypes["bonus"] = {
    label: "Bonus",
    defaultPriority: 20,
    handler: applyBonus as never,
    render: null,
  };
}

interface BonusChange {
  key: string;
  value: unknown;
  effect?: { name?: string };
}

function applyBonus(target: { system?: unknown; name?: string }, change: BonusChange): void {
  const modifiers = (target.system as { modifiers?: Record<string, Modifier[]> } | undefined)?.modifiers;
  if (!modifiers) return; // an Item target, or an actor type with no statistics
  const value = Number(change.value);
  if (!Number.isFinite(value)) {
    console.error(`holocron | bonus change on ${target.name ?? "a document"}: "${String(change.value)}" is not a number (${change.key})`);
    return;
  }
  (modifiers[change.key] ??= []).push({ label: change.effect?.name ?? "Effect", value, type: null });
}
