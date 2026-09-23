// Declaration merging for fvtt-types: registers Holocron's settings, Active Effect change types and
// phases, and states that system code runs after the ready hook. A key used in code but missing
// here is a compile error, which is the point: a misspelled setting or phase fails the build
// instead of failing silently at the table.

declare module "fvtt-types/configuration" {
  interface AssumeHookRan {
    ready: never;
  }

  interface SettingConfig {
    "holocron.migrationVersion": number;
  }
}

declare global {
  namespace CONFIG {
    namespace ActiveEffect {
      interface ChangeTypes {
        bonus: foundry.documents.ActiveEffect.ChangeTypeConfig;
      }
      interface Phases {
        derived: foundry.documents.ActiveEffect.ChangePhaseConfig;
      }
    }
  }
}

export {};
