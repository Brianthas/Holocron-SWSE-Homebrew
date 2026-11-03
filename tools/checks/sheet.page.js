/* global game, Actor, Hooks, getComputedStyle, Event, DataTransfer, DragEvent, MouseEvent, Roll, Scene, Combat, CONFIG, fromUuid, __PACK_DOCS__ */
// The character sheet (mockup 1, first slice), driven through its own controls on the rendered DOM.
// pack-docs: species/bothan, species/jawa, classes/jedi, weapons/blaster-pistol
//
//   Fixture: a Bothan Jedi 1, all abilities 10, 30 hit points. Expected, from the rules and the
//   converted documents: Will 10 + 1 level + 0 WIS + 2 Iron Will (Species) = 13; Reflex 11; Force
//   Points per day 1 (level 1-5, episode-vii); Destiny cap 1; pooled Force cap 3; INT 10 understands
//   Galactic Basic, Huttese, or Ryl (episode-vii, Languages table).

(async () => {
if (game.world.id !== "holocron-testing" || game.system.id !== "holocron") {
  return JSON.stringify({ refused: `world ${game.world.id}, system ${game.system.id}` });
}
const DOCS = __PACK_DOCS__;
const results = [];
// The detail is copied now: it can hold live document data that later steps change.
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail: JSON.parse(JSON.stringify(detail ?? null)) });
const FLAG = { holocron: { sheetFixture: true } };

const old = game.actors.filter((a) => a.getFlag("holocron", "sheetFixture")).map((a) => a.id);
if (old.length) await Actor.deleteDocuments(old);
// A run stopped part way can leave its initiative combat and scene behind.
for (const combat of game.combats.filter((c) => c.getFlag("holocron", "sheetFixture"))) await combat.delete();
for (const scene of game.scenes.filter((s) => s.getFlag("holocron", "sheetFixture"))) await scene.delete();
check("previous fixtures deleted", old.every((id) => !game.actors.get(id)), { deleted: old.length });

const withoutKey = (doc) => Object.fromEntries(Object.entries(doc).filter(([key]) => key !== "_key"));
const item = (path) => ({ ...withoutKey(DOCS[path]), effects: DOCS[path].effects.map(withoutKey) });
const jedi = DOCS["classes/jedi"]._id;
const actor = await Actor.create({
  name: "Sheet Probe", type: "character", flags: FLAG,
  system: { progression: [{ class: jedi }], hp: { value: 30 } },
  items: [item("species/bothan"), item("classes/jedi"), item("weapons/blaster-pistol")],
});

const sheet = actor.sheet;
check("the default character sheet is CharacterSheet", sheet.constructor.name === "CharacterSheet", { sheet: sheet.constructor.name });
const rendered = () => new Promise((resolve) => Hooks.once("renderCharacterSheet", resolve));
let wait = rendered();
await sheet.render({ force: true });
await wait;
const el = () => sheet.element;
const text = (sel) => el().querySelector(sel)?.textContent.trim().replace(/\s+/g, " ");
/** Puts the sheet in Play or Edit mode through the padlock, whatever mode the last step left. */
const ensureMode = async (mode) => {
  if (el().dataset.mode === mode) return;
  el().querySelector('[data-action="toggleMode"]').click();
  await sheet.render();
};
/** A setup write, waiting for the render it causes, so no stale render resolves a later wait. */
const write = async (data) => {
  const done = rendered();
  await actor.update(data);
  await done;
};

const will = el().querySelector('[data-defense="will"] .total');
check("sidebar Will 13, the tooltip naming Iron Will (species); Reflex 11", will?.textContent.trim() === "13" && will.dataset.tooltipHtml.includes("Iron Will (species)")
  && text('[data-defense="reflex"] .total') === "11", { will: will?.textContent.trim(), tooltip: will?.dataset.tooltipHtml, reflex: text('[data-defense="reflex"] .total') });
const band = [...el().querySelectorAll(".hc-band .char-line > span")].map((s) => s.textContent.trim());
check("band: name, Bothan · Medium, Jedi 1, Level 1, BAB +1", text(".hc-band .char-name") === "Sheet Probe"
  && JSON.stringify(band) === JSON.stringify(["Bothan · Medium", "Jedi 1", "Level 1", "BAB +1"]), { band });

// Hit point box: -n, +n, a total, and text it cannot read.
const hpBox = async (typed, expectUpdate = true) => {
  const input = el().querySelector("input.hp-input");
  const updated = expectUpdate ? new Promise((resolve) => Hooks.once("updateActor", resolve)) : null;
  wait = rendered();
  input.value = typed;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  if (updated) { await updated; await wait; }
  return { source: actor._source.system.hp.value, shown: el().querySelector("input.hp-input").value, state: text(".state") };
};
const hit = await hpBox("-5");
const healed = await hpBox("+3");
const set = await hpBox("0");
const junk = await hpBox("five", false);
check("HP box: -5 gives 25, +3 gives 28, 0 gives 0 and Staggered, 'five' changes nothing", hit.source === 25 && hit.shown === "25" && healed.source === 28
  && set.source === 0 && set.state === "Staggered" && junk.source === 0 && junk.shown === "0", { hit, healed, set, junk });
await write({ system: { hp: { value: 30 } } });

// Pips: a lit pip spends one, an empty pip restores one, never past the cap.
const pip = async (resource, index) => {
  const updated = new Promise((resolve) => Hooks.once("updateActor", resolve));
  wait = rendered();
  el().querySelector(`.pip[data-resource="${resource}"][data-index="${index}"]`).click();
  await updated;
  await wait;
  return actor._source.system[resource].value;
};
const fpPips = el().querySelectorAll('.pip[data-resource="forcePoints"]').length;
const fpRestored = await pip("forcePoints", 0);
const fpSpent = await pip("forcePoints", 0);
const pooledFromThird = await pip("pooledForce", 2);
const pooledPips = el().querySelectorAll('.pip[data-resource="pooledForce"]').length;
check("Force Points: 1 pip at Jedi 1; empty pip restores to 1, lit pip spends to 0", fpPips === 1 && fpRestored === 1 && fpSpent === 0, { fpPips, fpRestored, fpSpent });
check("pooled Force: 3 pips; the third empty pip restores one, to 1", pooledPips === 3 && pooledFromThird === 1, { pooledPips, pooledFromThird });

// Temp HP goes through the form (submitOnChange).
{
  const updated = new Promise((resolve) => Hooks.once("updateActor", resolve));
  wait = rendered();
  const temp = el().querySelector('input[name="system.hp.temp"]');
  temp.value = "5";
  temp.dispatchEvent(new Event("change", { bubbles: true }));
  await updated;
  await wait;
  check("temp HP 5 saves through the form", actor._source.system.hp.temp === 5, { temp: actor._source.system.hp.temp });
}

