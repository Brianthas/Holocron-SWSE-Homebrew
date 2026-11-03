/* global game, Actor, Hooks, ui, foundry, document, Event, DataTransfer, DragEvent, getComputedStyle, fromUuid */
// The compendium browser (mockup 3), driven through its own controls: the Compendium sidebar's
// button, the sheet's Browse buttons, search, filters, Add, and a drag onto the sheet.
//
//   Fixture: a Bothan Jedi 1 holding Force Training (repeatable) and Quick Draw (not). Expected
//   counts are read from the pack indexes, not written here.

(async () => {
if (game.world.id !== "holocron-testing" || game.system.id !== "holocron") {
  return JSON.stringify({ refused: `world ${game.world.id}, system ${game.system.id}` });
}
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail: JSON.parse(JSON.stringify(detail ?? null)) });
const FLAG = { holocron: { browserFixture: true } };
const old = game.actors.filter((a) => a.getFlag("holocron", "browserFixture")).map((a) => a.id);
if (old.length) await Actor.deleteDocuments(old);
foundry.applications.instances.get("holocron-browser")?.close();

const uuidOf = (pack, name) => game.packs.get(`holocron.${pack}`).index.getName(name)?.uuid;
const source = async (pack, name) => (await fromUuid(uuidOf(pack, name))).toObject();
const jedi = await source("classes", "Jedi");
const actor = await Actor.create({
  name: "Browser Probe", type: "character", flags: FLAG,
  items: [await source("species", "Bothan"), jedi, await source("feats", "Force Sensitivity"), await source("feats", "Force Training"), await source("feats", "Quick Draw")],
});
const jediItem = actor.items.find((i) => i.type === "class");
await actor.update({ "system.progression": [{ class: jediItem.id }] });

const rendered = () => new Promise((resolve) => Hooks.once("renderCompendiumBrowser", resolve));
const app = () => foundry.applications.instances.get("holocron-browser");
const el = () => app()?.element;
const text = (sel) => el().querySelector(sel)?.textContent.trim().replace(/\s+/g, " ");
const names = () => [...el().querySelectorAll(".result-row .rname")].map((b) => b.textContent.trim());
const click = async (selector) => {
  const done = rendered();
  el().querySelector(selector).click();
  await done;
};
const type = async (name, value) => {
  const done = rendered();
  const input = el().querySelector(`input[name="${name}"]`);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await done;
};
const tick = async (name, value, on = true) => {
  const done = rendered();
  const input = el().querySelector(value === null ? `input[name="${name}"]` : `input[name="${name}"][value="${value}"]`);
  input.checked = on;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await done;
};
const index = (pack) => [...game.packs.get(`holocron.${pack}`).index];

// The Compendium sidebar's button, which re-renders in place: one button after three renders.
ui.sidebar.changeTab("compendium", "primary");
for (let i = 0; i < 3; i++) await ui.compendium.render({ force: true });
const buttons = document.querySelectorAll(".holocron-browser-button").length;
let shown = rendered();
document.querySelector(".holocron-browser-button").click();
await shown;
const talentTotal = index("talents").length;
check("one Compendium sidebar button after three renders opens the browser on Talents with every talent", buttons === 1 && text(".cb-count") === `${talentTotal} talents`
  && text(".cb-tab.active") === "Talents", { buttons, count: text(".cb-count"), talentTotal });

// The window keeps its order between opens; this run starts from By tree.
await click('[data-action="seg"][data-key="order"][data-value="tree"]');

// Search covers talent and tree names.
await type("q", "dueling");
// In tree order a row's tree is the group head above it.
const treeOf = (row) => { let n = row.previousElementSibling; while (n && !n.classList.contains("group-head")) n = n.previousElementSibling; return n?.dataset.group ?? ""; };
const dueling = { names: names(), count: text(".cb-count"), rows: [...el().querySelectorAll(".result-row")].map((r) => `${r.querySelector(".rname").textContent.trim()} / ${treeOf(r)}`) };
check("searching 'dueling' finds Dueling Stance, and every result's name or tree says dueling", dueling.names.includes("Dueling Stance")
  && dueling.rows.every((r) => /dueling/i.test(r)) && dueling.rows.length < talentTotal, dueling);
await type("q", "");

