import { describe, expect, it } from "vitest";
import type { Patch } from "../../engine/core/patch";
import { defaultPatch } from "../../engine/core/patch";
import { mergeSavedPatch } from "./migrate";

/**
 * Guards the autosave migration path: a patch saved before a schema addition
 * must come back with every new key present — an undefined leaking into the
 * engine's pitch math becomes NaN.
 */
describe("working-patch migration", () => {
  it("fills new keys inside modules an old save already had", () => {
    // Old save: effects existed before intervalSemitones did.
    const old = {
      effects: { sync: true, xmod: 0.5, topology: "single", modSource: "off", modDepth: 0 },
      vcf: { cutoffHz: 900 },
    } as unknown as Partial<Patch>;
    const p = mergeSavedPatch(old);
    expect(p.effects.sync).toBe(true);
    expect(p.effects.intervalSemitones).toBe(0); // new key defaulted, not undefined
    expect(p.vcf.cutoffHz).toBe(900);
    expect(p.vcf.resonance).toBe(defaultPatch().vcf.resonance);
    expect(p.vco[0].pwSyncTo).toBeNull(); // new per-VCO keys defaulted
  });

  it("migrates legacy fixed-width rectangles to pulse + PW offset", () => {
    const p = mergeSavedPatch({
      vco: [
        { wave: "square", pw: 0 },
        { wave: "pulseWide" },
        { wave: "pulseNarrow" },
        { wave: "saw" },
      ] as unknown as Patch["vco"],
    });
    expect(p.vco[0].wave).toBe("pulse");
    expect(p.vco[0].pw).toBe(0); // square = 50% = pulse at PW 0
    expect(p.vco[1].wave).toBe("pulse");
    expect(p.vco[1].pw).toBeCloseTo(1 / 3 - 0.5, 5); // old wide ≈ −17%
    expect(p.vco[2].wave).toBe("pulse");
    expect(p.vco[2].pw).toBeCloseTo(-0.4, 5); // old narrow clamps to −40%
    expect(p.vco[3].wave).toBe("saw"); // non-pulse untouched
  });

  it("drops modules that no longer exist in the schema (old shared pwm)", () => {
    const p = mergeSavedPatch({
      pwm: { widthOffset: 0.2, depth: 1 },
    } as unknown as Partial<Patch>);
    expect("pwm" in p).toBe(false);
  });

  it("every module value stays defined after merging an empty save", () => {
    const p = mergeSavedPatch({});
    for (const mod of Object.values(p)) {
      for (const v of Object.values(mod as Record<string, unknown>)) {
        expect(v).not.toBeUndefined();
      }
    }
  });

  it("virtualPatch stays a real array after merging", () => {
    const p = mergeSavedPatch({
      virtualPatch: [{ source: "mg1", dest: "cutoff", amount: 0.5 }] as unknown as Patch["virtualPatch"],
    });
    expect(Array.isArray(p.virtualPatch)).toBe(true);
    expect(p.virtualPatch).toHaveLength(6);
    expect(p.virtualPatch[0].source).toBe("mg1");
    expect(p.virtualPatch[1].source).toBe("off");
    // A pre-targeting save has no vcos → defaults to all four.
    expect(p.virtualPatch[0].vcos).toEqual([true, true, true, true]);
  });

  it("merges per-VCO overrides while keeping unspecified VCOs at defaults", () => {
    const p = mergeSavedPatch({
      vco: [{ wave: "shark" }] as unknown as Patch["vco"],
    });
    expect(p.vco[0].wave).toBe("shark");
    expect(p.vco[0].level).toBe(defaultPatch().vco[0].level);
    expect(p.vco[2]).toEqual(defaultPatch().vco[2]);
  });
});
