import { describe, expect, it } from "vitest";
import { Adsr } from "./adsr";
import { LadderFilter } from "./ladder";
import { Lfo } from "./lfo";
import { Oscillator } from "./oscillator";
import { Limiter, Noise, Slew } from "./util";

const SR = 48000;

function run(fn: () => number, n: number): number[] {
  return Array.from({ length: n }, fn);
}

describe("Oscillator", () => {
  it("stays within [-1.1, 1.1] for every waveform", () => {
    for (const wave of ["triangle", "shark", "saw", "square", "pulseWide", "pulseNarrow"] as const) {
      const osc = new Oscillator(SR);
      for (const v of run(() => osc.tick(440, wave), 4800)) {
        expect(Math.abs(v)).toBeLessThan(1.1);
      }
    }
  });

  it("wraps at the requested frequency", () => {
    const osc = new Oscillator(SR);
    let wraps = 0;
    for (let i = 0; i < SR; i++) {
      osc.tick(440, "saw");
      if (osc.wrapped) wraps++;
    }
    expect(wraps).toBeGreaterThanOrEqual(439);
    expect(wraps).toBeLessThanOrEqual(441);
  });

  it("hard sync locks the slave to the master's period", () => {
    const master = new Oscillator(SR);
    const slave = new Oscillator(SR);
    // Warm up, then check: right after a master wrap the slave phase restarts.
    for (let i = 0; i < SR / 10; i++) {
      master.tick(220, "saw");
      slave.tick(331, "saw", 0, master);
      if (master.wrapped) {
        // The slave's phase was just reset near zero before advancing once.
        expect(slave.phase).toBeLessThan(331 / SR + 0.02);
      }
    }
  });
});

describe("Adsr", () => {
  const p = { attackS: 0.01, decayS: 0.05, sustain: 0.5, releaseS: 0.05 };

  it("rises to peak, decays to sustain, releases to silence", () => {
    const eg = new Adsr(SR);
    eg.gateOn();
    const rise = run(() => eg.tick(p), Math.floor(0.1 * SR));
    expect(Math.max(...rise)).toBeGreaterThan(0.98);
    expect(rise[rise.length - 1]).toBeCloseTo(0.5, 1);
    eg.gateOff();
    run(() => eg.tick(p), Math.floor(0.5 * SR));
    expect(eg.value).toBeLessThan(0.01);
    expect(eg.active).toBe(false);
  });

  it("is monotonic and click-free at segment scale (no negative values)", () => {
    const eg = new Adsr(SR);
    eg.gateOn();
    for (const v of run(() => eg.tick(p), SR / 10)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1.0001);
    }
  });
});

describe("LadderFilter", () => {
  it("attenuates white noise when cutoff is low (it actually filters)", () => {
    const noise = new Noise();
    const open = new LadderFilter(SR);
    const closed = new LadderFilter(SR);
    let rmsOpen = 0;
    let rmsClosed = 0;
    for (let i = 0; i < SR / 2; i++) {
      const x = noise.white() * 0.5;
      rmsOpen += open.tick(x, 18000, 0) ** 2;
      rmsClosed += closed.tick(x, 120, 0) ** 2;
    }
    expect(Math.sqrt(rmsClosed)).toBeLessThan(Math.sqrt(rmsOpen) * 0.35);
  });

  it("stays bounded at full resonance (self-oscillation, not blow-up)", () => {
    const f = new LadderFilter(SR);
    let peak = 0;
    for (let i = 0; i < SR; i++) {
      const v = f.tick(i < 100 ? 0.5 : 0, 800, 1);
      peak = Math.max(peak, Math.abs(v));
    }
    expect(peak).toBeGreaterThan(0.05); // it rings…
    expect(peak).toBeLessThan(4); // …but tanh keeps it bounded
  });
});

describe("Limiter", () => {
  it("keeps hot signals at or under ~0 dBFS", () => {
    const lim = new Limiter(SR);
    for (const v of run(() => lim.tick(Math.sin(Math.random()) * 6), 4800)) {
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });
});

describe("Slew (glide)", () => {
  it("approaches the target exponentially without overshoot", () => {
    const s = new Slew(SR);
    s.set(60);
    let last = 60;
    for (let i = 0; i < SR / 10; i++) {
      const v = s.tick(72, 0.02);
      expect(v).toBeGreaterThanOrEqual(last - 1e-9);
      expect(v).toBeLessThanOrEqual(72);
      last = v;
    }
    // 0.1 s at a 0.02 s time-constant = 5τ → within ~0.7% of the jump
    expect(last).toBeGreaterThan(71.8);
  });
});

describe("Noise", () => {
  it("pink output stays bounded", () => {
    const n = new Noise();
    for (const v of run(() => n.pink(), 48000)) {
      expect(Math.abs(v)).toBeLessThan(1.25);
    }
  });
});

describe("Lfo", () => {
  it("all waveforms stay in [-1, 1]", () => {
    for (const wave of ["triangle", "saw", "ramp", "square", "sh"] as const) {
      const lfo = new Lfo(SR);
      for (const v of run(() => lfo.tick(5, wave), 48000)) {
        expect(Math.abs(v)).toBeLessThanOrEqual(1);
      }
    }
  });
});
