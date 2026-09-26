/* global game, foundry, Actor, console */
// F2 effect-breadth check, evaluated inside the running client by tools/checks/run.ts. It builds one
// character whose effects exercise each change type and field, then reads the results off the
// rendered sheet. Expected values are worked out below from the character, not read from the code:
// Jedi 1, DEX 14 (+2), every other ability 10 (+0), no Defense points, a Medium species.
//
// Refuses any world but holocron-testing. Its documents carry flags.holocron.effectsFixture; the
// previous run's are listed and deleted by id first.

(async () => {
if (game.world.id !== "holocron-testing" || game.system.id !== "holocron") {
  return JSON.stringify({ refused: `world ${game.world.id}, system ${game.system.id}` });
}
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail });

const old = game.actors.filter((a) => a.getFlag("holocron", "effectsFixture")).map((a) => ({ id: a.id, name: a.name }));
if (old.length) await Actor.deleteDocuments(old.map((a) => a.id));
check("previous fixtures deleted", old.every((a) => !game.actors.get(a.id)), { deleted: old });

const jediId = foundry.utils.randomID();
const effect = (name, changes) => ({ name, type: "feat", effects: [{ name, transfer: true, system: { changes } }] });
const bonus = (key, value, extra = {}) => ({ key, type: "bonus", value, phase: "derived", ...extra });

// Capture the reports the bad key must produce; restore console.error by identity afterwards.
const reports = [];
const original = console.error;
const wrapper = function (...args) { reports.push(args.map(String).join(" ")); return original.apply(this, args); };
console.error = wrapper;
let actor;
try {
  actor = await Actor.create({
    name: "Effects Probe",
    type: "character",
    flags: { holocron: { effectsFixture: true } },
    system: { abilities: { dex: { base: 14 } }, progression: [{ class: jediId }] },
    items: [
      { name: "Human", type: "species", system: { size: "medium" } },
      { _id: jediId, name: "Jedi", type: "class", system: { heroic: true, hitDie: 10, hpFirstLevel: 30 } },
      { name: "Blaster Pistol", type: "weapon", system: { category: "ranged", group: "pistols", damage: "3d6", damageTypes: ["Energy"] } },
      effect("Probe Morale 1", [bonus("defense.will", 1, { bonusType: "morale" })]),
      effect("Probe Morale 2", [bonus("defense.will", 2, { bonusType: "morale" })]),
      effect("Probe Untyped A", [bonus("defense.fortitude", 1)]),
      effect("Probe Untyped B", [bonus("defense.fortitude", 1)]),
      effect("Probe Conditional", [bonus("defense.reflex", 2, { condition: "while fighting defensively" })]),
      effect("Probe Grant", [{ key: "skill.trained", type: "grant", value: "perception", phase: "derived" }]),
      effect("Probe Dice", [{ key: "damage.group.pistols", type: "dice", value: 1, phase: "derived" }]),
      effect("Probe Attack", [bonus("attack.ranged", 1)]),
      effect("Probe Bad Key", [bonus("reflexDefenseBonus", 5)]),
    ],
  });
} finally {
  if (console.error === wrapper) console.error = original;
}

const stored = actor.items.getName("Probe Morale 1").effects.contents[0]._source.system.changes[0];
check("the change schema keeps bonusType and condition", stored.bonusType === "morale"
  && actor.items.getName("Probe Conditional").effects.contents[0]._source.system.changes[0].condition === "while fighting defensively", { stored });

const sheet = actor.sheet;
await sheet.render({ force: true });
const cell = (sel) => sheet.element.querySelector(sel);
const shown = (sel) => cell(sel)?.textContent.trim();
const tip = (sel) => cell(sel)?.dataset.tooltipHtml ?? "";

// Will: 10 + 1 level + 0 WIS + 0 points + 2 (the higher morale bonus) = 13.
check("same-type bonuses: only the higher counts (Will 13)", shown('[data-defense="will"] .total') === "13"
  && tip('[data-defense="will"] .total').includes("Probe Morale 1") && tip('[data-defense="will"] .total').includes("does not stack"), {
  shown: shown('[data-defense="will"] .total'), tooltip: tip('[data-defense="will"] .total'),
});
// Fortitude: 10 + 1 + 0 + 0 + 1 + 1 = 13.
check("untyped bonuses stack (Fortitude 13)", shown('[data-defense="fortitude"] .total') === "13", { shown: shown('[data-defense="fortitude"] .total') });
// Reflex: 10 + 1 + 2 DEX = 13; the conditional +2 is listed, not added; the bad key adds nothing.
check("a conditional bonus is shown but not totalled (Reflex 13)", shown('[data-defense="reflex"] .total') === "13"
  && tip('[data-defense="reflex"] .total').includes("while fighting defensively"), {
  shown: shown('[data-defense="reflex"] .total'), tooltip: tip('[data-defense="reflex"] .total'),
});
// Perception: 0 half level + 5 trained (granted) + 0 WIS = +5.
check("a grant trains a skill (Perception +5)", shown('[data-skill="perception"] .total') === "+5", { shown: shown('[data-skill="perception"] .total') });
// Attack: 1 BAB + 2 DEX + 1 ranged bonus = +4. Damage: 3d6 + 1 extra die = 4d6, + 2 DEX.
const attack = sheet.element.querySelector('[data-action="attack"]')?.textContent.trim();
const damage = sheet.element.querySelector('[data-action="damage"]')?.textContent.trim();
check("an attack bonus by category applies (Attack +4)", attack === "Attack +4", { attack });
check("extra dice join the weapon's dice (Damage 4d6 + 2)", damage === "Damage 4d6 + 2", { damage });
check("a key outside the grammar is reported and ignored", reports.some((r) => r.includes("Probe Bad Key") && r.includes("not a bonus selector")), {
  reports: reports.filter((r) => r.includes("holocron")).slice(0, 3),
});

await sheet.close();
return JSON.stringify({ world: game.world.id, build: globalThis.CONFIG?.HOLOCRON?.buildId, results });
})();
