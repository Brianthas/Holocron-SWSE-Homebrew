import { createHash } from "node:crypto";

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * A 16-character document id derived from a seed. Rebuilding the packs never changes an item's id,
 * so a copy already on a character keeps its link to the compendium. SHA-256 of the seed, first 16
 * bytes mapped onto Foundry's id alphabet. Seeds carry the pack (and the tree, for talents) because
 * one name can appear in several.
 */
export function idFor(seed: string): string {
  const digest = createHash("sha256").update(seed).digest();
  let id = "";
  for (let i = 0; i < 16; i++) id += ID_ALPHABET[(digest[i] ?? 0) % ID_ALPHABET.length];
  return id;
}

/** "Force Power Mastery" to "force-power-mastery". */
export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
