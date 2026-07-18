import type { MgWaveform } from "../core/patch";

/** Modulation generator (LFO) — MG1 of the Mono/Poly pair. Output −1..1. */
export class Lfo {
  private phase = 0;
  private shValue = 0;

  constructor(private readonly sampleRate: number) {}

  tick(rateHz: number, wave: MgWaveform): number {
    const dt = Math.max(rateHz, 0) / this.sampleRate;
    this.phase += dt;
    if (this.phase >= 1) {
      this.phase -= Math.floor(this.phase);
      this.shValue = Math.random() * 2 - 1;
    }
    const t = this.phase;
    switch (wave) {
      case "triangle":
        return 2 * Math.abs(2 * t - 1) - 1;
      case "saw":
        return 1 - 2 * t; // falling
      case "ramp":
        return 2 * t - 1; // rising
      case "square":
        return t < 0.5 ? 1 : -1;
      case "sh":
        return this.shValue;
    }
  }
}
