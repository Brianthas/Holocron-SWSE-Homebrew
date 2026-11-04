import { describe, expect, it } from "vitest";
import { attackOutcome, damageFor, marginText, takeDamage, type DamageRoll, type DamageTarget } from "../src/rules/damage.ts";

// Mockup 2's sample cards: Battle Armor DR 2/Lightsabers (episode-vii armor table).
const trooper: DamageTarget = { organic: true, armor: { name: "Battle Armor", dr: 2, bypass: "lightsabers" } };
const droid: DamageTarget = { organic: false, armor: null };
const unknown: DamageTarget = { organic: null, armor: null };
const saber: DamageRoll = { total: 23, type: "Energy", group: "lightsabers", groupLabel: "Lightsabers", halfOnMiss: false };
const grenade: DamageRoll = { total: 21, type: "Stun", group: "simple", groupLabel: "Simple Weapons", halfOnMiss: true };

describe("attack outcome (rulings.md, Combat)", () => {
  it("meeting the defense hits, one below misses", () => {
    expect(attackOutcome(10, 16, 16)).toBe("hit");
    expect(attackOutcome(10, 15, 16)).toBe("miss");
  });
  it("a natural 20 is a critical and a natural 1 a miss, whatever the total or the defense", () => {
    expect(attackOutcome(20, 5, 30)).toBe("crit");
    expect(attackOutcome(20, 5, null)).toBe("crit");
    expect(attackOutcome(1, 40, 10)).toBe("miss");
  });
  it("no Reflex Defense gives no verdict", () => {
    expect(attackOutcome(12, 30, null)).toBe("nodefense");
  });
  it("the GM line gives the margin, or the die that decided it", () => {
    expect(marginText(16, 24, 14)).toBe("vs Reflex 16, by 8");
    expect(marginText(25, 24, 14)).toBe("vs Reflex 25, missed by 1");
    expect(marginText(25, 24, 20)).toBe("vs Reflex 25, natural 20");
    expect(marginText(null, 24, 14)).toBe("no Reflex Defense set");
  });
});

describe("damage per target (mockup 2; rulings.md, Combat)", () => {
  it("lightsabers bypass Battle Armor's DR; other groups lose 2", () => {
    expect(damageFor(trooper, "hit", saber)).toEqual({ n: 23, chips: [{ text: "Battle Armor DR 2: bypassed by lightsabers" }] });
    expect(damageFor(trooper, "hit", { ...saber, group: "pistols", groupLabel: "Pistols" }).n).toBe(21);
  });
  it("a miss deals nothing, or half before DR for a half-on-a-miss weapon (21 to 10, then 8)", () => {
    expect(damageFor(trooper, "miss", saber)).toEqual({ n: 0, chips: [{ text: "Miss: no damage" }] });
    expect(damageFor(trooper, "miss", grenade)).toEqual({ n: 8, chips: [{ text: "Miss: half (21 to 10)" }, { text: "Battle Armor DR 2 (10 to 8)" }] });
  });
  it("DR applies to Stun; a droid is immune to Stun and an organic to Ion", () => {
    expect(damageFor(trooper, "hit", grenade).n).toBe(19);
    expect(damageFor(droid, "hit", grenade)).toEqual({ n: 0, chips: [{ text: "Droid: immune to Stun", immune: true }] });
    expect(damageFor(trooper, "hit", { ...saber, type: "Ion" }).n).toBe(0);
    expect(damageFor(droid, "hit", { ...saber, type: "Ion" }).n).toBe(23);
  });
  it("a target with no statblock takes the full roll: no immunity or DR it cannot know", () => {
    expect(damageFor(unknown, "nodefense", grenade)).toEqual({ n: 21, chips: [] });
    expect(damageFor(unknown, "hit", { ...saber, type: "Ion" }).n).toBe(23);
  });
  it("a half chosen by hand rounds down, then DR", () => {
    expect(damageFor(trooper, "half", { ...saber, group: "pistols", groupLabel: "Pistols" })).toEqual({
      n: 9, chips: [{ text: "Half (23 to 11)" }, { text: "Battle Armor DR 2 (11 to 9)" }],
    });
  });
  it("DR never takes damage below 0", () => {
    expect(damageFor(trooper, "hit", { ...saber, total: 1, group: "pistols" }).n).toBe(0);
  });
});

describe("taking damage", () => {
  it("temporary hit points go first, and hit points may go below 0", () => {
    expect(takeDamage(12, 5, 8)).toEqual({ hp: 9, temp: 0, fromTemp: 5, fromHp: 3 });
    expect(takeDamage(12, 5, 3)).toEqual({ hp: 12, temp: 2, fromTemp: 3, fromHp: 0 });
    expect(takeDamage(2, 0, 10)).toEqual({ hp: -8, temp: 0, fromTemp: 0, fromHp: 10 });
  });
});
