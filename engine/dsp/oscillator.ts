import type { Waveform } from "../core/patch";

/**
 * PolyBLEP band-limited oscillator.
 *
 * Naïve waveforms get a polynomial band-limited step correction at each
 * discontinuity (saw wrap, pulse edges), which kills the worst aliasing at a
 * fraction of the cost of wavetables. Triangle/shark keep low harmonic energy
 * so their naïve forms are acceptable.
 */

/** Two-sample polynomial BLEP residual around a discontinuity at phase 0. */
function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}


export class Oscillator {
  /** Phase 0..1. */
  phase = 0;
  /** Set true for one sample when the phase wrapped (drives hard sync of slaves). */
  wrapped = false;

  constructor(private readonly sampleRate: number) {}

  /**
   * Advance one sample.
   * @param freqHz   instantaneous frequency (X-Mod feeds in here)
   * @param wave     waveform selector
   * @param pwOffset pulse-width modulation offset (PWM), ±0.4 max applied by caller
   * @param syncFrom master oscillator: when it wrapped this sample, our phase resets
   */
  tick(freqHz: number, wave: Waveform, pwOffset = 0, syncFrom?: Oscillator): number {
    const dt = Math.min(freqHz / this.sampleRate, 0.45);

    if (syncFrom?.wrapped) {
      // Hard sync: restart at the master's fractional wrap position scaled to
      // our rate, so the reset lands with subsample accuracy. The polyBLEP at
      // t<dt then band-limits the restart edge of saw/pulse shapes.
      this.phase = syncFrom.phase * (dt / Math.max(syncFrom.lastDt, 1e-9));
      if (this.phase >= 1) this.phase -= Math.floor(this.phase);
    }

    const t = this.phase;
    let v: number;
    switch (wave) {
      case "saw":
        v = 2 * t - 1 - polyBlep(t, dt);
        break;
      case "pulse": {
        // 50% base width, shaped by the PW/PWM offset; clamped clear of the
        // degenerate edges where the pulse collapses to DC.
        const pw = Math.min(0.95, Math.max(0.05, 0.5 + pwOffset));
        v = (t < pw ? 1 : -1) + polyBlep(t, dt) - polyBlep((t - pw + 1) % 1, dt);
        break;
      }
      case "triangle":
        v = 2 * Math.abs(2 * t - 1) - 1;
        break;
      case "shark": {
        // Minimoog triangle-saw hybrid: equal blend reads very close to the
        // original's asymmetric ramp-triangle.
        const tri = 2 * Math.abs(2 * t - 1) - 1;
        const saw = 2 * t - 1 - polyBlep(t, dt);
        v = 0.5 * tri + 0.5 * saw;
        break;
      }
    }

    this.lastDt = dt;
    this.phase += dt;
    this.wrapped = this.phase >= 1;
    if (this.wrapped) this.phase -= 1;
    return v;
  }

  private lastDt = 0;
}

/**
 * Slow per-VCO pitch drift — a bounded random walk in cents. Real VCOs never
 * sit perfectly still; a few cents of wander is what makes stacked oscillators
 * beat like the hardware.
 */
export class Drift {
  private value = 0;
  private countdown = 0;

  constructor(
    private readonly sampleRate: number,
    private readonly maxCents = 2.5,
    private readonly rate = 0.5, // walks per second, roughly
  ) {}

  /** Decimated: drift moves far below audio rate, so walk once per 32 samples. */
  tick(): number {
    if (this.countdown-- > 0) return this.value;
    this.countdown = 31;
    const step = (Math.random() - 0.5) * ((64 * this.rate) / this.sampleRate);
    this.value += step * this.maxCents * 40;
    if (this.value > this.maxCents) this.value = this.maxCents;
    else if (this.value < -this.maxCents) this.value = -this.maxCents;
    return this.value;
  }
}
