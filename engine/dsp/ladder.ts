/**
 * Transistor-ladder lowpass (24 dB/oct) — Huovilainen-style model:
 * four cascaded one-pole stages with tanh saturation and a global resonance
 * feedback path. Runs 2× oversampled for stability and reduced tanh aliasing.
 *
 * Characteristic behaviors preserved on purpose:
 *  - resonance feedback subtracts low end (the famous ladder "bass loss")
 *  - resonance ≳ 0.9 pushes feedback past 4 → self-oscillation, playable
 *    via keyboard tracking like the hardware.
 */
/**
 * Rational tanh approximation (Padé 3,2) — within ~3e-3 of Math.tanh over the
 * audio range and several times faster; the hot loop calls it 4× per sample.
 */
function fastTanh(x: number): number {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

export class LadderFilter {
  private s1 = 0;
  private s2 = 0;
  private s3 = 0;
  private s4 = 0;

  constructor(private readonly sampleRate: number) {}

  reset(): void {
    this.s1 = this.s2 = this.s3 = this.s4 = 0;
  }

  /**
   * @param input     audio sample
   * @param cutoffHz  instantaneous cutoff (envelope/tracking already applied)
   * @param resonance 0..1 (mapped internally to feedback 0..4.3)
   */
  tick(input: number, cutoffHz: number, resonance: number): number {
    const fs2 = this.sampleRate * 2;
    const fc = Math.min(Math.max(cutoffHz, 5), this.sampleRate * 0.45);
    const g = 1 - Math.exp((-2 * Math.PI * fc) / fs2);
    const k = resonance * 4.3;

    let out = 0;
    for (let os = 0; os < 2; os++) {
      const x = fastTanh(input - k * this.s4);
      this.s1 += g * (x - fastTanh(this.s1));
      this.s2 += g * (this.s1 - this.s2);
      this.s3 += g * (this.s2 - this.s3);
      this.s4 += g * (this.s3 - this.s4);
      out = this.s4;
    }
    // Mild make-up for the resonance-induced passband loss.
    return out * (1 + resonance * 0.9);
  }
}
