import { describe, expect, it } from "vitest";
import { defaultPatch } from "../../engine/core/patch";

/**
 * Guards the autosave migration path: a patch saved before a schema addition
 * must come back with every new key present (an undefined leaking into the
 * engine's pitch math becomes NaN). Mirrors the merge in store.ts
 * loadWorkingPatch — kept as a pure copy here because the store module
 * reads localStorage at import time.
 */
function mergeSaved(saved: Record<string, unknown>) {
  const base = defaultPatch();
  const merged = { ...base } as ReturnType<typeof defaultPatch> &
    Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof ReturnType<typeof defaultPatch>)[]) {
    const sv = saved[key];
    if (sv === undefined) continue;
    if (key === "vco") {
      merged.vco = base.vco.map((v, i) => ({
        ...v,
        ...((saved.vco as object[] | undefined)?.[i] ?? {}),
      })) as typeof base.vco;
    } else if (typeof sv === "object" && sv !== null) {
      merged[key] = { ...base[key], ...sv } as never;
    }
  }
  return merged;
}

describe("working-patch migration", () => {
  it("fills new keys inside modules an old save already had", () => {
    // Old save: effects existed before intervalSemitones did.
    const old = {
      effects: { sync: true, xmod: 0.5, topology: "single", modSource: "off", modDepth: 0 },
      vcf: { cutoffHz: 900 },
    };
    const p = mergeSaved(old);
    expect(p.effects.sync).toBe(true);
    expect(p.effects.intervalSemitones).toBe(0); // new key defaulted, not undefined
    expect(p.vcf.cutoffHz).toBe(900);
    expect(p.vcf.resonance).toBe(defaultPatch().vcf.resonance);
    expect(p.pwm).toEqual(defaultPatch().pwm); // module absent from old save
  });

  it("every module value stays defined after merging an empty save", () => {
    const p = mergeSaved({});
    for (const mod of Object.values(p)) {
      for (const v of Object.values(mod as Record<string, unknown>)) {
        expect(v).not.toBeUndefined();
      }
    }
  });
});
