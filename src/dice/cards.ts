import type { CharacterModel } from "../data/actor/character.ts";
import { attackOutcome, damageFor, marginText, takeDamage, type Chip, type DamageTarget as TargetInfo, type Outcome } from "../rules/damage.ts";
import { groupLabel, rollDamage, tagHtml, type Applied, type AttackFlag, type DamageFlag } from "./attack.ts";
import { setInitiative } from "./check.ts";
import { powerBands } from "./force.ts";

/**
 * Attack and damage cards (mockup 2). The stored content holds the title, tags and roll; the part
 * that depends on who is looking (the GM's margins, Apply buttons) and on live documents (a target's
 * armor, the selected token) is drawn into `.hc-live` each time core renders the message.
 */

const escape = (s: string) => foundry.utils.escapeHTML(s);

const OUTCOME_LABELS: Record<Outcome, [string, string]> = {
  hit: ["hit", "Hit"], crit: ["crit", "Critical"], miss: ["miss", "Miss"], untargeted: ["", "Targeted"],
  nodefense: ["", "No defense set"], selected: ["", "Selected"], half: ["", "Half"],
};

/** A target row's document: a token resolves to its actor (synthetic for an unlinked token). */
function actorOf(uuid: string): Actor.Implementation | null {
  const doc = fromUuidSync(uuid) as unknown;
  if (doc instanceof foundry.documents.TokenDocument) return (doc.actor as Actor.Implementation | null) ?? null;
  return doc instanceof foundry.documents.Actor ? (doc as Actor.Implementation) : null;
}

/** What the card can know about a target: organic or not from its species, and its worn armor's DR. */
function targetInfo(actor: Actor.Implementation | null): TargetInfo {
  if (actor?.type !== "character") return { organic: null, armor: null };
  const species = actor.items.find((i) => i.type === "species")?.system as { droid?: boolean } | undefined;
  const armor = actor.items.find((i) => {
    const s = i.system as { worn?: boolean; damageReduction?: number };
    return i.type === "armor" && s.worn === true && (s.damageReduction ?? 0) > 0;
  });
  const a = armor?.system as { damageReduction: number; drBypass: string } | undefined;
  return { organic: species?.droid !== true, armor: armor && a ? { name: armor.name, dr: a.damageReduction, bypass: a.drBypass } : null };
}

const hasHp = (actor: Actor.Implementation | null): actor is Actor.Implementation => actor?.type === "character";
const chipsHtml = (chips: Chip[]) => chips.map((c) => `<span class="dchip${c.immune ? " immune" : ""}">${escape(c.text)}</span>`).join("");
const tookHtml = (a: Applied) => `<span class="dchip took">Took ${a.n}${game.user.isGM ? `<span class="gm-only"> (HP ${a.hpBefore} to ${a.hpAfter})</span>` : ""}</span>`;
const rollOf = (flag: DamageFlag) => ({ total: flag.total, type: flag.type, group: flag.group, groupLabel: groupLabel(flag.group), halfOnMiss: flag.halfOnMiss });

function attackLive(message: ChatMessage.Implementation, flag: AttackFlag): string {
  const gm = game.user.isGM;
  const rows = flag.targets.length
    ? flag.targets.map((t) => {
      const [cls, label] = OUTCOME_LABELS[t.outcome];
      return `<div class="target"><span>${escape(t.name)}${gm ? ` <span class="gm-only">${escape(marginText(t.reflex, flag.total, flag.natural))}</span>` : ""}</span><span class="result ${cls}">${label}</span></div>`;
    }).join("")
    : `<div class="hint">No target.${flag.natural === 20 ? " Natural 20: a critical hit." : flag.natural === 1 ? " Natural 1: a miss." : ""} Damage can go to a selected token.</div>`;
  const owner = message.speakerActor?.isOwner === true;
  const button = owner ? `<div class="btns"><button type="button" class="btn primary" data-hc="damage">${flag.crit ? "Roll critical damage" : "Roll damage"}</button></div>` : "";
  return `<div class="targets">${rows}</div>${button}`;
}

