// WotC's official errata that the converted text lacks. The fork's text carries most of the errata
// already; a survey of the 329 entries in the transcription (2026-11-01) found these missing. Each
// entry is applied to its document's text and must match exactly once, or the run fails, so
// an entry the source text has absorbed or reworded is caught instead of skipped. Entries the house
// rules override are not here (rulings.md, General: the house rules supersede the errata).

import type { OutputDoc, Report } from "./lib/pack.ts";

/** `field` is the text changed: the description by default, or a feat's printed prerequisite. */
interface Erratum { pack: string; name: string; find: string; replace: string; source: string; field?: "prerequisite.text" }

export const ERRATA: Erratum[] = [
  {
    pack: "talents", name: "Fool's Luck",
    // The wiki copy lost the list of benefits; it is the printed list (Core p46), with the errata applied.
    find: "for the rest of the encounter:<br><br>",
    replace: "for the rest of the encounter: a +1 competence bonus on attack rolls, a +5 competence bonus on skill checks, or a +1 competence bonus to all your Defenses.<br><br>",
    source: 'Core p46 and Core errata p46: Change reference to "luck bonus" to "competence bonus"',
  },
  {
    pack: "talents", name: "Fool's Luck",
    find: "grant yourself a luck bonus to your Defenses",
    replace: "grant yourself a competence bonus to your Defenses",
    source: 'Core errata p46: Change reference to "luck bonus" to "competence bonus"',
  },
  // Printed (Core p82): "Strength 13, Weapon Proficiency (heavy weapons), proficient with weapon".
  // The fork already dropped Strength 13 for the errata's -10 penalty but lost "proficient with
  // weapon", the autofire weapon in hand, which the prerequisite tree cannot test; text only.
  {
    pack: "feats", name: "Burst Fire",
    find: "<b>Prerequisite:</b> Proficient with Heavy Weapons",
    replace: "<b>Prerequisite:</b> Proficient with Heavy Weapons, proficient with weapon",
    source: 'Core errata p82: Change the Prerequisites for the feat to "Proficient with heavy weapons, proficient with weapon"',
  },
  {
    pack: "feats", name: "Burst Fire", field: "prerequisite.text",
    find: "Proficient with Heavy Weapons",
    replace: "Proficient with Heavy Weapons, proficient with weapon",
    source: 'Core errata p82: Change the Prerequisites for the feat to "Proficient with heavy weapons, proficient with weapon"',
  },
  {
    pack: "force-powers", name: "Force Grip",
    find: "One target within 12 squares and within Line of Sight.",
    replace: "One target within 6 squares and within Line of Sight.",
    source: 'Core errata p97: Change the Target text to "One target within 6 squares and within line of sight."',
  },
  {
    pack: "force-powers", name: "Rebuke",
    find: "expending a use of the <i>Rebuke</i> Force Power and using your Use the Force check as its target DC",
    replace: "expending a use of the <i>Rebuke</i> Force Power and using your <i>Rebuke</i> Use the Force check result as its target DC",
    source: "Core errata p100: \"expending a use of the rebuke power and using your rebuke Use the Force check result as its target DC\"",
  },
  // The transcription's words are out of order ("before the start of your next by one of your allies
  // turn that hits"); Bryan, 2026-11-01: "its the next attack against the target that hits".
  {
    pack: "talents", name: "Damaging Deception",
    find: "If successful, the next attack made by one of your allies made before the start of your next turn against that target deals 2 additional dice of damage.",
    replace: "If successful, the next attack made by one of your allies before the start of your next turn that hits your target deals an additional +2 dice of damage.",
    source: "Scum and Villainy errata p31: Damaging Deception (word order repaired, Bryan 2026-11-01)",
  },
  {
    pack: "talents", name: "Brutal Attack",
    find: "exceeding an opponent's Damage Threshold deals +1 die of damage on that attack.",
    // The errata's sentence, without its "(including doubling damage from a critical hit)", which the text already has.
    replace: "exceeding an opponent's Damage Threshold deals +1 die of damage on that attack. You determine damage and compare it to your target's Damage Threshold first, then add the extra die of damage when applicable.",
    source: "Knights of the Old Republic errata p44: Brutal Attack",
  },
];

/** Applies every erratum to its document; a document missing, or a phrase not found exactly once, is a problem. */
export function applyErrata(packs: Map<string, OutputDoc[]>, report: Report, errata: Erratum[] = ERRATA): void {
  for (const e of errata) {
    const doc = packs.get(e.pack)?.find((d) => d.name === e.name);
    const holder = (e.field === "prerequisite.text" ? doc?.system["prerequisite"] : doc?.system) as Record<string, unknown> | undefined;
    const key = e.field === "prerequisite.text" ? "text" : "description";
    const text = typeof holder?.[key] === "string" ? holder[key] : "";
    const count = text.split(e.find).length - 1;
    if (!holder || count !== 1) {
      report.problems.push({ pack: e.pack, name: e.name, message: `erratum (${e.source}) matches ${count} times, expected 1` });
      continue;
    }
    holder[key] = text.replace(e.find, () => e.replace);
    report.note("errata applied", `${e.pack}/${e.name}: ${e.source}`);
  }
}
