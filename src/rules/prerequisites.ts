import { DEFUNCT_FEATS, FEAT_OR_TALENT, SKILL_RENAMES } from "../config/prerequisites.ts";

/**
 * Talent prerequisites (mockup 3, item 3). The converted prerequisite is a tree of nodes; this says
 * which requirements a character does not meet. It checks talents, feats, base attack bonus, trained
 * skills, ability scores, character level, Force powers, traditions and technique or secret counts.
 * Anything else (species, equipment, dark side score) is shown as text and never marked. Feat
 * prerequisites are negotiable at this table and are never marked (Bryan, 2026-09-23).
 */
export interface PrereqNode { text: string; requirement?: string | null; type: string; children?: PrereqNode[] }

export interface PrereqCharacter {
  talents: readonly { name: string; tree: string }[];
  feats: readonly { name: string; choice: string }[];
  bab: number;
  level: number;
  /** Trained skills by their labels ("Use the Force"). */
  trained: ReadonlySet<string>;
  /** Ability scores by name ("Strength"). */
  scores: Readonly<Record<string, number>>;
  powers: ReadonlySet<string>;
  techniques: number;
  secrets: number;
  /** The trees the character can use (rules/talent-access.ts). */
  unlockedTrees: ReadonlySet<string>;
  /** Weapon groups the classes taken are proficient with, as keys ("advancedMelee"). */
  weaponGroups: ReadonlySet<string>;
  /** Each tradition prerequisite's tree: every one in the packs sits on talents of a single tree. */
  traditionTrees: ReadonlyMap<string, string>;
}

/** A talent printed in several trees carries its tree in brackets; shown and matched by its plain name. */
export const plainName = (s: string): string => s.replace(/ \([^()]*Talent Tree\)/g, "");
const split = (req: string): [string, string | null] => {
  const m = /^(.*?) \((.+)\)$/.exec(plainName(req));
  return m ? [m[1] ?? "", m[2] ?? null] : [plainName(req), null];
};
/** "(#payload#)" and "(Any)" leave the choice open. */
const anyChoice = (choice: string | null) => choice === "#payload#" || /^any$/i.test(choice ?? "");
/** "Advanced Melee Weapon", "Advanced Melee Weapons" and "advancedMelee" are one group; "Knowledge (Galactic Lore)" is "knowledgeGalacticLore". */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "").replace(/weapons?$/, "");

function hasFeat(c: PrereqCharacter, req: string): boolean {
  const [name, choice] = split(req);
  if (DEFUNCT_FEATS.has(name)) return true;
  // Weapon proficiencies come from the house class table for every class taken, or the feat.
  if (name === "Weapon Proficiency") {
    const feats = c.feats.filter((f) => f.name === name).map((f) => norm(f.choice));
    if (anyChoice(choice)) return c.weaponGroups.size > 0 || feats.length > 0;
    return [...c.weaponGroups].some((g) => norm(g) === norm(choice ?? "")) || feats.includes(norm(choice ?? ""));
  }
  const held = [...c.feats.filter((f) => f.name === name), ...(FEAT_OR_TALENT.has(name) ? c.talents.filter((t) => t.name === name).map(() => ({ choice: "" })) : [])];
  if (!held.length) return false;
  // A feat with no choice set meets any choice: the sheet has no choice picker yet.
  return !choice || anyChoice(choice) || held.some((h) => h.choice === "" || norm(h.choice) === norm(choice));
}

function hasTalent(c: PrereqCharacter, req: string): boolean {
  // "Talent from the Inspiration Talent Tree": any talent from that tree.
  const anyFromTree = /^([^()]*) Talent Tree$/.exec(req);
  if (anyFromTree) return c.talents.some((t) => t.tree === anyFromTree[1]);
  // "Notorious (Infamy Talent Tree)": that talent, from that tree.
  const fromTree = /^(.*) \(([^()]*) Talent Tree\)$/.exec(req);
  if (fromTree) return c.talents.some((t) => t.name === fromTree[1] && t.tree === fromTree[2]);
  const [name, choice] = split(req);
  if (c.talents.some((t) => t.name === req)) return true;
  if (FEAT_OR_TALENT.has(name) && hasFeat(c, req)) return true;
  return anyChoice(choice) && c.talents.some((t) => t.name === name || t.name.startsWith(`${name} (`));
}

