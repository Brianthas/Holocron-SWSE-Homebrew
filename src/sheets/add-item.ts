import { askChoice, choiceListOf } from "./choice.ts";

/**
 * Adds a compendium item to a character the way a drop does. A Force power the character knows gains
 * a ready copy (mockup 3: "adds a copy of a power already known"). A species replaces the
 * character's species: the new one is created first and the old one removed after, so a failure
 * leaves the character as it was. Anything else is created as a new item, with `extra` merged into
 * its data (a level slot's flag). A choice feat or talent asks its choice first (sheets/choice.ts);
 * cancelled, or with nothing to choose, nothing is added and this returns null.
 */
export async function addItem(actor: Actor.Implementation, source: Item.Implementation, extra: object = {}): Promise<Item.Implementation | null> {
  if (source.type === "forcePower") {
    const known = actor.items.find((i) => i.type === "forcePower" && i.name === source.name);
    if (known) {
      const d = known.system as unknown as { copies: number; ready: number };
      await known.update({ "system.copies": d.copies + 1, "system.ready": d.ready + 1 } as never);
      return known as Item.Implementation;
    }
  }
  let choice = {};
  if (choiceListOf(source)) {
    const picked = await askChoice(actor, source);
    if (!picked) return null;
    choice = { system: { choice: picked.value } };
  }
  const old = source.type === "species" ? actor.items.filter((i) => i.type === "species") : [];
  const data = foundry.utils.mergeObject(foundry.utils.mergeObject(source.toObject(), extra, { inplace: false }), choice, { inplace: false });
  const [created] = await actor.createEmbeddedDocuments("Item", [data]);
  if (created && old.length) await actor.deleteEmbeddedDocuments("Item", old.map((i) => i.id ?? ""));
  return (created as Item.Implementation | undefined) ?? null;
}
