import { midiNoteToFrequency, RANGE_SEMITONES } from "../core/pitch";
import type { Patch } from "../core/patch";
import { defaultPatch } from "../core/patch";
import { Adsr } from "../dsp/adsr";
import { LadderFilter } from "../dsp/ladder";
import { Lfo } from "../dsp/lfo";
import { Drift, Oscillator } from "../dsp/oscillator";
import { DcBlocker, Limiter, Noise, Slew } from "../dsp/util";
import { KeyAssign } from "./keyAssign";

/**
 * The paraphonic engine core — the whole signal chain as one sample-rate
 * process, mirroring the block diagram in PLAN.md §3.1:
 *
 *   KeyAssign → VCO×4 → VCA×4 (EG2 clones) → mix (+noise, +feedback drive)
 *     → shared ladder VCF (EG1, kbd tracking) → master volume → limiter
 *
 * Pure TypeScript with no Web Audio dependency: the AudioWorklet processor
 * calls `process()`, and tests call it directly with plain Float32Arrays.
 */

/** Detune offsets (cents) spreading a unison stack symmetrically. */
const UNISON_SPREAD = [-1, -0.33, 0.33, 1];

export class EngineCore {
  patch: Patch = defaultPatch();

  readonly keyAssign = new KeyAssign();
  private readonly vcos: Oscillator[];
  private readonly drifts: Drift[];
  private readonly ampEgs: Adsr[]; // EG2 clones, one per VCO slot
  private readonly glides: Slew[];
  private readonly filterEg: Adsr; // EG1 — shared (paraphonic)
  private readonly filter: LadderFilter;
  private readonly mg1: Lfo;
  private readonly noise = new Noise();
  private readonly dcBlocker = new DcBlocker();
  private readonly limiter: Limiter;
  private prevOut = 0; // for the feedback/overload path

  constructor(readonly sampleRate: number) {
    this.vcos = [0, 1, 2, 3].map(() => new Oscillator(sampleRate));
    this.drifts = [0, 1, 2, 3].map(() => new Drift(sampleRate));
    this.ampEgs = [0, 1, 2, 3].map(() => new Adsr(sampleRate));
    this.glides = [0, 1, 2, 3].map(() => new Slew(sampleRate));
    this.filterEg = new Adsr(sampleRate);
    this.filter = new LadderFilter(sampleRate);
    this.mg1 = new Lfo(sampleRate);
    this.limiter = new Limiter(sampleRate);
  }

  noteOn(note: number, velocity: number): void {
    const { retrigger } = this.keyAssign.noteOn(note, velocity, this.patch.keyAssign);
    this.applyGates(retrigger);
  }

  noteOff(note: number): void {
    this.keyAssign.noteOff(note, this.patch.keyAssign);
    this.applyGates(false);
  }

  allNotesOff(): void {
    this.keyAssign.allNotesOff();
    for (const eg of this.ampEgs) eg.gateOff();
    this.filterEg.gateOff();
  }

  setPatch(patch: Patch): void {
    this.patch = patch;
  }

  /** Sync EG gates to the allocator state after a note event. */
  private applyGates(retrigger: boolean): void {
    const slots = this.keyAssign.slots;
    for (let i = 0; i < 4; i++) {
      const eg = this.ampEgs[i];
      if (slots[i].gate) {
        if (retrigger || !eg.active) eg.gateOn();
      } else {
        eg.gateOff();
      }
    }
    if (this.keyAssign.anyGate) {
      if (retrigger || !this.filterEg.active) this.filterEg.gateOn();
    } else {
      this.filterEg.gateOff();
    }
  }

  /** Highest gated note, for Model D-style filter keyboard tracking. */
  private trackedNote(): number {
    let top = 60;
    for (const s of this.keyAssign.slots) {
      if (s.gate && s.note !== null && s.note > top) top = s.note;
    }
    return top;
  }

