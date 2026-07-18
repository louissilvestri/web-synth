import type { ArpPatch } from "../core/patch";

/**
 * Arpeggiator sequencer — pure note-list logic, no timing. The engine core
 * drives `advance()` on its sample-counted clock and routes the returned
 * note into the key-assign allocator.
 *
 * MP-4 semantics: held keys form the pattern (sorted by pitch), the range
 * switch repeats it across 1–3 octaves, latch keeps released keys in the
 * pattern until a fresh press (from all-released) starts a new one.
 */
export class ArpSequencer {
  /** Keys physically held right now. */
  private held = new Set<number>();
  /** The latched/backing pattern set (may outlive physical holds when latched). */
  private pattern: number[] = [];
  private index = -1;
  private direction: 1 | -1 = 1;

  noteOn(note: number, latch: boolean): void {
    if (latch && this.held.size === 0 && this.pattern.length > 0) {
      // Fresh press after all keys released: start a new latched set.
      this.pattern = [];
      this.index = -1;
    }
    this.held.add(note);
    if (!this.pattern.includes(note)) {
      this.pattern.push(note);
      this.pattern.sort((a, b) => a - b);
    }
  }

  noteOff(note: number, latch: boolean): void {
    this.held.delete(note);
    if (!latch) {
      this.pattern = this.pattern.filter((n) => n !== note);
      if (this.pattern.length === 0) this.index = -1;
    }
  }

  clear(): void {
    this.held.clear();
    this.pattern = [];
    this.index = -1;
    this.direction = 1;
  }

  get active(): boolean {
    return this.pattern.length > 0;
  }

  /** The full step sequence for the current pattern + range (ascending). */
  private steps(p: ArpPatch): number[] {
    const out: number[] = [];
    for (let oct = 0; oct < p.rangeOct; oct++) {
      for (const n of this.pattern) out.push(n + 12 * oct);
    }
    return out;
  }

  /** Advance one step; returns the note to play, or null when idle. */
  advance(p: ArpPatch): number | null {
    const seq = this.steps(p);
    if (seq.length === 0) return null;
    if (seq.length === 1) {
      this.index = 0;
      return seq[0];
    }
    switch (p.mode) {
      case "up":
        this.index = (this.index + 1) % seq.length;
        break;
      case "down":
        this.index = this.index <= 0 ? seq.length - 1 : this.index - 1;
        break;
      case "updown": {
        // Ping-pong without repeating the endpoints.
        let next = this.index + this.direction;
        if (next >= seq.length) {
          this.direction = -1;
          next = seq.length - 2;
        } else if (next < 0) {
          this.direction = 1;
          next = 1;
        }
        this.index = next;
        break;
      }
    }
    // Pattern may have shrunk since the last step.
    if (this.index >= seq.length) this.index = seq.length - 1;
    return seq[this.index];
  }
}
