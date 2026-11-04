/* global game, canvas, ui, foundry, CONFIG, Actor, Scene, Hooks, MouseEvent, document, setTimeout */
// Attack and damage cards (mockup 2), evaluated inside the running client by tools/checks/run.ts.
// The dice are forced through CONFIG.Dice.randomUniform (core maps a value u to the face
// ceil((1 - u) * faces), dice.mjs:366) and put back afterwards. Every result is read off the chat
// log's rendered card, and every button pressed is the one on that card or on the character sheet.
//
// Refuses any world but holocron-testing. Documents it creates carry flags.holocron.cardsFixture;
// the previous run's are listed and deleted by id before new ones are made.

(async () => {
if (game.world.id !== "holocron-testing" || game.system.id !== "holocron") {
  return JSON.stringify({ refused: `world ${game.world.id}, system ${game.system.id}` });
}
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail: JSON.parse(JSON.stringify(detail ?? null)) });
const FLAG = { holocron: { cardsFixture: true } };

const oldActors = game.actors.filter((a) => a.getFlag("holocron", "cardsFixture")).map((a) => a.id);
const oldScenes = game.scenes.filter((s) => s.getFlag("holocron", "cardsFixture")).map((s) => s.id);
if (oldActors.length) await Actor.deleteDocuments(oldActors);
if (oldScenes.length) await Scene.deleteDocuments(oldScenes);
check("previous fixtures deleted", ![...oldActors.map((id) => game.actors.get(id)), ...oldScenes.map((id) => game.scenes.get(id))].some(Boolean),
  { actors: oldActors.length, scenes: oldScenes.length });

// Each character is a level-1 Jedi, so level terms resolve.
const character = (name, { abilities = {}, items = [], system = {} } = {}) => {
  const classId = foundry.utils.randomID();
  return Actor.create({
    name, type: "character", flags: FLAG,
    system: { abilities: { str: { base: 10 }, dex: { base: 10 }, con: { base: 10 }, int: { base: 10 }, wis: { base: 10 }, cha: { base: 10 }, ...abilities }, progression: [{ class: classId }], ...system },
    items: [{ _id: classId, name: "Jedi", type: "class", system: { heroic: true, hitDie: 10, hpFirstLevel: 30 } }, ...items],
  });
};
const human = { name: "Human", type: "species", system: { size: "medium" } };
const attacker = await character("Cards Attacker", {
  abilities: { dex: { base: 14 } },
  system: { forcePoints: { value: 3 } },
  items: [human,
    { name: "Probe Lift", type: "forcePower", system: { skill: "useTheForce", descriptors: ["telekinetic"], action: "Standard Action", cumulative: false, copies: 1, ready: 1,
      bands: [{ dc: 15, text: "Medium" }, { dc: 20, text: "Large" }, { dc: 25, text: "Huge" }] } },
    { name: "Lightsaber", type: "weapon", system: { category: "melee", group: "lightsabers", damage: "3d8", damageTypes: ["Energy"] } },
    { name: "Blaster Pistol", type: "weapon", system: { category: "ranged", group: "pistols", damage: "3d6", damageTypes: ["Energy", "Stun"] } },
    { name: "Frag Grenade", type: "weapon", system: { category: "ranged", group: "simple", damage: "4d6", damageTypes: ["Stun"], halfOnMiss: true, thrown: true } }],
});
// Battle Armor as the house table has it: Reflex 4 in place of DEX, DR 2/Lightsabers.
const trooper = await character("Cards Trooper", {
  items: [human, { name: "Battle Armor", type: "armor", system: { reflex: { ability: "", flat: 4 }, damageReduction: 2, drBypass: "lightsabers", worn: true } }],
  system: { hp: { value: 30, temp: 5 } },
});
const scout = await character("Cards Scout", { items: [human], system: { hp: { value: 25, temp: 0 } } });
const droid = await character("Cards Droid", {
  abilities: { dex: { base: 16 } },
  items: [{ name: "Cards Droid Model", type: "species", system: { size: "medium", droid: true } }],
  system: { hp: { value: 20, temp: 0 }, defensePoints: { reflex: 2 } },
});
const reflex = (a) => a.system.defenses.reflex.total;
check("fixtures: the droid's Reflex is one above the trooper's, the scout's below both",
  reflex(droid) === reflex(trooper) + 1 && reflex(scout) < reflex(trooper),
  { trooper: reflex(trooper), droid: reflex(droid), scout: reflex(scout), armorDr: trooper.items.find((i) => i.type === "armor")?.system.damageReduction });

