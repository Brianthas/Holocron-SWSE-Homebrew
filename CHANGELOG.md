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
- 23 classes converted: the four base classes, held to the house class table, and 19 prestige
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
  droid accessories. Shield Expansion Module is left out (no personal shields); the four
  Translator Units are held. Locomotion speed, appendage counts, Hardened Systems' multipliers and
  carrying multipliers stay in the text until droids are built.
- Two-handed melee weapons add STR x 2 to damage (episode-vii, Weapons); before this they added
  STR once.
- Feats carry their mechanics as effects: Improved Defenses, Toughness (5 hit points once, 1 per
  level, +1 healing received), Martial Arts I to III (one unarmed die each, no dodge bonus), Improved
  Damage Threshold, Extra Second Wind, Extended Capacity, and from the house rules Force
  Sensitivity and Force Boon (Force Points) and Linguist (+4 INT for languages). Force Sensitivity
  has no prerequisite. Choice feats (Weapon Focus, Skill Focus and the rest) are converted without
  their bonus until a change can name the chosen weapon or skill.
