import { midiNoteToFrequency, RANGE_SEMITONES } from "../core/pitch";
import type { Patch, VpDest } from "../core/patch";
import { defaultPatch } from "../core/patch";
import { Adsr } from "../dsp/adsr";
import { LadderFilter } from "../dsp/ladder";
import { Lfo } from "../dsp/lfo";
import { Drift, Oscillator } from "../dsp/oscillator";
import { DcBlocker, Limiter, Noise, Slew } from "../dsp/util";
import { ArpSequencer } from "./arp";
import { KeyAssign } from "./keyAssign";

/**
 * The paraphonic engine core — the whole signal chain as one sample-rate
 * process, mirroring the block diagram in docs/ARCHITECTURE.md:
 *
 *   KBD/MIDI → [Arp] → KeyAssign → VCO×4 → VCA×4 (EG2 clones)
 *     → mix (+noise, +feedback drive) → shared ladder VCF (EG1) → limiter
 *   Modulators: MG1, MG2, mod-mix (VCO4↔noise under the wheel),
 *               Virtual Patch matrix (6 slots, MS2000-style)
 *
 * Pure TypeScript with no Web Audio dependency: the AudioWorklet processor
 * calls `process()`, and tests call it directly with plain Float32Arrays.
 */

/** Detune offsets (cents) spreading a unison stack symmetrically. */
const UNISON_SPREAD = [-1, -0.33, 0.33, 1];

/**
 * Resolve a per-VCO value that may follow another VCO (one hop only: if the
 * source is itself linked, we read its *stored* value — no chains, no cycles).
 */
export function resolveLinked(
  vcos: readonly { pw: number; pwmDepth: number }[],
  self: number,
  field: "pw" | "pwmDepth",
  linkTo: number | null,
): number {
  if (linkTo === null || linkTo === self) return vcos[self][field];
  return vcos[linkTo]?.[field] ?? vcos[self][field];
}

/** Virtual Patch destination accumulator (per-sample). */
type VpBus = Record<VpDest, number>;

const VP_ZERO: VpBus = {
  pitch: 0,
  pw: 0,
  cutoff: 0,
  resonance: 0,
  amp: 0,
  noise: 0,
  fxAmount: 0,
  mg1Rate: 0,
};

export class EngineCore {
  patch: Patch = defaultPatch();

  readonly keyAssign = new KeyAssign();
  readonly arp = new ArpSequencer();
  private readonly vcos: Oscillator[];
  private readonly drifts: Drift[];
  private readonly ampEgs: Adsr[]; // EG2 clones, one per VCO slot
  private readonly glides: Slew[];
  private readonly filterEg: Adsr; // EG1 — shared (paraphonic)
  private readonly filter: LadderFilter;
  private readonly mg1: Lfo;
  private readonly mg2: Lfo;
  private readonly noise = new Noise();
  private readonly dcBlocker = new DcBlocker();
  private readonly limiter: Limiter;

  // Performance state (not part of the patch)
  private pitchBend = 0; // −1..1
  private modWheel = 0; // 0..1
  private sustainOn = false;
  private readonly sustained = new Set<number>();
  private lastVelocity = 1;

  // Arp clock (sample-counted inside process())
  private arpCountdown = 0;
  private arpGateCountdown = 0;
  private arpNote: number | null = null;

  private prevOut = 0; // for the feedback/overload path
  private lastNoise = 0; // for the mod-mix source
  private lastOut = [0, 0, 0, 0];
  private a440Phase = 0;
  private readonly vp: VpBus = { ...VP_ZERO };

  constructor(readonly sampleRate: number) {
    this.vcos = [0, 1, 2, 3].map(() => new Oscillator(sampleRate));
    this.drifts = [0, 1, 2, 3].map(() => new Drift(sampleRate));
    this.ampEgs = [0, 1, 2, 3].map(() => new Adsr(sampleRate));
    this.glides = [0, 1, 2, 3].map(() => new Slew(sampleRate));
    this.filterEg = new Adsr(sampleRate);
    this.filter = new LadderFilter(sampleRate);
    this.mg1 = new Lfo(sampleRate);
    this.mg2 = new Lfo(sampleRate);
    this.limiter = new Limiter(sampleRate);
  }

  /* ---------------- note routing ---------------- */

