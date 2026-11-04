import { FORCE_DESCRIPTORS, type ForceDescriptorKey } from "../config/force.ts";
import { SKILL_KEYS, type SkillKey } from "../config/skills.ts";
import { bandsReached, type Band } from "../rules/force.ts";
import { rollCheck } from "./check.ts";

const escape = (s: string) => foundry.utils.escapeHTML(s);

interface PowerData { descriptors: ForceDescriptorKey[]; action: string; target: string; skill: string; bands: Band[]; cumulative: boolean; copies: number; ready: number }

/** "Standard Action" reads "Standard"; a trigger in brackets stays in the title. */
export const actionTag = (action: string): string => action.replace(/\s*\(.*\)$/, "").replace(/ Action$/, "");

/**
 * A Force power's check: the skill the power names (Use the Force for every converted power), with
 * the check dialog's choices. The card lists the DC bands with the ones the result reaches
 * highlighted: the highest only, or every one reached for a cumulative power (Bryan's fork, v1.4.7).
 * Ready copies are marked by hand on the sheet (mockup 1).
 */
export async function rollPower(actor: Actor.Implementation, power: Item.Implementation, options: { advantage: boolean; other: number }): Promise<ChatMessage.Implementation | null> {
  const data = power.system as unknown as PowerData;
  const skill = (SKILL_KEYS as readonly string[]).includes(data.skill) ? (data.skill as SkillKey) : "useTheForce";
  return rollCheck(actor, skill, options, (total) => {
    const { html, reached } = powerBands(power, total);
    return {
      title: power.name ?? "",
      tags: [...data.descriptors.map((d) => FORCE_DESCRIPTORS[d]), actionTag(data.action)].filter(Boolean),
      extra: html,
      flavor: `Use the Force (${escape(power.name ?? "")})`,
      flags: { power: { itemId: power.id, reached } },
    };
  });
}

/** The power's target line and its DC bands for a total, the reached ones highlighted. */
export function powerBands(power: Item.Implementation, total: number): { html: string; reached: number[] } {
  const data = power.system as unknown as PowerData;
  const reached = bandsReached(data.bands, total, data.cumulative);
  const rows = data.bands.map((b, i) => {
    const cls = reached.includes(i) ? "reached" : total >= b.dc ? "cleared" : "dim";
    return `<tr class="${cls}"><td>DC ${b.dc}</td><td>${escape(b.text)}</td></tr>`;
  }).join("");
  const html = `<div class="holocron-power">${data.target ? `<p class="hint">${escape(data.target)}</p>` : ""}${rows ? `<table class="bands"><tbody>${rows}</tbody></table>` : ""}</div>`;
  return { html, reached };
}

/**
 * Ending a combat deletes it; the active GM's client then readies the powers of every character in
 * it, as the sheet's End of combat button does. One writer, so two clients never update the same item.
 */
export async function onCombatEnd(combat: Combat.Implementation): Promise<void> {
  if (!game.users.activeGM?.isSelf) return;
  const actors = new Set<Actor.Implementation>();
  for (const combatant of combat.combatants) if (combatant.actor?.type === "character") actors.add(combatant.actor as Actor.Implementation);
  for (const actor of actors) await readyAllPowers(actor);
}

/** End of combat: every Force power's copies ready again (the power model's ready field). */
export async function readyAllPowers(actor: Actor.Implementation): Promise<void> {
  const updates = actor.items.filter((i) => i.type === "forcePower")
    .filter((i) => (i.system as unknown as PowerData).ready !== (i.system as unknown as PowerData).copies)
    .map((i) => ({ _id: i.id, "system.ready": (i.system as unknown as PowerData).copies }));
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates as never);
}
