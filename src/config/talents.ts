/** The trees Force Sensitivity grants: the general Force talent trees (rulings.md, Talent trees). */
export const FORCE_SENSITIVITY_TREES = ["Alter", "Control", "Dark Side", "Guardian Spirit", "Light Side", "Sense"] as const;

/**
 * episode-vii, Jedi: "The following talent trees have been banned"; "Zeison Sha Warrior" is the
 * Zeison Sha tree. The trees' talents stay in the packs (a ban is a play restriction); no class
 * grants the trees.
 */
export const BANNED_TREES = new Set(["Agent of Ossus", "Aing-Tii Monk", "Iron Knight", "White Current Adept", "Zeison Sha"]);

/** The Jedi trees another tradition replaces; Lightsaber Combat stays with every Jedi (rulings.md, Talent trees). */
export const JEDI_ORDER_TREES = ["Jedi Consular", "Jedi Guardian", "Jedi Sentinel"] as const;

/**
 * Force traditions for the Jedi class (episode-vii, Jedi: "If from another Tradition (or Order), you
 * lose access to the Jedi talent trees and gain the talent tree associated with the chosen
 * Tradition"). `pick`: the text lists several trees and the character picks one (mockup 1). `species`:
 * the text limits it to a species, shown as a note, never enforced. Ithorian Priesthood has no tree
 * in the packs and is left out (rulings.md). Keys are the stored values; labels stay separate.
 */
export const TRADITIONS: Record<string, { label: string; trees?: readonly string[]; pick?: readonly string[]; species?: string }> = {
  jediOrder: { label: "Jedi Order", trees: JEDI_ORDER_TREES },
  sithOrder: { label: "Sith Order", pick: ["Believer Disciple", "Blazing Chain", "Krath"] },
  baranDo: { label: "Baran Do", trees: ["Baran Do Sage"], species: "Kel Dor" },
  dathomiriWitches: { label: "Dathomiri Witches", pick: ["Dathomiri Witch", "Disciple of Twilight", "Krath"] },
  felucianShamans: { label: "Felucian Shamans", trees: ["Felucian Shaman"], species: "Felucian" },
  imperialLegion: { label: "Imperial Legion", pick: ["Jensaarai Defender", "Kilian Ranger"] },
  jalShey: { label: "Jal Shey", trees: ["Jal Shey"] },
  keetael: { label: "Keetael", trees: ["Keetael"], species: "Draethos" },
  lukaSene: { label: "Luka Sene", trees: ["Luka Sene"], species: "Miraluka" },
  matukai: { label: "Matukai", trees: ["Matukai Adept"] },
  orderOfShasa: { label: "Order of Shasa", trees: ["Order of Shasa"], species: "Selkath" },
};
