/* global game, foundry, Actor, __PACK_DOCS__ */
// Converted talents on a character, read off the rendered sheet. The talents are the converter's own
// files in packs/_source, not hand-built fixtures.
// pack-docs: talents/jedi-consular--force-of-will, talents/duelist--greater-weapon-focus-lightsabers, talents/lightsaber-combat--weapon-specialization-lightsabers, talents/duelist--greater-weapon-specialization-lightsabers, talents/commando--tough-as-nails, talents/5th-degree-droid--cargo-hauler, talents/assassin--murderous-arts, talents/lightsaber-combat--dueling-stance, talents/beastwarden--charm-beast, talents/dathomiri-witch--charm-beast, talents/zeison-sha--telekinetic-vigilance
//
//   Talent Probe: Jedi 1, all abilities 10, a melee Lightsaber (2d8, group lightsabers).
//   Will 10 + level 1 + WIS 0 + Force of Will 2 (insight) = 13.
//   Attack BAB 1 + STR 0 + Greater Weapon Focus (Lightsabers) 1 = +2.
//   Damage 2d8 + Murderous Arts 1 die = 3d8, then each bonus as its own term: Weapon
//   Specialization 2 and Greater Weapon Specialization 2 (STR 0 and half level 0 add none):
//   "3d8 + 2 + 2".
//   Second Wind 1 + Tough as Nails 1 = 2. Athletics (the STR skill) +5 from Cargo Hauler; slots
//   doubled by Cargo Hauler: 20 / 2.
//   Control: the same character without the talents: Will 11, Attack +1, Damage 2d8, Second Wind 1,
//   Athletics +0, slots 10 / 1.
//   Charm Beast from two trees embeds as two talents named "Charm Beast" in different trees.
//   Telekinetic Vigilance, written by the converter from the ruling, embeds in the Zeison Sha tree.

(async () => {
if (game.world.id !== "holocron-testing" || game.system.id !== "holocron") {
  return JSON.stringify({ refused: `world ${game.world.id}, system ${game.system.id}` });
}
const DOCS = __PACK_DOCS__;
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail });
// The fixtures open the debug sheet, whose DOM these checks read (src/sheets/debug-sheet.ts).
const FLAG = { holocron: { talentsFixture: true }, core: { sheetClass: "holocron.DebugSheet" } };

const old = game.actors.filter((a) => a.getFlag("holocron", "talentsFixture")).map((a) => ({ id: a.id, name: a.name }));
if (old.length) await Actor.deleteDocuments(old.map((a) => a.id));
check("previous fixtures deleted", old.every((a) => !game.actors.get(a.id)), { deleted: old });

const lightsaber = { name: "Lightsaber", type: "weapon", system: { category: "melee", group: "lightsabers", damage: "2d8", damageTypes: ["Energy"] } };
const character = (name, items) => {
  const jedi = foundry.utils.randomID();
  return Actor.create({
    name, type: "character", flags: FLAG,
    system: { progression: [{ class: jedi }] },
    items: [
      { name: "Human", type: "species", system: { size: "medium" } },
      { _id: jedi, name: "Jedi", type: "class", system: { heroic: true, hitDie: 10, hpFirstLevel: 30 } },
      lightsaber,
      ...items,
    ],
  });
};
const withoutKey = (doc) => Object.fromEntries(Object.entries(doc).filter(([key]) => key !== "_key"));
const talents = Object.values(DOCS).map((doc) => ({ ...withoutKey(doc), effects: doc.effects.map(withoutKey) }));
const probe = await character("Talent Probe", talents);
const control = await character("Talent Control", []);
const embedded = probe.items.filter((i) => i.type === "talent");
check("every converted talent embeds and validates", embedded.length === talents.length
  && probe._source.items.filter((i) => i.type === "talent").length === talents.length, { embedded: embedded.length, expected: talents.length });
const charms = embedded.filter((i) => i.name === "Charm Beast").map((i) => i.system.tree).sort();
check("Charm Beast from two trees: two talents, one name, two trees", JSON.stringify(charms) === JSON.stringify(["Beastwarden", "Dathomiri Witch"]), { charms });

const read = async (actor) => {
  const sheet = actor.sheet;
  await sheet.render({ force: true });
  const el = sheet.element;
  const shown = {
    will: el.querySelector('[data-defense="will"] .total')?.textContent.trim(),
    attack: el.querySelector('[data-action="attack"]')?.textContent.trim(),
    damage: el.querySelector('[data-action="damage"]')?.textContent.trim(),
    secondWind: el.querySelector('[data-resource="secondWind"] .total')?.textContent.trim(),
    athletics: el.querySelector('[data-skill="athletics"] .total')?.textContent.trim(),
    slots: el.querySelector('[data-resource="slots"] .total')?.textContent.trim(),
    willTooltip: el.querySelector('[data-defense="will"] .total')?.dataset.tooltipHtml ?? "",
  };
  await sheet.close();
  return shown;
};
const p = await read(probe);
const c = await read(control);
const { willTooltip, ...shown } = p;
check("control reads the engine's base numbers", c.will === "11" && c.attack === "Attack +1" && c.damage === "Damage 2d8" && c.secondWind === "0 / 1"
  && c.athletics === "+0" && c.slots === "10 / 1", { ...c, willTooltip: undefined });
check("Will 13 with Force of Will named as an insight bonus", p.will === "13" && willTooltip.includes("Force of Will") && willTooltip.includes("insight"), { will: p.will, willTooltip });
check("Attack +2 with Greater Weapon Focus (Lightsabers)", p.attack === "Attack +2", shown);
check("Damage 3d8 + 2 + 2: Murderous Arts' die, both Specializations' +2", p.damage === "Damage 3d8 + 2 + 2", shown);
check("Second Wind 2 with Tough as Nails", p.secondWind === "0 / 2", shown);
check("Cargo Hauler: Athletics +5 and slots 20 / 2", p.athletics === "+5" && p.slots === "20 / 2", shown);
const stance = probe.items.find((i) => i.name === "Dueling Stance");
check("Dueling Stance keeps Bryan's merged text and no house label", stance?.system.description.includes("Block and Deflect are combined into this single talent")
  && !/Homebrew|tovec/.test(stance?.system.description ?? ""), { start: stance?.system.description.slice(0, 120) });

const vigilance = probe.items.find((i) => i.name === "Telekinetic Vigilance");
check("Telekinetic Vigilance, written from the ruling, embeds in the Zeison Sha tree with its Intercept prerequisite",
  vigilance?.system.tree === "Zeison Sha" && vigilance.system.prerequisite.text === "Intercept", { tree: vigilance?.system.tree, prerequisite: vigilance?.system.prerequisite });

return JSON.stringify({ world: game.world.id, build: globalThis.CONFIG?.HOLOCRON?.buildId, results });
})();
