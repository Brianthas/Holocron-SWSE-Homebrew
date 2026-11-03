import { DEFENSES } from "../rules/defenses.ts";

/** "Defensive Stance is a Full-Round Action which provides a +5 bonus to Defenses" (episode-vii, Combat); untyped. */
export const STANCE_BONUS = 5;

/**
 * Turns Defensive Stance on or off: an effect on the character, flagged so the sheet finds it, adding
 * the bonus to Reflex, Fortitude and Will. DT+5 is Fortitude + 5, so it rises with Fortitude. The
 * stance lasts until it is turned off; the rule gives no duration.
 */
export async function toggleStance(actor: Actor.Implementation): Promise<void> {
  const current = actor.effects.find((e) => e.getFlag("holocron", "stance") === true);
  if (current) {
    await current.delete();
    return;
  }
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: "Defensive Stance",
    img: "icons/svg/shield.svg",
    flags: { holocron: { stance: true } },
    system: { changes: DEFENSES.map((d) => ({ key: `defense.${d}`, type: "bonus", value: STANCE_BONUS, phase: "derived" })) },
  }] as never);
}
