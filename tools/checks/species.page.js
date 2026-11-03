/* global game, foundry, Actor, __PACK_DOCS__ */
// Converted species on characters, read off the rendered sheet. The species are the converter's own
// files in packs/_source.
// pack-docs: species/human, species/jawa, species/hutt, species/killik, species/bothan, species/balosar, species/amani, species/taung
//
//   Every probe: Jedi 1, all abilities 10, no +2 choice, no Defense points. Size sets STR and DEX
//   (episode-vii, Species) and Reflex (Reflex = 10 + level 1 + DEX mod + size modifier):
//   Human (Medium): STR 10, DEX 10, Reflex 11.
//   Jawa (Small): STR 8, DEX 12, Reflex 10 + 1 + 1 + 1 = 13.
//   Hutt (Large): STR 12, DEX 8, Reflex 10 + 1 - 1 - 1 = 9. Force Resistance (+5 Will against any
//   use of Use the Force) is conditional: Will stays 11 and the tooltip lists it.
//   Killik with no size chosen: the sheet reports the missing choice.
//   Killik, Large chosen: as Hutt, plus Natural Armor (+1): Reflex 10. Killik, Small chosen: as Jawa,
//   plus Natural Armor: Reflex 14 (rulings.md, Content: Killik size).
//   Traits (each species' own trait text): Bothan, Iron Will +2 Species: Will 13. Balosar, Toxic
//   Resistance and Mental Fortitude are conditional: Fortitude and Will stay 11. Taung, Superior
//   Defenses +1: Fortitude 12, Will 12. Amani, Resilient +1: Fortitude 12.
//   Languages at INT 16 (episode-vii, Languages): Bothan understands Commons and Rares; Amani is
//   Primitive, INT 4 lower for languages, so 12: Commons, including Binary.

(async () => {
if (game.world.id !== "holocron-testing" || game.system.id !== "holocron") {
  return JSON.stringify({ refused: `world ${game.world.id}, system ${game.system.id}` });
}
const DOCS = __PACK_DOCS__;
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail });
// The fixtures open the debug sheet, whose DOM these checks read (src/sheets/debug-sheet.ts).
const FLAG = { holocron: { speciesFixture: true }, core: { sheetClass: "holocron.DebugSheet" } };

const old = game.actors.filter((a) => a.getFlag("holocron", "speciesFixture")).map((a) => ({ id: a.id, name: a.name }));
if (old.length) await Actor.deleteDocuments(old.map((a) => a.id));
check("previous fixtures deleted", old.every((a) => !game.actors.get(a.id)), { deleted: old });

const withoutKey = (doc) => Object.fromEntries(Object.entries(doc).filter(([key]) => key !== "_key"));
const character = (name, species, speciesSize = "", int = 10) => {
  const jedi = foundry.utils.randomID();
  return Actor.create({
    name, type: "character", flags: FLAG,
    system: { progression: [{ class: jedi }], speciesSize, abilities: { int: { base: int } } },
    items: [withoutKey(DOCS[`species/${species}`]), { _id: jedi, name: "Jedi", type: "class", system: { heroic: true, hitDie: 10, hpFirstLevel: 30 } }],
  });
};
const read = async (actor) => {
  const sheet = actor.sheet;
  await sheet.render({ force: true });
  const el = sheet.element;
  const row = (label) => [...el.querySelectorAll(".debug-table tr")].find((tr) => tr.children[0]?.textContent.trim() === label)?.children[1]?.textContent.trim();
  const shown = {
    head: el.querySelector(".debug-head p")?.textContent.trim(),
    str: row("STR"), dex: row("DEX"),
    reflex: el.querySelector('[data-defense="reflex"] .total')?.textContent.trim(),
    fortitude: el.querySelector('[data-defense="fortitude"] .total')?.textContent.trim(),
    will: el.querySelector('[data-defense="will"] .total')?.textContent.trim(),
    fortitudeTip: el.querySelector('[data-defense="fortitude"] .total')?.dataset.tooltipHtml ?? "",
    willTip: el.querySelector('[data-defense="will"] .total')?.dataset.tooltipHtml ?? "",
    understands: el.querySelector('[data-resource="understands"] .total')?.textContent.trim(),
    understandsTip: el.querySelector('[data-resource="understands"] .total')?.dataset.tooltipHtml ?? "",
    problems: [...el.querySelectorAll(".debug-problems li")].map((li) => li.textContent.trim()),
  };
  await sheet.close();
  return shown;
};
const expect = (shown, size, str, dex, reflex) => shown.head?.endsWith(size) && shown.str === str && shown.dex === dex && shown.reflex === reflex && !shown.problems.length;

