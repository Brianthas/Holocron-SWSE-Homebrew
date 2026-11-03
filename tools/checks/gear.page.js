/* global game, foundry, Actor, __PACK_DOCS__ */
// Converted weapons and armor on a character, read off the rendered sheet.
// pack-docs: weapons/lightsaber, weapons/blaster-pistol, weapons/vibroaxe, armor/power-armor, armor/battle-armor, armor/mesh-armor, equipment/comlink, equipment/tool-kit, equipment/computer-spike
//
//   Gear Probe: Jedi 1, STR 10, DEX 14, CON 10.
//   Lightsaber (melee, STR): Attack +1 (BAB 1 + STR 0), Damage 3d8.
//   Blaster Pistol (ranged, DEX): Attack +3 (BAB 1 + DEX 2), Damage 3d6 + 2.
//   Vibroaxe (two-handed): Damage 3d10.
//   No armor worn: STR 10, Reflex 10 + 1 + DEX 2 = 13.
//   Power Armor worn: STR 12 (its +2 applies only while worn), Reflex 10 + 1 + 4 = 15, and the
//   two-handed Vibroaxe adds STR x 2: Damage 3d10 + 2; the one-handed Lightsaber 3d8 + 1.
//   Battle Armor worn instead: STR 10, Reflex 15. Mesh Armor worn instead: Reflex 16.

(async () => {
if (game.world.id !== "holocron-testing" || game.system.id !== "holocron") {
  return JSON.stringify({ refused: `world ${game.world.id}, system ${game.system.id}` });
}
const DOCS = __PACK_DOCS__;
const results = [];
// The detail is copied now: it can hold live document data that later steps change.
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail: JSON.parse(JSON.stringify(detail ?? null)) });
// The fixtures open the debug sheet, whose DOM these checks read (src/sheets/debug-sheet.ts).
const FLAG = { holocron: { gearFixture: true }, core: { sheetClass: "holocron.DebugSheet" } };

const old = game.actors.filter((a) => a.getFlag("holocron", "gearFixture")).map((a) => ({ id: a.id, name: a.name }));
if (old.length) await Actor.deleteDocuments(old.map((a) => a.id));
check("previous fixtures deleted", old.every((a) => !game.actors.get(a.id)), { deleted: old });

const withoutKey = (doc) => Object.fromEntries(Object.entries(doc).filter(([key]) => key !== "_key"));
const items = Object.values(DOCS).map((doc) => ({ ...withoutKey(doc), effects: doc.effects.map(withoutKey) }));
const jedi = foundry.utils.randomID();
const actor = await Actor.create({
  name: "Gear Probe", type: "character", flags: FLAG,
  system: { abilities: { str: { base: 10 }, dex: { base: 14 }, con: { base: 10 } }, progression: [{ class: jedi }] },
  items: [{ name: "Human", type: "species", system: { size: "medium" } }, { _id: jedi, name: "Jedi", type: "class", system: { heroic: true, hitDie: 10, hpFirstLevel: 30 } }, ...items],
});
check("converted weapons, armor and equipment embed and validate", actor.items.filter((i) => ["weapon", "armor", "equipment"].includes(i.type)).length === items.length
  && actor._source.items.filter((i) => ["weapon", "armor", "equipment"].includes(i.type)).length === items.length, { embedded: actor.items.size });
const gear = (name) => actor.items.getName(name)?.system;
check("equipment: Comlink Light, Tool Kit Kit with a price, Computer Spike's variable price stays empty",
  gear("Comlink")?.slot === "light" && gear("Tool Kit")?.slot === "kit" && Number.isInteger(gear("Tool Kit")?.cost) && gear("Tool Kit").cost > 0
  && gear("Computer Spike")?.cost === null && actor._source.items.find((i) => i.name === "Computer Spike")?.system.cost === null,
  { comlink: gear("Comlink")?.slot, toolKit: [gear("Tool Kit")?.slot, gear("Tool Kit")?.cost], spike: gear("Computer Spike")?.cost });

const read = async () => {
  const sheet = actor.sheet;
  await sheet.render({ force: true });
  const el = sheet.element;
  const weapon = (name) => {
    const row = [...el.querySelectorAll(".debug-weapon")].find((w) => w.querySelector("span")?.textContent.trim() === name);
    return { attack: row?.querySelector('[data-action="attack"]')?.textContent.trim(), damage: row?.querySelector('[data-action="damage"]')?.textContent.trim() };
  };
  const shown = {
    str: [...el.querySelectorAll(".debug-table tr")].find((tr) => tr.children[0]?.textContent.trim() === "STR")?.children[1]?.textContent.trim(),
    reflex: el.querySelector('[data-defense="reflex"] .total')?.textContent.trim(),
    lightsaber: weapon("Lightsaber"), pistol: weapon("Blaster Pistol"), vibroaxe: weapon("Vibroaxe"),
  };
  await sheet.close();
  return shown;
};
const wear = async (name) => {
  const updates = actor.items.filter((i) => i.type === "armor").map((i) => ({ _id: i.id, "system.worn": i.name === name }));
  await actor.updateEmbeddedDocuments("Item", updates);
};

const none = await read();
check("weapons: Lightsaber +1 / 3d8, Blaster Pistol +3 / 3d6 + 2, Vibroaxe 3d10", none.lightsaber.attack === "Attack +1" && none.lightsaber.damage === "Damage 3d8"
  && none.pistol.attack === "Attack +3" && none.pistol.damage === "Damage 3d6 + 2" && none.vibroaxe.damage === "Damage 3d10", none);
check("no armor worn: STR 10, Reflex 13 (Power Armor's +2 STR suppressed)", none.str === "10" && none.reflex === "13", none);
await wear("Power Armor");
const power = await read();
check("Power Armor worn: STR 12, Reflex 15", power.str === "12" && power.reflex === "15", power);
check("two-handed Vibroaxe adds STR x 2 (3d10 + 2), one-handed Lightsaber STR once (3d8 + 1)", power.vibroaxe.damage === "Damage 3d10 + 2" && power.lightsaber.damage === "Damage 3d8 + 1", power);
await wear("Battle Armor");
const battle = await read();
check("Battle Armor worn instead: STR back to 10, Reflex 15", battle.str === "10" && battle.reflex === "15", battle);
await wear("Mesh Armor");
const mesh = await read();
check("Mesh Armor worn instead: Reflex 16", mesh.reflex === "16", mesh);

return JSON.stringify({ world: game.world.id, build: globalThis.CONFIG?.HOLOCRON?.buildId, results });
})();
