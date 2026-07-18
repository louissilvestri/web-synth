/** Small stateful DSP helpers shared across the engine. */

/** White / pink noise. Pink uses Paul Kellet's economy filter approximation. */
export class Noise {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;

  white(): number {
    return Math.random() * 2 - 1;
  }

  pink(): number {
    const w = this.white();
    this.b0 = 0.99765 * this.b0 + w * 0.099046;
    this.b1 = 0.963 * this.b1 + w * 0.2965164;
    this.b2 = 0.57 * this.b2 + w * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + w * 0.1848) * 0.11;
  }
}

/** One-pole DC blocker — required after tanh/feedback stages. */
export class DcBlocker {
  private x1 = 0;
  private y1 = 0;

  tick(x: number): number {
    const y = x - this.x1 + 0.995 * this.y1;
    this.x1 = x;
    this.y1 = y;
    return y;
  }
}

/**
 * One-pole slew — used for glide (in semitone domain, so the slide is
 * musically even) and for de-zippering control values.
 */
export class Slew {
  private v: number;
  private initialized = false;

  constructor(private readonly sampleRate: number) {
    this.v = 0;
  }

  /** Jump instantly (glide off, or first note). */
  set(value: number): void {
    this.v = value;
    this.initialized = true;
  }

  tick(target: number, timeS: number): number {
    if (!this.initialized) {
      this.set(target);
      return this.v;
    }
    const coeff = 1 - Math.exp(-1 / (Math.max(timeS, 0.001) * this.sampleRate));
    this.v += (target - this.v) * coeff;
    return this.v;
  }
}

/**
 * Output safety limiter: fast-attack / slow-release peak follower driving
 * gain reduction above the threshold, plus a hard tanh ceiling. Mandatory —
 * a self-oscillating ladder under 4-VCO unison can otherwise slam the DAC.
 */
export class Limiter {
  private env = 0;

  constructor(
    private readonly sampleRate: number,
    private readonly thresholdDb = -1,
  ) {}

  tick(x: number): number {
    const threshold = 10 ** (this.thresholdDb / 20);
    const a = Math.abs(x);
    const release = 1 - Math.exp(-1 / (0.12 * this.sampleRate));
    this.env = a > this.env ? a : this.env + (a - this.env) * release;
    const gain = this.env > threshold ? threshold / this.env : 1;
    return Math.tanh(x * gain);
  }
}
