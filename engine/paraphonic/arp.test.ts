import { describe, expect, it } from "vitest";
import type { ArpPatch } from "../core/patch";
import { ArpSequencer } from "./arp";

function patch(over: Partial<ArpPatch> = {}): ArpPatch {
  return { on: true, mode: "up", latch: false, rangeOct: 1, bpm: 120, gate: 0.5, ...over };
}

function run(arp: ArpSequencer, p: ArpPatch, n: number): (number | null)[] {
  return Array.from({ length: n }, () => arp.advance(p));
}

describe("ArpSequencer", () => {
  it("up mode cycles held notes ascending", () => {
    const arp = new ArpSequencer();
    const p = patch();
    for (const n of [64, 60, 67]) arp.noteOn(n, false);
    expect(run(arp, p, 6)).toEqual([60, 64, 67, 60, 64, 67]);
  });

  it("down mode cycles descending", () => {
    const arp = new ArpSequencer();
    const p = patch({ mode: "down" });
    for (const n of [60, 64, 67]) arp.noteOn(n, false);
    expect(run(arp, p, 4)).toEqual([67, 64, 60, 67]);
  });

  it("updown ping-pongs without repeating endpoints", () => {
    const arp = new ArpSequencer();
    const p = patch({ mode: "updown" });
    for (const n of [60, 64, 67]) arp.noteOn(n, false);
    expect(run(arp, p, 7)).toEqual([60, 64, 67, 64, 60, 64, 67]);
  });

  it("range repeats the pattern across octaves", () => {
    const arp = new ArpSequencer();
    const p = patch({ rangeOct: 2 });
    arp.noteOn(60, false);
    arp.noteOn(64, false);
    expect(run(arp, p, 5)).toEqual([60, 64, 72, 76, 60]);
  });

  it("unlatched: released notes leave the pattern", () => {
    const arp = new ArpSequencer();
    const p = patch();
    for (const n of [60, 64, 67]) arp.noteOn(n, false);
    arp.noteOff(64, false);
    const seq = run(arp, p, 4);
    expect(seq).not.toContain(64);
    expect(arp.active).toBe(true);
  });

  it("latched: pattern survives release; fresh press starts a new set", () => {
    const arp = new ArpSequencer();
    arp.noteOn(60, true);
    arp.noteOn(64, true);
    arp.noteOff(60, true);
    arp.noteOff(64, true);
    expect(arp.active).toBe(true); // latched
    arp.noteOn(72, true); // all released → new set
    const p = patch({ latch: true });
    expect(run(arp, p, 2)).toEqual([72, 72]);
  });

  it("goes idle when unlatched and everything is released", () => {
    const arp = new ArpSequencer();
    arp.noteOn(60, false);
    arp.noteOff(60, false);
    expect(arp.active).toBe(false);
    expect(arp.advance(patch())).toBeNull();
  });
});
