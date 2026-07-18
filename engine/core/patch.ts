import type { OscRange } from "./pitch";

/**
 * The patch IS the block diagram: one serializable object, organized
 * per-module exactly like the hardware signal chain (PLAN.md §3.1).
 * Everything the engine does is a pure function of (patch, note events, time).
 */

export type Waveform =
  | "triangle"
  | "shark" // Minimoog triangle-saw hybrid
  | "saw"
  | "square"
  | "pulseWide" // ~1/3 duty
  | "pulseNarrow"; // ~1/10 duty

export type KeyAssignMode = "mono" | "poly" | "share" | "chord";
export type TriggerMode = "single" | "multiple";
export type NoiseType = "white" | "pink";
export type SyncTopology = "single" | "double"; // VCO1→2,3,4 vs pairs (1→2, 3→4)
export type FxModSource = "off" | "eg1" | "mg1";
export type MgWaveform = "triangle" | "saw" | "ramp" | "square" | "sh";
/** Model D keyboard-tracking rockers: 1/3 and 2/3, additive → 0, 1/3, 2/3, or 1. */
export type KbdTrack = number;

export interface VcoPatch {
  enabled: boolean;
  wave: Waveform;
  range: OscRange;
  /** Detune in semitones (±7 like the hardware). VCO 1 is the reference: keep 0. */
  semitones: number;
  fineCents: number;
  /** Mixer level 0..1 (per-source knob; `enabled` is the rocker). */
  level: number;
  /** VCO 4 only (Model D Osc-3 trick): false = free-running, ignores the keyboard. */
  keyboardTrack: boolean;
}

export interface MixerPatch {
  noiseType: NoiseType;
  noiseLevel: number; // 0..1
  /** Output→input feedback ("overload" trick) 0..1 — drives tanh saturation. */
  feedback: number;
}

export interface VcfPatch {
  /** Base cutoff in Hz (UI maps a log slider onto this). */
  cutoffHz: number;
  /** 0..1, mapped to ladder feedback; ≥ ~0.9 self-oscillates. */
  resonance: number;
  /** EG1 → cutoff amount, -1..1 (± ~5 octaves at full). */
  egAmount: number;
  kbdTrack: KbdTrack;
}

export interface AdsrPatch {
  attackS: number;
  decayS: number;
  sustain: number; // 0..1 level
  releaseS: number;
}

export interface KeyAssignPatch {
  mode: KeyAssignMode;
  trigger: TriggerMode;
  /** Extra detune spread across stacked VCOs in mono/share modes, in cents. */
  unisonDetuneCents: number;
  /** Chord-memory intervals in semitones relative to the played key (e.g. [0,4,7,12]). */
  chord: number[];
}

export interface GlidePatch {
  on: boolean;
  timeS: number; // time-constant of the pitch slew
}

/** The Mono/Poly "Effects" section: hard sync + cross-modulation. */
export interface EffectsPatch {
  sync: boolean;
  /** X-Mod depth 0..1 (audio-rate FM from the master VCO). */
  xmod: number;
  topology: SyncTopology;
  /** What sweeps the effect amount — the signature MP-4 move. */
  modSource: FxModSource;
  modDepth: number; // 0..1
  /**
   * Sync interval (Moog-style): semitone offset applied to slave VCOs while
   * sync/X-Mod is engaged — the slave-to-master ratio IS the sync timbre.
   */
  intervalSemitones: number; // 0..24
}

/** Shared pulse-width controls (Mono/Poly-style: one PW + PWM for the bank). */
export interface PwmPatch {
  /** Offset from each pulse waveform's base width, ±0.35. */
  widthOffset: number;
  /** MG1 → width modulation depth, 0..1. */
  depth: number;
}

export interface Mg1Patch {
  wave: MgWaveform;
  rateHz: number;
  toPitchCents: number; // vibrato depth at full mod
  toCutoff: number; // 0..1 → octaves of cutoff sweep
}

export interface MasterPatch {
  tuneCents: number;
  volume: number; // 0..1
  /** A-440 reference sine for tuning by ear (Model D panel switch). */
  a440: boolean;
  /** Pitch-wheel range in semitones. */
  bendRangeSemis: number;
}

export type ArpMode = "up" | "down" | "updown";