  noteOn(note: number, velocity: number): void {
    this.lastVelocity = velocity;
    if (this.patch.arp.on) {
      this.arp.noteOn(note, this.patch.arp.latch);
      return;
    }
    const { retrigger } = this.keyAssign.noteOn(note, velocity, this.patch.keyAssign);
    this.sustained.delete(note);
    this.applyGates(retrigger);
  }

  noteOff(note: number): void {
    if (this.patch.arp.on) {
      this.arp.noteOff(note, this.patch.arp.latch);
      return;
    }
    if (this.sustainOn) {
      this.sustained.add(note);
      return;
    }
    this.keyAssign.noteOff(note, this.patch.keyAssign);
    this.applyGates(false);
  }

  setSustain(on: boolean): void {
    this.sustainOn = on;
    if (!on) {
      for (const note of this.sustained) {
        this.keyAssign.noteOff(note, this.patch.keyAssign);
      }
      this.sustained.clear();
      this.applyGates(false);
    }
  }

  setPitchBend(value: number): void {
    this.pitchBend = Math.min(1, Math.max(-1, value));
  }

  setModWheel(value: number): void {
    this.modWheel = Math.min(1, Math.max(0, value));
  }

  allNotesOff(): void {
    this.keyAssign.allNotesOff();
    this.arp.clear();
    this.arpNote = null;
    this.sustained.clear();
    for (const eg of this.ampEgs) eg.gateOff();
    this.filterEg.gateOff();
  }

  setPatch(patch: Patch): void {
    const arpWasOn = this.patch.arp.on;
    this.patch = patch;
    if (arpWasOn !== patch.arp.on) this.allNotesOff();
  }

  /* ---------------- gates ---------------- */

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

  /* ---------------- arp clock ---------------- */

  private tickArp(): void {
    const p = this.patch.arp;
    if (!p.on) return;
    if (!this.arp.active) {
      if (this.arpNote !== null) {
        this.keyAssign.noteOff(this.arpNote, this.patch.keyAssign);
        this.applyGates(false);
        this.arpNote = null;
      }
      this.arpCountdown = 0;
      return;
    }
    const stepSamples = Math.max(
      1,
      Math.round((this.sampleRate * 60) / p.bpm / 2), // eighth notes
    );
    if (this.arpCountdown <= 0) {
      if (this.arpNote !== null) {
        this.keyAssign.noteOff(this.arpNote, this.patch.keyAssign);
      }
      const next = this.arp.advance(p);
      if (next !== null) {
        this.keyAssign.noteOn(next, this.lastVelocity, this.patch.keyAssign);
        this.applyGates(true);
        this.arpNote = next;
        this.arpGateCountdown = Math.max(1, Math.round(stepSamples * p.gate));
      }
      this.arpCountdown = stepSamples;
    }
    this.arpCountdown--;
    if (this.arpGateCountdown > 0) {
      this.arpGateCountdown--;
      if (this.arpGateCountdown === 0 && this.arpNote !== null) {
        this.keyAssign.noteOff(this.arpNote, this.patch.keyAssign);
        this.applyGates(false);
        this.arpNote = null;
      }
    }
  }

  /* ---------------- virtual patch ---------------- */

  private evalVirtualPatch(mg1: number, mg2: number): void {
    const bus = this.vp;
    for (const d of Object.keys(bus) as VpDest[]) bus[d] = 0;
    for (const slot of this.patch.virtualPatch) {
      if (slot.source === "off" || slot.amount === 0) continue;
      let v: number;
      switch (slot.source) {
        case "eg1": v = this.filterEg.value; break;
        case "eg2": v = maxEnvValue(this.ampEgs); break;
        case "mg1": v = mg1; break;
        case "mg2": v = mg2; break;
        case "velocity": v = this.lastVelocity; break;
        case "kbdTrack": v = Math.min(1, Math.max(-1, (this.trackedNote() - 60) / 30)); break;
        case "modWheel": v = this.modWheel; break;
        case "pitchBend": v = this.pitchBend; break;
      }
      bus[slot.dest] += v * slot.amount;
    }
  }

  /* ---------------- render ---------------- */

