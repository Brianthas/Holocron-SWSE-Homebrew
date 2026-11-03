// Feats. The fork stores a feat's mechanics as changes on the item (survey, 2026-10-17: 41 keys
// over 365 feats). Each key below is mapped to a Holocron change, read into a field, or dropped
// with its reason; any other key fails the run. Mechanics the house rules give a feat and the fork
// does not carry come from HOUSE_CHANGES, each with the line that states it.

import {
  attachEffect, bonus, choiceListOf, dice, dropped, exact, flatOrSwap, grant, isFanContent, number, runChanges,
  type ChangeOut, type Context, type Mapper, type Prerequisite,
} from "../lib/changes.ts";
import { cleanDescription, rewriteParagraphs } from "../lib/html.ts";
import { slugify } from "../lib/ids.ts";
import { checkKeys, itemDoc, readPack, type OutputDoc, type Report } from "../lib/pack.ts";

const PACK = "feats";

/** Changes the house rules give a feat that the fork's data does not. */
export const HOUSE_CHANGES: Record<string, { changes: ChangeOut[]; source: string }> = {
  "Force Sensitivity": { changes: [bonus("forcePoints", 1)], source: 'episode-vii, The Force: "Characters with Force Sensitivity gain 1 extra Force Point per day."' },
  "Force Boon": { changes: [bonus("forcePoints", 2)], source: 'episode-vii, The Force: "Force Boon gain 2 extra Force Points per day."' },
  "Linguist": { changes: [bonus("languages.int", 4)], source: 'episode-vii, Languages: "Linguist effectively considers the Intelligence of the character to be 4 higher"' },
};
/**
 * Paragraphs the house rules rewrite: each entry replaces one paragraph of the cleaned text, and
 * the run fails if that paragraph is not there, so a change in the fork's text cannot slip past.
 * An empty replacement removes the paragraph.
 */
const MARTIAL_ARTS_SPECIAL = "<p><b>Special:</b> A situation that makes you lose your Dexterity bonus to Reflex Defense (";
export const HOUSE_TEXT: Record<string, { replace: [string, string][]; source: string }> = {
  "Martial Arts I": {
    replace: [
      ["<p><b>Effect:</b> Damage dealt by your Unarmed Attacks increases by one die step.", "<p><b>Effect:</b> Your Unarmed attacks deal one more die of damage. Additionally, you do not provoke Attacks of Opportunity with Unarmed Attacks.</p>"],
      [MARTIAL_ARTS_SPECIAL, ""],
    ],
    source: "rulings.md, Attacks: no dodge bonus, one die per feat",
  },
  "Martial Arts II": {
    replace: [
      ["<p><b>Effect:</b> Damage dealt by your Unarmed attacks increases by one die step.", "<p><b>Effect:</b> Your Unarmed attacks deal one more die of damage, in addition to Martial Arts I.</p>"],
      [MARTIAL_ARTS_SPECIAL, ""],
    ],
    source: "rulings.md, Attacks: no dodge bonus, one die per feat",
  },
  "Martial Arts III": {
    replace: [
      ["<p><b>Effect:</b> Damage dealt by your Unarmed attacks increases by one die step.", "<p><b>Effect:</b> Your Unarmed attacks deal one more die of damage, in addition to Martial Arts I and II.</p>"],
      [MARTIAL_ARTS_SPECIAL, ""],
    ],
    source: "rulings.md, Attacks: no dodge bonus, one die per feat",
  },
};

/** Repeatable by the house rules though the fork does not mark it. */
const HOUSE_REPEATABLE: Record<string, string> = {
  "Toughness": 'episode-vii, Feats: "You can take Toughness more than once."',
};

const CHOICE = "choice feat: its change needs the chosen weapon or skill in its selector, which the grammar does not have yet";
const ACTION = "an attack or action option, applied by the card that uses it";