// A class tag narrows the trees to the class's own and drops ticks outside them.
const soldierTrees = (await fromUuid(uuidOf("classes", "Soldier"))).system.talentTrees;
await tick("tree", "Alter");
const alterOnly = { count: text(".cb-count"), groups: [...el().querySelectorAll(".group-head .gname")].map((g) => g.textContent) };
await click('[data-action="classTag"][data-value="Soldier"]');
const treeList = [...el().querySelectorAll('input[name="tree"]')].map((i) => i.value);
const groups = [...el().querySelectorAll(".group-head .gname")].map((g) => g.textContent);
check("ticking Alter shows only Alter; the Soldier tag lists only Soldier's trees, drops the Alter tick, and groups only those trees",
  JSON.stringify(alterOnly.groups) === '["Alter"]' && treeList.length === soldierTrees.length && treeList.every((t) => soldierTrees.includes(t))
  && !el().querySelector('input[name="tree"][value="Alter"]') && groups.length > 0 && groups.every((g) => soldierTrees.includes(g)), { alterOnly, treeList, groups, soldierTrees });

// Collapse a group, open a row's text, then the flat A to Z order.
const firstGroup = groups[0];
await click(`[data-action="group"][data-group="${firstGroup}"]`);
const collapsed = { expanded: el().querySelector(`[data-group="${firstGroup}"]`).getAttribute("aria-expanded"), count: text(`[data-group="${firstGroup}"] .gcount`) };
await click(`[data-action="group"][data-group="${firstGroup}"]`);
const firstRow = el().querySelector(".result-row");
await click(`.result-row[data-uuid="${firstRow.dataset.uuid}"] [data-action="open"]`);
const description = el().querySelector(`.result-row[data-uuid="${firstRow.dataset.uuid}"] .desc`)?.textContent.trim() ?? "";
await click('[data-action="seg"][data-key="order"][data-value="name"]');
const flat = { heads: el().querySelectorAll(".group-head").length, names: names(), tagged: [...el().querySelectorAll(".result-row")].every((r) => r.querySelector(".tag")) };
check("a group collapses keeping its count; a row opens to its text; A to Z is one sorted list with each talent's tree", collapsed.expanded === "false" && Number(collapsed.count) > 0
  && description.length > 20 && flat.heads === 0 && flat.tagged && flat.names.join("|") === [...flat.names].sort((a, b) => a.localeCompare(b)).join("|"), { collapsed, description: description.slice(0, 60), heads: flat.heads });
await app().close();

// From the sheet's Browse powers: Add puts powers on the character, a second Add a copy.
const sheet = actor.sheet;
let wait = new Promise((resolve) => Hooks.once("renderCharacterSheet", resolve));
await sheet.render({ force: true });
await wait;
sheet.changeTab("force", "primary");
shown = rendered();
sheet.element.querySelector('[data-action="browse"][data-target="powers"]').click();
await shown;
const banner = text(".cb-banner span");
const moveUuid = uuidOf("force-powers", "Move Object");
const added = async (selector, hook) => {
  const done = Promise.all([new Promise((resolve) => Hooks.once(hook, resolve)), rendered()]);
  el().querySelector(selector).click();
  await done;
};
await added(`[data-action="add"][data-uuid="${moveUuid}"]`, "createItem");
await added(`[data-action="add"][data-uuid="${moveUuid}"]`, "updateItem");
const moveObject = actor.items.getName("Move Object");
const badge = text(`.result-row[data-uuid="${moveUuid}"] .badge`);
check("Browse powers opens Force with a banner; Add twice gives Move Object 2 copies and the 'Known, 2 copies' badge", text(".cb-tab.active") === "Force"
  && banner.startsWith("Adding to Browser Probe's Force powers") && moveObject?.system.copies === 2 && badge === "Known, 2 copies", { banner, copies: moveObject?.system.copies, badge });