// Tabs.
const active = () => [...el().querySelectorAll("section.tab[data-group='primary']")].filter((s) => s.classList.contains("active")).map((s) => s.dataset.tab);
const startTabs = active();
el().querySelector('nav.sheet-tabs [data-tab="build"]').click();
const buildTabs = active();
const wis = el().querySelector('[data-ability="wis"] .total')?.textContent.trim();
const understands = text('[data-resource="understands"] .total');
el().querySelector('nav.sheet-tabs [data-tab="notes"]').click();
const notesTabs = active();
const proseMirror = Boolean(el().querySelector('prose-mirror[name="system.details.biography"]'));
el().querySelector('nav.sheet-tabs [data-tab="play"]').click();
check("tabs: Play first; Build shows WIS 10 and the language tier; Notes holds the biography editor", JSON.stringify(startTabs) === '["play"]' && JSON.stringify(buildTabs) === '["build"]'
  // INT 10 understands "Galactic Basic, Huttese, or Ryl" (episode-vii, Languages table, the INT 10 row).
  && wis === "10" && understands === "Galactic Basic, Huttese, or Ryl" && JSON.stringify(notesTabs) === '["notes"]' && proseMirror, { startTabs, buildTabs, wis, understands, notesTabs, proseMirror });

// Attack posts a card.
{
  const posted = new Promise((resolve) => Hooks.once("createChatMessage", resolve));
  el().querySelector('.list-row [data-action="attack"]').click();
  const message = await posted;
  // Core leaves a roll out of a card with content of its own, so the card must carry it.
  const shownTotal = (await message.renderHTML()).querySelector(".dice-total")?.textContent.trim();
  check("Attack on the Blaster Pistol row posts an attack card that shows the roll's total", message.speaker.actor === actor.id && message.rolls.length === 1
    && shownTotal === String(message.rolls[0].total), { flavor: message.flavor, rolls: message.rolls.length, shownTotal, total: message.rolls[0].total });
}

// Edit mode: the padlock, then each Build control, read back off the data and the rendered sheet.
// After an action, render once more and wait for it: that render reflects the latest data, where a
// render hook can catch an earlier one (adding a class item renders before the progression update).
// An item's own buttons (carry, size, worn) update the item, which fires updateItem instead.
const act = async (selector, hook = "updateActor") => {
  const updated = new Promise((resolve) => Hooks.once(hook, resolve));
  el().querySelector(selector).click();
  await updated;
  await sheet.render();
};
const playHasSteppers = Boolean(el().querySelector('[data-action="abilityStep"]'));
wait = rendered();
el().querySelector('[data-action="toggleMode"]').click();
await wait;
el().querySelector('nav.sheet-tabs [data-tab="build"]').click();
check("the padlock opens Edit mode: steppers and the name field appear, none in Play", !playHasSteppers && el().dataset.mode === "edit"
  && Boolean(el().querySelector('[data-action="abilityStep"]')) && Boolean(el().querySelector('.hc-band input[name="name"]')), { playHasSteppers, mode: el().dataset.mode });

// Point buy: all 10s cost 0; STR to 11 costs 1 (rulings.md costs 11 = 1).
await act('[data-action="abilityStep"][data-ability="str"][data-delta="1"]');
const pb = text(".pb-count");
check("raising STR from 10 to 11 sets the base to 11 and point buy to 1 / 25", actor._source.system.abilities.str.base === 11 && pb === "Point buy 1 / 25", { str: actor._source.system.abilities.str.base, pb });
await write({ system: { abilities: { str: { base: 18 }, dex: { base: 18 }, con: { base: 1 } } } });
const raiseAt18 = el().querySelector('[data-action="abilityStep"][data-ability="str"][data-delta="1"]').disabled;
const lowerAt1 = el().querySelector('[data-action="abilityStep"][data-ability="con"][data-delta="-1"]').disabled;
const over = el().querySelector(".pb-count").classList.contains("over");
check("at 18 raising is disabled, at 1 lowering is; 18 + 18 + 1 (17 + 17 - 2 = 32) shows over the budget", raiseAt18 && lowerAt1 && over && text(".pb-count") === "Point buy 32 / 25",
  { raiseAt18, lowerAt1, over, pb: text(".pb-count") });
await write({ system: { abilities: { str: { base: 10 }, dex: { base: 10 }, con: { base: 10 } } } });

// Entered scores.
await act('[data-action="abilityEntry"][data-mode="enter"]');
{
  const updated = new Promise((resolve) => Hooks.once("updateActor", resolve));
  wait = rendered();
  const input = el().querySelector('input[name="system.abilities.wis.base"]');
  input.value = "20";
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await updated;
  await wait;
}
check("Enter scores: the switch saves 'enter', WIS typed as 20 saves, and the counter says scores are entered", actor._source.system.abilityEntry === "enter"
  && actor._source.system.abilities.wis.base === 20 && text('[data-card="abilities"] .section-head .hint') === "Scores entered by hand",
  { entry: actor._source.system.abilityEntry, wis: actor._source.system.abilities.wis.base });
await write({ system: { abilityEntry: "buy", abilities: { wis: { base: 10 } } } });

// The species +2: a Medium Bothan may put it on DEX; a Small Jawa may not.
await act('[data-action="speciesPick"][data-ability="dex"]');
check("Bothan: +2 on DEX gives DEX 12", actor._source.system.speciesChoice === "dex" && el().querySelector('[data-ability="dex"] .score').textContent.trim() === "12",
  { choice: actor._source.system.speciesChoice, dex: el().querySelector('[data-ability="dex"] .score')?.textContent.trim() });
const jawa = await Actor.create({ name: "Sheet Probe Jawa", type: "character", flags: FLAG, system: { progression: [{ class: jedi }] }, items: [item("species/jawa"), item("classes/jedi")] });
wait = new Promise((resolve) => Hooks.once("renderCharacterSheet", resolve));
await jawa.sheet.render({ force: true });
await wait;
jawa.sheet.element.querySelector('[data-action="toggleMode"]').click();
await new Promise((resolve) => Hooks.once("renderCharacterSheet", resolve));
const jawaDex = jawa.sheet.element.querySelector('[data-action="speciesPick"][data-ability="dex"]');
const jawaStr = jawa.sheet.element.querySelector('[data-action="speciesPick"][data-ability="str"]');
check("Jawa (Small): the DEX +2 is disabled, STR's is not", jawaDex?.disabled === true && jawaStr?.disabled === false, { dex: jawaDex?.disabled, str: jawaStr?.disabled });
await jawa.sheet.close();

