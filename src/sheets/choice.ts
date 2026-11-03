import { CHOICE_LISTS, CHOICE_LIST_KEYS, type ChoiceListKey } from "../config/choices.ts";
import { SKILLS, SKILL_KEYS, type SkillKey } from "../config/skills.ts";
import { WEAPON_GROUPS, type WeaponGroupKey } from "../config/weapons.ts";
import type { CharacterModel } from "../data/actor/character.ts";
import { choiceOptions, type ChoiceOption, type ChoiceState } from "../rules/choices.ts";

/**
 * Choice feats and talents (config/choices.ts): the list an item offers, the choice state read off a
 * character, the dialog that asks, and the label a stored choice shows as ("Weapon Focus (Rifles)").
 */
const escape = (s: string) => foundry.utils.escapeHTML(s);

export function choiceListOf(item: { type: string; system: unknown }): ChoiceListKey | null {
  if (item.type !== "feat" && item.type !== "talent") return null;
  const list = (item.system as { choiceList?: string }).choiceList ?? "";
  return (CHOICE_LIST_KEYS as readonly string[]).includes(list) ? (list as ChoiceListKey) : null;
}

/** A stored choice as a player reads it: a weapon group's or skill's name, or the value itself (a form). */
export function choiceLabel(value: string): string {
  return WEAPON_GROUPS[value as WeaponGroupKey] ?? SKILLS[value as SkillKey]?.label ?? value;
}

/** An item's name with its choice, as the fork shows it ("Weapon Focus (Rifles)"). */
export function nameWithChoice(item: { name: string | null; system: unknown }): string {
  const choice = (item.system as { choice?: string }).choice ?? "";
  return choice ? `${item.name} (${choiceLabel(choice)})` : item.name ?? "";
}

async function choiceState(actor: Actor.Implementation): Promise<ChoiceState> {
  const s = actor.system as CharacterModel;
  const taken = new Map<string, string[]>();
  for (const item of actor.items) {
    const list = choiceListOf(item);
    const choice = (item.system as { choice?: string }).choice ?? "";
    if (list && choice) taken.set(list, [...(taken.get(list) ?? []), choice]);
  }
  const classGroups = Object.keys(s.classLevels).flatMap((id) => (actor.items.get(id)?.system as { weaponProficiencies?: string[] } | undefined)?.weaponProficiencies ?? []);
  const index = await game.packs?.get("holocron.talents")?.getIndex({ fields: ["system.tree"] } as never);
  const forms = [...(index ?? [])].filter((e) => (e as { system?: { tree?: string } }).system?.tree === "Lightsaber Forms").map((e) => e.name ?? "");
  return {
    proficient: new Set([...classGroups, ...(taken.get("weaponProficiency") ?? [])]),
    taken,
    trainedSkills: SKILL_KEYS.filter((k) => s.isTrained(k)).map((k) => ({ key: k, label: SKILLS[k].label })),
    forms,
    formsHeld: new Set(actor.items.filter((i) => i.type === "talent").map((i) => i.name ?? "")),
  };
}

/**
 * Asks which choice an item is taken for. Null when cancelled, or when the list offers nothing (the
 * fork said "You Must Be Proficient in a weapon group..." and added nothing; this says why too).
 */
export async function askChoice(actor: Actor.Implementation, item: { name: string | null; type: string; system: unknown }): Promise<ChoiceOption | null> {
  const list = choiceListOf(item);
  if (!list) return null;
  const options = choiceOptions(list, await choiceState(actor));
  if (!options.length) {
    const from = CHOICE_LISTS[list].from;
    ui.notifications?.warn(`${item.name}: ${actor.name} has nothing to choose (${typeof from === "string" ? NO_OPTIONS[from] : NO_OPTIONS.list}).`);
    return null;
  }
  const content = `<div class="holocron-choice"><label>${escape(item.name ?? "")} for
    <select name="choice">${options.map((o) => `<option value="${escape(o.value)}">${escape(o.label)}</option>`).join("")}</select></label></div>`;
  const value = await foundry.applications.api.DialogV2.wait({
    window: { title: `Choose: ${item.name}` },
    content,
    buttons: [
      { action: "ok", label: "Choose", default: true, callback: (_e: Event, button: HTMLButtonElement) => ((button.form as HTMLFormElement).elements.namedItem("choice") as HTMLSelectElement).value },
      { action: "cancel", label: "Cancel" },
    ],
    rejectClose: false,
  } as never) as unknown;
  return options.find((o) => o.value === value) ?? null;
}

const NO_OPTIONS = {
  proficient: "no weapon group it is proficient with that is not already chosen",
  notProficient: "proficient with every weapon group",
  exotic: "the house weapon table has no exotic weapons",
  trainedSkills: "no trained skill that is not already chosen",
  lightsaberForms: "every Lightsaber Form already",
  list: "nothing taken for the feat or talent this one builds on",
} as const;
