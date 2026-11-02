// The pieces feats and talents share: Holocron change constructors, the mapper context each fork
// change key runs in, and the effect a converted item carries.

import { cleanDescription, textNotIn } from "./html.ts";
import { idFor } from "./ids.ts";
import type { OutputDoc, Report, SourceDoc } from "./pack.ts";

export interface ChangeOut { key: string; type: "bonus" | "grant" | "dice"; value: number | string; phase: "initial" | "derived"; bonusType: string; condition: string }
/** Ability bonuses apply in core's "initial" phase, before ability scores are derived (character.ts); the rest in "derived". */
export const bonus = (key: string, value: number | string, bonusType = ""): ChangeOut =>
  ({ key, type: "bonus", value, phase: key.startsWith("ability.") ? "initial" : "derived", bonusType, condition: "" });
export const grant = (key: string, value: string): ChangeOut => ({ key, type: "grant", value, phase: "derived", bonusType: "", condition: "" });
export const dice = (key: string, value: number): ChangeOut => ({ key, type: "dice", value, phase: "derived", bonusType: "", condition: "" });

export interface Context {
  name: string;
  changes: ChangeOut[];
  repeatable: boolean;
  /** For a repeatable item with a limit; 0 means none. */
  maxTimes: number;
  drop(reason: string): void;
  fail(message: string): void;
}
export type Mapper = (value: unknown, ctx: Context) => void;

/** A prerequisite as the fork stores it: printed text and a tree the checker walks. */
export interface Prerequisite { text?: string; type?: string; requirement?: unknown; count?: unknown; children?: Prerequisite[] }

/** A whole number written as a number or a string; null for anything else. */
export const number = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : typeof value === "string" && /^-?\d+$/.test(value.trim()) ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
};
/** A flat number becomes a bonus; the fork's ability-swap formulas ("MAX(@WISMOD, @CHAMOD) - @WISMOD") are dropped for the swap code. */
export const flatOrSwap = (selector: string, bonusType = ""): Mapper => (value, ctx) => {
  const n = number(value);
  if (n !== null) ctx.changes.push(bonus(selector, n, bonusType));
  else if (/^MAX\(@\w+, ?@\w+\) - @\w+$/.test(String(value))) ctx.drop("ability swap (explicit code, not a bonus)");
  else ctx.fail(`${selector} value ${JSON.stringify(value)}`);
};
export const exact = (expected: unknown, then: Mapper): Mapper => (value, ctx) => {
  if (JSON.stringify(value) === JSON.stringify(expected)) then(value, ctx);
  else ctx.fail(`expected ${JSON.stringify(expected)}, found ${JSON.stringify(value)}`);
};
export const dropped = (reason: string): Mapper => (_value, ctx) => ctx.drop(reason);

/** Runs each of a document's fork changes through its mapper; a key with no mapper fails. */
export function runChanges(doc: SourceDoc, mappers: Record<string, Mapper>, ctx: Context): void {
  const raw = doc.system["changes"];
  for (const change of (Array.isArray(raw) ? raw : Object.values((raw ?? {}) as object)) as { key: string; value: unknown }[]) {
    const mapper = mappers[change.key];
    if (mapper) mapper(change.value, ctx);
    else ctx.fail(`unmapped change ${change.key}: ${JSON.stringify(change.value).slice(0, 80)}`);
  }
}

/** Adds a transferred effect named `name` to an item, its id derived from `idSeed`. */
export function addEffect(item: OutputDoc, idSeed: string, name: string, changes: ChangeOut[]): void {
  if (!changes.length) return;
  const effectId = idFor(idSeed);
  item.effects.push({
    _id: effectId, _key: `!items.effects!${item._id}.${effectId}`, name, type: "base", img: "icons/svg/aura.svg",
    transfer: true, disabled: false, system: { changes }, duration: {}, flags: {},
  });
}

/** Gives an item one transferred effect holding its changes, with an id derived from the item's seed. */
export function attachEffect(item: OutputDoc, seed: string, changes: ChangeOut[]): void {
  item.effects = [];
  addEffect(item, `${seed}:effect`, item.name, changes);
}

/**
 * The fork's shortDescription change is usually a flattened copy of the description. Where it holds
 * text the description lacks, each document is decided here; an undecided one fails the run.
 */
const SHORT_DESCRIPTIONS: Record<string, { carry: boolean; reason: string }> = {
  "Move Object": { carry: true, reason: "its first paragraph is the house damage rule (rulings.md, The Force: Move Object), missing from the description" },
  "Negate Energy": { carry: false, reason: "the description carries the house rule; the copy is the printed text it replaces" },
};

/** The paragraph to put ahead of the description, or "" when the shortDescription adds nothing. */
export function shortDescriptionCarry(doc: SourceDoc, report: Report, pack: string): string {
  const raw = doc.system["changes"];
  const changes = (Array.isArray(raw) ? raw : Object.values((raw ?? {}) as object)) as { key: string; value: unknown }[];
  const short = changes.find((c) => c.key === "shortDescription");
  if (!short) return "";
  const extra = textNotIn(String(short.value), String(doc.system["description"] ?? ""));
  if (!extra.length) return "";
  const decision = SHORT_DESCRIPTIONS[doc.name];
  if (!decision) {
    report.problem(pack, doc, `shortDescription holds text the description lacks: "${(extra[0] ?? "").slice(0, 100)}"`);
    return "";
  }
  report.note("shortDescription decisions", `${doc.name}: ${decision.reason}`);
  if (!decision.carry) return "";
  const paragraph = /^\s*(<p>[\s\S]*?<\/p>)/.exec(String(short.value))?.[1];
  if (!paragraph) {
    report.problem(pack, doc, "shortDescription to carry has no leading paragraph");
    return "";
  }
  return cleanDescription(paragraph).html;
}

/** Fan content the rulings leave out (rulings.md, Content): tagged Homebrew Content or credited to a fan creator. */
export const isFanContent = (doc: SourceDoc): boolean => {
  const tags = [
    ...((doc.system["categories"] ?? []) as { value?: string }[]).map((c) => c.value ?? ""),
    ...((doc.system["possibleProviders"] ?? []) as unknown[]).map(String),
  ];
  return tags.some((t) => t === "Homebrew Content" || / Creations$/.test(t));
};