  /** Render one mono block. */
  process(out: Float32Array): void {
    const p = this.patch;
    const slots = this.keyAssign.slots;

    for (let n = 0; n < out.length; n++) {
      const mg = this.mg1.tick(p.mg1.rateHz, p.mg1.wave);
      const fxSweep =
        p.effects.modSource === "off"
          ? 1
          : Math.max(
              0,
              1 +
                p.effects.modDepth *
                  (p.effects.modSource === "eg1" ? this.filterEg.value : mg),
            );

      // --- VCO bank → per-VCO VCA → mix -----------------------------------
      let mix = 0;
      for (let i = 0; i < 4; i++) {
        const vp = p.vco[i];
        const env = this.ampEgs[i].tick(p.eg2);
        if (!vp.enabled) continue;

        const slot = slots[i];
        const baseNote = vp.keyboardTrack || i !== 3 ? (slot.note ?? 60) : 60;
        const stacked = p.keyAssign.mode === "mono" || p.keyAssign.mode === "share";
        const spread = stacked
          ? UNISON_SPREAD[i] * p.keyAssign.unisonDetuneCents
          : 0;

        // Effects section: VCO1 (and VCO3 in double mode) are masters.
        const isMaster =
          i === 0 || (p.effects.topology === "double" && i === 2);
        const fxEngaged = p.effects.sync || p.effects.xmod > 0;

        const semis =
          RANGE_SEMITONES[vp.range] +
          vp.semitones +
          // Moog-style sync interval: slaves ride above the master while the
          // effects section is engaged — the offset ratio is the sync timbre.
          (!isMaster && fxEngaged ? p.effects.intervalSemitones : 0) +
          (vp.fineCents + spread + this.drifts[i].tick() + mg * p.mg1.toPitchCents) /
            100 +
          p.master.tuneCents / 100;

        const targetPitch = baseNote + semis;
        const pitch = p.glide.on
          ? this.glides[i].tick(targetPitch, p.glide.timeS)
          : (this.glides[i].set(targetPitch), targetPitch);

        const masterIdx = p.effects.topology === "double" && i >= 2 ? 2 : 0;
        const master = isMaster ? undefined : this.vcos[masterIdx];

        let freq = midiNoteToFrequency(pitch);
        if (!isMaster && p.effects.xmod > 0 && master) {
          // Audio-rate FM from the master's last output (X-Mod).
          freq *= 2 ** (this.lastOut[masterIdx] * p.effects.xmod * fxSweep * 3);
        }

        const pwm = p.pwm.widthOffset + p.pwm.depth * 0.35 * mg;
        const sample = this.vcos[i].tick(
          freq,
          vp.wave,
          pwm,
          !isMaster && p.effects.sync ? master : undefined,
        );
        this.lastOut[i] = sample;
        mix += sample * vp.level * env * 0.3;
      }

      // --- Noise + feedback/overload drive --------------------------------
      if (p.mixer.noiseLevel > 0) {
        const nz =
          p.mixer.noiseType === "white" ? this.noise.white() : this.noise.pink();
        mix += nz * p.mixer.noiseLevel * maxEnvValue(this.ampEgs) * 0.3;
      }
      if (p.mixer.feedback > 0) {
        const drive = 1 + p.mixer.feedback * 6;
        mix = Math.tanh((mix + this.prevOut * p.mixer.feedback * 0.9) * drive) / Math.tanh(drive);
      }

      // --- Shared ladder VCF (the paraphonic heart) -----------------------
      const eg1 = this.filterEg.tick(p.eg1);
      const trackSemis = (this.trackedNote() - 60) * p.vcf.kbdTrack;
      const cutoff =
        p.vcf.cutoffHz *
        2 ** (p.vcf.egAmount * eg1 * 5 + trackSemis / 12 + mg * p.mg1.toCutoff * 3);
      let s = this.filter.tick(mix, cutoff, p.vcf.resonance);

      // --- Master ----------------------------------------------------------
      s = this.dcBlocker.tick(s) * p.master.volume;
      if (p.master.a440) {
        this.a440Phase += 440 / this.sampleRate;
        if (this.a440Phase >= 1) this.a440Phase -= 1;
        s += 0.12 * Math.sin(2 * Math.PI * this.a440Phase);
      }
      s = this.limiter.tick(s);
      this.prevOut = s;
      out[n] = s;
    }
  }

  private lastOut = [0, 0, 0, 0];
  private a440Phase = 0;
}

/** Noise shares the amp contour: it follows the loudest active amp EG. */
function maxEnvValue(egs: Adsr[]): number {
  let max = 0;
  for (const e of egs) if (e.value > max) max = e.value;
  return max;
}
