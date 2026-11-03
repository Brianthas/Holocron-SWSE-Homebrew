// The validator against the real packs/_source: the packs as converted pass, and each test breaks one
// document in one way and expects exactly the problem that names it, so every check is shown able to fail.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLEANUP_MARKERS, SYSTEM, validatePacks, type PackFile, type SystemManifest } from "../tools/convert/lib/validate.ts";

const ROOT = fileURLToPath(new URL("../packs/_source", import.meta.url));
const PACKS: PackFile[] = readdirSync(ROOT).sort().flatMap((pack) => readdirSync(join(ROOT, pack)).filter((f) => f.endsWith(".json")).sort()
  .map((file) => ({ pack, file, doc: JSON.parse(readFileSync(join(ROOT, pack, file), "utf8")) as unknown })));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures reach into parsed JSON
type Doc = any;
/** The real packs with one document copied and changed; `rename` moves it to another file name. */
function broken(at: string, change: (doc: Doc) => void, rename?: string): string[] {
  const [pack, file] = at.split("/");
  const target = PACKS.find((f) => f.pack === pack && f.file === file);
  if (!target) throw new Error(`no fixture ${at}`);
  const doc = structuredClone(target.doc) as Doc;
  change(doc);
  return validatePacks(PACKS.map((f) => (f === target ? { pack: f.pack, file: rename ?? f.file, doc } : f))).problems;
}
const doc = (at: string): Doc => PACKS.find((f) => `${f.pack}/${f.file}` === at)?.doc;
const TOUGHNESS = "feats/toughness.json";
/** Toughness's second change: hp.max +5, typed "toughness". */
const change = (d: Doc) => d.effects[0].system.changes[1];

describe("the validator on the converted packs", () => {
  it("passes them, having read documents, effects and changes", () => {
    const result = validatePacks(PACKS);
    expect(result.problems).toEqual([]);
    expect(PACKS.length).toBeGreaterThan(2000);
    expect(result.effects).toBeGreaterThan(0);
    expect(result.changes).toBeGreaterThan(result.effects - 1);
  });
});

describe("the validator's document checks", () => {
  it("rejects an id another document uses", () => {
    const other = doc("feats/linguist.json")._id;
    expect(broken(TOUGHNESS, (d) => { d._id = other; d._key = `!items!${other}`; for (const e of d.effects) e._key = `!items.effects!${other}.${e._id}`; }))
      .toEqual([`feats/toughness.json: _id ${other} also used by feats/linguist.json`]);
  });
  it("rejects an id outside Foundry's form", () => {
    expect(broken(TOUGHNESS, (d) => { d._id = "short"; d._key = "!items!short"; for (const e of d.effects) e._key = `!items.effects!short.${e._id}`; }))
      .toEqual(['feats/toughness.json: _id "short" is not 16 letters and digits']);
  });
  it("rejects a _key that does not match the id", () => {
    expect(broken(TOUGHNESS, (d) => { d._key = "!items!AAAAAAAAAAAAAAAA"; })).toEqual(['feats/toughness.json: _key "!items!AAAAAAAAAAAAAAAA" does not match _id']);
  });
  it("rejects a type system.json does not register, and one that differs from its pack", () => {
    expect(broken(TOUGHNESS, (d) => { d.type = "feet"; })).toEqual([
      'feats/toughness.json: type "feet" is not an item type in system.json',
      'feats/toughness.json: type "feet" in a pack of feat',
    ]);
  });
  it("rejects an extra top-level key", () => {
    expect(broken(TOUGHNESS, (d) => { d.ownership = {}; })).toEqual([
      "feats/toughness.json: top-level keys _id,_key,effects,flags,folder,name,ownership,sort,system,type, expected _id,_key,effects,flags,folder,name,sort,system,type",
    ]);
  });
  it("rejects a file name the converter would not write", () => {
    expect(broken(TOUGHNESS, () => {}, "toughness-2.json")).toEqual(["feats/toughness-2.json: file should be toughness.json"]);
  });
  it("rejects a name with spaces around it", () => {
    expect(broken(TOUGHNESS, (d) => { d.name = "Toughness "; }, "toughness.json")).toEqual(['feats/toughness.json: name "Toughness "']);
  });
  it("rejects a description that is not a string", () => {
    expect(broken(TOUGHNESS, (d) => { d.system.description = null; })).toEqual(["feats/toughness.json: system.description is not a string"]);
  });
  it("rejects a flag outside flags.holocron", () => {
    expect(broken(TOUGHNESS, (d) => { d.flags.swse = {}; })).toEqual(["feats/toughness.json: flags holocron,swse, expected holocron only"]);
  });
  it("rejects two documents converted from one fork document", () => {
    const sourceId = doc("feats/linguist.json").flags.holocron.sourceId;
    expect(broken(TOUGHNESS, (d) => { d.flags.holocron.sourceId = sourceId; })).toEqual(["feats/toughness.json: converted from the same fork document as feats/linguist.json"]);
  });
  it("rejects a document whose system keys differ from the rest of its type", () => {
    expect(broken(TOUGHNESS, (d) => { delete d.system.repeatable; d.system.stacks = true; }))
      .toEqual(["feats/toughness.json: system keys differ from the other feat items (missing repeatable; extra stacks)"]);
  });
  it("rejects a power the house rules remove", () => {
    // Assured Strike: no technique names it, so the rename breaks nothing else.
    expect(broken("force-powers/assured-strike.json", (d) => { d.name = "Cloak"; }, "cloak.json"))
      .toEqual(["force-powers/cloak.json: the house rules remove this power or its technique (tools/convert/rules.ts)"]);
    expect(broken("force-techniques/cure-disease.json", (d) => { d.name = "Improved Dark Transfer"; d.system.power = ""; }, "improved-dark-transfer.json"))
      .toEqual(["force-techniques/improved-dark-transfer.json: the house rules remove this power or its technique (tools/convert/rules.ts)"]);
  });
});

