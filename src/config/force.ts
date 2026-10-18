/**
 * Force power descriptors, as the fork tags its powers. Force Grip carries Dark Side
 * (episode-vii, Force Power Changes: "Force Grip is a dark side power").
 */
export const FORCE_DESCRIPTORS = {
  darkSide: "Dark Side",
  lightSide: "Light Side",
  lightsaberForm: "Lightsaber Form",
  mindAffecting: "Mind-Affecting",
  telekinetic: "Telekinetic",
} as const;

export type ForceDescriptorKey = keyof typeof FORCE_DESCRIPTORS;
export const FORCE_DESCRIPTOR_KEYS = Object.keys(FORCE_DESCRIPTORS) as ForceDescriptorKey[];
