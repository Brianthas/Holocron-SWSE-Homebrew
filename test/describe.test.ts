import { describe, expect, it } from "vitest";
import { describeChange } from "../src/effects/describe.ts";

describe("change descriptions", () => {
  it("name the amount, the bonus type, the target and the condition", () => {
    expect(describeChange({ key: "defense.reflex", type: "bonus", value: 1 })).toBe("+1 Reflex Defense");
    expect(describeChange({ key: "defense.will", type: "bonus", value: 2, bonusType: "species", condition: "against Mind-Affecting effects" }))
      .toBe("+2 species bonus to Will Defense against Mind-Affecting effects");
    expect(describeChange({ key: "attack.group.lightsabers", type: "bonus", value: 1 })).toBe("+1 attack with Lightsabers");
    expect(describeChange({ key: "damage.melee", type: "bonus", value: -2 })).toBe("-2 melee damage");
    expect(describeChange({ key: "skill.stealth", type: "bonus", value: 5 })).toBe("+5 Stealth");
    expect(describeChange({ key: "ability.str", type: "bonus", value: 2 })).toBe("+2 STR");
    expect(describeChange({ key: "hp.max", type: "bonus", value: "@level" })).toBe("+1 HP per level");
    expect(describeChange({ key: "hp.max", type: "bonus", value: "5 + @level" })).toBe("+(5 + @level) HP");
  });
  it("describe dice, grants and unknown keys", () => {
    expect(describeChange({ key: "damage.unarmed", type: "dice", value: 1 })).toBe("+1 die of unarmed damage");
    expect(describeChange({ key: "damage.all", type: "dice", value: 2 })).toBe("+2 dice of damage");
    expect(describeChange({ key: "flag", type: "grant", value: "extendedCapacity" })).toBe("Light and Kit slots doubled");
    expect(describeChange({ key: "skill.trained", type: "grant", value: "perception" })).toBe("Trained in Perception");
    expect(describeChange({ key: "mystery", type: "bonus", value: 3 })).toBe("mystery +3");
  });
});
