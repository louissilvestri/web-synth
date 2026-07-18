import { beforeEach, describe, expect, it } from "vitest";
import { defaultPatch } from "../../engine/core/patch";
import { useSynthStore } from "./store";

// Node environment: no localStorage/AudioContext — the store must degrade
// gracefully (autosave no-ops, engine host caches the patch unsent).

beforeEach(() => {
  useSynthStore.setState({ patch: defaultPatch(), activeNotes: [] });
});

describe("patch store", () => {
  it("update() merges into one module without touching others", () => {
    const { update } = useSynthStore.getState();
    update("vcf", { cutoffHz: 555 });
    const s = useSynthStore.getState();
    expect(s.patch.vcf.cutoffHz).toBe(555);
    expect(s.patch.vcf.resonance).toBe(defaultPatch().vcf.resonance);
    expect(s.patch.mixer).toEqual(defaultPatch().mixer);
  });

  it("updateVco() touches only the indexed VCO", () => {
    const { updateVco } = useSynthStore.getState();
    updateVco(2, { wave: "square", semitones: 5 });
    const { vco } = useSynthStore.getState().patch;
    expect(vco[2].wave).toBe("square");
    expect(vco[2].semitones).toBe(5);
    expect(vco[0].wave).toBe(defaultPatch().vco[0].wave);
  });

  it("resetPatch() restores defaults", () => {
    const { update, resetPatch } = useSynthStore.getState();
    update("master", { volume: 0.1 });
    resetPatch();
    expect(useSynthStore.getState().patch).toEqual(defaultPatch());
  });

  it("patch stays serializable (the patch IS the block diagram)", () => {
    const { patch } = useSynthStore.getState();
    const roundTrip = JSON.parse(JSON.stringify(patch));
    expect(roundTrip).toEqual(patch);
  });
});
