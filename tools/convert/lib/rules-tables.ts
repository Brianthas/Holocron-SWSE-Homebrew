// Reads tables out of the episode-vii snapshot, so the converter checks pack data against the house
// rules' own cells instead of a copy typed into code (standing rule 9).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WEAPON_GROUPS, type WeaponGroupKey } from "../../../src/config/weapons.ts";

const SNAPSHOT = fileURLToPath(new URL("../../../docs/rules/episode-vii.html", import.meta.url));

const cellText = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/** Every table in the snapshot, as rows of cell text. */
export function snapshotTables(): string[][][] {
  const html = readFileSync(SNAPSHOT, "utf8");
  return [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/g)].map((table) =>
    [...(table[1] ?? "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((row) =>
      [...(row[1] ?? "").matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((cell) => cellText(cell[1] ?? ""))));
}

export interface WeaponRow { group: string; name: string; size: string; damage: string; special: string }

/**
 * The house weapon table: one table where a one-cell row heads each group ("PISTOLS") and a
 * "WEAPON NAME" row repeats the column names.
 */
export function weaponTable(): WeaponRow[] {
  const table = snapshotTables().find((t) => t.some((row) => row[0] === "WEAPON NAME"));
  if (!table) throw new Error("episode-vii: no weapon table");
  const rows: WeaponRow[] = [];
  let group = "";
  for (const row of table) {
    if (row.length === 1) { group = row[0] ?? ""; continue; }
    if (row[0] === "WEAPON NAME") continue;
    const [name = "", size = "", damage = "", special = ""] = row;
    rows.push({ group, name, size, damage, special });
  }
  return rows;
}

export interface ClassRow { hp: number; die: number; skills: number; weapons: WeaponGroupKey[]; feat: string }

/**
 * The house class table (episode-vii, Classes): a column per base class, a row per field. The table
 * writes "Advanced Melee" and "Simple" for the Advanced Melee Weapons and Simple Weapons groups.
 * Throws on any cell it cannot read, so a changed table fails the run.
 */
export function classTable(): Record<string, ClassRow> {
  const table = snapshotTables().find((t) => t[0]?.[1] === "JEDI");
  if (!table) throw new Error("episode-vii: no class table");
  const [header = [], ...rows] = table;
  const row = (label: string) => {
    const found = rows.find((r) => r[0] === label);
    if (!found) throw new Error(`episode-vii class table: no "${label}" row`);
    return found;
  };
  const read = (label: string, pattern: RegExp, cell: string) => {
    const n = Number(pattern.exec(cell)?.[1]);
    if (!Number.isInteger(n)) throw new Error(`episode-vii class table: "${label}" cell "${cell}"`);
    return n;
  };
  const group = (name: string) => {
    const key = (Object.keys(WEAPON_GROUPS) as WeaponGroupKey[]).find((k) => [name, `${name} Weapons`].includes(WEAPON_GROUPS[k]));
    if (!key) throw new Error(`episode-vii class table: weapon group "${name}"`);
    return key;
  };
  return Object.fromEntries(header.slice(1).map((title, i) => {
    const cell = (label: string) => row(label)[i + 1] ?? "";
    const name = title.charAt(0) + title.slice(1).toLowerCase();
    return [name, {
      hp: read("HP at level 1:", /^(\d+)$/, cell("HP at level 1:")),
      die: read("Hit Dice (HD):", /^d(\d+)$/, cell("Hit Dice (HD):")),
      skills: read("Trained Skills:", /^(\d+)\+INT$/, cell("Trained Skills:")),
      weapons: cell("Weapon Proficiencies:").split(", ").map(group),
      feat: cell("Starting Feats:"),
    }];
  }));
}

export interface ArmorRow { name: string; dexterity: string; special: string; beskar: string }

/** The house armor table. Its first cell spells the first armor "Assault Amor"; the name is corrected here. */
export function armorTable(): ArmorRow[] {
  const table = snapshotTables().find((t) => t[0]?.[0] === "ARMOR TYPE");
  if (!table) throw new Error("episode-vii: no armor table");
  return table.slice(1).map(([name = "", dexterity = "", special = "", beskar = ""]) => ({ name: name.replace(/^Assault Amor$/, "Assault Armor"), dexterity, special, beskar }));
}
