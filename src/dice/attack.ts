import type { CharacterModel, WeaponData } from "../data/actor/character.ts";
import type { Breakdown } from "../rules/modifiers.ts";

/** What an attack card records, so later cards and tests read results instead of re-deriving them. */
export interface AttackFlag {
  weapon: string;
  bonus: number;
  natural: number;
  total: number;
  targets: { name: string; uuid: string; reflex: number; hit: boolean }[];
}

const escape = (s: string) => foundry.utils.escapeHTML(s);

/** "1d20 + 1[Base attack bonus] + 2[DEX]": each term keeps its label in the roll. */
const labelledFormula = (die: string, parts: Breakdown) =>
  [die, ...parts.applied.filter((m) => m.value !== 0).map((m) => `${m.value < 0 ? "-" : "+"} ${Math.abs(m.value)}[${m.label}]`)].join(" ");

/**
 * Rolls a weapon attack against each targeted token's Reflex Defense. The attack hits when the
 * result equals or beats the defense; a natural 20 always hits and a natural 1 always misses (core
 * rulebook p144-145; rulings.md, Combat).
 */
export async function rollAttack(actor: Actor.Implementation, weapon: Item.Implementation): Promise<void> {
  const system = actor.system as CharacterModel;
  const parts = system.attackFor(weapon.system as WeaponData);
  const roll = await new Roll(labelledFormula("1d20", parts)).evaluate();
  const natural = roll.dice[0]?.total ?? 0;
  const total = roll.total ?? 0;

  const targets = [...game.user.targets].flatMap((token) => {
    const target = token.actor;
    const reflex = (target?.system as CharacterModel | undefined)?.defenses?.reflex?.total;
    if (!target || reflex === undefined) return [];
    const hit = natural === 20 || (natural !== 1 && total >= reflex);
    return [{ name: target.name, uuid: target.uuid ?? "", reflex, hit }];
  });

  const flag: AttackFlag = { weapon: weapon.name, bonus: parts.total, natural, total, targets };
  const rows = targets.map((t) => `<li class="target">${escape(t.name)}: Reflex ${t.reflex}, <b>${t.hit ? "hit" : "miss"}</b></li>`).join("");
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
    rolls: [roll],
    flavor: `${escape(weapon.name)}: attack`,
    content: targets.length ? `<ul class="holocron-targets">${rows}</ul>` : "<p>No target</p>",
    flags: { holocron: { attack: flag } },
  } as never);
}

/** Rolls a weapon's damage: weapon dice + the damage ability + half heroic level + bonuses. */
export async function rollDamage(actor: Actor.Implementation, weapon: Item.Implementation): Promise<void> {
  const system = actor.system as CharacterModel;
  const data = weapon.system as WeaponData & { damageTypes: string[] };
  const roll = await new Roll(system.damageFor(data).formula).evaluate();
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
    rolls: [roll],
    flavor: `${escape(weapon.name)}: damage${data.damageTypes.length ? ` (${escape(data.damageTypes[0] ?? "")})` : ""}`,
  } as never);
}
