# Changelog

## Unreleased

- The character sheet (mockup 1), first slice, is the default sheet for characters. Sidebar: hit
  points with their state, temp HP and a bar, where the box takes a total, -5 or +3 in play;
  Second Wind uses; Reflex, Fortitude, Will and DT+5 with their breakdowns; Force Point, Destiny
  and pooled Force pips, where a lit pip spends one and an empty pip restores one; Perception, Use
  the Force and Initiative. A header band with species, size, classes, level and BAB. Tabs: Play
  (skills, and attacks with Attack and Damage), Build (abilities, the language tier, sheet
  problems), Notes (biography). Light and dark themes. The F1 debug sheet stays as a development
  view.
- The sheet's padlock switches Play and Edit. Edit mode: the name; ability scores by point buy (25
  points, the ruling's costs, 1 to 18, the next point's cost on the + button, over budget in red)
  or entered by hand; the species +2, which a Small species other than a droid may not put on DEX;
  Defense points (4, at most 2 in one, until level 10, then 8 and 4); trained skills against the
  allowance (the level-1 class, INT, Bonus Trained Skill traits, Primitive, Skill Training), over
  it in red; the language spoken besides the species language, and other languages. The sheet
  reports a species +2 or Defense points the rules do not allow.
- Progression on the Build tab: each level with its class and hit points. In Edit mode, Level up
  takes a class the character has or any class from the Classes compendium (added to the
  character); level 1 uses the class's level-1 hit points, later levels take the average
  (floor(die / 2) + 1) or a roll posted to chat. Levels 4, 8, 12, 16 and 20 (the level-up guide's
  table) choose +1 for two different abilities. The last level can be removed; its class stays on
  the character.
- Items on the sheet. Dragging an item from a compendium adds it; a dropped species replaces the
  character's species. Inventory tab: Light and Kit slots used against capacity (over in red),
  weapons and equipment with a Carried / In hands / Stowed button (one Kit in hands uses no slot,
  episode-vii), armor Worn or not, droid systems Installed or Removed for a droid species, and
  credits. Equipment the house tables do not size converts with no size; in Edit mode its size
  cycles none, Light, Kit. Talents are listed on Play, feats on Build. In Edit mode each item has a
  remove button, with Foundry's confirmation.
- Skill checks: a roll button on every skill and on Perception, Use the Force and Initiative in the
  sidebar opens a dialog: Normal 1d20, or Advantage, spending a Force Point for 2d20 keep the
  higher, and an other modifier. Shift+click rolls a normal check with no dialog. The check posts
  with each term labelled.
- Second Wind's Use: heals the highest Hit Die rolled + CON + level + healing received (episode-
  vii, Healing), up to the maximum, and uses one. The card shows the healing and is hidden while
  Dying.
- Initiative: the combat tracker rolls 1d20 + the Initiative total; it had no formula. The
  sheet's Initiative roll also sets the character's initiative in each active combat it is in.

## 0.0.1 - 2026-11-01

The engine and the converted compendium content. Not yet playable: characters use a debug sheet
until the signed-off sheet is built.

