// Checks packs/_source as it stands, whoever wrote it: the converter, a hand edit, a merge. Each check
// tests one thing and names the file it found it in. CI runs it on every push.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SKILL_KEYS } from "../../../src/config/skills.ts";
import { GRANT_FLAGS, isGrantKind, isSelector } from "../../../src/effects/selectors.ts";
import { BANNED_TREES, REMOVED_POWERS } from "../rules.ts";
import { fileName } from "./pack.ts";
import { classTable } from "./rules-tables.ts";

export interface PackFile { pack: string; file: string; doc: unknown }
export interface Validation { problems: string[]; effects: number; changes: number }

const SYSTEM_JSON = fileURLToPath(new URL("../../../static/system.json", import.meta.url));
interface PackFolder { name: string; packs?: string[]; folders?: PackFolder[] }
/** The parts of system.json the checks read. */
export interface SystemManifest {
  id: string;
  documentTypes: { Item: object };
  packs: { name: string; type: string; system?: string; path?: string }[];
  packFolders?: PackFolder[];
}
export const SYSTEM = JSON.parse(readFileSync(SYSTEM_JSON, "utf8")) as SystemManifest;
const folderPacks = (folders: PackFolder[] = []): string[] => folders.flatMap((f) => [...(f.packs ?? []), ...folderPacks(f.folders)]);
const ID = /^[A-Za-z0-9]{16}$/;
const DOC_KEYS = "_id,_key,effects,flags,folder,name,sort,system,type";
const EFFECT_KEYS = "_id,_key,disabled,duration,flags,img,name,system,transfer,type";
const CHANGE_KEYS = "bonusType,condition,key,phase,type,value";
/** The effect type src/holocron.ts registers HolocronEffectModel for. */
const EFFECT_TYPE = "base";

