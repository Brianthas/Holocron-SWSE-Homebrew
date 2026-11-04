/**
 * Dice rolled at the table (mockup 1, "Enter my own roll results"; the SWSE fork's v1.4.7, extended
 * to attacks and damage). A per-character setting. Each roll asks for the natural face (the sheet
 * adds the modifiers, and natural 1 and 20 still count) or a finished total, with "Roll in Foundry"
 * to roll as usual. Initiative always rolls in Foundry: the combat tracker rolls it.
 */

export interface TableEntry { face: number | null; total: number | null }

/** The tag on a card whose dice were entered. */
export const TABLE_TAG = "Rolled at the table";

export const rollsAtTable = (actor: Actor.Implementation | null | undefined): boolean =>
  (actor?.system as { settings?: { rollAtTable?: boolean } } | undefined)?.settings?.rollAtTable === true;

const signed = (n: number) => (n < 0 ? `- ${Math.abs(n)}` : `+ ${n}`);

/**
 * The entry dialog. `faces` bounds the face; `allowTotal` offers a finished total instead (not for
 * damage, whose total is the dice plus the modifiers). Resolves "foundry" for Roll in Foundry, null
 * when closed.
 */
export async function askTable({ title, what, faceLabel, faces, modifier, allowTotal = true }: {
  title: string; what: string; faceLabel: string; faces: number; modifier: number; allowTotal?: boolean;
}): Promise<TableEntry | "foundry" | null> {
  const content = `
    <div class="hc-table-entry">
      <p>${foundry.utils.escapeHTML(what)}</p>
      <label>${foundry.utils.escapeHTML(faceLabel)} <input type="number" name="face" min="1" max="${faces}" step="1" autofocus></label>
      ${allowTotal ? '<p class="hint">or the finished total</p><label>Total <input type="number" name="total" step="1"></label>' : ""}
      <p class="hint">The sheet adds ${signed(modifier)}.</p>
    </div>`;
  const result = await foundry.applications.api.DialogV2.wait({
    classes: ["holocron", "hc-table"],
    window: { title: `${title}: rolled at the table` },
    content,
    buttons: [
      { action: "foundry", label: "Roll in Foundry", callback: () => "foundry" },
      {
        action: "enter", label: "Enter", default: true,
        callback: (_event: Event, button: HTMLButtonElement) => {
          const form = button.form as HTMLFormElement;
          const read = (name: string) => {
            const value = (form.elements.namedItem(name) as HTMLInputElement | null)?.value.trim() ?? "";
            return value === "" ? null : Number(value);
          };
          return { face: read("face"), total: read("total") };
        },
      },
    ],
    rejectClose: false,
  } as never) as unknown;
  if (result === "foundry") return "foundry";
  if (!result || typeof result !== "object") return null;
  const { face, total } = result as TableEntry;
  if (face !== null && Number.isInteger(face) && face >= 1 && face <= faces) return { face, total: null };
  if (allowTotal && total !== null && Number.isInteger(total)) return { face: null, total };
  ui.notifications?.warn(`Enter a face from 1 to ${faces}${allowTotal ? ", or a whole-number total" : ""}.`);
  return null;
}

/** The entry for a d20 check or attack: the face (the higher one with a Force Point) or a total. */
export const askCheckEntry = (title: string, advantage: boolean, modifier: number) => askTable({
  title, what: `${advantage ? "2d20, keep the higher," : "1d20"} ${signed(modifier)}`,
  faceLabel: advantage ? "Higher d20 face" : "d20 face", faces: 20, modifier,
});

/**
 * The roll for an entered d20: the face stands in for the formula's first die (one d20, so a
 * Force Point's 2d20 keep the higher is entered as the higher face) and the modifiers are added; a
 * finished total is the whole roll. The formula is rolled first so every term is evaluated, then
 * the die is replaced: Roll.fromTerms takes terms all evaluated or none.
 */
export async function enteredD20(formula: string, entry: TableEntry): Promise<Roll> {
  if (entry.face === null) return new Roll(`${entry.total ?? 0}[Total entered at the table]`).evaluate();
  const rolled = await new Roll(formula).evaluate({ allowInteractive: false });
  const terms = [...rolled.terms];
  const index = terms.findIndex((t) => t instanceof foundry.dice.terms.Die);
  terms[index] = new foundry.dice.terms.Die({ number: 1, faces: 20, results: [{ result: entry.face, active: true }] } as never);
  return Roll.fromTerms(terms as never) as Roll;
}

/** A damage or hit-die formula with its leading dice replaced by the total entered for them. */
export const enteredDice = (formula: string, total: number): string =>
  formula.replace(/^\s*(\d+d\d+)/, (dice) => `${total}[${dice.trim()} rolled at the table]`);
