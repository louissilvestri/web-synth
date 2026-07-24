import type { Patch, VcoPatch } from "../../engine/core/patch";
import { defaultPatch } from "../../engine/core/patch";

/**
 * The Model D's three fixed rectangles were collapsed into one "pulse"
 * waveform (2026-07-18). A legacy wave maps to pulse plus the PW offset that
 * reproduces its old effective width (old base − new 50% base).
 */
const LEGACY_PULSE_OFFSET: Record<string, number> = {
  square: 0,
  pulseWide: 1 / 3 - 0.5,
  pulseNarrow: 0.1 - 0.5,
};

function migrateVco(v: VcoPatch & { wave: string }): VcoPatch {
  const legacy = LEGACY_PULSE_OFFSET[v.wave];
  if (legacy === undefined) return v;
  const pw = Math.min(0.4, Math.max(-0.4, (v.pw ?? 0) + legacy));
  return { ...v, wave: "pulse", pw };
}

/**
 * Merge a saved working patch over defaults, per module, so patches saved
 * before a schema addition come back with every new key defaulted — a
 * missing key would flow into the engine's math as undefined → NaN.
 */
export function mergeSavedPatch(saved: Partial<Patch>): Patch {
  const base = defaultPatch();
  const merged = { ...base } as Patch & Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof Patch)[]) {
    const sv = saved[key];
    if (sv === undefined) continue;
    if (key === "vco") {
      merged.vco = base.vco.map((v, i) =>
        migrateVco({ ...v, ...(saved.vco?.[i] ?? {}) }),
      ) as Patch["vco"];
    } else if (key === "virtualPatch") {
      // Array module: merge per slot (object-spreading would de-array it).
      merged.virtualPatch = base.virtualPatch.map((slot, i) => ({
        ...slot,
        ...(saved.virtualPatch?.[i] ?? {}),
      })) as Patch["virtualPatch"];
    } else if (typeof sv === "object" && sv !== null) {
      merged[key] = { ...base[key], ...sv } as never;
    }
  }
  return merged;
}
