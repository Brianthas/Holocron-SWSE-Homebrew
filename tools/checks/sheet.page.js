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
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail });
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
const act = async (selector) => {
  const updated = new Promise((resolve) => Hooks.once("updateActor", resolve));
  wait = rendered();
  el().querySelector(selector).click();
  await updated;
  await wait;
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
