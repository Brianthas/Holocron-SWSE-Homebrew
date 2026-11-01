import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { idFor } from "./ids.ts";

/** The fork checked out beside this repo, or FORK_PACKS if set to the fork's packs/_source. */
export const FORK_PACKS = process.env["FORK_PACKS"] ?? fileURLToPath(new URL("../../../../SWSE-Homebrew-Edition/packs/_source", import.meta.url));

export interface SourceDoc {
  _id: string;
  name: string;
  type: string;
  system: Record<string, unknown>;
  effects: unknown[];
  folder: string | null;
  flags: Record<string, unknown>;
  [key: string]: unknown;
}

/** A pack's documents, sorted by name and then id so every run sees them in the same order. */
export function readPack(pack: string): SourceDoc[] {
  const dir = join(FORK_PACKS, pack);
  return readdirSync(dir).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as SourceDoc)
    .sort((a, b) => a.name.localeCompare(b.name) || a._id.localeCompare(b._id));
}

export interface Excluded { pack: string; name: string; sourceId: string; reason: string }
export interface Problem { pack: string; name: string; message: string }

/** Everything a run decided that a person should see: exclusions by name, and problems that fail it. */
export class Report {
  excluded: Excluded[] = [];
  problems: Problem[] = [];
  notes: Record<string, string[]> = {};
  exclude(pack: string, doc: SourceDoc, reason: string): void {
    this.excluded.push({ pack, name: doc.name, sourceId: doc._id, reason });
  }
  problem(pack: string, doc: SourceDoc, message: string): void {
    this.problems.push({ pack, name: doc.name, message });
  }
  note(topic: string, line: string): void {
    (this.notes[topic] ??= []).push(line);
  }
  /** Lists the fan sections a description lost, and the Homebrew headings it kept for want of a review notice. */
  sections(pack: string, doc: SourceDoc, cleaned: { removedSections: string[]; unclearSections: string[] }): void {
    for (const title of cleaned.removedSections) this.note("fan sections removed", `${pack}/${doc.name}: ${title}`);
    for (const title of cleaned.unclearSections) this.problem(pack, doc, `"${title}" heading has no review notice; decide whether it is fan content`);
  }
}

const empty = (v: unknown) => v === null || v === undefined || v === "" || v === false
  || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v as object).length);

/**
 * Every system key is accounted for: mapped, a known constant, or empty. A key that carries
 * anything else is reported, so content the mapping does not know about fails the run instead of
 * vanishing. Embedded effects and flags must be empty unless the mapper says it reads them.
 */
export function checkKeys(pack: string, doc: SourceDoc, spec: { mapped: string[]; constant?: Record<string, unknown> }, report: Report): void {
  for (const [key, value] of Object.entries(doc.system)) {
    if (spec.mapped.includes(key)) continue;
    if (spec.constant && key in spec.constant) {
      if (JSON.stringify(value) !== JSON.stringify(spec.constant[key])) report.problem(pack, doc, `${key} is ${JSON.stringify(value)}, expected ${JSON.stringify(spec.constant[key])}`);
      continue;
    }
    if (!empty(value)) report.problem(pack, doc, `unmapped system.${key}: ${JSON.stringify(value).slice(0, 120)}`);
  }
  if (doc.effects.length) report.problem(pack, doc, `${doc.effects.length} embedded effects not mapped`);
  if (!empty(doc.flags)) report.problem(pack, doc, `unmapped flags: ${JSON.stringify(doc.flags).slice(0, 120)}`);
}

export interface OutputDoc {
  _id: string;
  _key: string;
  name: string;
  type: string;
  system: Record<string, unknown>;
  effects: unknown[];
  folder: null;
  sort: number;
  flags: { holocron: Record<string, unknown> };
}

/** A converted item. Its id comes from the seed; the fork's id is kept as flags.holocron.sourceId. */
export function itemDoc(seed: string, name: string, type: string, system: Record<string, unknown>, source: SourceDoc, flags: Record<string, unknown> = {}): OutputDoc {
  const id = idFor(seed);
  return { _id: id, _key: `!items!${id}`, name, type, system, effects: [], folder: null, sort: 0, flags: { holocron: { sourceId: source._id, ...flags } } };
}