// Defense points: 2 in one Defense, 4 in all at level 1 (episode-vii, Classes).
await act('[data-action="defenseStep"][data-defense="reflex"][data-delta="1"]');
await act('[data-action="defenseStep"][data-defense="reflex"][data-delta="1"]');
const reflexThird = el().querySelector('[data-action="defenseStep"][data-defense="reflex"][data-delta="1"]').disabled;
await act('[data-action="defenseStep"][data-defense="will"][data-delta="1"]');
await act('[data-action="defenseStep"][data-defense="will"][data-delta="1"]');
const fortAtFour = el().querySelector('[data-action="defenseStep"][data-defense="fortitude"][data-delta="1"]').disabled;
const sidebarReflex = text('[data-defense="reflex"] .total');
check("Defense points: Reflex stops at 2, Fortitude stops when 4 are spent; Reflex 11 + DEX 12's +1 + 2 points = 14", reflexThird && fortAtFour
  && actor._source.system.defensePoints.reflex === 2 && actor._source.system.defensePoints.will === 2 && sidebarReflex === "14",
  { reflexThird, fortAtFour, points: actor._source.system.defensePoints, sidebarReflex });

// Trained skills: Jedi 4 + INT 0 = 4 for a Bothan (no Bonus Trained Skill trait, not Primitive).
el().querySelector('nav.sheet-tabs [data-tab="play"]').click();
for (const k of ["stealth", "perception", "pilot", "mechanics"]) await act(`[data-action="toggleTrained"][data-skill="${k}"]`);
const atFour = { count: text(".trained-count b"), over: el().querySelector(".trained-count").classList.contains("over"), stealth: text('[data-skill="stealth"] .total') };
await act('[data-action="toggleTrained"][data-skill="survival"]');
const atFive = { count: text(".trained-count b"), over: el().querySelector(".trained-count").classList.contains("over") };
// Stealth trained: half level 0 + trained 5 + DEX 12's +1 = +6.
check("trained: 4 / 4 is not over and Stealth reads +6; a fifth gives 5 / 4, over", atFour.count === "4 / 4" && !atFour.over && atFour.stealth === "+6" && atFive.count === "5 / 4" && atFive.over,
  { atFour, atFive });

// Name and languages through the form, then back to Play.
{
  const updated = new Promise((resolve) => Hooks.once("updateActor", resolve));
  wait = rendered();
  const name = el().querySelector('.hc-band input[name="name"]');
  name.value = "Sheet Probe Renamed";
  name.dispatchEvent(new Event("change", { bubbles: true }));
  await updated;
  await wait;
}
el().querySelector('nav.sheet-tabs [data-tab="build"]').click();
{
  const updated = new Promise((resolve) => Hooks.once("updateActor", resolve));
  wait = rendered();
  const select = el().querySelector('select[name="system.languages.alsoSpeaks"]');
  select.value = "Huttese";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await updated;
  await wait;
}
wait = rendered();
el().querySelector('[data-action="toggleMode"]').click();
await wait;
check("the name and Also speaks save through the form; locking returns to Play with no steppers", actor.name === "Sheet Probe Renamed" && actor._source.system.languages.alsoSpeaks === "Huttese"
  && el().dataset.mode === "play" && !el().querySelector('[data-action="abilityStep"]'), { name: actor.name, speaks: actor._source.system.languages.alsoSpeaks, mode: el().dataset.mode });
await write({ name: "Sheet Probe" });

// Levels. Average hit points: floor(die / 2) + 1 (rulings.md, Hit points and healing): d10 gives 6.
await ensureMode("edit");
el().querySelector('nav.sheet-tabs [data-tab="build"]').click();
// The sheet's own state (the level-up row, the increase picks) is set before the action's first await.
const clickAndRender = async (selector) => {
  el().querySelector(selector).click();
  await sheet.render();
};
await clickAndRender('[data-action="levelUpStart"]');
const classStep = {
  taken: [...el().querySelectorAll('[data-action="levelClass"]')].map((b) => b.textContent.trim()),
  offersJedi: [...el().querySelectorAll("select.level-class option")].some((o) => o.textContent === "Jedi"),
  offersSoldier: [...el().querySelectorAll("select.level-class option")].some((o) => o.textContent === "Soldier"),
};
await clickAndRender('[data-action="levelUpCancel"]');
check("Level up offers Jedi 2 as a button and Soldier from the compendium, not Jedi again; Cancel changes nothing", JSON.stringify(classStep.taken) === '["Jedi 2"]'
  && !classStep.offersJedi && classStep.offersSoldier && !el().querySelector("[data-level-up]") && actor._source.system.progression.length === 1, classStep);

await clickAndRender('[data-action="levelUpStart"]');
await clickAndRender('[data-action="levelClass"]');
await act('[data-action="levelHp"][data-mode="average"]');
check("Jedi 2 at the average: hit points 6, maximum 30 + 6 = 36, level 2", actor._source.system.progression.length === 2 && actor._source.system.progression[1].hitPoints === 6
  && actor.system.hpMax.total === 36 && text(".hc-band .char-line") === "Bothan · MediumJedi 2Level 2BAB +2", { progression: actor._source.system.progression, max: actor.system.hpMax.total, band: text(".hc-band .char-line") });

await clickAndRender('[data-action="levelUpStart"]');
{
  wait = rendered();
  const select = el().querySelector("select.level-class");
  select.value = [...select.options].find((o) => o.textContent === "Soldier").value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await wait;
  await sheet.render();
}
const posted = new Promise((resolve) => Hooks.once("createChatMessage", resolve));
await act('[data-action="levelHp"][data-mode="roll"]');
const hpRoll = await posted;
const soldier = actor.items.find((i) => i.type === "class" && i.name === "Soldier");
const rolled = actor._source.system.progression[2]?.hitPoints;
check("Soldier 1 from the compendium, rolled: the class item is added, the roll is posted, and its die is the level's hit points", soldier && actor._source.system.progression[2].class === soldier.id
  && hpRoll.flavor === "Level 3 hit points (Soldier)" && hpRoll.rolls[0].total === rolled && rolled >= 1 && rolled <= 10 && actor.system.hpMax.total === 36 + rolled,
  { soldier: soldier?.id, rolled, flavor: hpRoll.flavor, max: actor.system.hpMax.total });

await clickAndRender('[data-action="levelUpStart"]');
await clickAndRender('[data-action="levelClass"][data-class-id="' + jedi + '"]');
await act('[data-action="levelHp"][data-mode="average"]');
for (const a of ["str", "dex", "con"]) await clickAndRender(`[data-action="increasePick"][data-level="4"][data-ability="${a}"]`);
const picked = [...el().querySelectorAll('[data-action="increasePick"][data-level="4"].on')].map((b) => b.dataset.ability);
await act('[data-action="increaseSave"][data-level="4"]');
check("level 4: the picker takes two abilities and refuses a third; saving gives STR 11 and DEX 13 (10 + 2 species + 1)", JSON.stringify(picked) === '["str","dex"]'
  && JSON.stringify(actor._source.system.progression[3].increases) === '["str","dex"]' && actor.system.scores.str.value === 11 && actor.system.scores.dex.value === 13,
  { picked, increases: actor._source.system.progression[3]?.increases, str: actor.system.scores.str.value, dex: actor.system.scores.dex.value });