await tick("source", "Telekinetic");
const teleRows = [...el().querySelectorAll(".result-row")].map((r) => [...r.querySelectorAll(".tag")].map((t) => t.textContent));
check("the Telekinetic descriptor leaves only Telekinetic powers", teleRows.length > 0 && teleRows.every((tags) => tags.includes("Telekinetic")), { rows: teleRows.length });
await click('[data-action="seg"][data-key="forceSub"][data-value="techniques"]');
const known = [...el().querySelectorAll(".group-head .gname")].map((g) => g.textContent);
const knownGroup = el().querySelector('.group-head[data-group="For powers you know"]');
const knownRows = [];
for (let n = knownGroup?.nextElementSibling; n && n.classList.contains("result-row"); n = n.nextElementSibling) knownRows.push(n.querySelector(".tag")?.textContent);
check("techniques: 'For powers you know' comes first and holds only Move Object's; no Add here (the target is powers)", known[0] === "For powers you know"
  && knownRows.length > 0 && knownRows.every((t) => t === "Move Object") && !el().querySelector('[data-action="add"]'), { known, knownRows });

// Feats: a taken feat is hidden unless it can be taken again.
await click('[data-action="showTab"][data-tab="feats"]');
await type("q", "");
const featNames = names();
// Two taken feats are not repeatable: Quick Draw and Force Sensitivity.
check("feats: Quick Draw and Force Sensitivity (taken) are hidden, Force Training (taken, repeatable) shows 'Taken, can repeat'", !featNames.includes("Quick Draw")
  && !featNames.includes("Force Sensitivity") && text(`.result-row[data-uuid="${uuidOf("feats", "Force Training")}"] .badge`) === "Taken, can repeat"
  && featNames.length === index("feats").length - 2, { count: featNames.length, total: index("feats").length });

// A row dragged onto the sheet adds the item.
{
  const data = new DataTransfer();
  el().querySelector(`.result-row[data-uuid="${uuidOf("feats", "Toughness")}"]`).dispatchEvent(new DragEvent("dragstart", { dataTransfer: data, bubbles: true }));
  const created = new Promise((resolve) => Hooks.once("createItem", resolve));
  sheet.element.querySelector("section.tab.active").dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  const item = await created;
  check("dragging Toughness from the browser onto the sheet adds it", item.name === "Toughness" && item.parent === actor, { dragged: data.getData("text/plain") });
}
await app().close();

// Inventory's Browse weapons: the Pistols group, and Add.
sheet.changeTab("inventory", "primary");
shown = rendered();
sheet.element.querySelector('[data-action="browse"][data-target="weapons"]').click();
await shown;
await tick("source", "Pistols");
const pistolTags = [...el().querySelectorAll(".result-row")].map((r) => [...r.querySelectorAll(".tag")].map((t) => t.textContent));
const pistolUuid = uuidOf("weapons", "Sonic Pistol");
await added(`[data-action="add"][data-uuid="${pistolUuid}"]`, "createItem");
check("Browse weapons: the Pistols group leaves only pistols; Add puts the Sonic Pistol in the inventory", pistolTags.length > 0 && pistolTags.every((t) => t.includes("Pistols"))
  && Boolean(actor.items.getName("Sonic Pistol")), { rows: pistolTags.length });
await app().close();

// Species from Build's Change (Edit mode): Denied shows only with the GM's switch; a trait search;
// Add replaces the species and closes the browser.
sheet.changeTab("build", "primary");
wait = new Promise((resolve) => Hooks.once("renderCharacterSheet", resolve));
sheet.element.querySelector('[data-action="toggleMode"]').click();
await wait;
shown = rendered();
sheet.element.querySelector('[data-action="browse"][data-target="species"]').click();
await shown;
const species = [...await game.packs.get("holocron.species").getIndex({ fields: ["system.rarity"] })];
const countOf = () => Number(text(".cb-count").split(" ")[0]);
const visible = countOf();
await tick("showDenied", null);
const withDenied = countOf();
await tick("showDenied", null, false);
await type("traitQ", "dark");
const suggestion = el().querySelector('[data-action="traitAdd"]')?.dataset.value;
await click(`[data-action="traitAdd"][data-value="${suggestion}"]`);
const traitRows = [...el().querySelectorAll(".result-row .prq")].map((p) => p.textContent);
const deniedCount = species.filter((s) => s.system?.rarity === "denied").length;
check("species: Denied show only with the switch (by the pack's Denied count); 'dark' suggests a trait whose results all carry it",
  withDenied - visible === deniedCount && visible + deniedCount === species.length && suggestion && traitRows.length > 0 && traitRows.every((t) => t.split(" · ").includes(suggestion)),
  { visible, withDenied, deniedCount, total: species.length, suggestion, rows: traitRows.length });
