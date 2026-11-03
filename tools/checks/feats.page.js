/* global game, foundry, Actor, __PACK_DOCS__ */
// Converted feats on a character, read off the rendered sheet. The feats are the converter's own
// files in packs/_source, not hand-built fixtures.
// pack-docs: feats/improved-defenses, feats/toughness, feats/martial-arts-i, feats/force-sensitivity, feats/linguist, feats/extended-capacity, feats/extra-second-wind, feats/improved-damage-threshold, feats/force-of-personality, feats/weapon-focus
//
//   Feat Probe: Jedi 1 (level-1 HP 30), STR 10, DEX 10, CON 12, INT 12, WIS 10, CHA 14, no Defense
//   points. Each total is the engine's rule plus the feats' changes:
//   HP 30 + CON 1 + Toughness 5 + Toughness 1 per level = 37.
//   Reflex 10 + level 1 + DEX 0 + Improved Defenses 1 = 12; Martial Arts I adds nothing to it
//   (rulings.md, Attacks: no dodge bonus).
//   Fortitude 10 + 1 + CON 1 + Improved Defenses 1 = 13. Will 10 + 1 + WIS 0 + 1 = 12 (Force of
//   Personality carries no change, so CHA 14 must not reach it).
//   DT+5 = Fortitude 13 + 5 + Improved Damage Threshold 5 = 23.
//   Force Points per day: 1 at level 1 + Force Sensitivity 1 = 2. Second Wind 1 + Extra Second Wind 1 = 2.
//   Languages: INT 12 + Linguist 4 = 16, "Commons and Rares". Slots: Light STR 10, Kit STR mod 0 + 1,
//   doubled by Extended Capacity: 20 / 2.
//   Control: the same character without the feats reads HP 31, Reflex 11, Will 11, FP 1, slots 10 / 1.

(async () => {
if (game.world.id !== "holocron-testing" || game.system.id !== "holocron") {
  return JSON.stringify({ refused: `world ${game.world.id}, system ${game.system.id}` });
}
const DOCS = __PACK_DOCS__;
const results = [];
// The detail is copied now: it can hold live document data that later steps change.
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail: JSON.parse(JSON.stringify(detail ?? null)) });
// The fixtures open the debug sheet, whose DOM these checks read (src/sheets/debug-sheet.ts).
const FLAG = { holocron: { featsFixture: true }, core: { sheetClass: "holocron.DebugSheet" } };

const old = game.actors.filter((a) => a.getFlag("holocron", "featsFixture")).map((a) => ({ id: a.id, name: a.name }));
if (old.length) await Actor.deleteDocuments(old.map((a) => a.id));
check("previous fixtures deleted", old.every((a) => !game.actors.get(a.id)), { deleted: old });

const character = (name, items) => {
  const jedi = foundry.utils.randomID();
  return Actor.create({
    name, type: "character", flags: FLAG,
    system: {
      abilities: { str: { base: 10 }, dex: { base: 10 }, con: { base: 12 }, int: { base: 12 }, wis: { base: 10 }, cha: { base: 14 } },
      progression: [{ class: jedi }],
    },
    items: [
      { name: "Human", type: "species", system: { size: "medium" } },
      { _id: jedi, name: "Jedi", type: "class", system: { heroic: true, hitDie: 10, hpFirstLevel: 30 } },
      ...items,
    ],
  });
};
// Embedded as Foundry embeds a compendium item: the stored document, with its effects, minus _key.
const withoutKey = (doc) => Object.fromEntries(Object.entries(doc).filter(([key]) => key !== "_key"));
const feats = Object.values(DOCS).map((doc) => ({ ...withoutKey(doc), effects: doc.effects.map(withoutKey) }));
const probe = await character("Feat Probe", feats);
const control = await character("Feat Control", []);
check("every converted feat embeds and validates", probe.items.filter((i) => i.type === "feat").length === feats.length
  && probe._source.items.filter((i) => i.type === "feat").length === feats.length, {
  embedded: probe.items.filter((i) => i.type === "feat").length, expected: feats.length,
});

const read = async (actor) => {
  const sheet = actor.sheet;
  await sheet.render({ force: true });
  const resource = (key) => sheet.element.querySelector(`[data-resource="${key}"] .total`)?.textContent.trim();
  const defense = (key) => sheet.element.querySelector(`[data-defense="${key}"] .total`)?.textContent.trim();
  const shown = {
    hp: resource("hp"), fp: resource("forcePoints"), secondWind: resource("secondWind"), understands: resource("understands"), slots: resource("slots"),
    reflex: defense("reflex"), fortitude: defense("fortitude"), will: defense("will"), maneuver: defense("maneuver"),
    reflexTooltip: sheet.element.querySelector('[data-defense="reflex"] .total')?.dataset.tooltipHtml ?? "",
  };
  await sheet.close();
  return shown;
};
const p = await read(probe);
const c = await read(control);
const { reflexTooltip, ...shown } = p;
check("control reads the engine's base numbers", c.hp === "0 / 31" && c.reflex === "11" && c.will === "11" && c.fp === "1" && c.slots === "10 / 1", c);
check("hit points 37 (Toughness 5 and 1 per level)", p.hp === "0 / 37", shown);
check("Reflex 12: Improved Defenses named, Martial Arts I absent", p.reflex === "12"
  && reflexTooltip.includes("Improved Defenses") && !reflexTooltip.includes("Martial Arts"), { reflex: p.reflex, reflexTooltip });
check("Martial Arts I carries only its unarmed die", JSON.stringify(probe.items.getName("Martial Arts I").effects.contents[0]?.system.changes.map((c) => [c.type, c.key, c.value]))
  === JSON.stringify([["dice", "damage.unarmed", 1]]), { changes: probe.items.getName("Martial Arts I").effects.contents[0]?.system.changes });
check("Fortitude 13, Will 12 (Force of Personality adds nothing)", p.fortitude === "13" && p.will === "12", shown);
check("DT+5 23 with Improved Damage Threshold", p.maneuver === "23", shown);
check("Force Points per day 2, Second Wind 2", p.fp === "2" && p.secondWind === "0 / 2", shown);
check("Linguist: Commons and Rares; Extended Capacity: slots 20 / 2", p.understands === "Commons and Rares" && p.slots === "20 / 2", shown);
check("Toughness and Weapon Focus are repeatable, Force of Personality is not",
  probe.items.getName("Toughness").system.repeatable && probe.items.getName("Weapon Focus").system.repeatable
  && !probe.items.getName("Force of Personality").system.repeatable, {});
check("Force Sensitivity has no prerequisite", probe.items.getName("Force Sensitivity").system.prerequisite.text === "", {
  prerequisite: probe.items.getName("Force Sensitivity").system.prerequisite,
});
check("no effect change was reported as a bad key", !probe.system.problems?.length, { problems: probe.system.problems });

return JSON.stringify({ world: game.world.id, build: globalThis.CONFIG?.HOLOCRON?.buildId, results });
})();
