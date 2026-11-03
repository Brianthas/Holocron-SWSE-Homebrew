/**
 * "The following feats no longer exist: Dodge, Melee Defense, Point Blank Shot, Power Attack, Power
 * Blast, Precise Shot, Unstoppable Combatant, Vitality Surge, and Weapon Finesse" (episode-vii,
 * Feats). A prerequisite naming one is met (Bryan, 2026-09-25; rulings.md, Classes).
 */
export const DEFUNCT_FEATS = new Set(["Dodge", "Melee Defense", "Point Blank Shot", "Power Attack", "Power Blast",
  "Precise Shot", "Unstoppable Combatant", "Vitality Surge", "Weapon Finesse"]);

/** "... is considered a Feat or Talent" / "is also a Feat or Talent" (episode-vii, Feats): either meets a prerequisite naming it. */
export const FEAT_OR_TALENT = new Set(["Weapon Specialization", "Greater Weapon Focus", "Greater Weapon Specialization"]);

/**
 * Skill names in prerequisite text, as the house skills call them: Athletics encompasses Climb, Jump
 * and Swim; Knowledge (Sciences) every other science-based Knowledge skill (episode-vii, Skills).
 */
export const SKILL_RENAMES: Record<string, string> = {
  Climb: "Athletics", Jump: "Athletics", Swim: "Athletics",
  "Knowledge (Life Sciences)": "Knowledge (Sciences)", "Knowledge (Physical Sciences)": "Knowledge (Sciences)",
  "Knowledge (Social Sciences)": "Knowledge (Sciences)",
};
