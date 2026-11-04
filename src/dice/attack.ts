import { WEAPON_GROUPS, type WeaponGroupKey } from "../config/weapons.ts";
import type { CharacterModel, WeaponData } from "../data/actor/character.ts";
import { attackOutcome, type Outcome } from "../rules/damage.ts";
import type { Breakdown } from "../rules/modifiers.ts";

/** One target of an attack, as the attack card judged it. `uuid` is the target's token. */
export interface AttackTarget { name: string; uuid: string; reflex: number | null; outcome: Outcome; hit: boolean }

/** What an attack card records, so the damage card and tests read results instead of re-deriving them. */
export interface AttackFlag {
  weapon: string;
  weaponId: string;
  bonus: number;
  natural: number;
  total: number;
  crit: boolean;
  targets: AttackTarget[];
}

/** One row of a damage card: a target and how the card treats it. */
export interface DamageTarget { name: string; uuid: string; outcome: Outcome }

/** Damage taken through a card, so Undo can give back exactly that. */
export interface Applied { uuid: string; name: string; n: number; fromHp: number; fromTemp: number; hpBefore: number; hpAfter: number; how: Outcome }

/** What a damage card records. `applied` holds the target rows applied; `selected` the one applied to a selected token. */
export interface DamageFlag {
  weapon: string;
  type: string;
  group: string;
  halfOnMiss: boolean;
  total: number;
  crit: boolean;
  attackId: string | null;
  targets: DamageTarget[];
  applied: Applied[];
  selected: Applied | null;
}

const escape = (s: string) => foundry.utils.escapeHTML(s);

/** "1d20 + 1[Base attack bonus] + 2[DEX]": each term keeps its label in the roll. */
export const labelledFormula = (die: string, parts: Breakdown) =>
  [die, ...parts.applied.filter((m) => m.value !== 0).map((m) => `${m.value < 0 ? "-" : "+"} ${Math.abs(m.value)}[${m.label}]`)].join(" ");

/** The weapon's damage type: the one picked on the Play tab, else its first. */
export const damageTypeOf = (data: { damageTypes?: string[]; damageType?: string }): string =>
  (data.damageType && data.damageTypes?.includes(data.damageType) ? data.damageType : data.damageTypes?.[0]) ?? "";

export const groupLabel = (group: string): string => WEAPON_GROUPS[group as WeaponGroupKey] ?? "";

/** Damage types (fork v1.4.1, alphabetical); a tag naming one is coloured for it. */
const DAMAGE_TYPES = ["Burn", "Energy", "Ion", "Physical", "Sonic", "Stun"];

/** The card's fixed part: title, tags and the roll. The live part (targets, buttons) is drawn per viewer (cards.ts). */
export const cardHtml = async (title: string, tags: string[], roll: Roll) => `
  <div class="holocron holocron-card">
    <div class="card-title"><h4>${escape(title)}</h4><div class="tags">${tags.map((t) => `<span class="tag${DAMAGE_TYPES.includes(t) ? ` type-${t.toLowerCase()}` : ""}">${escape(t)}</span>`).join("")}</div></div>
    ${await roll.render()}
    <div class="hc-live"></div>
  </div>`;

/**
 * Rolls a weapon attack against each targeted token's Reflex Defense (rules/damage.ts
 * attackOutcome). A target with no Holocron statblock gets no verdict.
 */
export async function rollAttack(actor: Actor.Implementation, weapon: Item.Implementation): Promise<ChatMessage.Implementation | null> {
  const system = actor.system as CharacterModel;
  const data = weapon.system as WeaponData & { damageTypes?: string[]; damageType?: string };
  const parts = system.attackFor(data);
  const roll = await new Roll(labelledFormula("1d20", parts)).evaluate();
  const natural = roll.dice[0]?.total ?? 0;
  const total = roll.total ?? 0;

  const targets: AttackTarget[] = [...game.user.targets].flatMap((token) => {
    const target = token.actor;
    if (!target) return [];
    const reflex = (target.system as CharacterModel | undefined)?.defenses?.reflex?.total ?? null;
    const outcome = attackOutcome(natural, total, reflex);
    return [{ name: token.name ?? target.name, uuid: token.document.uuid ?? "", reflex, outcome, hit: outcome === "hit" || outcome === "crit" }];
  });

  const flag: AttackFlag = { weapon: weapon.name, weaponId: weapon.id ?? "", bonus: parts.total, natural, total, crit: natural === 20, targets };
  const type = damageTypeOf(data);
  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
    rolls: [roll],
    flavor: `${escape(weapon.name)} attack`,
    // Core shows a roll only when the content has no elements of its own (chat-message.mjs
    // #renderRollContent), so the card carries the roll's HTML itself.
    content: await cardHtml(weapon.name, [data.category === "melee" ? "Melee" : "Ranged", ...(type ? [type] : [])], roll),
    flags: { holocron: { attack: flag } },
  } as never);
  return (message as ChatMessage.Implementation | undefined) ?? null;
}

/**
 * Asks whether a damage roll with no attack card behind it is a critical (mockup 2; v1.4.8 of the
 * fork). Null when closed.
 */
export async function askCritical(name: string): Promise<boolean | null> {
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `${name}: damage only` },
    content: "<p>No attack roll here, so which was it?</p>",
    buttons: [
      { action: "normal", label: "Normal", default: true, callback: () => "normal" },
      { action: "crit", label: "Critical", callback: () => "crit" },
    ],
    rejectClose: false,
  } as never) as unknown;
  return result === "normal" ? false : result === "crit" ? true : null;
}

/**
 * Rolls a weapon's damage: weapon dice + the damage ability + half heroic level + bonuses, the whole
 * result doubled on a critical (rulings.md, Combat). From an attack card the rows follow that card's
 * results; otherwise they are the current targets, at full damage.
 */
export async function rollDamage(
  actor: Actor.Implementation, weapon: Item.Implementation,
  { crit = false, attack = null }: { crit?: boolean; attack?: ChatMessage.Implementation | null } = {},
): Promise<ChatMessage.Implementation | null> {
  const system = actor.system as CharacterModel;
  const data = weapon.system as WeaponData & { damageTypes?: string[]; damageType?: string; halfOnMiss?: boolean };
  const formula = system.damageFor(data).formula;
  const roll = await new Roll(crit ? `(${formula}) * 2` : formula).evaluate();
  const attackFlag = attack?.getFlag("holocron", "attack") as AttackFlag | undefined;
  const targets: DamageTarget[] = attackFlag
    ? attackFlag.targets.map((t) => ({ name: t.name, uuid: t.uuid, outcome: t.outcome }))
    : [...game.user.targets].flatMap((token) => (token.actor ? [{ name: token.name ?? token.actor.name, uuid: token.document.uuid ?? "", outcome: "untargeted" as const }] : []));
  const type = damageTypeOf(data);
  const flag: DamageFlag = {
    weapon: weapon.name, type, group: data.group, halfOnMiss: data.halfOnMiss === true, total: roll.total ?? 0, crit,
    attackId: attack?.id ?? null, targets, applied: [], selected: null,
  };
  const tags = [...(type ? [type] : []), ...(crit ? ["Critical"] : []), ...(flag.halfOnMiss ? ["Half damage on a miss"] : [])];
  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
    rolls: [roll],
    flavor: `${escape(weapon.name)} damage`,
    content: await cardHtml(`${weapon.name} damage`, tags, roll),
    flags: { holocron: { damage: flag } },
  } as never);
  return (message as ChatMessage.Implementation | undefined) ?? null;
}
