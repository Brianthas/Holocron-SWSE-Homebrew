import { describe, expect, it } from "vitest";
import { nextCarry, nextSize, slotsUsed } from "../src/rules/inventory.ts";

describe("slots used (episode-vii, Equipment)", () => {
  it("counts carried items by size and quantity, and nothing in hands or stowed", () => {
    expect(slotsUsed([
      { slot: "light", carry: "carried", quantity: 3 },
      { slot: "twoLight", carry: "carried" },
      { slot: "kit", carry: "carried" },
      { slot: "twoKits", carry: "carried" },
      { slot: "kit", carry: "hands" },
      { slot: "light", carry: "stowed", quantity: 5 },
      { slot: "none", carry: "carried" },
    ])).toEqual({ light: 3 + 2, kit: 1 + 2 });
  });
  it("doubles integrated equipment", () => {
    expect(slotsUsed([{ slot: "light", carry: "carried", quantity: 2, integrated: true }, { slot: "kit", carry: "carried", integrated: true }])).toEqual({ light: 4, kit: 2 });
  });
});

describe("the equipment size button", () => {
  it("goes none, Light, Kit, none, and takes the larger sizes back to none", () => {
    expect([nextSize("none"), nextSize("light"), nextSize("kit"), nextSize("twoLight"), nextSize("twoKits")]).toEqual(["light", "kit", "none", "none", "none"]);
  });
});

describe("the carry button", () => {
  it("goes Carried, In hands (a free Kit only), Stowed, Carried", () => {
    expect([
      nextCarry("carried", "kit", false), nextCarry("carried", "kit", true), nextCarry("carried", "twoKits", false),
      nextCarry("carried", "light", false), nextCarry("hands", "kit", false), nextCarry("stowed", "kit", true),
    ]).toEqual(["hands", "stowed", "stowed", "stowed", "stowed", "carried"]);
  });
});