describe("the validator's cleanup markers", () => {
  // One string per marker, in the form the fork writes it.
  const SAMPLES: Record<string, string> = {
    "the wiki's Reference Book line": "<p><i>Reference Book: Star Wars Saga Edition Core Rulebook</i></p>",
    "the wiki's See also line": "<i>See also: Saber Lock</i><br><br>",
    "the wiki's wrapper": '<div class="mw-parser-output"><p>Text</p></div>',
    "the wiki's styling hooks": '<table class="wikitable"><tr><td>15</td></tr></table>',
    "a link": '<a href="https://swse.fandom.com/wiki/Move_Object">Move Object</a>',
    "a wiki address": "https://swse.fandom.com/wiki/Move_Object",
    "a house-rule label": "(tovec.wikidot.com/episode-vii)",
    "a Homebrew label or section": "<h2>Homebrew Long Haft Strike Data</h2>",
    "the wiki's untested fan-content notice": "This Homebrew Content has not been reviewed in a meaningful manner.",
    "the wiki's tested fan-content notice": "This Homebrew Content has been Tested per the Untested guidelines.",
    "the notice pointing at a fan page": "You may be looking for the Homebrew Content Feat of the same name.",
    "a fan creator's tag": "SunsetMage001 Creations",
  };
  it("has a sample for every marker", () => {
    expect(Object.keys(SAMPLES).sort()).toEqual(CLEANUP_MARKERS.map(([what]) => what).sort());
  });
  for (const [what, marker] of CLEANUP_MARKERS) {
    it(`finds ${what}`, () => {
      const sample = SAMPLES[what] ?? "";
      const problems = broken(TOUGHNESS, (d) => { d.system.description += sample; });
      expect(problems).toContain(`feats/toughness.json: ${what} is left in the text`);
      // The sample can carry other markers ("Homebrew" in a fan notice); each problem names one the sample holds.
      for (const p of problems) {
        const named = CLEANUP_MARKERS.find(([w]) => p === `feats/toughness.json: ${w} is left in the text`);
        expect(named?.[1].test(sample), p).toBe(true);
      }
      expect(marker.test(sample)).toBe(true);
    });
  }
  it("reads text below the description too: a species trait", () => {
    expect(broken("species/human.json", (d) => { d.system.traits[0].description += "<a href='x'>y</a>"; })).toEqual(["species/human.json: a link is left in the text"]);
  });
});

