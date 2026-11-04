import { textOn } from "./rules/colour.ts";

/** Purple, the baseline accent (Bryan, 2026-09-23); the GM can change it for the world. */
export const DEFAULT_ACCENT = "#7b4fd6";

export function registerAppearanceSettings(): void {
  game.settings.register("holocron", "accent", {
    name: "Default accent colour",
    hint: "The accent of every character sheet and chat card whose character has not chosen its own.",
    scope: "world",
    config: true,
    type: new foundry.data.fields.ColorField({ nullable: false, initial: DEFAULT_ACCENT }),
    default: DEFAULT_ACCENT,
  } as never);
}

/** A character's accent: its own, else the world's, else purple. */
export function accentOf(actor: Actor.Implementation | null | undefined): string {
  const own = (actor?.system as { appearance?: { accent?: string | null } } | undefined)?.appearance?.accent;
  if (own) return String(own);
  return String(game.settings.get("holocron", "accent") || DEFAULT_ACCENT);
}

/** Sets --hc-accent and the text colour on it (rules/colour.ts) on an element. */
export function applyAccent(element: HTMLElement, accent: string): void {
  element.style.setProperty("--hc-accent", accent);
  element.style.setProperty("--hc-on-accent", textOn(accent));
}
