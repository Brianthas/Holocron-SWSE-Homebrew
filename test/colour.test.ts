import { describe, expect, it } from "vitest";
import { DARK_TEXT, LIGHT_TEXT, contrast, luminance, parseHex, textOn } from "../src/rules/colour.ts";

const ratio = (accent: string) => contrast(luminance(parseHex(accent)!), luminance(parseHex(textOn(accent))!));

describe("text on an accent (mockup 1)", () => {
  it("white on the default purple, dark on pale yellow and near-white", () => {
    expect(textOn("#7b4fd6")).toBe(LIGHT_TEXT);
    expect(textOn("#f2d15c")).toBe(DARK_TEXT);
    expect(textOn("#fafafa")).toBe(DARK_TEXT);
  });
  it("keeps 4.5:1 or better for every preset and for greys across the range", () => {
    const presets = ["#7b4fd6", "#1fa39a", "#c23b4e", "#e0a526", "#3a7bd5", "#f2d15c"];
    const greys = Array.from({ length: 52 }, (_, i) => `#${(i * 5).toString(16).padStart(2, "0").repeat(3)}`);
    for (const c of [...presets, ...greys, "#ffffff", "#000000"]) expect(ratio(c)).toBeGreaterThanOrEqual(4.5);
  });
  it("reads only six-digit hex", () => {
    expect(parseHex("#7B4FD6")).toEqual([123, 79, 214]);
    expect(parseHex("purple")).toBeNull();
    expect(textOn("purple")).toBe(LIGHT_TEXT);
  });
});
