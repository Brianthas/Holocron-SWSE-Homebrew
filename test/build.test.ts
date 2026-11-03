import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ABILITY_INCREASE_LEVELS, defensePointLimits, POINT_BUY_COST, pointBuyCost, pointBuySpent, speciesChoiceAllowed, trainedSkillsAllowed,
} from "../src/rules/build.ts";

describe("point buy (rulings.md, Character creation)", () => {
  it("matches the ruling's cost list, read from rulings.md", () => {
    const rulings = readFileSync(new URL("../docs/rulings.md", import.meta.url), "utf8").replace(/\s+/g, " ");
    const line = /Pathfinder costs: (.*?)\. A score below 8/.exec(rulings)?.[1] ?? "";
    const pairs = Object.fromEntries([...line.matchAll(/(\d+) (-?\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]));
    expect(Object.keys(pairs)).toHaveLength(11);
    expect(POINT_BUY_COST).toEqual(pairs);
  });
  it("charges 8's cost below 8, and has no cost above 18", () => {
    expect([1, 7, 8, 10, 14, 18, 19].map(pointBuyCost)).toEqual([-2, -2, -2, 0, 5, 17, null]);
  });
  it("totals a set of scores, exactly the 25 budget for a known spread", () => {
    expect(pointBuySpent([15, 14, 13, 12, 10, 8])).toBe(7 + 5 + 3 + 2 + 0 - 2);
    // 16 costs 10, 15 costs 7, 10 costs 0, 8 costs -2 (the ruling's list).
    expect(pointBuySpent([16, 16, 15, 10, 10, 8])).toBe(10 + 10 + 7 + 0 + 0 - 2);
    expect(10 + 10 + 7 + 0 + 0 - 2).toBe(25);
    expect(pointBuySpent([19, 10, 10, 10, 10, 10])).toBeNull();
  });
});

describe("ability increases (level-up guide)", () => {
  it("fall on the total levels whose ABILITY SCORES cell reads +1 and +1", () => {
    const html = readFileSync(new URL("../docs/rules/level-up-guide.html", import.meta.url), "utf8");
    const table = /<table[^>]*>([\s\S]*?)<\/table>/.exec(html)?.[1] ?? "";
    const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => [...(r[1] ?? "").matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => (c[1] ?? "").trim()));
    const levels = rows.filter((cells) => cells[1] === "+1 and +1").map((cells) => Number(cells[0]));
    expect(rows.filter((cells) => cells.length).length).toBe(20);
    expect(ABILITY_INCREASE_LEVELS).toEqual(levels);
  });
});

describe("Defense points (episode-vii, Classes)", () => {
  it("are 4, at most 2 each, until level 10, then 8 and 4", () => {
    expect([1, 9, 10, 20].map(defensePointLimits)).toEqual([{ total: 4, each: 2 }, { total: 4, each: 2 }, { total: 8, each: 4 }, { total: 8, each: 4 }]);
  });
});

describe("the species +2 (episode-vii, Species)", () => {
  it("cannot go on DEX for a Small species unless it is a droid", () => {
    expect([
      speciesChoiceAllowed("dex", "small", false), speciesChoiceAllowed("dex", "small", true),
      speciesChoiceAllowed("dex", "medium", false), speciesChoiceAllowed("str", "small", false),
    ]).toEqual([false, true, true, true]);
  });
});

describe("trained skills allowed (rulings.md, Skills)", () => {
  it("adds the level-1 class, INT, Bonus Trained Skill traits, Primitive and Skill Training", () => {
    const b = trainedSkillsAllowed({ firstClass: { name: "Jedi", skills: 4 }, intMod: 2, bonusTraits: 1, primitive: true, skillTraining: 2 });
    expect(b.total).toBe(4 + 2 + 1 + 1 + 2);
    expect(b.applied.map((m) => m.label)).toEqual(["Jedi", "INT", "Bonus Trained Skill", "Primitive", "Skill Training"]);
  });
  it("never goes below 0", () => {
    expect(trainedSkillsAllowed({ firstClass: null, intMod: -3, bonusTraits: 0, primitive: false, skillTraining: 0 }).total).toBe(0);
  });
});