  /** Render one mono block. */
  process(out: Float32Array): void {
    const p = this.patch;
    const slots = this.keyAssign.slots;

    for (let n = 0; n < out.length; n++) {
      this.tickArp();

      const mg2 = this.mg2.tick(p.mg2.rateHz, p.mg2.wave);
      this.evalVirtualPatch(this.lastMg1, mg2);
      const vp = this.vp;
      const mg = this.mg1.tick(p.mg1.rateHz * 2 ** (vp.mg1Rate * 2), p.mg1.wave);
      this.lastMg1 = mg;

      // Model D mod-mix: audio-rate VCO4↔noise blend, depth = mod wheel.
      const modSig =
        (1 - p.modMix.mix) * this.lastOut[3] + p.modMix.mix * this.lastNoise;
      const wheelPitchSemis = p.modMix.toPitch ? modSig * this.modWheel * 1.5 : 0;
      const wheelFilterOct = p.modMix.toFilter ? modSig * this.modWheel * 2 : 0;

      const fxSweepBase =
        p.effects.modSource === "off"
          ? 1
          : Math.max(
              0,
              1 +
                p.effects.modDepth *
                  (p.effects.modSource === "eg1" ? this.filterEg.value : mg),
            );
      const fxSweep = Math.max(0, fxSweepBase + vp.fxAmount);

      // --- VCO bank → per-VCO VCA → mix -----------------------------------
      let mix = 0;
      const ampVp = Math.min(2, Math.max(0, 1 + vp.amp));
      for (let i = 0; i < 4; i++) {
        const vp_ = p.vco[i];
        const env = this.ampEgs[i].tick(p.eg2);
        if (!vp_.enabled) continue;

        const slot = slots[i];
        const baseNote = vp_.keyboardTrack || i !== 3 ? (slot.note ?? 60) : 60;
        const stacked = p.keyAssign.mode === "mono" || p.keyAssign.mode === "share";
        const spread = stacked
          ? UNISON_SPREAD[i] * p.keyAssign.unisonDetuneCents
          : 0;

        const isMaster =
          i === 0 || (p.effects.topology === "double" && i === 2);
        const fxEngaged = p.effects.sync || p.effects.xmod > 0;

        const semis =
          RANGE_SEMITONES[vp_.range] +
          vp_.semitones +
          (!isMaster && fxEngaged ? p.effects.intervalSemitones : 0) +
          this.pitchBend * p.master.bendRangeSemis +
          wheelPitchSemis +
          vp.pitch * 12 +
          (vp_.fineCents + spread + this.drifts[i].tick() + mg * p.mg1.toPitchCents) /
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
          freq *= 2 ** (this.lastOut[masterIdx] * p.effects.xmod * fxSweep * 3);
        }

        // Per-VCO PW/PWM, optionally following another VCO (one hop, no chains).
        const pwBase = resolveLinked(p.vco, i, "pw", vp_.pwSyncTo);
        const pwmDepth = resolveLinked(p.vco, i, "pwmDepth", vp_.pwmSyncTo);
        const pwOffset = pwBase + pwmDepth * 0.35 * mg + vp.pw * 0.35;
        const sample = this.vcos[i].tick(
          freq,
          vp_.wave,
          pwOffset,
          !isMaster && p.effects.sync ? master : undefined,
        );
        this.lastOut[i] = sample;
        mix += sample * vp_.level * env * ampVp * 0.3;
      }

      // --- Noise + feedback/overload drive --------------------------------
      const nzSample =
        p.mixer.noiseType === "white" ? this.noise.white() : this.noise.pink();
      this.lastNoise = nzSample;
      const noiseLevel = Math.min(1, Math.max(0, p.mixer.noiseLevel + vp.noise));
      if (noiseLevel > 0) {
        mix += nzSample * noiseLevel * maxEnvValue(this.ampEgs) * 0.3;
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
        2 **
          (p.vcf.egAmount * eg1 * 5 +
            trackSemis / 12 +
            mg * p.mg1.toCutoff * 3 +
            wheelFilterOct +
            vp.cutoff * 4);
      const resonance = Math.min(1, Math.max(0, p.vcf.resonance + vp.resonance));
      let s = this.filter.tick(mix, cutoff, resonance);

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

  private lastMg1 = 0;
}

/** Noise shares the amp contour: it follows the loudest active amp EG. */
function maxEnvValue(egs: Adsr[]): number {
  let max = 0;
  for (const e of egs) if (e.value > max) max = e.value;
  return max;
}
