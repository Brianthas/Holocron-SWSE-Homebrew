/* global game, foundry, Actor, __PACK_DOCS__ */
// Converted species on characters, read off the rendered sheet. The species are the converter's own
// files in packs/_source.
// pack-docs: species/human, species/jawa, species/hutt, species/killik
//
//   Every probe: Jedi 1, all abilities 10, no +2 choice, no Defense points. Size sets STR and DEX
//   (episode-vii, Species) and Reflex (Reflex = 10 + level 1 + DEX mod + size modifier):
//   Human (Medium): STR 10, DEX 10, Reflex 11.
//   Jawa (Small): STR 8, DEX 12, Reflex 10 + 1 + 1 + 1 = 13.
//   Hutt (Large): STR 12, DEX 8, Reflex 10 + 1 - 1 - 1 = 9.
//   Killik with no size chosen: the sheet reports the missing choice.
//   Killik, Large chosen: as Hutt. Killik, Small chosen: as Jawa (rulings.md, Content: Killik size).

(async () => {
if (game.world.id !== "holocron-testing" || game.system.id !== "holocron") {
  return JSON.stringify({ refused: `world ${game.world.id}, system ${game.system.id}` });
}
const DOCS = __PACK_DOCS__;
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail });
const FLAG = { holocron: { speciesFixture: true } };

const old = game.actors.filter((a) => a.getFlag("holocron", "speciesFixture")).map((a) => ({ id: a.id, name: a.name }));
if (old.length) await Actor.deleteDocuments(old.map((a) => a.id));
check("previous fixtures deleted", old.every((a) => !game.actors.get(a.id)), { deleted: old });

const withoutKey = (doc) => Object.fromEntries(Object.entries(doc).filter(([key]) => key !== "_key"));
const character = (name, species, speciesSize = "") => {
  const jedi = foundry.utils.randomID();
  return Actor.create({
    name, type: "character", flags: FLAG,
    system: { progression: [{ class: jedi }], speciesSize },
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
const unchosen = await read(await character("Species Killik Unchosen", "killik"));
check("Killik with no size chosen: the sheet says so", unchosen.problems.some((p) => p.includes("Killik") && p.includes("no size has been chosen")), unchosen);
const large = await read(await character("Species Killik Large", "killik", "large"));
check("Killik, Large chosen: STR 12, DEX 8, Reflex 9", expect(large, "large", "12", "8", "9"), large);
const small = await read(await character("Species Killik Small", "killik", "small"));
check("Killik, Small chosen: STR 8, DEX 12, Reflex 13", expect(small, "small", "8", "12", "13"), small);
const humanItem = game.actors.getName("Species Human").items.find((i) => i.type === "species");
check("Human keeps Bonus Trained Skill and Bonus Feat as traits, rarity common", JSON.stringify(humanItem.system.traits.map((t) => t.name)) === JSON.stringify(["Bonus Trained Skill", "Bonus Feat"])
  && humanItem.system.rarity === "common", { traits: humanItem.system.traits.map((t) => t.name), rarity: humanItem.system.rarity });

return JSON.stringify({ world: game.world.id, build: globalThis.CONFIG?.HOLOCRON?.buildId, results });
})();
