/* global game, Actor */
// F2 item-model check, evaluated inside the running client by tools/checks/run.ts. It embeds one item
// of every type on a character, confirms none fell out of the collection (an invalid document is
// absent from actor.items but kept in _source), then wears two armors in turn and reads Reflex and
// DT+5 off the rendered sheet. The character: Jedi 1, STR 12 (+1), DEX 16 (+3), CON 14 (+2).
//
// Refuses any world but holocron-testing. Its documents carry flags.holocron.modelsFixture.

(async () => {
if (game.world.id !== "holocron-testing" || game.system.id !== "holocron") {
  return JSON.stringify({ refused: `world ${game.world.id}, system ${game.system.id}` });
}
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail });

const old = game.actors.filter((a) => a.getFlag("holocron", "modelsFixture")).map((a) => ({ id: a.id, name: a.name }));
if (old.length) await Actor.deleteDocuments(old.map((a) => a.id));
check("previous fixtures deleted", old.every((a) => !game.actors.get(a.id)), { deleted: old });

const items = [
  { name: "Human", type: "species", system: { size: "medium", traits: [{ name: "Bonus Feat", description: "" }] } },
  { name: "Jedi", type: "class", system: { levels: 1, category: "base", heroic: true, hitDie: 10, hpFirstLevel: 30, trainedSkills: 4,
    weaponProficiencies: ["advancedMelee", "lightsabers", "pistols", "simple"], startingFeat: "Force Sensitivity", talentTrees: ["Jedi Consular"] } },
  { name: "Weapon Focus", type: "feat", system: { repeatable: true, choice: "pistols", prerequisite: { text: "Proficient with the chosen weapon", nodes: null } } },
  { name: "Dueling Stance", type: "talent", system: { tree: "Lightsaber Combat", action: "Reaction" } },
  { name: "Move Object", type: "forcePower", system: { descriptors: ["Telekinetic"], action: "Standard", bands: [{ dc: 15, text: "Medium" }, { dc: 20, text: "Large" }], copies: 2, ready: 1 } },
  { name: "Extended Move Object", type: "feature", system: { category: "forceTechnique", power: "Move Object" } },
  { name: "Blaster Pistol", type: "weapon", system: { category: "ranged", group: "pistols", damage: "3d6", damageTypes: ["Energy", "Stun"], slot: "light" } },
  { name: "Battle Armor", type: "armor", system: { reflex: { ability: "", flat: 4 }, damageReduction: 2, drBypass: "lightsabers" } },
  { name: "Assault Armor", type: "armor", system: { reflex: { ability: "str", flat: 0 } } },
  { name: "Medpac", type: "equipment", system: { quantity: 3, slot: "light" } },
];
const actor = await Actor.create({
  name: "Models Probe",
  type: "character",
  flags: { holocron: { modelsFixture: true } },
  system: { abilities: { str: { base: 12 }, dex: { base: 16 }, con: { base: 14 } } },
  items,
});
const types = [...new Set(actor.items.map((i) => i.type))].sort();
check("every item type embeds and validates", actor.items.size === items.length && actor._source.items.length === items.length && types.length === 9, {
  collection: actor.items.size, source: actor._source.items.length, types,
});
const power = actor.items.getName("Move Object");
check("a Force power keeps its bands and copies", power.system.bands.length === 2 && power.system.copies === 2 && power.system.ready === 1, {
  bands: power.system.bands, copies: power.system.copies,
});

const sheet = actor.sheet;
await sheet.render({ force: true });
const shown = (key) => sheet.element.querySelector(`[data-defense="${key}"] .total`)?.textContent.trim();
const tip = (key) => sheet.element.querySelector(`[data-defense="${key}"] .total`)?.dataset.tooltipHtml ?? "";
// No armor: Reflex 10 + 1 + 3 DEX = 14. Fortitude 10 + 1 + 2 CON = 13; DT+5 = 18.
check("unarmored Reflex uses DEX (14)", shown("reflex") === "14", { shown: shown("reflex") });
check("DT+5 is Fortitude + 5 (18)", shown("fortitude") === "13" && shown("maneuver") === "18", { fortitude: shown("fortitude"), maneuver: shown("maneuver") });

// Battle Armor worn: the DEX term becomes a flat 4, so Reflex 10 + 1 + 4 = 15.
await actor.items.getName("Battle Armor").update({ "system.worn": true });
await sheet.render({ force: true });
check("Battle Armor replaces DEX with 4 (Reflex 15)", shown("reflex") === "15" && tip("reflex").includes("Battle Armor") && !tip("reflex").includes(">DEX<"), {
  shown: shown("reflex"), tooltip: tip("reflex"),
});

// Assault Armor instead: the DEX term becomes STR's modifier, so Reflex 10 + 1 + 1 = 12.
await actor.items.getName("Battle Armor").update({ "system.worn": false });
await actor.items.getName("Assault Armor").update({ "system.worn": true });
await sheet.render({ force: true });
check("Assault Armor replaces DEX with STR (Reflex 12)", shown("reflex") === "12" && tip("reflex").includes("Assault Armor (STR)"), {
  shown: shown("reflex"), tooltip: tip("reflex"),
});

await sheet.close();
return JSON.stringify({ world: game.world.id, build: globalThis.CONFIG?.HOLOCRON?.buildId, results });
})();
