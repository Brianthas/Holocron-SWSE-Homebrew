/* global game, Actor, console, __PACK_COUNTS__ */
// The built compendium packs, as the running client loads them. Every pack system.json declares is
// in game.packs (Foundry drops one it cannot read with only a server warning); each holds exactly the
// documents and effects in packs/_source, none invalid. Every item is then embedded on scratch
// characters, 200 per character, each a level-1 Jedi so level formulas resolve; they must embed and
// validate, prepare without a Holocron console error, and, with every armor worn and droid system
// installed, every effect change must arrive in the character's modifiers, grants or dice.

(async () => {
if (game.world.id !== "holocron-testing" || game.system.id !== "holocron") {
  return JSON.stringify({ refused: `world ${game.world.id}, system ${game.system.id}` });
}
const COUNTS = __PACK_COUNTS__;
const results = [];
// The detail is copied now: it can hold live document data that later steps change.
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail: JSON.parse(JSON.stringify(detail ?? null)) });
const FLAG = { holocron: { packFixture: true } };

const old = game.actors.filter((a) => a.getFlag("holocron", "packFixture")).map((a) => a.id);
if (old.length) await Actor.deleteDocuments(old);
check("previous fixtures deleted", old.every((id) => !game.actors.get(id)), { deleted: old.length });

const declared = [...game.system.packs].map((p) => p.name);
const missing = declared.filter((name) => !game.packs.get(`holocron.${name}`));
check("every pack system.json declares is loaded", declared.length === Object.keys(COUNTS).length && !missing.length,
  { declared: declared.length, source: Object.keys(COUNTS).length, missing });

const items = [];
const perPack = {};
for (const name of declared) {
  const pack = game.packs.get(`holocron.${name}`);
  if (!pack) continue;
  const docs = await pack.getDocuments();
  const effects = docs.reduce((n, d) => n + d.effects.size, 0);
  perPack[name] = { index: pack.index.size, documents: docs.length, effects, invalid: pack.invalidDocumentIds.size, expected: COUNTS[name] };
  items.push(...docs.map((d) => d.toObject()));
}
const wrong = Object.entries(perPack).filter(([, p]) => p.index !== p.expected?.items || p.documents !== p.expected?.items || p.effects !== p.expected?.effects || p.invalid);
check("each pack holds its source's documents and effects, none invalid", !wrong.length && Object.keys(perPack).length === declared.length,
  { total: items.length, wrong: Object.fromEntries(wrong) });

// Holocron reports a bad change with console.error and skips it; collect those while the probe runs.
const errors = [];
const original = console.error;
const recorder = (...args) => {
  if (String(args[0]).startsWith("holocron |")) errors.push(String(args[0]).slice(0, 200));
  return original.apply(console, args);
};
console.error = recorder;
const actors = [];
try {
  const jedi = items.find((i) => i.type === "class" && i.name === "Jedi");
  for (let start = 0; start < items.length; start += 200) {
    const chunk = items.slice(start, start + 200).filter((i) => i._id !== jedi._id);
    actors.push(await Actor.create({
      name: `Pack Probe ${actors.length + 1}`, type: "character", flags: FLAG,
      system: { progression: [{ class: jedi._id }] },
      items: [jedi, ...chunk],
    }));
  }
  const embedded = actors.reduce((n, a) => n + a.items.filter((i) => i.id !== jedi._id).length, 0);
  const sourced = actors.reduce((n, a) => n + a._source.items.filter((i) => i._id !== jedi._id).length, 0);
  const invalid = actors.reduce((n, a) => n + a.items.invalidDocumentIds.size, 0);
  const otherJedi = items.filter((i) => i._id === jedi._id).length - 1;
  check("every compendium item embeds and validates", embedded === items.length - 1 - otherJedi && sourced === embedded && invalid === 0,
    { items: items.length, embedded, sourced, invalid, actors: actors.length });

  // A choice feat's "{choice}" change applies only once a choice is set: Pistols for a weapon group,
  // Stealth for a skill, as a player's pick would.
  const choiceFor = (item) => {
    const key = item.effects.contents.flatMap((e) => e.system.changes).find((c) => c.key.includes("{choice}"))?.key;
    return key ? (key.startsWith("skill.") ? "stealth" : "pistols") : null;
  };
  for (const actor of actors) {
    const toggles = actor.items.filter((i) => i.type === "armor" || i.type === "droidSystem")
      .map((i) => ({ _id: i.id, [i.type === "armor" ? "system.worn" : "system.installed"]: true }));
    const choices = actor.items.filter((i) => choiceFor(i)).map((i) => ({ _id: i.id, "system.choice": choiceFor(i) }));
    if (toggles.length || choices.length) await actor.updateEmbeddedDocuments("Item", [...toggles, ...choices]);
  }
  const unapplied = [];
  let changes = 0;
  for (const actor of actors) {
    actor.prepareData();
    const sys = actor.system;
    for (const item of actor.items) {
      for (const effect of item.effects) {
        for (const c of effect.system.changes) {
          changes++;
          const collection = c.type === "bonus" ? sys.modifiers : c.type === "grant" ? sys.grants : sys.dice;
          const key = c.key.replace("{choice}", item.system.choice);
          const landed = (collection[key] ?? []).some((m) => m.label === effect.name && (c.type !== "grant" || m.value === c.value));
          if (!landed) unapplied.push(`${item.name}: ${c.type} ${c.key}`);
        }
      }
    }
  }
  const expectedChanges = items.reduce((n, i) => n + i.effects.reduce((m, e) => m + e.system.changes.length, 0), 0);
  const chosen = actors.reduce((n, a) => n + a.items.filter((i) => i.system.choice).length, 0);
  check("with armor worn, droid systems installed and choice feats chosen (8), every change reaches the character", changes === expectedChanges && !unapplied.length && chosen === 8,
    { changes, expectedChanges, chosen, unapplied });

  const totals = actors.map((a) => [a.system.defenses.reflex.total, a.system.defenses.fortitude.total, a.system.defenses.will.total, a.system.hpMax.total]);
  check("each probe's Defenses and hit points total to numbers", totals.every((t) => t.every(Number.isFinite)), { totals });
  check("each probe reports no problems on the sheet", actors.every((a) => !a.system.problems.length),
    Object.fromEntries(actors.filter((a) => a.system.problems.length).map((a) => [a.name, a.system.problems.slice(0, 5)])));
} finally {
  if (console.error === recorder) console.error = original;
}
check("no Holocron console errors while embedding and preparing", !errors.length, { errors: errors.slice(0, 10), count: errors.length });

return JSON.stringify({ world: game.world.id, build: globalThis.CONFIG?.HOLOCRON?.buildId, results });
})();