/** The text of each requirement the character does not meet; empty when every one is met. */
export function unmet(node: PrereqNode | null | undefined, c: PrereqCharacter): string[] {
  if (!node) return [];
  const req = node.requirement ?? "";
  const fail = (ok: boolean) => (ok ? [] : [node.text]);
  switch (node.type) {
    case "AND": return (node.children ?? []).flatMap((n) => unmet(n, c));
    case "OR": return (node.children ?? []).some((n) => unmet(n, c).length === 0) ? [] : [`one of: ${node.text}`];
    case "TALENT": return fail(hasTalent(c, req));
    case "FEAT": return fail(hasFeat(c, req));
    case "BASE ATTACK BONUS": return fail(c.bab >= Number(req));
    case "CHARACTER LEVEL": return fail(c.level >= Number(req));
    // "Chosen Skill" and "#payload#" leave the skill open: any trained skill meets them.
    case "TRAINED SKILL": return fail(req === "#payload#" || req === "Chosen Skill" ? c.trained.size > 0 : c.trained.has(SKILL_RENAMES[req] ?? req));
    case "ATTRIBUTE": {
      const m = /^(\w+) (\d+)$/.exec(req);
      const score = m ? c.scores[m[1] ?? ""] : undefined;
      return score === undefined ? [] : fail(score >= Number(m?.[2]));
    }
    case "FORCE POWER": return fail(c.powers.has(req));
    case "TRADITION": {
      const tree = c.traditionTrees.get(req);
      return fail(Boolean(tree && c.unlockedTrees.has(tree)));
    }
    // All four in the packs are counts: "At least one Force Technique" has requirement "1".
    case "FORCE TECHNIQUE": return fail(c.techniques >= Number(req));
    case "FORCE SECRET": return fail(c.secrets >= Number(req));
    default: return [];
  }
}

/** Prerequisite text as a player reads it: plain talent names, house skill names, "any" for an open choice. */
export function prereqDisplay(text: string): string {
  return Object.entries(SKILL_RENAMES).reduce((t, [was, now]) => t.split(was).join(now), plainName(text))
    .replaceAll("(#payload#)", "(any)")
    .replaceAll("Trained in #payload#", "Trained in the chosen skill")
    .replaceAll("Proficient with #payload#", "Proficient with the chosen weapon");
}

/**
 * The prerequisite as HTML: each unmet requirement marked where it appears, and a feat that no longer
 * exists struck through (only "<name> feat", so "Uncanny Dodge I talent" is left alone).
 */
export function prereqHtml(text: string, missing: readonly string[], escape: (s: string) => string): string {
  let html = escape(prereqDisplay(text));
  for (const m of missing) {
    const shown = escape(prereqDisplay(m));
    if (shown) html = html.split(shown).join(`<span class="miss">${shown}</span>`);
  }
  return [...DEFUNCT_FEATS].reduce((h, name) => h.split(`${name} feat`).join(`<s data-tooltip="No longer exists: counts as met">${name} feat</s>`), html);
}

/** Each tradition prerequisite's tree, from the talents that carry it. */
export function traditionTreeMap(talents: readonly { tree: string; nodes: PrereqNode | null }[]): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (n: PrereqNode | null | undefined, tree: string) => {
    if (!n) return;
    if (n.type === "TRADITION" && n.requirement) map.set(n.requirement, tree);
    for (const child of n.children ?? []) walk(child, tree);
  };
  for (const t of talents) walk(t.nodes, t.tree);
  return map;
}
