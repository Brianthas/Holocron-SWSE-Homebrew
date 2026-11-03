import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHOICE_LISTS, CHOICE_LIST_KEYS } from "../src/config/choices.ts";
import { fillChoice, isChoiceSelector } from "../src/effects/selectors.ts";
import { choiceOptions, type ChoiceState } from "../src/rules/choices.ts";

const state = (over: Partial<ChoiceState> = {}): ChoiceState => ({
  proficient: new Set(["advancedMelee", "pistols", "rifles", "simple"]), taken: new Map(), trainedSkills: [{ key: "stealth", label: "Stealth" }, { key: "perception", label: "Perception" }],
  forms: ["Ataru", "Soresu"], formsHeld: new Set(), ...over,
});
const values = (list: Parameters<typeof choiceOptions>[0], s: ChoiceState) => choiceOptions(list, s).map((o) => o.value);

// The fork side (every option name the converted packs use maps to a list) is checked by the
// converter, which fails on one it cannot map; CI has no fork to read.
describe("choice lists", () => {
  it("draw only from lists that exist, and the converted packs name only known lists", () => {
    for (const key of CHOICE_LIST_KEYS) {
      const { from } = CHOICE_LISTS[key];
      if (Array.isArray(from)) expect(from.every((k) => (CHOICE_LIST_KEYS as readonly string[]).includes(k)), key).toBe(true);
    }
    const named = ["feats", "talents"].flatMap((pack) => readdirSync(`packs/_source/${pack}`)
      .map((f) => JSON.parse(readFileSync(`packs/_source/${pack}/${f}`, "utf8")).system.choiceList as string | undefined).filter(Boolean));
    expect(named.filter((k) => !(CHOICE_LIST_KEYS as readonly string[]).includes(k ?? ""))).toEqual([]);
  });
});

describe("filling {choice}", () => {
  it("puts the item's choice in the selector, gives null while unset, and leaves other keys alone", () => {
    expect([fillChoice("attack.group.{choice}", "rifles"), fillChoice("skill.{choice}", ""), fillChoice("defense.will", "")]).toEqual(["attack.group.rifles", null, "defense.will"]);
    expect([isChoiceSelector("attack.group.{choice}"), isChoiceSelector("skill.{choice}"), isChoiceSelector("attack.weapon.{choice}"), isChoiceSelector("attack.group.rifles")]).toEqual([true, true, false, false]);
  });
});

describe("choice options", () => {
  it("Weapon Focus offers proficient groups not yet focused; Weapon Proficiency the groups not proficient", () => {
    expect(values("weaponFocus", state({ taken: new Map([["weaponFocus", ["rifles"]]]) }))).toEqual(["simple", "advancedMelee", "pistols"]);
    expect(values("weaponProficiency", state())).toEqual(["lightsabers", "heavyWeapons"]);
  });
  it("a list built on another offers only that list's choices, less its own", () => {
    const s = state({ taken: new Map([["weaponFocus", ["pistols", "rifles"]], ["weaponSpecialization", ["pistols"]]]) });
    expect(values("weaponSpecialization", s)).toEqual(["rifles"]);
    expect(values("greaterWeaponSpecialization", s)).toEqual(["pistols"]);
    expect(values("tripleAttack", s)).toEqual([]);
  });
  it("Greater Devastating Attack needs both Devastating Attack and Greater Weapon Focus in the group", () => {
    const s = state({ taken: new Map([["devastatingAttack", ["pistols", "rifles"]], ["greaterWeaponFocus", ["rifles"]]]) });
    expect(values("greaterDevastatingAttack", s)).toEqual(["rifles"]);
  });
  it("skills come from trained skills, forms from the forms not held, exotic weapons from nothing", () => {
    expect(choiceOptions("skillFocus", state({ taken: new Map([["skillFocus", ["stealth"]]]) }))).toEqual([{ value: "perception", label: "Perception" }]);
    expect(values("lightsaberForms", state({ formsHeld: new Set(["Ataru"]) }))).toEqual(["Soresu"]);
    expect(values("exoticWeaponProficiency", state())).toEqual([]);
  });
});
