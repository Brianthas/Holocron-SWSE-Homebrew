import { describe, expect, it } from "vitest";
import { bandsReached, featureSlots, forcePowersKnown } from "../src/rules/force.ts";

describe("Force powers known", () => {
  it("are 1 + INT mod per Force Training, at least 1 each", () => {
    expect([forcePowersKnown(0, 3), forcePowersKnown(1, 2), forcePowersKnown(2, 2), forcePowersKnown(1, -1), forcePowersKnown(2, -3)]).toEqual([0, 3, 6, 1, 2]);
  });
});

describe("DC bands reached", () => {
  const bands = [{ dc: 15, text: "a" }, { dc: 20, text: "b" }, { dc: 25, text: "c" }];
  it("meets a DC at exactly its value, and gives only the highest band unless cumulative", () => {
    expect(bandsReached(bands, 14, false)).toEqual([]);
    expect(bandsReached(bands, 15, false)).toEqual([0]);
    expect(bandsReached(bands, 24, false)).toEqual([1]);
    expect(bandsReached(bands, 25, false)).toEqual([2]);
    expect(bandsReached(bands, 24, true)).toEqual([0, 1]);
    expect(bandsReached(bands, 40, true)).toEqual([0, 1, 2]);
  });
});

describe("Force technique and secret slots", () => {
  it("count each class's slot levels up to the levels taken", () => {
    expect(featureSlots([{ levels: 3, slotLevels: [2, 4, 6] }, { levels: 5, slotLevels: [2, 3, 4, 5] }, { levels: 2, slotLevels: [] }])).toBe(1 + 4);
    expect(featureSlots([{ levels: 1, slotLevels: [2, 4] }])).toBe(0);
  });
});
