// Content the rules take out, each with the line that says so. The converter leaves these out and
// names every document in its report; Bryan signs the list off before a pack ships.

/** Force powers the house rules remove; techniques that improve them go with them. */
export const REMOVED_POWERS = new Map([
  ["Dark Transfer", 'episode-vii, Force Power Changes: "Dark Transfer is removed."'],
  ["Cloak", 'episode-vii, Force Power Changes: "Force Cloak is removed."; rulings.md, Force: it means the Cloak power'],
]);

/** The banned talent trees; src/config/talents.ts holds the list, which the sheet also reads. */
export { BANNED_TREES } from "../../src/config/talents.ts";
