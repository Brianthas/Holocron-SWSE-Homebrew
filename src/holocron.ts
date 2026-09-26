import "./styles/holocron.scss";
import { CharacterModel } from "./data/actor/character.ts";
import { ITEM_MODELS } from "./data/item/models.ts";
import { registerChanges } from "./effects/changes.ts";
import { HolocronEffectModel } from "./effects/model.ts";
import { registerMigrations } from "./migrations.ts";
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
  });
  register("sheets", () => {
    foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, "holocron", DebugSheet as never, {
      types: ["character"],
      makeDefault: true,
      label: "Holocron debug sheet (F1)",
    });
  });
  register("migrations", registerMigrations);
  console.log(`holocron | init, build ${HOLOCRON.buildId}`);
});