await click('[data-action="clear"]');
const jawaUuid = uuidOf("species", "Jawa");
const replaced = new Promise((resolve) => Hooks.once("deleteItem", resolve));
const closed = new Promise((resolve) => Hooks.once("closeCompendiumBrowser", resolve));
el().querySelector(`[data-action="add"][data-uuid="${jawaUuid}"]`).click();
await replaced;
await closed;
check("Add on Jawa replaces Bothan and closes the browser", JSON.stringify(actor.items.filter((i) => i.type === "species").map((i) => i.name)) === '["Jawa"]' && !app()?.rendered, {});

// The Build tab's Talent tree access card (the sheet is still in Edit mode on Build). Force
// Sensitivity gives the six Force trees; Jedi Order the three Jedi trees; every Jedi Lightsaber Combat.
const sheetText = (sel) => sheet.element.querySelector(sel)?.textContent.trim().replace(/\s+/g, " ");
const card = () => ({
  total: sheetText('[data-card="trees"] .section-head .hint'),
  groups: Object.fromEntries([...sheet.element.querySelectorAll('[data-card="trees"] .tree-group[data-group]')]
    .map((g) => [g.dataset.group, [...g.querySelectorAll(".chip")].map((c) => `${c.dataset.tree}${c.classList.contains("removed") ? " (removed)" : ""}`)])),
});
const sheetAct = async (selector, setup) => {
  const done = Promise.all([new Promise((resolve) => Hooks.once("updateActor", resolve)), new Promise((resolve) => Hooks.once("renderCharacterSheet", resolve))]);
  const node = sheet.element.querySelector(selector);
  if (setup) setup(node); else node.click();
  await done;
  await sheet.render();
};
const choose = (value) => (node) => { node.value = value; node.dispatchEvent(new Event("change", { bubbles: true })); };
const jediOrder = card();
await sheetAct('select[name="system.talentAccess.tradition"]', choose("sithOrder"));
const sithUnpicked = { ...card(), hint: sheetText('.tree-group[data-group="Jedi: Sith Order"] .hint') };
await sheetAct('select[name="system.talentAccess.traditionTree"]', choose("Krath"));
const sith = card();
check("tree card: Jedi Order gives 10 trees (6 Force, 3 Jedi, Lightsaber Combat); Sith Order asks for its tree, and Krath replaces the three Jedi trees (8)",
  jediOrder.total === "10 trees" && JSON.stringify(jediOrder.groups["Jedi: Jedi Order"]) === '["Jedi Consular","Jedi Guardian","Jedi Sentinel"]'
  && JSON.stringify(jediOrder.groups["Jedi: every tradition"]) === '["Lightsaber Combat"]' && jediOrder.groups["Force Sensitivity"]?.length === 6
  && sithUnpicked.hint === "Pick the tradition tree above" && sithUnpicked.total === "7 trees" && sith.total === "8 trees"
  && JSON.stringify(sith.groups["Jedi: Sith Order"]) === '["Krath"]', { jediOrder, sithUnpicked, sith });
await sheetAct('[data-action="toggleTree"][data-tree="Alter"]');
const removedAlter = card();
await sheetAct("select.add-tree", (node) => { node.value = "Duelist"; sheet.element.querySelector('[data-action="addTree"]').click(); });
const withDuelist = card();
check("tree card: removing Alter strikes it out (7 trees); adding Duelist puts it under Added by hand (8)", removedAlter.total === "7 trees"
  && removedAlter.groups["Force Sensitivity"].includes("Alter (removed)") && withDuelist.total === "8 trees" && JSON.stringify(withDuelist.groups["Added by hand"]) === '["Duelist"]',
  { removedAlter, withDuelist });

