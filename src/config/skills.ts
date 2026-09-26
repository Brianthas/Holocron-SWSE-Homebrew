import type { AbilityKey } from "./abilities.ts";

/**
 * The house skill list. The core rulebook's skills (Table 4-2, p62) with the episode-vii changes:
 * Athletics replaces Climb, Jump and Swim, and keeps their Strength key ability; Biotech is new and
 * uses Wisdom; Knowledge (Sciences) covers the science Knowledge skills; Use the Force uses Wisdom
 * ("Using the Force requires Wisdom instead of Charisma").
 */
export const SKILLS = {
  acrobatics: { label: "Acrobatics", ability: "dex" },
  athletics: { label: "Athletics", ability: "str" },
  biotech: { label: "Biotech", ability: "wis" },
  deception: { label: "Deception", ability: "cha" },
  endurance: { label: "Endurance", ability: "con" },
  gatherInformation: { label: "Gather Information", ability: "cha" },
  initiative: { label: "Initiative", ability: "dex" },
  knowledgeBureaucracy: { label: "Knowledge (Bureaucracy)", ability: "int" },
  knowledgeGalacticLore: { label: "Knowledge (Galactic Lore)", ability: "int" },
  knowledgeSciences: { label: "Knowledge (Sciences)", ability: "int" },
  knowledgeTactics: { label: "Knowledge (Tactics)", ability: "int" },
  knowledgeTechnology: { label: "Knowledge (Technology)", ability: "int" },
  mechanics: { label: "Mechanics", ability: "int" },
  perception: { label: "Perception", ability: "wis" },
  persuasion: { label: "Persuasion", ability: "cha" },
  pilot: { label: "Pilot", ability: "dex" },
  ride: { label: "Ride", ability: "dex" },
  stealth: { label: "Stealth", ability: "dex" },
  survival: { label: "Survival", ability: "wis" },
  treatInjury: { label: "Treat Injury", ability: "wis" },
  useComputer: { label: "Use Computer", ability: "int" },
  useTheForce: { label: "Use the Force", ability: "wis" },
} as const satisfies Record<string, { label: string; ability: AbilityKey }>;

export type SkillKey = keyof typeof SKILLS;
export const SKILL_KEYS = Object.keys(SKILLS) as SkillKey[];
