import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { levelSlotKinds, progressionSlots, type LevelInfo } from "../src/rules/slots.ts";

// The level-up guide's table: LEVEL | ABILITY SCORES | TOTAL LEVEL FEAT | TALENT | SOLO CLASS FEAT.
const html = readFileSync(new URL("../docs/rules/level-up-guide.html", import.meta.url), "utf8");
const table = /<table[^>]*>([\s\S]*?)<\/table>/.exec(html)?.[1] ?? "";
const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => [...(r[1] ?? "").matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => (c[1] ?? "").replace(/<[^>]*>/g, "").trim()))
  .filter((cells) => /^\d+$/.test(cells[0] ?? ""));
const level = (n: number, over: Partial<LevelInfo> = {}): LevelInfo => ({ level: n, classLevel: n, base: true, techniqueLevels: [], secretLevels: [], ...over });

describe("slots per level (level-up guide)", () => {
  it("reads 20 rows from the guide", () => expect(rows.length).toBe(20));
  it("a feat where the guide gives one, a talent every level, a class feat where the solo class feat column gives one", () => {
    for (const cells of rows) {
      const n = Number(cells[0]);
      const kinds = levelSlotKinds(level(n), false);
      expect([n, kinds.includes("feat"), kinds.includes("talent"), kinds.includes("classFeat")]).toEqual([n, cells[2] === "+1 feat", cells[3] === "+1 talent", cells[4] === "+1 feat"]);
    }
  });
  it("the class feat follows the class level, and a prestige class gets none", () => {
    expect(levelSlotKinds(level(3, { classLevel: 2 }), false)).toEqual(["feat", "classFeat", "talent"]);
    expect(levelSlotKinds(level(4, { classLevel: 2, base: false }), false)).toEqual(["talent"]);
    expect(levelSlotKinds(level(1), true)).toEqual(["speciesFeat", "feat", "talent"]);
    expect(levelSlotKinds(level(6, { classLevel: 2, base: false, techniqueLevels: [2, 4] }), false)).toEqual(["talent", "technique"]);
  });
});

describe("filling slots", () => {
  const levels = [level(1), level(2), level(3)];
  it("fills each level's slots from its picks, in order, and keeps a pick with no slot", () => {
    const slots = progressionSlots(levels, [
      { id: "a", name: "Skill Focus", level: 1, kind: "feat" }, { id: "b", name: "Block", level: 1, kind: "talent", tree: "Lightsaber Combat" },
      { id: "c", name: "Toughness", level: 2, kind: "classFeat" }, { id: "d", name: "Toughness", level: 2, kind: "classFeat" },
    ], { speciesBonusFeat: false, powersPerTraining: 1, powers: [] });
    expect(slots.map((l) => l.map((s) => `${s.kind}:${s.filled?.name ?? "-"}`))).toEqual([
      ["feat:Skill Focus", "talent:Block"], ["classFeat:Toughness", "talent:-", "classFeat:Toughness"], ["feat:-", "talent:-"],
    ]);
  });
  it("Force Training gives that level power slots, one per copy known, in order", () => {
    const slots = progressionSlots(levels, [{ id: "t", name: "Force Training", level: 3, kind: "feat" }], {
      speciesBonusFeat: false, powersPerTraining: 3, powers: [{ id: "m", name: "Move Object" }, { id: "m", name: "Move Object" }],
    });
    expect(slots[2]?.filter((s) => s.kind === "power").map((s) => s.filled?.name ?? "-")).toEqual(["Move Object", "Move Object", "-"]);
    expect(slots[0]?.some((s) => s.kind === "power")).toBe(false);
  });
});
