# Changelog

## Unreleased

- Project scaffold: TypeScript, Vite build, fvtt-types, migration runner, CI.
- Snapshots of the Episode VII house rules, level-up guide, species rarity and droids pages in
  `docs/rules/`.
- Rulings that clarify the snapshots in `docs/rulings.md`.
- F1 vertical slice: character data model (abilities, species +2 choice, Defense points, trained
  skills), item models for species, class, feat and weapon, and derived ability scores, level,
  base attack bonus, Defenses and skills as labelled breakdowns. Size sets a species' fixed
  ability adjustments and the Reflex size modifier.
- A "bonus" Active Effect change type and a "derived" phase: a bonus is a labelled term in a
  breakdown, not a written value. Bonuses of one type do not stack; untyped bonuses do.
- Ranged attack (base attack bonus + DEX against each target's Reflex) and damage (weapon dice +
  DEX + half heroic level) posted to chat.
- A throwaway debug sheet showing each total with its breakdown as a tooltip, until the signed-off
  sheet is built.
- Effects: changes carry a bonus type and a condition. A conditional bonus is listed with its total
  and never added to it. "grant" changes give weapon or armor proficiency or a trained skill;
  "dice" changes add damage dice of the weapon's size. A bonus key must be one of a closed set of
  selectors (defense, skill, attack and damage by category or weapon group, and a few more); a key
  outside it is reported in the console and ignored.
- Melee attacks use STR until the per-weapon ability choice exists; ranged attacks use DEX.
- Weapon groups follow the house weapon tables: Simple, Advanced Melee, Lightsabers, Pistols,
  Rifles and Heavy Weapons. The Bow and the Grenade are Simple.
- Item models for talents, Force powers (descriptors, action, DC bands, cumulative, copies and
  ready uses), features (Force techniques, secrets, regimens, species traits, class features),
  armor and equipment; classes carry the house class table's fields and their technique and
  secret levels; weapons carry two-handed, thrown, half damage on a miss, area, slot and carry.
- Worn armor replaces the DEX term of Reflex with its own (Assault Armor STR, Battle 4, Mesh 5,
  Power 4); armor gives no armor bonus. DT+5, the Defense against forced movement, grapple and
  disarm, is Fortitude + 5 plus any DT bonuses.
- The character stores its levels in order: each level's class, hit die result and ability
  increases. Level, heroic level, base attack bonus, hit points and ability increases derive from
  it; a level naming a missing class is reported on the sheet.
- Hit points: the starting class's level-1 hit points, each later level's result, CON per level,
  and bonuses; state is staggered at exactly 0, dying down to and including minus the maximum,
  dead below it. Force Points
  per day by level (1 to 4) plus bonuses, Destiny capped at that, pooled Force Points at 3, Dark
  Side maximum half WIS rounded up. Languages understood by INT, with Linguist and Primitive as
  bonuses of +4 and -4. Light slots equal STR, Kit slots STR modifier + 1 (minimum 1, one fewer per
  size below Medium); Extended Capacity doubles both.
- A bonus's value can be a formula over the character ("@level"), resolved when the effect applies;
  one that does not resolve is reported, not read as 0. New bonus selectors: forcePoints,
  languages.int, slots.light, slots.kit; new grant kind: flag.
