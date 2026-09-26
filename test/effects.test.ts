import { describe, expect, it } from "vitest";
import { isGrantKind, isSelector } from "../src/effects/selectors.ts";
import { addDice, weaponDamage } from "../src/rules/attacks.ts";
import { total, untyped } from "../src/rules/modifiers.ts";

describe("selector grammar", () => {
  it("accepts the selectors statistics read", () => {
    const good = ["defense.reflex", "defense.will", "dt", "hp.max", "skill.stealth", "skill.useTheForce", "skill.all",
      "attack.all", "attack.ranged", "attack.group.pistols", "damage.unarmed", "damage.group.lightsabers", "ability.dex",
      "speed", "healing.received"];
    expect(good.filter((s) => !isSelector(s))).toEqual([]);
  });
  it("rejects the fork's keys, misspellings and unknown groups", () => {
    const bad = ["reflexDefenseBonus", "defense.ref", "defense.all", "skill.climb", "skill.Stealth", "attack.group.grenades",
      "attack.group.Pistols", "damage", "system.defenses.reflex", ""];
    expect(bad.filter((s) => isSelector(s))).toEqual([]);
  });
  it("knows the grant kinds", () => {
    expect(["proficiency.weapon", "proficiency.armor", "skill.trained"].every(isGrantKind)).toBe(true);
    expect(isGrantKind("weaponProficiency")).toBe(false);
  });
});

describe("conditional bonuses (shown, never totalled)", () => {
  it("leaves a conditional bonus out of the total and lists it", () => {
    const result = total([untyped("Base", 10), { label: "Defensive Acuity", value: 2, type: "circumstance", condition: "while fighting defensively" }]);
    expect(result.total).toBe(10);
    expect(result.situational.map((m) => m.label)).toEqual(["Defensive Acuity"]);
  });
  it("does not let a conditional bonus beat an unconditional one of the same type", () => {
    const result = total([
      { label: "A", value: 1, type: "morale" },
      { label: "B", value: 3, type: "morale", condition: "against the dark side" },
    ]);
    expect(result.total).toBe(1);
    expect(result.suppressed).toEqual([]);
  });
});

describe("extra damage dice", () => {
  it("adds dice of the weapon's own size", () => {
    expect(addDice("3d6", 1)).toBe("4d6");
    expect(addDice("1d8", 2)).toBe("3d8");
    expect(addDice("2d4", 0)).toBe("2d4");
  });
  it("refuses a die expression it cannot extend", () => {
    expect(() => addDice("3d6+1", 1)).toThrow();
  });
  it("puts extra dice and typed damage bonuses into the formula", () => {
    const result = weaponDamage({
      dice: "3d6", ability: { label: "DEX", mod: 2 }, heroicLevel: 4, extraDice: 1,
      bonuses: [{ label: "Weapon Specialization", value: 2, type: null }],
    });
    // 4d6 + 2 DEX + 2 half level + 2 specialization.
    expect(result.formula).toBe("4d6 + 2 + 2 + 2");
    expect(result.flat.total).toBe(6);
  });
});
