import { describe, expect, it } from "vitest";
import {
  fmtHz,
  fmtSeconds,
  normToValue,
  nudge,
  valueToNorm,
} from "./sliderMath";

describe("linear scale", () => {
  const s = { min: -7, max: 7, step: 1 };

  it("round-trips value ↔ norm", () => {
    expect(valueToNorm(0, s)).toBeCloseTo(0.5, 10);
    expect(normToValue(0.5, s)).toBe(0);
    expect(normToValue(1, s)).toBe(7);
    expect(normToValue(0, s)).toBe(-7);
  });

  it("snaps to step", () => {
    expect(normToValue(0.53, s)).toBe(0);
    expect(normToValue(0.58, s)).toBe(1);
  });

  it("nudges by one step and clamps at the ends", () => {
    expect(nudge(6, 1, false, s)).toBe(7);
    expect(nudge(7, 1, false, s)).toBe(7);
    expect(nudge(-7, -1, false, s)).toBe(-7);
  });
});

describe("log scale", () => {
  const s = { min: 20, max: 16000, log: true };

  it("puts the geometric middle at norm 0.5", () => {
    const mid = normToValue(0.5, s);
    expect(mid).toBeCloseTo(Math.sqrt(20 * 16000), 0);
    expect(valueToNorm(mid, s)).toBeCloseTo(0.5, 6);
  });

  it("clamps out-of-range values", () => {
    expect(valueToNorm(5, s)).toBe(0);
    expect(valueToNorm(99999, s)).toBe(1);
  });

  it("nudge moves evenly in normalized (audible) space", () => {
    const up = nudge(440, 1, false, s);
    const down = nudge(440, -1, false, s);
    // symmetric ratio steps, not symmetric Hz steps
    expect(up / 440).toBeCloseTo(440 / down, 3);
    expect(up).toBeGreaterThan(440);
  });
});

describe("formatting", () => {
  it("formats Hz with k suffix", () => {
    expect(fmtHz(440)).toBe("440");
    expect(fmtHz(2400)).toBe("2.40k");
    expect(fmtHz(16000)).toBe("16.0k");
  });

  it("formats seconds as ms below 1s", () => {
    expect(fmtSeconds(0.25)).toBe("250ms");
    expect(fmtSeconds(2)).toBe("2.00s");
  });
});
