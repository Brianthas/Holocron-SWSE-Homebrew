import "./styles/holocron.scss";
import { CharacterModel } from "./data/actor/character.ts";
import { ITEM_MODELS } from "./data/item/models.ts";
import { registerChanges } from "./effects/changes.ts";
import { HolocronEffectModel } from "./effects/model.ts";
import { onChatContextOptions, onControlToken, renderCard } from "./dice/cards.ts";
import { onCombatEnd } from "./dice/force.ts";
import { CompendiumBrowser, registerBrowserSettings } from "./apps/browser.ts";
import { registerMigrations } from "./migrations.ts";
import { longRest, newDay, onRestMessage, registerRestExpiry } from "./rest.ts";
import { CharacterSheet } from "./sheets/character-sheet.ts";
import { DebugSheet } from "./sheets/debug-sheet.ts";

/** System-wide configuration, read by tools/verify-live.ts to confirm which build the client loaded. */
export const HOLOCRON = {
  buildId: __HOLOCRON_BUILD__,
};

// Each registration reports its own failure, so one throwing step cannot silently take the rest
// down with it (standing rule 4).
function register(label: string, step: () => void): void {
  try {
    step();
  } catch (error) {
    console.error(`holocron | init: ${label} failed`, error);
    ui.notifications?.error(`Holocron: ${label} failed at init; see the console.`);
  }
}

Hooks.once("init", () => {
  (CONFIG as unknown as Record<string, unknown>)["HOLOCRON"] = HOLOCRON;
  register("data models", () => {
    Object.assign(CONFIG.Actor.dataModels, { character: CharacterModel });
    Object.assign(CONFIG.Item.dataModels, ITEM_MODELS);
  });
  register("effects", () => {
    Object.assign(CONFIG.ActiveEffect.dataModels, { base: HolocronEffectModel });
    registerChanges();
    registerRestExpiry();
  });
  register("sheets", () => {
    foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, "holocron", CharacterSheet as never, {
      types: ["character"],
      makeDefault: true,
      label: "Holocron character sheet",
    });
    foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, "holocron", DebugSheet as never, {
      types: ["character"],
      makeDefault: false,
      label: "Holocron debug sheet (development)",
    });
  });
  // The combat tracker rolls initiative with this; without it Foundry's formula is unset.
  register("initiative", () => {
    CONFIG.Combat.initiative.formula = "1d20 + @skillTotals.initiative.total";
  });
  register("chat cards", () => {
    Hooks.on("renderChatMessageHTML", (message: ChatMessage.Implementation, html: HTMLElement) => renderCard(message, html));
    Hooks.on("controlToken", onControlToken);
    Hooks.on("getChatMessageContextOptions", onChatContextOptions as never);
  });
  register("combat end", () => {
    Hooks.on("deleteCombat", (combat: Combat.Implementation) => void onCombatEnd(combat));
  });
  // A button in the Compendium sidebar opens the browser to drag from. ApplicationV2 re-renders in
  // place, so the previous button is removed before one is added.
  register("browser button", () => {
    registerBrowserSettings();
    Hooks.on("renderCompendiumDirectory", (_app: unknown, html: HTMLElement) => {
      html.querySelector(".holocron-browser-button")?.remove();
      const button = document.createElement("button");
      button.type = "button";
      button.className = "holocron-browser-button";
      button.innerHTML = '<i class="fa-solid fa-book-open" inert></i> <span>Compendium Browser</span>';
      button.addEventListener("click", () => void CompendiumBrowser.open());
      html.querySelector(".header-actions")?.append(button);
    });
  });
  register("migrations", registerMigrations);
  // The system's API: New Day (GM) until it has a button; the sheet's Rest calls longRest.
  register("api", () => {
    (game as unknown as Record<string, unknown>)["holocron"] = { longRest, newDay };
    Hooks.on("createChatMessage", onRestMessage);
  });
  console.log(`holocron | init, build ${HOLOCRON.buildId}`);
});
