import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JEDI_ORDER_TREES, TRADITIONS } from "../src/config/talents.ts";
import { accessGroups, accessibleTrees, accessibleTreesFor, traditionTrees, type AccessInput } from "../src/rules/talent-access.ts";

const pack = (dir: string) => readdirSync(`packs/_source/${dir}`).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(`packs/_source/${dir}/${f}`, "utf8")));
const talentTrees = new Set(pack("talents").map((t) => t.system.tree as string));
const jedi = pack("classes").find((c) => c.name === "Jedi");
const soldier = pack("classes").find((c) => c.name === "Soldier");
const base: AccessInput = {
  classes: [{ name: "Jedi", trees: jedi.system.talentTrees }, { name: "Soldier", trees: soldier.system.talentTrees }],
  forceSensitive: true, tradition: "jediOrder", traditionTree: "", added: [], removed: [],
};

describe("traditions against episode-vii", () => {
  // "other Traditions include: the Sith Order (use Believer Disciple, Blazing Chain, or Krath), Baran
  // Do (Kel Dor only), ..." Each entry's parenthesis is a tree list or a species limit.
  const html = readFileSync("docs/rules/episode-vii.html", "utf8");
  const line = /other Traditions include: (.*?)\. I may add/.exec(html.replace(/<[^>]*>/g, ""))?.[1] ?? "";
  const entries = [...line.matchAll(/(?:and )?(?:the )?([A-Z][A-Za-z ]+?)(?: \(([^)]*)\))?(?:,|$)/g)].map((m) => ({ name: (m[1] ?? "").trim(), note: m[2] ?? "" }));
  it("lists the same traditions, Ithorian Priesthood aside (no tree in the packs)", () => {
    // Sith Order, Baran Do, Dathomiri Witches, Felucian Shamans, Ithorian Priesthood, Imperial Legion,
    // Jal Shey, Keetael, Luka Sene, Matukai, Order of Shasa.
    expect(entries.length).toBe(11);
    expect(entries.map((e) => e.name).filter((n) => n !== "Ithorian Priesthood").sort())
      .toEqual(Object.values(TRADITIONS).filter((t) => t.label !== "Jedi Order").map((t) => t.label).sort());
  });
  it("gives each the trees and species the text names", () => {
    for (const { name, note } of entries.filter((e) => e.name !== "Ithorian Priesthood")) {
      const t = Object.values(TRADITIONS).find((x) => x.label === name);
      const species = /^(.*) only$/.exec(note)?.[1];
      const listed = !species && note ? note.replace(/^use /, "").split(/, or |, | or /) : [];
      expect({ name, pick: t?.pick ?? [], species: t?.species }).toEqual({ name, pick: listed, species });
    }
  });
  it("names only trees the talents pack has, and the Jedi class holds the Jedi Order trees", () => {
    const named = Object.values(TRADITIONS).flatMap((t) => [...(t.trees ?? []), ...(t.pick ?? [])]);
    expect(named.filter((t) => !talentTrees.has(t))).toEqual([]);
    expect(JEDI_ORDER_TREES.every((t) => jedi.system.talentTrees.includes(t))).toBe(true);
  });
});

describe("tree access", () => {
  it("Jedi Order: the three Jedi trees and Lightsaber Combat; another tradition swaps the three only", () => {
    const order = accessGroups(base).filter((g) => g.cls === "Jedi");
    expect(order.map((g) => [g.label, g.trees])).toEqual([["Jedi: Jedi Order", [...JEDI_ORDER_TREES]], ["Jedi: every tradition", ["Lightsaber Combat"]]]);
    const sith = accessibleTrees({ ...base, tradition: "sithOrder", traditionTree: "Krath" });
    expect([sith.has("Krath"), sith.has("Lightsaber Combat"), sith.has("Jedi Guardian"), sith.has("Blazing Chain")]).toEqual([true, true, false, false]);
    expect(traditionTrees("sithOrder", "")).toEqual([]);
    expect(traditionTrees("baranDo", "Krath")).toEqual(["Baran Do Sage"]);
  });
  it("adds Force Sensitivity's trees only with the feat, drops removed trees, keeps added ones", () => {
    expect(accessibleTrees(base).has("Alter")).toBe(true);
    expect(accessibleTrees({ ...base, forceSensitive: false }).has("Alter")).toBe(false);
    const edited = accessibleTrees({ ...base, removed: ["Commando"], added: ["Duelist", "Iron Knight"] });
    expect([edited.has("Commando"), edited.has("Duelist"), edited.has("Iron Knight")]).toEqual([false, true, true]);
  });
  it("a class's slot uses its own trees, the Force trees and added trees, never another class's", () => {
    const soldierSlot = accessibleTreesFor({ ...base, added: ["Duelist"] }, "Soldier");
    expect([soldierSlot.has("Commando"), soldierSlot.has("Sense"), soldierSlot.has("Duelist"), soldierSlot.has("Jedi Guardian")]).toEqual([true, true, true, false]);
  });
});
