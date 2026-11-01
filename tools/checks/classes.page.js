/* global game, Actor, __PACK_DOCS__ */
// Converted classes, loaded from the converter's files in packs/_source.
// pack-docs: classes/jedi, classes/noble, classes/smuggler, classes/soldier, classes/jedi-knight, classes/jedi-master, classes/sith-lord, classes/force-disciple, classes/ace-pilot, classes/agent, classes/bounty-hunter, classes/crime-lord, classes/droid-commander, classes/elite-trooper, classes/engineer, classes/force-adept, classes/gunslinger, classes/imperial-legionnaire, classes/martial-arts-master, classes/melee-duelist, classes/officer, classes/operative, classes/sith-apprentice
//
//   Class Probe holds all 23 classes: each must embed and validate.
//   Jedi Probe takes Jedi at level 1 from the converted class (CON 12): HP 30 + CON 1 = 31 (house
//   table), BAB 1. Soldier Probe, CON 10: HP 30, BAB 1. Noble Probe, CON 10: HP 18.
//   Jedi Master reads back its four named trees, GM-approval tradition access, and Many Shades of the
//   Force and Telekinetic Vigilance.

(async () => {
if (game.world.id !== "holocron-testing" || game.system.id !== "holocron") {
  return JSON.stringify({ refused: `world ${game.world.id}, system ${game.system.id}` });
}
const DOCS = __PACK_DOCS__;
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail });
const FLAG = { holocron: { classesFixture: true } };

const old = game.actors.filter((a) => a.getFlag("holocron", "classesFixture")).map((a) => ({ id: a.id, name: a.name }));
if (old.length) await Actor.deleteDocuments(old.map((a) => a.id));
check("previous fixtures deleted", old.every((a) => !game.actors.get(a.id)), { deleted: old });

const withoutKey = (doc) => Object.fromEntries(Object.entries(doc).filter(([key]) => key !== "_key"));
const classes = Object.values(DOCS).map(withoutKey);
const human = { name: "Human", type: "species", system: { size: "medium" } };
const holder = await Actor.create({ name: "Class Probe", type: "character", flags: FLAG, items: [human, ...classes] });
check("all 23 converted classes embed and validate", holder.items.filter((i) => i.type === "class").length === 23 && holder._source.items.filter((i) => i.type === "class").length === 23,
  { embedded: holder.items.filter((i) => i.type === "class").length, source: holder._source.items.filter((i) => i.type === "class").length });

const levelOne = async (name, file, con) => {
  const cls = withoutKey(DOCS[file]);
  const actor = await Actor.create({ name, type: "character", flags: FLAG, system: { abilities: { con: { base: con } }, progression: [{ class: cls._id }] }, items: [human, cls] });
  const sheet = actor.sheet;
  await sheet.render({ force: true });
  const shown = {
    hp: sheet.element.querySelector('[data-resource="hp"] .total')?.textContent.trim(),
    head: sheet.element.querySelector(".debug-head p")?.textContent.trim(),
    problems: [...sheet.element.querySelectorAll(".debug-problems li")].map((li) => li.textContent.trim()),
  };
  await sheet.close();
  return shown;
};
const jedi = await levelOne("Jedi Probe", "classes/jedi", 12);
check("Jedi 1 from the converted class: HP 31, BAB +1", jedi.hp === "0 / 31" && jedi.head?.includes("BAB +1") && !jedi.problems.length, jedi);
const soldier = await levelOne("Soldier Probe", "classes/soldier", 10);
check("Soldier 1: HP 30", soldier.hp === "0 / 30" && !soldier.problems.length, soldier);
const noble = await levelOne("Noble Probe", "classes/noble", 10);
check("Noble 1: HP 18", noble.hp === "0 / 18" && !noble.problems.length, noble);

const master = holder.items.find((i) => i.name === "Jedi Master")?.system;
check("Jedi Master: four named trees, GM-approval traditions, two single talents, secrets at 2-5",
  JSON.stringify(master?.talentTrees) === JSON.stringify(["Duelist", "Jedi Archivist", "Jedi Instructor", "Lightsaber Forms"])
  && master?.traditionApproval === true && JSON.stringify(master?.talents) === JSON.stringify(["Many Shades of the Force", "Telekinetic Vigilance"])
  && JSON.stringify(master?.secretLevels) === JSON.stringify([2, 3, 4, 5]),
  { trees: master?.talentTrees, traditionApproval: master?.traditionApproval, talents: master?.talents, secrets: master?.secretLevels });

return JSON.stringify({ world: game.world.id, build: globalThis.CONFIG?.HOLOCRON?.buildId, results });
})();
