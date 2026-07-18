/** Pure value↔position math for sliders — kept DOM-free so it's unit-testable. */

export interface SliderScale {
  min: number;
  max: number;
  /** Logarithmic scale (frequencies, times). min must be > 0. */
  log?: boolean;
  /** Snap increment in value units (e.g. 1 for semitones). */
  step?: number;
}

/** Value → normalized 0..1 position. */
export function valueToNorm(v: number, s: SliderScale): number {
  const clamped = Math.min(s.max, Math.max(s.min, v));
  if (s.log) return Math.log(clamped / s.min) / Math.log(s.max / s.min);
  return (clamped - s.min) / (s.max - s.min);
}

/** Normalized 0..1 position → value (snapped to step if set). */
export function normToValue(n: number, s: SliderScale): number {
  const t = Math.min(1, Math.max(0, n));
  let v = s.log ? s.min * (s.max / s.min) ** t : s.min + t * (s.max - s.min);
  if (s.step) v = Math.round(v / s.step) * s.step;
  return Math.min(s.max, Math.max(s.min, v));
}

/**
 * Keyboard nudge: arrows move 1% of the range (or one step), Shift moves 10%.
 * Log scales nudge in normalized space so audible motion feels even.
 */
export function nudge(v: number, dir: 1 | -1, coarse: boolean, s: SliderScale): number {
  if (s.step && !coarse) {
    return Math.min(s.max, Math.max(s.min, v + dir * s.step));
  }
  const delta = (coarse ? 0.1 : 0.01) * dir;
  return normToValue(valueToNorm(v, s) + delta, s);
}

/* ---- readout formatting ---- */

export function fmtHz(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)}k` : v.toFixed(v < 100 ? 1 : 0);
}

export function fmtSeconds(v: number): string {
  return v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`;
}

export function fmtPercent(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function fmtSigned(unit: string) {
  return (v: number): string => `${v > 0 ? "+" : ""}${Math.round(v)}${unit}`;
}
