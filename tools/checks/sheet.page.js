/* global game, Actor, Hooks, getComputedStyle, Event, __PACK_DOCS__ */
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
  check("Attack on the Blaster Pistol row posts an attack card", message.speaker.actor === actor.id && message.rolls.length === 1, { flavor: message.flavor, rolls: message.rolls.length });
}

// Edit mode: the padlock, then each Build control, read back off the data and the rendered sheet.
// After an action, render once more and wait for it: that render reflects the latest data, where a
// render hook can catch an earlier one (adding a class item renders before the progression update).
const act = async (selector) => {
  const updated = new Promise((resolve) => Hooks.once("updateActor", resolve));
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
wait = rendered();
el().querySelector('[data-action="toggleMode"]').click();
await wait;
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