/** The selected-token row: full or half to the token the user controls, through that token's own DR and immunity. */
function selectedRow(flag: DamageFlag, canEdit: boolean): string {
  if (!canEdit) return "";
  if (flag.selected) {
    const s = flag.selected;
    return `<div class="dmg-row done sel-row"><div><div>${escape(s.name)} <span class="result">Selected</span></div><div class="chips-line">${s.how === "half" ? '<span class="dchip">Half</span>' : ""}${tookHtml(s)}</div></div><span class="dmg-final">${s.n}</span><button type="button" class="btn" data-hc="undo-selected">Undo</button></div>`;
  }
  const token = canvas?.ready ? canvas.tokens?.controlled[0] : undefined;
  const actor = (token?.actor as Actor.Implementation | null | undefined) ?? null;
  if (!token || !hasHp(actor) || !actor.isOwner) {
    return '<div class="dmg-row sel-row"><div><div>Selected token</div><div class="chips-line"><span class="dchip">Select a token on the canvas to apply this damage to it</span></div></div><span></span><span></span></div>';
  }
  const info = targetInfo(actor), roll = rollOf(flag);
  const full = damageFor(info, "selected", roll), half = damageFor(info, "half", roll);
  const btns = [
    full.n > 0 ? `<button type="button" class="btn primary" data-hc="apply-selected" data-how="selected">Apply ${full.n}</button>` : "",
    half.n > 0 ? `<button type="button" class="btn" data-hc="apply-selected" data-how="half">Half ${half.n}</button>` : "",
  ].join("");
  return `<div class="dmg-row sel-row"><div><div>${escape(token.name ?? actor.name)} <span class="result">Selected</span></div><div class="chips-line">${chipsHtml(full.chips)}</div></div><span class="dmg-final">${full.n}</span><span class="btns">${btns}</span></div>`;
}

function damageLive(message: ChatMessage.Implementation, flag: DamageFlag): string {
  const canEdit = message.canUserModify(game.user, "update");
  const roll = rollOf(flag);
  let open = 0;
  const rows = flag.targets.map((t) => {
    const actor = actorOf(t.uuid);
    const r = damageFor(targetInfo(actor), t.outcome, roll);
    const [cls, label] = OUTCOME_LABELS[t.outcome];
    const applied = flag.applied.find((a) => a.uuid === t.uuid);
    const may = canEdit && hasHp(actor) && actor.isOwner;
    let btn = "<span></span>";
    if (applied && may) btn = `<button type="button" class="btn" data-hc="undo" data-uuid="${escape(t.uuid)}">Undo</button>`;
    else if (!applied && may && r.n > 0) {
      btn = `<button type="button" class="btn primary" data-hc="apply" data-uuid="${escape(t.uuid)}">Apply</button>`;
      open += 1;
    }
    return `<div class="dmg-row${applied ? " done" : ""}"><div><div>${escape(t.name)} <span class="result ${cls}">${label}</span></div><div class="chips-line">${chipsHtml(r.chips)}${applied ? tookHtml(applied) : ""}</div></div><span class="dmg-final">${r.n}</span>${btn}</div>`;
  }).join("");
  const all = open > 1 ? '<div class="btns"><button type="button" class="btn" data-hc="apply-all">Apply all</button></div>' : "";
  return `<div class="targets">${rows}${all}${selectedRow(flag, canEdit)}</div>`;
}

/** Damage off temporary hit points first, then hit points (rules/damage.ts takeDamage). */
async function take(actor: Actor.Implementation, n: number, uuid: string, name: string, how: Outcome): Promise<Applied> {
  const hp = (actor.system as CharacterModel).hp;
  const t = takeDamage(hp.value, hp.temp, n);
  await actor.update({ system: { hp: { value: t.hp, temp: t.temp } } } as never);
  return { uuid, name, n, fromHp: t.fromHp, fromTemp: t.fromTemp, hpBefore: hp.value, hpAfter: t.hp, how };
}

async function giveBack(a: Applied): Promise<void> {
  const actor = actorOf(a.uuid);
  if (!hasHp(actor)) return;
  const hp = (actor.system as CharacterModel).hp;
  await actor.update({ system: { hp: { value: hp.value + a.fromHp, temp: hp.temp + a.fromTemp } } } as never);
}

