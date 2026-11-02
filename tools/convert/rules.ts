// Content the rules take out, each with the line that says so. The converter leaves these out and
// names every document in its report; Bryan signs the list off before a pack ships.

/** Force powers the house rules remove; techniques that improve them go with them. */
export const REMOVED_POWERS = new Map([
  ["Dark Transfer", 'episode-vii, Force Power Changes: "Dark Transfer is removed."'],
  ["Cloak", 'episode-vii, Force Power Changes: "Force Cloak is removed."; rulings.md, Force: it means the Cloak power'],
]);

/**
 * episode-vii, Jedi: "The following talent trees have been banned"; "Zeison Sha Warrior" is the
 * Zeison Sha tree. The trees' talents stay in the packs (a ban is a play restriction); no class
 * grants the trees.
 */
export const BANNED_TREES = new Set(["Agent of Ossus", "Aing-Tii Monk", "Iron Knight", "White Current Adept", "Zeison Sha"]);
