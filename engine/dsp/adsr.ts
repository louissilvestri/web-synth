import type { AdsrPatch } from "../core/patch";

type Stage = "idle" | "attack" | "decay" | "sustain" | "release";

/**
 * Exponential ADSR. Each segment is an RC-style approach toward a target —
 * `v += (target − v) · coeff` — which is both click-free and what analog
 * envelope generators actually do. (v1's linear ramps were audibly wrong.)
 *
 * The attack targets slightly above 1 so it terminates instead of
 * asymptoting, giving the snappy Minimoog-style attack knee.
 */
export class Adsr {
  private stage: Stage = "idle";
  private v = 0;

  constructor(private readonly sampleRate: number) {}

  get value(): number {
    return this.v;
  }

  get active(): boolean {
    return this.stage !== "idle";
  }

  gateOn(): void {
    this.stage = "attack";
  }

  gateOff(): void {
    if (this.stage !== "idle") this.stage = "release";
  }

  reset(): void {
    this.stage = "idle";
    this.v = 0;
  }

  private coeff(timeS: number): number {
    // Time-constant → per-sample coefficient; floor keeps 0-second segments instant.
    const t = Math.max(timeS, 0.0005);
    return 1 - Math.exp(-1 / (t * this.sampleRate * 0.33));
  }

  tick(p: AdsrPatch): number {
    switch (this.stage) {
      case "attack": {
        this.v += (1.18 - this.v) * this.coeff(p.attackS);
        if (this.v >= 1) {
          this.v = 1;
          this.stage = "decay";
        }
        break;
      }
      case "decay": {
        this.v += (p.sustain - this.v) * this.coeff(p.decayS);
        if (Math.abs(this.v - p.sustain) < 0.001) this.stage = "sustain";
        break;
      }
      case "sustain":
        this.v = p.sustain;
        break;
      case "release": {
        this.v += (0 - this.v) * this.coeff(p.releaseS);
        if (this.v < 0.0005) {
          this.v = 0;
          this.stage = "idle";
        }
        break;
      }
      case "idle":
        break;
    }
    return this.v;
  }
}
