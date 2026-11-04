import { WEAPON_GROUPS, type WeaponGroupKey } from "../config/weapons.ts";
import type { CharacterModel, WeaponData } from "../data/actor/character.ts";
import { attackOutcome, type Outcome } from "../rules/damage.ts";
import type { Breakdown } from "../rules/modifiers.ts";
import { askCheckEntry, askTable, enteredD20, enteredDice, rollsAtTable, TABLE_TAG } from "./table.ts";

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
  /** The roll's formula, so a Force Point reroll rolls or enters it again. */
  formula: string;
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

export const tagHtml = (t: string) => `<span class="tag${DAMAGE_TYPES.includes(t) ? ` type-${t.toLowerCase()}` : ""}">${escape(t)}</span>`;

/**
 * The card's stored part: title, tags, the roll, and `extra` drawn from the total (a power's bands).
 * The live part (targets, buttons) is drawn per viewer (cards.ts); a Force Point reroll replaces the
 * roll and the extra in place.
 */
export const cardHtml = async (title: string, tags: string[], roll: Roll, extra = "") => `
  <div class="holocron holocron-card">
    <div class="card-title"><h4>${escape(title)}</h4><div class="tags">${tags.map(tagHtml).join("")}</div></div>
    ${await roll.render()}
    <div class="hc-extra">${extra}</div>
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
  const formula = labelledFormula("1d20", parts);
  const entry = rollsAtTable(actor) ? await askCheckEntry(`${weapon.name}: attack`, false, parts.total) : "foundry";
  if (!entry) return null;
  const roll = entry === "foundry" ? await new Roll(formula).evaluate() : await enteredD20(formula, entry);
  const natural = roll.dice[0]?.total ?? 0;
  const total = roll.total ?? 0;

  const targets: AttackTarget[] = [...game.user.targets].flatMap((token) => {
    const target = token.actor;
    if (!target) return [];
    const reflex = (target.system as CharacterModel | undefined)?.defenses?.reflex?.total ?? null;
    const outcome = attackOutcome(natural, total, reflex);
    return [{ name: token.name ?? target.name, uuid: token.document.uuid ?? "", reflex, outcome, hit: outcome === "hit" || outcome === "crit" }];
  });

  const flag: AttackFlag = { weapon: weapon.name, weaponId: weapon.id ?? "", bonus: parts.total, natural, total, crit: natural === 20, targets, formula };
  const type = damageTypeOf(data);
  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
    rolls: [roll],
    flavor: `${escape(weapon.name)} attack`,
    // Core shows a roll only when the content has no elements of its own (chat-message.mjs
    // #renderRollContent), so the card carries the roll's HTML itself.
    content: await cardHtml(weapon.name, [data.category === "melee" ? "Melee" : "Ranged", ...(type ? [type] : []), ...(entry === "foundry" ? [] : [TABLE_TAG])], roll),
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
  const damage = system.damageFor(data);
  let formula = damage.formula;
  // At the table the dice's total is entered and the modifiers added; closing the entry rolls nothing.
  const dice = /^\s*(\d+)d(\d+)/.exec(formula);
  let entered = false;
  if (dice && rollsAtTable(actor)) {
    const entry = await askTable({
      title: `${weapon.name}: damage`, what: `${dice[0].trim()}${crit ? " (critical: the whole result doubles)" : ""}`,
      faceLabel: `Total of your ${dice[0].trim()}`, faces: Number(dice[1]) * Number(dice[2]), modifier: damage.flat.total, allowTotal: false,
    });
    if (!entry) return null;
    if (entry !== "foundry") {
      formula = enteredDice(formula, entry.face ?? 0);
      entered = true;
    }
  }
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
  const tags = [...(type ? [type] : []), ...(crit ? ["Critical"] : []), ...(flag.halfOnMiss ? ["Half damage on a miss"] : []), ...(entered ? [TABLE_TAG] : [])];
  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
    rolls: [roll],
    flavor: `${escape(weapon.name)} damage`,
    content: await cardHtml(`${weapon.name} damage`, tags, roll),
    flags: { holocron: { damage: flag } },
  } as never);
  return (message as ChatMessage.Implementation | undefined) ?? null;
}
