/**
 * Pitch math — pure functions, no audio dependencies.
 *
 * The engine works in three pitch domains:
 *  - MIDI note numbers (integer keys, 69 = A4)
 *  - semitone offsets (detune knobs, key-assign transposition)
 *  - frequency in Hz (what the oscillators consume)
 */

/** MIDI note number → frequency in Hz (12-TET). `a4` is the master-tune reference. */
export function midiNoteToFrequency(note: number, a4 = 440): number {
  return a4 * 2 ** ((note - 69) / 12);
}

/** Pitch offset in cents → frequency ratio (100 cents = 1 semitone). */
export function centsToRatio(cents: number): number {
  return 2 ** (cents / 1200);
}

/** Pitch offset in semitones → frequency ratio. */
export function semitonesToRatio(semitones: number): number {
  return 2 ** (semitones / 12);
}

/**
 * Oscillator range (Minimoog footage) → octave offset in semitones relative to 8'.
 * LO drops far below audio range for LFO duty (Model D Osc-3 trick).
 */
export const RANGE_SEMITONES = {
  lo: -60,
  "32": -24,
  "16": -12,
  "8": 0,
  "4": 12,
  "2": 24,
} as const;

export type OscRange = keyof typeof RANGE_SEMITONES;
