/* global game, canvas, ui, foundry, CONFIG, Actor, Scene, Hooks, MouseEvent, Event, document, setTimeout, getComputedStyle */
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
const waitHook = (name, test = () => true, ms = 20000) => new Promise((resolve) => {
  const id = Hooks.on(name, (doc, ...rest) => {
    if (!test(doc, ...rest)) return;
    Hooks.off(name, id);
    resolve(doc);
  });
  setTimeout(() => {
    Hooks.off(name, id);
    resolve(null);
  }, ms);
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
  const b1 = bandsOf(pel), powerTotal = p4.rolls[0].total;
  entry = await menuEntry(pel);
  force(20, 20 - utf);
  // The Force Point is spent after the card is updated, so both updates are waited for.
  const spent = (m) => Promise.all([waitHook("updateChatMessage", (x) => x.id === m.id), waitHook("updateActor", (a) => a.id === attacker.id)]);
  let updated = spent(p4);
  entry?.click();
  await updated;
  pel = await shown(p4);
  check(`power card: titled with the power and its tags; the reroll redraws the bands (Medium reached at ${powerTotal}, then Large reached and Medium cleared at ${p4.rolls[0].total})`,
    pel.querySelector(".card-title h4")?.textContent.trim() === "Probe Lift" && tagsOf(pel).includes("Telekinetic") && tagsOf(pel).includes("Standard")
    && JSON.stringify(b1) === '["reached","dim","dim"]' && JSON.stringify(bandsOf(pel)) === '["cleared","reached","dim"]'
    && JSON.stringify(p4.getFlag("holocron", "power")?.reached) === "[1]" && tagsOf(pel).includes(`Rerolled, was ${powerTotal}`) && fp() === fp4 - 2,
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

  // 12. The sheet's settings gear (mockup 1): accent, portrait shape, dice at the table.
  const gear = sheet.element.querySelector('.window-header [data-action="sheetSettings"]');
  const dialogShown = waitHook("renderDialogV2");
  gear?.click();
  const settings = await dialogShown;
  const swatches = [...(settings?.element.querySelectorAll("[data-accent]") ?? [])].map((b) => b.getAttribute("aria-label"));
  const saving = () => waitHook("updateActor", (a) => a.id === attacker.id);
  let saved = saving();
  settings?.element.querySelector('[data-accent="#1fa39a"]')?.click();
  await saved;
  saved = saving();
  settings?.element.querySelector('[data-shape="square"]')?.click();
  await saved;
  saved = saving();
  const tableBox = settings?.element.querySelector('input[name="rollAtTable"]');
  if (tableBox) {
    tableBox.checked = true;
    tableBox.dispatchEvent(new Event("change", { bubbles: true }));
  }
  await saved;
  settings?.element.querySelector('button[data-action="done"]')?.click();
  await sheet.render();
  const rootStyle = getComputedStyle(sheet.element);
  const portrait = sheet.element.querySelector(".portrait");
  const settingParts = {
    gear: Boolean(gear),
    swatches: swatches.join() === "Purple,Teal,Crimson,Amber,Blue,Pale yellow",
    // The prepared value is a Color (ColorField); the stored one is the hex string.
    stored: attacker._source.system.appearance.accent === "#1fa39a",
    css: rootStyle.getPropertyValue("--hc-accent").trim() === "#1fa39a",
    on: rootStyle.getPropertyValue("--hc-on-accent").trim() === "#000000",
    shape: portrait?.dataset.shape === "square",
    radius: Boolean(portrait) && getComputedStyle(portrait).borderRadius === "6px",
    table: attacker.system.settings.rollAtTable === true,
  };
  check("the title bar's gear opens six accents; Teal becomes the sheet's accent with black text on it (6.8:1); Square shapes the portrait; the table switch is stored",
    Object.values(settingParts).every(Boolean), { ...settingParts, accent: attacker.system.appearance.accent, swatchList: swatches });

  // 13. Dice at the table. `fill` is a face, a total, "foundry", or null to close the entry.
  const tableEntry = async (trigger, fill) => {
    const asked = waitHook("renderDialogV2");
    const made = waitHook("createChatMessage", () => true, fill === null ? 3000 : 20000);
    trigger();
    const app = await asked;
    const what = app?.element.querySelector(".hc-table-entry")?.textContent.replace(/\s+/g, " ").trim();
    if (!app) return { message: await made, what };
    if (fill === null) await app.close();
    else if (fill === "foundry") app.element.querySelector('button[data-action="foundry"]').click();
    else {
      if (fill.face !== undefined) app.element.querySelector('input[name="face"]').value = String(fill.face);
      if (fill.total !== undefined) app.element.querySelector('input[name="total"]').value = String(fill.total);
      app.element.querySelector('button[data-action="enter"]').click();
    }
    return { message: await made, what };
  };
  const shiftClick = (selector) => () => sheet.element.querySelector(selector).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true }));
  const perception = shiftClick('.hc-sidebar [data-action="rollSkill"][data-skill="perception"]');
  const per = attacker.system.skillTotals.perception.total;
  const TABLE = "Rolled at the table";

  const t1 = await tableEntry(perception, { face: 17 });
  let tEl = t1.message ? await shown(t1.message) : null;
  check(`Perception at the table: face 17 gives ${17 + per} with a natural 17, tagged; the card's head takes the Teal accent`,
    t1.message?.rolls[0].total === 17 + per && t1.message.rolls[0].dice[0]?.total === 17 && tagsOf(tEl).includes(TABLE) && tEl.style.getPropertyValue("--speaker") === "#1fa39a",
    { total: t1.message?.rolls[0].total, natural: t1.message?.rolls[0].dice[0]?.total, tags: tEl && tagsOf(tEl), what: t1.what, speaker: tEl?.style.getPropertyValue("--speaker") });
  const t2 = await tableEntry(perception, { total: 23 });
  check("a finished total of 23 is the whole roll, with no die", t2.message?.rolls[0].total === 23 && t2.message.rolls[0].dice.length === 0, { total: t2.message?.rolls[0].total, formula: t2.message?.rolls[0].formula });
  force(20, 8);
  const t3 = await tableEntry(perception, "foundry");
  tEl = t3.message ? await shown(t3.message) : null;
  check(`Roll in Foundry rolls as usual (8 + ${per}), untagged`, t3.message?.rolls[0].total === 8 + per && !tagsOf(tEl).includes(TABLE), { total: t3.message?.rolls[0].total });
  const t4 = await tableEntry(perception, null);
  check("closing the entry posts nothing", t4.message === null, { posted: t4.message?.id });
  let asked = 0;
  const counting = Hooks.on("renderDialogV2", () => asked++);
  force(20, 11);
  const initiativeMade = waitHook("createChatMessage");
  shiftClick('.hc-sidebar [data-action="rollSkill"][data-skill="initiative"]')();
  const ini = await initiativeMade;
  Hooks.off("renderDialogV2", counting);
  check("Initiative never asks: it rolls in Foundry", ini && asked === 0 && ini.rolls[0].dice[0]?.total === 11, { asked, natural: ini?.rolls[0].dice[0]?.total });

  // An attack entered as a natural 20, then its critical damage entered as 12 for the 3d8.
  target(trooper);
  const t5 = await tableEntry(() => weaponRow("Lightsaber").querySelector('[data-action="attack"]').click(), { face: 20 });
  tEl = t5.message ? await shown(t5.message) : null;
  const flatDamage = Number(weaponRow("Lightsaber").querySelectorAll(".meta b")[1].textContent.split("+")[1] ?? 0);
  const t6 = tEl ? await tableEntry(() => tEl.querySelector('button[data-hc="damage"]').click(), { face: 12 }) : {};
  check(`an attack entered as a natural 20 is a critical; its damage asks for "Total of your 3d8" and doubles 12 + ${flatDamage}`,
    rows(tEl)[0]?.result === "Critical" && tagsOf(tEl).includes(TABLE) && t6.what?.includes("Total of your 3d8") && t6.what.includes("critical")
    && t6.message?.rolls[0].total === (12 + flatDamage) * 2 && t6.message.rolls[0].formula.includes("12[3d8 rolled at the table]"),
    { attack: rows(tEl), what: t6.what, total: t6.message?.rolls[0].total, formula: t6.message?.rolls[0].formula });

  // A Force Point reroll at the table asks for the new face.
  await attacker.update({ "system.forcePoints.value": 1 });
  const t1Card = await shown(t1.message);
  entry = await menuEntry(t1Card);
  const rerollAsked = waitHook("renderDialogV2");
  entry?.click();
  const rerollApp = await rerollAsked;
  if (rerollApp) rerollApp.element.querySelector('input[name="face"]').value = "3";
  const rerolled = spent(t1.message);
  rerollApp?.element.querySelector('button[data-action="enter"]').click();
  await rerolled;
  const t1After = await shown(t1.message);
  check(`a Force Point reroll at the table takes the entered face: ${17 + per} to ${3 + per}, one table tag, the Force Point spent`,
    t1.message.rolls[0].total === 3 + per && tagsOf(t1After).filter((t) => t === TABLE).length === 1 && tagsOf(t1After).includes(`Rerolled, was ${17 + per}`) && fp() === 0,
    { total: t1.message.rolls[0].total, tags: tagsOf(t1After), fp: fp() });

  // Level up in Edit mode with a rolled hit die: the face is entered.
  // Waits for the control the last click should bring up: a render hook can be one queued earlier.
  const appears = async (selector) => {
    for (let i = 0; i < 40; i++) {
      const found = sheet.element.querySelector(selector);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 0));
    }
    return null;
  };
  (await appears('[data-action="toggleMode"]'))?.click();
  (await appears('[data-action="levelUpStart"]'))?.click();
  (await appears('[data-action="levelClass"]'))?.click();
  await appears('[data-action="levelHp"][data-mode="roll"]');
  const levelled = waitHook("updateActor", (a) => a.id === attacker.id && a._source.system.progression.length === 2);
  const t7 = await tableEntry(() => sheet.element.querySelector('[data-action="levelHp"][data-mode="roll"]')?.click(), { face: 7 });
  await levelled;
  check("a rolled level-up hit die at the table takes the entered face: level 2 gets 7 hit points",
    t7.message?.flavor === "Level 2 hit points (Jedi)" && t7.message.rolls[0].total === 7 && attacker._source.system.progression[1]?.hitPoints === 7,
    { flavor: t7.message?.flavor, total: t7.message?.rolls[0].total, progression: attacker._source.system.progression });
} finally {
  CONFIG.Dice.randomUniform = realUniform;
  game.user.targets.forEach((t) => t.setTarget(false, { releaseOthers: false }));
}
check("every forced die was used", forced.length === 0, { left: forced.length });
await sheet.close();
return JSON.stringify({ world: game.world.id, build: globalThis.CONFIG?.HOLOCRON?.buildId, results });
})();