- Project scaffold: TypeScript, Vite build, fvtt-types, migration runner, CI.
- `CREDITS.md` credits the compendium content's sources under CC BY-SA 3.0. `npm run release:zip
  <staging-dir>` builds the release zip.
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
- Rest is a long rest: hit points to full, Force Points to their per-day number, Second Wind to its
  per-day uses (1 plus `secondWind` bonuses), and every Force power's copies ready. The debug
  sheet's Rest button rests one character and posts what changed; `game.holocron.newDay()` (GM)
  rests every character a player owns and posts one summary.
- Effects can last until a long rest: a "Long rest" expiry ends an effect applied to a character
  when that character rests, whether the GM or a player clicked Rest. Expiry happens on the active
  GM's client, so it needs a GM connected. An item's own effects are never tracked and never expire.
- Force power descriptors are a fixed list: Dark Side, Light Side, Lightsaber Form, Mind-Affecting,
  Telekinetic.
- Content converted from the SWSE fork into `packs/_source`: 86 Force powers, 55 techniques, 15
  secrets, 12 regimens and 346 feats. Cloak, Improved Cloak and Improved Dark Transfer are left out
  with their powers (episode-vii, Force Power Changes); 18 feats tagged Homebrew Content or credited
  to a fan creator are left out (rulings.md, Content), as are fan sections the wiki appended to
  official pages. Not yet built into compendium packs.
- 1285 talents converted, each with its tree (the fork's tree folder, without "Talent Tree"). A name
  the wiki repeats across trees ("Charm Beast (Beastwarden Talent Tree)") is the plain name in each
  tree. 113 talents tagged Homebrew Content are left out, which removes 22 whole trees; the banned
  trees stay. Talents carry their mechanics as effects where the text states a number: Force of
  Will (+2 insight to Will), Weapon Specialization and Greater Weapon Specialization with
  lightsabers (+2 damage each), Greater Weapon Focus with lightsabers (+1 attack), Tough as Nails
  (one more Second Wind), Cargo Hauler (+5 Athletics, double carrying), and from the house rules
  Murderous Arts (+1 damage die; the Mark half is not applied). Move Object's description now
  carries the house damage rule the fork kept only in a summary field.
- Telekinetic Vigilance, the one Zeison Sha talent the house rules keep, is written from the ruling
  (the fork has no Zeison Sha tree). Only a Force Disciple, Jedi Master or Sith Lord can take it.
- 132 species converted with their size, traits (text from the traits pack) and rarity (Common,
  Rare or Denied, from the species rarity page). Species carry a `rarity` and a `sizeChoices`
  field; the character stores the size picked at creation (`speciesSize`). A Killik picks Small,
  Medium or Large, and the sheet reports a Killik with no size chosen. Human keeps its Bonus Feat
  and Bonus Trained Skill. The 14 droid models wait for the droid rules.
- Species traits carry their Defense mechanics as effects on the species, one per trait and named
  for it, read from the trait's own text and checked against the fork's values. Standing bonuses
  count: Iron Will, Great Fortitude, Lightning Reflexes, Superior Defenses, Natural Armor,
  Carapace, Tough (Damage Threshold and Fortitude). Conditional ones (Toxic Resistance, Force
  Resistance, Fearless, Stun Resistance and others) are listed under the total with their
  condition, not added. Primitive counts INT as 4 lower for languages (episode-vii, Languages).
  Rerolls, bonus feats and trained skills, fly and swim speeds, species Damage Reduction and skill
  bonuses stay in the trait text.
- 23 classes converted: the four base classes, held to the house class table as the rules snapshot
  prints it, and 19 prestige
  classes. Each carries its hit die, its talent trees (the fork's class trees, without banned
  trees), and the levels that give a Force technique or secret. Force Disciples, Jedi Masters and
  Sith Lords keep the trees the house rules name for them, plus a `traditionApproval` flag for
  other Force Tradition talents with GM approval, and a `talents` list of single talents open to
  them (Many Shades of the Force, Telekinetic Vigilance). Follower, beast, nonheroic and
  independent droid classes wait for NPCs.
- 31 weapons and 4 armors converted, each checked against the house weapon and armor tables read
  from the rules snapshot: group, slot, damage, damage types (Stun settings included), two-handed,
  thrown, half damage on a miss. The gloves wait for worn gear. Armor carries its Reflex term, DR
  and bypass, and penalties (none for Mesh); Power Armor's +2 Strength is an effect.
- Armor applies its effects only while worn.
- 146 pieces of equipment converted with a price (`cost`, empty where it depends on the variant)
  and a slot: Light or Kit for the items the house rules list, none for the rest until the player
  picks one. Of the equipment pack's 65 wiki pages, Holocrons and Sith Artifacts are kept and the
  rest dropped (rulings.md, Content); the fan section of the Sith Artifacts table is left out. The
  9 droid accessories go with droid systems.
- A droid system item type: group (processor, locomotion, appendage, communications, sensor,
  station, translator, hardened, miscellaneous), cost and requirement as text, and an installed
  toggle that starts off. 104 converted from the fork's droid-system pack and its equipment pack's
  droid accessories. Shield Expansion Module is left out (no personal shields). The book's four
  Translator Units are replaced by the house unit, its text and price read from the rules
  snapshot, giving +4 INT for languages. Locomotion speed, appendage counts, Hardened Systems'
  multipliers and carrying multipliers stay in the text until droids are built.
- A droid system applies its effects only while installed.
- `npm run packs:validate` checks `packs/_source` (ids, item types, effect changes against what the
  engine reads, references between packs, the base classes against the house class table, text the
  cleanup removes) and runs in CI.
- WotC's official errata the converted text lacked is applied (`tools/convert/errata.ts`): Force
  Grip's range is 6 squares; Fool's Luck grants competence bonuses, and its list of benefits,
  missing from the wiki copy, is restored from the Core Rulebook; Rebuke, Brutal Attack and Burst
  Fire's prerequisite carry their errata wording; Damaging Deception's +2 dice go to the next
  allied attack that hits the target. Of the 74 errata entries for converted documents,
  the rest were already in the text or are overridden by the house rules.
- Force powers state the house maintain check, DC 10 + damage taken after DR and SR (episode-vii,
  Force Power Changes), in place of the printed DC 15, on all 19 powers that print it.
- Compendium packs: 12 Item packs (Species, Classes, Feats, Talents, Force Powers, Force
  Techniques, Force Secrets, Force Regimens, Weapons, Armor, Equipment, Droid Systems) in a
  Holocron folder, grouped as Character, The Force and Gear. `npm run packs:build` compiles them
  from `packs/_source` after the validator passes.
- Descriptions lose the wiki's "See also:" line where it stands before the text outside a
  paragraph, as on six talents (Dueling Stance, Move Massive Object, Severing Strike, Force
  Treatment, Visions, Sith Alchemy).
- Two-handed melee weapons add STR x 2 to damage (episode-vii, Weapons); before this they added
  STR once.
- Feats carry their mechanics as effects: Improved Defenses, Toughness (5 hit points once, 1 per
  level, +1 healing received), Martial Arts I to III (one unarmed die each, no dodge bonus), Improved
  Damage Threshold, Extra Second Wind, Extended Capacity, and from the house rules Force
  Sensitivity and Force Boon (Force Points) and Linguist (+4 INT for languages). Force Sensitivity
  has no prerequisite. Choice feats (Weapon Focus, Skill Focus and the rest) are converted without
  their bonus until a change can name the chosen weapon or skill.