export interface ArpPatch {
  on: boolean;
  mode: ArpMode;
  /** Latch: released keys keep arpeggiating; a fresh press starts a new set. */
  latch: boolean;
  /** Octave range: the held set repeated across 1–3 octaves. */
  rangeOct: 1 | 2 | 3;
  bpm: number; // steps are eighth notes
  /** Gate length as a fraction of the step. */
  gate: number;
}

export interface Mg2Patch {
  rateHz: number;
  wave: "triangle" | "square";
}

/** Model D mod-mix: one audio-rate source blend under the mod wheel. */
export interface ModMixPatch {
  /** 0 = VCO 4, 1 = noise (crossfade). */
  mix: number;
  toPitch: boolean;
  toFilter: boolean;
}

export type VpSource =
  | "off"
  | "eg1"
  | "eg2"
  | "mg1"
  | "mg2"
  | "velocity"
  | "kbdTrack"
  | "modWheel"
  | "pitchBend";

export type VpDest =
  | "pitch"
  | "pw"
  | "cutoff"
  | "resonance"
  | "amp"
  | "noise"
  | "fxAmount"
  | "mg1Rate";

/** One Virtual Patch routing slot (MS2000 heritage). */
export interface VpSlot {
  source: VpSource;
  dest: VpDest;
  /** Bipolar depth −1..1. */
  amount: number;
}

export type VirtualPatch = [VpSlot, VpSlot, VpSlot, VpSlot, VpSlot, VpSlot];

export interface Patch {
  vco: [VcoPatch, VcoPatch, VcoPatch, VcoPatch];
  mixer: MixerPatch;
  vcf: VcfPatch;
  eg1: AdsrPatch; // filter contour (shared — paraphonic)
  eg2: AdsrPatch; // amp contour (cloned per VCO — overlapping releases)
  keyAssign: KeyAssignPatch;
  glide: GlidePatch;
  effects: EffectsPatch;
  pwm: PwmPatch;
  mg1: Mg1Patch;
  mg2: Mg2Patch;
  modMix: ModMixPatch;
  arp: ArpPatch;
  virtualPatch: VirtualPatch;
  master: MasterPatch;
}

function vcoDefault(n: 1 | 2 | 3 | 4): VcoPatch {
  return {
    enabled: n <= 2,
    wave: "saw",
    range: "8",
    semitones: 0,
    fineCents: n === 2 ? 6 : 0, // slight classic detune out of the box
    level: 0.8,
    keyboardTrack: true,
  };
}

export function defaultPatch(): Patch {
  return {
    vco: [vcoDefault(1), vcoDefault(2), vcoDefault(3), vcoDefault(4)],
    mixer: { noiseType: "white", noiseLevel: 0, feedback: 0 },
    vcf: { cutoffHz: 2400, resonance: 0.2, egAmount: 0.35, kbdTrack: 2 / 3 },
    eg1: { attackS: 0.005, decayS: 0.35, sustain: 0.3, releaseS: 0.3 },
    eg2: { attackS: 0.003, decayS: 0.25, sustain: 0.8, releaseS: 0.25 },
    keyAssign: { mode: "poly", trigger: "multiple", unisonDetuneCents: 8, chord: [0, 4, 7, 12] },
    glide: { on: false, timeS: 0.06 },
    effects: {
      sync: false,
      xmod: 0,
      topology: "single",
      modSource: "off",
      modDepth: 0,
      intervalSemitones: 0,
    },
    pwm: { widthOffset: 0, depth: 0 },
    mg1: { wave: "triangle", rateHz: 5, toPitchCents: 0, toCutoff: 0 },
    mg2: { rateHz: 2, wave: "triangle" },
    modMix: { mix: 1, toPitch: true, toFilter: false },
    arp: { on: false, mode: "up", latch: false, rangeOct: 1, bpm: 120, gate: 0.5 },
    virtualPatch: [
      { source: "off", dest: "cutoff", amount: 0 },
      { source: "off", dest: "cutoff", amount: 0 },
      { source: "off", dest: "cutoff", amount: 0 },
      { source: "off", dest: "cutoff", amount: 0 },
      { source: "off", dest: "cutoff", amount: 0 },
      { source: "off", dest: "cutoff", amount: 0 },
    ],
    master: { tuneCents: 0, volume: 0.75, a440: false, bendRangeSemis: 2 },
  };
}
