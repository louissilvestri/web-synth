import type { Patch } from "../../engine/core/patch";
import { defaultPatch } from "../../engine/core/patch";

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
      merged.vco = base.vco.map((v, i) => ({
        ...v,
        ...(saved.vco?.[i] ?? {}),
      })) as Patch["vco"];
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
