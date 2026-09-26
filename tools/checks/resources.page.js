/* global game, foundry, Actor */
// F2 resources check, evaluated inside the running client by tools/checks/run.ts. One character, read
// off the rendered sheet. The character: STR 12, CON 14 (+2), INT 12, WIS 13; levels Jedi, Jedi,
// Soldier, Jedi (level 4 takes +1 DEX and +1 WIS), then a fifth entry naming a class it does not have.
//
//   Hit points: Jedi level 1 is 30; later levels 6 + 7 + 5 + 0; CON +2 on each of 5 levels = 10;
//               Toughness +5 (once) + 5 (its @level) = 10. Total 30 + 18 + 10 + 10 = 68.
//   Force Points per day: level 5 gives 1; Force Sensitivity +1; Force Boon +2. Total 4; Destiny cap 4.
//   Dark Side maximum: WIS 13 + 1 = 14, half rounded up = 7.
//   Languages: INT 12 + Linguist 4 = 16: "Commons and Rares".
//   Slots: Light 12, Kit 1 + 1 = 2; Extended Capacity doubles both: 24 / 4.
//   Heroic level 4 (the fifth level's class is missing), level 5; the missing class is reported.
//   HP state: 0 staggered; -1 and -68 dying; -69 dead.
//
// Refuses any world but holocron-testing. Its documents carry flags.holocron.resourcesFixture.

(async () => {
if (game.world.id !== "holocron-testing" || game.system.id !== "holocron") {
  return JSON.stringify({ refused: `world ${game.world.id}, system ${game.system.id}` });
}
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail });

const old = game.actors.filter((a) => a.getFlag("holocron", "resourcesFixture")).map((a) => ({ id: a.id, name: a.name }));
if (old.length) await Actor.deleteDocuments(old.map((a) => a.id));
check("previous fixtures deleted", old.every((a) => !game.actors.get(a.id)), { deleted: old });

const jedi = foundry.utils.randomID();
const soldier = foundry.utils.randomID();
const feat = (name, changes) => ({ name, type: "feat", effects: [{ name, transfer: true, system: { changes } }] });
const bonus = (key, value, extra = {}) => ({ key, type: "bonus", value, phase: "derived", ...extra });
const actor = await Actor.create({
  name: "Resources Probe",
  type: "character",
  flags: { holocron: { resourcesFixture: true } },
  system: {
    abilities: { str: { base: 12 }, con: { base: 14 }, int: { base: 12 }, wis: { base: 13 } },
    progression: [
      { class: jedi },
      { class: jedi, hitPoints: 6 },
      { class: soldier, hitPoints: 7 },
      { class: jedi, hitPoints: 5, increases: ["dex", "wis"] },
      { class: "noSuchClass00000", hitPoints: 0 },
    ],
    hp: { value: 0 },
  },
  items: [
    { name: "Human", type: "species", system: { size: "medium" } },
    { _id: jedi, name: "Jedi", type: "class", system: { heroic: true, hitDie: 10, hpFirstLevel: 30 } },
    { _id: soldier, name: "Soldier", type: "class", system: { heroic: true, hitDie: 10, hpFirstLevel: 30 } },
    feat("Toughness", [bonus("hp.max", 5, { bonusType: "toughness" }), bonus("hp.max", "@level")]),
    feat("Force Sensitivity", [bonus("forcePoints", 1)]),
    feat("Force Boon", [bonus("forcePoints", 2)]),
    feat("Linguist", [bonus("languages.int", 4)]),
    feat("Extended Capacity", [{ key: "flag", type: "grant", value: "extendedCapacity", phase: "derived" }]),
  ],
});

const sheet = actor.sheet;
await sheet.render({ force: true });
const shown = (key) => sheet.element.querySelector(`[data-resource="${key}"] .total`)?.textContent.trim();
const s = actor.system;

check("level 5, heroic level 4, BAB 4", s.level === 5 && s.heroicLevel === 4 && s.bab === 4, { level: s.level, heroic: s.heroicLevel, bab: s.bab });
check("the missing class is reported on the sheet", sheet.element.querySelector(".debug-problems")?.textContent.includes("noSuchClass00000"), {
  problems: s.problems,
});
check("level 4's increases apply (DEX 11, WIS 14)", s.scores.dex.value === 11 && s.scores.wis.value === 14, { dex: s.scores.dex.value, wis: s.scores.wis.value });
check("hit points 68 (Toughness's +5 once, its @level resolved)", shown("hp") === "0 / 68", { shown: shown("hp"), terms: s.hpMax.applied });
check("at exactly 0 HP the state is staggered", shown("hpState") === "staggered", { shown: shown("hpState") });
check("Force Points per day 4, Destiny cap 4", shown("forcePoints") === "4" && shown("destiny") === "4", { fp: shown("forcePoints"), destiny: shown("destiny") });
check("Dark Side maximum 7", shown("darkSide") === "0 / 7", { shown: shown("darkSide") });
check("languages: INT 12 + Linguist understands Commons and Rares", shown("understands") === "Commons and Rares", { shown: shown("understands") });
check("slots 24 / 4 with Extended Capacity", shown("slots") === "24 / 4", { shown: shown("slots") });

// The edges (rulings.md, Death): -1 is dying; -68 (exactly minus the maximum) is still dying; -69 is dead.
const stateAt = async (value) => {
  await actor.update({ "system.hp.value": value });
  await sheet.render({ force: true });
  return shown("hpState");
};
const edges = { atMinus1: await stateAt(-1), atMinus68: await stateAt(-68), atMinus69: await stateAt(-69) };
check("dying down to minus the maximum, dead below it", edges.atMinus1 === "dying" && edges.atMinus68 === "dying" && edges.atMinus69 === "dead", edges);

await sheet.close();
return JSON.stringify({ world: game.world.id, build: globalThis.CONFIG?.HOLOCRON?.buildId, results });
})();
