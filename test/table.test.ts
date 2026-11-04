import { describe, expect, it } from "vitest";
import { enteredDice } from "../src/dice/table.ts";

describe("dice entered at the table", () => {
  it("the entered total replaces the leading dice and keeps the rest of the formula", () => {
    expect(enteredDice("3d8 + 2", 14)).toBe("14[3d8 rolled at the table] + 2");
    expect(enteredDice("1d10", 7)).toBe("7[1d10 rolled at the table]");
  });
  it("a formula that does not start with dice is left alone", () => {
    expect(enteredDice("2 + 3d6", 9)).toBe("2 + 3d6");
  });
});
