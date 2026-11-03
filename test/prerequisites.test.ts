import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFUNCT_FEATS, FEAT_OR_TALENT } from "../src/config/prerequisites.ts";
import { prereqDisplay, prereqHtml, traditionTreeMap, unmet, type PrereqCharacter, type PrereqNode } from "../src/rules/prerequisites.ts";

const talents = readdirSync("packs/_source/talents").map((f) => JSON.parse(readFileSync(`packs/_source/talents/${f}`, "utf8")));
const talent = (name: string, tree?: string) => {
  const t = talents.find((x) => x.name === name && (!tree || x.system.tree === tree));
  if (!t) throw new Error(`no talent ${name}`);
  return t.system.prerequisite.nodes as PrereqNode;
};
const ep7 = readFileSync("docs/rules/episode-vii.html", "utf8").replace(/<[^>]*>/g, "");

const none: PrereqCharacter = {
  talents: [], feats: [], bab: 0, level: 1, trained: new Set(), powers: new Set(), techniques: 0, secrets: 0,
  scores: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 10, Wisdom: 10, Charisma: 10 },
  unlockedTrees: new Set(), weaponGroups: new Set(), traditionTrees: traditionTreeMap(talents.map((t) => ({ tree: t.system.tree, nodes: t.system.prerequisite.nodes }))),
};

describe("house lists against episode-vii", () => {
  it("the defunct feats are the ones the page names", () => {
    const line = /The following feats no longer exist: (.*?)\./.exec(ep7)?.[1] ?? "";
    expect([...DEFUNCT_FEATS].sort()).toEqual(line.split(/, and |, /).sort());
  });
  it("the feat-or-talent feats are the ones the page calls a Feat or Talent", () => {
    const named = [...ep7.matchAll(/([A-Z][A-Za-z ]+?) is (?:considered|also) a Feat or Talent/g)].map((m) => m[1]);
    expect(named.sort()).toEqual([...FEAT_OR_TALENT].sort());
  });
});

