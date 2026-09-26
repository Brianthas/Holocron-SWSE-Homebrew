// Surveys the SWSE fork's pack sources before the converter maps them: for each pack, the document
// types, every system field with how many documents fill it, every change key with its modes and
// example values, prerequisite node types, and embedded effects. Writes the full report to
// tools/convert/out/survey.json and prints a summary. Set FORK_PACKS to the fork's packs/_source.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.env["FORK_PACKS"] ?? "C:/Users/bryan/Documents/Code Repos/SWSE-Homebrew-Edition/packs/_source";
const PACKS = ["species", "classes", "feats", "talents", "force-powers", "force-techniques", "force-secrets", "force-regimens",
  "weapon", "armor", "equipment", "droid-system", "traits"];

interface Doc {
  _key?: string;
  name: string;
  type: string;
  system?: Record<string, unknown>;
  effects?: { system?: { changes?: unknown[] }; changes?: unknown[] }[];
}
interface Change { key?: string; value?: unknown; mode?: number }

const filled = (v: unknown) => !(v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)
  || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v as object).length));
const bump = <K>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);

const report: Record<string, unknown> = {};
for (const pack of PACKS) {
  const dir = join(ROOT, pack);
  const docs = readdirSync(dir).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Doc)
    .filter((d) => !(d._key ?? "").startsWith("!folders"));
  const types = new Map<string, number>();
  const fields = new Map<string, number>();
  const changeKeys = new Map<string, { docs: Set<string>; modes: Set<number>; examples: Set<string> }>();
  const prereq = new Map<string, number>();
  let withEffects = 0;
  const walk = (n: { type?: string; children?: unknown[] } | null | undefined) => {
    if (!n) return;
    if (n.type) bump(prereq, n.type);
    (n.children ?? []).forEach((c) => walk(c as never));
  };
  for (const d of docs) {
    bump(types, d.type);
    for (const [k, v] of Object.entries(d.system ?? {})) if (filled(v)) bump(fields, k);
    // An array, or (one class, Aggressive Follower) an array stored as an object keyed "0", "1", "2".
    const raw = d.system?.["changes"];
    const own = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
    const changes = [...(own as Change[]),
      ...(d.effects ?? []).flatMap((e) => (e.system?.changes ?? e.changes ?? []) as Change[])];
    if (d.effects?.length) withEffects += 1;
    for (const c of changes) {
      const key = String(c.key ?? "");
      const entry = changeKeys.get(key) ?? { docs: new Set(), modes: new Set(), examples: new Set() };
      entry.docs.add(d.name);
      if (c.mode !== undefined) entry.modes.add(c.mode);
      if (entry.examples.size < 3) entry.examples.add(`${d.name}: ${JSON.stringify(c.value)}`);
      changeKeys.set(key, entry);
    }
    walk(d.system?.["prerequisite"] as never);
  }
  const keys = [...changeKeys].sort((a, b) => b[1].docs.size - a[1].docs.size);
  report[pack] = {
    docs: docs.length,
    types: Object.fromEntries(types),
    fields: Object.fromEntries([...fields].sort((a, b) => b[1] - a[1])),
    docsWithChanges: new Set(keys.flatMap(([, e]) => [...e.docs])).size,
    docsWithEffects: withEffects,
    changeKeys: keys.map(([key, e]) => ({ key, docs: e.docs.size, modes: [...e.modes], examples: [...e.examples] })),
    prerequisiteTypes: Object.fromEntries(prereq),
  };
  const r = report[pack] as { docs: number; docsWithChanges: number; docsWithEffects: number; changeKeys: unknown[] };
  console.log(`${pack}: ${r.docs} docs, ${r.docsWithChanges} with changes, ${r.changeKeys.length} distinct change keys, ${r.docsWithEffects} with embedded effects; types ${JSON.stringify(Object.fromEntries(types))}`);
}
mkdirSync("tools/convert/out", { recursive: true });
writeFileSync("tools/convert/out/survey.json", `${JSON.stringify(report, null, 1)}\n`);
console.log("survey: tools/convert/out/survey.json");