await act('[data-action="removeLevel"]');
check("Remove level 4 leaves three levels, the increase with it", actor._source.system.progression.length === 3 && actor.system.scores.str.value === 10, { levels: actor._source.system.progression.length });

// Level 1 on a character with none: taken at once, with the class's level-1 hit points.
{
  const blank = await Actor.create({ name: "Sheet Probe Blank", type: "character", flags: FLAG, items: [item("species/bothan")] });
  const sheet2 = blank.sheet;
  let w = new Promise((resolve) => Hooks.once("renderCharacterSheet", resolve));
  await sheet2.render({ force: true });
  await w;
  w = new Promise((resolve) => Hooks.once("renderCharacterSheet", resolve));
  sheet2.element.querySelector('[data-action="toggleMode"]').click();
  await w;
  sheet2.changeTab("build", "primary");
  w = new Promise((resolve) => Hooks.once("renderCharacterSheet", resolve));
  sheet2.element.querySelector('[data-action="levelUpStart"]').click();
  await w;
  const updated = new Promise((resolve) => Hooks.once("updateActor", resolve));
  const select = sheet2.element.querySelector("select.level-class");
  select.value = [...select.options].find((o) => o.textContent === "Jedi").value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await updated;
  const cls = blank.items.find((i) => i.type === "class");
  check("level 1 on a blank character: Jedi is added and taken at once, maximum hit points 30", cls?.name === "Jedi" && blank._source.system.progression.length === 1
    && blank._source.system.progression[0].class === cls.id && blank.system.hpMax.total === 30, { cls: cls?.name, levels: blank._source.system.progression.length, max: blank.system.hpMax.total });
  await sheet2.close();
}

// Items, added the way a player adds them: a compendium entry dropped on the sheet.
const uuidOf = (pack, name) => game.packs.get(`holocron.${pack}`).index.getName(name)?.uuid;
const drop = async (uuid) => {
  const created = new Promise((resolve) => Hooks.once("createItem", resolve));
  const data = new DataTransfer();
  data.setData("text/plain", JSON.stringify({ type: "Item", uuid }));
  el().querySelector("section.tab.active").dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  const item = await created;
  await sheet.render();
  return item;
};
el().querySelector('nav.sheet-tabs [data-tab="inventory"]').click();
const cap = () => ({ light: text('[data-capacity="light"] .total'), kit: text('[data-capacity="kit"] .total'), kitOver: el().querySelector('[data-capacity="kit"]').classList.contains("over") });
const capStart = cap();
const glow = await drop(uuidOf("equipment", "Glow Rod"));
const medkit = await drop(uuidOf("equipment", "Medical Kit"));
const rifle = await drop(uuidOf("weapons", "Blaster Rifle"));
const capFull = cap();
check("dropped from compendiums: STR 10 gives 1 / 10 Light and 0 / 1 Kit with the pistol; Glow Rod, Medical Kit and Blaster Rifle make 2 / 10 and 2 / 1, over",
  capStart.light === "1 / 10" && capStart.kit === "0 / 1" && capFull.light === "2 / 10" && capFull.kit === "2 / 1" && capFull.kitOver
  && [glow, medkit, rifle].every((i) => i?.parent === actor), { capStart, capFull });

const carryOf = (item) => el().querySelector(`[data-action="cycleCarry"][data-item-id="${item.id}"]`)?.textContent.trim();
await act(`[data-action="cycleCarry"][data-item-id="${medkit.id}"]`, "updateItem");
const kitInHands = { medkit: carryOf(medkit), cap: cap() };
await act(`[data-action="cycleCarry"][data-item-id="${rifle.id}"]`, "updateItem");
const rifleNext = { rifle: carryOf(rifle), cap: cap() };
check("Medical Kit to In hands frees its Kit slot (1 / 1); with the hands full the Rifle goes to Stowed (0 / 1)", kitInHands.medkit === "In hands" && kitInHands.cap.kit === "1 / 1"
  && !kitInHands.cap.kitOver && rifleNext.rifle === "Stowed" && rifleNext.cap.kit === "0 / 1", { kitInHands, rifleNext });

const armor = await drop(uuidOf("armor", "Power Armor"));
await act(`[data-action="toggleWorn"][data-item-id="${armor.id}"]`, "updateItem");
const worn = { str: actor.system.scores.str.value, cap: cap(), button: el().querySelector(`[data-action="toggleWorn"][data-item-id="${armor.id}"]`)?.textContent.trim() };
check("Power Armor worn: STR 12 (its +2), so 12 Light and 2 Kit slots; droid systems are not shown for a Bothan", worn.str === 12 && worn.button === "Worn"
  && worn.cap.light === "2 / 12" && worn.cap.kit === "0 / 2" && !el().querySelector('[data-list="droidSystems"]'), worn);

// Sizes and removal are Edit mode controls.
await ensureMode("edit");
el().querySelector('nav.sheet-tabs [data-tab="inventory"]').click();
const medpac = await drop(uuidOf("equipment", "Medpac"));
const sizeStart = el().querySelector(`[data-action="cycleSize"][data-item-id="${medpac.id}"]`)?.textContent.trim();
await act(`[data-action="cycleSize"][data-item-id="${medpac.id}"]`, "updateItem");
const sized = { size: medpac.system.slot, cap: cap() };
check("Medpac converts with no size; the size button makes it Light, adding one Light slot (3 / 12)", sizeStart === "No size" && sized.size === "light" && sized.cap.light === "3 / 12", { sizeStart, sized });

const deleted = new Promise((resolve) => Hooks.once("deleteItem", resolve));
const dialogShown = new Promise((resolve) => Hooks.once("renderDialogV2", (app) => resolve(app)));
el().querySelector(`[data-action="deleteItem"][data-item-id="${glow.id}"]`).click();
const dialog = await dialogShown;
dialog.element.querySelector('[data-action="yes"]').click();
await deleted;
await sheet.render();
check("Remove asks Foundry's confirmation, then deletes the Glow Rod (Light 2 / 12)", !actor.items.get(glow.id) && cap().light === "2 / 12", { light: cap().light });

const toughness = await drop(uuidOf("feats", "Toughness"));
const stance = await drop(uuidOf("talents", "Dueling Stance"));
el().querySelector('nav.sheet-tabs [data-tab="build"]').click();
const featListed = Boolean(el().querySelector(`[data-list="feats"] [data-item-id="${toughness.id}"]`));
el().querySelector('nav.sheet-tabs [data-tab="play"]').click();
const talentRow = el().querySelector(`[data-list="talents"] [data-item-id="${stance.id}"]`)?.textContent.replace(/\s+/g, " ").trim();
check("a dropped feat is listed on Build, a dropped talent on Play with its action and tree", featListed && talentRow?.startsWith("Dueling Stance") && talentRow.includes("Lightsaber Combat"), { featListed, talentRow });

