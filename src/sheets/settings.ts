import { accentOf, applyAccent } from "../appearance.ts";

/** Mockup 1's presets. Purple is the world default unless the GM changes it. */
export const ACCENT_PRESETS: [string, string][] = [
  ["#7b4fd6", "Purple"], ["#1fa39a", "Teal"], ["#c23b4e", "Crimson"], ["#e0a526", "Amber"], ["#3a7bd5", "Blue"], ["#f2d15c", "Pale yellow"],
];
export const PORTRAIT_SHAPES = ["round", "square", "token"] as const;

const escape = (s: string) => foundry.utils.escapeHTML(s);
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The sheet's own settings (mockup 1, the gear in its title bar), for the owner and the GM: accent
 * colour, portrait shape, and "Enter my own roll results". Each change is saved as it is made, so
 * the sheet behind shows it at once. Light and dark are Foundry's own settings.
 */
export async function openSheetSettings(actor: Actor.Implementation): Promise<void> {
  const s = actor.system as { appearance: { accent: string | null; portrait: string }; settings: { rollAtTable: boolean } };
  const current = accentOf(actor).toLowerCase();
  const content = `
    <div class="hc-settings-body">
      <div class="label">Appearance</div>
      <div class="set-row"><span>Accent colour</span><span class="swatches">${ACCENT_PRESETS.map(([hex, name]) => `<button type="button" class="swatch" data-accent="${hex}" style="background:${hex}" aria-label="${name}" data-tooltip="${name}" aria-pressed="${hex === current}"></button>`).join("")}<input type="color" name="customAccent" value="${escape(current)}" aria-label="Custom accent"></span></div>
      <div class="set-row"><span>Portrait shape</span><span class="minseg">${PORTRAIT_SHAPES.map((shape) => `<button type="button" data-shape="${shape}" aria-pressed="${shape === s.appearance.portrait}">${capitalise(shape)}</button>`).join("")}</span></div>
      <div class="label">Rolling</div>
      <label class="set-row"><span>Enter my own roll results<br><span class="hint">Dice rolled at the table; initiative still rolls in Foundry</span></span><input type="checkbox" name="rollAtTable" ${s.settings.rollAtTable ? "checked" : ""}></label>
      <p class="hint">Light or dark: Foundry's own setting (Configure Settings, User Interface), or this sheet's Sheet Configuration.</p>
    </div>`;
  await foundry.applications.api.DialogV2.wait({
    classes: ["holocron", "hc-settings"],
    window: { title: `Sheet settings: ${actor.name}` },
    content,
    buttons: [{ action: "done", label: "Done", default: true }],
    rejectClose: false,
    render: (_event: Event, dialog: { element: HTMLElement }) => {
      const root = dialog.element;
      applyAccent(root, current);
      const setAccent = async (hex: string) => {
        applyAccent(root, hex);
        root.querySelectorAll<HTMLElement>("[data-accent]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset["accent"] === hex)));
        await actor.update({ system: { appearance: { accent: hex } } } as never);
      };
      root.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        const swatch = target.closest<HTMLElement>("[data-accent]");
        if (swatch) {
          const hex = swatch.dataset["accent"] ?? "";
          root.querySelector<HTMLInputElement>('input[name="customAccent"]')!.value = hex;
          void setAccent(hex);
        }
        const shape = target.closest<HTMLElement>("[data-shape]");
        if (shape) {
          root.querySelectorAll("[data-shape]").forEach((b) => b.setAttribute("aria-pressed", String(b === shape)));
          void actor.update({ system: { appearance: { portrait: shape.dataset["shape"] } } } as never);
        }
      });
      root.querySelector<HTMLInputElement>('input[name="customAccent"]')?.addEventListener("change", (event) => void setAccent((event.target as HTMLInputElement).value));
      root.querySelector<HTMLInputElement>('input[name="rollAtTable"]')?.addEventListener("change", (event) => {
        void actor.update({ system: { settings: { rollAtTable: (event.target as HTMLInputElement).checked } } } as never);
      });
    },
  } as never);
}