// The droid's token is unlinked: damage must land on the token's own actor, not the base actor.
const scene = await Scene.create({ name: "Cards Range", width: 1400, height: 800, grid: { size: 100 }, flags: FLAG });
await scene.view();
const tokenData = async (actor, x, link) => ({ ...(await actor.getTokenDocument({ x, y: 300 })).toObject(), actorLink: link });
const tokens = await scene.createEmbeddedDocuments("Token", [
  await tokenData(attacker, 100, true), await tokenData(trooper, 400, true), await tokenData(scout, 700, true), await tokenData(droid, 1000, false),
]);
const tokenOf = (actor) => canvas.tokens.get(tokens.find((t) => t.actorId === actor.id).id);
const target = (...actors) => {
  game.user.targets.forEach((t) => t.setTarget(false, { releaseOthers: false }));
  actors.forEach((a, i) => tokenOf(a).setTarget(true, { releaseOthers: i === 0 }));
};
canvas.tokens.releaseAll();

// Core's own source (config.mjs: dice.MersenneTwister.random). Anything else is a patch left behind,
// and the run refuses rather than keep it as the thing to put back.
const realUniform = foundry.dice.MersenneTwister.random;
if (CONFIG.Dice.randomUniform !== realUniform) {
  return JSON.stringify({ refused: "CONFIG.Dice.randomUniform is not core's; reload the client" });
}
const forced = [];
const force = (die, ...faces) => forced.push(...faces.map((f) => 1 - (f - 0.5) / die));
CONFIG.Dice.randomUniform = () => (forced.length ? forced.shift() : realUniform());

// Waits for a hook whose first argument passes the test, or gives up after 20 seconds and resolves
// null, so a missing update fails its check instead of hanging the run (a timed-out eval keeps
// running in the page, with the dice still forced).
const waitHook = (name, test = () => true) => new Promise((resolve) => {
  const id = Hooks.on(name, (doc, ...rest) => {
    if (!test(doc, ...rest)) return;
    Hooks.off(name, id);
    resolve(doc);
  });
  setTimeout(() => {
    Hooks.off(name, id);
    resolve(null);
  }, 20000);
});
// The card as the chat log shows it, once the log's render queue has drawn it.
const shown = async (message) => {
  await ui.chat.updateMessage(message);
  return ui.chat.element.querySelector(`.message[data-message-id="${message.id}"]`);
};
const rows = (el) => [...el.querySelectorAll(".dmg-row:not(.sel-row), .target")].map((r) => ({
  text: r.querySelector("div > div, span")?.textContent.trim(),
  result: r.querySelector(".result")?.textContent.trim(),
  n: r.querySelector(".dmg-final")?.textContent.trim(),
  chips: [...r.querySelectorAll(".dchip")].map((c) => c.textContent.trim()),
  button: r.querySelector("button")?.textContent.trim() ?? null,
}));
const press = async (el, selector, hook = "updateChatMessage") => {
  const done = waitHook(hook);
  const button = el.querySelector(selector);
  if (!button) return null;
  button.click();
  return done;
};
const hp = (a) => ({ hp: a.system.hp.value, temp: a.system.hp.temp });

const sheet = attacker.sheet;
await sheet.render({ force: true });
const weaponRow = (name) => sheet.element.querySelector(`.list-row[data-item-id="${attacker.items.getName(name).id}"]`);
const bonusOf = (name) => Number(weaponRow(name).querySelector(".meta b").textContent);
const attack = async (name, face) => {
  force(20, face);
  const created = waitHook("createChatMessage");
  weaponRow(name).querySelector('[data-action="attack"]').click();
  const message = await created;
  return { message, el: await shown(message) };
};

