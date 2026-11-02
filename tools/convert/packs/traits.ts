// Species traits' mechanics. A species carries each trait's text inline, and each trait with
// mechanics becomes one effect on the species, named for the trait, so a breakdown reads "Iron Will".
// Defense bonuses are read from the trait's own sentence ("Beings gain a +2 Species bonus to their
// Will Defense"), with its condition ("against Poisons and Toxic Atmospheres") kept on the change,
// and the fork's stored values are checked against it. Every fork change key is mapped or dropped
// with a reason; an unmapped key fails the run.

import { bonus, type ChangeOut } from "../lib/changes.ts";
import type { Report, SourceDoc } from "../lib/pack.ts";

const PACK = "species";

/** House changes a trait carries that the fork stores nowhere, each with the line that says so. */
const HOUSE_TRAIT_CHANGES: Record<string, { changes: ChangeOut[]; source: string }> = {
  Primitive: {
    changes: [bonus("languages.int", -4)],
    source: 'episode-vii, Languages: "A character with the Primitive Species trait is considered to have Intelligence 4 lower for the purposes of understanding and speaking languages."',
  },
};

/** Fork change keys a trait's effect does not carry, each with the reason. */
const DROPPED: Record<string, string> = {
  skillReRoll: "rerolls are text until the roll dialog applies them",
  provides: "a species bonus feat is a slot the sheet opens (M1); the trait names it",
  trainedSkills: "Bonus Trained Skill counts toward trained skills on the sheet (M1); the trait names it",
  weaponFamiliarity: "only the weapons in the Episode VII weapon tables exist (rulings.md, Equipment)",
  speed: "fly and swim speeds are text until tokens move by them",
  damageReduction: "species Damage Reduction applies with damage (M1)",
  appendages: "extra arms are text",
  disableAttributeModification: "Republic Clone's set ability array is entered on the sheet (M1)",
  baseStrength: "Republic Clone's set ability array is entered on the sheet (M1)",
  baseDexterity: "Republic Clone's set ability array is entered on the sheet (M1)",
  baseConstitution: "Republic Clone's set ability array is entered on the sheet (M1)",
  baseIntelligence: "Republic Clone's set ability array is entered on the sheet (M1)",
  baseWisdom: "Republic Clone's set ability array is entered on the sheet (M1)",
  baseCharisma: "Republic Clone's set ability array is entered on the sheet (M1)",
};

const DEFENSE_KEYS: Record<string, string> = { fortitudeDefenseBonus: "fortitude", reflexDefenseBonus: "reflex", willDefenseBonus: "will", damageThresholdBonus: "dt" };
/**
 * A standing bonus to a Defense or the Damage Threshold, as the trait texts write one: "a +2 Species
 * bonus to their Will Defense against ...", "a -5 penalty to their Fortitude Defense to resist ...",
 * "a +1 Species bonus to all their Defenses", "a +5 Species bonus to their Damage Threshold and a
 * +2 ...", "a +1 Natural Armor bonus to their Reflex Defense", "a +5 bonus to their Will Defense
 * when ...". "to Reflex Defense against any single attack" (Limited Precognition's reaction) is not
 * a standing bonus and does not match.
 */
const DEFENSE_CLAUSE = /([+-]\d+) (?:(Species|Natural Armor) )?(?:bonus|penalty) to (?:(all their Defenses)|their (Fortitude|Reflex|Will) Defense|(their Damage Threshold))((?: (?:against|to resist|when) [^.]+?)?)(?=\.| and a [+-]\d)/g;
const SWAP = /^MAX\(@\w+, ?@\w+\) - @\w+$/;

const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const changesOf = (doc: SourceDoc | undefined) => {
  const raw = doc?.system["changes"];
  return (Array.isArray(raw) ? raw : Object.values((raw ?? {}) as object)) as { key: string; value: unknown }[];
};

/** The changes a trait's effect carries. `name` is the trait as the species links it ("Natural Armor (+2)"). */
export function traitChanges(name: string, traitDoc: SourceDoc | undefined, description: string, species: SourceDoc, report: Report): ChangeOut[] {
  const out: ChangeOut[] = [];
  const fail = (message: string) => report.problem(PACK, species, `trait "${name}": ${message}`);
  const text = plain(description);
  const forkDefenses: string[] = [];
  for (const change of changesOf(traitDoc)) {
    const defense = DEFENSE_KEYS[change.key];
    if (defense) {
      if (SWAP.test(String(change.value))) report.note("dropped: ability swap (explicit code, not a bonus)", `${species.name}: ${name}`);
      else forkDefenses.push(`${defense} ${Number(change.value)}`);
    } else if (change.key === "naturalArmorReflexDefenseBonus") {
      // The amount is in the linked name; the text: "A being gains a Natural Armor bonus to their Reflex Defense."
      const amount = Number(/\(\+(\d+)\)$/.exec(name)?.[1]);
      if (!amount || !/Natural Armor bonus to their Reflex Defense/.test(text)) fail("natural armor without an amount in its name or the text that grants it");
      else out.push(bonus("defense.reflex", amount, "natural"));
    } else if (DROPPED[change.key]) {
      report.note(`dropped from species traits: ${DROPPED[change.key]}`, `${species.name}: ${name}`);
    } else {
      fail(`unmapped change ${change.key}: ${JSON.stringify(change.value).slice(0, 80)}`);
    }
  }

  const parsed: string[] = [];
  for (const m of text.matchAll(DEFENSE_CLAUSE)) {
    const [, value = "", type, all, defense, threshold, condition = ""] = m;
    const keys = all ? ["reflex", "fortitude", "will"] : threshold ? ["dt"] : [defense?.toLowerCase() ?? ""];
    const bonusType = type === "Species" ? "species" : type === "Natural Armor" ? "natural" : "";
    for (const key of keys) {
      parsed.push(`${key} ${Number(value)}`);
      out.push({ ...bonus(key === "dt" ? "dt" : `defense.${key}`, Number(value), bonusType), condition: condition.trim() });
    }
  }
  // The fork stores some bonuses twice (Environmental Adaptation); the text states each once. Where
  // the fork stores none, the text applies (Pheromone Acclimation); a stored value the text does not
  // state fails.
  const unique = (xs: string[]) => [...new Set(xs)].sort().join(", ");
  if (!forkDefenses.length && parsed.length) report.note("Defense bonuses from trait text the fork does not store", `${species.name}: ${name}: ${unique(parsed)}`);
  else if (unique(parsed) !== unique(forkDefenses)) fail(`text gives Defenses "${unique(parsed)}", the fork's changes "${unique(forkDefenses)}"`);

  const house = HOUSE_TRAIT_CHANGES[name];
  if (house) {
    out.push(...house.changes);
    report.note("house trait changes", `${species.name}: ${name}: ${house.source}`);
  }
  return out;
}