// The old species is deleted after the new one is created, so wait for the delete too.
let replaced = new Promise((resolve) => Hooks.once("deleteItem", resolve));
const jawaSpecies = await drop(uuidOf("species", "Jawa"));
await replaced;
const species = actor.items.filter((i) => i.type === "species").map((i) => i.name);
check("dropping a species replaces the one the character has", JSON.stringify(species) === '["Jawa"]' && jawaSpecies.parent === actor && actor.system.size === "small", { species, size: actor.system.size });
replaced = new Promise((resolve) => Hooks.once("deleteItem", resolve));
await drop(uuidOf("species", "Bothan"));
await replaced;

// Rolls. Expected totals are read off the roll and the character's own skill totals.
await ensureMode("play");
el().querySelector('nav.sheet-tabs [data-tab="play"]').click();
const nextMessage = () => new Promise((resolve) => Hooks.once("createChatMessage", resolve));
{
  const message = nextMessage();
  el().querySelector('.hc-sidebar [data-action="rollSkill"][data-skill="perception"]').dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true }));
  const m = await message;
  const roll = m.rolls[0];
  check("Shift+click Perception rolls 1d20 + Perception with no dialog", m.flavor === "Perception check" && roll.formula.startsWith("1d20")
    && roll.total === roll.dice[0].total + actor.system.skillTotals.perception.total, { flavor: m.flavor, formula: roll.formula, total: roll.total, skill: actor.system.skillTotals.perception.total });
}
await write({ system: { forcePoints: { value: 1 } } });
{
  const shown = new Promise((resolve) => Hooks.once("renderDialogV2", resolve));
  el().querySelector('.skill [data-action="rollSkill"][data-skill="stealth"]').click();
  const dialog = await shown;
  dialog.element.querySelector('input[name="mode"][value="advantage"]').checked = true;
  dialog.element.querySelector('input[name="other"]').value = "2";
  const message = nextMessage();
  dialog.element.querySelector('[data-action="roll"]').click();
  const m = await message;
  await sheet.render();
  const roll = m.rolls[0];
  const kept = Math.max(...roll.dice[0].results.map((r) => r.result));
  check("Stealth with a Force Point and +2: 2d20 keep the higher + Stealth + 2, one Force Point spent", roll.formula.startsWith("2d20kh") && roll.dice[0].results.length === 2
    && roll.total === kept + actor.system.skillTotals.stealth.total + 2 && actor._source.system.forcePoints.value === 0,
  { formula: roll.formula, total: roll.total, kept, stealth: actor.system.skillTotals.stealth.total, fp: actor._source.system.forcePoints.value });
}
{
  const shown = new Promise((resolve) => Hooks.once("renderDialogV2", resolve));
  let posts = 0;
  const count = () => posts++;
  Hooks.on("createChatMessage", count);
  el().querySelector('.skill [data-action="rollSkill"][data-skill="stealth"]').click();
  const dialog = await shown;
  const advantageDisabled = dialog.element.querySelector('input[name="mode"][value="advantage"]').disabled;
  const closed = new Promise((resolve) => Hooks.once("closeDialogV2", resolve));
  dialog.element.querySelector('[data-action="cancel"]').click();
  await closed;
  Hooks.off("createChatMessage", count);
  check("with no Force Points Advantage is disabled; Cancel posts nothing", advantageDisabled && posts === 0, { advantageDisabled, posts });
}

// Second Wind: the highest Hit Die (Jedi and Soldier, d10) + CON + level + healing received.
const heal = actor.system.healing;
const healsShown = text('[data-resource="secondWind"] .heals');
await write({ system: { hp: { value: 10 }, secondWind: { value: 1 } } });
{
  const message = nextMessage();
  await act('[data-action="secondWind"]');
  const m = await message;
  const rolled = m.rolls[0].total;
  const expected = Math.min(actor.system.hpMax.total, 10 + rolled);
  check(`Second Wind shows ${healsShown}, heals the roll from 10, and uses its one use`, heal.die === 10 && healsShown === `1d10 + ${heal.flat.total}`
    && actor._source.system.hp.value === expected && actor._source.system.secondWind.value === 0 && el().querySelector('[data-action="secondWind"]').disabled,
  { healsShown, rolled, hp: actor._source.system.hp.value, expected, uses: actor._source.system.secondWind.value });
}
await write({ system: { hp: { value: actor.system.hpMax.total - 1 }, secondWind: { value: 1 } } });
await act('[data-action="secondWind"]');
check("Second Wind stops at the maximum", actor._source.system.hp.value === actor.system.hpMax.total, { hp: actor._source.system.hp.value, max: actor.system.hpMax.total });
await write({ system: { hp: { value: -1 } } });
check("while Dying the Second Wind card is gone", !el().querySelector('[data-resource="secondWind"]'), {});
await write({ system: { hp: { value: 30 } } });

// Initiative: the combat tracker's formula, and the sheet's roll setting the combatant.
{
  const formula = CONFIG.Combat.initiative.formula;
  const roll = await new Roll(formula, actor.getRollData()).evaluate();
  const scene = await Scene.create({ name: "Sheet Initiative", width: 1000, height: 800, grid: { size: 100 }, flags: FLAG });
  const [token] = await scene.createEmbeddedDocuments("Token", [{ name: actor.name, actorId: actor.id, x: 100, y: 100 }]);
  const combat = await Combat.create({ scene: scene.id, active: true, flags: FLAG });
  await combat.createEmbeddedDocuments("Combatant", [{ tokenId: token.id, sceneId: scene.id, actorId: actor.id }]);
  const message = nextMessage();
  // Registered before the click: the roll sets the combatant straight after posting its message.
  const combatantSet = new Promise((resolve) => Hooks.once("updateCombatant", resolve));
  el().querySelector('.hc-sidebar [data-action="rollSkill"][data-skill="initiative"]').dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true }));
  const m = await message;
  await combatantSet;
  const combatant = combat.combatants.contents[0];
  check("initiative: the tracker's formula adds the Initiative total; the sheet's roll sets the combatant", roll.total === roll.dice[0].total + actor.system.skillTotals.initiative.total
    && combatant.initiative === m.rolls[0].total, { formula, tracker: roll.total, sheetRoll: m.rolls[0].total, combatant: combatant.initiative });
  await combat.delete();
  await scene.delete();
}

