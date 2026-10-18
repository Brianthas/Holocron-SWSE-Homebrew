import { describe, expect, it } from "vitest";
import { cleanDescription } from "../tools/convert/lib/html.ts";
import { idFor, slugify } from "../tools/convert/lib/ids.ts";
import { checkKeys, Report, type SourceDoc } from "../tools/convert/lib/pack.ts";
import { techniquePower } from "../tools/convert/packs/force-features.ts";

// Extended Move Object's description exactly as the fork stores it.
const EXTENDED_MOVE_OBJECT = '<p><i>Reference Book:&nbsp;<a href="https://swse.fandom.com/wiki/Star_Wars_Saga_Edition_Jedi_Academy_Training_Manual" title="Star Wars Saga Edition Jedi Academy Training Manual">Star Wars Saga Edition Jedi Academy Training Manual</a></i> </p><p><i>See also:&nbsp;<a href="https://swse.fandom.com/wiki/Force_Techniques" title="Force Techniques">Force Techniques</a></i> </p><p>The base range of your <i><a href="https://swse.fandom.com/wiki/Move_Object" title="Move Object">Move Object</a></i> Force Power increases to 18 squares (instead of 12 squares). </p>';

describe("converter ids", () => {
  it("are 16 characters from Foundry's alphabet and the same on every run", () => {
    expect(idFor("force-techniques:extended-move-object")).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(idFor("force-techniques:extended-move-object")).toBe(idFor("force-techniques:extended-move-object"));
    expect(idFor("talents:beastwarden:charm-beast")).not.toBe(idFor("talents:shaper:charm-beast"));
  });
  it("slugs names", () => {
    expect(slugify("Force Power Mastery")).toBe("force-power-mastery");
    expect(slugify("Hold-out Blaster (Stun)")).toBe("hold-out-blaster-stun");
  });
});

describe("converter descriptions", () => {
  it("drop the wiki's book and see-also lines, keep link text, and keep the book name", () => {
    const cleaned = cleanDescription(EXTENDED_MOVE_OBJECT);
    expect(cleaned.html).toBe("<p>The base range of your <i>Move Object</i> Force Power increases to 18 squares (instead of 12 squares). </p>");
    expect(cleaned.sourceBook).toBe("Star Wars Saga Edition Jedi Academy Training Manual");
    expect(cleaned.links).toEqual(["Move Object"]);
  });
  it("drop the wiki wrapper and styling hooks but keep tables and headings", () => {
    const cleaned = cleanDescription('<div class="mw-parser-output">\n<p>Text</p><table class="wikitable"><tr><td>15</td></tr></table><h2><span class="mw-headline" id="Line">Line</span></h2></div>');
    expect(cleaned.html).toBe("<p>Text</p><table><tr><td>15</td></tr></table><h2>Line</h2>");
  });
  it("drop the fork's label on house content", () => {
    expect(cleanDescription("<p><i>Homebrew Weapon (tovec.wikidot.com/episode-vii)</i></p><p>Half damage on a miss.</p>").html)
      .toBe("<p>Half damage on a miss.</p>");
  });
});

describe("converter key check", () => {
  const doc = (system: Record<string, unknown>, extra: Partial<SourceDoc> = {}): SourceDoc =>
    ({ _id: "x", name: "Probe", type: "forceTechnique", system, effects: [], folder: null, flags: {}, ...extra });
  const spec = { mapped: ["description"], constant: { cost: "0" } };
  const problems = (d: SourceDoc) => {
    const report = new Report();
    checkKeys("force-techniques", d, spec, report);
    return report.problems.map((p) => p.message);
  };
  it("passes mapped keys, matching constants and empty keys", () => {
    expect(problems(doc({ description: "<p>x</p>", cost: "0", choices: [], payload: "", isSupplied: false }))).toEqual([]);
  });
  it("fails an unmapped key that carries something", () => {
    expect(problems(doc({ description: "", payload: "Rifles" }))).toEqual(['unmapped system.payload: "Rifles"']);
  });
  it("fails a constant with another value, and unmapped effects and flags", () => {
    expect(problems(doc({ cost: "5" }, { effects: [{}], flags: { swse: { x: 1 } } }))).toEqual([
      'cost is "5", expected "0"', "1 embedded effects not mapped", 'unmapped flags: {"swse":{"x":1}}',
    ]);
  });
});

describe("technique powers", () => {
  const powers = ["Move Object", "Vital Transfer", "Mind Trick", "Force Slam"];
  it("take the first link that names a power", () => {
    expect(techniquePower("Cure Disease", ["Use the Force", "Vital Transfer"], powers)).toBe("Vital Transfer");
  });
  it("fall back to the longest power in the name", () => {
    expect(techniquePower("Improved Move Object", [], ["Move", ...powers])).toBe("Move Object");
  });
  it("are blank for a technique that improves no power", () => {
    expect(techniquePower("Improved Telepathy", ["Use the Force"], powers)).toBe("");
  });
});
