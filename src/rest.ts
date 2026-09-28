import type { CharacterModel } from "./data/actor/character.ts";

/**
 * A long rest (rulings.md, Hit points and healing: Rest): hit points to full, Force Points to their
 * per-day number, every Force power ready, Second Wind restored. The sheet's Rest runs it for one
 * character; the GM's New Day runs it for every character a player owns. Each posts what it changed.
 * Per-day talent uses join when talents track uses.
 */
export async function longRest(actor: Actor.Implementation, { chat = true }: { chat?: boolean } = {}): Promise<string[]> {
  const s = actor.system as CharacterModel;
  const changed: string[] = [];
  const update: Record<string, number> = {};
  const restore = (path: string, label: string, from: number, to: number) => {
    if (from === to) return;
    update[path] = to;
    changed.push(`${label} ${from} to ${to}`);
  };
  restore("system.hp.value", "Hit points", s.hp.value, s.hpMax.total);
  restore("system.forcePoints.value", "Force Points", s.forcePoints.value, s.forcePointsPerDay.total);
  restore("system.secondWind.value", "Second Wind", s.secondWind.value, s.secondWindMax.total);
  if (Object.keys(update).length) await actor.update(update);

  const powers = actor.items.filter((i) => i.type === "forcePower")
    .map((i) => ({ item: i, sys: i.system as { copies: number; ready: number } }))
    .filter(({ sys }) => sys.ready !== sys.copies);
  if (powers.length) {
    await actor.updateEmbeddedDocuments("Item", powers.map(({ item, sys }) => ({ _id: item.id, "system.ready": sys.copies })));
    changed.push(`Force powers ready: ${powers.map(({ item }) => item.name).join(", ")}`);
  }

  // Effects that last until a rest end now. Core expires effects only on the active GM's client
  // (ActiveEffectRegistry#refresh); a player's Rest reaches the GM through its chat message instead.
  if (game.users.activeGM?.isSelf) await expireRestEffects(actor);

  if (chat) {
    const escape = (text: string) => foundry.utils.escapeHTML(text);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
      flavor: "Long rest",
      content: changed.length ? `<ul>${changed.map((c) => `<li>${escape(c)}</li>`).join("")}</ul>` : "<p>Nothing to restore.</p>",
      flags: { holocron: { rest: changed } },
    } as never);
  }
  return changed;
}

/** The "rest" expiry event: an effect with a duration ending on a long rest. */
export function registerRestExpiry(): void {
  CONFIG.ActiveEffect.expiryEvents["rest"] = "Long rest";
}

function expireRestEffects(actor: Actor.Implementation): Promise<void> {
  return foundry.documents.ActiveEffect.registry.refresh("rest", { actors: new Set([actor]) });
}

/**
 * On the active GM's client, a long rest posted by someone else ends that character's rest effects.
 * The GM's own Rest and New Day expire them directly in longRest.
 */
export function onRestMessage(message: ChatMessage.Implementation): void {
  if (!game.users.activeGM?.isSelf || message.author?.isSelf) return;
  if (message.getFlag("holocron", "rest") === undefined) return;
  const actor = ChatMessage.getSpeakerActor(message.speaker);
  if (actor) void expireRestEffects(actor);
}

/** New Day: a long rest for every character a player owns, posted as one summary. GM only. */
export async function newDay(): Promise<Record<string, string[]>> {
  if (!game.user.isGM) throw new Error("New Day is for the GM");
  const party = game.actors.filter((a) => a.type === "character" && a.hasPlayerOwner);
  const summary: Record<string, string[]> = {};
  for (const actor of party) summary[actor.name] = await longRest(actor, { chat: false });
  const escape = (text: string) => foundry.utils.escapeHTML(text);
  const rows = Object.entries(summary).map(([name, changed]) => `<li><b>${escape(name)}</b>: ${changed.length ? escape(changed.join("; ")) : "nothing to restore"}</li>`);
  await ChatMessage.create({
    flavor: "New Day",
    content: party.length ? `<ul>${rows.join("")}</ul>` : "<p>No player characters.</p>",
    flags: { holocron: { newDay: summary } },
  } as never);
  return summary;
}
