const escape = (s: string) => foundry.utils.escapeHTML(s);

/** A talent's or technique's Use: posts its name, action and text to chat, spoken by the character. */
export async function postItem(actor: Actor.Implementation, item: Item.Implementation): Promise<ChatMessage.Implementation | null> {
  const data = item.system as { description?: string; action?: string };
  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
    flavor: `${escape(item.name ?? "")}${data.action ? ` (${escape(data.action)})` : ""}`,
    content: `<div class="holocron-item">${data.description ?? ""}</div>`,
    flags: { holocron: { item: { uuid: item.uuid } } },
  } as never);
  return (message as ChatMessage.Implementation | undefined) ?? null;
}
