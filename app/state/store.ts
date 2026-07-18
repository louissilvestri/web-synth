"use client";

import { create } from "zustand";
import type { Patch } from "../../engine/core/patch";
import { defaultPatch } from "../../engine/core/patch";
import { audioEngine } from "../../engine/host/audioEngine";
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

  powerOn: () => Promise<void>;
  noteOn: (note: number) => void;
  noteOff: (note: number) => void;
  allNotesOff: () => void;
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

export const useSynthStore = create<SynthState>((set, get) => ({
  patch: defaultPatch(),
  power: "off",
  powerError: "",
  activeNotes: [],

  powerOn: async () => {
    if (get().power === "on" || get().power === "starting") return;
    set({ power: "starting" });
    try {
      await audioEngine.init();
      audioEngine.setPatch(get().patch);
      set({ power: "on" });
    } catch (e) {
      set({ power: "error", powerError: e instanceof Error ? e.message : String(e) });
    }
  },

  noteOn: (note) => {
    const { power, powerOn } = get();
    if (power !== "on") {
      // First key press is itself the user gesture — boot then retrigger.
      void powerOn().then(() => {
        if (useSynthStore.getState().power === "on") get().noteOn(note);
      });
      return;
    }
    audioEngine.noteOn(note);
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
      const patch = { ...s.patch, [module]: { ...s.patch[module], ...partial } };
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
}));