try {
  // 1. Lightsaber at the trooper and the droid: the total meets the trooper's Reflex exactly (a hit)
  // and is one short of the droid's (a miss).
  const saberBonus = bonusOf("Lightsaber");
  target(trooper, droid);
  const a1 = await attack("Lightsaber", reflex(trooper) - saberBonus);
  const r1 = rows(a1.el);
  check("attack card: meeting Reflex hits, one short misses; the GM sees each margin; the speaker's token image heads the card",
    r1[0]?.result === "Hit" && r1[0].text.includes(`vs Reflex ${reflex(trooper)}, by 0`) && r1[1]?.result === "Miss" && r1[1].text.includes(`vs Reflex ${reflex(droid)}, missed by 1`)
    && a1.el.querySelector(".message-header img.hc-token") && a1.el.querySelector('button[data-hc="damage"]')?.textContent.trim() === "Roll damage",
    { rows: r1, total: a1.message.rolls[0]?.total, bonus: saberBonus, token: a1.el.querySelector(".hc-token")?.getAttribute("src") });

  // 2. Its damage: 3d8 forced to 15, + STR 0 + half level 0. Lightsabers bypass Battle Armor; the miss deals nothing.
  force(8, 5, 5, 5);
  const d1 = await press(a1.el, 'button[data-hc="damage"]', "createChatMessage");
  let el = await shown(d1);
  let r = rows(el);
  check("damage card: the trooper takes 15 through Battle Armor (bypassed by lightsabers); the missed droid takes 0 with no Apply",
    d1.rolls[0]?.total === 15 && r[0]?.n === "15" && r[0].chips.includes("Battle Armor DR 2: bypassed by lightsabers") && r[0].button === "Apply"
    && r[1]?.n === "0" && r[1].chips.includes("Miss: no damage") && r[1].button === null,
    { total: d1.rolls[0]?.total, rows: r });
  check("with no token selected, the selected row asks for one", el.querySelector(".sel-row")?.textContent.includes("Select a token on the canvas"), { row: el.querySelector(".sel-row")?.textContent.trim() });

  // 3. Apply: temporary hit points first (5), then 10 from 30. Undo gives both back.
  await press(el, `button[data-hc="apply"][data-uuid="${tokenOf(trooper).document.uuid}"]`);
  el = await shown(d1);
  r = rows(el);
  const afterApply = hp(trooper);
  check("Apply takes 5 temporary then 10 hit points (30 to 20), and the row reads Took 15 (HP 30 to 20) with Undo",
    afterApply.hp === 20 && afterApply.temp === 0 && r[0].chips.includes("Took 15 (HP 30 to 20)") && r[0].button === "Undo",
    { trooper: afterApply, row: r[0] });
  await press(el, `button[data-hc="undo"][data-uuid="${tokenOf(trooper).document.uuid}"]`);
  el = await shown(d1);
  r = rows(el);
  check("Undo puts back 30 hit points and 5 temporary, and the row offers Apply again",
    trooper.system.hp.value === 30 && trooper.system.hp.temp === 5 && r[0].button === "Apply" && !r[0].chips.some((c) => c.startsWith("Took")),
    { trooper: hp(trooper), row: r[0] });

  // 4. Frag grenade (Stun, half damage on a miss) at the trooper, the scout and the droid: the total
  // meets the trooper's Reflex (so beats the scout's) and misses the droid's.
  const grenadeBonus = bonusOf("Frag Grenade");
  target(trooper, scout, droid);
  const a2 = await attack("Frag Grenade", reflex(trooper) - grenadeBonus);
  force(6, 4, 4, 4, 4);
  const d2 = await press(a2.el, 'button[data-hc="damage"]', "createChatMessage");
  el = await shown(d2);
  r = rows(el);
  const g = d2.rolls[0]?.total;
  check(`grenade damage ${g}: DR 2 applies to Stun (trooper ${g - 2}), the scout takes ${g}, the missed droid's half is stopped by its Stun immunity`,
    g === 16 + attacker.system.scores.dex.mod && r[0]?.n === String(g - 2) && r[0].chips.includes(`Battle Armor DR 2 (${g} to ${g - 2})`)
    && r[1]?.n === String(g) && r[2]?.n === "0" && r[2].chips.includes(`Miss: half (${g} to ${Math.floor(g / 2)})`) && r[2].chips.includes("Droid: immune to Stun")
    && el.querySelector('button[data-hc="apply-all"]'),
    { total: g, rows: r });

  // 5. Apply all applies the two open rows.
  await press(el, 'button[data-hc="apply-all"]');
  el = await shown(d2);
  r = rows(el);
  check(`Apply all: trooper ${g - 2} (5 temporary, then 30 to ${30 - (g - 2 - 5)}), scout ${g} (25 to ${25 - g}); both rows read Took with Undo`,
    trooper.system.hp.value === 30 - (g - 2 - 5) && trooper.system.hp.temp === 0 && scout.system.hp.value === 25 - g
    && r[0].button === "Undo" && r[1].button === "Undo" && r[1].chips.includes(`Took ${g} (HP 25 to ${25 - g})`),
    { trooper: hp(trooper), scout: hp(scout), rows: r });
  for (const a of [trooper, scout]) {
    await press(el, `button[data-hc="undo"][data-uuid="${tokenOf(a).document.uuid}"]`);
    el = await shown(d2);
  }
  check("undoing both puts the trooper and the scout back", trooper.system.hp.value === 30 && trooper.system.hp.temp === 5 && scout.system.hp.value === 25,
    { trooper: hp(trooper), scout: hp(scout) });

  // 6. Damage from the sheet with no attack: it asks Normal or Critical. Normal, nothing targeted.
  target();
  const askAndRoll = async (answer, ...faces) => {
    const dialog = waitHook("renderDialogV2");
    const created = waitHook("createChatMessage");
    weaponRow("Blaster Pistol").querySelector('[data-action="damage"]').click();
    const app = await dialog;
    // The window header's own buttons carry data-action too; the answers are the form's.
    const offered = [...app.element.querySelectorAll("form button[data-action]")].map((b) => b.textContent.trim());
    force(6, ...faces);
    app.element.querySelector(`button[data-action="${answer}"]`).click();
    const message = await created;
    return { message, offered };
  };
  const p1 = await askAndRoll("normal", 3, 3, 3);
  const pistol = p1.message.rolls[0]?.total;
  el = await shown(p1.message);
  check(`the sheet's Damage asks Normal or Critical; Normal rolls 3d6 + DEX (${pistol}) with no target rows`,
    p1.offered.join() === "Normal,Critical" && pistol === 9 + attacker.system.scores.dex.mod && rows(el).length === 0,
    { offered: p1.offered, total: pistol, formula: p1.message.rolls[0]?.formula });

  // 7. The selected token: controlling the droid's unlinked token redraws the card with its row.
  const redrawn = waitHook("renderChatMessageHTML", (m) => m.id === p1.message.id);
  tokenOf(droid).control({ releaseOthers: true });
  await redrawn;
  el = await shown(p1.message);
  const sel = el.querySelector(".sel-row");
  check(`selecting the droid's token offers Apply ${pistol} and Half ${Math.floor(pistol / 2)}`,
    sel?.textContent.includes("Cards Droid") && sel.querySelector('[data-how="selected"]')?.textContent.trim() === `Apply ${pistol}`
    && sel.querySelector('[data-how="half"]')?.textContent.trim() === `Half ${Math.floor(pistol / 2)}`,
    { row: sel?.textContent.trim() });
  const synthetic = () => tokenOf(droid).document.actor;
  await press(el, '[data-hc="apply-selected"][data-how="selected"]');
  el = await shown(p1.message);
  check(`Apply hits the unlinked token's own actor (20 to ${20 - pistol}); the base actor keeps 20; the row reads Took with Undo`,
    synthetic().system.hp.value === 20 - pistol && droid.system.hp.value === 20 && el.querySelector(".sel-row")?.textContent.includes(`Took ${pistol}`)
    && el.querySelector('[data-hc="undo-selected"]'),
    { token: synthetic().system.hp.value, base: droid.system.hp.value, row: el.querySelector(".sel-row")?.textContent.trim() });
  await press(el, '[data-hc="undo-selected"]');
  el = await shown(p1.message);
  check("Undo gives the token its 20 back and the row offers Apply again",
    synthetic().system.hp.value === 20 && el.querySelector('[data-hc="apply-selected"]'), { token: synthetic().system.hp.value });
  canvas.tokens.releaseAll();

  // 8. Critical from the sheet: the whole result doubles.
  const p2 = await askAndRoll("crit", 6, 6, 6);
  el = await shown(p2.message);
  const tags = [...el.querySelectorAll(".card-title .tag")].map((t) => t.textContent.trim());
  check("Critical doubles the whole result: (18 + DEX) x 2, tagged Critical",
    p2.message.rolls[0]?.total === (18 + attacker.system.scores.dex.mod) * 2 && tags.includes("Critical"),
    { total: p2.message.rolls[0]?.total, formula: p2.message.rolls[0]?.formula, tags });

  // 9. A natural 20 at the droid: Critical on the attack card, and its damage card doubles.
  target(droid);
  const a3 = await attack("Blaster Pistol", 20);
  const r3 = rows(a3.el);
  force(6, 2, 2, 2);
  const d3 = await press(a3.el, 'button[data-hc="damage"]', "createChatMessage");
  el = await shown(d3);
  check("a natural 20 reads Critical (natural 20 for the GM) and offers Roll critical damage, which doubles",
    r3[0]?.result === "Critical" && r3[0].text.includes("natural 20") && d3.rolls[0]?.total === (6 + attacker.system.scores.dex.mod) * 2
    && rows(el)[0]?.result === "Critical",
    { attack: r3, damage: d3.rolls[0]?.total, row: rows(el)[0] });

  // 10. The Play tab's type tag switches the pistol to Stun; Stun damage does nothing to the droid.
  const pistolItem = attacker.items.getName("Blaster Pistol");
  const switched = waitHook("updateItem");
  weaponRow("Blaster Pistol").querySelector('[data-action="cycleDamageType"]').click();
  await switched;
  await sheet.render({ force: true });
  const tagText = weaponRow("Blaster Pistol").querySelector('[data-action="cycleDamageType"]')?.textContent.trim();
  target(droid);
  const p3 = await askAndRoll("normal", 3, 3, 3);
  el = await shown(p3.message);
  const r4 = rows(el);
  check("the tag reads Stun after a click; the pistol's Stun damage card gives the droid 0 (immune)",
    pistolItem.system.damageType === "Stun" && tagText === "Stun" && r4[0]?.n === "0" && r4[0].chips.includes("Droid: immune to Stun") && r4[0].button === null,
    { stored: pistolItem.system.damageType, tagText, row: r4[0] });
  const back = waitHook("updateItem");
  weaponRow("Blaster Pistol").querySelector('[data-action="cycleDamageType"]').click();
  await back;
  check("a second click goes back to Energy", pistolItem.system.damageType === "Energy", { stored: pistolItem.system.damageType });

  // 11. Force Point reroll, from the chat log's right-click menu. The menu builds its items before
  // its open animation, so they are found by polling, then clicked.
  const REROLL = "Spend a Force Point: take a new roll";
  const menuEntry = async (card) => {
    card.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
    for (let i = 0; i < 20; i++) {
      const item = [...document.querySelectorAll("#context-menu .context-item")].find((li) => li.textContent.trim() === REROLL);
      if (item) return item;
      await new Promise((r) => setTimeout(r, 0));
    }
    return null;
  };
  const fp = () => attacker.system.forcePoints.value;
  const tagsOf = (card) => [...card.querySelectorAll(".card-title .tag")].map((t) => t.textContent.trim());

  // An attack that misses both targets by one or more, its damage rolled (both rows 0), rerolled to a natural 20.
  target(trooper, droid);
  const a4 = await attack("Lightsaber", reflex(trooper) - saberBonus - 1);
  force(8, 5, 5, 5);
  const d4 = await press(a4.el, 'button[data-hc="damage"]', "createChatMessage");
  el = await shown(d4);
  const before4 = rows(el);
  const was4 = a4.message.rolls[0].total;
  const fp4 = fp();
  let entry = await menuEntry(await shown(a4.message));
  force(20, 20);
  const attackUpdated = waitHook("updateChatMessage", (m) => m.id === a4.message.id);
  const damageFollowed = waitHook("updateChatMessage", (m) => m.id === d4.id);
  entry?.click();
  await attackUpdated;
  await damageFollowed;
  const a4el = await shown(a4.message);
  el = await shown(d4);
  const after4 = rows(a4el), dmg4 = rows(el);
  check(`Force Point reroll of a missed attack to a natural 20: both targets Critical, tagged "Rerolled, was ${was4}", one Force Point spent; the damage card's rows turn to Hit (15, Apply), not doubled`,
    entry && before4.every((r) => r.result === "Miss" && r.n === "0") && after4.every((r) => r.result === "Critical") && tagsOf(a4el).includes(`Rerolled, was ${was4}`)
    && fp() === fp4 - 1 && a4el.querySelector('[data-hc="damage"]')?.textContent.trim() === "Roll critical damage" && a4el.querySelector(".hc-live .hint")?.textContent.includes(REROLL)
    && dmg4[0]?.result === "Hit" && dmg4[0].n === "15" && dmg4[0].button === "Apply" && d4.rolls[0].total === 15,
    { entry: Boolean(entry), before: before4, after: after4, damage: dmg4, tags: tagsOf(a4el), fp: [fp4, fp()] });

  // A Force power: the first total reaches the 15 band only; the reroll reaches 20, so the bands move.
  const lift = attacker.items.getName("Probe Lift");
  const utf = attacker.system.skillTotals.useTheForce.total;
  force(20, 16 - utf);
  let created = waitHook("createChatMessage");
  sheet.element.querySelector(`[data-action="rollPower"][data-item-id="${lift.id}"]`).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true }));
  const p4 = await created;
  let pel = await shown(p4);
  const bandsOf = (card) => [...card.querySelectorAll(".bands tr")].map((tr) => tr.className);
  const b1 = bandsOf(pel), t1 = p4.rolls[0].total;
  entry = await menuEntry(pel);
  force(20, 20 - utf);
  // The Force Point is spent after the card is updated, so both updates are waited for.
  const spent = (m) => Promise.all([waitHook("updateChatMessage", (x) => x.id === m.id), waitHook("updateActor", (a) => a.id === attacker.id)]);
  let updated = spent(p4);
  entry?.click();
  await updated;
  pel = await shown(p4);
  check(`power card: titled with the power and its tags; the reroll redraws the bands (Medium reached at ${t1}, then Large reached and Medium cleared at ${p4.rolls[0].total})`,
    pel.querySelector(".card-title h4")?.textContent.trim() === "Probe Lift" && tagsOf(pel).includes("Telekinetic") && tagsOf(pel).includes("Standard")
    && JSON.stringify(b1) === '["reached","dim","dim"]' && JSON.stringify(bandsOf(pel)) === '["cleared","reached","dim"]'
    && JSON.stringify(p4.getFlag("holocron", "power")?.reached) === "[1]" && tagsOf(pel).includes(`Rerolled, was ${t1}`) && fp() === fp4 - 2,
    { before: b1, after: bandsOf(pel), tags: tagsOf(pel), reached: p4.getFlag("holocron", "power")?.reached, fp: fp() });

  // A skill check: Perception rerolled from a 5 to a 15, which spends the last Force Point.
  force(20, 5);
  created = waitHook("createChatMessage");
  sheet.element.querySelector('[data-action="rollSkill"][data-skill="perception"]').dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true }));
  const c4 = await created;
  let cel = await shown(c4);
  const c1 = c4.rolls[0].total;
  entry = await menuEntry(cel);
  force(20, 15);
  updated = spent(c4);
  entry?.click();
  await updated;
  cel = await shown(c4);
  check(`skill card: titled Perception; the reroll takes ${c1} to ${c1 + 10} and spends the last Force Point`,
    cel.querySelector(".card-title h4")?.textContent.trim() === "Perception" && c4.rolls[0].total === c1 + 10 && c4.getFlag("holocron", "check")?.total === c1 + 10
    && tagsOf(cel).includes(`Rerolled, was ${c1}`) && fp() === 0, { before: c1, after: c4.rolls[0].total, tags: tagsOf(cel), fp: fp() });

  // With no Force Point left the entry warns and changes nothing: the forced die stays unused.
  entry = await menuEntry(cel);
  force(20, 1);
  entry?.click();
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  check("with no Force Points the reroll changes nothing", entry && c4.rolls[0].total === c1 + 10 && forced.length === 1 && fp() === 0, { total: c4.rolls[0].total, unusedDice: forced.length });
  forced.length = 0;
} finally {
  CONFIG.Dice.randomUniform = realUniform;
  game.user.targets.forEach((t) => t.setTarget(false, { releaseOthers: false }));
}
check("every forced die was used", forced.length === 0, { left: forced.length });
await sheet.close();
return JSON.stringify({ world: game.world.id, build: globalThis.CONFIG?.HOLOCRON?.buildId, results });
})();
