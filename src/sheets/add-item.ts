/**
 * Adds a compendium item to a character the way a drop does. A Force power the character knows gains
 * a ready copy (mockup 3: "adds a copy of a power already known"). A species replaces the
 * character's species: the new one is created first and the old one removed after, so a failure
 * leaves the character as it was. Anything else is created as a new item.
 */
export async function addItem(actor: Actor.Implementation, source: Item.Implementation): Promise<Item.Implementation | null> {
  if (source.type === "forcePower") {
    const known = actor.items.find((i) => i.type === "forcePower" && i.name === source.name);
    if (known) {
      const d = known.system as unknown as { copies: number; ready: number };
      await known.update({ "system.copies": d.copies + 1, "system.ready": d.ready + 1 } as never);
      return known as Item.Implementation;
    }
  }
  const old = source.type === "species" ? actor.items.filter((i) => i.type === "species") : [];
  const [created] = await actor.createEmbeddedDocuments("Item", [source.toObject()]);
  if (created && old.length) await actor.deleteEmbeddedDocuments("Item", old.map((i) => i.id ?? ""));
  return (created as Item.Implementation | undefined) ?? null;
}
