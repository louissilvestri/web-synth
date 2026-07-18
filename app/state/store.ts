"use client";

import { create } from "zustand";
import type { Patch } from "../../engine/core/patch";
import { defaultPatch } from "../../engine/core/patch";
import { audioEngine } from "../../engine/host/audioEngine";
import type { MidiDevice } from "../../engine/host/midi";
import { MidiInput } from "../../engine/host/midi";
import { mergeSavedPatch } from "./migrate";

/**
 * The patch store — single source of truth for the instrument state.
 * UI writes here; the store pushes to the audio engine and autosaves the
 * working patch (style guide §9: a live instrument autosaves; naming and
 * explicit save-as-preset arrive with the preset system in M4).
 */

const STORAGE_KEY = "web-synth.working-patch.v1";

export type PowerState = "off" | "starting" | "on" | "error";

interface SynthState {
  patch: Patch;
  power: PowerState;
  powerError: string;
  /** Currently sounding notes (for key highlighting). */
  activeNotes: number[];
  /** Mod wheel position (UI mirror; MIDI CC1 also drives it). */
  wheelMod: number;
  midiSupported: boolean;
  midiDevices: MidiDevice[];
  midiSelected: string; // device id or "all"
  midiActive: boolean; // activity blip

  powerOn: () => Promise<void>;
  noteOn: (note: number, velocity?: number) => void;
  noteOff: (note: number) => void;
  allNotesOff: () => void;
  setPitchBend: (v: number) => void;
  setModWheel: (v: number) => void;
  selectMidiDevice: (id: string) => void;
  /** Store the currently held notes as the chord-memory voicing. */
  captureChord: () => boolean;
  /** Update one module of the patch; pushes to the engine + autosaves. */
  update: <K extends keyof Patch>(module: K, partial: Partial<Patch[K]>) => void;
  updateVco: (index: number, partial: Partial<Patch["vco"][number]>) => void;
  resetPatch: () => void;
  /**
   * Load the autosaved working patch. Called from a useEffect after mount —
   * the server prerender and the first client render must both use defaults,
   * or the saved values cause a hydration mismatch.
   */
  hydrate: () => void;
}

function loadWorkingPatch(): Patch | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return mergeSavedPatch(JSON.parse(raw) as Partial<Patch>);
  } catch {
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function autosave(patch: Patch): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(patch));
    } catch {
      // storage full/unavailable — the live engine state is unaffected
    }
  }, 300);
}

function pushPatch(patch: Patch): void {
  audioEngine.setPatch(patch);
  autosave(patch);
}

let midi: MidiInput | null = null;
let midiBlipTimer: ReturnType<typeof setTimeout> | undefined;

export const useSynthStore = create<SynthState>((set, get) => ({
  patch: defaultPatch(),
  power: "off",
  powerError: "",
  activeNotes: [],
  wheelMod: 0,
  midiSupported: false,
  midiDevices: [],
  midiSelected: "all",
  midiActive: false,

  powerOn: async () => {
    if (get().power === "on" || get().power === "starting") return;
    set({ power: "starting" });
    try {
      await audioEngine.init();
      audioEngine.setPatch(get().patch);
      set({ power: "on" });
      // MIDI rides the same user gesture (permission prompt needs one).
      if (MidiInput.supported && !midi) {
        set({ midiSupported: true });
        midi = new MidiInput({
          noteOn: (n, v) => get().noteOn(n, v),
          noteOff: (n) => get().noteOff(n),
          pitchBend: (v) => audioEngine.pitchBend(v),
          modWheel: (v) => get().setModWheel(v),
          sustain: (on) => audioEngine.sustain(on),
          activity: () => {
            set({ midiActive: true });
            clearTimeout(midiBlipTimer);
            midiBlipTimer = setTimeout(() => set({ midiActive: false }), 150);
          },
        });
        midi
          .init((devices) => set({ midiDevices: devices }))
          .catch(() => set({ midiSupported: false }));
      }
    } catch (e) {
      set({ power: "error", powerError: e instanceof Error ? e.message : String(e) });
    }
  },

  noteOn: (note, velocity = 1) => {
    const { power, powerOn } = get();
    if (power !== "on") {
      // First key press is itself the user gesture — boot then retrigger.
      void powerOn().then(() => {
        if (useSynthStore.getState().power === "on") get().noteOn(note, velocity);
      });
      return;
    }
    audioEngine.noteOn(note, velocity);
    set((s) => ({ activeNotes: [...s.activeNotes.filter((n) => n !== note), note] }));
  },

  noteOff: (note) => {
    audioEngine.noteOff(note);
    set((s) => ({ activeNotes: s.activeNotes.filter((n) => n !== note) }));
  },

  allNotesOff: () => {
    audioEngine.allNotesOff();
    set({ activeNotes: [] });
  },

  update: (module, partial) => {
    set((s) => {
      // Array modules (virtualPatch) are replaced whole — object-spreading an
      // array would turn it into a keyed object and break engine iteration.
      const merged = Array.isArray(s.patch[module])
        ? (partial as Patch[typeof module])
        : { ...s.patch[module], ...partial };
      const patch = { ...s.patch, [module]: merged };
      pushPatch(patch);
      return { patch };
    });
  },

  updateVco: (index, partial) => {
    set((s) => {
      const vco = s.patch.vco.map((v, i) =>
        i === index ? { ...v, ...partial } : v,
      ) as Patch["vco"];
      const patch = { ...s.patch, vco };
      pushPatch(patch);
      return { patch };
    });
  },

  resetPatch: () => {
    const patch = defaultPatch();
    pushPatch(patch);
    set({ patch });
  },

  hydrate: () => {
    const patch = loadWorkingPatch();
    if (!patch) return;
    audioEngine.setPatch(patch);
    set({ patch });
  },

  setPitchBend: (v) => audioEngine.pitchBend(v),

  setModWheel: (v) => {
    audioEngine.modWheel(v);
    set({ wheelMod: v });
  },

  selectMidiDevice: (id) => {
    midi?.select(id);
    set({ midiSelected: id });
  },

  captureChord: () => {
    const notes = [...get().activeNotes].sort((a, b) => a - b);
    if (notes.length < 2) return false;
    const root = notes[0];
    const chord = notes.slice(0, 4).map((n) => n - root);
    get().update("keyAssign", { chord });
    return true;
  },
}));
