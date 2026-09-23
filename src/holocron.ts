import "./styles/holocron.scss";
import { registerMigrations } from "./migrations.ts";

/** System-wide configuration, read by tools/verify-live.ts to confirm which build the client loaded. */
export const HOLOCRON = {
  buildId: __HOLOCRON_BUILD__,
};

Hooks.once("init", () => {
  (CONFIG as unknown as Record<string, unknown>)["HOLOCRON"] = HOLOCRON;
  registerMigrations();
  console.log(`holocron | init, build ${HOLOCRON.buildId}`);
});