const human = await read(await character("Species Human", "human"));
check("Human: Medium, STR 10, DEX 10, Reflex 11", expect(human, "medium", "10", "10", "11"), human);
const jawa = await read(await character("Species Jawa", "jawa"));
check("Jawa: Small, STR 8, DEX 12, Reflex 13", expect(jawa, "small", "8", "12", "13"), jawa);
const hutt = await read(await character("Species Hutt", "hutt"));
check("Hutt: Large, STR 12, DEX 8, Reflex 9", expect(hutt, "large", "12", "8", "9"), hutt);
check("Hutt: Force Resistance is listed with its condition and not added: Will 11",
  hutt.will === "11" && hutt.willTip.includes("Force Resistance: against any use of the Use the Force skill"), { will: hutt.will, willTip: hutt.willTip });
const unchosen = await read(await character("Species Killik Unchosen", "killik"));
check("Killik with no size chosen: the sheet says so", unchosen.problems.some((p) => p.includes("Killik") && p.includes("no size has been chosen")), unchosen);
const large = await read(await character("Species Killik Large", "killik", "large"));
check("Killik, Large chosen: STR 12, DEX 8, Reflex 10 with Natural Armor (+1)", expect(large, "large", "12", "8", "10"), large);
const small = await read(await character("Species Killik Small", "killik", "small"));
check("Killik, Small chosen: STR 8, DEX 12, Reflex 14 with Natural Armor (+1)", expect(small, "small", "8", "12", "14"), small);

const bothan = await read(await character("Species Bothan", "bothan", "", 16));
check("Bothan: Iron Will +2 Species, Will 13, named in the tooltip; INT 16 understands Commons and Rares",
  bothan.will === "13" && bothan.willTip.includes("Iron Will (species)") && bothan.understands === "Commons and Rares",
  { will: bothan.will, willTip: bothan.willTip, understands: bothan.understands });
const balosar = await read(await character("Species Balosar", "balosar"));
check("Balosar: Toxic Resistance and Mental Fortitude listed with their conditions, Fortitude and Will 11",
  balosar.fortitude === "11" && balosar.will === "11"
  && balosar.fortitudeTip.includes("Toxic Resistance: against Poisons and Toxic Atmospheres") && balosar.willTip.includes("Mental Fortitude: against Deception and Persuasion checks"),
  { fortitude: balosar.fortitude, will: balosar.will, fortitudeTip: balosar.fortitudeTip, willTip: balosar.willTip });
const taung = await read(await character("Species Taung", "taung"));
check("Taung: Superior Defenses +1, Fortitude 12, Will 12", taung.fortitude === "12" && taung.will === "12", { fortitude: taung.fortitude, will: taung.will });
const amani = await read(await character("Species Amani", "amani", "", 16));
check("Amani: Resilient Fortitude 12; Primitive at INT 16 understands Commons, including Binary, and the tooltip names Primitive",
  amani.fortitude === "12" && amani.understands === "Commons, including Binary" && amani.understandsTip.includes("Primitive"),
  { fortitude: amani.fortitude, understands: amani.understands, understandsTip: amani.understandsTip });
const humanItem = game.actors.getName("Species Human").items.find((i) => i.type === "species");
check("Human keeps Bonus Trained Skill and Bonus Feat as traits, rarity common", JSON.stringify(humanItem.system.traits.map((t) => t.name)) === JSON.stringify(["Bonus Trained Skill", "Bonus Feat"])
  && humanItem.system.rarity === "common", { traits: humanItem.system.traits.map((t) => t.name), rarity: humanItem.system.rarity });

return JSON.stringify({ world: game.world.id, build: globalThis.CONFIG?.HOLOCRON?.buildId, results });
})();