async function onDamageAction(message: ChatMessage.Implementation, flag: DamageFlag, action: string, button: HTMLElement): Promise<void> {
  const roll = rollOf(flag);
  const applied = [...flag.applied];
  const applyRow = async (uuid: string) => {
    const t = flag.targets.find((x) => x.uuid === uuid);
    const actor = actorOf(uuid);
    if (!t || !hasHp(actor) || applied.some((a) => a.uuid === uuid)) return;
    const n = damageFor(targetInfo(actor), t.outcome, roll).n;
    if (n > 0) applied.push(await take(actor, n, uuid, t.name, t.outcome));
  };
  if (action === "apply") await applyRow(button.dataset["uuid"] ?? "");
  else if (action === "apply-all") for (const t of flag.targets) await applyRow(t.uuid);
  else if (action === "undo") {
    const i = applied.findIndex((a) => a.uuid === button.dataset["uuid"]);
    if (i >= 0) {
      await giveBack(applied[i]!);
      applied.splice(i, 1);
    }
  } else if (action === "apply-selected") {
    const token = canvas?.tokens?.controlled[0];
    const actor = (token?.actor as Actor.Implementation | null | undefined) ?? null;
    if (!token || !hasHp(actor) || flag.selected) return;
    const how = button.dataset["how"] === "half" ? "half" : "selected";
    const n = damageFor(targetInfo(actor), how, roll).n;
    const selected = await take(actor, n, token.document.uuid ?? "", token.name ?? actor.name, how);
    await message.update({ "flags.holocron.damage.selected": selected } as never);
    return;
  } else if (action === "undo-selected") {
    if (flag.selected) await giveBack(flag.selected);
    await message.update({ "flags.holocron.damage.selected": null } as never);
    return;
  } else return;
  await message.update({ "flags.holocron.damage.applied": applied } as never);
}

async function onAction(message: ChatMessage.Implementation, button: HTMLButtonElement): Promise<void> {
  const action = button.dataset["hc"] ?? "";
  const attack = message.getFlag("holocron", "attack") as AttackFlag | undefined;
  const damage = message.getFlag("holocron", "damage") as DamageFlag | undefined;
  if (attack && action === "damage") {
    const actor = message.speakerActor as Actor.Implementation | null;
    const weapon = actor?.items.get(attack.weaponId);
    if (!actor || !weapon) {
      ui.notifications?.warn(`${attack.weapon} is no longer on ${actor?.name ?? "the character"}.`);
      return;
    }
    await rollDamage(actor, weapon as Item.Implementation, { crit: attack.crit, attack: message });
  } else if (damage) await onDamageAction(message, damage, action, button);
}

/** The speaker's token image in the card head (mockup 2), from the speaking token, else the actor's prototype. */
function addTokenImage(message: ChatMessage.Implementation, html: HTMLElement): void {
  const actor = message.speakerActor;
  if (!actor) return;
  const token = message.speaker.scene && message.speaker.token ? game.scenes?.get(message.speaker.scene)?.tokens.get(message.speaker.token) : null;
  const src = token?.texture.src ?? actor.prototypeToken?.texture.src ?? actor.img;
  if (!src) return;
  html.querySelector(".hc-token")?.remove();
  const img = document.createElement("img");
  img.className = "hc-token";
  img.src = src;
  img.alt = "";
  html.querySelector(".message-header")?.prepend(img);
}

/** Fills a Holocron card's live part and wires its buttons. Hooked to renderChatMessageHTML. */
export function renderCard(message: ChatMessage.Implementation, html: HTMLElement): void {
  const live = html.querySelector<HTMLElement>(".holocron-card .hc-live");
  if (!live) return;
  html.classList.add("holocron-message");
  addTokenImage(message, html);
  const attack = message.getFlag("holocron", "attack") as AttackFlag | undefined;
  const damage = message.getFlag("holocron", "damage") as DamageFlag | undefined;
  if (attack) live.innerHTML = attackLive(message, attack);
  else if (damage) live.innerHTML = damageLive(message, damage);
  if (canReroll(message)) live.insertAdjacentHTML("beforeend", `<div class="hint">Right-click this card: ${REROLL_LABEL}.</div>`);
  live.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-hc]");
    if (!button || button.disabled) return;
    button.disabled = true;
    void onAction(message, button).finally(() => { button.disabled = false; });
  });
}

const REROLL_LABEL = "Spend a Force Point: take a new roll";

/** A check or attack card whose speaker the user owns and whose message the user may change. */
function canReroll(message: ChatMessage.Implementation | undefined): message is ChatMessage.Implementation {
  if (!message?.rolls.length) return false;
  const flags = message.flags.holocron as Record<string, unknown> | undefined;
  return Boolean(flags?.["check"] || flags?.["attack"]) && message.speakerActor?.isOwner === true && message.canUserModify(game.user, "update");
}

/**
 * A Force Point after a roll: "reroll and take the new roll" (rulings.md, The Force). The roll is
 * made the way the first was (advantage stays 2d20 keep the higher), replaces it in place with a
 * "Rerolled, was N" tag, and costs one Force Point once the card is updated. A power's bands, an
 * attack's per-target results and an Initiative score follow the new total; so do the unapplied rows
 * of a damage card already rolled from the attack, where a new natural 20 reads as a hit (its damage
 * was rolled already, so it is not doubled).
 */
