"use client";

import { useCallback, useEffect, useState } from "react";
import { useSynthStore } from "../state/store";

/**
 * On-screen keyboard + QWERTY input — the Chromium-less fallback and the
 * everyday play surface until MIDI lands in M3.
 * QWERTY: classic DAW map (A=C, W=C#, …, K=C+1 octave); Z/X shift octaves.
 */

const QWERTY: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11,
  k: 12, o: 13, l: 14, p: 15, ";": 16,
};

const OCTAVES = 3; // rendered span; C-to-C

function isBlack(semitone: number): boolean {
  return [1, 3, 6, 8, 10].includes(semitone % 12);
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function Keyboard() {
  const noteOn = useSynthStore((s) => s.noteOn);
  const noteOff = useSynthStore((s) => s.noteOff);
  const activeNotes = useSynthStore((s) => s.activeNotes);
  const [baseOctave, setBaseOctave] = useState(3); // C3 = MIDI 48

  const base = (baseOctave + 1) * 12;

  const shiftOctave = useCallback(
    (d: number) => setBaseOctave((o) => Math.min(6, Math.max(0, o + d))),
    [],
  );

  useEffect(() => {
    const down = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const k = e.key.toLowerCase();
      if (k === "z") return shiftOctave(-1);
      if (k === "x") return shiftOctave(1);
      const st = QWERTY[k];
      if (st === undefined || down.has(k)) return;
      down.add(k);
      noteOn(base + st);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const st = QWERTY[k];
      if (st === undefined) return;
      down.delete(k);
      noteOff(base + st);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [base, noteOn, noteOff, shiftOctave]);

  const keys = Array.from({ length: OCTAVES * 12 + 1 }, (_, i) => base + i);

  return (
    <section className="card kbd" aria-label="Keyboard">
      <div className="kbd__side">
        <button type="button" className="btn btn--ghost" onClick={() => shiftOctave(-1)} aria-label="Octave down (Z)">
          − oct
        </button>
        <span className="u-mono u-muted">C{baseOctave}</span>
        <button type="button" className="btn btn--ghost" onClick={() => shiftOctave(1)} aria-label="Octave up (X)">
          + oct
        </button>
      </div>
      <div className="kbd__keys">
        {keys.map((note) => {
          const black = isBlack(note);
          const name = `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
          return (
            <button
              key={note}
              type="button"
              className={`kbd__key${black ? " kbd__key--black" : ""}${activeNotes.includes(note) ? " is-active" : ""}`}
              aria-label={name}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                noteOn(note);
              }}
              onPointerUp={() => noteOff(note)}
              onPointerCancel={() => noteOff(note)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") noteOn(note);
              }}
              onKeyUp={(e) => {
                if (e.key === " " || e.key === "Enter") noteOff(note);
              }}
            >
              {note % 12 === 0 && <span className="kbd__c u-mono">{name}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