export const FEAT_KEYS: Record<string, Mapper> = {
  reflexDefenseBonus: flatOrSwap("defense.reflex"),
  fortitudeDefenseBonus: flatOrSwap("defense.fortitude"),
  willDefenseBonus: flatOrSwap("defense.will"),
  damageThresholdBonus: flatOrSwap("dt"),
  bonusDodgeReflexDefense: dropped("Martial Arts gives no dodge bonus (rulings.md, Attacks)"),
  bonusUnarmedDamageDieCount: (value, ctx) => {
    const n = number(value);
    if (n === null) return ctx.fail(`bonusUnarmedDamageDieCount ${JSON.stringify(value)}`);
    ctx.changes.push(dice("damage.unarmed", n));
  },
  // Toughness: 5 once however many times it is taken (typed, so copies do not stack), 1 per level
  // per copy, and +1 to healing received (episode-vii, Feats).
  hitPointFlatBonus: exact(5, (_v, ctx) => ctx.changes.push(bonus("hp.max", 5, "toughness"))),
  hitPointEq: exact("@charLevel", (_v, ctx) => ctx.changes.push(bonus("hp.max", "@level"))),
  healingReceivedBonus: exact(1, (_v, ctx) => ctx.changes.push(bonus("healing.received", 1))),
  bonusSecondWind: exact("1", (_v, ctx) => ctx.changes.push(bonus("secondWind", 1))),
  capacitySlotMultiplier: exact(2, (_v, ctx) => ctx.changes.push(grant("flag", "extendedCapacity"))),
  takeMultipleTimes: (value, ctx) => {
    if (value === true || value === "true") ctx.repeatable = true;
    else ctx.fail(`takeMultipleTimes ${JSON.stringify(value)}`);
  },
  // The fork's own homebrew marker; isFanContent excludes these by category before mapping.
  isHomebrew: (_v, ctx) => ctx.fail("isHomebrew on a feat that is not excluded"),
  weaponFocus: dropped(CHOICE),
  greaterWeaponFocus: dropped(CHOICE),
  weaponSpecialization: dropped(CHOICE),
  greaterWeaponSpecialization: dropped(CHOICE),
  skillFocus: dropped(CHOICE),
  weaponProficiency: dropped(CHOICE),
  trainedSkills: dropped("Skill Training: the skill is the player's choice, made on the sheet"),
  armorProficiency: dropped("nothing reads armor proficiency yet"),
  skillReRoll: dropped("rerolls are text until the roll dialog applies them"),
  skillSubstitutionAlways: dropped("Gather Information is not a house skill"),
  skillAttribute: dropped("Force of Personality swaps Will Defense, not Use the Force (rulings.md)"),
  applyBonusTo: dropped("redirects an armor Fortitude bonus; the house armor table gives none (episode-vii, Equipment)"),
  tempForcePoint: dropped("a per-use effect, applied by the card that uses it"),
  implantTraining: dropped("implants are not modelled yet"),
  forceSensitivity: dropped("Force Sensitivity's access and Force Points come from the rules (HOUSE_CHANGES, rulings.md)"),
  bonusTalentTree: dropped("tree access comes from rulings.md, not pack data"),
  forceTraining: dropped("Force power slots are counted by the sheet (Mockup 3)"),
  provides: dropped("Force power and regimen slots are counted by the sheet (Mockup 3)"),
  dualWeaponModifier: dropped(ACTION),
  relentlessAttack: dropped(ACTION),
  autofireAssault: dropped(ACTION),
  autofireSweep: dropped(ACTION),
  criticalStrike: dropped(ACTION),
  doubleAttack: dropped(ACTION),
  tripleAttack: dropped(ACTION),
  savageAttack: dropped(ACTION),
  halt: dropped(ACTION),
  returnFire: dropped(ACTION),
};