export async function forcePointReroll(message: ChatMessage.Implementation): Promise<void> {
  const actor = message.speakerActor as Actor.Implementation | null;
  if (!actor || !canReroll(message)) return;
  const left = (actor.system as CharacterModel).forcePoints.value;
  if (left < 1) {
    ui.notifications?.warn(`${actor.name} has no Force Points left.`);
    return;
  }
  const old = message.rolls[0]!;
  const roll = await old.reroll();
  const total = roll.total ?? 0;
  const card = document.createElement("div");
  card.innerHTML = message.content ?? "";
  card.querySelector(".dice-roll")?.replaceWith(foundry.utils.parseHTML(await roll.render()) as HTMLElement);
  card.querySelector(".card-title .tags")?.insertAdjacentHTML("beforeend", tagHtml(`Rerolled, was ${old.total ?? 0}`));

  const update: Record<string, unknown> = {};
  const attack = message.getFlag("holocron", "attack") as AttackFlag | undefined;
  const check = message.getFlag("holocron", "check") as { skill: string } | undefined;
  const power = message.getFlag("holocron", "power") as { itemId: string } | undefined;
  if (check) update["flags.holocron.check.total"] = total;
  if (power) {
    const item = actor.items.get(power.itemId);
    const extra = card.querySelector(".hc-extra");
    if (item && extra) {
      const bands = powerBands(item as Item.Implementation, total);
      extra.innerHTML = bands.html;
      update["flags.holocron.power.reached"] = bands.reached;
    }
  }
  let attackTargets: AttackFlag["targets"] = [];
  if (attack) {
    const natural = roll.dice[0]?.total ?? 0;
    attackTargets = attack.targets.map((t) => {
      const outcome = attackOutcome(natural, total, t.reflex);
      return { ...t, outcome, hit: outcome === "hit" || outcome === "crit" };
    });
    Object.assign(update, { "flags.holocron.attack.natural": natural, "flags.holocron.attack.total": total, "flags.holocron.attack.crit": natural === 20, "flags.holocron.attack.targets": attackTargets });
  }
  await message.update({ content: card.innerHTML, rolls: [roll], ...update } as never);
  await actor.update({ system: { forcePoints: { value: left - 1 } } } as never);
  if (check?.skill === "initiative") await setInitiative(actor, total);
  if (!attack) return;
  for (const m of game.messages?.contents ?? []) {
    const damage = m.getFlag("holocron", "damage") as DamageFlag | undefined;
    if (damage?.attackId !== message.id || !m.canUserModify(game.user, "update")) continue;
    const targets = damage.targets.map((t) => {
      const now = attackTargets.find((a) => a.uuid === t.uuid);
      if (!now || damage.applied.some((a) => a.uuid === t.uuid)) return t;
      return { ...t, outcome: now.outcome === "crit" ? "hit" as const : now.outcome };
    });
    await m.update({ "flags.holocron.damage.targets": targets } as never);
  }
}

/** The chat log's right-click entry on check and attack cards (mockup 2). */
export function onChatContextOptions(_app: unknown, options: { label: string; icon: string; visible: (li: HTMLElement) => boolean; onClick: (event: Event, li: HTMLElement) => unknown }[]): void {
  options.push({
    label: REROLL_LABEL,
    icon: "fa-solid fa-dice-d20",
    visible: (li) => canReroll(game.messages?.get(li.dataset["messageId"] ?? "")),
    onClick: (_event, li) => {
      const message = game.messages?.get(li.dataset["messageId"] ?? "");
      if (message) return forcePointReroll(message);
    },
  });
}

/**
 * Damage cards offer the selected token, so they redraw when the selection changes. Only the last
 * 30 messages: older cards are scrolled away, and redraw on their own when next rendered.
 */
let redraw: ReturnType<typeof setTimeout> | null = null;
export function onControlToken(): void {
  if (redraw) clearTimeout(redraw);
  redraw = setTimeout(() => {
    redraw = null;
    for (const m of game.messages?.contents.slice(-30) ?? []) {
      const flag = m.getFlag("holocron", "damage") as DamageFlag | undefined;
      if (flag && !flag.selected && m.canUserModify(game.user, "update")) void ui.chat?.updateMessage(m);
    }
  }, 50);
}
