import { SKILLS, type SkillKey } from "../config/skills.ts";
import type { CharacterModel } from "../data/actor/character.ts";
import { healTo } from "../rules/resources.ts";
import { cardHtml, labelledFormula } from "./attack.ts";
import { askCheckEntry, enteredD20, rollsAtTable, TABLE_TAG } from "./table.ts";

const escape = (s: string) => foundry.utils.escapeHTML(s);

/** What a check card records. */
export interface CheckFlag { skill: SkillKey; advantage: boolean; other: number; total: number; formula: string; modifier: number }

/** What a check card shows besides the roll: a Force power's title, tags and bands (force.ts). */
export interface CheckCard { title: string; tags: string[]; extra: string; flavor: string; flags: Record<string, unknown> }

/** Sets the character's initiative in every active combat it is in, not only the one on the scene being viewed. */
export async function setInitiative(actor: Actor.Implementation, total: number): Promise<void> {
  for (const combat of game.combats ?? []) {
    if (!combat.active) continue;
    for (const combatant of combat.combatants) {
      if (combatant.actorId === actor.id && combatant.id) await combat.setInitiative(combatant.id, total);
    }
  }
}

/**
 * A skill check: 1d20, or with a Force Point spent before the roll 2d20 keeping the higher
 * (rulings.md, The Force), plus the skill's terms and any other modifier. The Force Point is spent
 * once the roll is made. An Initiative check also sets the character's initiative. `card` replaces
 * the title and flavor and adds tags, an extra block and flags from the total (a Force power).
 */
export async function rollCheck(
  actor: Actor.Implementation, key: SkillKey, { advantage = false, other = 0 } = {},
  card?: (total: number) => CheckCard,
): Promise<ChatMessage.Implementation | null> {
  const system = actor.system as CharacterModel;
  const spend = advantage && system.forcePoints.value > 0;
  const formula = labelledFormula(spend ? "2d20kh" : "1d20", system.skillTotals[key]) + (other ? ` ${other < 0 ? "-" : "+"} ${Math.abs(other)}[Other modifier]` : "");
  // Initiative always rolls in Foundry (table.ts). Closing the entry rolls nothing and spends nothing.
  const entry = key !== "initiative" && rollsAtTable(actor) ? await askCheckEntry(`${SKILLS[key].label} check`, spend, system.skillTotals[key].total + other) : "foundry";
  if (!entry) return null;
  const roll = entry === "foundry" ? await new Roll(formula).evaluate() : await enteredD20(formula, entry);
  if (spend) await actor.update({ system: { forcePoints: { value: system.forcePoints.value - 1 } } } as never);
  const flag: CheckFlag = { skill: key, advantage: spend, other, total: roll.total ?? 0, formula, modifier: system.skillTotals[key].total + other };
  const custom = card?.(roll.total ?? 0);
  const tags = [...(spend ? ["Force Point"] : []), ...(custom?.tags ?? []), ...(entry === "foundry" ? [] : [TABLE_TAG])];
  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
    rolls: [roll],
    flavor: `${custom?.flavor ?? `${escape(SKILLS[key].label)} check`}${spend ? " (Force Point: 2d20, keep the higher)" : ""}`,
    content: await cardHtml(custom?.title ?? SKILLS[key].label, tags, roll, custom?.extra ?? ""),
    flags: { holocron: { check: flag, ...custom?.flags } },
  } as never);
  if (key === "initiative") await setInitiative(actor, roll.total ?? 0);
  return (message as ChatMessage.Implementation | undefined) ?? null;
}

/**
 * Asks how to roll a check: normally, or spending a Force Point for 2d20 keep the higher, with an
 * other modifier (mockup 2's check dialog). Null when cancelled.
 */
export async function checkDialog(actor: Actor.Implementation, key: SkillKey): Promise<{ advantage: boolean; other: number } | null> {
  const system = actor.system as CharacterModel;
  const total = system.skillTotals[key].total;
  const left = system.forcePoints.value;
  const content = `
    <div class="holocron-check-dialog">
      <p><b>${escape(SKILLS[key].label)}</b> ${total < 0 ? total : `+${total}`}</p>
      <label><input type="radio" name="mode" value="normal" checked> Normal: 1d20</label>
      <label><input type="radio" name="mode" value="advantage" ${left > 0 ? "" : "disabled"}> Advantage: spend a Force Point, roll 2d20 and keep the higher</label>
      <p class="hint">${left > 0 ? `Force Points left: ${left}` : "No Force Points left"}</p>
      <label>Other modifier <input type="number" name="other" value="0" step="1"></label>
    </div>`;
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `${SKILLS[key].label} check` },
    content,
    buttons: [
      {
        action: "roll", label: "Roll", default: true,
        callback: (_event: Event, button: HTMLButtonElement) => {
          const form = button.form as HTMLFormElement;
          const mode = (form.elements.namedItem("mode") as RadioNodeList).value;
          return { advantage: mode === "advantage", other: Number((form.elements.namedItem("other") as HTMLInputElement).value) || 0 };
        },
      },
      { action: "cancel", label: "Cancel" },
    ],
    rejectClose: false,
  } as never) as unknown;
  return result && typeof result === "object" ? (result as { advantage: boolean; other: number }) : null;
}

/**
 * Second Wind (episode-vii: a Swift Action, in or out of combat, regardless of hit points, while
 * conscious): uses one, rolls the healing (the highest Hit Die + CON + level + healing received) and
 * heals up to the maximum.
 */
export async function useSecondWind(actor: Actor.Implementation): Promise<ChatMessage.Implementation | null> {
  const system = actor.system as CharacterModel;
  if (system.secondWind.value < 1 || system.hpState === "dying" || system.hpState === "dead" || !system.healing.die) return null;
  const roll = await new Roll(labelledFormula(`1d${system.healing.die}`, system.healing.flat)).evaluate();
  const before = system.hp.value;
  const after = healTo(before, roll.total ?? 0, system.hpMax.total);
  await actor.update({ system: { hp: { value: after }, secondWind: { value: system.secondWind.value - 1 } } } as never);
  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
    rolls: [roll],
    flavor: `Second Wind: heals ${after - before} (${before} to ${after})`,
    flags: { holocron: { secondWind: { before, after, rolled: roll.total ?? 0 } } },
  } as never);
  return (message as ChatMessage.Implementation | undefined) ?? null;
}
