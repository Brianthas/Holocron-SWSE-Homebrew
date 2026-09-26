import { describe, expect, it } from "vitest";
import { abilityMod, abilityScore } from "../src/rules/abilities.ts";
import { rangedAttack, rangedDamage } from "../src/rules/attacks.ts";
import { defense } from "../src/rules/defenses.ts";
import { total, untyped, type Modifier } from "../src/rules/modifiers.ts";
import { skill } from "../src/rules/skills.ts";
import { REFLEX_SIZE_MODIFIER } from "../src/config/sizes.ts";

const improvedDefenses: Modifier = { label: "Improved Defenses", value: 1, type: null };

describe("ability modifiers (core rulebook Table 1-1)", () => {
  it("follows the table at its edges", () => {
    expect([1, 8, 9, 10, 11, 12, 14, 15, 18, 19].map(abilityMod)).toEqual([-5, -1, -1, 0, 0, 1, 2, 2, 4, 4]);
  });
});

describe("ability scores (episode-vii species table)", () => {
  const dex = (size: "small" | "medium" | "large", speciesChoice: "dex" | "wis" | null) =>
    abilityScore("dex", { base: 14, size, speciesChoice, increases: 0 });
  it("adds the size's fixed adjustment and the +2 choice, and nothing else", () => {
    expect(dex("medium", "wis")).toBe(14);
    expect(dex("medium", "dex")).toBe(16);
    expect(dex("small", "wis")).toBe(16);
    expect(dex("large", "wis")).toBe(12);
    expect(abilityScore("str", { base: 12, size: "small", speciesChoice: null, increases: 1 })).toBe(11);
  });
});

describe("stacking (rulings.md, Combat)", () => {
  it("keeps the highest bonus of a type and sums untyped ones", () => {
    const result = total([
      { label: "Weapon Focus", value: 1, type: "competence" },
      { label: "Battle Strike", value: 2, type: "competence" },
      untyped("A", 1),
      untyped("B", 1),
    ]);
    // Summing everything would give 5; keeping the highest competence bonus gives 4.
    expect(result.total).toBe(4);
    expect(result.suppressed.map((m) => m.label)).toEqual(["Weapon Focus"]);
    expect(result.applied.map((m) => m.label)).toEqual(["Battle Strike", "A", "B"]);
  });
  it("sums penalties even when typed", () => {
    expect(total([{ label: "a", value: -2, type: "morale" }, { label: "b", value: -1, type: "morale" }]).total).toBe(-3);
  });
});

describe("the F1 character: Human Jedi 1, DEX 14, 2 Reflex points, Improved Defenses", () => {
  const reflex = (bonuses: Modifier[], size = 0) =>
    defense({ heroicLevel: 1, ability: { label: "DEX", mod: abilityMod(14) }, points: 2, size, bonuses });

  it("has Reflex 16: 10 + 1 level + 2 DEX + 2 points + 1 Improved Defenses (core rulebook p145)", () => {
    const result = reflex([improvedDefenses]);
    expect(result.total).toBe(16);
    expect(result.applied.map((m) => `${m.label} ${m.value}`)).toEqual([
      "Base 10", "Heroic level 1", "DEX 2", "Defense points 2", "Improved Defenses 1",
    ]);
  });
  it("loses exactly 1 without Improved Defenses", () => {
    expect(reflex([]).total).toBe(15);
  });
  it("gains the size modifier only when not Medium: Small +1, Large -1", () => {
    expect(reflex([], REFLEX_SIZE_MODIFIER.small).total).toBe(16);
    expect(reflex([], REFLEX_SIZE_MODIFIER.large).total).toBe(14);
    expect(reflex([]).applied.some((m) => m.label === "Size")).toBe(false);
  });
  it("has Stealth +7 trained: 0 half level + 5 trained + 2 DEX", () => {
    expect(skill({ level: 1, trained: true, ability: { label: "DEX", mod: 2 } }).total).toBe(7);
    expect(skill({ level: 1, trained: false, ability: { label: "DEX", mod: 2 } }).total).toBe(2);
  });
  it("attacks with the Blaster Pistol at +3: BAB 1 + DEX 2", () => {
    expect(rangedAttack({ bab: 1, dexMod: 2 }).total).toBe(3);
  });
  it("deals 3d6 + 2 with the Blaster Pistol: DEX 2, half of level 1 is 0", () => {
    expect(rangedDamage({ dice: "3d6", dexMod: 2, heroicLevel: 1 }).formula).toBe("3d6 + 2");
  });
});

describe("half level rounds down", () => {
  it("adds nothing at level 1, 1 at levels 2 and 3", () => {
    expect([1, 2, 3].map((heroicLevel) => rangedDamage({ dice: "3d6", dexMod: 0, heroicLevel }).formula)).toEqual(["3d6", "3d6 + 1", "3d6 + 1"]);
    expect([1, 2, 3].map((level) => skill({ level, trained: false, ability: { label: "DEX", mod: 0 } }).total)).toEqual([0, 1, 1]);
  });
  it("writes a negative modifier as a subtraction", () => {
    expect(rangedDamage({ dice: "3d6", dexMod: -1, heroicLevel: 1 }).formula).toBe("3d6 - 1");
  });
});
