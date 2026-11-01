/**
 * Droid system groups, as the fork's droid-system pack divides them, plus the droid accessories the
 * fork keeps in its equipment pack (Hardened Systems, Translator Units).
 */
export const DROID_SYSTEM_GROUPS = {
  processor: "Processor Systems",
  locomotion: "Locomotion Systems",
  appendage: "Appendages",
  communications: "Communications Systems",
  sensor: "Sensor Systems",
  miscellaneous: "Miscellaneous Systems",
  station: "Droid Stations",
  translator: "Translator Units",
  hardened: "Hardened Systems",
} as const;

export type DroidSystemGroupKey = keyof typeof DROID_SYSTEM_GROUPS;
export const DROID_SYSTEM_GROUP_KEYS = Object.keys(DROID_SYSTEM_GROUPS) as DroidSystemGroupKey[];
