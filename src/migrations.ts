/**
 * World data migrations. Each entry runs once per world, in order, on the active GM's client at
 * ready. The world setting `migrationVersion` records the last one applied; a new world starts at
 * the latest version because it has no old data to fix.
 */

interface Migration {
  version: number;
  label: string;
  run: () => Promise<void>;
}

/** Append only. Never renumber or remove an entry that has shipped. */
const MIGRATIONS: Migration[] = [];

export const LATEST_MIGRATION = MIGRATIONS.at(-1)?.version ?? 0;

const SETTING = "migrationVersion";

export function registerMigrations(): void {
  game.settings.register("holocron", SETTING, {
    scope: "world",
    config: false,
    type: Number,
    default: -1,
  });
  Hooks.once("ready", runMigrations);
}

async function runMigrations(): Promise<void> {
  if (!game.users.activeGM?.isSelf) return;
  const current = game.settings.get("holocron", SETTING) as number;
  // -1 is the unset default: a world created on this system has nothing to migrate.
  if (current === -1) {
    await game.settings.set("holocron", SETTING, LATEST_MIGRATION);
    return;
  }
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    console.log(`holocron | migration ${migration.version}: ${migration.label}`);
    await migration.run();
    await game.settings.set("holocron", SETTING, migration.version);
  }
}