/** Prerequisites the house rules change. */
const HOUSE_PREREQUISITES: Record<string, { apply: (p: Prerequisite | null) => Prerequisite | null; source: string }> = {
  "Force Sensitivity": {
    apply: () => null,
    source: 'episode-vii, Feats: "Ignore the prerequisite for Force Sensitivity. Anyone can take it, including non-force sensitives and Droids."',
  },
  // Text only: the check against level 10 is the sheet's, and the justification is the GM's.
  "Skill Focus": {
    apply: (p) => ({ ...(p ?? {}), text: `${p?.text ?? ""}; for Use the Force, also level 10 and a justification`.replace(/^; /, "") }),
    source: 'episode-vii, Jedi: "Skill Focus for Use the Force requires level 10 and a justification."',
  },
};

/** Documents in the fork's feats pack that are not feats. */
const NOT_FEATS: Record<string, string> = {
  "Bonus Feats by Class": "a wiki category page, not a feat; the house rules drop per-class feat lists",
};

export function convertFeats(report: Report): OutputDoc[] {
  const out: OutputDoc[] = [];
  for (const doc of readPack(PACK)) {
    if (isFanContent(doc)) {
      report.exclude(PACK, doc, "Homebrew Content or a fan creator's tag (rulings.md, Content)");
      continue;
    }
    const notFeat = NOT_FEATS[doc.name];
    if (notFeat) {
      report.exclude(PACK, doc, notFeat);
      continue;
    }
    // possibleProviders and categories list class bonus-feat lists, which the house rules drop
    // ("There is no longer a list of feats per class", episode-vii, Feats); choices describes the
    // fork's choice dialog, which the sheet replaces.
    checkKeys(PACK, doc, { mapped: ["description", "changes", "categories", "possibleProviders", "choices", "prerequisite", "source"], constant: { cost: "0" } }, report);
    const ctx: Context = {
      name: doc.name, changes: [], repeatable: false, maxTimes: 0,
      drop: (reason) => report.note(`dropped: ${reason}`, doc.name),
      fail: (message) => report.problem(PACK, doc, message),
    };
    runChanges(doc, FEAT_KEYS, ctx);
    const house = HOUSE_CHANGES[doc.name];
    if (house) {
      ctx.changes.push(...house.changes);
      report.note("house changes", `${doc.name}: ${house.source}`);
    }
    if (HOUSE_REPEATABLE[doc.name]) ctx.repeatable = true;

    const cleaned = cleanDescription(String(doc.system["description"] ?? ""));
    report.sections(PACK, doc, cleaned);
    let { html } = cleaned;
    const { sourceBook } = cleaned;
    const houseText = HOUSE_TEXT[doc.name];
    if (houseText) {
      const rewritten = rewriteParagraphs(html, houseText.replace);
      for (const prefix of rewritten.missing) report.problem(PACK, doc, `house text: no paragraph starts ${JSON.stringify(prefix.slice(0, 60))}`);
      html = rewritten.html;
      report.note("house text", `${doc.name}: ${houseText.source}`);
    }
    let prerequisite = (doc.system["prerequisite"] ?? null) as Prerequisite | null;
    const housePrerequisite = HOUSE_PREREQUISITES[doc.name];
    if (housePrerequisite) {
      prerequisite = housePrerequisite.apply(prerequisite);
      report.note("house prerequisites", `${doc.name}: ${housePrerequisite.source}`);
    }
    const seed = `${PACK}:${slugify(doc.name)}`;
    const item = itemDoc(seed, doc.name, "feat", {
      description: html,
      prerequisite: { text: prerequisite?.text ?? "", nodes: prerequisite && Object.keys(prerequisite).length ? prerequisite : null },
      repeatable: ctx.repeatable,
      choice: "",
      choiceList: choiceListOf(doc, report, PACK),
    }, doc, { sourceBook: String(doc.system["source"] ?? "") || sourceBook });
    attachEffect(item, seed, ctx.changes);
    out.push(item);
  }
  return out;
}