// Force tab. INT 14 (+2): each Force Training gives 1 + 2 = 3 powers known (episode-vii:76 and
// Core p85). WIS sets the Dark Side maximum, half the score rounded up.
await ensureMode("play");
await write({ system: { abilities: { int: { base: 14 } } } });
el().querySelector('nav.sheet-tabs [data-tab="force"]').click();
const powerHint = () => text('[data-tab="force"] .section-head h3 .hint');
const forceStart = { tab: active(), known: powerHint(), pending: Boolean(el().querySelector(".inc-pending")) };
await drop(uuidOf("feats", "Force Training"));
await drop(uuidOf("feats", "Force Training"));
const knownTwo = { known: powerHint(), pending: text(".inc-pending"), intMod: actor.system.scores.int.mod };
check("Force tab: 0 / 0 known with no Force Training; two at INT 14 give 0 / 6 and '6 Force powers to choose'", JSON.stringify(forceStart.tab) === '["force"]'
  && forceStart.known === "0 / 0 known" && !forceStart.pending && knownTwo.intMod === 2 && knownTwo.known === "0 / 6 known" && knownTwo.pending === "6 Force powers to choose", { forceStart, knownTwo });

const moveObject = await drop(uuidOf("force-powers", "Move Object"));
// A second drop of a known power updates it rather than creating an item.
{
  const updated = new Promise((resolve) => Hooks.once("updateItem", resolve));
  const data = new DataTransfer();
  data.setData("text/plain", JSON.stringify({ type: "Item", uuid: uuidOf("force-powers", "Move Object") }));
  el().querySelector("section.tab.active").dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  await updated;
  await sheet.render();
}
const powerRow = () => el().querySelector(`[data-list="powers"] [data-item-id="${moveObject.id}"]`);
const lit = () => powerRow().querySelectorAll(".pip.on").length;
const secondCopy = {
  rows: actor.items.filter((i) => i.name === "Move Object").length, copies: moveObject.system.copies, ready: moveObject.system.ready,
  pips: powerRow().querySelectorAll(".pip").length, lit: lit(), known: powerHint(), tags: [...powerRow().querySelectorAll(".tag, .cost-tag")].map((t) => t.textContent.trim()),
};
check("Move Object dropped twice: one item with 2 copies, both ready, 2 / 6 known, tagged Telekinetic and Standard", secondCopy.rows === 1 && secondCopy.copies === 2
  && secondCopy.ready === 2 && secondCopy.pips === 2 && secondCopy.lit === 2 && secondCopy.known === "2 / 6 known" && JSON.stringify(secondCopy.tags) === '["Telekinetic","Standard"]', secondCopy);

const pipSteps = [];
for (const index of [0, 0, 1]) {
  await act(`[data-list="powers"] [data-item-id="${moveObject.id}"] .pip[data-index="${index}"]`, "updateItem");
  pipSteps.push(moveObject.system.ready);
}
check("power pips: a lit pip marks one used (2 to 1 to 0), an empty pip marks one ready (1)", JSON.stringify(pipSteps) === "[1,0,1]", { pipSteps });
await act('[data-action="readyPowers"]', "updateItem");
check("End of combat readies every copy (2 / 2)", moveObject.system.ready === 2 && lit() === 2, { ready: moveObject.system.ready });

// The power card: the highest band met is highlighted, lower ones cleared, higher ones dimmed. A
// cumulative power highlights every band met. +20 makes at least DC 20 certain.
const rollPowerWith = async (id, other) => {
  const shown = new Promise((resolve) => Hooks.once("renderDialogV2", resolve));
  el().querySelector(`[data-action="rollPower"][data-item-id="${id}"]`).click();
  const dialog = await shown;
  dialog.element.querySelector('input[name="other"]').value = String(other);
  const message = nextMessage();
  dialog.element.querySelector('[data-action="roll"]').click();
  const m = await message;
  const html = await m.renderHTML();
  const rows = [...html.querySelectorAll(".bands tr")].map((tr) => ({ dc: Number(tr.cells[0].textContent.replace("DC ", "")), cls: tr.className }));
  return { flavor: m.flavor, total: m.rolls[0].total, shownTotal: html.querySelector(".dice-total")?.textContent.trim(), rows, utf: actor.system.skillTotals.useTheForce.total, natural: m.rolls[0].dice[0].total };
};
const single = await rollPowerWith(moveObject.id, 20);
const best = Math.max(...single.rows.filter((r) => r.dc <= single.total).map((r) => r.dc));
check("Move Object's roll: Use the Force (Move Object), 1d20 + UtF + 20, only the highest DC met highlighted", single.flavor === "Use the Force (Move Object)"
  && single.total === single.natural + single.utf + 20 && single.shownTotal === String(single.total) && single.rows.length === 5
  && single.rows.every((r) => r.cls === (r.dc === best ? "reached" : r.dc <= single.total ? "cleared" : "dim")), single);
const assured = await drop(uuidOf("force-powers", "Assured Strike"));
const cumulative = await rollPowerWith(assured.id, 20);
check("Assured Strike (cumulative): every DC met highlighted, the rest dimmed", assured.system.cumulative === true && cumulative.rows.length === 4
  && cumulative.rows.some((r) => r.cls === "reached") && cumulative.rows.every((r) => r.cls === (r.dc <= cumulative.total ? "reached" : "dim")), cumulative);

// Ending a combat readies the powers of the characters in it (active GM's client).
{
  const spent = new Promise((resolve) => Hooks.once("updateItem", resolve));
  await moveObject.update({ "system.ready": 0 });
  await spent;
  const scene = await Scene.create({ name: "Sheet Combat End", width: 1000, height: 800, grid: { size: 100 }, flags: FLAG });
  // Linked, as a player character's token is; an unlinked token's powers belong to its synthetic actor.
  const [token] = await scene.createEmbeddedDocuments("Token", [{ name: actor.name, actorId: actor.id, actorLink: true, x: 100, y: 100 }]);
  const combat = await Combat.create({ scene: scene.id, active: true, flags: FLAG });
  await combat.createEmbeddedDocuments("Combatant", [{ tokenId: token.id, sceneId: scene.id, actorId: actor.id }]);
  const readied = new Promise((resolve) => Hooks.once("updateItem", resolve));
  await combat.delete();
  await readied;
  await scene.delete();
  await sheet.render();
  check("deleting a combat the character is in readies its powers (0 to 2)", moveObject.system.ready === 2 && lit() === 2, { ready: moveObject.system.ready });
}

// Dark Side, set by clicking a pip.
const dsMax = Math.ceil(actor.system.scores.wis.value / 2);
const ds = () => ({ score: text(".ds-score"), fallen: Boolean(el().querySelector(".fallen-badge")), pips: el().querySelectorAll(".ds-pip").length, on: el().querySelectorAll(".ds-pip.on").length });
await act('.ds-pip[data-value="3"]');
const dsThree = ds();
await act(`.ds-pip[data-value="${dsMax}"]`);
const dsFull = ds();
await act(`.ds-pip[data-value="${dsMax - 1}"]`);
const dsBelow = ds();
check(`Dark Side: ${dsMax + 1} pips (0 to half WIS rounded up); 3 is not Fallen, ${dsMax} is, ${dsMax - 1} is not`, dsMax === actor.system.darkSideMax
  && dsThree.pips === dsMax + 1 && dsThree.score === `3 / ${dsMax}` && dsThree.on === 4 && !dsThree.fallen && dsFull.fallen && dsFull.on === dsMax + 1 && !dsBelow.fallen, { dsMax, dsThree, dsFull, dsBelow });

