import type { KeyAssignPatch } from "../core/patch";

/**
 * The Mono/Poly key-assign brain (pure logic, no audio).
 *
 * Four VCO slots are allocated across held notes per the MP-4 semantics:
 *  - mono:  all four slots on the newest note (unison stack)
 *  - poly:  round-robin, one slot per note, steal the oldest
 *  - share: dynamic redistribution — 1 note→4 slots, 2→2 each, 3→[2,1,1], 4→1 each
 *  - chord: the stored interval set, transposed from the newest note
 *
 * Trigger semantics: "multiple" retriggers the (shared, paraphonic) envelopes
 * on every key-down; "single" only triggers from silence — legato phrasing.
 */

export interface Slot {
  /** MIDI note this slot sounds, or null when silent. */
  note: number | null;
  gate: boolean;
  velocity: number;
  /** Allocation age for stealing (smaller = older). */
  serial: number;
}

export interface AssignResult {
  /** True when envelopes should (re)trigger this event, per the trigger mode. */
  retrigger: boolean;
}

export class KeyAssign {
  readonly slots: Slot[] = [0, 1, 2, 3].map(() => ({
    note: null,
    gate: false,
    velocity: 0,
    serial: 0,
  }));

  /** Held keys in press order (oldest first). */
  private held: { note: number; velocity: number }[] = [];
  private serial = 0;
  private rr = 0; // poly round-robin cursor

  noteOn(note: number, velocity: number, p: KeyAssignPatch): AssignResult {
    const wasSilent = this.held.length === 0;
    this.held = this.held.filter((h) => h.note !== note);
    this.held.push({ note, velocity });
    this.reallocate(p, note);
    const retrigger = p.trigger === "multiple" || wasSilent;
    return { retrigger };
  }

  noteOff(note: number, p: KeyAssignPatch): AssignResult {
    this.held = this.held.filter((h) => h.note !== note);
    this.reallocate(p, this.newestNote());
    return { retrigger: false };
  }

  allNotesOff(): void {
    this.held = [];
    for (const s of this.slots) {
      s.gate = false;
      s.note = null;
    }
  }

  get anyGate(): boolean {
    return this.slots.some((s) => s.gate);
  }

  private newestNote(): number | null {
    return this.held.length ? this.held[this.held.length - 1].note : null;
  }

  private assign(i: number, note: number | null, velocity: number): void {
    const s = this.slots[i];
    if (note === null) {
      s.gate = false;
      // note kept so the release tail finishes at the right pitch
      return;
    }
    s.note = note;
    s.gate = true;
    s.velocity = velocity;
    s.serial = ++this.serial;
  }

  private reallocate(p: KeyAssignPatch, newest: number | null): void {
    switch (p.mode) {
      case "mono": {
        const v = this.held.length ? this.held[this.held.length - 1].velocity : 0;
        for (let i = 0; i < 4; i++) this.assign(i, newest, v);
        break;
      }
      case "chord": {
        const v = this.held.length ? this.held[this.held.length - 1].velocity : 0;
        for (let i = 0; i < 4; i++) {
          const interval = p.chord[i % Math.max(p.chord.length, 1)] ?? 0;
          this.assign(i, newest === null ? null : newest + interval, v);
        }
        break;
      }
      case "share": {
        // Redistribute all slots over the held notes: 1→[4], 2→[2,2], 3→[2,1,1], 4→[1,1,1,1].
        const n = this.held.length;
        if (n === 0) {
          for (let i = 0; i < 4; i++) this.assign(i, null, 0);
          break;
        }
        const notes = this.held.slice(-4);
        const counts = n === 1 ? [4] : n === 2 ? [2, 2] : n === 3 ? [2, 1, 1] : [1, 1, 1, 1];
        let slot = 0;
        for (let k = 0; k < notes.length; k++) {
          for (let c = 0; c < counts[k]; c++) {
            this.assign(slot++, notes[k].note, notes[k].velocity);
          }
        }
        break;
      }
      case "poly": {
        // Keep existing assignments; gate off released, place new notes round-robin.
        const heldSet = new Set(this.held.map((h) => h.note));
        for (const s of this.slots) {
          if (s.gate && s.note !== null && !heldSet.has(s.note)) s.gate = false;
        }
        const sounding = new Set(
          this.slots.filter((s) => s.gate).map((s) => s.note),
        );
        for (const h of this.held.slice(-4)) {
          if (sounding.has(h.note)) continue;
          const free = this.findFreeSlot();
          this.assign(free, h.note, h.velocity);
          sounding.add(h.note);
        }
        break;
      }
    }
  }

  private findFreeSlot(): number {
    // Prefer silent slots (round-robin from the cursor), else steal the oldest.
    for (let k = 0; k < 4; k++) {
      const i = (this.rr + k) % 4;
      if (!this.slots[i].gate) {
        this.rr = (i + 1) % 4;
        return i;
      }
    }
    let oldest = 0;
    for (let i = 1; i < 4; i++) {
      if (this.slots[i].serial < this.slots[oldest].serial) oldest = i;
    }
    this.rr = (oldest + 1) % 4;
    return oldest;
  }
}
