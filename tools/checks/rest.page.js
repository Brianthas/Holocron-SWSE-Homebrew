/* global game, foundry, Actor, User, Hooks */
// F2 rest check, evaluated inside the running client by tools/checks/run.ts (rulings.md, Rest).
//
//   Rest Probe: Jedi 1 (level-1 HP 30), CON 12 (+1): HP max 31. Force Sensitivity: 2 Force Points per
//   day. Extra Second Wind: 2 Second Winds per day. Starts at 5 HP, 0 Force Points, 0 Second Winds,
//   Move Object 0 of 2 ready, Surge 1 of 1 ready. The sheet's Rest must restore 31, 2, 2 and Move
//   Object 2 of 2, and list Surge nowhere. A second Rest has nothing to restore.
//
//   New Day: a player owns Party Probe; nobody owns Loner Probe. Both start at 1 HP of 31. New Day must
//   restore Party Probe and leave Loner Probe at 1.
//
// Refuses any world but holocron-testing. Its documents carry flags.holocron.restFixture, including one
// player user, "Rest Check Player", which New Day needs to find an owned character.

(async () => {
if (game.world.id !== "holocron-testing" || game.system.id !== "holocron") {
  return JSON.stringify({ refused: `world ${game.world.id}, system ${game.system.id}` });
}
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail });
const FLAG = { holocron: { restFixture: true } };

const oldActors = game.actors.filter((a) => a.getFlag("holocron", "restFixture")).map((a) => ({ id: a.id, name: a.name }));
const oldUsers = game.users.filter((u) => u.getFlag("holocron", "restFixture")).map((u) => ({ id: u.id, name: u.name }));
if (oldActors.length) await Actor.deleteDocuments(oldActors.map((a) => a.id));
if (oldUsers.length) await User.deleteDocuments(oldUsers.map((u) => u.id));
check("previous fixtures deleted", oldActors.every((a) => !game.actors.get(a.id)) && oldUsers.every((u) => !game.users.get(u.id)), { actors: oldActors, users: oldUsers });

const feat = (name, changes) => ({ name, type: "feat", effects: [{ name, transfer: true, system: { changes } }] });
const bonus = (key, value) => ({ key, type: "bonus", value, phase: "derived" });
const character = (name, system, extra = [], ownership = {}) => {
  const jedi = foundry.utils.randomID();
  return Actor.create({
    name, type: "character", flags: FLAG, ownership,
    system: { abilities: { con: { base: 12 } }, progression: [{ class: jedi }], ...system },
    items: [
      { name: "Human", type: "species", system: { size: "medium" } },
      { _id: jedi, name: "Jedi", type: "class", system: { heroic: true, hitDie: 10, hpFirstLevel: 30 } },
      ...extra,
    ],
  });
};

// The sheet's Rest.
const probe = await character("Rest Probe", { hp: { value: 5 }, forcePoints: { value: 0 }, secondWind: { value: 0 } }, [
  feat("Force Sensitivity", [bonus("forcePoints", 1)]),
  feat("Extra Second Wind", [bonus("secondWind", 1)]),
  { name: "Move Object", type: "forcePower", system: { copies: 2, ready: 0 } },
  { name: "Surge", type: "forcePower", system: { copies: 1, ready: 1 } },
]);
const sheet = probe.sheet;
await sheet.render({ force: true });
const shown = (key) => sheet.element.querySelector(`[data-resource="${key}"] .total`)?.textContent.trim();
const before = { hp: shown("hp"), fp: shown("forcePointsLeft"), sw: shown("secondWind") };

const restMessage = () => new Promise((resolve) => Hooks.once("createChatMessage", resolve));
let posted = restMessage();
sheet.element.querySelector('[data-action="rest"]').click();
const first = await posted;
await sheet.render({ force: true });
const after = { hp: shown("hp"), fp: shown("forcePointsLeft"), sw: shown("secondWind") };
check("the sheet's Rest heals to full and restores Force Points and Second Wind", before.hp === "5 / 31" && after.hp === "31 / 31"
  && after.fp === "2 / 2" && after.sw === "2 / 2", { before, after });
check("every Force power is ready again, and only the spent one is listed", probe.items.getName("Move Object").system.ready === 2
  && first.getFlag("holocron", "rest").some((c) => c.includes("Move Object")) && !first.getFlag("holocron", "rest").some((c) => c.includes("Surge")), {
  changed: first.getFlag("holocron", "rest"),
});
posted = restMessage();
sheet.element.querySelector('[data-action="rest"]').click();
const second = await posted;
check("a second Rest has nothing to restore", second.getFlag("holocron", "rest").length === 0 && second.content.includes("Nothing to restore"), {
  changed: second.getFlag("holocron", "rest"),
});
await sheet.close();

// New Day.
const [player] = await User.createDocuments([{ name: "Rest Check Player", role: 1, flags: FLAG }]);
const party = await character("Party Probe", { hp: { value: 1 } }, [], { [player.id]: 3 });
const loner = await character("Loner Probe", { hp: { value: 1 } });
check("ownership as set up", party.hasPlayerOwner && !loner.hasPlayerOwner, { party: party.hasPlayerOwner, loner: loner.hasPlayerOwner });
const summary = await game.holocron.newDay();
check("New Day rests the player's character and not the unowned one", party.system.hp.value === 31 && loner.system.hp.value === 1
  && Object.keys(summary).includes("Party Probe") && !Object.keys(summary).includes("Loner Probe"), {
  party: party.system.hp.value, loner: loner.system.hp.value, summary,
});

return JSON.stringify({ world: game.world.id, build: globalThis.CONFIG?.HOLOCRON?.buildId, results });
})();
