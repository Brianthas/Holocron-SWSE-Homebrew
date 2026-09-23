/**
 * Characters Holocron's own text must never contain: the en dash and em dash (house style), and
 * control characters below U+0020 other than tab, LF and CR, which are invisible in an editor and
 * in grep. Verbatim third-party snapshots under docs/rules/ may keep their dashes but not control
 * characters.
 */

export interface TextProblem {
  line: number;
  column: number;
  codePoint: number;
  reason: string;
}

const EN_DASH = 0x2013;
const EM_DASH = 0x2014;
const ALLOWED_CONTROLS = new Set([0x09, 0x0a, 0x0d]);

export function findTextProblems(text: string, { allowDashes = false } = {}): TextProblem[] {
  const problems: TextProblem[] = [];
  let line = 1;
  let column = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    column += 1;
    if (code === 0x0a) {
      line += 1;
      column = 0;
      continue;
    }
    if (!allowDashes && (code === EN_DASH || code === EM_DASH)) {
      problems.push({ line, column, codePoint: code, reason: code === EM_DASH ? "em dash" : "en dash" });
    } else if (code < 0x20 && !ALLOWED_CONTROLS.has(code)) {
      problems.push({ line, column, codePoint: code, reason: "control character" });
    }
  }
  return problems;
}