/** What the description cleanup (lib/html.ts) exists to remove, each found by its own marker. */
export const CLEANUP_MARKERS: [string, RegExp][] = [
  ["the wiki's Reference Book line", /Reference Book:/],
  ["the wiki's See also line", /See also:/i],
  ["the wiki's wrapper", /mw-parser-output/],
  ["the wiki's styling hooks", /class="(?:wikitable|mw-)/],
  ["a link", /<a\b/],
  ["a wiki address", /fandom\.com/],
  ["a house-rule label", /tovec\.wikidot\.com/],
  ["a Homebrew label or section", /Homebrew/],
  ["the wiki's untested fan-content notice", /has not been reviewed in a meaningful manner/],
  ["the wiki's tested fan-content notice", /Tested per the/],
  ["the notice pointing at a fan page", /You may be looking for/],
  ["a fan creator's tag", / Creations\b/],
];

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const keys = (v: Json) => Object.keys(v).sort().join(",");
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const strings = (v: unknown): string[] =>
  typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : isObject(v) ? Object.values(v).flatMap(strings) : [];
const mostCommon = (values: string[]) => {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
};

export function validatePacks(files: PackFile[], manifest: SystemManifest = SYSTEM): Validation {
  const ITEM_TYPES = new Set(Object.keys(manifest.documentTypes.Item));
  const problems: string[] = [];
  let effects = 0;
  let changes = 0;
  const docs: { at: string; pack: string; doc: Json; system: Json }[] = [];
  const ids = new Map<string, string>();
  const sourceIds = new Map<string, string>();

  for (const { pack, file, doc } of files) {
    const at = `${pack}/${file}`;
    const fail = (message: string) => problems.push(`${at}: ${message}`);
    if (!isObject(doc) || !isObject(doc["system"]) || !isObject(doc["flags"]) || !Array.isArray(doc["effects"])) { fail("not an item document"); continue; }
    const system = doc["system"];
    if (keys(doc) !== DOC_KEYS) fail(`top-level keys ${keys(doc)}, expected ${DOC_KEYS}`);
    const id = String(doc["_id"]);
    if (!ID.test(id)) fail(`_id "${id}" is not 16 letters and digits`);
    if (doc["_key"] !== `!items!${id}`) fail(`_key ${JSON.stringify(doc["_key"])} does not match _id`);
    const clash = ids.get(id);
    if (clash) fail(`_id ${id} also used by ${clash}`);
    ids.set(id, at);
    const name = doc["name"];
    if (typeof name !== "string" || !name || name !== name.trim()) fail(`name ${JSON.stringify(name)}`);
    if (!ITEM_TYPES.has(String(doc["type"]))) fail(`type "${String(doc["type"])}" is not an item type in system.json`);
    if (doc["folder"] !== null || typeof doc["sort"] !== "number") fail("folder must be null and sort a number");
    if (typeof system["description"] !== "string") fail("system.description is not a string");
    if (typeof name === "string" && fileName({ name, type: String(doc["type"]), system }) !== file) fail(`file should be ${fileName({ name, type: String(doc["type"]), system })}`);

    const flags = doc["flags"];
    const holocron = flags["holocron"];
    if (keys(flags) !== "holocron" || !isObject(holocron)) fail(`flags ${keys(flags)}, expected holocron only`);
    else if ("sourceId" in holocron) {
      const sourceId = String(holocron["sourceId"]);
      if (!ID.test(sourceId)) fail(`flags.holocron.sourceId "${sourceId}" is not a fork id`);
      const twice = sourceIds.get(sourceId);
      if (twice) fail(`converted from the same fork document as ${twice}`);
      sourceIds.set(sourceId, at);
    }

    for (const text of strings(system)) {
      for (const [what, marker] of CLEANUP_MARKERS) if (marker.test(text)) fail(`${what} is left in the text`);
    }
    if (REMOVED_POWERS.has(String(name)) || [...REMOVED_POWERS.keys()].some((p) => name === `Improved ${p}`)) fail("the house rules remove this power or its technique (tools/convert/rules.ts)");

    const description = `${String(name)} ${String(system["description"] ?? "")}`.toLowerCase();
    const effectIds = new Set<string>();
    for (const effect of doc["effects"]) {
      effects++;
      if (!isObject(effect) || !isObject(effect["system"])) { fail("an effect that is not an effect document"); continue; }
      const eid = String(effect["_id"]);
      if (keys(effect) !== EFFECT_KEYS) fail(`effect keys ${keys(effect)}, expected ${EFFECT_KEYS}`);
      if (!ID.test(eid) || effectIds.has(eid)) fail(`effect _id "${eid}" is not a unique 16-character id`);
      effectIds.add(eid);
      if (effect["_key"] !== `!items.effects!${id}.${eid}`) fail(`effect _key ${JSON.stringify(effect["_key"])} does not match its ids`);
      if (effect["type"] !== EFFECT_TYPE) fail(`effect type ${JSON.stringify(effect["type"])}, expected "${EFFECT_TYPE}"`);
      // Only a transferred effect reaches the character that owns the item.
      if (effect["transfer"] !== true || effect["disabled"] !== false) fail("effect must transfer and not be disabled");
      const list = effect["system"]["changes"];
      if (keys(effect["system"]) !== "changes" || !Array.isArray(list) || !list.length) { fail("effect system must hold a non-empty changes list"); continue; }
      for (const change of list) {
        changes++;
        if (!isObject(change)) { fail("a change that is not an object"); continue; }
        const at = `change ${JSON.stringify(change["key"])}`;
        if (keys(change) !== CHANGE_KEYS) fail(`${at}: keys ${keys(change)}, expected ${CHANGE_KEYS}`);
        const key = String(change["key"]);
        const value = change["value"];
        const bonusType = change["bonusType"];
        // character.ts derives ability scores between the two phases.
        const phase = change["type"] === "bonus" && key.startsWith("ability.") ? "initial" : "derived";
        if (change["phase"] !== phase) fail(`${at}: phase ${JSON.stringify(change["phase"])}, expected "${phase}"`);
        if (typeof change["condition"] !== "string" || (change["type"] !== "bonus" && change["condition"])) fail(`${at}: only a bonus takes a condition`);
        if (typeof bonusType !== "string" || (change["type"] !== "bonus" && bonusType)) fail(`${at}: only a bonus takes a bonus type`);
        switch (change["type"]) {
          case "bonus":
            if (!isSelector(key)) fail(`${at}: not a bonus selector (src/effects/selectors.ts)`);
            if (!(typeof value === "number" && Number.isFinite(value)) && !(typeof value === "string" && value.includes("@"))) fail(`${at}: value ${JSON.stringify(value)} is neither a number nor a formula`);
            // A bonus type the text never states is a typo or an invention: it decides what stacks.
            if (typeof bonusType === "string" && bonusType && !(/^[a-z]+$/.test(bonusType) && new RegExp(`\\b${bonusType}\\b`).test(description))) fail(`${at}: bonus type "${bonusType}" is not stated in the item's name or text`);
            break;
          case "grant":
            if (!isGrantKind(key)) fail(`${at}: not a grant kind (src/effects/selectors.ts)`);
            else if (key === "skill.trained" && !(SKILL_KEYS as readonly unknown[]).includes(value)) fail(`${at}: "${String(value)}" is not a skill key`);
            else if (key === "flag" && !(GRANT_FLAGS as readonly unknown[]).includes(value)) fail(`${at}: no code reads the flag "${String(value)}"`);
            else if (key.startsWith("proficiency.")) fail(`${at}: no code reads ${key} grants yet`);
            break;
          case "dice":
            if (!key.startsWith("damage.") || !isSelector(key)) fail(`${at}: not a damage selector`);
            if (!Number.isInteger(value) || value === 0) fail(`${at}: value ${JSON.stringify(value)} is not a whole number of dice`);
            break;
          default:
            fail(`${at}: change type ${JSON.stringify(change["type"])} is not bonus, grant or dice (src/effects/changes.ts)`);
        }
      }
    }
    docs.push({ at, pack, doc, system });
  }

  // system.json and packs/_source name the same packs. Foundry drops a pack it cannot read with only
  // a warning in the server log, so a mismatch here would otherwise show as a missing compendium.
  const sourcePacks = new Set(files.map((f) => f.pack));
  const inFolders = folderPacks(manifest.packFolders);
  for (const declared of manifest.packs) {
    const at = `system.json: pack "${declared.name}"`;
    if (!sourcePacks.has(declared.name)) problems.push(`${at} has no documents in packs/_source`);
    if (declared.type !== "Item" || declared.system !== manifest.id || declared.path !== `packs/${declared.name}`) {
      problems.push(`${at} must be type Item, system ${manifest.id}, path packs/${declared.name}`);
    }
    const folders = inFolders.filter((p) => p === declared.name).length;
    if (folders !== 1) problems.push(`${at} is in ${folders} pack folders, expected 1`);
  }
  for (const pack of sourcePacks) if (!manifest.packs.some((p) => p.name === pack)) problems.push(`${pack}: not a pack in system.json`);
  for (const pack of inFolders) if (!manifest.packs.some((p) => p.name === pack)) problems.push(`system.json: pack folder names "${pack}", which is not a pack`);

  // One shape per pack and per type: a builder that writes a different shape shows up here.
  for (const pack of new Set(docs.map((d) => d.pack))) {
    const inPack = docs.filter((d) => d.pack === pack);
    const type = mostCommon(inPack.map((d) => String(d.doc["type"])));
    for (const d of inPack) if (d.doc["type"] !== type) problems.push(`${d.at}: type "${String(d.doc["type"])}" in a pack of ${type}`);
  }
  for (const type of new Set(docs.map((d) => String(d.doc["type"])))) {
    const ofType = docs.filter((d) => d.doc["type"] === type);
    const shape = mostCommon(ofType.map((d) => keys(d.system))) ?? "";
    for (const d of ofType) {
      const have = Object.keys(d.system);
      const want = shape.split(",");
      if (keys(d.system) !== shape) problems.push(`${d.at}: system keys differ from the other ${type} items (missing ${want.filter((k) => !have.includes(k)).join(", ") || "none"}; extra ${have.filter((k) => !want.includes(k)).join(", ") || "none"})`);
    }
  }

  // References between packs, by name.
  const names = (type: string) => new Set(docs.filter((d) => d.doc["type"] === type).map((d) => String(d.doc["name"])));
  const trees = new Set(docs.filter((d) => d.doc["type"] === "talent").map((d) => String(d.system["tree"])));
  const [talents, feats, powers] = [names("talent"), names("feat"), names("forcePower")];
  const house = classTable();
  const baseClasses = new Set<string>();
  for (const { at, doc, system } of docs) {
    if (doc["type"] === "feature" && system["power"] !== "" && !powers.has(String(system["power"]))) problems.push(`${at}: power "${String(system["power"])}" is not a Force power`);
    if (doc["type"] !== "class") continue;
    for (const tree of list(system["talentTrees"])) {
      if (BANNED_TREES.has(tree)) problems.push(`${at}: grants the banned tree "${tree}"`);
      else if (!trees.has(tree)) problems.push(`${at}: tree "${tree}" has no talents`);
    }
    for (const talent of list(system["talents"])) if (!talents.has(talent)) problems.push(`${at}: talent "${talent}" is not a talent`);
    if (system["startingFeat"] !== "" && !feats.has(String(system["startingFeat"]))) problems.push(`${at}: starting feat "${String(system["startingFeat"])}" is not a feat`);
    if (system["category"] !== "base") continue;
    const name = String(doc["name"]);
    baseClasses.add(name);
    const row = house[name];
    if (!row) { problems.push(`${at}: base class not in the house class table`); continue; }
    const fields: [string, unknown, unknown][] = [
      ["hpFirstLevel", system["hpFirstLevel"], row.hp], ["hitDie", system["hitDie"], row.die], ["trainedSkills", system["trainedSkills"], row.skills],
      ["startingFeat", system["startingFeat"], row.feat],
      ["weaponProficiencies", list(system["weaponProficiencies"]).sort().join(", "), [...row.weapons].sort().join(", ")],
    ];
    for (const [field, value, table] of fields) if (value !== table) problems.push(`${at}: ${field} ${JSON.stringify(value)}, house class table ${JSON.stringify(table)}`);
  }
  for (const name of Object.keys(house)) if (!baseClasses.has(name)) problems.push(`classes: ${name} is in the house class table but not in the pack as a base class`);
  return { problems, effects, changes };
}