describe("the validator's effect and change checks", () => {
  it("rejects an effect that does not transfer", () => {
    expect(broken(TOUGHNESS, (d) => { d.effects[0].transfer = false; })).toEqual(["feats/toughness.json: effect must transfer and not be disabled"]);
  });
  it("rejects an effect type src/holocron.ts does not register", () => {
    expect(broken(TOUGHNESS, (d) => { d.effects[0].type = "holocron"; })).toEqual(['feats/toughness.json: effect type "holocron", expected "base"']);
  });
  it("rejects an effect _key that does not match its ids", () => {
    expect(broken(TOUGHNESS, (d) => { d.effects[0]._key = "!items.effects!x.y"; })).toEqual(['feats/toughness.json: effect _key "!items.effects!x.y" does not match its ids']);
  });
  it("rejects an effect with no changes", () => {
    expect(broken(TOUGHNESS, (d) => { d.effects[0].system.changes = []; })).toEqual(["feats/toughness.json: effect system must hold a non-empty changes list"]);
  });
  it("rejects a change type with no handler", () => {
    expect(broken(TOUGHNESS, (d) => { change(d).type = "add"; }))
      .toEqual(['feats/toughness.json: change "hp.max": only a bonus takes a bonus type', 'feats/toughness.json: change "hp.max": change type "add" is not bonus, grant or dice (src/effects/changes.ts)']);
  });
  it("rejects a selector outside the grammar", () => {
    expect(broken(TOUGHNESS, (d) => { change(d).key = "hp.maximum"; })).toEqual(['feats/toughness.json: change "hp.maximum": not a bonus selector (src/effects/selectors.ts)']);
  });
  it("rejects {choice} on an item with no choice list, and one that is no selector once filled", () => {
    expect(broken(TOUGHNESS, (d) => { change(d).key = "skill.{choice}"; })).toEqual(['feats/toughness.json: change "skill.{choice}": names {choice}, but the item has no choice list']);
    expect(broken("feats/weapon-focus.json", (d) => { d.effects[0].system.changes[0].key = "attack.weapon.{choice}"; }))
      .toEqual(['feats/weapon-focus.json: change "attack.weapon.{choice}": not a bonus selector once its choice is filled (src/effects/selectors.ts)']);
  });
  it("rejects a bonus in the wrong phase, either way", () => {
    expect(broken(TOUGHNESS, (d) => { change(d).phase = "initial"; })).toEqual(['feats/toughness.json: change "hp.max": phase "initial", expected "derived"']);
    expect(broken("armor/power-armor.json", (d) => { d.effects[0].system.changes[0].phase = "derived"; })).toEqual(['armor/power-armor.json: change "ability.str": phase "derived", expected "initial"']);
  });
  it("rejects a bonus value that is neither a number nor a formula", () => {
    expect(broken(TOUGHNESS, (d) => { change(d).value = "five"; })).toEqual(['feats/toughness.json: change "hp.max": value "five" is neither a number nor a formula']);
  });
  it("rejects a bonus type the item's text never states", () => {
    expect(broken(TOUGHNESS, (d) => { change(d).bonusType = "morale"; })).toEqual(['feats/toughness.json: change "hp.max": bonus type "morale" is not stated in the item\'s name or text']);
  });
  it("rejects a condition or bonus type on a change that is not a bonus", () => {
    const grant = (d: Doc) => d.effects[0].system.changes[0];
    expect(broken("feats/extended-capacity.json", (d) => { grant(d).condition = "while carrying"; })).toEqual(['feats/extended-capacity.json: change "flag": only a bonus takes a condition']);
    expect(broken("feats/extended-capacity.json", (d) => { grant(d).bonusType = "equipment"; })).toEqual(['feats/extended-capacity.json: change "flag": only a bonus takes a bonus type']);
  });
  it("rejects a grant kind, skill or flag nothing reads", () => {
    const grant = (d: Doc) => d.effects[0].system.changes[0];
    expect(broken("feats/extended-capacity.json", (d) => { grant(d).key = "skills.trained"; })).toEqual(['feats/extended-capacity.json: change "skills.trained": not a grant kind (src/effects/selectors.ts)']);
    expect(broken("feats/extended-capacity.json", (d) => { grant(d).key = "skill.trained"; grant(d).value = "climb"; })).toEqual(['feats/extended-capacity.json: change "skill.trained": "climb" is not a skill key']);
    expect(broken("feats/extended-capacity.json", (d) => { grant(d).value = "extendedCapacty"; })).toEqual(['feats/extended-capacity.json: change "flag": no code reads the flag "extendedCapacty"']);
    expect(broken("feats/extended-capacity.json", (d) => { grant(d).key = "proficiency.weapon"; grant(d).value = "pistols"; })).toEqual(['feats/extended-capacity.json: change "proficiency.weapon": no code reads proficiency.weapon grants yet']);
  });
  it("rejects extra dice that are not whole or not on damage", () => {
    const dice = (d: Doc) => d.effects[0].system.changes[0];
    expect(broken("feats/martial-arts-i.json", (d) => { dice(d).value = 1.5; })).toEqual(['feats/martial-arts-i.json: change "damage.unarmed": value 1.5 is not a whole number of dice']);
    expect(broken("feats/martial-arts-i.json", (d) => { dice(d).key = "attack.unarmed"; })).toEqual(['feats/martial-arts-i.json: change "attack.unarmed": not a damage selector']);
  });
  it("rejects a change with a field the change schema does not have", () => {
    expect(broken(TOUGHNESS, (d) => { change(d).priority = 20; }))
      .toEqual(['feats/toughness.json: change "hp.max": keys bonusType,condition,key,phase,priority,type,value, expected bonusType,condition,key,phase,type,value']);
  });
});

