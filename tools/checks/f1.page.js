/* global game, canvas, Actor, Scene, Hooks */
// F1 acceptance, evaluated inside the running client by tools/checks/run.ts. It builds the slice (a
// Human Jedi 1 and a target), then reads every result off what the user sees: the rendered sheet,
// the rendered chat card, the roll. Each check reports pass or fail.
//
// It refuses to run anywhere but the holocron-testing world. Documents it creates carry
// flags.holocron.f1Fixture; the previous run's are listed and deleted by id before new ones are made.

(async () => {
if (game.world.id !== "holocron-testing" || game.system.id !== "holocron") {
  return JSON.stringify({ refused: `world ${game.world.id}, system ${game.system.id}` });
}

const results = [];
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail });
const FLAG = { holocron: { f1Fixture: true } };

// 1. Clear the previous run's fixtures, by the ids it created.
const oldActors = game.actors.filter((a) => a.getFlag("holocron", "f1Fixture")).map((a) => ({ id: a.id, name: a.name }));
const oldScenes = game.scenes.filter((s) => s.getFlag("holocron", "f1Fixture")).map((s) => ({ id: s.id, name: s.name }));
if (oldActors.length) await Actor.deleteDocuments(oldActors.map((a) => a.id));
if (oldScenes.length) await Scene.deleteDocuments(oldScenes.map((s) => s.id));
const survivors = [...oldActors.filter((a) => game.actors.get(a.id)), ...oldScenes.filter((s) => game.scenes.get(s.id))];
check("previous fixtures deleted", survivors.length === 0, { deleted: [...oldActors, ...oldScenes], survivors });

// 2. The slice: Human, Jedi 1, DEX 14, 2 Reflex points, Stealth trained, Improved Defenses, Blaster Pistol.
const improvedDefenses = {
  name: "Improved Defenses",
  type: "feat",
  effects: [{
    name: "Improved Defenses",
    transfer: true,
    system: { changes: ["reflex", "fortitude", "will"].map((d) => ({ key: `defense.${d}`, type: "bonus", value: 1, phase: "derived" })) },
  }],
};
const classItem = { name: "Jedi", type: "class", system: { levels: 1, heroic: true, hitDie: 10 } };
const jedi = await Actor.create({
  name: "F1 Jedi",
  type: "character",
  flags: FLAG,
  system: {
    abilities: { str: { base: 10 }, dex: { base: 14 }, con: { base: 12 }, int: { base: 10 }, wis: { base: 13 }, cha: { base: 10 } },
    speciesChoice: "wis",
    defensePoints: { reflex: 2, fortitude: 1, will: 1 },
    skills: { stealth: { trained: true } },
  },
  items: [
    { name: "Human", type: "species", system: { size: "medium" } },
    classItem,
    improvedDefenses,
    { name: "Blaster Pistol", type: "weapon", system: { category: "ranged", group: "pistols", damage: "3d6", damageTypes: ["Energy", "Stun"] } },
  ],
});
const target = await Actor.create({
  name: "F1 Target",
  type: "character",
  flags: FLAG,
  system: { abilities: { dex: { base: 12 } }, defensePoints: { reflex: 1 } },
  items: [{ name: "Human", type: "species", system: { size: "medium" } }, classItem],
});
check("slice created", jedi && target, { jedi: jedi?.id, target: target?.id });

// 3. A scene with both tokens, the target targeted, so the attack takes the real targeting path.
const scene = await Scene.create({ name: "F1 Range", width: 1200, height: 800, grid: { size: 100 }, flags: FLAG });
await scene.view();
const tokens = await scene.createEmbeddedDocuments("Token", [
  (await jedi.getTokenDocument({ x: 200, y: 300 })).toObject(),
  (await target.getTokenDocument({ x: 700, y: 300 })).toObject(),
]);
canvas.tokens.get(tokens[1].id).setTarget(true, { releaseOthers: true });
check("target set", game.user.targets.size === 1 && [...game.user.targets][0].actor?.id === target.id, { targets: game.user.targets.size });

// 4. The rendered sheet: Reflex 16 and a tooltip that names Improved Defenses.
const sheet = jedi.sheet;
await sheet.render({ force: true });
const reflexCell = () => sheet.element.querySelector('[data-defense="reflex"] .total');
check("sheet Reflex is 16", reflexCell()?.textContent.trim() === "16", { shown: reflexCell()?.textContent.trim(), derived: jedi.system.defenses.reflex.total });
const tooltip = reflexCell()?.dataset.tooltipHtml ?? "";
check("Reflex tooltip names Improved Defenses", tooltip.includes("Improved Defenses"), { tooltip });
const stealth = sheet.element.querySelector('[data-skill="stealth"] .total')?.textContent.trim();
check("sheet Stealth is +7", stealth === "+7", { shown: stealth });

// 5. Attack: click the sheet's button, then read the card as the chat log renders it.
const attackMessage = new Promise((resolve) => Hooks.once("createChatMessage", resolve));
sheet.element.querySelector('[data-action="attack"]').click();
const attack = await attackMessage;
const flag = attack.getFlag("holocron", "attack");
const targetReflex = target.system.defenses.reflex.total;
const attackHtml = (await attack.renderHTML()).outerHTML;
check("attack bonus is +3", flag?.bonus === 3, { bonus: flag?.bonus, formula: attack.rolls[0]?.formula });
check("attack card's target defense matches the target", flag?.targets?.[0]?.reflex === targetReflex && attackHtml.includes(`Reflex ${targetReflex}`), {
  flagged: flag?.targets?.[0], targetReflex, cardShowsIt: attackHtml.includes(`Reflex ${targetReflex}`),
});
const hitRule = flag && (flag.natural === 20 || (flag.natural !== 1 && flag.total >= targetReflex));
check("hit or miss follows the roll", flag?.targets?.[0]?.hit === hitRule, { natural: flag?.natural, total: flag?.total, hit: flag?.targets?.[0]?.hit });

// 6. Damage: 3d6 + 2 (DEX; half of level 1 is 0).
const damageMessage = new Promise((resolve) => Hooks.once("createChatMessage", resolve));
sheet.element.querySelector('[data-action="damage"]').click();
const damage = await damageMessage;
const roll = damage.rolls[0];
check("damage formula is 3d6 + 2", roll?.formula === "3d6 + 2" && roll.dice[0]?.number === 3 && roll.dice[0]?.faces === 6, { formula: roll?.formula });

// 7. Delete the feat: Reflex drops by exactly 1, in the data and on the re-rendered sheet.
const feat = jedi.items.find((i) => i.name === "Improved Defenses");
await jedi.deleteEmbeddedDocuments("Item", [feat.id]);
const featGone = !jedi._source.items.some((i) => i._id === feat.id);
await sheet.render({ force: true });
check("deleting Improved Defenses lowers Reflex by exactly 1", featGone && jedi.system.defenses.reflex.total === 15 && reflexCell()?.textContent.trim() === "15", {
  featGone, derived: jedi.system.defenses.reflex.total, shown: reflexCell()?.textContent.trim(),
});
check("the tooltip no longer names it", !(reflexCell()?.dataset.tooltipHtml ?? "").includes("Improved Defenses"), {});

await sheet.close();
return JSON.stringify({ world: game.world.id, build: globalThis.CONFIG?.HOLOCRON?.buildId, results });
})();