// Edit mode: the minus removes a copy; the last copy asks Foundry's confirmation and removes the power.
await ensureMode("edit");
el().querySelector('nav.sheet-tabs [data-tab="force"]').click();
await act(`[data-action="removeCopy"][data-item-id="${moveObject.id}"]`, "updateItem");
const oneCopy = { copies: moveObject.system.copies, ready: moveObject.system.ready, pips: powerRow().querySelectorAll(".pip").length };
{
  const deleted = new Promise((resolve) => Hooks.once("deleteItem", resolve));
  const dialogShown = new Promise((resolve) => Hooks.once("renderDialogV2", (app) => resolve(app)));
  el().querySelector(`[data-action="removeCopy"][data-item-id="${moveObject.id}"]`).click();
  (await dialogShown).element.querySelector('[data-action="yes"]').click();
  await deleted;
  await sheet.render();
}
check("Edit mode's minus: 2 copies to 1 (ready 1), then the last copy deletes Move Object; 1 / 6 known", oneCopy.copies === 1 && oneCopy.ready === 1 && oneCopy.pips === 1
  && !actor.items.get(moveObject.id) && powerHint() === "1 / 6 known", { oneCopy, known: powerHint() });

// Techniques: Jedi Knight's even levels give one each (its techniqueLevels).
await ensureMode("play");
el().querySelector('nav.sheet-tabs [data-tab="force"]').click();
const featureHint = (key) => el().querySelector(`[data-list="${key}"]`).previousElementSibling.querySelector(".hint").textContent.trim();
const techStart = featureHint("techniques");
const knight = (await actor.createEmbeddedDocuments("Item", [(await fromUuid(uuidOf("classes", "Jedi Knight"))).toObject()]))[0];
await write({ "system.progression": [...actor._source.system.progression, { class: knight.id }, { class: knight.id }] });
// Creating the class item rendered too, and that render can be the one write waited for.
await sheet.render();
const techSlot = { hint: featureHint("techniques"), pending: text(".inc-pending"), secrets: featureHint("secrets") };
const extended = await drop(uuidOf("force-techniques", "Extended Move Object"));
const techTaken = { hint: featureHint("techniques"), tag: text(`[data-list="techniques"] [data-item-id="${extended.id}"] .tag`), detailHidden: el().querySelector(`[data-list="techniques"] [data-item-id="${extended.id}"] .detail`).hidden };
await sheet.render();
el().querySelector(`[data-list="techniques"] [data-action="expand"][data-item-id="${extended.id}"]`).click();
await new Promise((resolve) => Hooks.once("renderCharacterSheet", resolve));
const opened = el().querySelector(`[data-list="techniques"] [data-item-id="${extended.id}"] .detail`);
check("Jedi Knight 2 gives 0 / 1 techniques and names it in the pending line; Extended Move Object fills it (1 / 1), tagged Move Object; its row opens to the description",
  techStart === "0 / 0" && techSlot.hint === "0 / 1" && techSlot.pending === "5 Force powers and 1 Force technique to choose" && techSlot.secrets === "0 / 0"
  && techTaken.hint === "1 / 1" && techTaken.tag === "Move Object" && techTaken.detailHidden && !opened.hidden && opened.textContent.trim().length > 40,
  { techStart, techSlot, techTaken, opened: opened.textContent.trim().slice(0, 60) });

// Browse opens the compendium browser on what it adds (verify:browser drives the browser itself).
{
  const shown = new Promise((resolve) => Hooks.once("renderCompendiumBrowser", resolve));
  el().querySelector('[data-action="browse"][data-target="secrets"]').click();
  const app = await shown;
  const opened = {
    tab: app.element.querySelector(".cb-tab.active")?.textContent.trim(),
    sub: app.element.querySelector('[data-key="forceSub"][aria-pressed="true"]')?.textContent.trim(),
    banner: app.element.querySelector(".cb-banner span")?.textContent.trim(),
  };
  check("Browse secrets opens the browser on Force, Secrets, adding to this character", opened.tab === "Force" && opened.sub === "Secrets"
    && opened.banner?.startsWith(`Adding to ${actor.name}'s Force secrets`), opened);
  await app.close();
}
el().querySelector('nav.sheet-tabs [data-tab="play"]').click();

// Effects tab. Defensive Stance: +5 to Reflex, Fortitude and Will (episode-vii, Combat), and DT+5
// with Fortitude.
el().querySelector('nav.sheet-tabs [data-tab="effects"]').click();
const sidebarDefense = (key) => Number(text(`.hc-sidebar [data-defense="${key}"] .total`));
const defensesNow = () => ({ reflex: sidebarDefense("reflex"), fortitude: sidebarDefense("fortitude"), will: sidebarDefense("will"), maneuver: sidebarDefense("maneuver"), button: text('[data-tab="effects"] [data-action="toggleStance"]') });
const stanceOff = defensesNow();
await act('[data-tab="effects"] [data-action="toggleStance"]', "createActiveEffect");
const stanceOn = defensesNow();
await act('[data-tab="effects"] [data-action="toggleStance"]', "deleteActiveEffect");
const stanceAgain = defensesNow();
check("Defensive Stance On adds 5 to Reflex, Fortitude, Will and DT+5 in the sidebar; Off takes it away", stanceOff.button === "Off" && stanceOn.button === "On"
  && ["reflex", "fortitude", "will", "maneuver"].every((k) => stanceOn[k] === stanceOff[k] + 5 && stanceAgain[k] === stanceOff[k]) && stanceAgain.button === "Off" && !actor.effects.size,
  { stanceOff, stanceOn, stanceAgain });
const effectRow = (list, name) => [...el().querySelectorAll(`[data-list="${list}"] .list-row`)].find((r) => r.querySelector(".nm")?.textContent.trim() === name);
const conditions = text('[data-list="conditions"] .list-row .nm');
const toughnessText = effectRow("item-effects", "Toughness")?.querySelector(".meta").textContent.trim();
const armorRow = () => effectRow("item-effects", "Power Armor");
const armorWorn = { text: armorRow()?.querySelector(".meta").textContent.trim(), inactive: armorRow()?.classList.contains("inactive"), str: actor.system.scores.str.value };
el().querySelector('nav.sheet-tabs [data-tab="inventory"]').click();
await act('[data-action="toggleWorn"]', "updateItem");
el().querySelector('nav.sheet-tabs [data-tab="effects"]').click();
const armorOff = { inactive: armorRow()?.classList.contains("inactive"), note: armorRow()?.querySelector(".end").textContent.trim(), str: actor.system.scores.str.value };
// Toughness's +5 is typed "toughness" in the converted feat; the others are untyped.
check("item effects: Toughness '+1 HP per level; +5 toughness bonus to HP; +1 healing received', Power Armor '+2 STR' while worn, dimmed, 'Not in use' and 2 STR less when not; the HP state under Conditions",
  conditions === actor.system.hpState.charAt(0).toUpperCase() + actor.system.hpState.slice(1) && toughnessText === "+1 HP per level; +5 toughness bonus to HP; +1 healing received"
  && armorWorn.text === "+2 STR" && !armorWorn.inactive && armorOff.inactive && armorOff.note === "Not in use" && armorOff.str === armorWorn.str - 2,
  { conditions, toughnessText, armorWorn, armorOff });

