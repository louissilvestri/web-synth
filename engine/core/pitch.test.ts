import { describe, expect, it } from "vitest";
import {
  centsToRatio,
  midiNoteToFrequency,
  RANGE_SEMITONES,
  semitonesToRatio,
} from "./pitch";

describe("midiNoteToFrequency", () => {
  it("maps A4 (69) to the master-tune reference", () => {
    expect(midiNoteToFrequency(69)).toBe(440);
    expect(midiNoteToFrequency(69, 442)).toBe(442);
  });

  it("moves by exact octaves every 12 notes", () => {
    expect(midiNoteToFrequency(81)).toBeCloseTo(880, 10);
    expect(midiNoteToFrequency(57)).toBeCloseTo(220, 10);
  });

  it("maps middle C (60) to ~261.63 Hz", () => {
    expect(midiNoteToFrequency(60)).toBeCloseTo(261.6256, 3);
  });
});

describe("ratios", () => {
  it("1200 cents and 12 semitones are both one octave", () => {
    expect(centsToRatio(1200)).toBeCloseTo(2, 10);
    expect(semitonesToRatio(12)).toBeCloseTo(2, 10);
    expect(centsToRatio(0)).toBe(1);
  });

  it("negative offsets divide the frequency", () => {
    expect(semitonesToRatio(-12)).toBeCloseTo(0.5, 10);
  });
});

describe("RANGE_SEMITONES", () => {
  it("footages are octave-spaced with 8' as unity", () => {
    expect(RANGE_SEMITONES["8"]).toBe(0);
    expect(RANGE_SEMITONES["16"]).toBe(-12);
    expect(RANGE_SEMITONES["4"] - RANGE_SEMITONES["8"]).toBe(12);
  });

  it("LO sits far below audio range for LFO duty", () => {
    const loA4 = midiNoteToFrequency(69 + RANGE_SEMITONES.lo);
    expect(loA4).toBeLessThan(20);
  });
});