describe("talent prerequisites", () => {
  it("Aggressive Negotiator needs Adept Negotiator", () => {
    const nodes = talent("Aggressive Negotiator");
    expect(unmet(nodes, none)).toEqual(["Adept Negotiator talent"]);
    expect(unmet(nodes, { ...none, talents: [{ name: "Adept Negotiator", tree: "Jedi Consular" }] })).toEqual([]);
  });
  it("base attack bonus is met at exactly the number", () => {
    const nodes = { type: "BASE ATTACK BONUS", requirement: "10", text: "Base Attack Bonus +10" };
    expect([unmet(nodes, { ...none, bab: 9 }).length, unmet(nodes, { ...none, bab: 10 }).length]).toEqual([1, 0]);
  });
  it("an ability score, a trained skill and a Force power", () => {
    expect(unmet({ type: "ATTRIBUTE", requirement: "Wisdom 13", text: "Wisdom 13" }, { ...none, scores: { ...none.scores, Wisdom: 12 } })).toEqual(["Wisdom 13"]);
    expect(unmet({ type: "ATTRIBUTE", requirement: "Wisdom 13", text: "Wisdom 13" }, { ...none, scores: { ...none.scores, Wisdom: 13 } })).toEqual([]);
    expect(unmet({ type: "TRAINED SKILL", requirement: "Use the Force", text: "Trained in Use the Force" }, { ...none, trained: new Set(["Use the Force"]) })).toEqual([]);
    expect(unmet({ type: "FORCE POWER", requirement: "Mind Trick", text: "Mind Trick" }, none)).toEqual(["Mind Trick"]);
  });
  it("choice feats: a specific choice, an open one, and a defunct feat", () => {
    const wf = (choice: string) => ({ type: "FEAT", requirement: `Weapon Focus (${choice})`, text: `Weapon Focus (${choice}) feat` });
    const lightsabers = { ...none, feats: [{ name: "Weapon Focus", choice: "lightsabers" }] };
    expect([unmet(wf("Lightsabers"), lightsabers).length, unmet(wf("Rifles"), lightsabers).length, unmet(wf("#payload#"), lightsabers).length, unmet(wf("Rifles"), none).length]).toEqual([0, 1, 0, 1]);
    // A Weapon Focus whose choice is not set meets an open choice only.
    const unset = { ...none, feats: [{ name: "Weapon Focus", choice: "" }] };
    expect([unmet(wf("Lightsabers"), unset).length, unmet(wf("#payload#"), unset).length]).toEqual([1, 0]);
    // Greater Weapon Focus held as a talent meets a feat prerequisite naming its choice (episode-vii, Feats).
    const talent = { ...none, talents: [{ name: "Greater Weapon Focus", tree: "Weapon Specialist", choice: "rifles" }] };
    const gwf = (g: string) => ({ type: "FEAT", requirement: `Greater Weapon Focus (${g})`, text: "" });
    expect([unmet(gwf("Rifles"), talent).length, unmet(gwf("Pistols"), talent).length]).toEqual([0, 1]);
    expect(unmet({ type: "FEAT", requirement: "Power Attack", text: "Power Attack feat" }, none)).toEqual([]);
  });
  it("weapon proficiency from the class table, in any spelling of the group", () => {
    const wp = (g: string) => ({ type: "FEAT", requirement: `Weapon Proficiency (${g})`, text: `Weapon Proficiency (${g}) feat` });
    const soldier = { ...none, weaponGroups: new Set(["advancedMelee", "pistols", "rifles", "simple"]) };
    expect([unmet(wp("Advanced Melee Weapons"), soldier).length, unmet(wp("Simple Weapons"), soldier).length, unmet(wp("Lightsabers"), soldier).length]).toEqual([0, 0, 1]);
  });
  it("tree-named talents: one talent from a named tree, or any talent from a tree", () => {
    const notorious = { type: "TALENT", requirement: "Notorious (Infamy Talent Tree)", text: "Notorious (Infamy Talent Tree) talent" };
    expect(unmet(notorious, { ...none, talents: [{ name: "Notorious", tree: "Bounty Hunter" }] })).toEqual([notorious.text]);
    expect(unmet(notorious, { ...none, talents: [{ name: "Notorious", tree: "Infamy" }] })).toEqual([]);
    const fromTree = { type: "TALENT", requirement: "Leadership Talent Tree", text: "Talent from the Leadership Talent Tree" };
    expect([unmet(fromTree, none).length, unmet(fromTree, { ...none, talents: [{ name: "Born Leader", tree: "Leadership" }] }).length]).toEqual([1, 0]);
  });
  it("a tradition is met when its tree is unlocked", () => {
    const krath = [...none.traditionTrees].find(([, tree]) => tree === "Krath");
    expect(krath).toBeDefined();
    const node = { type: "TRADITION", requirement: krath?.[0] ?? "", text: `Must be a member of ${krath?.[0]}` };
    expect([unmet(node, none).length, unmet(node, { ...none, unlockedTrees: new Set(["Krath"]) }).length]).toEqual([1, 0]);
  });
  it("OR is met by any child, AND needs all", () => {
    const or = { type: "OR", text: "A or B", children: [{ type: "BASE ATTACK BONUS", requirement: "5", text: "BAB 5" }, { type: "FORCE POWER", requirement: "Surge", text: "Surge" }] };
    expect([unmet(or, none), unmet(or, { ...none, bab: 5 })]).toEqual([["one of: A or B"], []]);
  });
});

describe("prerequisite text", () => {
  it("shows plain talent names, house skill names and open choices", () => {
    expect(prereqDisplay("Force Intuition (Jedi Guardian Talent Tree) talent, Trained in Knowledge (Life Sciences), Weapon Focus (#payload#)"))
      .toBe("Force Intuition talent, Trained in Knowledge (Sciences), Weapon Focus (any)");
  });
  it("marks what is missing and strikes a defunct feat", () => {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    expect(prereqHtml("Power Attack feat, Base Attack Bonus +5", ["Base Attack Bonus +5"], esc))
      .toBe('<s data-tooltip="No longer exists: counts as met">Power Attack feat</s>, <span class="miss">Base Attack Bonus +5</span>');
  });
});
