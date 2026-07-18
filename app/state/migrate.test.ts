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
    expect(p.pwm).toEqual(defaultPatch().pwm); // module absent from old save
  });

  it("every module value stays defined after merging an empty save", () => {
    const p = mergeSavedPatch({});
    for (const mod of Object.values(p)) {
      for (const v of Object.values(mod as Record<string, unknown>)) {
        expect(v).not.toBeUndefined();
      }
    }
  });

  it("merges per-VCO overrides while keeping unspecified VCOs at defaults", () => {
    const p = mergeSavedPatch({
      vco: [{ wave: "square" }] as unknown as Patch["vco"],
    });
    expect(p.vco[0].wave).toBe("square");
    expect(p.vco[0].level).toBe(defaultPatch().vco[0].level);
    expect(p.vco[2]).toEqual(defaultPatch().vco[2]);
  });
});
