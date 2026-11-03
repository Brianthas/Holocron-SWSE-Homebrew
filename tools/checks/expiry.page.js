/* global game, foundry, Actor, Scene, Combat, Hooks, setTimeout */
// F2 round expiry check, evaluated inside the running client by tools/checks/run.ts. Durations in
// rounds are core's (ActiveEffect#_prepareCombatBasedDuration): remaining = value - rounds elapsed
// since the effect started, and the active GM's client marks it expired once remaining reaches 0.
//
//   Expiry Probe goes first (initiative 20), Expiry Other second (10). In round 1, on the probe's
//   turn, it gets "One Round" (Will +2, 1 round) and "Two Rounds" (Fortitude +3, 2 rounds).
//   Round 1, next turn: both hold. Round 2: One Round has ended, Two Rounds holds. Round 3: both
//   have ended. Read off the sheet's Defenses at each step.
//
// Refuses any world but holocron-testing. Its documents carry flags.holocron.expiryFixture; the
// combat is deleted at the end so no fixture combat is left running.

(async () => {
if (game.world.id !== "holocron-testing" || game.system.id !== "holocron") {
  return JSON.stringify({ refused: `world ${game.world.id}, system ${game.system.id}` });
}
const results = [];
// The detail is copied now: it can hold live document data that later steps change.
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail: JSON.parse(JSON.stringify(detail ?? null)) });
const FLAG = { holocron: { expiryFixture: true } };
// Actors open the debug sheet, whose DOM these checks read (src/sheets/debug-sheet.ts).
const DEBUG_SHEET = { core: { sheetClass: "holocron.DebugSheet" } };

const flagged = (collection) => collection.filter((d) => d.getFlag("holocron", "expiryFixture")).map((d) => ({ id: d.id, name: d.name }));
const old = { combats: flagged(game.combats), scenes: flagged(game.scenes), actors: flagged(game.actors) };
if (old.combats.length) await Combat.deleteDocuments(old.combats.map((d) => d.id));
if (old.scenes.length) await Scene.deleteDocuments(old.scenes.map((d) => d.id));
if (old.actors.length) await Actor.deleteDocuments(old.actors.map((d) => d.id));
check("previous fixtures deleted", !old.combats.some((d) => game.combats.get(d.id)) && !old.scenes.some((d) => game.scenes.get(d.id))
  && !old.actors.some((d) => game.actors.get(d.id)), old);

const character = (name) => {
  const jedi = foundry.utils.randomID();
  return Actor.create({
    name, type: "character", flags: { ...FLAG, ...DEBUG_SHEET }, prototypeToken: { actorLink: true },
    system: { progression: [{ class: jedi }] },
    items: [
      { name: "Human", type: "species", system: { size: "medium" } },
      { _id: jedi, name: "Jedi", type: "class", system: { heroic: true, hitDie: 10, hpFirstLevel: 30 } },
    ],
  });
};
const probe = await character("Expiry Probe");
const other = await character("Expiry Other");
const scene = await Scene.create({ name: "Expiry Range", width: 1200, height: 800, grid: { size: 100 }, flags: FLAG });
// Found by actor: the created array's order is not the order passed in.
const tokens = await scene.createEmbeddedDocuments("Token", [
  (await probe.getTokenDocument({ x: 200, y: 300 })).toObject(),
  (await other.getTokenDocument({ x: 700, y: 300 })).toObject(),
]);
const tokenOf = (actor) => tokens.find((t) => t.actorId === actor.id);
const combat = await Combat.create({ scene: scene.id, active: true, flags: FLAG });
await combat.createEmbeddedDocuments("Combatant", [
  { tokenId: tokenOf(probe).id, sceneId: scene.id, actorId: probe.id, initiative: 20 },
  { tokenId: tokenOf(other).id, sceneId: scene.id, actorId: other.id, initiative: 10 },
]);

// Core awaits every turn and round event on the GM's client, expiry included, before it calls
// combatTurnChange (Combat#_manageTurnEvents). The timer only stops a missing hook hanging the run.
const advance = async (step) => {
  const changed = new Promise((resolve) => Hooks.once("combatTurnChange", () => resolve("changed")));
  const timeout = new Promise((resolve) => setTimeout(() => resolve("timeout"), 5000));
  await step();
  return Promise.race([changed, timeout]);
};
const started = await advance(() => combat.startCombat());
check("combat started on the probe's turn", started === "changed" && combat.round === 1 && combat.combatant?.actorId === probe.id, {
  hook: started, round: combat.round, turn: combat.turn, combatant: combat.combatant?.name,
});

// Applied during the probe's turn, with the start core would stamp for this combat.
const start = foundry.documents.ActiveEffect.getEffectStart(combat);
const effects = await probe.createEmbeddedDocuments("ActiveEffect", [
  { name: "One Round", start, duration: { value: 1, units: "rounds" }, system: { changes: [{ key: "defense.will", type: "bonus", value: 2, phase: "derived" }] } },
  { name: "Two Rounds", start, duration: { value: 2, units: "rounds" }, system: { changes: [{ key: "defense.fortitude", type: "bonus", value: 3, phase: "derived" }] } },
]);
const oneRound = effects.find((e) => e.name === "One Round");
const twoRounds = effects.find((e) => e.name === "Two Rounds");
check("both effects are tracked, started in round 1", foundry.documents.ActiveEffect.registry.has(oneRound)
  && foundry.documents.ActiveEffect.registry.has(twoRounds) && oneRound.start.round === 1, { start: oneRound._source.start });

const sheet = probe.sheet;
const state = async () => {
  await sheet.render({ force: true });
  const shown = (key) => Number(sheet.element.querySelector(`[data-defense="${key}"] .total`)?.textContent);
  const effect = (e) => {
    const live = probe.effects.get(e.id);
    return { expired: live._source.duration.expired === true, remaining: live.duration.remaining };
  };
  return { round: combat.round, turn: combat.turn, will: shown("will"), fortitude: shown("fortitude"), one: effect(oneRound), two: effect(twoRounds) };
};
const applied = await state();

const nextTurn = await advance(() => combat.nextTurn());
const turn2 = await state();
check("round 1, next turn: both still apply", nextTurn === "changed" && turn2.round === 1 && turn2.turn === 1
  && !turn2.one.expired && !turn2.two.expired && turn2.will === applied.will && turn2.fortitude === applied.fortitude, { applied, turn2, hook: nextTurn });

const toRound2 = await advance(() => combat.nextRound());
const round2 = await state();
check("round 2: One Round has ended (Will -2), Two Rounds holds", toRound2 === "changed" && round2.round === 2
  && round2.one.expired && !round2.two.expired && round2.will === applied.will - 2 && round2.fortitude === applied.fortitude, { round2, hook: toRound2 });

const toRound3 = await advance(() => combat.nextRound());
const round3 = await state();
check("round 3: Two Rounds has ended too (Fortitude -3)", toRound3 === "changed" && round3.round === 3
  && round3.two.expired && round3.fortitude === applied.fortitude - 3 && round3.will === applied.will - 2, { round3, hook: toRound3 });

await sheet.close();
await combat.delete();
check("the fixture combat is gone", !game.combats.get(combat.id), {});

return JSON.stringify({ world: game.world.id, build: globalThis.CONFIG?.HOLOCRON?.buildId, results });
})();
