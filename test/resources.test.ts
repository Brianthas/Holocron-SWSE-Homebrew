import { describe, expect, it } from "vitest";
import { untyped } from "../src/rules/modifiers.ts";
import {
  averageHitDie, carrySlots, darkSideMax, destinyMax, forcePointsPerDay, hitPointMax, hpState, languages,
} from "../src/rules/resources.ts";

describe("Force Points per day (episode-vii)", () => {
  it("changes at the level-band edges", () => {
    expect([1, 5, 6, 10, 11, 15, 16, 20].map((l) => forcePointsPerDay(l).total)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });
  it("adds Force Sensitivity and Force Boon, and Destiny's cap follows", () => {
    const fp = forcePointsPerDay(6, [untyped("Force Sensitivity", 1), untyped("Force Boon", 2)]).total;
    expect(fp).toBe(5);
    expect(destinyMax(fp)).toBe(5);
  });
});

describe("Dark Side maximum: half WIS, rounded up", () => {
  it("rounds up on odd scores", () => {
    expect([18, 19, 15, 10].map(darkSideMax)).toEqual([9, 10, 8, 5]);
  });
});

describe("hit points (rulings.md)", () => {
  it("takes floor(die / 2) + 1 as the average", () => {
    expect([6, 8, 10, 12].map(averageHitDie)).toEqual([4, 5, 6, 7]);
  });
  it("adds level 1's class hit points, later rolls, and CON once per level", () => {
    // Jedi 30 at level 1, then 6 and 4 on d10, CON +2 over 3 levels.
    const hp = hitPointMax({ firstLevel: 30, firstLabel: "Jedi level 1", laterRolls: [6, 4], conMod: 2 });
    expect(hp.total).toBe(30 + 10 + 6);
    expect(hitPointMax({ firstLevel: 30, firstLabel: "Jedi level 1", laterRolls: [], conMod: -1 }).total).toBe(29);
  });
});

describe("HP state (episode-vii, Healing)", () => {
  it("is staggered at exactly 0, dying below, dead at minus the maximum", () => {
    expect([1, 0, -1, -29, -30, -31].map((v) => hpState(v, 30))).toEqual(["healthy", "staggered", "dying", "dying", "dead", "dead"]);
  });
});

describe("languages by INT (episode-vii table)", () => {
  it("changes tier at 8, 10, 12, 16 and 20", () => {
    expect([7, 8, 10, 12, 16, 20].map((i) => languages(i).understands)).toEqual([
      "Species language only", "Galactic Basic, Huttese, or Ryl", "Galactic Basic, Huttese, or Ryl",
      "Commons, including Binary", "Commons and Rares", "Commons, Rares, and Secrets",
    ]);
    expect([9, 10].map((i) => languages(i).speaks)).toEqual(["Species language only", "one of Galactic Basic, Huttese, or Ryl"]);
  });
  it("counts Linguist as 4 higher and Primitive as 4 lower", () => {
    expect(languages(12, [untyped("Linguist", 4)]).understands).toBe("Commons and Rares");
    expect(languages(12, [untyped("Primitive", -4)]).understands).toBe("Galactic Basic, Huttese, or Ryl");
  });
});

describe("carrying (episode-vii, Equipment)", () => {
  it("gives Light slots equal to STR and Kit slots STR mod + 1, minimum 1", () => {
    const slots = carrySlots({ strScore: 12, strMod: 1, size: "medium", extendedCapacity: false });
    expect([slots.light.total, slots.kit.total, slots.handsKit]).toEqual([12, 2, 1]);
    expect(carrySlots({ strScore: 8, strMod: -1, size: "medium", extendedCapacity: false }).kit.total).toBe(1);
  });
  it("takes one Kit slot per size below Medium, never below 0", () => {
    expect(carrySlots({ strScore: 14, strMod: 2, size: "small", extendedCapacity: false }).kit.total).toBe(2);
    expect(carrySlots({ strScore: 8, strMod: -1, size: "tiny", extendedCapacity: false }).kit.total).toBe(0);
  });
  it("doubles both with Extended Capacity", () => {
    const slots = carrySlots({ strScore: 12, strMod: 1, size: "medium", extendedCapacity: true });
    expect([slots.light.total, slots.kit.total]).toEqual([24, 4]);
  });
});