// The browser marks those trees Yours, lists them first, and its switch keeps only them.
const switchBefore = game.settings.get("holocron", "browserOnlyMine");
await game.settings.set("holocron", "browserOnlyMine", false);
sheet.changeTab("force", "primary");
shown = rendered();
sheet.element.querySelector('[data-action="browse"][data-target="powers"]').click();
await shown;
await click('[data-action="showTab"][data-tab="talents"]');
await click('[data-action="seg"][data-key="order"][data-value="tree"]');
const yours = () => [...el().querySelectorAll(".group-head")].filter((g) => g.querySelector(".badge.mine")).map((g) => g.dataset.group);
const allHeads = [...el().querySelectorAll(".group-head")].map((g) => g.dataset.group);
const mineFirst = { yours: yours(), firstHeads: allHeads.slice(0, yours().length) };
await tick("onlyMine", null);
const onlyMine = { heads: [...el().querySelectorAll(".group-head")].map((g) => g.dataset.group), count: text(".cb-count"), stored: game.settings.get("holocron", "browserOnlyMine") };
const expected = ["Control", "Dark Side", "Duelist", "Guardian Spirit", "Krath", "Light Side", "Lightsaber Combat", "Sense"];
check("browser: the card's 8 trees are Yours and come first; the switch keeps only them and is stored for this player",
  JSON.stringify([...mineFirst.yours].sort()) === JSON.stringify(expected) && JSON.stringify(mineFirst.firstHeads) === JSON.stringify(mineFirst.yours)
  && JSON.stringify([...onlyMine.heads].sort()) === JSON.stringify(expected) && onlyMine.count.endsWith("in your trees") && onlyMine.stored === true, { mineFirst, onlyMine });
await tick("onlyMine", null, false);

// Prerequisite markers, read off the probe's real items: it knows Move Object, not Mind Trick, has no
// Telekinetic Power talent, and its Sith Order tradition with Krath unlocks the Krath tree.
const qualifiedBefore = game.settings.get("holocron", "browserOnlyQualified");
await game.settings.set("holocron", "browserOnlyQualified", false);
await type("q", "");
const marker = (name) => {
  const row = el().querySelector(`.result-row[data-uuid="${uuidOf("talents", name)}"]`);
  return { badge: row?.querySelector(".badge.unmet")?.textContent ?? "", miss: [...(row?.querySelectorAll(".prq .miss") ?? [])].map((m) => m.textContent), line: row?.querySelector(".prq")?.textContent.trim() };
};
const illusion = marker("Illusion");
const massive = marker("Move Massive Object");
const krathSurge = marker("Krath Surge");
check("markers: Illusion lacks Mind Trick; Move Massive Object lacks only Telekinetic Power (Move Object is known); Krath Surge is met through the tradition",
  illusion.badge === "Prereq not met" && JSON.stringify(illusion.miss) === '["Mind Trick force power"]'
  && massive.badge === "Prereq not met" && JSON.stringify(massive.miss) === '["Telekinetic Power talent"]'
  && krathSurge.badge === "" && krathSurge.miss.length === 0 && krathSurge.line === "Needs: a member of The Krath", { illusion, massive, krathSurge });
await tick("onlyQualified", null);
const qualified = { count: text(".cb-count"), names: names(), stored: game.settings.get("holocron", "browserOnlyQualified") };
check("Only talents I qualify for hides Illusion and Move Massive Object, keeps Krath Surge, and no row left is marked", qualified.count.endsWith("you qualify for")
  && !qualified.names.includes("Illusion") && !qualified.names.includes("Move Massive Object") && qualified.names.includes("Krath Surge")
  && !el().querySelector(".badge.unmet") && qualified.stored === true, { count: qualified.count, stored: qualified.stored });
await app().close();
await game.settings.set("holocron", "browserOnlyMine", switchBefore);
await game.settings.set("holocron", "browserOnlyQualified", qualifiedBefore);

// The results scroll (standing rule 19).
shown = rendered();
document.querySelector(".holocron-browser-button").click();
await shown;
app().setPosition({ height: 400 });
const pane = el().querySelector(".cb-results");
const before = { overflowY: getComputedStyle(pane).overflowY, scrollHeight: pane.scrollHeight, clientHeight: pane.clientHeight };
pane.scrollTop = pane.scrollHeight;
check("at 400 px the results pane scrolls", before.overflowY === "auto" && before.scrollHeight > before.clientHeight && pane.scrollTop > 0, { ...before, scrolledTo: pane.scrollTop });
await app().close();
await sheet.close();
return JSON.stringify({ world: game.world.id, build: globalThis.CONFIG?.HOLOCRON?.buildId, results });
})();
