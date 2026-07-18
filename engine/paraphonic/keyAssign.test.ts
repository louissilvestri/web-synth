import { describe, expect, it } from "vitest";
import type { KeyAssignPatch } from "../core/patch";
import { KeyAssign } from "./keyAssign";

function patch(over: Partial<KeyAssignPatch> = {}): KeyAssignPatch {
  return {
    mode: "poly",
    trigger: "multiple",
    unisonDetuneCents: 8,
    chord: [0, 4, 7, 12],
    ...over,
  };
}

function gatedNotes(ka: KeyAssign): (number | null)[] {
  return ka.slots.filter((s) => s.gate).map((s) => s.note);
}

describe("mono mode", () => {
  it("stacks all four slots on the newest note", () => {
    const ka = new KeyAssign();
    const p = patch({ mode: "mono" });
    ka.noteOn(60, 1, p);
    ka.noteOn(64, 1, p);
    expect(gatedNotes(ka)).toEqual([64, 64, 64, 64]);
  });

  it("falls back to the previous held note on release (last-note priority)", () => {
    const ka = new KeyAssign();
    const p = patch({ mode: "mono" });
    ka.noteOn(60, 1, p);
    ka.noteOn(64, 1, p);
    ka.noteOff(64, p);
    expect(gatedNotes(ka)).toEqual([60, 60, 60, 60]);
  });

  it("single trigger only retriggers from silence", () => {
    const ka = new KeyAssign();
    const p = patch({ mode: "mono", trigger: "single" });
    expect(ka.noteOn(60, 1, p).retrigger).toBe(true);
    expect(ka.noteOn(64, 1, p).retrigger).toBe(false); // legato
    ka.noteOff(60, p);
    ka.noteOff(64, p);
    expect(ka.noteOn(67, 1, p).retrigger).toBe(true);
  });
});

describe("poly mode", () => {
  it("assigns one slot per note, round-robin", () => {
    const ka = new KeyAssign();
    const p = patch();
    ka.noteOn(60, 1, p);
    ka.noteOn(64, 1, p);
    ka.noteOn(67, 1, p);
    expect(gatedNotes(ka).sort()).toEqual([60, 64, 67]);
  });

  it("steals the oldest slot on the fifth note", () => {
    const ka = new KeyAssign();
    const p = patch();
    for (const n of [60, 62, 64, 65, 67]) ka.noteOn(n, 1, p);
    const notes = gatedNotes(ka);
    expect(notes).toHaveLength(4);
    expect(notes).toContain(67);
    expect(notes).not.toContain(60); // oldest was stolen
  });

  it("keeps other notes sounding when one is released", () => {
    const ka = new KeyAssign();
    const p = patch();
    ka.noteOn(60, 1, p);
    ka.noteOn(64, 1, p);
    ka.noteOff(60, p);
    expect(gatedNotes(ka)).toEqual([64]);
  });
});

describe("share mode", () => {
  const p = patch({ mode: "share" });

  it("gives one note all four slots", () => {
    const ka = new KeyAssign();
    ka.noteOn(60, 1, p);
    expect(gatedNotes(ka)).toEqual([60, 60, 60, 60]);
  });

  it("splits 2 notes → 2 slots each, 3 notes → [2,1,1]", () => {
    const ka = new KeyAssign();
    ka.noteOn(60, 1, p);
    ka.noteOn(64, 1, p);
    expect(gatedNotes(ka).sort()).toEqual([60, 60, 64, 64]);
    ka.noteOn(67, 1, p);
    const notes = gatedNotes(ka);
    expect(notes.filter((n) => n === 60)).toHaveLength(2);
    expect(notes.filter((n) => n === 64)).toHaveLength(1);
    expect(notes.filter((n) => n === 67)).toHaveLength(1);
  });

  it("redistributes back when notes are released", () => {
    const ka = new KeyAssign();
    ka.noteOn(60, 1, p);
    ka.noteOn(64, 1, p);
    ka.noteOff(64, p);
    expect(gatedNotes(ka)).toEqual([60, 60, 60, 60]);
  });
});

describe("chord memory", () => {
  it("plays the stored intervals transposed from the played key", () => {
    const ka = new KeyAssign();
    const p = patch({ mode: "chord", chord: [0, 4, 7, 12] });
    ka.noteOn(48, 1, p);
    expect(gatedNotes(ka)).toEqual([48, 52, 55, 60]);
  });

  it("transposes with the newest key", () => {
    const ka = new KeyAssign();
    const p = patch({ mode: "chord", chord: [0, 3, 7, 10] });
    ka.noteOn(60, 1, p);
    ka.noteOn(62, 1, p);
    expect(gatedNotes(ka)).toEqual([62, 65, 69, 72]);
  });
});
