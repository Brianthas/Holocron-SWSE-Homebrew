import { describe, expect, it } from "vitest";
import { cleanDescription, rewriteParagraphs, textNotIn } from "../tools/convert/lib/html.ts";
import { plainName, treeName } from "../tools/convert/packs/talents.ts";
import { idFor, slugify } from "../tools/convert/lib/ids.ts";
import { checkKeys, Report, type SourceDoc } from "../tools/convert/lib/pack.ts";
import type { ChangeOut } from "../tools/convert/lib/changes.ts";
import { FEAT_KEYS } from "../tools/convert/packs/feats.ts";
import { techniquePower } from "../tools/convert/packs/force-features.ts";
import { parseBand } from "../tools/convert/packs/force-powers.ts";

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
  it("drop the book and see-also lines without italics too", () => {
    const cleaned = cleanDescription("<p>Rule.</p><p>Reference Book: Star Wars Saga Edition Knights of the Old Republic Campaign Guide</p><p>See also: Force Powers</p><p>Text.</p>");
    expect(cleaned.html).toBe("<p>Rule.</p><p>Text.</p>");
    expect(cleaned.sourceBook).toBe("Star Wars Saga Edition Knights of the Old Republic Campaign Guide");
  });
  it("turn en dashes into hyphens and em dashes into spaced hyphens", () => {
    expect(cleanDescription(`<p>Table 3${String.fromCharCode(0x2013)}8, and then${String.fromCharCode(0x2014)}later.</p>`).html)
      .toBe("<p>Table 3-8, and then - later.</p>");
  });
  it("drop the wiki wrapper and styling hooks but keep tables and headings", () => {
    const cleaned = cleanDescription('<div class="mw-parser-output">\n<p>Text</p><table class="wikitable"><tr><td>15</td></tr></table><h2><span class="mw-headline" id="Line">Line</span></h2></div>');
    expect(cleaned.html).toBe("<p>Text</p><table><tr><td>15</td></tr></table><h2>Line</h2>");
  });
  it("drop the fork's label on house content, as a paragraph or inline", () => {
    expect(cleanDescription("<p><i>Homebrew Weapon (tovec.wikidot.com/episode-vii)</i></p><p>Half damage on a miss.</p>").html)
      .toBe("<p>Half damage on a miss.</p>");
    expect(cleanDescription("<p><b>Prerequisite:</b> None. <i>Homebrew (tovec.wikidot.com/episode-vii):</i> anyone can take Force Boon.</p>").html)
      .toBe("<p><b>Prerequisite:</b> None. Anyone can take Force Boon.</p>");
  });
  it("drop a fan section up to the next heading of its level, and keep what follows", () => {
    const page = "<p>Official text.</p><h2>Homebrew Long Haft Strike Data</h2><table><tr><td>This Homebrew Content has not been reviewed in a meaningful manner.</td></tr></table><p>Fan rule.</p><h3>Fan detail</h3><p>More fan.</p><h2>Species Traits</h2><p>Official traits.</p>";
    const cleaned = cleanDescription(page);
    expect(cleaned.html).toBe("<p>Official text.</p><h2>Species Traits</h2><p>Official traits.</p>");
    expect(cleaned.removedSections).toEqual(["Homebrew Long Haft Strike Data"]);
  });
  it("keep a Homebrew heading without the review notice, and report it", () => {
    const cleaned = cleanDescription("<h2>Homebrew Notes</h2><p>Kept.</p>");
    expect(cleaned.html).toBe("<h2>Homebrew Notes</h2><p>Kept.</p>");
    expect(cleaned.unclearSections).toEqual(["Homebrew Notes"]);
  });
  it("drop the notice pointing at a fan page of the same name", () => {
    expect(cleanDescription('<table style="x"><tbody><tr><td><i>This article details the feat. You may be looking for the Homebrew Content Feat of the same name.</i></td></tr></tbody></table><p>Official.</p>').html)
      .toBe("<p>Official.</p>");
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

describe("Force power bands", () => {
  it("parse the fork's DC:text checks", () => {
    expect(parseBand("15:The target heals Hit Points equal to 2 x its Character Level."))
      .toEqual({ dc: 15, text: "The target heals Hit Points equal to 2 x its Character Level." });
    expect(parseBand("25:Line one:\nline two")).toEqual({ dc: 25, text: "Line one:\nline two" });
  });
  it("refuse anything else", () => {
    expect(parseBand("DC 15: text")).toBeNull();
    expect(parseBand(true)).toBeNull();
  });
});

describe("feat change keys", () => {
  const run = (key: string, value: unknown) => {
    const ctx = { name: "Probe", changes: [] as ChangeOut[], repeatable: false, maxTimes: 0, dropped: [] as string[], failed: [] as string[],
      drop(reason: string) { this.dropped.push(reason); }, fail(message: string) { this.failed.push(message); } };
    FEAT_KEYS[key]?.(value, ctx);
    return ctx;
  };
  it("map a flat defense bonus, and drop the fork's ability-swap formula", () => {
    expect(run("willDefenseBonus", "1").changes).toEqual([{ key: "defense.will", type: "bonus", value: 1, phase: "derived", bonusType: "", condition: "" }]);
    const swap = run("willDefenseBonus", "MAX(@WISMOD, @CHAMOD) - @WISMOD");
    expect(swap.changes).toEqual([]);
    expect(swap.dropped).toHaveLength(1);
  });
  it("fail a value the mapping does not expect", () => {
    expect(run("willDefenseBonus", "1d4").failed).toHaveLength(1);
    expect(run("hitPointFlatBonus", 10).failed).toHaveLength(1);
    expect(run("takeMultipleTimes", "false").failed).toHaveLength(1);
  });
  it("read takeMultipleTimes as repeatable", () => {
    expect(run("takeMultipleTimes", "true").repeatable).toBe(true);
  });
});

describe("talent names and short descriptions", () => {
  it("strip only the talent's own tree suffix", () => {
    expect(plainName("Charm Beast (Beastwarden Talent Tree)", "Beastwarden Talent Tree")).toBe("Charm Beast");
    expect(plainName("Weapon Specialization (Lightsabers)", "Lightsaber Combat Talent Tree")).toBe("Weapon Specialization (Lightsabers)");
    expect(treeName("Lightsaber Combat Talent Tree")).toBe("Lightsaber Combat");
  });
  it("find text a short copy carries that the original lacks, not reflowed text", () => {
    const original = "<p>You move a target up to 6 squares.</p><table><tr><td>15</td><td>Medium size</td></tr></table>";
    expect(textNotIn("You move a target up to 6 squares. 15 Medium size", original)).toEqual([]);
    expect(textNotIn("Damage dealt is always capped to the size of the object. You move a target up to 6 squares.", original))
      .toEqual(["damage dealt is always capped to the size of the object"]);
  });
  it("drop the bold house label and capitalise what follows", () => {
    expect(cleanDescription("<p><b>Homebrew:</b> murderous Arts I and II are one talent.</p>").html).toBe("<p>Murderous Arts I and II are one talent.</p>");
  });
});

describe("house text rewrites", () => {
  it("replace or remove each paragraph by its opening, and report one that is missing", () => {
    const html = "<p>Intro.</p><p><b>Effect:</b> Old effect.</p><p><b>Special:</b> Old special.</p>";
    expect(rewriteParagraphs(html, [["<p><b>Effect:</b> Old", "<p><b>Effect:</b> New.</p>"], ["<p><b>Special:</b>", ""]]))
      .toEqual({ html: "<p>Intro.</p><p><b>Effect:</b> New.</p>", missing: [] });
    expect(rewriteParagraphs(html, [["<p><b>Effect:</b> Different", "x"]]).missing).toEqual(["<p><b>Effect:</b> Different"]);
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
