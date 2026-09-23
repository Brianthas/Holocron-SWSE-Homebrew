import { describe, expect, it } from "vitest";
import { findTextProblems } from "../tools/lib/text-check.ts";

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const BELL = String.fromCharCode(0x07);

describe("findTextProblems", () => {
  it("reports an em dash with its line and column", () => {
    const problems = findTextProblems(`first line\nab${EM_DASH}cd`);
    expect(problems).toEqual([{ line: 2, column: 3, codePoint: 0x2014, reason: "em dash" }]);
  });

  it("reports an en dash", () => {
    expect(findTextProblems(`a ${EN_DASH} b`).map((p) => p.reason)).toEqual(["en dash"]);
  });

  it("allows dashes in verbatim snapshots but still reports control characters", () => {
    const problems = findTextProblems(`quote ${EM_DASH} here${BELL}`, { allowDashes: true });
    expect(problems.map((p) => p.codePoint)).toEqual([0x07]);
  });

  it("accepts tab, CR and LF, and plain hyphens", () => {
    expect(findTextProblems("a\tb\r\nc - d")).toEqual([]);
  });
});
