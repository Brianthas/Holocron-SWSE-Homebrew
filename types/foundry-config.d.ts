// Declaration merging for fvtt-types: registers Holocron's settings, Active Effect change types and
// phases, and states that system code runs after the ready hook. A key used in code but missing
// here is a compile error, which is the point: a misspelled setting or phase fails the build
// instead of failing silently at the table.

import type { CharacterModel } from "../src/data/actor/character.ts";
import type {
  ArmorModel, ClassModel, EquipmentModel, FeatModel, FeatureModel, ForcePowerModel, SpeciesModel, TalentModel, WeaponModel,
} from "../src/data/item/models.ts";
import type { HolocronEffectModel } from "../src/effects/model.ts";

declare module "fvtt-types/configuration" {
  interface AssumeHookRan {
    ready: never;
  }

  interface DataModelConfig {
    Actor: {
      character: typeof CharacterModel;
    };
    Item: {
      species: typeof SpeciesModel;
      class: typeof ClassModel;
      feat: typeof FeatModel;
      talent: typeof TalentModel;
      forcePower: typeof ForcePowerModel;
      feature: typeof FeatureModel;
      weapon: typeof WeaponModel;
      armor: typeof ArmorModel;
      equipment: typeof EquipmentModel;
    };
    ActiveEffect: {
      base: typeof HolocronEffectModel;
    };
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
        grant: foundry.documents.ActiveEffect.ChangeTypeConfig;
        dice: foundry.documents.ActiveEffect.ChangeTypeConfig;
      }
      interface Phases {
        derived: foundry.documents.ActiveEffect.ChangePhaseConfig;
      }
    }
  }
}

export {};