// A timed effect on the character: its changes and time left; Edit mode removes it.
const [timed] = await actor.createEmbeddedDocuments("ActiveEffect", [{ name: "Until Rest Probe", duration: { expiry: "rest" },
  system: { changes: [{ key: "skill.perception", type: "bonus", value: 2, bonusType: "insight", phase: "derived" }] } }]);
await sheet.render();
const timedRow = { text: effectRow("timed", "Until Rest Probe")?.querySelector(".meta").textContent.trim(), left: effectRow("timed", "Until Rest Probe")?.querySelector(".uses").textContent.trim() };
await ensureMode("edit");
el().querySelector('nav.sheet-tabs [data-tab="effects"]').click();
{
  const deleted = new Promise((resolve) => Hooks.once("deleteActiveEffect", resolve));
  const dialogShown = new Promise((resolve) => Hooks.once("renderDialogV2", (app) => resolve(app)));
  el().querySelector(`[data-action="deleteEffect"][data-effect-id="${timed.id}"]`).click();
  (await dialogShown).element.querySelector('[data-action="yes"]').click();
  await deleted;
  await sheet.render();
}
check("a timed effect lists '+2 insight bonus to Perception' and 'Until Long rest'; Edit mode removes it after confirmation", timedRow.text === "+2 insight bonus to Perception"
  && timedRow.left === "Until Long rest" && !actor.effects.get(timed.id) && !effectRow("timed", "Until Rest Probe"), timedRow);
await ensureMode("play");
el().querySelector('nav.sheet-tabs [data-tab="play"]').click();

// Pins: the toggle on a row, a right-click on a row, chips in pin order at the top of Play, and a
// chip doing what its row's main button does.
const pistol = actor.items.getName("Blaster Pistol");
const assuredStrike = actor.items.getName("Assured Strike");
const duelingStance = actor.items.getName("Dueling Stance");
const chips = () => [...el().querySelectorAll('[data-list="pins"] .pin-chip')].map((c) => c.textContent.trim());
const chipsStart = chips();
await act(`[data-action="togglePin"][data-pin-id="${pistol.id}"]`);
{
  const updated = new Promise((resolve) => Hooks.once("updateActor", resolve));
  el().querySelector('.list-row[data-pin-id="stance"] .nm').dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  await updated;
  await sheet.render();
}
el().querySelector('nav.sheet-tabs [data-tab="force"]').click();
await act(`[data-action="togglePin"][data-pin-id="${assuredStrike.id}"]`);
const forcePressed = el().querySelector(`[data-action="togglePin"][data-pin-id="${assuredStrike.id}"]`).getAttribute("aria-pressed");
el().querySelector('nav.sheet-tabs [data-tab="play"]').click();
const pinned = { chips: chips(), pins: [...actor._source.system.pins], pistolPressed: el().querySelector(`[data-action="togglePin"][data-pin-id="${pistol.id}"]`).getAttribute("aria-pressed"), forcePressed };
check("pinning: the Blaster Pistol's pin, a right-click on Defensive Stance, and Assured Strike's pin on Force make three chips in that order",
  chipsStart.length === 0 && JSON.stringify(pinned.chips) === '["Blaster Pistol","Defensive Stance","Assured Strike"]'
  && JSON.stringify(pinned.pins) === JSON.stringify([pistol.id, "stance", assuredStrike.id]) && pinned.pistolPressed === "true" && forcePressed === "true", { chipsStart, ...pinned });

const chip = (id) => el().querySelector(`[data-list="pins"] [data-pin-id="${id}"]`);
let card = nextMessage();
chip(pistol.id).click();
const chipAttack = await card;
await act(`[data-list="pins"] [data-pin-id="stance"]`, "createActiveEffect");
const stanceFromChip = actor.effects.some((e) => e.getFlag("holocron", "stance"));
await act(`[data-list="pins"] [data-pin-id="stance"]`, "deleteActiveEffect");
card = nextMessage();
chip(assuredStrike.id).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true }));
const chipPower = await card;
card = nextMessage();
el().querySelector(`[data-action="useItem"][data-item-id="${duelingStance.id}"]`).click();
const used = await card;
check("chips: the pistol's attacks, the stance's enters and leaves, Assured Strike's (Shift) rolls the power; a talent's Use posts its text",
  chipAttack.getFlag("holocron", "attack")?.weapon === "Blaster Pistol" && stanceFromChip && !actor.effects.size && chipPower.flavor === "Use the Force (Assured Strike)"
  && used.flavor === "Dueling Stance" && used.content.includes("Block"), { attack: chipAttack.getFlag("holocron", "attack")?.weapon, stanceFromChip, power: chipPower.flavor, used: used.flavor, usedText: used.content.slice(0, 80) });

// A deleted item's chip goes; unpinning by right-click takes the stance's away.
{
  const deleted = new Promise((resolve) => Hooks.once("deleteItem", resolve));
  await assuredStrike.delete();
  await deleted;
  await sheet.render();
  const updated = new Promise((resolve) => Hooks.once("updateActor", resolve));
  el().querySelector('.list-row[data-pin-id="stance"]').dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  await updated;
  await sheet.render();
}
check("a deleted pinned item drops out of the chips; a second right-click unpins the stance", JSON.stringify(chips()) === '["Blaster Pistol"]', { chips: chips() });

// Every region scrolls when the window is short (standing rule 19).
sheet.setPosition({ height: 360 });
const scrolls = (selector) => {
  const node = el().querySelector(selector);
  const before = { overflowY: getComputedStyle(node).overflowY, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight };
  node.scrollTop = node.scrollHeight;
  return { ...before, scrolledTo: node.scrollTop };
};
const sidebar = scrolls(".hc-sidebar");
const play = scrolls("section.tab.active");
check("at 360 px the sidebar and the Play panel scroll", [sidebar, play].every((s) => s.overflowY === "auto" && s.scrollHeight > s.clientHeight && s.scrolledTo > 0), { sidebar, play });

await sheet.close();
return JSON.stringify({ world: game.world.id, build: globalThis.CONFIG?.HOLOCRON?.buildId, results });
})();
