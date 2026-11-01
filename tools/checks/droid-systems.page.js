/* global game, foundry, Actor, __PACK_DOCS__ */
// Converted droid systems on a character: they embed and validate, keep group, cost and requires,
// start removed, and the installed toggle round-trips through _source.
// pack-docs: droid-systems/vocabulator, droid-systems/hardened-systems-x3, droid-systems/heuristic-processor, droid-systems/walking, droid-systems/magnetic-feet, droid-systems/earphone-binary-to-basic-translator

(async () => {
if (game.world.id !== "holocron-testing" || game.system.id !== "holocron") {
  return JSON.stringify({ refused: `world ${game.world.id}, system ${game.system.id}` });
}
const DOCS = __PACK_DOCS__;
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail });
const FLAG = { holocron: { droidFixture: true } };

const old = game.actors.filter((a) => a.getFlag("holocron", "droidFixture")).map((a) => ({ id: a.id, name: a.name }));
if (old.length) await Actor.deleteDocuments(old.map((a) => a.id));
check("previous fixtures deleted", old.every((a) => !game.actors.get(a.id)), { deleted: old });

const withoutKey = (doc) => Object.fromEntries(Object.entries(doc).filter(([key]) => key !== "_key"));
const items = Object.values(DOCS).map((doc) => ({ ...withoutKey(doc), effects: doc.effects.map(withoutKey) }));
const jedi = foundry.utils.randomID();
const actor = await Actor.create({
  name: "Droid Systems Probe", type: "character", flags: FLAG,
  system: { abilities: { str: { base: 10 }, dex: { base: 10 }, con: { base: 10 } }, progression: [{ class: jedi }] },
  items: [{ _id: jedi, name: "Jedi", type: "class", system: { heroic: true, hitDie: 10, hpFirstLevel: 30 } }, ...items],
});
const systems = () => actor._source.items.filter((i) => i.type === "droidSystem");
check("converted droid systems embed and validate", actor.items.filter((i) => i.type === "droidSystem").length === items.length && systems().length === items.length,
  { expected: items.length, collection: actor.items.filter((i) => i.type === "droidSystem").length, source: systems().length });

const sys = (name) => actor.items.getName(name)?.system;
check("groups: Vocabulator communications, Heuristic Processor processor, Walking locomotion, Earphone translator, Hardened hardened",
  sys("Vocabulator")?.group === "communications" && sys("Heuristic Processor")?.group === "processor" && sys("Walking")?.group === "locomotion"
  && sys("Earphone Binary-to-Basic Translator")?.group === "translator" && sys("Hardened Systems (x3)")?.group === "hardened",
  Object.fromEntries(actor.items.filter((i) => i.type === "droidSystem").map((i) => [i.name, i.system.group])));
check("Hardened Systems (x3): cost text kept, requires lists the four sizes, description from the fork's prerequisite text",
  sys("Hardened Systems (x3)")?.cost === "2500 x Cost Factor" && sys("Hardened Systems (x3)")?.requires === "Large or Huge or Colossal or Gargantuan"
  && sys("Hardened Systems (x3)")?.description.startsWith("<p>Droids of Large or greater size"),
  { cost: sys("Hardened Systems (x3)")?.cost, requires: sys("Hardened Systems (x3)")?.requires });
check("every converted system starts removed", systems().every((i) => i.system.installed === false), systems().map((i) => [i.name, i.system.installed]));

const voc = actor.items.getName("Vocabulator");
await voc.update({ "system.installed": true });
const on = systems().find((i) => i.name === "Vocabulator")?.system.installed;
await voc.update({ "system.installed": false });
const off = systems().find((i) => i.name === "Vocabulator")?.system.installed;
check("installed round-trips through _source (true, then false)", on === true && off === false, { on, off });

return JSON.stringify({ world: game.world.id, build: globalThis.CONFIG?.HOLOCRON?.buildId, results });
})();