describe("the validator's pack list", () => {
  it("rejects a pack folder system.json does not declare, and a declared pack left empty", () => {
    const armor = PACKS.filter((f) => f.pack === "armor");
    const moved = PACKS.map((f) => (f.pack === "armor" ? { ...f, pack: "armour" } : f));
    expect(armor.length).toBeGreaterThan(0);
    expect(validatePacks(moved).problems).toEqual([
      'system.json: pack "armor" has no documents in packs/_source',
      "armour: not a pack in system.json",
    ]);
  });
  it("rejects a declared pack Foundry would drop or misplace: wrong type, system or path, and a pack in no folder or two", () => {
    const manifest = (change: (m: SystemManifest) => void) => { const m = structuredClone(SYSTEM); change(m); return validatePacks(PACKS, m).problems; };
    const armor = (m: SystemManifest) => m.packs.find((p) => p.name === "armor") ?? m.packs[0]!;
    const shape = 'system.json: pack "armor" must be type Item, system holocron, path packs/armor';
    expect(manifest((m) => { delete armor(m).system; })).toEqual([shape]);
    expect(manifest((m) => { armor(m).type = "Actor"; })).toEqual([shape]);
    expect(manifest((m) => { armor(m).path = "packs/armour"; })).toEqual([shape]);
    expect(manifest((m) => { m.packFolders = []; })).toEqual(SYSTEM.packs.map((p) => `system.json: pack "${p.name}" is in 0 pack folders, expected 1`));
    expect(manifest((m) => { m.packFolders?.[0]?.folders?.[0]?.packs?.push("armor"); })).toEqual(['system.json: pack "armor" is in 2 pack folders, expected 1']);
    expect(manifest((m) => { m.packFolders?.[0]?.folders?.[0]?.packs?.push("vehicles"); })).toEqual(['system.json: pack folder names "vehicles", which is not a pack']);
  });
});

describe("the validator's references and house table", () => {
  it("rejects a class tree with no talents, and a banned tree", () => {
    expect(broken("classes/jedi.json", (d) => { d.system.talentTrees.push("Jedi Guardians"); })).toEqual(['classes/jedi.json: tree "Jedi Guardians" has no talents']);
    expect(broken("classes/jedi.json", (d) => { d.system.talentTrees.push("Zeison Sha"); })).toEqual(['classes/jedi.json: grants the banned tree "Zeison Sha"']);
  });
  it("rejects a class talent or starting feat that does not exist", () => {
    expect(broken("classes/jedi-master.json", (d) => { d.system.talents.push("Many Shades"); })).toEqual(['classes/jedi-master.json: talent "Many Shades" is not a talent']);
    expect(broken("classes/jedi.json", (d) => { d.system.startingFeat = "Force Sensitive"; })).toEqual([
      'classes/jedi.json: starting feat "Force Sensitive" is not a feat',
      'classes/jedi.json: startingFeat "Force Sensitive", house class table "Force Sensitivity"',
    ]);
  });
  it("rejects a technique whose power does not exist", () => {
    expect(broken("force-techniques/cure-disease.json", (d) => { d.system.power = "Vital Transfers"; })).toEqual(['force-techniques/cure-disease.json: power "Vital Transfers" is not a Force power']);
  });
  it("rejects a base class that differs from the house class table, field by field", () => {
    expect(broken("classes/noble.json", (d) => { d.system.hpFirstLevel = 24; })).toEqual(["classes/noble.json: hpFirstLevel 24, house class table 18"]);
    expect(broken("classes/noble.json", (d) => { d.system.hitDie = 8; })).toEqual(["classes/noble.json: hitDie 8, house class table 6"]);
    expect(broken("classes/noble.json", (d) => { d.system.trainedSkills = 5; })).toEqual(["classes/noble.json: trainedSkills 5, house class table 6"]);
    expect(broken("classes/noble.json", (d) => { d.system.weaponProficiencies.push("rifles"); }))
      .toEqual(['classes/noble.json: weaponProficiencies "advancedMelee, pistols, rifles, simple", house class table "advancedMelee, pistols, simple"']);
  });
  it("rejects a pack missing a base class from the house class table", () => {
    expect(broken("classes/smuggler.json", (d) => { d.system.category = "prestige"; })).toEqual(["classes: Smuggler is in the house class table but not in the pack as a base class"]);
  });
});
